import { describe, expect, it } from 'vitest'
import { CursorKind, targetAt, type CursorTarget } from './cursor.js'

function at(source: string, marker: string): CursorTarget | undefined {
  const line = source.split('\n').findIndex((text) => text.includes(marker))
  const character = (source.split('\n')[line] ?? '').indexOf(marker) + Math.floor(marker.length / 2)
  return targetAt(source, line, character)
}

describe('targetAt', () => {
  it('returns the whole string for the action segment of a dotted string', () => {
    expect(at('await ctx.call("mail.send")', 'send')).toEqual({ kind: CursorKind.Text, value: 'mail.send' })
  })

  it('marks the service segment of a dotted string', () => {
    expect(at('await ctx.call("mail.send")', 'mail')).toEqual({ kind: CursorKind.ServiceSegment, value: 'mail.send' })
  })

  it('treats the segment after a version prefix as the service segment', () => {
    expect(at('await ctx.call("v2.mail.send")', 'mail')?.kind).toBe(CursorKind.ServiceSegment)
  })

  it('returns a bare identifier string as text', () => {
    expect(at('ctx.emit("refresh")', 'refresh')).toEqual({ kind: CursorKind.Text, value: 'refresh' })
  })

  it('returns the method name of a this-call', () => {
    expect(at('return this.hashPassword(value)', 'hashPassword')).toEqual({ kind: CursorKind.Member, value: 'hashPassword' })
  })

  it('leaves the this keyword itself to TypeScript', () => {
    expect(at('return this.hashPassword(value)', 'this')).toBeUndefined()
  })

  it('ignores framework properties on this', () => {
    expect(at('this.logger.info("x")', 'info')).toBeUndefined()
  })

  it('ignores known globals on a local call', () => {
    expect(at('console.log("x")', 'log')).toBeUndefined()
  })

  it('leaves method calls on plain objects to TypeScript', () => {
    expect(at('Passwordless.init({ contactMethod })', 'init')).toBeUndefined()
  })

  it('does not treat a call assigned to a this-property as a this-call', () => {
    const source = 'this.client = HttpClientFactory.createClientV2(config)'
    expect(at(source, 'HttpClientFactory')).toBeUndefined()
    expect(at(source, 'createClientV2')).toBeUndefined()
  })

  it('returns the key of a definition site', () => {
    expect(at('        createUser(ctx) {', 'createUser')).toEqual({ kind: CursorKind.Declaration, value: 'createUser' })
  })

  it('returns the unquoted key of a quoted definition site', () => {
    expect(at('        "user.created": function (ctx) {', 'user.created')).toEqual({ kind: CursorKind.Declaration, value: 'user.created' })
  })

  it('skips the handler key', () => {
    expect(at('          handler(ctx) {', 'handler')).toBeUndefined()
  })

  it('returns nothing for a line out of range', () => {
    expect(targetAt('const a = 1', 99, 0)).toBeUndefined()
  })

  it('returns nothing for plain code', () => {
    expect(at('const total = a + b', 'total')).toBeUndefined()
  })
})
