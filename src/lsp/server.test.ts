import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Server, type ServerOptions } from './server.js'

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'mol-lsp-server-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

interface Incoming {
  id?: unknown
  method?: string
  params?: unknown
  result?: unknown
  error?: { message: string }
}

class Client {
  private readonly inbound = new PassThrough()
  private readonly outbound = new PassThrough()
  private buffer = Buffer.alloc(0)
  private readonly waiting = new Map<number, Pending>()
  private nextId = 1
  private readonly server: Server
  readonly finished: Promise<void>
  readonly notifications: Array<{ method: string; params: unknown }> = []
  private readonly notificationWaiters = new Map<string, Array<(params: unknown) => void>>()

  constructor(options: ServerOptions = {}) {
    this.outbound.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk])
      this.drain()
    })
    this.server = new Server(this.inbound, this.outbound, options)
    this.finished = this.server.run()
  }

  request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++
    return new Promise<unknown>((resolve, reject) => {
      this.waiting.set(id, { resolve, reject })
      this.send({ jsonrpc: '2.0', id, method, params })
    })
  }

  notify(method: string, params: unknown): void {
    this.send({ jsonrpc: '2.0', method, params })
  }

  async waitForNotification(method: string): Promise<unknown> {
    const seen = this.notifications.find((entry) => entry.method === method)
    if (seen !== undefined) {
      return seen.params
    }
    return new Promise<unknown>((resolve) => {
      const waiters = this.notificationWaiters.get(method) ?? []
      waiters.push(resolve)
      this.notificationWaiters.set(method, waiters)
    })
  }

  stop(): void {
    this.inbound.end()
  }

  private send(payload: unknown): void {
    const body = Buffer.from(JSON.stringify(payload), 'utf8')
    this.inbound.write(`Content-Length: ${body.length}\r\n\r\n`)
    this.inbound.write(body)
  }

  private drain(): void {
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n')
      if (headerEnd < 0) {
        return
      }
      const header = this.buffer.subarray(0, headerEnd).toString('utf8')
      const length = Number(/content-length:\s*(\d+)/i.exec(header)?.[1] ?? 0)
      const start = headerEnd + 4
      if (this.buffer.length < start + length) {
        return
      }
      const body = this.buffer.subarray(start, start + length).toString('utf8')
      this.buffer = this.buffer.subarray(start + length)
      this.dispatch(body)
    }
  }

  private dispatch(body: string): void {
    const message = JSON.parse(body) as Incoming
    if (typeof message.method === 'string') {
      this.notifications.push({ method: message.method, params: message.params })
      const waiters = this.notificationWaiters.get(message.method)
      if (waiters !== undefined) {
        this.notificationWaiters.delete(message.method)
        for (const waiter of waiters) {
          waiter(message.params)
        }
      }
      return
    }
    if (typeof message.id !== 'number') {
      return
    }
    const pending = this.waiting.get(message.id)
    if (pending === undefined) {
      return
    }
    this.waiting.delete(message.id)
    if (message.error !== undefined) {
      pending.reject(new Error(message.error.message))
      return
    }
    pending.resolve(message.result)
  }
}

function positionOf(source: string, needle: string): { line: number; character: number } {
  const index = source.indexOf(needle)
  if (index < 0) {
    throw new Error(`missing ${needle}`)
  }
  const before = source.slice(0, index)
  return {
    line: before.split('\n').length - 1,
    character: index - (before.lastIndexOf('\n') + 1),
  }
}

const pullCapabilities = {
  textDocument: { diagnostic: {} },
  workspace: { diagnostics: { refreshSupport: true } },
}

async function initialize(client: Client, capabilities: unknown): Promise<{ capabilities: Record<string, unknown> }> {
  const result = await client.request('initialize', {
    processId: process.pid,
    rootUri: `file://${root}`,
    capabilities,
  }) as { capabilities: Record<string, unknown> }
  client.notify('initialized', {})
  return result
}

const ghostFixture = [
  'module.exports = {',
  '  name: "caller",',
  '  actions: {',
  '    run: { async handler(ctx) { this.unknownMethod(); return ctx.call("ghost.action", {}) } },',
  '  },',
  '}',
].join('\n')

