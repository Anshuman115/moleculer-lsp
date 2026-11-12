import { describe, expect, it } from 'vitest'
import { CursorKind, detect } from './cursor.js'

function at(source: string, marker: string, namespace = 'users'): ReturnType<typeof detect> {
  const line = source.split('\n').findIndex((text) => text.includes(marker))
  const character = (source.split('\n')[line] ?? '').indexOf(marker) + Math.floor(marker.length / 2)
  return detect(source, line, character, namespace)
}

describe('detect', () => {
  it('classifies the action segment of a dotted string', () => {
    const context = at('await ctx.call("mail.send")', 'send')
    expect(context.kind).toBe(CursorKind.ActionString)
    expect(context.fullName).toBe('mail.send')
  })

  it('classifies the service segment of a dotted string', () => {
    const context = at('await ctx.call("mail.send")', 'mail')
    expect(context.kind).toBe(CursorKind.ServiceName)
    expect(context.fullName).toBe('mail.send')
  })

  it('treats the segment after a version prefix as the service name', () => {
    const context = at('await ctx.call("v2.mail.send")', 'mail')
    expect(context.kind).toBe(CursorKind.ServiceName)
  })

  it('qualifies a bare string with the current namespace', () => {
    const context = at('ctx.emit("refresh")', 'refresh')
    expect(context.kind).toBe(CursorKind.MethodAccess)
    expect(context.fullName).toBe('users.refresh')
  })

  it('resolves a this-method call against the namespace', () => {
    const context = at('return this.hashPassword(value)', 'hashPassword')
    expect(context.kind).toBe(CursorKind.MethodAccess)
    expect(context.fullName).toBe('users.hashPassword')
  })

  it('leaves the this keyword itself to TypeScript', () => {
    expect(at('return this.hashPassword(value)', 'this').kind).toBe(CursorKind.Unknown)
  })

  it('marks a chained this-call as chained', () => {
    const context = at('return this.client.connect()', 'connect')
    expect(context.chained).toBe(true)
  })

  it('ignores framework properties on this', () => {
    expect(at('this.logger.info("x")', 'info').kind).toBe(CursorKind.Unknown)
  })

  it('ignores known globals on a local call', () => {
    expect(at('console.log("x")', 'log').kind).toBe(CursorKind.Unknown)
  })

  it('leaves method calls on plain objects to TypeScript', () => {
    expect(at('Passwordless.init({ contactMethod })', 'init').kind).toBe(CursorKind.Unknown)
  })

  it('does not treat a call assigned to a this-property as a this-call', () => {
    const source = 'this.client = HttpClientFactory.createClientV2(config)'
    expect(at(source, 'HttpClientFactory').kind).toBe(CursorKind.Unknown)
    expect(at(source, 'createClientV2').kind).toBe(CursorKind.Unknown)
  })

  it('detects a definition site key', () => {
    const context = at('        createUser(ctx) {', 'createUser')
    expect(context.kind).toBe(CursorKind.DefinitionSite)
    expect(context.fullName).toBe('users.createUser')
  })

  it('detects a quoted definition site key', () => {
    const context = at('        "user.created": function (ctx) {', 'user.created')
    expect(context.kind).toBe(CursorKind.DefinitionSite)
  })

  it('skips the handler key', () => {
    expect(at('          handler(ctx) {', 'handler').kind).toBe(CursorKind.Unknown)
  })

  it('returns unknown for a line out of range', () => {
    expect(detect('const a = 1', 99, 0, 'users').kind).toBe(CursorKind.Unknown)
  })

  it('returns unknown for plain code', () => {
    expect(at('const total = a + b', 'total').kind).toBe(CursorKind.Unknown)
  })
})
