import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Documents } from './documents.js'
import { TypeScriptBridge } from './typescript-bridge.js'
import { isRecord } from './protocol.js'
import { resolveTypeScriptCommand } from './typescript-command.js'

let root: string
const bridges: TypeScriptBridge[] = []

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'mol-lsp-tsrs-'))
})

afterEach(() => {
  for (const bridge of bridges.splice(0)) bridge.stop()
  fs.rmSync(root, { recursive: true, force: true })
})

async function eventually<T>(read: () => T | undefined | Promise<T | undefined>): Promise<T> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await read()
    if (result !== undefined) return result
    // Native process exit and chokidar events run outside Vitest's fake clock.
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('timed out waiting for child protocol state')
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const watchingServer = `
const fs = require('node:fs')
const { fileURLToPath } = require('node:url')
const [root, shape] = process.argv.slice(2)
let buffer = Buffer.alloc(0)
let value = 1
let registered = false
let pulls = 0
const waiting = []
const send = (message) => {
  const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }))
  process.stdout.write(Buffer.concat([Buffer.from('Content-Length: ' + body.length + '\\r\\n\\r\\n'), body]))
}
const handle = (message) => {
  if (message.id === 'register') {
    if (message.error && (shape !== 'unsupported' || message.error.code !== -32602)) throw new Error(message.error.message)
    registered = true
    for (const respond of waiting.splice(0)) respond()
    return
  }
  if (shape === 'push' && (message.method === 'textDocument/didOpen' || message.method === 'textDocument/didChange')) {
    const { uri, version } = message.params.textDocument
    const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }
    for (const [text, publishedVersion] of [['fresh report', version], ['stale report', version - 1]]) {
      send({ method: 'textDocument/publishDiagnostics', params: { uri, version: publishedVersion, diagnostics: [{ message: text, range }] } })
    }
    return
  }
  if (message.method === 'textDocument/hover') return
  if (message.method === 'initialize') return send({ id: message.id, result: { capabilities: shape === 'push' ? {} : { diagnosticProvider: {} } } })
  if (message.method === 'initialized') {
    const globPattern = shape === 'unsupported' ? fileURLToPath(root) + '/*.js' : shape === 'relative' ? { baseUri: root, pattern: '**/*' } : fileURLToPath(root) + (shape === 'exact' ? '/jsconfig.json' : '/**/*')
    return send({ id: 'register', method: 'client/registerCapability', params: { registrations: [{ id: 'files', method: 'workspace/didChangeWatchedFiles', registerOptions: { watchers: [{ globPattern, kind: 7 }] } }] } })
  }
  if (message.method === 'workspace/didChangeWatchedFiles') {
    value = Number(fs.readFileSync(fileURLToPath(root) + '/jsconfig.json', 'utf8'))
    return send({ id: 'refresh-' + value, method: 'workspace/diagnostic/refresh' })
  }
  if (message.method === 'textDocument/diagnostic') {
    pulls += 1
    return send({ id: message.id, result: { kind: 'full', items: [{ message: 'value ' + value }] } })
  }
  if (message.method === 'textDocument/definition') {
    const respond = () => send({ id: message.id, result: { uri: message.params.textDocument.uri, range: { start: { line: value, character: 0 }, end: { line: value, character: 1 } } } })
    if (registered) respond()
    else waiting.push(respond)
    return
  }
  if (message.method === 'workspace/symbol') return send({ id: message.id, result: { pulls, value } })
  if (message.method === 'shutdown') {
    if ('params' in message) return send({ id: message.id, error: { code: -32602, message: 'omit shutdown params' } })
    return send({ id: message.id, result: null })
  }
  if (message.method === 'exit') process.exit(0)
}
process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk])
  for (;;) {
    const end = buffer.indexOf('\\r\\n\\r\\n')
    if (end < 0) return
    const length = Number(/Content-Length: (\\d+)/i.exec(buffer.subarray(0, end).toString())[1])
    if (buffer.length < end + 4 + length) return
    const message = JSON.parse(buffer.subarray(end + 4, end + 4 + length).toString())
    buffer = buffer.subarray(end + 4 + length)
    handle(message)
  }
})
`

