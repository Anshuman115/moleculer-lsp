import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import path from 'node:path'
import { watch, type FSWatcher } from 'chokidar'
import { errorMessage, log } from '../log.js'
import { Documents } from './documents.js'
import { ErrorCodes, isRecord } from './protocol.js'
import { Transport } from './transport.js'
import type { TypeScriptCommand } from './typescript-command.js'
import { pathToUri, uriToPath } from './uri.js'

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

interface WatchedTarget {
  watcher: FSWatcher
  ready: Promise<void>
  kinds: Map<string, number>
  key: string
}

export class TypeScriptBridgeError extends Error {
  constructor(message: string, readonly code: number = ErrorCodes.InternalError) {
    super(message)
  }
}

const requestTimeoutMs = 15000

export class TypeScriptBridge {
  private transport: Transport | undefined
  private child: ChildProcessWithoutNullStreams | undefined
  private ready: Promise<void> | undefined
  private failure: Error | undefined
  private initialized = false
  private stopping = false
  private readonly pending = new Map<number, Pending>()
  private readonly synced = new Map<string, { version: number; text: string }>()
  private nextId = 1
  private pullDiagnostics = false
  private synchronizing: Promise<void> = Promise.resolve()
  private readonly watchers = new Map<string, WatchedTarget[]>()
  private readonly watchTargets = new Map<string, WatchedTarget>()
  private refreshTimer: NodeJS.Timeout | undefined
  private refreshing = false
  private nextDocumentVersion = 1

  constructor(
    private readonly command: () => TypeScriptCommand,
    private readonly rootPath: string,
    private readonly documents: Documents,
    private readonly onDiagnostics?: (uri: string, diagnostics: unknown[]) => void,
  ) {}

  async opened(uri: string): Promise<void> {
    this.changed(uri)
    if (this.onDiagnostics !== undefined || this.ready !== undefined) {
      await this.start()
      await this.synchronize(uri, true)
    }
  }

  changed(uri: string): void {
    if (this.synced.has(uri) && this.transport !== undefined) {
      void this.synchronize(uri, true).catch((error: unknown) => log(errorMessage(error)))
    }
  }

  async request(method: string, params: unknown, uri: string | undefined): Promise<unknown> {
    await this.start()
    const target = uri ?? this.anyOpenUri()
    if (target === undefined) {
      await this.synchronizing
      return this.send(method, withoutProgressTokens(params))
    }
    const temporary = !this.documents.isOpen(uriToPath(target))
    try {
      if (!(await this.synchronize(target, false))) {
        throw new TypeScriptBridgeError(`tsrs cannot read ${target}; open the document or check that the file exists.`)
      }
      return await this.send(method, withoutProgressTokens(params))
    } finally {
      if (temporary && !this.documents.isOpen(uriToPath(target))) {
        this.closed(target)
      }
    }
  }

  stop(): void {
    if (this.stopping) return
    this.stopping = true
    const transport = this.transport
    if (!this.initialized || transport === undefined) {
      this.shutdown()
      return
    }
    void this.send('shutdown', undefined).then(
      () => transport.writeNotification('exit', undefined),
      (error: unknown) => log(errorMessage(error)),
    ).finally(() => this.shutdown())
  }

  private start(): Promise<void> {
    if (this.stopping || this.failure !== undefined) {
      return Promise.reject(this.failure ?? new TypeScriptBridgeError('tsrs bridge is stopped.'))
    }
    this.ready ??= this.launch()
    return this.ready
  }

