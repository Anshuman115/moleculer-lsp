import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { createRequire as createModuleRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { log } from '../log.js'
import { isRecord } from './protocol.js'
import { Transport } from './transport.js'

export interface TypeScriptCommand {
  command: string
  args: string[]
}

interface Pending {
  resolve: (value: unknown) => void
  timer: NodeJS.Timeout
}

const requestTimeoutMs = 15000
const maxConsecutiveTimeouts = 2

export function resolveTypeScriptCommand(
  rootPath: string,
  searchPath = process.env.PATH ?? '',
  bundled: () => TypeScriptCommand | undefined = bundledTypeScript,
): TypeScriptCommand | undefined {
  const tsc = findExecutable('tsc', rootPath, searchPath)
  if (tsc !== undefined && speaksLsp(tsc)) {
    return { command: tsc, args: ['--lsp', '--stdio'] }
  }
  const server = findExecutable('typescript-language-server', rootPath, searchPath)
  return server === undefined ? bundled() : { command: server, args: ['--stdio'] }
}

function bundledTypeScript(): TypeScriptCommand | undefined {
  try {
    const manifestPath = createModuleRequire(import.meta.url).resolve('typescript/package.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { version?: unknown }
    if (typeof manifest.version !== 'string' || Number(manifest.version.split('.')[0]) < 7) {
      return undefined
    }
    return { command: process.execPath, args: [path.join(path.dirname(manifestPath), 'bin', 'tsc'), '--lsp', '--stdio'] }
  } catch {
    return undefined
  }
}

export class TypeScriptBridge {
  private transport: Transport | undefined
  private child: ChildProcess | undefined
  private ready: Promise<boolean> | undefined
  private readonly pending = new Map<number, Pending>()
  private readonly texts = new Map<string, string>()
  private readonly versions = new Map<string, number>()
  private nextId = 1
  private consecutiveTimeouts = 0
  private pullDiagnostics = false

  constructor(
    private readonly command: TypeScriptCommand,
    private readonly rootPath: string,
    private readonly onDiagnostics?: (uri: string, diagnostics: unknown[]) => void,
  ) {}

  track(uri: string, text: string): void {
    if (this.texts.get(uri) === text) {
      return
    }
    this.texts.set(uri, text)
    const version = this.versions.get(uri)
    if (version === undefined || this.transport === undefined) {
      return
    }
    this.versions.set(uri, version + 1)
    this.transport.writeNotification('textDocument/didChange', {
      textDocument: { uri, version: version + 1 },
      contentChanges: [{ text }],
    })
    this.pullFor(uri)
  }

  forget(uri: string): void {
    this.texts.delete(uri)
    this.close(uri)
  }

  async show(uri: string): Promise<void> {
    if (await this.start()) {
      this.open(uri)
      this.pullFor(uri)
    }
  }

  async request(method: string, params: unknown, uri: string | undefined): Promise<unknown> {
    if (!(await this.start())) {
      return null
    }
    const target = uri ?? this.texts.keys().next().value
    if (target === undefined) {
      return this.send(method, withoutProgressTokens(params))
    }
    const temporary = !this.texts.has(target)
    this.open(target)
    const result = await this.send(method, withoutProgressTokens(params))
    if (temporary && !this.texts.has(target)) {
      this.close(target)
    }
    return result
  }

  stop(): void {
    this.shutdown(undefined)
  }

  private start(): Promise<boolean> {
    if (this.ready === undefined) {
      this.ready = this.launch()
    }
    return this.ready
  }

  private async launch(): Promise<boolean> {
    let child: ChildProcess
    try {
      child = spawn(this.command.command, this.command.args, {
        cwd: this.rootPath,
        stdio: ['pipe', 'pipe', 'ignore'],
      })
    } catch (error) {
      log(`typescript fallback stopped: cannot start ${this.command.command}: ${messageOf(error)}`)
      this.ready = Promise.resolve(false)
      return false
    }
    child.on('error', (error) => this.shutdown(`process error: ${error.message}`))
    child.on('exit', (code, signal) => this.shutdown(`process exited (${code ?? signal})`))
    child.stdin?.on('error', (error) => this.shutdown(`input closed: ${error.message}`))
    if (child.stdin === null || child.stdout === null) {
      this.shutdown('process has no stdio pipes')
      return false
    }
    this.child = child
    this.transport = new Transport(child.stdout, child.stdin)
    void this.listen(this.transport)
    const result = await this.send('initialize', {
      processId: process.pid,
      rootUri: pathToFileURL(this.rootPath).toString(),
      capabilities: { textDocument: { publishDiagnostics: {}, diagnostic: {} } },
    })
    if (result === null || this.transport === undefined) {
      this.shutdown('initialize failed')
      return false
    }
    this.pullDiagnostics = isRecord(result) && isRecord(result.capabilities) && result.capabilities.diagnosticProvider !== undefined
    this.transport.writeNotification('initialized', {})
    return true
  }

  private pullFor(uri: string): void {
    if (this.onDiagnostics === undefined || !this.pullDiagnostics) {
      return
    }
    const onDiagnostics = this.onDiagnostics
    void this.send('textDocument/diagnostic', { textDocument: { uri } }).then((report) => {
      if (isRecord(report) && Array.isArray(report.items)) {
        onDiagnostics(uri, report.items)
      }
    })
  }

  private shutdown(reason: string | undefined): void {
    const child = this.child
    const active = child !== undefined || this.transport !== undefined
    this.transport = undefined
    this.child = undefined
    this.ready = Promise.resolve(false)
    this.versions.clear()
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.resolve(null)
      this.pending.delete(id)
    }
    if (child !== undefined) {
      child.stdin?.destroy()
      child.kill()
    }
    if (active && reason !== undefined) {
      log(`typescript fallback stopped: ${reason}`)
    }
  }

  private send(method: string, params: unknown): Promise<unknown> {
    const transport = this.transport
    if (transport === undefined) {
      return Promise.resolve(null)
    }
    const id = this.nextId++
    return new Promise<unknown>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        resolve(null)
        this.consecutiveTimeouts += 1
        if (this.consecutiveTimeouts >= maxConsecutiveTimeouts) {
          this.shutdown(`${this.consecutiveTimeouts} requests timed out after ${requestTimeoutMs} ms`)
        }
      }, requestTimeoutMs)
      timer.unref()
      this.pending.set(id, { resolve, timer })
      transport.writeRequest(id, method, params)
    })
  }

  private async listen(transport: Transport): Promise<void> {
    while (this.transport === transport) {
      let body: Buffer | undefined
      try {
        body = await transport.read()
      } catch (error) {
        this.shutdown(`malformed message: ${messageOf(error)}`)
        return
      }
      if (body === undefined) {
        this.shutdown('output closed')
        return
      }
      let message: unknown
      try {
        message = JSON.parse(body.toString('utf8'))
      } catch {
        continue
      }
      if (isRecord(message)) {
        this.receive(transport, message)
      }
    }
  }

  private receive(transport: Transport, message: Record<string, unknown>): void {
    if (typeof message.method === 'string') {
      if (message.id !== undefined) {
        transport.writeResult(message.id, replyFor(message.method, message.params))
      } else if (message.method === 'textDocument/publishDiagnostics') {
        this.forwardDiagnostics(message.params)
      }
      return
    }
    if (typeof message.id !== 'number') {
      return
    }
    const pending = this.pending.get(message.id)
    if (pending === undefined) {
      return
    }
    this.pending.delete(message.id)
    this.consecutiveTimeouts = 0
    clearTimeout(pending.timer)
    pending.resolve(message.error === undefined ? message.result ?? null : null)
  }

  private forwardDiagnostics(params: unknown): void {
    if (this.onDiagnostics !== undefined && isRecord(params) && typeof params.uri === 'string' && Array.isArray(params.diagnostics)) {
      this.onDiagnostics(params.uri, params.diagnostics)
    }
  }

  private open(uri: string): void {
    if (this.versions.has(uri) || this.transport === undefined) {
      return
    }
    const text = this.texts.get(uri) ?? readText(uri)
    if (text === undefined) {
      return
    }
    this.versions.set(uri, 1)
    this.transport.writeNotification('textDocument/didOpen', {
      textDocument: { uri, languageId: languageIdFor(uri), version: 1, text },
    })
  }

  private close(uri: string): void {
    if (this.versions.delete(uri) && this.transport !== undefined) {
      this.transport.writeNotification('textDocument/didClose', { textDocument: { uri } })
    }
  }
}