describe('Server pull diagnostics', () => {
  it('advertises pull diagnostics when the client supports them', async () => {
    const client = new Client()
    try {
      const result = await initialize(client, pullCapabilities)
      expect(result.capabilities.diagnosticProvider).toEqual({
        interFileDependencies: true,
        workspaceDiagnostics: false,
      })
    } finally {
      client.stop()
    }
  })

  it('answers textDocument/diagnostic with a full report', async () => {
    const filePath = path.join(root, 'caller.service.js')
    fs.writeFileSync(filePath, ghostFixture)

    const client = new Client()
    try {
      await initialize(client, pullCapabilities)

      const report = await client.request('textDocument/diagnostic', {
        textDocument: { uri: `file://${filePath}` },
      }) as { kind: string; items: Array<{ message: string }> }

      expect(report.kind).toBe('full')
      expect(report.items.map((item) => item.message)).toContainEqual(
        expect.stringContaining('"this.unknownMethod"'),
      )
      expect(report.items.map((item) => item.message)).not.toContainEqual(
        expect.stringContaining('#self.'),
      )
      expect(report.items.map((item) => item.message)).toContainEqual(
        expect.stringContaining('"ghost.action"'),
      )
    } finally {
      client.stop()
    }
  })

  it('keeps pushing diagnostics for clients without pull support', async () => {
    const filePath = path.join(root, 'caller.service.js')
    fs.writeFileSync(filePath, ghostFixture)

    const client = new Client()
    try {
      const result = await initialize(client, {})
      expect(result.capabilities.diagnosticProvider).toBeUndefined()

      const params = await client.waitForNotification('textDocument/publishDiagnostics') as {
        uri: string
        diagnostics: Array<{ message: string }>
      }
      expect(params.uri.endsWith('caller.service.js')).toBe(true)
      expect(params.diagnostics.map((item) => item.message)).toContainEqual(
        expect.stringContaining('"ghost.action"'),
      )
    } finally {
      client.stop()
    }
  })

  it('rejects a diagnostic pull without a document uri', async () => {
    const client = new Client()
    try {
      await initialize(client, pullCapabilities)
      await expect(client.request('textDocument/diagnostic', {})).rejects.toThrow(
        /requires a document uri/,
      )
    } finally {
      client.stop()
    }
  })
})

describe('Server navigation', () => {
  it('resolves an action string from the service segment to the action definition', async () => {
    const callSite = 'ctx.call("mongoprovider.getBooking", {})'
    fs.writeFileSync(path.join(root, 'mongo.service.js'), [
      'module.exports = {',
      '  name: "mongoprovider",',
      '  actions: {',
      '    getBooking: { handler() { return null } },',
      '  },',
      '}',
    ].join('\n'))
    const callerPath = path.join(root, 'caller.service.js')
    const callerSource = [
      'module.exports = {',
      '  name: "caller",',
      '  actions: {',
      `    run: { async handler(ctx) { return ${callSite} } },`,
      '  },',
      '}',
    ].join('\n')
    fs.writeFileSync(callerPath, callerSource)

    const client = new Client()
    try {
      await initialize(client, pullCapabilities)
      const position = positionOf(callerSource, 'mongoprovider')

      const definition = await client.request('textDocument/definition', {
        textDocument: { uri: `file://${callerPath}` },
        position,
      }) as { uri: string; range: { start: { line: number } } } | null

      expect(definition).not.toBeNull()
      expect(definition?.uri.endsWith('mongo.service.js')).toBe(true)
      expect(definition?.range.start.line).toBe(3)

      const references = await client.request('textDocument/references', {
        textDocument: { uri: `file://${callerPath}` },
        position,
        context: { includeDeclaration: false },
      }) as Array<{ uri: string }>

      expect(references.length).toBeGreaterThan(0)
      expect(references[0]?.uri.endsWith('caller.service.js')).toBe(true)
    } finally {
      client.stop()
    }
  })

  it('falls back to the service file for an unknown action', async () => {
    fs.writeFileSync(path.join(root, 'ghost.service.js'), [
      'module.exports = {',
      '  name: "ghostsvc",',
      '  actions: {',
      '    ping: { handler() { return 1 } },',
      '  },',
      '}',
    ].join('\n'))
    const callerPath = path.join(root, 'other.service.js')
    const callerSource = [
      'module.exports = {',
      '  name: "other",',
      '  actions: {',
      '    run: { async handler(ctx) { return ctx.call("ghostsvc.missingAction", {}) } },',
      '  },',
      '}',
    ].join('\n')
    fs.writeFileSync(callerPath, callerSource)

    const client = new Client()
    try {
      await initialize(client, pullCapabilities)
      const position = positionOf(callerSource, 'ghostsvc')

      const definition = await client.request('textDocument/definition', {
        textDocument: { uri: `file://${callerPath}` },
        position,
      }) as { uri: string; range: { start: { line: number } } } | null

      expect(definition?.uri.endsWith('ghost.service.js')).toBe(true)
      expect(definition?.range.start.line).toBe(0)
    } finally {
      client.stop()
    }
  })
})

