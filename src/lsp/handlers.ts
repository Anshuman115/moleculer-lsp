import { Index } from '../index/Index.js'
import { outline, type OutlineNode } from '../parser/outline.js'
import { Resolution } from '../scanner/resolution.js'
import { ReferenceKind, SymbolKind, type Location as IndexLocation, type Symbol } from '../types.js'
import { CursorKind, targetAt, type CursorTarget } from './cursor.js'
import { Documents } from './documents.js'
import { spanRange, SymbolKind as LspSymbolKind, type DocumentSymbol, type DocumentSymbolParams, type Location, type Range, type ReferenceParams, type TextDocumentPositionParams } from './protocol.js'
import { pathToUri, uriToPath } from './uri.js'

interface Cursor {
  target: CursorTarget
  fileId: number
  line: number
}

export class Handlers {
  constructor(
    private readonly index: Index,
    private readonly resolution: Resolution,
    private readonly documents: Documents,
  ) {}

  definition(params: TextDocumentPositionParams): Location | undefined {
    const cursor = this.cursorAt(params)
    if (cursor === undefined) {
      return undefined
    }
    const symbol = this.resolve(cursor)
    if (symbol !== undefined) {
      return this.symbolLocation(symbol)
    }
    return cursor.target.kind === CursorKind.ServiceSegment ? this.serviceLocation(cursor.target.value) : undefined
  }

  references(params: ReferenceParams): Location[] | undefined {
    const cursor = this.cursorAt(params)
    const symbol = cursor === undefined ? undefined : this.resolve(cursor)
    if (symbol === undefined) {
      return undefined
    }
    const locations = this.resolution.references(symbol)
    if (locations.length === 0) {
      return undefined
    }
    const result = locations.map((location) => this.toLocation(location))
    if (params.context?.includeDeclaration === true) {
      result.unshift(this.symbolLocation(symbol))
    }
    return result
  }

  documentSymbols(params: DocumentSymbolParams): DocumentSymbol[] | undefined {
    const filePath = uriToPath(params.textDocument.uri)
    const source = this.documents.text(filePath)
    const root = source === undefined ? undefined : outline(filePath, source)
    if (source === undefined || root === undefined) {
      return undefined
    }
    const end = endOf(source)
    const node = (name: string, kind: number, line: number, column: number, children: OutlineNode[]): DocumentSymbol => ({
      name,
      kind,
      range: { start: { line, character: column }, end },
      selectionRange: spanRange(line, column, name.length),
      children: children.map((child) => node(child.name, documentSymbolKind(child.kind), child.line, child.column, child.children)),
    })
    return [node(root.name, LspSymbolKind.Object, root.line, root.column, root.groups)]
  }

  private cursorAt(params: TextDocumentPositionParams): Cursor | undefined {
    const filePath = uriToPath(params.textDocument.uri)
    const source = this.documents.text(filePath)
    const { line, character } = params.position
    const target = source === undefined ? undefined : targetAt(source, line, character)
    return target === undefined ? undefined : { target, fileId: this.index.fileId(filePath), line }
  }

  private resolve({ target, fileId, line }: Cursor): Symbol | undefined {
    if (target.kind === CursorKind.Text || target.kind === CursorKind.ServiceSegment) {
      return this.resolution.resolveText(target.value, fileId)
    }
    if (target.kind === CursorKind.Declaration) {
      return this.declaredAt(fileId, line, target.value)
    }
    const resolved = this.resolution.resolve(ReferenceKind.Self, target.value, fileId)
    return 'symbol' in resolved ? resolved.symbol : undefined
  }

  private declaredAt(fileId: number, line: number, name: string): Symbol | undefined {
    return this.index.symbolsByFile(fileId)
      .find((symbol) => symbol.sourceFileId === fileId && symbol.line === line && symbol.name === name)
  }

  private serviceLocation(value: string): Location | undefined {
    const fileId = this.resolution.serviceFile(value.split('.').slice(0, -1).join('.'))
    return fileId === undefined ? undefined : { uri: pathToUri(this.index.filePath(fileId)), range: spanRange(0, 0, 0) }
  }

  private symbolLocation(symbol: Symbol): Location {
    return {
      uri: pathToUri(this.index.filePath(symbol.sourceFileId)),
      range: spanRange(symbol.line, symbol.column, symbol.name.length),
    }
  }

  private toLocation(location: IndexLocation): Location {
    return { uri: pathToUri(this.index.filePath(location.fileId)), range: spanRange(location.line, location.column, location.length) }
  }
}

function documentSymbolKind(kind: OutlineNode['kind']): number {
  if (kind === 'mixin') return LspSymbolKind.Module
  if (kind === 'group' || kind === 'hookPhase') return LspSymbolKind.Namespace
  if (kind === SymbolKind.Event || kind === SymbolKind.Channel) return LspSymbolKind.Event
  return LspSymbolKind.Method
}

function endOf(source: string): Range['end'] {
  const lines = source.split('\n')
  return { line: lines.length - 1, character: (lines[lines.length - 1] ?? '').length }
}
