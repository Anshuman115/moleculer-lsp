import { fileURLToPath } from 'node:url'
import type { Readable, Writable } from 'node:stream'
import { Index } from '../index/Index.js'
import { Scanner } from '../scanner/scanner.js'
import { isMoleculerWorkspace } from '../scanner/workspace.js'
import { Watcher } from '../scanner/watcher.js'
import { diagnosticsByFile } from './diagnostics.js'
import { Handlers, uriToPath } from './handlers.js'
import { ErrorCodes, isRecord, type Diagnostic, type DocumentSymbolParams, type Position, type ReferenceParams, type RequestMessage, type TextDocumentPositionParams } from './protocol.js'
import { MessageFormatError, Transport } from './transport.js'
import { resolveTypeScriptCommand, TypeScriptBridge, type TypeScriptCommand } from './typescript-bridge.js'
import { VERSION } from '../version.js'
import { log } from '../log.js'

export interface ServerOptions {
  typescriptFallback?: boolean | TypeScriptCommand
  typescriptDiagnostics?: boolean
}

const passThroughMethods = new Set([
  'textDocument/hover',
  'textDocument/implementation',
  'textDocument/prepareCallHierarchy',
  'callHierarchy/incomingCalls',
  'callHierarchy/outgoingCalls',
  'workspace/symbol',
])

enum ScanState {
  Pending = 'pending',
  Ready = 'ready',
  Failed = 'failed',
}

export class Server {
  private readonly index = new Index()
  private readonly scanner = new Scanner(this.index)
  private readonly handlers = new Handlers(this.index, this.scanner)
  private readonly watcher: Watcher
  private readonly transport: Transport
  private readonly queued: RequestMessage[] = []
  private readonly openFiles = new Set<string>()
  private readonly moleculerDiagnostics = new Map<string, Diagnostic[]>()
  private readonly typescriptDiagnostics = new Map<string, Diagnostic[]>()
  private rootPath = process.cwd()
  private moleculerWorkspace = false
  private scanState = ScanState.Pending
  private scanError = ''
  private pullDiagnostics = false
  private refreshSupport = false
  private nextServerRequestId = 1
  private bridge: TypeScriptBridge | undefined

