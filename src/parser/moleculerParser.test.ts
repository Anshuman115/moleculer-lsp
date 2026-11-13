import { describe, expect, it } from 'vitest'
import { parse } from './moleculerParser.js'
import { outline } from './outline.js'
import { ReferenceKind, SymbolKind } from '../types.js'

describe('parse', () => {
  it('extracts actions, events, methods and channels', () => {
    const source = `
      module.exports = {
        name: "users",
        actions: { create() {}, remove() {} },
        events: { "users.created"() {} },
        methods: { hash() {} },
        channels: { "queue.job"() {} },
      }
    `
    const result = parse(source)
    expect(result.namespace).toBe('users')
    const byKind = (kind: SymbolKind): string[] =>
      result.declarations.filter((declaration) => declaration.kind === kind).map((declaration) => declaration.name)
    expect(byKind(SymbolKind.Action)).toEqual(['create', 'remove'])
    expect(byKind(SymbolKind.Event)).toEqual(['users.created'])
    expect(byKind(SymbolKind.Method)).toEqual(['hash'])
    expect(byKind(SymbolKind.Channel)).toEqual(['queue.job'])
  })

  it('applies the version prefix to the namespace', () => {
    const result = parse(`
      module.exports = { name: "users", version: 2, actions: { create() {} } }
    `)
    expect(result.namespace).toBe('v2.users')
  })

  it('treats a name-less object export as a non-service file', () => {
    const result = parse('module.exports = { host: "localhost", port: 1 }')
    expect(result.namespace).toBeUndefined()
  })

  it('treats a plain class module as a non-service file and indexes its methods', () => {
    const result = parse(`
      class Client {
        constructor() {}
        send() {}
      }
      module.exports = Client
    `)
    expect(result.namespace).toBeUndefined()
    expect(result.declarations.map((declaration) => declaration.name)).toEqual(['send'])
  })

  it('captures broker calls, emits and broadcasts', () => {
    const result = parse(`
      module.exports = {
        name: "users",
        actions: {
          async create(ctx) {
            await ctx.call("mail.send");
            ctx.emit("users.created");
            this.broker.broadcast("cache.clear");
          }
        }
      }
    `)
    const kinds = result.references.map((reference) => [reference.target, reference.kind])
    expect(kinds).toContainEqual(['mail.send', ReferenceKind.Action])
    expect(kinds).toContainEqual(['users.created', ReferenceKind.Event])
    expect(kinds).toContainEqual(['cache.clear', ReferenceKind.Event])
  })

  it('captures this-method calls and skips framework properties', () => {
    const result = parse(`
      module.exports = {
        name: "users",
        methods: {
          run() {
            this.hash();
            this.logger.info("skip");
            this.broker.call("other.action");
          }
        }
      }
    `)
    const self = result.references.filter((reference) => reference.kind === ReferenceKind.Self).map((reference) => reference.target)
    expect(self).toEqual(['hash'])
  })

  it('captures string hook references', () => {
    const result = parse(`
      module.exports = {
        name: "users",
        hooks: { before: { create: ["validate"] } },
        actions: { create() {} }
      }
    `)
    expect(result.references).toContainEqual({
      kind: ReferenceKind.Self,
      target: 'validate',
      span: { line: 3, column: 37, length: 'validate'.length },
    })
  })

  it('records mixin require paths', () => {
    const result = parse(`
      const Base = require("./base.mixin");
      module.exports = { name: "users", mixins: [Base] }
    `)
    expect(result.mixins).toEqual([
      { mixinName: 'Base', requirePath: './base.mixin' },
    ])
  })

  it('records mixins of a mixin that only combines other mixins', () => {
    const source = `
      const Base = require("./base.mixin")
      const Accio = require("./accio.mixin")
      module.exports = { mixins: [Base, Accio] }
    `
    const result = parse(source)
    expect(result.mixins.map((mixin) => mixin.requirePath)).toEqual(['./base.mixin', './accio.mixin'])
  })

  it('returns a Moleculer declaration outline for a service', () => {
    const result = outline('/svc/users.service.js', `
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

    expect(result?.name).toBe('users')
    expect(result?.groups.map((group) => group.name)).toEqual([
      'mixins', 'actions', 'events', 'methods', 'channels', 'hooks',
    ])
    expect(result?.groups.find((group) => group.name === 'actions')?.children.map((child) => child.name)).toEqual(['create'])
    expect(result?.groups.find((group) => group.name === 'hooks')?.children.map((child) => child.name)).toEqual(['before'])
  })

  it('throws for unparseable sources', () => {
    expect(() => parse('module.exports = { name: "x", ')).toThrow()
  })

  it('captures this.publish(...) as an emit-style reference', () => {
    const result = parse(`
      module.exports = {
        methods: {
          notify(payload) {
            this.publish("user.addaccount", payload);
          }
        }
      }
    `)
    const kinds = result.references.map((reference) => [reference.target, reference.kind])
    expect(kinds).toContainEqual(['user.addaccount', ReferenceKind.Event])
  })

  it('captures this.publish(this.settings.key, ...) only when the argument is a plain string', () => {
    const result = parse(`
      module.exports = {
        settings: { system_event: "transactions.system" },
        methods: {
          notify(payload) {
            this.publish(this.settings.system_event, payload);
          }
        }
      }
    `)
    const names = result.references.map((reference) => reference.target)
    expect(names).not.toContain('transactions.system')
  })

  it('captures broker.sendToChannel(...) as a channel reference', () => {
    const result = parse(`
      module.exports = {
        name: "gateway",
        actions: {
          run(ctx) {
            this.broker.sendToChannel("orders.created", ctx.params);
          }
        }
      }
    `)
    const kinds = result.references.map((reference) => [reference.target, reference.kind])
    expect(kinds).toContainEqual(['orders.created', ReferenceKind.Channel])
  })

  it('captures a single-quasi template literal channel name', () => {
    const result = parse(`
      module.exports = {
        name: "gateway",
        actions: {
          run(ctx) {
            this.broker.sendToChannel(\`orders.created\`, ctx.params);
          }
        }
      }
    `)
    const kinds = result.references.map((reference) => [reference.target, reference.kind])
    expect(kinds).toContainEqual(['orders.created', ReferenceKind.Channel])
  })

  it('does not capture an interpolated template literal channel name', () => {
    const result = parse(`
      module.exports = {
        name: "gateway",
        actions: {
          run(ctx) {
            this.broker.sendToChannel(\`test.\${ctx.params.queue}\`, ctx.params);
          }
        }
      }
    `)
    expect(result.references).toHaveLength(0)
  })
})