describe('TypeScriptBridge child protocol', () => {
  it.each(['exact', 'recursive', 'relative'])('watches %s registrations and refreshes diagnostics without a request loop', async (shape) => {
    const script = path.join(root, 'peer.cjs')
    fs.writeFileSync(script, watchingServer)
    const config = path.join(root, 'jsconfig.json')
    fs.writeFileSync(config, '1')
    const filePath = path.join(root, 'plain.js')
    const uri = pathToFileURL(filePath).href
    const documents = new Documents()
    documents.set(filePath, 'const n = 1')
    const reports: unknown[][] = []
    const bridge = new TypeScriptBridge(() => ({ command: process.execPath, args: [script, pathToFileURL(root).href, shape] }), root, documents, (_uri, items) => reports.push(items))
    bridges.push(bridge)
    await bridge.opened(uri)
    await bridge.request('textDocument/definition', { textDocument: { uri }, position: { line: 0, character: 6 } }, uri)
    await eventually(() => reports.some((items) => items.some((item) => isRecord(item) && item.message === 'value 1')) ? true : undefined)

    fs.writeFileSync(config, '2')
    await eventually(() => reports.some((items) => items.some((item) => isRecord(item) && item.message === 'value 2')) ? true : undefined)
    const { pulls } = await bridge.request('workspace/symbol', { query: '' }, undefined) as { pulls: number }
    expect(pulls).toBeLessThanOrEqual(3)
    documents.delete(filePath)
    bridge.closed(uri)
    const count = reports.length
    fs.writeFileSync(config, '3')
    await eventually(async () => {
      const state = await bridge.request('workspace/symbol', { query: '' }, undefined)
      return isRecord(state) && state.value === 3 ? true : undefined
    })
    expect(reports).toHaveLength(count)
  })

  it('rejects an unsupported registration to the child without disabling navigation', async () => {
    const script = path.join(root, 'peer.cjs')
    fs.writeFileSync(script, watchingServer)
    const filePath = path.join(root, 'plain.js')
    const uri = pathToFileURL(filePath).href
    const documents = new Documents()
    documents.set(filePath, 'const n = 1')
    const bridge = new TypeScriptBridge(() => ({ command: process.execPath, args: [script, pathToFileURL(root).href, 'unsupported'] }), root, documents)
    bridges.push(bridge)
    const result = await bridge.request('textDocument/definition', { textDocument: { uri }, position: { line: 0, character: 6 } }, uri)
    expect(result).toMatchObject({ uri, range: { start: { line: 1 } } })
  })

  it('keeps navigation available after a slow child request times out', async () => {
    const script = path.join(root, 'peer.cjs')
    fs.writeFileSync(script, watchingServer)
    const filePath = path.join(root, 'plain.js')
    const uri = pathToFileURL(filePath).href
    const documents = new Documents()
    documents.set(filePath, 'const n = 1\nn')
    const bridge = new TypeScriptBridge(() => ({ command: process.execPath, args: [script, pathToFileURL(root).href, 'exact'] }), root, documents)
    bridges.push(bridge)
    const params = { textDocument: { uri }, position: { line: 1, character: 0 } }
    await bridge.request('textDocument/definition', params, uri)

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const slow = bridge.request('textDocument/hover', params, uri)
      const rejected = expect(slow).rejects.toThrow('textDocument/hover timed out')
      await vi.advanceTimersByTimeAsync(15000)
      await rejected
      expect(await bridge.request('textDocument/definition', params, uri)).toMatchObject({ uri, range: { start: { line: 1 } } })
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not replace current diagnostics with an older document version', async () => {
    const script = path.join(root, 'peer.cjs')
    fs.writeFileSync(script, watchingServer)
    const filePath = path.join(root, 'plain.js')
    const uri = pathToFileURL(filePath).href
    const documents = new Documents()
    documents.set(filePath, 'const n = 1')
    const reports: unknown[][] = []
    const bridge = new TypeScriptBridge(() => ({ command: process.execPath, args: [script, pathToFileURL(root).href, 'push'] }), root, documents, (_uri, items) => reports.push(items))
    bridges.push(bridge)
    await bridge.opened(uri)
    await bridge.request('workspace/symbol', { query: '' }, undefined)
    reports.length = 0

    documents.set(filePath, 'const n = 2')
    bridge.changed(uri)
    await bridge.request('workspace/symbol', { query: '' }, undefined)

    expect(reports.flat().map((item) => isRecord(item) ? item.message : undefined)).toEqual(['fresh report'])
  })

  it('terminates the real tsrs native descendant when the Node launcher cannot execve', async () => {
    const pidPath = path.join(root, 'native.pid')
    const shim = path.join(root, 'force-spawn.cjs')
    fs.writeFileSync(shim, `
      const fs = require('node:fs')
      const childProcess = require('node:child_process')
      process.execve = undefined
      const spawn = childProcess.spawn
      childProcess.spawn = (...args) => {
        const child = spawn(...args)
        fs.writeFileSync(${JSON.stringify(pidPath)}, String(child.pid))
        return child
      }
      require('node:module').syncBuiltinESMExports()
    `)
    const filePath = path.join(root, 'plain.js')
    fs.writeFileSync(filePath, 'const value = 1; value')
    const uri = pathToFileURL(filePath).href
    const command = resolveTypeScriptCommand()
    const bridge = new TypeScriptBridge(() => ({ ...command, args: ['-r', shim, ...command.args] }), root, new Documents())
    bridges.push(bridge)
    await bridge.request('textDocument/definition', { textDocument: { uri }, position: { line: 0, character: 18 } }, uri)
    const pid = Number(fs.readFileSync(pidPath, 'utf8'))
    expect(alive(pid)).toBe(true)
    bridge.stop()
    await eventually(() => alive(pid) ? undefined : true)
    expect(alive(pid)).toBe(false)
  }, 30000)
})