  private async launch(): Promise<void> {
    try {
      const command = this.command()
      const env = { ...process.env }
      delete env.TSRS_FAST
      delete env.TSRS_BINARY
      const child = spawn(command.command, command.args, {
        cwd: this.rootPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
      })
      let stderr = ''
      child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString('utf8')).slice(-8192) })
      child.on('error', (error) => this.shutdown(`cannot launch bundled tsrs: ${error.message}`))
      child.on('exit', (code, signal) => this.shutdown(`process exited (${code ?? signal})${stderr.trim() === '' ? '' : `: ${stderr.trim()}`}`))
      child.stdin.on('error', (error) => this.shutdown(`input closed: ${error.message}`))
      this.child = child
      this.transport = new Transport(child.stdout, child.stdin)
      void this.listen(this.transport)
      const result = await this.send('initialize', {
        processId: process.pid,
        rootUri: pathToUri(this.rootPath),
        capabilities: {
          // tsrs has a recursive native watcher on macOS; other platforms need client watchers.
          workspace: { didChangeWatchedFiles: { dynamicRegistration: process.platform !== 'darwin', relativePatternSupport: true }, diagnostics: { refreshSupport: this.onDiagnostics !== undefined } },
          ...(this.onDiagnostics === undefined ? {} : { textDocument: { publishDiagnostics: {}, diagnostic: {} } }),
        },
      })
      if (!isRecord(result) || !isRecord(result.capabilities) || this.transport === undefined) {
        throw new TypeScriptBridgeError('tsrs returned an invalid initialize result.')
      }
      this.pullDiagnostics = result.capabilities.diagnosticProvider !== undefined && result.capabilities.diagnosticProvider !== false
      this.transport.writeNotification('initialized', {})
      this.initialized = true
      for (const filePath of this.documents.openPaths()) {
        await this.synchronize(pathToUri(filePath), true)
      }
    } catch (error) {
      if (error instanceof TypeScriptBridgeError) this.failure ??= error
      this.shutdown(errorMessage(error))
      throw this.failure
    }
  }

  private async pullFor(uri: string): Promise<void> {
    if (this.onDiagnostics === undefined || !this.pullDiagnostics) return
    const version = this.synced.get(uri)?.version
    const report = await this.send('textDocument/diagnostic', { textDocument: { uri } })
    if (version !== undefined && this.synced.get(uri)?.version === version &&
        this.documents.isOpen(uriToPath(uri)) && isRecord(report) && Array.isArray(report.items)) {
      this.onDiagnostics(uri, report.items)
    }
  }

  private refreshDiagnostics(): void {
    if (this.onDiagnostics === undefined || this.refreshing || this.refreshTimer !== undefined) return
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined
      this.refreshing = true
      void Promise.all([...this.documents.openPaths()].map((filePath) => this.pullFor(pathToUri(filePath))))
        .catch((error: unknown) => log(errorMessage(error)))
        .finally(() => { this.refreshing = false })
    }, 50)
    this.refreshTimer.unref()
  }

  private shutdown(reason?: string): void {
    if (this.failure === undefined) {
      this.failure = new TypeScriptBridgeError(reason === undefined
        ? 'tsrs bridge is stopped.'
        : `Bundled tsrs failed: ${reason}. Check the workspace configuration; if tsrs cannot start, reinstall moleculer-lsp with optional dependencies enabled.`)
    }
    const child = this.child
    this.transport = undefined
    this.child = undefined
    this.synced.clear()
    clearTimeout(this.refreshTimer)
    this.refreshTimer = undefined
    for (const target of this.watchTargets.values()) void target.watcher.close()
    this.watchTargets.clear()
    this.watchers.clear()
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(this.failure)
    }
    this.pending.clear()
    if (child !== undefined) {
      child.stdin.destroy()
      child.kill()
    }
    if (reason !== undefined && child !== undefined && !this.stopping) log(this.failure.message)
  }

  private send(method: string, params: unknown): Promise<unknown> {
    const transport = this.transport
    if (transport === undefined) return Promise.reject(this.failure ?? new TypeScriptBridgeError('tsrs is not running.'))
    const id = this.nextId++
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new TypeScriptBridgeError(`tsrs ${method} timed out after ${requestTimeoutMs} ms.`))
      }, requestTimeoutMs)
      timer.unref()
      this.pending.set(id, { resolve, reject, timer })
      transport.writeRequest(id, method, params)
    })
  }

  private async listen(transport: Transport): Promise<void> {
    try {
      while (this.transport === transport) {
        const body = await transport.read()
        if (this.transport !== transport) return
        if (body === undefined) {
          this.shutdown('output closed')
          return
        }
        const message: unknown = JSON.parse(body.toString('utf8'))
        if (!isRecord(message)) throw new Error('invalid JSON-RPC message')
        this.receive(transport, message)
      }
    } catch (error) {
      if (this.transport === transport) this.shutdown(`malformed message: ${errorMessage(error)}`)
    }
  }

  private receive(transport: Transport, message: Record<string, unknown>): void {
    if (typeof message.method === 'string') {
      if (message.id !== undefined) {
        if (message.method === 'workspace/configuration' && isRecord(message.params) && Array.isArray(message.params.items)) {
          transport.writeResult(message.id, message.params.items.map(() => null))
        } else if (message.method === 'workspace/workspaceFolders') {
          transport.writeResult(message.id, [{ uri: pathToUri(this.rootPath), name: path.basename(this.rootPath) }])
        } else if (message.method === 'client/registerCapability') {
          void this.registerWatchers(message.params).then(
            () => transport.writeResult(message.id, null),
            (error: unknown) => {
              transport.writeError(message.id, error instanceof TypeScriptBridgeError ? error.code : ErrorCodes.InternalError, errorMessage(error))
              if (!(error instanceof TypeScriptBridgeError)) this.shutdown(`cannot watch tsrs project files: ${errorMessage(error)}`)
            },
          )
        } else if (message.method === 'client/unregisterCapability') {
          this.unregisterWatchers(message.params)
          transport.writeResult(message.id, null)
        } else if (message.method === 'workspace/diagnostic/refresh') {
          transport.writeResult(message.id, null)
          this.refreshDiagnostics()
        } else if (message.method === 'window/workDoneProgress/create') {
          transport.writeResult(message.id, null)
        } else {
          transport.writeError(message.id, ErrorCodes.MethodNotFound, `unsupported tsrs client request: ${message.method}`)
        }
      } else if (message.method === 'textDocument/publishDiagnostics') {
        this.forwardDiagnostics(message.params)
      }
      return
    }
    if (typeof message.id !== 'number') return
    const pending = this.pending.get(message.id)
    if (pending === undefined) return
    this.pending.delete(message.id)
    clearTimeout(pending.timer)
    if (message.error !== undefined) {
      const error = isRecord(message.error) ? message.error : {}
      pending.reject(new TypeScriptBridgeError(`tsrs: ${typeof error.message === 'string' ? error.message : 'invalid child error'}`, typeof error.code === 'number' ? error.code : ErrorCodes.InternalError))
    } else if ('result' in message) {
      pending.resolve(message.result)
    } else {
      pending.reject(new TypeScriptBridgeError('tsrs response is missing both result and error.'))
    }
  }

  get error(): Error | undefined {
    return this.failure
  }

  private async registerWatchers(params: unknown): Promise<void> {
    if (!isRecord(params) || !Array.isArray(params.registrations)) {
      throw new TypeScriptBridgeError('invalid watcher registrations', ErrorCodes.InvalidParams)
    }
    const ids = new Set<string>()
    const registrations = params.registrations.map((registration: unknown) => {
      if (!isRecord(registration) || registration.method !== 'workspace/didChangeWatchedFiles') {
        throw new TypeScriptBridgeError('unsupported tsrs capability registration', ErrorCodes.MethodNotFound)
      }
      if (typeof registration.id !== 'string' || !isRecord(registration.registerOptions) || !Array.isArray(registration.registerOptions.watchers)) {
        throw new TypeScriptBridgeError('invalid tsrs watcher registration', ErrorCodes.InvalidParams)
      }
      const id = registration.id
      if (this.watchers.has(id) || ids.has(id)) throw new TypeScriptBridgeError(`duplicate tsrs watcher registration: ${id}`, ErrorCodes.InvalidParams)
      ids.add(id)
      const targets = registration.registerOptions.watchers.map((options: unknown) => {
        if (!isRecord(options)) throw new TypeScriptBridgeError('invalid tsrs watcher', ErrorCodes.InvalidParams)
        return { ...watchTarget(options.globPattern, this.rootPath), kind: typeof options.kind === 'number' ? options.kind : 7 }
      })
      return { id, targets }
    })
    for (const { id, targets } of registrations) {
      const watchers: WatchedTarget[] = []
      this.watchers.set(id, watchers)
      for (const { root, depth, kind } of targets) {
        const key = `${depth ?? 'recursive'}:${path.resolve(root)}`
        const target = this.watchTargets.get(key) ?? this.createWatcher(root, depth, key)
        target.kinds.set(id, (target.kinds.get(id) ?? 0) | kind)
        watchers.push(target)
      }
      await Promise.all(watchers.map((target) => target.ready))
    }
  }

  private createWatcher(root: string, depth: number | undefined, key: string): WatchedTarget {
    const watcher = watch(root, {
      ignoreInitial: true,
      ignored: (filePath) => /(^|[/\\])\.git([/\\]|$)/.test(filePath),
      ...(depth === undefined ? {} : { depth }),
    })
    const ready = new Promise<void>((resolve, reject) => {
      watcher.once('ready', resolve)
      watcher.once('error', reject)
    })
    const target: WatchedTarget = { watcher, ready, kinds: new Map(), key }
    this.watchTargets.set(key, target)
    const forward = (filePath: string, type: number, mask: number): void => {
      if (this.stopping || this.watchTargets.get(key) !== target) return
      for (const kind of target.kinds.values()) {
        if ((kind & mask) === 0) continue
        this.transport?.writeNotification('workspace/didChangeWatchedFiles', { changes: [{ uri: pathToUri(filePath), type }] })
        return
      }
    }
    watcher.on('add', (filePath) => forward(filePath, 1, 1))
    watcher.on('change', (filePath) => forward(filePath, 2, 2))
    watcher.on('unlink', (filePath) => forward(filePath, 3, 4))
    watcher.on('addDir', (filePath) => forward(filePath, 1, 1))
    watcher.on('unlinkDir', (filePath) => forward(filePath, 3, 4))
    watcher.on('error', (error: unknown) => this.shutdown(`file watcher failed: ${errorMessage(error)}`))
    return target
  }

  private unregisterWatchers(params: unknown): void {
    if (!isRecord(params)) return
    const registrations = params.unregisterations ?? params.unregistrations
    if (!Array.isArray(registrations)) return
    for (const registration of registrations) {
      if (!isRecord(registration) || typeof registration.id !== 'string') continue
      for (const target of this.watchers.get(registration.id) ?? []) {
        target.kinds.delete(registration.id)
        if (target.kinds.size === 0) {
          this.watchTargets.delete(target.key)
          void target.watcher.close()
        }
      }
      this.watchers.delete(registration.id)
    }
  }

  private forwardDiagnostics(params: unknown): void {
    if (this.onDiagnostics === undefined || !isRecord(params) || typeof params.uri !== 'string' ||
        !Array.isArray(params.diagnostics) || !this.documents.isOpen(uriToPath(params.uri))) return
    const synced = this.synced.get(params.uri)
    if (synced === undefined || (typeof params.version === 'number' && params.version !== synced.version)) return
    this.onDiagnostics(params.uri, params.diagnostics)
  }

  private synchronize(uri: string, requireOpen: boolean): Promise<boolean> {
    const result = this.synchronizing.then(() => {
      if (this.failure !== undefined) throw this.failure
      if (requireOpen && !this.documents.isOpen(uriToPath(uri))) return false
      const text = this.documents.text(uriToPath(uri))
      if (text === undefined || this.transport === undefined) return false
      this.writeDocument(uri, text)
      return true
    })
    this.synchronizing = result.then(() => undefined, () => undefined)
    return result
  }

  private writeDocument(uri: string, text: string): void {
    const synced = this.synced.get(uri)
    if (synced === undefined) {
      const version = this.nextDocumentVersion++
      this.synced.set(uri, { version, text })
      this.transport?.writeNotification('textDocument/didOpen', {
        textDocument: { uri, languageId: languageIdFor(uri), version, text },
      })
    } else if (synced.text !== text) {
      synced.version = this.nextDocumentVersion++
      synced.text = text
      this.transport?.writeNotification('textDocument/didChange', {
        textDocument: { uri, version: synced.version },
        contentChanges: [{ text }],
      })
    } else {
      return
    }
    if (this.documents.isOpen(uriToPath(uri))) {
      void this.pullFor(uri).catch((error: unknown) => log(errorMessage(error)))
    }
  }

  closed(uri: string): void {
    if (this.synced.delete(uri) && this.transport !== undefined) {
      this.transport.writeNotification('textDocument/didClose', { textDocument: { uri } })
    }
  }
  private anyOpenUri(): string | undefined {
    const filePath = this.documents.openPaths().next().value
    return filePath === undefined ? undefined : pathToUri(filePath)
  }
}

