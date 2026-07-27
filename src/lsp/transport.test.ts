import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { MessageFormatError, Transport } from './transport.js'

function framed(payload: unknown): string {
  const body = JSON.stringify(payload)
  return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`
}

function transportOver(input: string): { transport: Transport; output: PassThrough } {
  const readable = new PassThrough()
  const output = new PassThrough()
  readable.end(input)
  return { transport: new Transport(readable, output), output }
}

describe('Transport', () => {
  it('reads a framed message', async () => {
    const { transport } = transportOver(framed({ method: 'initialize' }))
    const body = await transport.read()
    expect(JSON.parse(String(body)).method).toBe('initialize')
  })

  it('reads two messages from one chunk', async () => {
    const { transport } = transportOver(framed({ id: 1 }) + framed({ id: 2 }))
    expect(JSON.parse(String(await transport.read())).id).toBe(1)
    expect(JSON.parse(String(await transport.read())).id).toBe(2)
  })

  it('returns undefined at end of stream', async () => {
    const { transport } = transportOver('')
    expect(await transport.read()).toBeUndefined()
  })

  it('throws a format error when the header is missing', async () => {
    const { transport } = transportOver('Bad-Header: 1\r\n\r\n{}')
    await expect(transport.read()).rejects.toBeInstanceOf(MessageFormatError)
  })

  it('throws a format error when the length is not a number', async () => {
    const { transport } = transportOver('Content-Length: abc\r\n\r\n{}')
    await expect(transport.read()).rejects.toBeInstanceOf(MessageFormatError)
  })

  it('writes a framed result', async () => {
    const { transport, output } = transportOver('')
    transport.writeResult(7, { ok: true })
    const text = output.read().toString()
    expect(text).toMatch(/^Content-Length: \d+\r\n\r\n/)
    expect(JSON.parse(text.split('\r\n\r\n')[1] ?? '')).toEqual({ jsonrpc: '2.0', id: 7, result: { ok: true } })
  })

  it('writes a framed error', async () => {
    const { transport, output } = transportOver('')
    transport.writeError(3, -32700, 'bad')
    const payload = JSON.parse(output.read().toString().split('\r\n\r\n')[1] ?? '')
    expect(payload.error).toEqual({ code: -32700, message: 'bad' })
  })

  it('writes a notification without an id', async () => {
    const { transport, output } = transportOver('')
    transport.writeNotification('textDocument/publishDiagnostics', { uri: 'file:///a.js' })
    const payload = JSON.parse(output.read().toString().split('\r\n\r\n')[1] ?? '')
    expect(payload.method).toBe('textDocument/publishDiagnostics')
    expect(payload.id).toBeUndefined()
  })
})
