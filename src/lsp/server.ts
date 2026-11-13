import type { Readable, Writable } from 'node:stream'
import { errorMessage, log } from '../log.js'
import { Workspace } from '../scanner/workspace.js'
import { VERSION } from '../version.js'
import { diagnosticsByFile } from './diagnostics.js'
import { DiagnosticsMode, DiagnosticsPublisher, type DiagnosticsSink } from './diagnostics-publisher.js'
import { Documents } from './documents.js'
import { Handlers } from './handlers.js'
import {
  documentSymbolParams,
  ErrorCodes,
  isRecord,
  positionParams,
  referenceParams,
  textDocumentOf,
  type Diagnostic,
  type RequestMessage,
} from './protocol.js'
import { MessageFormatError, Transport } from './transport.js'
import { TypeScriptBridge, TypeScriptBridgeError } from './typescript-bridge.js'
import type { TypeScriptCommand } from './typescript-command.js'
import { uriToPath } from './uri.js'

export interface ServerOptions {
  typescript?: () => TypeScriptCommand
  typescriptDiagnostics?: boolean
}

interface IndexQuery {
  uri: string
  answer: (handlers: Handlers) => unknown
}

interface IndexMethod {
  capability: string
  empty: null | []
  query: (params: unknown) => IndexQuery | undefined
}

const indexMethods: Record<string, IndexMethod> = {
  'textDocument/definition': {
    capability: 'definitionProvider',
    empty: null,
    query: (params) => {
      const parsed = positionParams(params)
      return parsed && { uri: parsed.textDocument.uri, answer: (handlers) => handlers.definition(parsed) }
    },
  },
  'textDocument/references': {
    capability: 'referencesProvider',
    empty: [],
    query: (params) => {
      const parsed = referenceParams(params)
      return parsed && { uri: parsed.textDocument.uri, answer: (handlers) => handlers.references(parsed) }
    },
  },
  'textDocument/documentSymbol': {
    capability: 'documentSymbolProvider',
    empty: [],
    query: (params) => {
      const parsed = documentSymbolParams(params)
      return parsed && { uri: parsed.textDocument.uri, answer: (handlers) => handlers.documentSymbols(parsed) }
    },
  },
}

const typescriptMethods: Record<string, string> = {
  'textDocument/hover': 'hoverProvider',
  'textDocument/implementation': 'implementationProvider',
  'textDocument/prepareCallHierarchy': 'callHierarchyProvider',
  'callHierarchy/incomingCalls': 'callHierarchyProvider',
  'callHierarchy/outgoingCalls': 'callHierarchyProvider',
  'workspace/symbol': 'workspaceSymbolProvider',
}

interface Session {
  workspace: Workspace
  documents: Documents
  handlers: Handlers
  diagnostics: DiagnosticsPublisher
  bridge: TypeScriptBridge | undefined
}

export class Server {
  private readonly transport: Transport
  private session: Session | undefined
  private nextServerRequestId = 1

  constructor(readable: Readable, writable: Writable, private readonly options: ServerOptions = {}) {
    this.transport = new Transport(readable, writable)
  }

  async run(): Promise<void> {
    while (true) {
      let body: Buffer | undefined
      try {
        body = await this.transport.read()
      } catch (error) {
        if (error instanceof MessageFormatError) {
          this.transport.discardBuffer()
          this.transport.writeError(null, ErrorCodes.ParseError, error.message)
          continue
        }
        throw error
      }
      if (body === undefined) {
        this.close()
        return
      }
      let message: unknown
      try {
        message = JSON.parse(body.toString('utf8'))
      } catch {
        message = undefined
      }
      if (!isRecord(message)) {
        this.transport.writeError(null, ErrorCodes.ParseError, 'invalid JSON-RPC message')
        continue
      }
      this.dispatch(message as unknown as RequestMessage)
    }
  }

  private dispatch(message: RequestMessage): void {
    try {
      this.route(message)
    } catch (error) {
      const text = errorMessage(error)
      log(`request failed: ${message.method}: ${text}`)
      if (message.id !== undefined) {
        this.transport.writeError(message.id, ErrorCodes.InternalError, text)
      }
    }
  }

