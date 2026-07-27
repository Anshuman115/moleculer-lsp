import fs from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Index } from '../index/Index.js'
import { Scanner } from '../scanner/scanner.js'
import { SymbolKind, type Location as IndexLocation, type Symbol } from '../types.js'
import { CursorKind, detect } from './cursor.js'
import type { Location, Position, ReferenceParams, TextDocumentPositionParams } from './protocol.js'

export class Handlers {
  private readonly documents = new Map<string, string>()

  constructor(private readonly index: Index, private readonly scanner: Scanner) {}

  openDocument(uri: string, text: string): void {
    this.documents.set(uri, text)
  }

  closeDocument(uri: string): void {
    this.documents.delete(uri)
  }

  definition(params: TextDocumentPositionParams): Location | null {
    const target = this.resolveAt(params)
    if (target === undefined) {
      return null
    }
    if (target.kind === CursorKind.ServiceName) {
      return this.serviceLocation(target.fullName)
    }
    return this.symbolLocation(target.symbol)
  }

  references(params: ReferenceParams): Location[] {
    const target = this.resolveAt(params)
    if (target === undefined || target.kind === CursorKind.ServiceName) {
      return []
    }
    const locations = this.referencesFor(target.symbol, uriToPath(params.textDocument.uri))
    const result = locations.map((location) => this.toLocation(location))
    if (params.context?.includeDeclaration === true) {
      result.unshift(this.symbolLocation(target.symbol))
    }
    return result
  }

  private referencesFor(symbol: Symbol, callerPath: string): IndexLocation[] {
    const callerFileId = this.index.fileId(callerPath)
    const locations = [...this.index.referencesTo(symbol.fullName)]
    for (const candidate of this.index.allSymbols()) {
      if (candidate.fullName === symbol.fullName || candidate.name !== symbol.name) {
        continue
      }
      if (!this.sharesOrigin(symbol, candidate) && !this.scanner.isRelated(callerFileId, symbol.namespace, candidate)) {
        continue
      }
      locations.push(...this.index.referencesTo(candidate.fullName))
    }
    return dedupe(locations)
  }

  private sharesOrigin(symbol: Symbol, candidate: Symbol): boolean {
    return symbol.sourceFileId !== 0 && symbol.sourceFileId === candidate.sourceFileId
  }

  private resolveAt(params: TextDocumentPositionParams): ResolvedTarget | undefined {
    const filePath = uriToPath(params.textDocument.uri)
    const source = this.sourceFor(params.textDocument.uri, filePath)
    if (source === undefined) {
      return undefined
    }
    const fileId = this.index.fileId(filePath)
    const namespace = this.scanner.namespaceOf(fileId)
    const context = detect(source, params.position.line, params.position.character, namespace)
    if (context.kind === CursorKind.Unknown) {
      return undefined
    }

    if (context.rawString !== undefined) {
      const event = this.findEvent(context.rawString, fileId, namespace)
      if (event !== undefined) {
        return { kind: context.kind, fullName: event.fullName, symbol: event }
      }
    }

    const direct = this.index.lookup(context.fullName)
    if (direct !== undefined) {
      return { kind: context.kind, fullName: context.fullName, symbol: direct }
    }

    if (context.kind === CursorKind.ServiceName) {
      return { kind: context.kind, fullName: context.fullName, symbol: placeholder(context.fullName) }
    }

    const symbol = this.findByShortName(shortName(context.fullName), fileId, namespace)
    return symbol === undefined ? undefined : { kind: context.kind, fullName: context.fullName, symbol }
  }

  private findEvent(name: string, fileId: number, namespace: string): Symbol | undefined {
    const matches = this.index.allSymbols().filter(
      (symbol) => symbol.kind === SymbolKind.Event && symbol.name === name,
    )
    if (matches.length <= 1) {
      return matches[0]
    }
    const related = matches.filter((symbol) => this.scanner.isRelated(fileId, namespace, symbol))
    return related.length === 1 ? related[0] : undefined
  }

  private findByShortName(name: string, fileId: number, namespace: string): Symbol | undefined {
    const matches = this.index.allSymbols().filter((symbol) => symbol.name === name)
    if (matches.length <= 1) {
      return matches[0]
    }
    const related = matches.filter((symbol) => this.scanner.isRelated(fileId, namespace, symbol))
    if (related.length === 1) {
      return related[0]
    }
    if (related.length > 1) {
      return related.find((symbol) => symbol.fileId === symbol.sourceFileId) ?? related[0]
    }
    return undefined
  }

  private sourceFor(uri: string, filePath: string): string | undefined {
    const cached = this.documents.get(uri)
    if (cached !== undefined) {
      return cached
    }
    try {
      return fs.readFileSync(filePath, 'utf8')
    } catch {
      return undefined
    }
  }

  private serviceLocation(fullName: string): Location | null {
    const namespace = fullName.split('.').slice(0, -1).join('.')
    if (namespace.length === 0) {
      return null
    }
    for (const symbol of this.index.allSymbols()) {
      if (symbol.namespace === namespace && symbol.fileId === symbol.sourceFileId) {
        return { uri: pathToUri(this.index.filePath(symbol.fileId)), range: zeroRange() }
      }
    }
    return null
  }

  private symbolLocation(symbol: Symbol): Location {
    const fileId = symbol.sourceFileId === 0 ? symbol.fileId : symbol.sourceFileId
    return {
      uri: pathToUri(this.index.filePath(fileId)),
      range: {
        start: { line: symbol.line, character: symbol.column },
        end: { line: symbol.line, character: symbol.column + symbol.name.length },
      },
    }
  }

  private toLocation(location: IndexLocation): Location {
    const start = { line: location.line, character: location.column }
    return { uri: pathToUri(this.index.filePath(location.fileId)), range: { start, end: start } }
  }
}

interface ResolvedTarget {
  kind: CursorKind
  fullName: string
  symbol: Symbol
}

export function uriToPath(uri: string): string {
  return uri.startsWith('file:') ? fileURLToPath(uri) : uri
}

function pathToUri(filePath: string): string {
  return pathToFileURL(filePath).toString()
}

function shortName(fullName: string): string {
  const dot = fullName.lastIndexOf('.')
  return dot < 0 ? fullName : fullName.slice(dot + 1)
}

function dedupe(locations: IndexLocation[]): IndexLocation[] {
  const seen = new Set<string>()
  return locations.filter((location) => {
    const key = `${location.fileId}:${location.line}:${location.column}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function zeroRange(): { start: Position; end: Position } {
  return { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
}

function placeholder(fullName: string): Symbol {
  return {
    id: 0,
    name: shortName(fullName),
    fullName,
    namespace: '',
    kind: SymbolKind.Action,
    fileId: 0,
    sourceFileId: 0,
    line: 0,
    column: 0,
  }
}