function withoutProgressTokens(params: unknown): unknown {
  if (!isRecord(params)) {
    return params
  }
  const { workDoneToken, partialResultToken, ...rest } = params
  return rest
}

function replyFor(method: string, params: unknown): unknown {
  if (method === 'workspace/configuration' && isRecord(params) && Array.isArray(params.items)) {
    return params.items.map(() => null)
  }
  return null
}

function readText(uri: string): string | undefined {
  try {
    return fs.readFileSync(fileURLToPath(uri), 'utf8')
  } catch {
    return undefined
  }
}

function languageIdFor(uri: string): string {
  const extension = path.extname(uri).toLowerCase()
  if (extension === '.ts' || extension === '.mts' || extension === '.cts') return 'typescript'
  if (extension === '.tsx') return 'typescriptreact'
  if (extension === '.jsx') return 'javascriptreact'
  return 'javascript'
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function findExecutable(name: string, rootPath: string, searchPath: string): string | undefined {
  const directories = [path.join(rootPath, 'node_modules', '.bin'), ...searchPath.split(path.delimiter)]
  for (const directory of directories) {
    if (!path.isAbsolute(directory)) {
      continue
    }
    const candidate = path.join(directory, name)
    try {
      fs.accessSync(candidate, fs.constants.X_OK)
      return candidate
    } catch {
      continue
    }
  }
  return undefined
}

function speaksLsp(tscPath: string): boolean {
  try {
    const output = execFileSync(tscPath, ['--version'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const major = /Version (\d+)\./.exec(output)?.[1]
    if (major !== undefined) {
      return Number(major) >= 7
    }
  } catch {
    return shipsWithoutTsserver(tscPath)
  }
  return shipsWithoutTsserver(tscPath)
}

function shipsWithoutTsserver(tscPath: string): boolean {
  let packageDir: string
  try {
    packageDir = path.resolve(path.dirname(fs.realpathSync(tscPath)), '..')
  } catch {
    return false
  }
  return fs.existsSync(path.join(packageDir, 'package.json')) && !fs.existsSync(path.join(packageDir, 'lib', 'tsserver.js'))
}
