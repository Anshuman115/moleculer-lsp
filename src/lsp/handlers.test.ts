import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Index } from '../index/Index.js'
import { collectFiles } from '../scanner/files.js'
import { Scanner } from '../scanner/scanner.js'
import { Documents } from './documents.js'
import { Handlers } from './handlers.js'
import { SymbolKind } from './protocol.js'

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'mol-lsp-handler-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

function indexed(): Handlers {
  const index = new Index()
  const scanner = new Scanner(index)
  scanner.scan(collectFiles(root))
  return new Handlers(index, scanner.resolution, new Documents())
}

function lineOf(lines: string[], needle: string): { line: number; character: number } {
  const line = lines.findIndex((text) => text.includes(needle))
  return { line, character: (lines[line] ?? '').indexOf(needle) + 1 }
}

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
    const handlers = indexed()

    const result = handlers.documentSymbols({ textDocument: { uri: `file://${filePath}` } })

    expect(result).toHaveLength(1)
    expect(result?.[0]?.name).toBe('users')
    expect(result?.[0]?.kind).toBe(SymbolKind.Object)
    expect(result?.[0]?.children?.map((symbol) => symbol.name)).toEqual([
      'mixins', 'actions', 'events', 'methods', 'channels', 'hooks',
    ])
    expect(result?.[0]?.children?.find((symbol) => symbol.name === 'actions')?.kind).toBe(SymbolKind.Namespace)
    expect(result?.[0]?.children?.find((symbol) => symbol.name === 'actions')?.children?.[0]).toMatchObject({
      name: 'create',
      kind: SymbolKind.Method,
    })
    expect(result?.[0]?.children?.find((symbol) => symbol.name === 'events')?.children?.[0]).toMatchObject({
      name: 'users.created',
      kind: SymbolKind.Event,
    })
    expect(result?.[0]?.children?.find((symbol) => symbol.name === 'hooks')?.children?.[0]).toMatchObject({
      name: 'before',
      kind: SymbolKind.Namespace,
    })
  })

  it('returns an empty outline for a plain JavaScript file', () => {
    const filePath = path.join(root, 'client.js')
    fs.writeFileSync(filePath, 'class Client { send() {} }')
    const handlers = indexed()

    expect(handlers.documentSymbols({ textDocument: { uri: `file://${filePath}` } })).toBeUndefined()
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
    const handlers = indexed()
    const uri = `file://${mixinPath}`

    expect(handlers.definition({ textDocument: { uri }, position: { line: 1, character: 40 } })).toEqual({
      uri,
      range: { start: { line: 2, character: 13 }, end: { line: 2, character: 26 } },
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
    const handlers = indexed()

    expect(handlers.definition({ textDocument: { uri: `file://${callerPath}` }, position: { line: 2, character: 44 } })).toBeUndefined()
  })

  it('does not resolve a plain function call to a same-named method of an unrelated service', () => {
    fs.writeFileSync(path.join(root, 'queue.service.js'), 'module.exports = { name: "queue", methods: { init() {} } }')
    const callerPath = path.join(root, 'bootstrap.js')
    fs.writeFileSync(callerPath, 'const init = require("./init")\ninit(config)\n')
    const handlers = indexed()

    expect(handlers.definition({ textDocument: { uri: `file://${callerPath}` }, position: { line: 1, character: 1 } })).toBeUndefined()
  })
})

