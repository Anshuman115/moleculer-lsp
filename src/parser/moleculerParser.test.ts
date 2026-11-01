import { describe, expect, it } from 'vitest'
import { MoleculerParser } from './moleculerParser.js'
import { ReferenceKind, SymbolKind } from '../types.js'

const parser = new MoleculerParser()

describe('MoleculerParser', () => {
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
    const result = parser.parse('/svc/users.service.js', source)
    expect(result.isService).toBe(true)
    const byKind = (kind: SymbolKind): string[] =>
      result.symbols.filter((symbol) => symbol.kind === kind).map((symbol) => symbol.fullName)
    expect(byKind(SymbolKind.Action)).toEqual(['users.create', 'users.remove'])
    expect(byKind(SymbolKind.Event)).toEqual(['users.users.created'])
    expect(byKind(SymbolKind.Method)).toEqual(['users.hash'])
    expect(byKind(SymbolKind.Channel)).toEqual(['users.queue.job'])
  })

  it('applies the version prefix to the namespace', () => {
    const result = parser.parse('/svc/users.service.js', `
      module.exports = { name: "users", version: 2, actions: { create() {} } }
    `)
    expect(result.symbols[0]?.fullName).toBe('v2.users.create')
  })

  it('treats a name-less object export as a non-service file', () => {
    const result = parser.parse('/lib/config.js', 'module.exports = { host: "localhost", port: 1 }')
    expect(result.isService).toBe(false)
  })

  it('treats a plain class module as a non-service file and indexes its methods', () => {
    const result = parser.parse('/lib/client.js', `
      class Client {
        constructor() {}
        send() {}
      }
      module.exports = Client
    `)
    expect(result.isService).toBe(false)
    expect(result.symbols.map((symbol) => symbol.name)).toEqual(['send'])
  })

  it('captures broker calls, emits and broadcasts', () => {
    const result = parser.parse('/svc/users.service.js', `
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
    const kinds = result.references.map((reference) => [reference.fullName, reference.kind])
    expect(kinds).toContainEqual(['mail.send', ReferenceKind.Call])
    expect(kinds).toContainEqual(['users.created', ReferenceKind.Emit])
    expect(kinds).toContainEqual(['cache.clear', ReferenceKind.Broadcast])
  })

  it('captures this-method calls and skips framework properties', () => {
    const result = parser.parse('/svc/users.service.js', `
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
    const names = result.references.map((reference) => reference.fullName)
    expect(names).toContain('#self.hash')
    expect(names).not.toContain('#self.info')
  })

  it('captures string hook references', () => {
    const result = parser.parse('/svc/users.service.js', `
      module.exports = {
        name: "users",
        hooks: { before: { create: ["validate"] } },
        actions: { create() {} }
      }
    `)
    expect(result.references.map((reference) => reference.fullName)).toContain('#self.validate')
  })

  it('records mixin require paths', () => {
    const result = parser.parse('/svc/users.service.js', `
      const Base = require("./base.mixin");
      module.exports = { name: "users", mixins: [Base] }
    `)
    expect(result.mixins).toEqual([
      { mixinName: 'Base', requirePath: './base.mixin', sourceFile: '/svc/users.service.js' },
    ])
  })

  it('returns a Moleculer declaration outline for a service', () => {
    const result = parser.parse('/svc/users.service.js', `
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

    expect(result.outline?.name).toBe('users')
    expect(result.outline?.groups.map((group) => group.name)).toEqual([
      'mixins', 'actions', 'events', 'methods', 'channels', 'hooks',
    ])
    expect(result.outline?.groups.find((group) => group.name === 'actions')?.children.map((child) => child.name)).toEqual(['create'])
    expect(result.outline?.groups.find((group) => group.name === 'hooks')?.children.map((child) => child.name)).toEqual(['before'])
  })

  it('returns an empty result for unparseable sources', () => {
    const result = parser.parse('/svc/broken.js', 'module.exports = { name: "x", ')
    expect(result.symbols).toEqual([])
  })

  it('captures this.publish(...) as an emit-style reference', () => {
    const result = parser.parse('/svc/publisher.mixin.js', `
      module.exports = {
        methods: {
          notify(payload) {
            this.publish("user.addaccount", payload);
          }
        }
      }
    `)
    const kinds = result.references.map((reference) => [reference.fullName, reference.kind])
    expect(kinds).toContainEqual(['user.addaccount', ReferenceKind.Emit])
  })

  it('captures this.publish(this.settings.key, ...) only when the argument is a plain string', () => {
    const result = parser.parse('/svc/publisher.mixin.js', `
      module.exports = {
        settings: { system_event: "transactions.system" },
        methods: {
          notify(payload) {
            this.publish(this.settings.system_event, payload);
          }
        }
      }
    `)
    const names = result.references.map((reference) => reference.fullName)
    expect(names).not.toContain('transactions.system')
  })

  it('captures broker.sendToChannel(...) as a channel reference', () => {
    const result = parser.parse('/svc/gateway.service.js', `
      module.exports = {
        name: "gateway",
        actions: {
          run(ctx) {
            this.broker.sendToChannel("orders.created", ctx.params);
          }
        }
      }
    `)
    const kinds = result.references.map((reference) => [reference.fullName, reference.kind])
    expect(kinds).toContainEqual(['orders.created', ReferenceKind.Channel])
  })

  it('captures a single-quasi template literal channel name', () => {
    const result = parser.parse('/svc/gateway.service.js', `
      module.exports = {
        name: "gateway",
        actions: {
          run(ctx) {
            this.broker.sendToChannel(\`orders.created\`, ctx.params);
          }
        }
      }
    `)
    const kinds = result.references.map((reference) => [reference.fullName, reference.kind])
    expect(kinds).toContainEqual(['orders.created', ReferenceKind.Channel])
  })

  it('does not capture an interpolated template literal channel name', () => {
    const result = parser.parse('/svc/gateway.service.js', `
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
