import { Index } from '../index/Index.js'
import { isSelfRef, selfMethod } from '../parser/moleculerParser.js'
import { Scanner } from '../scanner/scanner.js'
import { DropReason, SymbolKind, type DroppedReference, type MixinFailure } from '../types.js'
import { DiagnosticSeverity, type Diagnostic } from './protocol.js'

const source = 'moleculer'

export function diagnosticsByFile(index: Index, scanner: Scanner): Map<number, Diagnostic[]> {
  const byFile = new Map<number, Diagnostic[]>()
  const add = (fileId: number, diagnostic: Diagnostic): void => {
    const existing = byFile.get(fileId)
    if (existing === undefined) {
      byFile.set(fileId, [diagnostic])
      return
    }
    existing.push(diagnostic)
  }

  const result = scanner.result()
  for (const failure of result.mixinFailures) {
    add(index.fileId(failure.sourceFile), mixinDiagnostic(failure))
  }
  for (const dropped of result.dropped) {
    const diagnostic = referenceDiagnostic(dropped)
    if (diagnostic !== undefined) {
      add(dropped.location.fileId, diagnostic)
    }
  }
  for (const [fileId, diagnostic] of collisionDiagnostics(index)) {
    add(fileId, diagnostic)
  }
  return byFile
}

function mixinDiagnostic(failure: MixinFailure): Diagnostic {
  const message = failure.reason === DropReason.BrokenRequirePath
    ? `Mixin "${failure.mixinName}" does not resolve to a file${failure.requirePath.length > 0 ? ` (require "${failure.requirePath}")` : ''}`
    : `Mixin "${failure.mixinName}" cannot be applied: service has no resolvable name`
  return {
    range: zeroRange(),
    severity: DiagnosticSeverity.Error,
    source,
    code: failure.reason,
    message,
  }
}

function referenceDiagnostic(dropped: DroppedReference): Diagnostic | undefined {
  const range = referenceRange(dropped)
  if (dropped.reason === DropReason.NameCollision) {
    return {
      range,
      severity: DiagnosticSeverity.Error,
      source,
      code: dropped.reason,
      message: `"${displayName(dropped.fullName)}" matches multiple services; target is ambiguous`,
    }
  }
  if (dropped.reason === DropReason.EventNoListener) {
    return {
      range,
      severity: DiagnosticSeverity.Hint,
      source,
      code: dropped.reason,
      message: `No local listener found for event "${dropped.fullName}"`,
    }
  }
  if (dropped.reason === DropReason.GenuinelyUnresolved) {
    return {
      range,
      severity: DiagnosticSeverity.Hint,
      source,
      code: dropped.reason,
      message: `"${displayName(dropped.fullName)}" is not defined in this workspace`,
    }
  }
  return undefined
}

interface EventSite {
  fileId: number
  line: number
  column: number
  namespace: string
  length: number
}

function collisionDiagnostics(index: Index): Array<[number, Diagnostic]> {
  const buckets = new Map<string, EventSite[]>()

  for (const symbol of index.allSymbols()) {
    if (symbol.kind !== SymbolKind.Event || symbol.fileId !== symbol.sourceFileId) {
      continue
    }
    const bucket = buckets.get(symbol.name) ?? []
    bucket.push({
      fileId: symbol.fileId,
      line: symbol.line,
      column: symbol.column,
      namespace: symbol.namespace,
      length: symbol.name.length,
    })
    buckets.set(symbol.name, bucket)
  }

  const results: Array<[number, Diagnostic]> = []
  for (const [name, bucket] of buckets) {
    const namespaces = new Set(bucket.map((entry) => entry.namespace))
    if (namespaces.size < 2) {
      continue
    }
    for (const entry of bucket) {
      results.push([entry.fileId, {
        range: pointRange(entry.line, entry.column, entry.length),
        severity: DiagnosticSeverity.Error,
        source,
        code: DropReason.NameCollision,
        message: `Event "${name}" is declared in ${namespaces.size} services; emits cannot be resolved unambiguously`,
      }])
    }
  }
  return results
}

function referenceRange(dropped: DroppedReference): Diagnostic['range'] {
  if (isSelfRef(dropped.fullName)) {
    return pointRange(dropped.location.line, dropped.location.column, selfMethod(dropped.fullName).length)
  }
  return pointRange(dropped.location.line, dropped.location.column + 1, dropped.fullName.length)
}

function displayName(fullName: string): string {
  return isSelfRef(fullName) ? `this.${selfMethod(fullName)}` : fullName
}

function pointRange(line: number, column: number, length: number): Diagnostic['range'] {
  return {
    start: { line, character: column },
    end: { line, character: column + Math.max(length, 1) },
  }
}

function zeroRange(): Diagnostic['range'] {
  return { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
}