describe('Handlers declarations', () => {
  it('keeps an action key on its own action when a method shares the name', () => {
    const lines = [
      'module.exports = {',
      '  name: "users",',
      '  actions: {',
      '    audit(ctx) {',
      '      return this.audit(ctx.params)',
      '    },',
      '  },',
      '  methods: {',
      '    audit(params) { return params },',
      '  },',
      '}',
    ]
    const filePath = path.join(root, 'users.service.js')
    fs.writeFileSync(filePath, lines.join('\n'))
    const handlers = indexed()
    const uri = `file://${filePath}`

    expect(handlers.definition({ textDocument: { uri }, position: lineOf(lines, 'audit(ctx)') })?.range.start.line).toBe(3)
    expect(handlers.definition({ textDocument: { uri }, position: lineOf(lines, 'audit(ctx.params)') })?.range.start.line).toBe(8)
  })

  it('does not resolve a bare call to a method declared in the same service', () => {
    const lines = [
      'module.exports = {',
      '  name: "boot",',
      '  methods: {',
      '    init(config) { return config },',
      '    start(config) {',
      '      init(config)',
      '      return this.init(config)',
      '    },',
      '  },',
      '}',
    ]
    const filePath = path.join(root, 'boot.service.js')
    fs.writeFileSync(filePath, lines.join('\n'))
    const handlers = indexed()
    const uri = `file://${filePath}`
    const bare = lineOf(lines, '      init(config)')
    const position = { line: bare.line, character: 8 }

    expect(handlers.definition({ textDocument: { uri }, position })).toBeUndefined()
    expect(handlers.references({ textDocument: { uri }, position })).toBeUndefined()
    const thisCall = { line: bare.line + 1, character: (lines[bare.line + 1] ?? '').indexOf('init') + 1 }

    expect(handlers.definition({ textDocument: { uri }, position: thisCall })?.range.start.line).toBe(3)
  })
})

describe('Handlers sibling mixins', () => {
  it('resolves a method from another mixin of the same service', () => {
    fs.writeFileSync(path.join(root, 'base.mixin.js'), 'module.exports = { methods: { siteCode() {} } }')
    const callerPath = path.join(root, 'accio.mixin.js')
    const line = 'module.exports = { methods: { sync() { return this.siteCode() } } }'
    fs.writeFileSync(callerPath, line)
    fs.writeFileSync(path.join(root, 'addons.mixin.js'), 'const Base = require("./base.mixin")\nconst Accio = require("./accio.mixin")\nmodule.exports = { mixins: [Base, Accio] }')
    fs.writeFileSync(path.join(root, 'provider.service.js'), 'const Addons = require("./addons.mixin")\nmodule.exports = { name: "provider", mixins: [Addons] }')
    fs.writeFileSync(path.join(root, 'second.service.js'), 'const Addons = require("./addons.mixin")\nmodule.exports = { name: "second", mixins: [Addons] }')
    fs.writeFileSync(path.join(root, 'other.service.js'), 'module.exports = { name: "other", methods: { siteCode() {} } }')
    const handlers = indexed()

    expect(handlers.definition({ textDocument: { uri: `file://${callerPath}` }, position: { line: 0, character: line.indexOf('siteCode') + 2 } })).toEqual({
      uri: `file://${path.join(root, 'base.mixin.js')}`,
      range: { start: { line: 0, character: 30 }, end: { line: 0, character: 38 } },
    })
  })

  it.each([undefined, 'shared'])('does not guess a host-specific method from a shared mixin named %s', (name) => {
    const callerPath = path.join(root, 'shared.mixin.js')
    const namespace = name === undefined ? '' : `name: "${name}",`
    const line = `module.exports = { ${namespace} methods: { run() { return this.persist() } } }`
    fs.writeFileSync(callerPath, line)
    for (const host of ['first', 'second']) {
      fs.writeFileSync(path.join(root, `${host}.service.js`), `const Shared = require("./shared.mixin")\nmodule.exports = { name: "${host}", mixins: [Shared], methods: { persist() {} } }`)
    }
    const handlers = indexed()

    expect(handlers.definition({ textDocument: { uri: `file://${callerPath}` }, position: { line: 0, character: line.indexOf('persist') + 2 } })).toBeUndefined()
    for (const host of ['first', 'second']) {
      const filePath = path.join(root, `${host}.service.js`)
      const declaration = fs.readFileSync(filePath, 'utf8').split('\n')[1]!
      expect(handlers.references({ textDocument: { uri: `file://${filePath}` }, position: { line: 1, character: declaration.indexOf('persist') + 2 }, context: { includeDeclaration: false } })).toBeUndefined()
    }
  })
})

