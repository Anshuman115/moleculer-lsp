import { describe, expect, it } from 'vitest'
import { Index } from './Index.js'
import { SymbolKind, type Symbol } from '../types.js'

function symbol(fullName: string, fileId: number, name = fullName.split('.').pop() ?? ''): Symbol {
  return {
    name,
    fullName,
    namespace: fullName.split('.').slice(0, -1).join('.'),
    kind: SymbolKind.Action,
    fileId,
    sourceFileId: fileId,
    line: 0,
    column: 0,
  }
}

describe('Index', () => {
  it('inserts and looks up symbols', () => {
    const index = new Index()
    expect(index.insert(symbol('users.create', 1))).toBe(true)
    expect(index.lookup('users.create', SymbolKind.Action)?.fullName).toBe('users.create')
  })

  it('rejects duplicate full names', () => {
    const index = new Index()
    index.insert(symbol('users.create', 1))
    expect(index.insert(symbol('users.create', 2))).toBe(false)
  })

  it('refreshes the cached symbol list after insert', () => {
    const index = new Index()
    index.insert(symbol('users.create', 1))
    expect(index.allSymbols()).toHaveLength(1)
    index.insert(symbol('users.remove', 1))
    expect(index.allSymbols()).toHaveLength(2)
  })

  it('groups symbols by short name and refreshes the groups after insert', () => {
    const index = new Index()
    index.insert(symbol('users.create', 1))
    expect(index.named('create').map((entry) => entry.fullName)).toEqual(['users.create'])
    index.insert(symbol('orders.create', 2))
    expect(index.named('create').map((entry) => entry.fullName)).toEqual(['users.create', 'orders.create'])
    expect(index.named('missing')).toEqual([])
  })

  it('clears symbols and references on rescan but keeps file ids', () => {
    const index = new Index()
    const fileId = index.fileId('/a/users.service.js')
    const create = symbol('users.create', fileId)
    index.insert(create)
    index.addReference(create, { fileId, line: 3, column: 4, length: 6 })
    expect(index.referencesTo(create)).toHaveLength(1)

    index.clear()

    expect(index.lookup('users.create', SymbolKind.Action)).toBeUndefined()
    expect(index.named('create')).toEqual([])
    expect(index.referencesTo(create)).toEqual([])
    expect(index.fileId('/a/users.service.js')).toBe(fileId)
  })

  it('reuses ids for identical interned paths', () => {
    const index = new Index()
    expect(index.fileId('/a/b.js')).toBe(index.fileId('/a/b.js'))
    expect(index.filePath(index.fileId('/a/b.js'))).toBe('/a/b.js')
  })
})