const stubTypeScriptServer = `
const fs = require('node:fs')
const [mode, pidFile] = process.argv.slice(2)
fs.writeFileSync(pidFile, String(process.pid))
setInterval(() => {}, 1000)
let buffer = Buffer.alloc(0)
const documents = new Map()
const waiting = new Map()
let nextId = 1
const send = (message) => {
  const body = Buffer.from(JSON.stringify(message))
  process.stdout.write(Buffer.concat([Buffer.from('Content-Length: ' + body.length + '\\r\\n\\r\\n'), body]))
}
const locationFor = (uri) => {
  const text = documents.get(uri)
  if (text === undefined) return null
  const line = text.split('\\n').length - 1
  return { uri: 'file:///typescript/stub.js', range: { start: { line, character: 0 }, end: { line, character: 1 } } }
}
const handle = (message) => {
  if (message.method === 'textDocument/didOpen' || message.method === 'textDocument/didChange') {
    const document = message.params.textDocument
    documents.set(document.uri, document.text ?? message.params.contentChanges[0].text)
    return
  }
  if (message.method === 'textDocument/didClose') {
    documents.delete(message.params.textDocument.uri)
    return
  }
  if (message.method === undefined) {
    const respond = waiting.get(message.id)
    waiting.delete(message.id)
    if (respond !== undefined && Array.isArray(message.result)) respond()
    return
  }
  if (message.id === undefined) return
  const uri = message.params?.textDocument?.uri
  if (message.method === 'initialize') return send({ jsonrpc: '2.0', id: message.id, result: { capabilities: {} } })
  if (message.method === 'textDocument/definition') {
    const configurationId = 'configuration-' + nextId++
    waiting.set(configurationId, () => send({ jsonrpc: '2.0', id: message.id, result: locationFor(uri) }))
    return send({ jsonrpc: '2.0', id: configurationId, method: 'workspace/configuration', params: { items: [{ section: 'typescript' }] } })
  }
  if (message.method === 'textDocument/references') {
    const location = locationFor(uri)
    return send({ jsonrpc: '2.0', id: message.id, result: location === null ? [] : [location] })
  }
  if (message.method === 'textDocument/documentSymbol') {
    const location = locationFor(uri)
    return send({ jsonrpc: '2.0', id: message.id, result: location === null ? [] : [{ name: 'stubSymbol', kind: 12, location }] })
  }
  send({ jsonrpc: '2.0', id: message.id, result: null })
}
process.stdin.on('data', (chunk) => {
  if (mode === 'garbage') {
    process.stdout.write('this is not lsp\\r\\n\\r\\n')
    return
  }
  buffer = Buffer.concat([buffer, chunk])
  for (;;) {
    const end = buffer.indexOf('\\r\\n\\r\\n')
    if (end < 0) return
    const length = Number(/Content-Length: (\\d+)/i.exec(buffer.subarray(0, end).toString())[1])
    if (buffer.length < end + 4 + length) return
    handle(JSON.parse(buffer.subarray(end + 4, end + 4 + length).toString()))
    buffer = buffer.subarray(end + 4 + length)
  }
})
`

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function waitForExit(pid: number): Promise<boolean> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (!processAlive(pid)) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  return !processAlive(pid)
}