describe('Handlers action strings', () => {
  it('resolves a channel name to the channel handler', () => {
    const orders = ['module.exports = {', '  name: "orders",', '  channels: { "orders.created"(payload) {} },', '}']
    fs.writeFileSync(path.join(root, 'orders.service.js'), orders.join('\n'))
    const callerPath = path.join(root, 'gateway.service.js')
    const line = 'module.exports = { name: "gateway", actions: { run(ctx) { return this.broker.sendToChannel("orders.created", {}) } } }'
    fs.writeFileSync(callerPath, line)
    const handlers = indexed()

    const column = (orders[2] ?? '').indexOf('orders.created')

    expect(handlers.definition({ textDocument: { uri: `file://${callerPath}` }, position: { line: 0, character: line.indexOf('created') } })).toEqual({
      uri: `file://${path.join(root, 'orders.service.js')}`,
      range: { start: { line: 2, character: column }, end: { line: 2, character: column + 'orders.created'.length } },
    })
  })

  it('does not guess an unknown action from a same-named action in an unrelated service', () => {
    fs.writeFileSync(path.join(root, 'orders.service.js'), 'module.exports = { name: "orders", actions: { create(ctx) { return 1 } } }')
    const callerPath = path.join(root, 'billing.service.js')
    const line = 'module.exports = { name: "billing", actions: { run(ctx) { return ctx.call("ghost.create") } } }'
    fs.writeFileSync(callerPath, line)
    const handlers = indexed()

    expect(handlers.definition({ textDocument: { uri: `file://${callerPath}` }, position: { line: 0, character: line.indexOf('create') + 2 } })).toBeUndefined()
  })
})

describe('Handlers references', () => {
  it('returns nothing when no indexed reference exists, even when the declaration is requested', () => {
    const filePath = path.join(root, 'mail.service.js')
    fs.writeFileSync(filePath, 'module.exports = {\n  name: "mail",\n  methods: {\n    unused() {},\n  },\n}\n')
    const handlers = indexed()

    expect(handlers.references({
      textDocument: { uri: `file://${filePath}` },
      position: { line: 3, character: 6 },
      context: { includeDeclaration: true },
    })).toBeUndefined()
  })

  it('includes calls made inside the mixin that declares the method', () => {
    const mixin = [
      'module.exports = {',
      '  methods: {',
      '    audit() {},',
      '    run() { return this.audit() },',
      '  },',
      '}',
    ]
    const mixinPath = path.join(root, 'audit.mixin.js')
    fs.writeFileSync(mixinPath, mixin.join('\n'))
    fs.writeFileSync(path.join(root, 'api.service.js'), 'const Audit = require("./audit.mixin")\nmodule.exports = { name: "api", mixins: [Audit] }')
    const handlers = indexed()

    const references = handlers.references({ textDocument: { uri: `file://${mixinPath}` }, position: lineOf(mixin, 'audit()') })

    expect(references?.map((location) => [location.uri, location.range.start.line])).toEqual([[`file://${mixinPath}`, 3]])
  })

  it('leaves out calls that reach a service override instead of the mixin method', () => {
    const mixin = ['module.exports = {', '  methods: { audit() {} },', '}']
    const mixinPath = path.join(root, 'audit.mixin.js')
    fs.writeFileSync(mixinPath, mixin.join('\n'))
    fs.writeFileSync(path.join(root, 'api.service.js'), [
      'const Audit = require("./audit.mixin")',
      'module.exports = { name: "api", mixins: [Audit], methods: { audit() {}, run() { return this.audit() } } }',
    ].join('\n'))
    const handlers = indexed()

    expect(handlers.references({ textDocument: { uri: `file://${mixinPath}` }, position: lineOf(mixin, 'audit') })).toBeUndefined()
  })
})