function withoutProgressTokens(params: unknown): unknown {
  if (!isRecord(params)) return params
  const { workDoneToken, partialResultToken, ...rest } = params
  return rest
}

function watchTarget(glob: unknown, rootPath: string): { root: string; depth?: number } {
  let pattern: string
  if (typeof glob === 'string') {
    pattern = path.resolve(rootPath, glob)
  } else if (isRecord(glob) && typeof glob.pattern === 'string') {
    const base = typeof glob.baseUri === 'string' ? glob.baseUri : isRecord(glob.baseUri) ? glob.baseUri.uri : undefined
    if (typeof base !== 'string') throw new TypeScriptBridgeError('invalid tsrs watcher base URI', ErrorCodes.InvalidParams)
    pattern = path.resolve(uriToPath(base), glob.pattern)
  } else {
    throw new TypeScriptBridgeError('invalid tsrs watcher glob', ErrorCodes.InvalidParams)
  }
  const normalized = pattern.replaceAll('\\', '/')
  // tsrs registers exact paths and directory globs, not arbitrary LSP glob expressions.
  if (normalized.endsWith('/**/*') && !/[*?{[]/.test(normalized.slice(0, -5))) return { root: pattern.slice(0, -4) }
  if (normalized.endsWith('/*') && !/[*?{[]/.test(normalized.slice(0, -2))) return { root: pattern.slice(0, -1), depth: 0 }
  if (/[*?{[]/.test(normalized)) throw new TypeScriptBridgeError(`unsupported tsrs watcher glob: ${normalized}`, ErrorCodes.InvalidParams)
  return { root: pattern, depth: 0 }
}

function languageIdFor(uri: string): string {
  const extension = path.extname(uri).toLowerCase()
  if (extension === '.ts' || extension === '.mts' || extension === '.cts') return 'typescript'
  if (extension === '.tsx') return 'typescriptreact'
  if (extension === '.jsx') return 'javascriptreact'
  return 'javascript'
}