describe('Server TypeScript fallback', () => {
  let stubDir: string

  beforeEach(() => {
    stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mol-lsp-stub-'))
    fs.writeFileSync(path.join(stubDir, 'stub-server.cjs'), stubTypeScriptServer)
  })

  afterEach(() => {
    fs.rmSync(stubDir, { recursive: true, force: true })
  })

  const plainSource = [
    'const helper = require("./helper")',
    'function run() { return helper.compute() }',
    'module.exports = { run }',
  ].join('\n')

  function stub(mode = 'normal'): ServerOptions {
    return {
      typescriptFallback: {
        command: process.execPath,
        args: [path.join(stubDir, 'stub-server.cjs'), mode, path.join(stubDir, 'pid')],
      },
    }
  }

  function writePlain(source = plainSource): { uri: string; filePath: string } {
    const filePath = path.join(root, 'plain.js')
    fs.writeFileSync(filePath, source)
    return { uri: `file://${filePath}`, filePath }
  }

  async function definitionLine(client: Client, uri: string): Promise<number | undefined> {
    const definition = await client.request('textDocument/definition', {
      textDocument: { uri },
      position: positionOf(plainSource, 'compute'),
    }) as { range: { start: { line: number } } } | null
    return definition?.range.start.line
  }

  it('answers a request the index cannot resolve through TypeScript', async () => {
    const { uri } = writePlain()
    const client = new Client(stub())
    try {
      await initialize(client, pullCapabilities)
      const params = { textDocument: { uri }, position: positionOf(plainSource, 'compute') }

      const definition = await client.request('textDocument/definition', params) as { uri: string } | null
      const references = await client.request('textDocument/references', { ...params, context: { includeDeclaration: false } }) as Array<{ uri: string }>
      const symbols = await client.request('textDocument/documentSymbol', { textDocument: params.textDocument }) as Array<{ name: string }>

      expect(definition?.uri).toBe('file:///typescript/stub.js')
      expect(references.map((reference) => reference.uri)).toEqual(['file:///typescript/stub.js'])
      expect(symbols.map((symbol) => symbol.name)).toEqual(['stubSymbol'])
    } finally {
      client.stop()
    }
  })

  it('keeps a Moleculer result instead of asking TypeScript', async () => {
    fs.writeFileSync(path.join(root, 'mongo.service.js'), [
      'module.exports = {',
      '  name: "mongoprovider",',
      '  actions: {',
      '    getBooking: { handler() { return null } },',
      '  },',
      '}',
    ].join('\n'))
    const callerPath = path.join(root, 'caller.service.js')
    const callerSource = [
      'module.exports = {',
      '  name: "caller",',
      '  actions: {',
      '    run: { async handler(ctx) { return ctx.call("mongoprovider.getBooking", {}) } },',
      '  },',
      '}',
    ].join('\n')
    fs.writeFileSync(callerPath, callerSource)

    const client = new Client(stub())
    try {
      await initialize(client, pullCapabilities)
      const definition = await client.request('textDocument/definition', {
        textDocument: { uri: `file://${callerPath}` },
        position: positionOf(callerSource, 'getBooking'),
      }) as { uri: string; range: { start: { line: number } } } | null

      expect(definition?.uri.endsWith('mongo.service.js')).toBe(true)
      expect(definition?.range.start.line).toBe(3)
    } finally {
      client.stop()
    }
  })

  it('sends the client edits to TypeScript', async () => {
    const { uri } = writePlain()
    const client = new Client(stub())
    try {
      await initialize(client, pullCapabilities)
      client.notify('textDocument/didOpen', { textDocument: { uri, languageId: 'javascript', version: 1, text: plainSource } })
      expect(await definitionLine(client, uri)).toBe(2)

      client.notify('textDocument/didChange', {
        textDocument: { uri, version: 2 },
        contentChanges: [{ text: `\n\n${plainSource}` }],
      })
      expect(await definitionLine(client, uri)).toBe(4)
    } finally {
      client.stop()
    }
  })

  it('reads a file the client never opened from disk on each request', async () => {
    const { uri, filePath } = writePlain()
    const client = new Client(stub())
    try {
      await initialize(client, pullCapabilities)
      expect(await definitionLine(client, uri)).toBe(2)

      fs.writeFileSync(filePath, `\n\n${plainSource}`)
      expect(await definitionLine(client, uri)).toBe(4)
    } finally {
      client.stop()
    }
  })

  it('returns the empty index result when the fallback is off', async () => {
    const { uri } = writePlain()
    const client = new Client()
    try {
      await initialize(client, pullCapabilities)
      expect(await definitionLine(client, uri)).toBeUndefined()
    } finally {
      client.stop()
    }
  })

  it.each([
    ['a missing binary', 'missing-server', false],
    ['a file that cannot be executed', 'not-executable', true],
  ])('returns the empty index result when TypeScript is %s', async (_label, name, create) => {
    const command = path.join(stubDir, name)
    if (create) {
      fs.writeFileSync(command, '', { mode: 0o755 })
    }
    const { uri } = writePlain()
    const client = new Client({ typescriptFallback: { command, args: [] } })
    try {
      await initialize(client, pullCapabilities)
      expect(await definitionLine(client, uri)).toBeUndefined()
      expect(await definitionLine(client, uri)).toBeUndefined()
    } finally {
      client.stop()
    }
  })

  it('stops a TypeScript server that writes malformed output', async () => {
    const { uri } = writePlain()
    const client = new Client(stub('garbage'))
    await initialize(client, pullCapabilities)
    expect(await definitionLine(client, uri)).toBeUndefined()
    const pid = Number(fs.readFileSync(path.join(stubDir, 'pid'), 'utf8'))

    client.stop()
    await client.finished

    expect(await waitForExit(pid)).toBe(true)
  })

  it('stops the TypeScript server when the client disconnects', async () => {
    const { uri } = writePlain()
    const client = new Client(stub())
    await initialize(client, pullCapabilities)
    expect(await definitionLine(client, uri)).toBe(2)
    const pid = Number(fs.readFileSync(path.join(stubDir, 'pid'), 'utf8'))

    client.stop()
    await client.finished

    expect(await waitForExit(pid)).toBe(true)
  })
})
