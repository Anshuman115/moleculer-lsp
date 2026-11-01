import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Server } from './server.js'

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
  readonly notifications: Array<{ method: string; params: unknown }> = []
  private readonly notificationWaiters = new Map<string, Array<(params: unknown) => void>>()

  constructor() {
    this.outbound.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk])
      this.drain()
    })
    this.server = new Server(this.inbound, this.outbound)
    void this.server.run()
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
