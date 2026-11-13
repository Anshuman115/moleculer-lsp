import { appendTo } from '../collections.js'
import { Index } from '../index/Index.js'
import type { ScanResult } from '../scanner/scanner.js'
import { DropReason, ReferenceKind, SymbolKind, type DroppedReference, type MixinFailure, type Symbol } from '../types.js'
import { DiagnosticSeverity, spanRange, type Diagnostic } from './protocol.js'

const source = 'moleculer'

const referenceRules: Record<DropReason, { severity: DiagnosticSeverity; message: (name: string) => string }> = {
  [DropReason.NameCollision]: {
    severity: DiagnosticSeverity.Error,
    message: (name) => `"${name}" matches multiple services; target is ambiguous`,
  },
  [DropReason.EventNoListener]: {
    severity: DiagnosticSeverity.Hint,
    message: (name) => `No local listener found for event "${name}"`,
  },
  [DropReason.GenuinelyUnresolved]: {
    severity: DiagnosticSeverity.Hint,
    message: (name) => `"${name}" is not defined in this workspace`,
  },
}

export function diagnosticsByFile(index: Index, result: ScanResult): Map<string, Diagnostic[]> {
  const byFile = new Map<string, Diagnostic[]>()
  const add = (filePath: string, diagnostic: Diagnostic): void => appendTo(byFile, filePath, diagnostic)
  for (const failure of result.mixinFailures) {
    add(failure.filePath, mixinDiagnostic(failure))
  }
  for (const dropped of result.dropped) {
    add(index.filePath(dropped.location.fileId), referenceDiagnostic(dropped))
  }
  for (const [fileId, diagnostic] of collisionDiagnostics(index)) {
    add(index.filePath(fileId), diagnostic)
  }
  return byFile
}

function mixinDiagnostic(failure: MixinFailure): Diagnostic {
  return {
    range: spanRange(0, 0, 0),
    severity: DiagnosticSeverity.Error,
    source,
    code: 'broken-require-path',
    message: `Mixin "${failure.mixinName}" does not resolve to a file (require "${failure.requirePath}")`,
  }
}

function referenceDiagnostic(dropped: DroppedReference): Diagnostic {
  const { line, column, length } = dropped.location
  const rule = referenceRules[dropped.reason]
  const name = dropped.kind === ReferenceKind.Self ? `this.${dropped.target}` : dropped.target
  const severity = dropped.kind === ReferenceKind.Self && dropped.reason === DropReason.NameCollision ? DiagnosticSeverity.Hint : rule.severity
  return { range: spanRange(line, column, length), severity, source, code: dropped.reason, message: rule.message(name) }
}

function collisionDiagnostics(index: Index): Array<[number, Diagnostic]> {
  const declared = new Map<string, Symbol[]>()
  for (const symbol of index.allSymbols()) {
    if (symbol.kind === SymbolKind.Event && symbol.fileId === symbol.sourceFileId) {
      appendTo(declared, symbol.name, symbol)
    }
  }
  const results: Array<[number, Diagnostic]> = []
  for (const [name, sites] of declared) {
    const namespaces = new Set(sites.map((site) => site.namespace)).size
    if (namespaces < 2) {
      continue
    }
    for (const site of sites) {
      results.push([site.fileId, {
        range: spanRange(site.line, site.column, name.length),
        severity: DiagnosticSeverity.Error,
        source,
        code: DropReason.NameCollision,
        message: `Event "${name}" is declared in ${namespaces} services; emits cannot be resolved unambiguously`,
      }])
    }
  }
  return results
}
