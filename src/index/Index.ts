import { InvertedIndex } from './InvertedIndex.js'
import { StringPool } from './StringPool.js'
import type { IndexStats, Location, Symbol } from '../types.js'

export class Index {
  private readonly pool = new StringPool()
  private readonly symbols = new Map<string, Symbol>()
  private readonly byFile = new Map<number, string[]>()
  private readonly refs = new InvertedIndex()
  private allSymbolsCache: Symbol[] | null = null

  strings(): StringPool {
    return this.pool
  }

  fileId(filePath: string): number {
    return this.pool.intern(filePath)
  }

  filePath(fileId: number): string {
    return this.pool.get(fileId)
  }

  insert(symbol: Symbol): boolean {
    if (symbol.fullName.length === 0 || this.symbols.has(symbol.fullName)) {
      return false
    }
    symbol.id = this.pool.intern(symbol.fullName)
    this.symbols.set(symbol.fullName, symbol)
    const names = this.byFile.get(symbol.fileId)
    if (names === undefined) {
      this.byFile.set(symbol.fileId, [symbol.fullName])
    } else {
      names.push(symbol.fullName)
    }
    this.allSymbolsCache = null
    return true
  }

  deleteByFile(fileId: number): void {
    for (const fullName of this.byFile.get(fileId) ?? []) {
      const symbol = this.symbols.get(fullName)
      if (symbol !== undefined) {
        this.refs.deleteAll(symbol.id)
      }
      this.symbols.delete(fullName)
    }
    this.byFile.delete(fileId)
    this.refs.deleteByFile(fileId)
    this.allSymbolsCache = null
  }

  clear(): void {
    this.symbols.clear()
    this.byFile.clear()
    this.refs.clear()
    this.allSymbolsCache = null
  }

  lookup(fullName: string): Symbol | undefined {
    return this.symbols.get(fullName)
  }

  has(fullName: string): boolean {
    return this.symbols.has(fullName)
  }

  allSymbols(): Symbol[] {
    if (this.allSymbolsCache === null) {
      this.allSymbolsCache = Array.from(this.symbols.values())
    }
    return this.allSymbolsCache
  }

  symbolsByFile(fileId: number): Symbol[] {
    const names = this.byFile.get(fileId) ?? []
    return names.flatMap((name) => {
      const symbol = this.symbols.get(name)
      return symbol === undefined ? [] : [symbol]
    })
  }

  fileIds(): number[] {
    return Array.from(this.byFile.keys())
  }

  addReference(fullName: string, location: Location): boolean {
    const symbol = this.symbols.get(fullName)
    if (symbol === undefined) {
      return false
    }
    this.refs.add(symbol.id, location)
    return true
  }

  referencesTo(fullName: string): Location[] {
    const symbol = this.symbols.get(fullName)
    return symbol === undefined ? [] : this.refs.lookup(symbol.id)
  }

  stats(): IndexStats {
    let referenceCount = 0
    for (const symbol of this.symbols.values()) {
      referenceCount += this.refs.count(symbol.id)
    }
    return { symbolCount: this.symbols.size, fileCount: this.byFile.size, referenceCount }
  }
}