  constructor(readable: Readable, writable: Writable, private readonly options: ServerOptions = {}) {
    this.transport = new Transport(readable, writable)
    this.watcher = new Watcher(() => this.rescan())
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
        this.watcher.close()
        this.bridge?.stop()
        return
      }
      let message: RequestMessage
      try {
        message = JSON.parse(body.toString('utf8')) as RequestMessage
      } catch {
        this.transport.writeError(null, ErrorCodes.ParseError, 'invalid JSON-RPC message')
        continue
      }
      this.dispatch(message)
    }
  }

  private dispatch(message: RequestMessage): void {
    try {
      this.route(message)
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error)
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
    switch (message.method) {
      case 'initialize':
        this.initialize(message)
        return
      case 'initialized':
        this.startScan()
        return
      case 'shutdown':
        this.watcher.close()
        this.bridge?.stop()
        this.transport.writeResult(message.id, null)
        return
      case 'exit':
        this.watcher.close()
        this.bridge?.stop()
        process.exit(0)
      case 'textDocument/didOpen':
        this.didOpen(message.params)
        return
      case 'textDocument/didChange':
        this.didChange(message.params)
        return
      case 'textDocument/didSave':
        this.didSave()
        return
      case 'textDocument/didClose':
        this.didClose(message.params)
        return
      case 'textDocument/definition':
      case 'textDocument/references':
        this.documentRequest(message)
        return
      case 'textDocument/documentSymbol':
        this.documentSymbolRequest(message)
        return
      case 'textDocument/diagnostic':
        this.diagnosticRequest(message)
        return
      default:
        if (passThroughMethods.has(message.method) && this.bridge !== undefined) {
          this.passThrough(message, this.bridge)
        } else if (message.id !== undefined) {
          this.transport.writeError(message.id, ErrorCodes.MethodNotFound, `method not found: ${message.method}`)
        }
    }
  }

  private initialize(message: RequestMessage): void {
    const params = isRecord(message.params) ? message.params : {}
    const rootUri = typeof params.rootUri === 'string' ? params.rootUri : ''
    if (rootUri.length > 0) {
      this.rootPath = fileURLToPath(rootUri)
    } else if (Array.isArray(params.workspaceFolders)) {
      const first = params.workspaceFolders[0]
      if (isRecord(first) && typeof first.uri === 'string') {
        this.rootPath = fileURLToPath(first.uri)
      }
    }
    this.moleculerWorkspace = isMoleculerWorkspace(this.rootPath)
    const capabilities = isRecord(params.capabilities) ? params.capabilities : {}
    const textDocument = isRecord(capabilities.textDocument) ? capabilities.textDocument : {}
    const workspace = isRecord(capabilities.workspace) ? capabilities.workspace : {}
    const workspaceDiagnostics = isRecord(workspace.diagnostics) ? workspace.diagnostics : {}
    this.pullDiagnostics = isRecord(textDocument.diagnostic)
    this.refreshSupport = workspaceDiagnostics.refreshSupport === true
    this.bridge = this.createBridge()
    this.transport.writeResult(message.id, {
      capabilities: {
        textDocumentSync: { openClose: true, change: 1, save: true },
        definitionProvider: true,
        referencesProvider: true,
        documentSymbolProvider: true,
        ...(this.pullDiagnostics
          ? { diagnosticProvider: { interFileDependencies: true, workspaceDiagnostics: false } }
          : {}),
        ...(this.bridge === undefined
          ? {}
          : { hoverProvider: true, implementationProvider: true, callHierarchyProvider: true, workspaceSymbolProvider: true }),
      },
      serverInfo: { name: 'moleculer-lsp', version: VERSION },
    })
  }

  private startScan(): void {
    if (!this.moleculerWorkspace) {
      log(`no moleculer.config.* or moleculer dependency at or above ${this.rootPath}; index disabled`)
      this.scanState = ScanState.Ready
      this.flushQueued()
      return
    }
    setTimeout(() => {
      const started = Date.now()
      try {
        const result = this.scanner.scan(this.rootPath)
        this.scanState = ScanState.Ready
        this.collectDiagnostics()
        const stats = this.index.stats()
        log(`indexed ${stats.symbolCount} symbols in ${result.fileCount} files (${Date.now() - started}ms)`)
        log(`references ${stats.referenceCount}, unresolved ${result.dropped.length}, mixin failures ${result.mixinFailures.length}`)
        this.watcher.watch(this.rootPath)
      } catch (error) {
        this.scanState = ScanState.Failed
        this.scanError = error instanceof Error ? error.message : String(error)
        log(`scan failed: ${this.scanError}`)
      }
      this.flushQueued()
      if (this.scanState === ScanState.Ready) {
        this.publishDiagnostics()
      }
    }, 0)
  }

  private rescan(): void {
    if (!this.moleculerWorkspace) {
      return
    }
    try {
      this.scanner.scan(this.rootPath)
      this.scanState = ScanState.Ready
      this.collectDiagnostics()
      this.publishDiagnostics()
    } catch (error) {
      log(`rescan failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private flushQueued(): void {
    for (const message of this.queued.splice(0)) {
      this.dispatch(message)
    }
  }

  private documentRequest(message: RequestMessage): void {
    if (this.scanState === ScanState.Pending) {
      this.queued.push(message)
      return
    }
    if (this.scanState === ScanState.Failed) {
      this.transport.writeError(message.id, ErrorCodes.ServerNotInitialized, `index unavailable: ${this.scanError}`)
      return
    }
    const result = message.method === 'textDocument/definition'
      ? this.handlers.definition(positionParams(message.params))
      : this.handlers.references(referenceParams(message.params))
    this.respond(message, result)
  }

  private respond(message: RequestMessage, result: unknown): void {
    const uri = textDocument(message.params)?.uri
    if (this.bridge === undefined || uri === undefined || !isEmpty(result)) {
      this.transport.writeResult(message.id, result)
      return
    }
    void this.bridge.request(message.method, message.params, uri).then(
      (fallback) => this.transport.writeResult(message.id, isEmpty(fallback) ? result : fallback),
      () => this.transport.writeResult(message.id, result),
    )
  }

  private passThrough(message: RequestMessage, bridge: TypeScriptBridge): void {
    const record = isRecord(message.params) ? message.params : {}
    const item = isRecord(record.item) ? record.item : {}
    const uri = textDocument(message.params)?.uri ?? (typeof item.uri === 'string' ? item.uri : undefined)
    void bridge.request(message.method, message.params, uri).then(
      (result) => this.transport.writeResult(message.id, result),
      () => this.transport.writeResult(message.id, null),
    )
  }

  private createBridge(): TypeScriptBridge | undefined {
    const setting = this.options.typescriptFallback
    if (setting === undefined || setting === false) {
      return undefined
    }
    const command = setting === true ? resolveTypeScriptCommand(this.rootPath) : setting
    if (command === undefined) {
      log('typescript fallback disabled: no tsc with --lsp or typescript-language-server found')
      return undefined
    }
    log(`typescript fallback: ${command.command} ${command.args.join(' ')}`)
    const onDiagnostics = this.options.typescriptDiagnostics === true
      ? (uri: string, diagnostics: unknown[]) => this.receiveTypeScriptDiagnostics(uri, diagnostics)
      : undefined
    return new TypeScriptBridge(command, this.rootPath, onDiagnostics)
  }

  private documentSymbolRequest(message: RequestMessage): void {
    if (this.scanState === ScanState.Pending) {
      this.queued.push(message)
      return
    }
    if (this.scanState === ScanState.Failed) {
      this.transport.writeError(message.id, ErrorCodes.ServerNotInitialized, `index unavailable: ${this.scanError}`)
      return
    }
    this.respond(message, this.handlers.documentSymbols(documentSymbolParams(message.params)))
  }

  private diagnosticRequest(message: RequestMessage): void {
    if (this.scanState === ScanState.Pending) {
      this.queued.push(message)
      return
    }
    const document = textDocument(message.params)
    if (document === undefined) {
      this.transport.writeError(message.id, ErrorCodes.InvalidParams, 'textDocument/diagnostic requires a document uri')
      return
    }
    this.transport.writeResult(message.id, { kind: 'full', items: this.diagnosticsFor(uriToPath(document.uri)) })
  }

  private didOpen(params: unknown): void {
    const document = textDocument(params)
    if (document !== undefined && typeof document.text === 'string') {
      this.handlers.openDocument(document.uri, document.text)
      this.bridge?.track(document.uri, document.text)
      this.openFiles.add(uriToPath(document.uri))
      if (this.options.typescriptDiagnostics === true) {
        void this.bridge?.show(document.uri)
      }
      if (this.scanState === ScanState.Ready && !this.pullDiagnostics) {
        this.publishFile(uriToPath(document.uri))
      }
    }
  }

  private didChange(params: unknown): void {
    const record = isRecord(params) ? params : {}
    const document = textDocument(params)
    const changes = Array.isArray(record.contentChanges) ? record.contentChanges : []
    const latest = changes[changes.length - 1]
    if (document !== undefined && isRecord(latest) && typeof latest.text === 'string') {
      this.handlers.openDocument(document.uri, latest.text)
      this.bridge?.track(document.uri, latest.text)
    }
  }

  private didSave(): void {
    this.watcher.trigger()
  }

  private didClose(params: unknown): void {
    const document = textDocument(params)
    if (document !== undefined) {
      this.handlers.closeDocument(document.uri)
      this.bridge?.forget(document.uri)
      this.closeFile(uriToPath(document.uri))
    }
  }

  private closeFile(filePath: string): void {
    this.openFiles.delete(filePath)
    this.typescriptDiagnostics.delete(filePath)
    if (!this.pullDiagnostics) {
      this.transport.writeNotification('textDocument/publishDiagnostics', { uri: pathUri(filePath), diagnostics: [] as Diagnostic[] })
    }
  }

  private collectDiagnostics(): void {
    this.moleculerDiagnostics.clear()
    for (const [fileId, diagnostics] of diagnosticsByFile(this.index, this.scanner)) {
      this.moleculerDiagnostics.set(this.index.filePath(fileId), diagnostics)
    }
  }

  private receiveTypeScriptDiagnostics(uri: string, diagnostics: unknown[]): void {
    const filePath = uriToPath(uri)
    this.typescriptDiagnostics.set(filePath, diagnostics as Diagnostic[])
    if (this.pullDiagnostics) {
      this.publishDiagnostics()
    } else if (this.openFiles.has(filePath)) {
      this.publishFile(filePath)
    }
  }

  private diagnosticsFor(filePath: string): Diagnostic[] {
    return [...this.moleculerDiagnostics.get(filePath) ?? [], ...this.typescriptDiagnostics.get(filePath) ?? []]
  }

  private publishFile(filePath: string): void {
    this.transport.writeNotification('textDocument/publishDiagnostics', { uri: pathUri(filePath), diagnostics: this.diagnosticsFor(filePath) })
  }

  private publishDiagnostics(): void {
    if (this.pullDiagnostics) {
      if (this.refreshSupport) {
        this.transport.writeRequest(this.nextServerRequestId++, 'workspace/diagnostic/refresh', {})
      }
      return
    }
    for (const filePath of this.openFiles) {
      this.publishFile(filePath)
    }
  }
}

function textDocument(params: unknown): { uri: string; text?: unknown } | undefined {
  const record = isRecord(params) ? params : {}
  const document = isRecord(record.textDocument) ? record.textDocument : undefined
  if (document === undefined || typeof document.uri !== 'string') {
    return undefined
  }
  return { uri: document.uri, text: document.text }
}

function positionParams(params: unknown): TextDocumentPositionParams {
  const record = isRecord(params) ? params : {}
  const document = isRecord(record.textDocument) ? record.textDocument : {}
  const position = isRecord(record.position) ? record.position : {}
  return {
    textDocument: { uri: typeof document.uri === 'string' ? document.uri : '' },
    position: {
      line: typeof position.line === 'number' ? position.line : 0,
      character: typeof position.character === 'number' ? position.character : 0,
    },
  }
}

function referenceParams(params: unknown): ReferenceParams {
  const record = isRecord(params) ? params : {}
  const context = isRecord(record.context) ? record.context : {}
  return {
    ...positionParams(params),
    context: { includeDeclaration: context.includeDeclaration === true },
  }
}

function documentSymbolParams(params: unknown): DocumentSymbolParams {
  const document = textDocument(params)
  return { textDocument: { uri: document?.uri ?? '' } }
}

function isEmpty(result: unknown): boolean {
  return result === null || result === undefined || (Array.isArray(result) && result.length === 0)
}

function pathUri(filePath: string): string {
  return new URL(`file://${filePath}`).toString()
}

export { uriToPath }
export type { Position }
