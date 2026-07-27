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