  private route(message: RequestMessage): void {
    if (typeof message.method !== 'string') {
      return
    }
    if (message.method === 'initialize') {
      this.initialize(message)
      return
    }
    if (message.method === 'shutdown') {
      this.close()
      this.transport.writeResult(message.id, null)
      return
    }
    if (message.method === 'exit') {
      this.close()
      process.exit(0)
    }
    const session = this.session
    if (session === undefined) {
      if (message.id !== undefined) {
        this.transport.writeError(message.id, ErrorCodes.ServerNotInitialized, 'server not initialized')
      }
      return
    }
    this.routeSession(session, message)
  }

  private routeSession(session: Session, message: RequestMessage): void {
    const indexMethod = indexMethods[message.method]
    if (indexMethod !== undefined) {
      this.indexRequest(session, message, indexMethod)
      return
    }
    switch (message.method) {
      case 'initialized':
        session.workspace.start()
        return
      case 'textDocument/didOpen':
        this.didOpen(session, message.params)
        return
      case 'textDocument/didChange':
        this.didChange(session, message.params)
        return
      case 'textDocument/didSave':
        session.workspace.changed()
        return
      case 'textDocument/didClose':
        this.didClose(session, message.params)
        return
      case 'textDocument/diagnostic':
        this.diagnosticRequest(session, message)
        return
    }
    if (typescriptMethods[message.method] !== undefined && session.bridge !== undefined) {
      this.passThrough(session.bridge, message)
    } else if (message.id !== undefined) {
      this.transport.writeError(message.id, ErrorCodes.MethodNotFound, `method not found: ${message.method}`)
    }
  }

  private initialize(message: RequestMessage): void {
    const params = isRecord(message.params) ? message.params : {}
    const rootPath = rootPathOf(params)
    const capabilities = isRecord(params.capabilities) ? params.capabilities : {}
    const textDocument = isRecord(capabilities.textDocument) ? capabilities.textDocument : {}
    const workspace = isRecord(capabilities.workspace) ? capabilities.workspace : {}
    const workspaceDiagnostics = isRecord(workspace.diagnostics) ? workspace.diagnostics : {}
    const pullDiagnostics = isRecord(textDocument.diagnostic)
    const mode = pullDiagnostics ? DiagnosticsMode.Pull : DiagnosticsMode.Push
    this.session = this.openSession(rootPath, mode, workspaceDiagnostics.refreshSupport === true)
    this.transport.writeResult(message.id, {
      capabilities: {
        textDocumentSync: { openClose: true, change: 1, save: true },
        ...providers(Object.values(indexMethods).map((method) => method.capability)),
        ...(pullDiagnostics ? { diagnosticProvider: { interFileDependencies: true, workspaceDiagnostics: false } } : {}),
        ...(this.session.bridge === undefined ? {} : providers(Object.values(typescriptMethods))),
      },
      serverInfo: { name: 'moleculer-lsp', version: VERSION },
    })
  }

  private openSession(rootPath: string, mode: DiagnosticsMode, refreshSupport: boolean): Session {
    const documents = new Documents()
    const diagnostics = new DiagnosticsPublisher(this.diagnosticsSink(refreshSupport), mode, documents)
    const workspace = new Workspace(rootPath, (result) => diagnostics.setMoleculer(diagnosticsByFile(workspace.index, result)))
    const handlers = new Handlers(workspace.index, workspace.resolution, documents)
    const bridge = this.createBridge(rootPath, documents, diagnostics)
    return { workspace, documents, handlers, diagnostics, bridge }
  }

  private createBridge(rootPath: string, documents: Documents, diagnostics: DiagnosticsPublisher): TypeScriptBridge | undefined {
    if (this.options.typescript === undefined) {
      return undefined
    }
    log('typescript fallback: bundled tsrs (starts on demand)')
    const onDiagnostics = this.options.typescriptDiagnostics === true
      ? (uri: string, items: unknown[]) => diagnostics.setTypeScript(uriToPath(uri), items as Diagnostic[])
      : undefined
    return new TypeScriptBridge(this.options.typescript, rootPath, documents, onDiagnostics)
  }

