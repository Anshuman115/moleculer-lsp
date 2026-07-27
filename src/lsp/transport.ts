import type { Readable, Writable } from 'node:stream'

export class MessageFormatError extends Error {}

export class Transport {
  private buffer = Buffer.alloc(0)
  private readonly iterator: AsyncIterator<Buffer>

  constructor(readable: Readable, private readonly writable: Writable) {
    this.iterator = readable[Symbol.asyncIterator]() as AsyncIterator<Buffer>
  }

  async read(): Promise<Buffer | undefined> {
    while (true) {
      const message = this.takeMessage()
      if (message !== undefined) {
        return message
      }
      const next = await this.iterator.next()
      if (next.done === true) {
        return undefined
      }
      this.buffer = Buffer.concat([this.buffer, next.value])
    }
  }

  writeResult(id: unknown, result: unknown): void {
    this.send({ jsonrpc: '2.0', id, result })
  }

  writeError(id: unknown, code: number, message: string): void {
    this.send({ jsonrpc: '2.0', id, error: { code, message } })
  }

  writeNotification(method: string, params: unknown): void {
    this.send({ jsonrpc: '2.0', method, params })
  }

  private send(payload: unknown): void {
    const body = Buffer.from(JSON.stringify(payload), 'utf8')
    this.writable.write(`Content-Length: ${body.length}\r\n\r\n`)
    this.writable.write(body)
  }

  private takeMessage(): Buffer | undefined {
    const headerEnd = this.buffer.indexOf('\r\n\r\n')
    if (headerEnd < 0) {
      return undefined
    }
    const header = this.buffer.subarray(0, headerEnd).toString('utf8')
    const length = contentLength(header)
    const start = headerEnd + 4
    const end = start + length
    if (this.buffer.length < end) {
      return undefined
    }
    const body = this.buffer.subarray(start, end)
    this.buffer = this.buffer.subarray(end)
    return body
  }

  discardBuffer(): void {
    this.buffer = Buffer.alloc(0)
  }
}

function contentLength(header: string): number {
  for (const rawLine of header.split('\r\n')) {
    const separator = rawLine.indexOf(':')
    if (separator < 0) {
      continue
    }
    if (rawLine.slice(0, separator).trim().toLowerCase() !== 'content-length') {
      continue
    }
    const value = Number.parseInt(rawLine.slice(separator + 1).trim(), 10)
    if (!Number.isInteger(value) || value < 0) {
      throw new MessageFormatError('invalid Content-Length header')
    }
    return value
  }
  throw new MessageFormatError('missing Content-Length header')
}
