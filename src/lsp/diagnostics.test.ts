import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Index } from '../index/Index.js'
import { Scanner } from '../scanner/scanner.js'
import { collectFiles } from '../scanner/files.js'
import { diagnosticsByFile } from './diagnostics.js'
import { DiagnosticSeverity, type Diagnostic } from './protocol.js'

let root: string

function write(relativePath: string, source: string): string {
  const fullPath = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, source)
  return fullPath
}

function diagnose(): Map<string, Diagnostic[]> {
  const index = new Index()
  const scanner = new Scanner(index)
  const result = scanner.scan(collectFiles(root))
  return diagnosticsByFile(index, result)
}

function positionOf(source: string, needle: string): { line: number; character: number } {
  const offset = source.indexOf(needle)
  expect(offset).toBeGreaterThanOrEqual(0)
  const before = source.slice(0, offset).split('\n')
  return { line: before.length - 1, character: before[before.length - 1].length }
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'mol-lsp-diag-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('diagnosticsByFile', () => {
  it('reports an error for a mixin whose require path does not resolve', () => {
    const file = write('users.service.js', 'const M = require("./missing.mixin"); module.exports = { name: "users", mixins: [M] }')

    const diagnostics = diagnose().get(file) ?? []
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Error)
    expect(diagnostics[0].code).toBe('broken-require-path')
  })

  it('reports an error on each declaration of an event declared in two services', () => {
    const source = (name: string): string => `module.exports = {\n  name: "${name}",\n  events: { "order.created"() {} }\n}\n`
    const alpha = write('alpha.service.js', source('alpha'))
    const beta = write('beta.service.js', source('beta'))
    const byFile = diagnose()

    for (const [file, text] of [[alpha, source('alpha')], [beta, source('beta')]]) {
      const diagnostics = (byFile.get(file) ?? []).filter((d) => d.code === 'name-collision')
      expect(diagnostics).toHaveLength(1)
      expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Error)
      expect(diagnostics[0].range.start).toEqual(positionOf(text, 'order.created'))
    }
  })

  it('reports a hint spanning the string contents of an emit with no listener', () => {
    const source = 'module.exports = {\n  name: "sender",\n  actions: { go(ctx) { ctx.emit("nobody.listens") } }\n}\n'
    const file = write('sender.service.js', source)

    const diagnostics = diagnose().get(file) ?? []
    expect(diagnostics).toHaveLength(1)
    const start = positionOf(source, 'nobody.listens')
    expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Hint)
    expect(diagnostics[0].code).toBe('event-no-listener')
    expect(diagnostics[0].range.start).toEqual(start)
    expect(diagnostics[0].range.end).toEqual({ line: start.line, character: start.character + 'nobody.listens'.length })
  })

  it('reports a hint for an unresolved this-call inside a named service', () => {
    const file = write('users.service.js', 'module.exports = {\n  name: "users",\n  actions: { go() { return this.missingHelper() } }\n}\n')

    const diagnostics = diagnose().get(file) ?? []
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Hint)
    expect(diagnostics[0].code).toBe('genuinely-unresolved')
    expect(diagnostics[0].message).toContain('this.missingHelper')
  })

  it('reports nothing for an unresolved this-call in a plain class file', () => {
    const file = write('client.js', 'class Client { send() { return this.transport() } }\nmodule.exports = Client\n')

    expect(diagnose().get(file) ?? []).toEqual([])
  })

  it('reports a hint, never an error, for a call to an action that does not exist', () => {
    const file = write('users.service.js', 'module.exports = {\n  name: "users",\n  actions: { go(ctx) { return ctx.call("mail.send") } }\n}\n')

    const diagnostics = diagnose().get(file) ?? []
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Hint)
    expect(diagnostics[0].code).toBe('genuinely-unresolved')
  })

  it('reports only a hint for host-specific implementations used by a shared mixin', () => {
    const mixin = write('shared.mixin.js', 'module.exports = { name: "shared", methods: { run() { return this.persist() } } }')
    for (const host of ['first', 'second']) {
      write(`${host}.service.js`, `const Shared = require("./shared.mixin")\nmodule.exports = { name: "${host}", mixins: [Shared], methods: { persist() {} } }`)
    }

    expect(diagnose().get(mixin)).toMatchObject([{ code: 'name-collision', severity: DiagnosticSeverity.Hint }])
  })
})
