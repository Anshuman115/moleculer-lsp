import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Index } from '../index/Index.js'
import { Scanner } from '../scanner/scanner.js'
import { Handlers } from './handlers.js'
import { SymbolKind } from './protocol.js'

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'mol-lsp-handler-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('Handlers documentSymbols', () => {
  it('returns a Moleculer outline with standard LSP kinds', () => {
    const filePath = path.join(root, 'users.service.js')
    fs.writeFileSync(filePath, `
      const Base = require("./base.mixin");
      module.exports = {
        name: "users",
        mixins: [Base],
        actions: { create() {} },
        events: { "users.created"() {} },
        methods: { validate() {} },
        channels: { "users.created.channel"() {} },
        hooks: { before: { create: ["validate"] } },
      }
    `)
    const index = new Index()
    const handlers = new Handlers(index, new Scanner(index))

    const result = handlers.documentSymbols({ textDocument: { uri: `file://${filePath}` } })

    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('users')
    expect(result[0]?.kind).toBe(SymbolKind.Object)
    expect(result[0]?.children?.map((symbol) => symbol.name)).toEqual([
      'mixins', 'actions', 'events', 'methods', 'channels', 'hooks',
    ])
    expect(result[0]?.children?.find((symbol) => symbol.name === 'actions')?.kind).toBe(SymbolKind.Namespace)
    expect(result[0]?.children?.find((symbol) => symbol.name === 'actions')?.children?.[0]).toMatchObject({
      name: 'create',
      kind: SymbolKind.Method,
    })
    expect(result[0]?.children?.find((symbol) => symbol.name === 'events')?.children?.[0]).toMatchObject({
      name: 'users.created',
      kind: SymbolKind.Event,
    })
    expect(result[0]?.children?.find((symbol) => symbol.name === 'hooks')?.children?.[0]).toMatchObject({
      name: 'before',
      kind: SymbolKind.Namespace,
    })
  })

  it('returns an empty outline for a plain JavaScript file', () => {
    const filePath = path.join(root, 'client.js')
    fs.writeFileSync(filePath, 'class Client { send() {} }')
    const index = new Index()
    const handlers = new Handlers(index, new Scanner(index))

    expect(handlers.documentSymbols({ textDocument: { uri: `file://${filePath}` } })).toEqual([])
  })
})

describe('Handlers definition', () => {
  it('resolves an emit inside a mixin shared by several services to the mixin listener', () => {
    const mixinPath = path.join(root, 'booking.mixin.js')
    fs.writeFileSync(mixinPath, [
      'module.exports = {',
      '  actions: { create(ctx) { ctx.emit("kyc.reconcile", {}) } },',
      '  events: { "kyc.reconcile"(ctx) {} },',
      '}',
    ].join('\n'))
    for (const name of ['api', 'dashboard']) {
      fs.writeFileSync(path.join(root, `${name}.service.js`), `const Booking = require("./booking.mixin"); module.exports = { name: "${name}", mixins: [Booking] }`)
    }
    const index = new Index()
    const scanner = new Scanner(index)
    scanner.scan(root)
    const handlers = new Handlers(index, scanner)
    const uri = `file://${mixinPath}`

    expect(handlers.definition({ textDocument: { uri }, position: { line: 1, character: 40 } })).toEqual({
      uri,
      range: { start: { line: 2, character: 12 }, end: { line: 2, character: 25 } },
    })
  })

  it('does not guess a chained this-call target from an unrelated service', () => {
    fs.writeFileSync(path.join(root, 'queue.service.js'), 'module.exports = { name: "queue", methods: { connect() {} } }')
    const callerPath = path.join(root, 'mail.service.js')
    fs.writeFileSync(callerPath, [
      'module.exports = {',
      '  name: "mail",',
      '  actions: { send() { return this.client.connect() } },',
      '}',
    ].join('\n'))
    const index = new Index()
    const scanner = new Scanner(index)
    scanner.scan(root)
    const handlers = new Handlers(index, scanner)

    expect(handlers.definition({ textDocument: { uri: `file://${callerPath}` }, position: { line: 2, character: 44 } })).toBeNull()
  })

  it('does not treat a plain function call statement as a definition site of an unrelated method', () => {
    fs.writeFileSync(path.join(root, 'queue.service.js'), 'module.exports = { name: "queue", methods: { init() {} } }')
    const callerPath = path.join(root, 'bootstrap.js')
    fs.writeFileSync(callerPath, 'const init = require("./init")\ninit(config)\n')
    const index = new Index()
    const scanner = new Scanner(index)
    scanner.scan(root)
    const handlers = new Handlers(index, scanner)

    expect(handlers.definition({ textDocument: { uri: `file://${callerPath}` }, position: { line: 1, character: 1 } })).toBeNull()
  })
})

describe('Handlers references', () => {
  it('returns nothing when no indexed reference exists, even when the declaration is requested', () => {
    const filePath = path.join(root, 'mail.service.js')
    fs.writeFileSync(filePath, 'module.exports = {\n  name: "mail",\n  methods: {\n    unused() {},\n  },\n}\n')
    const index = new Index()
    const scanner = new Scanner(index)
    scanner.scan(root)
    const handlers = new Handlers(index, scanner)

    expect(handlers.references({
      textDocument: { uri: `file://${filePath}` },
      position: { line: 3, character: 6 },
      context: { includeDeclaration: true },
    })).toEqual([])
  })
})
