import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Index } from '../index/Index.js'
import { Scanner } from './scanner.js'
import { DropReason, SymbolKind } from '../types.js'

let root: string

function write(relativePath: string, source: string): string {
  const fullPath = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, source)
  return fullPath
}

function scan(): { index: Index; scanner: Scanner; result: ReturnType<Scanner['scan']> } {
  const index = new Index()
  const scanner = new Scanner(index)
  return { index, scanner, result: scanner.scan(root) }
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
    expect(index.lookup('mail.send')).toBeDefined()
    expect(index.referencesTo('mail.send')).toHaveLength(1)
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
    expect(index.lookup('leaf.shared')).toBeDefined()
    expect(index.lookup('middle.shared')).toBeDefined()
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
    expect(index.lookup('middle.shared')).toBeDefined()
    expect(index.lookup('leaf.shared')).toBeDefined()
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
    expect(result.mixinFailures).toHaveLength(1)
    expect(result.mixinFailures[0]?.reason).toBe(DropReason.BrokenRequirePath)
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
    expect(index.referencesTo('billing.invoice.paid')).toHaveLength(1)
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
    expect(index.referencesTo('alpha.refresh')).toHaveLength(1)
    expect(index.referencesTo('beta.refresh')).toHaveLength(0)
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
    scanner.scan(root)
    expect(index.stats().symbolCount).toBe(first)
  })

  it('picks up a newly added service on rescan', () => {
    write('users.service.js', 'module.exports = { name: "users", actions: { create() {} } }')
    const { index, scanner } = scan()
    write('mail.service.js', 'module.exports = { name: "mail", actions: { send() {} } }')
    scanner.scan(root)
    expect(index.lookup('mail.send')).toBeDefined()
  })

  it('skips node_modules while collecting files', () => {
    write('users.service.js', 'module.exports = { name: "users", actions: { create() {} } }')
    write('node_modules/pkg/vendor.service.js', 'module.exports = { name: "vendor", actions: { hidden() {} } }')

    const { index } = scan()
    expect(index.lookup('vendor.hidden')).toBeUndefined()
  })

  it('records event symbols with the event kind', () => {
    write('billing.service.js', 'module.exports = { name: "billing", events: { "invoice.paid"() {} } }')
    const { index } = scan()
    expect(index.lookup('billing.invoice.paid')?.kind).toBe(SymbolKind.Event)
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
    expect(index.referencesTo('user-consumer.user.addaccount')).toHaveLength(1)
  })

  it('recognizes broker.sendToChannel(...) as a broadcast-style reference', () => {
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
    expect(index.referencesTo('orders.orders.created')).toHaveLength(1)
  })
})
