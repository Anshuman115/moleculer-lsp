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
}

class Client {
  private readonly inbound = new PassThrough()
  private readonly outbound = new PassThrough()
  private buffer = Buffer.alloc(0)
  private readonly waiting = new Map<number, Pending>()
  private nextId = 1
  private readonly server: Server

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
    return new Promise<unknown>((resolve) => {
      this.waiting.set(id, { resolve })
      this.send({ jsonrpc: '2.0', id, method, params })
    })
  }

  notify(method: string, params: unknown): void {
    this.send({ jsonrpc: '2.0', method, params })
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
    const message = JSON.parse(body) as { id?: number; result?: unknown }
    if (typeof message.id !== 'number') {
      return
    }
    this.waiting.get(message.id)?.resolve(message.result)
    this.waiting.delete(message.id)
  }
}

function positionOf(source: string, needle: string): { line: number; character: number } {
  const index = source.indexOf(needle)
  if (index < 0) {
    throw new Error(`missing ${needle}`)
  }
  const before = source.slice(0, index)
  const line = before.split('\n').length - 1
  const character = index - (before.lastIndexOf('\n') + 1)
  return { line, character }
}

function startServer(): Client {
  const client = new Client()
  return client
}

async function initialize(client: Client): Promise<void> {
  await client.request('initialize', {
    processId: process.pid,
    rootUri: `file://${root}`,
    capabilities: {},
  })
  client.notify('initialized', {})
}

describe('Server pull requests', () => {
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

    const client = startServer()
    try {
      await initialize(client)
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

  it('answers textDocument/diagnostic with a full report', async () => {
    const brokenPath = path.join(root, 'caller.service.js')
    fs.writeFileSync(brokenPath, [
      'module.exports = {',
      '  name: "caller",',
      '  actions: {',
      '    run: { async handler(ctx) { this.unknownMethod(); return ctx.call("ghost.action", {}) } },',
      '  },',
      '}',
    ].join('\n'))

    const client = startServer()
    try {
      await initialize(client)

      const report = await client.request('textDocument/diagnostic', {
        textDocument: { uri: `file://${brokenPath}` },
      }) as { kind: string; items: Array<{ message: string; source: string }> }

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
})
