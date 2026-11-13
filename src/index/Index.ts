import { appendTo } from '../collections.js'
import type { Location, Symbol, SymbolKind } from '../types.js'

export interface IndexStats {
  symbolCount: number
  referenceCount: number
}

export class Index {
  private readonly paths: string[] = []
  private readonly pathIds = new Map<string, number>()
  private readonly symbols = new Map<string, Symbol>()
  private readonly byFile = new Map<number, Symbol[]>()
  private readonly references = new Map<string, Location[]>()
  private allSymbolsCache: Symbol[] | null = null
  private byNameCache: Map<string, Symbol[]> | null = null

  fileId(filePath: string): number {
    const existing = this.pathIds.get(filePath)
    if (existing !== undefined) {
      return existing
    }
    const id = this.paths.length
    this.paths.push(filePath)
    this.pathIds.set(filePath, id)
    return id
  }

  filePath(fileId: number): string {
    return this.paths[fileId] ?? ''
  }

  insert(symbol: Symbol): boolean {
    const key = symbolKey(symbol.kind, symbol.fullName)
    if (this.symbols.has(key)) {
      return false
    }
    this.symbols.set(key, symbol)
    appendTo(this.byFile, symbol.fileId, symbol)
    this.allSymbolsCache = null
    this.byNameCache = null
    return true
  }

  clear(): void {
    this.symbols.clear()
    this.byFile.clear()
    this.references.clear()
    this.allSymbolsCache = null
    this.byNameCache = null
  }

  lookup(fullName: string, kind: SymbolKind): Symbol | undefined {
    return this.symbols.get(symbolKey(kind, fullName))
  }

  allSymbols(): Symbol[] {
    if (this.allSymbolsCache === null) {
      this.allSymbolsCache = Array.from(this.symbols.values())
    }
    return this.allSymbolsCache
  }

  named(name: string): Symbol[] {
    if (this.byNameCache === null) {
      this.byNameCache = new Map()
      for (const symbol of this.allSymbols()) {
        appendTo(this.byNameCache, symbol.name, symbol)
      }
    }
    return this.byNameCache.get(name) ?? []
  }

  symbolsByFile(fileId: number): Symbol[] {
    return this.byFile.get(fileId) ?? []
  }

  addReference(symbol: Symbol, location: Location): void {
    appendTo(this.references, symbolKey(symbol.kind, symbol.fullName), location)
  }

  referencesTo(symbol: Symbol): Location[] {
    return this.references.get(symbolKey(symbol.kind, symbol.fullName)) ?? []
  }

  stats(): IndexStats {
    let referenceCount = 0
    for (const locations of this.references.values()) {
      referenceCount += locations.length
    }
    return { symbolCount: this.symbols.size, referenceCount }
  }
}

function symbolKey(kind: SymbolKind, fullName: string): string {
  return `${kind} ${fullName}`
}
