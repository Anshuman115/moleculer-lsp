import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Index } from '../index/Index.js'
import { collectFiles } from './files.js'
import { Scanner, type ScanResult } from './scanner.js'
import { DropReason, SymbolKind } from '../types.js'

let root: string

function write(relativePath: string, source: string): string {
  const fullPath = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, source)
  return fullPath
}

function scan(): { index: Index; scanner: Scanner; result: ScanResult } {
  const index = new Index()
  const scanner = new Scanner(index)
  return { index, scanner, result: scanner.scan(collectFiles(root)) }
}

function usesOf(index: Index, fullName: string, kind: SymbolKind): number {
  const symbol = index.lookup(fullName, kind)
  if (symbol === undefined) {
    throw new Error(`${fullName} is not indexed`)
  }
  return index.referencesTo(symbol).length
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'mol-lsp-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('Scanner', () => {
  it('indexes service symbols and resolves cross-service calls', () => {
    write('users.service.js', `
      module.exports = {
        name: "users",
        actions: { create(ctx) { return ctx.call("mail.send") } }
      }
    `)
    write('mail.service.js', 'module.exports = { name: "mail", actions: { send() {} } }')

    const { index, result } = scan()
    expect(index.lookup('mail.send', SymbolKind.Action)).toBeDefined()
    expect(usesOf(index, 'mail.send', SymbolKind.Action)).toBe(1)
    expect(result.dropped).toHaveLength(0)
  })

  it('resolves mixin methods transitively through a chain', () => {
    write('base.mixin.js', 'module.exports = { name: "base", methods: { shared() {} } }')
    write('middle.mixin.js', `
      const Base = require("./base.mixin");
      module.exports = { name: "middle", mixins: [Base], methods: { middleOnly() {} } }
    `)
    write('leaf.service.js', `
      const Middle = require("./middle.mixin");
      module.exports = {
        name: "leaf",
        mixins: [Middle],
        actions: { run() { return this.shared() } }
      }
    `)

    const { index, result } = scan()
    expect(index.lookup('leaf.shared', SymbolKind.Method)).toBeDefined()
    expect(index.lookup('middle.shared', SymbolKind.Method)).toBeDefined()
    expect(result.dropped).toHaveLength(0)
  })

  it('retries a mixin that starts empty but gains transitive symbols', () => {
    write('base.mixin.js', 'module.exports = { name: "base", methods: { shared() {} } }')
    write('middle.mixin.js', `
      const Base = require("./base.mixin");
      module.exports = { name: "middle", mixins: [Base] }
    `)
    write('leaf.service.js', `
      const Middle = require("./middle.mixin");
      module.exports = {
        name: "leaf",
        mixins: [Middle],
        actions: { run() { return this.shared() } }
      }
    `)

    const { index, result } = scan()
    expect(index.lookup('middle.shared', SymbolKind.Method)).toBeDefined()
    expect(index.lookup('leaf.shared', SymbolKind.Method)).toBeDefined()
    expect(result.dropped).toHaveLength(0)
  })

  it('keeps self-calls silent in non-service files', () => {
    write('client.js', `
      class Client {
        send() { return this.transport() }
        transport() {}
      }
      module.exports = Client
    `)

    const { result } = scan()
    expect(result.dropped).toHaveLength(0)
  })

  it('reports an unresolved self-call inside a named service', () => {
    write('users.service.js', `
      module.exports = {
        name: "users",
        actions: { run() { return this.missingHelper() } }
      }
    `)

    const { result } = scan()
    expect(result.dropped).toHaveLength(1)
    expect(result.dropped[0]?.reason).toBe(DropReason.GenuinelyUnresolved)
  })

  it('flags a broken local mixin require path', () => {
    write('users.service.js', `
      const Missing = require("./does-not-exist.mixin");
      module.exports = { name: "users", mixins: [Missing] }
    `)

    const { result } = scan()
    expect(result.mixinFailures).toEqual([
      { mixinName: 'Missing', requirePath: './does-not-exist.mixin', filePath: path.join(root, 'users.service.js') },
    ])
  })

  it('applies a mixin required by absolute path', () => {
    const basePath = write('base.mixin.js', 'module.exports = { methods: { shared() {} } }')
    write('users.service.js', `
      const Base = require(${JSON.stringify(basePath)});
      module.exports = { name: "users", mixins: [Base] }
    `)

    const { index, result } = scan()
    expect(result.mixinFailures).toEqual([])
    expect(index.lookup('users.shared', SymbolKind.Method)).toBeDefined()
  })

  it('resolves a self-call in a named mixin through a sibling mixin of its host', () => {
    write('base.mixin.js', 'module.exports = { methods: { siteCode() {} } }')
    write('parser.mixin.js', 'module.exports = { name: "parser", methods: { parse() { return this.siteCode() } } }')
    write('provider.service.js', `
      const Base = require("./base.mixin");
      const Parser = require("./parser.mixin");
      module.exports = { name: "provider", mixins: [Base, Parser] }
    `)

    const { result } = scan()
    expect(result.dropped).toEqual([])
  })

  it('ignores package mixins that are not local files', () => {
    write('api.service.js', `
      const ApiGateway = require("moleculer-web");
      module.exports = { name: "api", mixins: [ApiGateway] }
    `)

    const { result } = scan()
    expect(result.mixinFailures).toHaveLength(0)
  })

  it('routes an emit to the service that owns the event', () => {
    write('billing.service.js', `
      module.exports = {
        name: "billing",
        events: { "invoice.paid"() {} }
      }
    `)
    write('shop.service.js', `
      module.exports = {
        name: "shop",
        actions: { checkout(ctx) { return ctx.emit("invoice.paid") } }
      }
    `)

    const { index } = scan()
    expect(usesOf(index, 'billing.invoice.paid', SymbolKind.Event)).toBe(1)
  })

  it('reports a collision when a short event name matches unrelated services', () => {
    write('alpha.service.js', 'module.exports = { name: "alpha", events: { refresh() {} } }')
    write('beta.service.js', 'module.exports = { name: "beta", events: { refresh() {} } }')
    write('caller.service.js', `
      module.exports = {
        name: "caller",
        actions: { go(ctx) { return ctx.emit("refresh") } }
      }
    `)

    const { result } = scan()
    const collisions = result.dropped.filter((entry) => entry.reason === DropReason.NameCollision)
    expect(collisions).toHaveLength(1)
  })

  it('prefers the local listener over an unrelated same-named event', () => {
    write('alpha.service.js', `
      module.exports = {
        name: "alpha",
        events: { refresh() {} },
        actions: { go(ctx) { return ctx.emit("refresh") } }
      }
    `)
    write('beta.service.js', 'module.exports = { name: "beta", events: { refresh() {} } }')

    const { index, result } = scan()
    expect(result.dropped.filter((entry) => entry.reason === DropReason.NameCollision)).toHaveLength(0)
    expect(usesOf(index, 'alpha.refresh', SymbolKind.Event)).toBe(1)
    expect(usesOf(index, 'beta.refresh', SymbolKind.Event)).toBe(0)
  })

  it('marks an emit with no listener anywhere', () => {
    write('users.service.js', `
      module.exports = {
        name: "users",
        actions: { go(ctx) { return ctx.emit("nobody.listens") } }
      }
    `)

    const { result } = scan()
    expect(result.dropped[0]?.reason).toBe(DropReason.EventNoListener)
  })

  it('rebuilds cleanly on rescan without duplicating symbols', () => {
    write('users.service.js', 'module.exports = { name: "users", actions: { create() {} } }')
    const { index, scanner } = scan()
    const first = index.stats().symbolCount
    scanner.scan(collectFiles(root))
    expect(index.stats().symbolCount).toBe(first)
  })

  it('picks up a newly added service on rescan', () => {
    write('users.service.js', 'module.exports = { name: "users", actions: { create() {} } }')
    const { index, scanner } = scan()
    write('mail.service.js', 'module.exports = { name: "mail", actions: { send() {} } }')
    scanner.scan(collectFiles(root))
    expect(index.lookup('mail.send', SymbolKind.Action)).toBeDefined()
  })

  it('skips node_modules while collecting files', () => {
    write('users.service.js', 'module.exports = { name: "users", actions: { create() {} } }')
    write('node_modules/pkg/vendor.service.js', 'module.exports = { name: "vendor", actions: { hidden() {} } }')

    const { index } = scan()
    expect(index.lookup('vendor.hidden', SymbolKind.Action)).toBeUndefined()
  })

  it('keeps an action and a method of the same name apart', () => {
    write('users.service.js', `
      module.exports = {
        name: "users",
        actions: { audit(ctx) { return this.audit(ctx.params) } },
        methods: { audit(params) { return params } },
      }
    `)
    write('admin.service.js', 'module.exports = { name: "admin", actions: { run(ctx) { return ctx.call("users.audit") } } }')

    const { index } = scan()
    expect(usesOf(index, 'users.audit', SymbolKind.Action)).toBe(1)
    expect(usesOf(index, 'users.audit', SymbolKind.Method)).toBe(1)
  })

  it('skips a file that does not parse and indexes the rest', () => {
    write('broken.service.js', 'module.exports = { name: "broken", ')
    write('users.service.js', 'module.exports = { name: "users", actions: { create() {} } }')

    const { index, result } = scan()
    expect(result.fileCount).toBe(1)
    expect(index.lookup('users.create', SymbolKind.Action)).toBeDefined()
  })

  it('does not flag a collision when the same mixin event handler fans out to multiple services', () => {
    write('booking.mixin.js', `
      module.exports = {
        mixins: [],
        events: {
          async "insurance.process"(payload) { return payload },
        },
        methods: {
          run(ctx) {
            ctx.emit("insurance.process", ctx.params)
          },
        },
      }
    `)
    write('a-provider.service.js', `
      const BookingManager = require("./booking.mixin");
      module.exports = { name: "a-provider", mixins: [BookingManager] }
    `)
    write('b-provider.service.js', `
      const BookingManager = require("./booking.mixin");
      module.exports = { name: "b-provider", mixins: [BookingManager] }
    `)
    write('c-provider.service.js', `
      const BookingManager = require("./booking.mixin");
      module.exports = { name: "c-provider", mixins: [BookingManager] }
    `)

    const { result } = scan()
    const collisions = result.dropped.filter((entry) => entry.reason === DropReason.NameCollision)
    expect(collisions).toHaveLength(0)
  })

  it('does not flag a collision when a two-service mixin fan-out shares one event handler', () => {
    write('kycmanager.mixin.js', `
      module.exports = {
        events: {
          "kyc.updateBooking"(ctx) { return ctx.params },
        },
        methods: {
          notify(ctx) {
            this.broker.emit("kyc.updateBooking", ctx.params)
          },
        },
      }
    `)
    write('kycprovider.service.js', `
      const KycManager = require("./kycmanager.mixin");
      module.exports = { name: "kycprovider", version: 1, mixins: [KycManager] }
    `)
    write('inviteprovider.service.js', `
      const KycManager = require("./kycmanager.mixin");
      module.exports = { name: "dash_inviteprovider", mixins: [KycManager] }
    `)
    write('kyc.service.js', 'module.exports = { name: "kyc", actions: { ping() {} } }')

    const { result } = scan()
    const collisions = result.dropped.filter((entry) => entry.reason === DropReason.NameCollision)
    expect(collisions).toHaveLength(0)
  })

  it('recognizes this.publish(...) as an emit-style reference', () => {
    write('publisher.mixin.js', `
      module.exports = {
        methods: {
          notify(payload) {
            this.publish("user.addaccount", payload)
          },
        },
      }
    `)
    write('user-publisher.service.js', `
      const Publisher = require("./publisher.mixin");
      module.exports = { name: "user-publisher", mixins: [Publisher] }
    `)
    write('user-consumer.service.js', `
      module.exports = {
        name: "user-consumer",
        events: { "user.addaccount"(ctx) { return ctx.params } },
      }
    `)

    const { index } = scan()
    expect(usesOf(index, 'user-consumer.user.addaccount', SymbolKind.Event)).toBe(1)
  })

  it('recognizes broker.sendToChannel(...) as a channel reference', () => {
    write('gateway.service.js', `
      module.exports = {
        name: "gateway",
        actions: {
          run(ctx) {
            this.broker.sendToChannel("orders.created", ctx.params)
          },
        },
      }
    `)
    write('orders.service.js', `
      module.exports = {
        name: "orders",
        channels: { "orders.created"(ctx) { return ctx.params } },
      }
    `)

    const { index } = scan()
    expect(usesOf(index, 'orders.orders.created', SymbolKind.Channel)).toBe(1)
  })

  it('resolves broadcast(...) against event listeners', () => {
    write('cache.service.js', `
      module.exports = {
        name: "cache",
        actions: {
          run(ctx) {
            return ctx.broadcast("cache.cleared")
          },
        },
      }
    `)
    write('listener.service.js', `
      module.exports = {
        name: "listener",
        events: { "cache.cleared"(ctx) { return ctx.params } },
      }
    `)

    const { index, result } = scan()
    expect(usesOf(index, 'listener.cache.cleared', SymbolKind.Event)).toBe(1)
    expect(result.dropped).toHaveLength(0)
  })
})
