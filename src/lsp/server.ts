import { fileURLToPath } from 'node:url'
import type { Readable, Writable } from 'node:stream'
import { Index } from '../index/Index.js'
import { Scanner } from '../scanner/scanner.js'
import { Watcher } from '../scanner/watcher.js'
import { diagnosticsByFile } from './diagnostics.js'
import { Handlers, uriToPath } from './handlers.js'
import { ErrorCodes, isRecord, type Diagnostic, type DocumentSymbolParams, type Position, type ReferenceParams, type RequestMessage, type TextDocumentPositionParams } from './protocol.js'
import { MessageFormatError, Transport } from './transport.js'

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
  private readonly published = new Set<string>()
  private rootPath = process.cwd()
  private scanState = ScanState.Pending
  private scanError = ''

  constructor(readable: Readable, writable: Writable) {
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
    switch (message.method) {
      case 'initialize':
        this.initialize(message)
        return
      case 'initialized':
        this.startScan()
        return
      case 'shutdown':
        this.watcher.close()
        this.transport.writeResult(message.id, null)
        return
      case 'exit':
        this.watcher.close()
        process.exit(0)
        return
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
        if (message.id !== undefined) {
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
    this.transport.writeResult(message.id, {
      capabilities: {
        textDocumentSync: { openClose: true, change: 1, save: true },
        definitionProvider: true,
        referencesProvider: true,
        documentSymbolProvider: true,
        diagnosticProvider: { interFileDependencies: true, workspaceDiagnostics: false },
      },
      serverInfo: { name: 'moleculer-lsp', version: '0.1.0' },
    })
  }

  private startScan(): void {
    setTimeout(() => {
      const started = Date.now()
      try {
        const result = this.scanner.scan(this.rootPath)
        this.scanState = ScanState.Ready
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
    try {
      this.scanner.scan(this.rootPath)
      this.scanState = ScanState.Ready
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
    if (message.method === 'textDocument/definition') {
      this.transport.writeResult(message.id, this.handlers.definition(positionParams(message.params)))
      return
    }
    this.transport.writeResult(message.id, this.handlers.references(referenceParams(message.params)))
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
    this.transport.writeResult(message.id, this.handlers.documentSymbols(documentSymbolParams(message.params)))
  }

  private diagnosticRequest(message: RequestMessage): void {
    if (this.scanState === ScanState.Pending) {
      this.queued.push(message)
      return
    }
    if (this.scanState === ScanState.Failed) {
      this.transport.writeResult(message.id, { kind: 'full', items: [] as Diagnostic[] })
      return
    }
    const document = textDocument(message.params)
    const fileId = document === undefined ? 0 : this.index.fileId(uriToPath(document.uri))
    const items = diagnosticsByFile(this.index, this.scanner).get(fileId) ?? []
    this.transport.writeResult(message.id, { kind: 'full', items })
  }

  private didOpen(params: unknown): void {
    const document = textDocument(params)
    if (document !== undefined && typeof document.text === 'string') {
      this.handlers.openDocument(document.uri, document.text)
    }
  }

  private didChange(params: unknown): void {
    const record = isRecord(params) ? params : {}
    const document = textDocument(params)
    const changes = Array.isArray(record.contentChanges) ? record.contentChanges : []
    const latest = changes[changes.length - 1]
    if (document !== undefined && isRecord(latest) && typeof latest.text === 'string') {
      this.handlers.openDocument(document.uri, latest.text)
    }
  }

  private didSave(): void {
    this.rescan()
  }

  private didClose(params: unknown): void {
    const document = textDocument(params)
    if (document !== undefined) {
      this.handlers.closeDocument(document.uri)
    }
  }

  private publishDiagnostics(): void {
    const byFile = diagnosticsByFile(this.index, this.scanner)
    const current = new Set<string>()
    for (const [fileId, diagnostics] of byFile) {
      const uri = pathUri(this.index.filePath(fileId))
      current.add(uri)
      this.transport.writeNotification('textDocument/publishDiagnostics', { uri, diagnostics })
    }
    for (const uri of this.published) {
      if (!current.has(uri)) {
        this.transport.writeNotification('textDocument/publishDiagnostics', { uri, diagnostics: [] as Diagnostic[] })
      }
    }
    this.published.clear()
    for (const uri of current) {
      this.published.add(uri)
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

function pathUri(filePath: string): string {
  return new URL(`file://${filePath}`).toString()
}

export function log(message: string): void {
  process.stderr.write(`[moleculer-lsp] ${message}\n`)
}

export { uriToPath }
export type { Position }
