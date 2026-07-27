import { describe, expect, it } from 'vitest'
import { Index } from './Index.js'
import { SymbolKind, type Symbol } from '../types.js'

function symbol(fullName: string, fileId: number, name = fullName.split('.').pop() ?? ''): Symbol {
  return {
    id: 0,
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
    expect(index.lookup('users.create')?.fullName).toBe('users.create')
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

  it('refreshes the cached symbol list after deleteByFile', () => {
    const index = new Index()
    index.insert(symbol('users.create', 1))
    index.insert(symbol('orders.create', 2))
    expect(index.allSymbols()).toHaveLength(2)
    index.deleteByFile(1)
    expect(index.allSymbols()).toHaveLength(1)
    expect(index.lookup('users.create')).toBeUndefined()
  })

  it('drops references originating from a deleted file', () => {
    const index = new Index()
    index.insert(symbol('users.create', 1))
    index.addReference('users.create', { fileId: 2, line: 5, column: 3 })
    expect(index.referencesTo('users.create')).toHaveLength(1)
    index.deleteByFile(2)
    expect(index.referencesTo('users.create')).toHaveLength(0)
  })

  it('reports references only for known symbols', () => {
    const index = new Index()
    expect(index.addReference('missing.action', { fileId: 1, line: 0, column: 0 })).toBe(false)
  })

  it('reuses ids for identical interned paths', () => {
    const index = new Index()
    expect(index.fileId('/a/b.js')).toBe(index.fileId('/a/b.js'))
    expect(index.filePath(index.fileId('/a/b.js'))).toBe('/a/b.js')
  })
})