  private indexRequest(session: Session, message: RequestMessage, method: IndexMethod): void {
    const query = method.query(message.params)
    if (query === undefined) {
      this.transport.writeError(message.id, ErrorCodes.InvalidParams, `invalid params for ${message.method}`)
      return
    }
    const failure = session.workspace.failure
    if (failure !== undefined && session.bridge === undefined) {
      this.transport.writeError(message.id, ErrorCodes.ServerNotInitialized, `index unavailable: ${failure}`)
      return
    }
    const answer = failure === undefined && session.workspace.moleculer ? query.answer(session.handlers) : undefined
    if (answer !== undefined) {
      this.transport.writeResult(message.id, answer)
      return
    }
    if (session.bridge === undefined) {
      this.transport.writeResult(message.id, method.empty)
      return
    }
    void session.bridge.request(message.method, message.params, query.uri).then(
      (fallback) => this.transport.writeResult(message.id, fallback ?? method.empty),
      (error: unknown) => this.bridgeError(message, error),
    )
  }

  private passThrough(bridge: TypeScriptBridge, message: RequestMessage): void {
    const params = isRecord(message.params) ? message.params : {}
    const item = isRecord(params.item) ? params.item : {}
    const uri = textDocumentOf(message.params)?.uri ?? (typeof item.uri === 'string' ? item.uri : undefined)
    void bridge.request(message.method, message.params, uri).then(
      (result) => this.transport.writeResult(message.id, result),
      (error: unknown) => this.bridgeError(message, error),
    )
  }

  private bridgeError(message: RequestMessage, error: unknown): void {
    this.transport.writeError(message.id, error instanceof TypeScriptBridgeError ? error.code : ErrorCodes.InternalError, errorMessage(error))
  }

  private diagnosticRequest(session: Session, message: RequestMessage): void {
    const document = textDocumentOf(message.params)
    if (document === undefined) {
      this.transport.writeError(message.id, ErrorCodes.InvalidParams, 'textDocument/diagnostic requires a document uri')
      return
    }
    const failure = this.options.typescriptDiagnostics === true ? session.bridge?.error : undefined
    if (failure !== undefined) {
      this.bridgeError(message, failure)
      return
    }
    this.transport.writeResult(message.id, { kind: 'full', items: session.diagnostics.report(uriToPath(document.uri)) })
  }

  private didOpen(session: Session, params: unknown): void {
    const document = textDocumentOf(params)
    if (document === undefined || typeof document.text !== 'string') {
      return
    }
    const filePath = uriToPath(document.uri)
    session.documents.set(filePath, document.text)
    void session.bridge?.opened(document.uri).catch((error: unknown) => log(errorMessage(error)))
    session.diagnostics.open(filePath)
  }

  private didChange(session: Session, params: unknown): void {
    const document = textDocumentOf(params)
    const changes = isRecord(params) && Array.isArray(params.contentChanges) ? params.contentChanges : []
    const latest = changes[changes.length - 1]
    if (document !== undefined && isRecord(latest) && typeof latest.text === 'string') {
      session.documents.set(uriToPath(document.uri), latest.text)
      session.bridge?.changed(document.uri)
    }
  }

  private didClose(session: Session, params: unknown): void {
    const document = textDocumentOf(params)
    if (document === undefined) {
      return
    }
    const filePath = uriToPath(document.uri)
    session.documents.delete(filePath)
    session.bridge?.closed(document.uri)
    session.diagnostics.close(filePath)
  }

  private close(): void {
    this.session?.workspace.close()
    this.session?.bridge?.stop()
  }

  private diagnosticsSink(refreshSupport: boolean): DiagnosticsSink {
    return {
      publish: (uri, diagnostics) => this.transport.writeNotification('textDocument/publishDiagnostics', { uri, diagnostics }),
      refresh: () => {
        if (refreshSupport) {
          this.transport.writeRequest(this.nextServerRequestId++, 'workspace/diagnostic/refresh', {})
        }
      },
    }
  }
}

function rootPathOf(params: Record<string, unknown>): string {
  if (typeof params.rootUri === 'string' && params.rootUri.length > 0) {
    return uriToPath(params.rootUri)
  }
  const first = Array.isArray(params.workspaceFolders) ? params.workspaceFolders[0] : undefined
  return isRecord(first) && typeof first.uri === 'string' ? uriToPath(first.uri) : process.cwd()
}

function providers(capabilities: string[]): Record<string, true> {
  return Object.fromEntries(capabilities.map((capability) => [capability, true]))
}
