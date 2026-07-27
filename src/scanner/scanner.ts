import fs from 'node:fs'
import path from 'node:path'
import { Index } from '../index/Index.js'
import { isFileNamespace, isSelfRef, MoleculerParser, selfMethod } from '../parser/moleculerParser.js'
import {
  DropReason,
  ReferenceKind,
  SymbolKind,
  type DroppedReference,
  type Location,
  type MixinFailure,
  type MixinRequest,
  type Reference,
  type Symbol,
} from '../types.js'

const skipDirs = new Set(['node_modules', '.git', '.vscode', 'dist', 'build', 'coverage', '.next', 'out'])

interface FileRecord {
  filePath: string
  fileId: number
  namespace: string
  isService: boolean
  references: Reference[]
  mixins: MixinRequest[]
}

export interface ScanResult {
  dropped: DroppedReference[]
  mixinFailures: MixinFailure[]
  fileCount: number
}

export class Scanner {
  private readonly parser = new MoleculerParser()
  private readonly namespaces = new Map<number, string>()
  private readonly serviceFiles = new Set<number>()
  private readonly mixinSources = new Map<number, Set<number>>()
  private lastResult: ScanResult = { dropped: [], mixinFailures: [], fileCount: 0 }

  constructor(private readonly index: Index) {}

  scan(rootPath: string): ScanResult {
    this.index.clear()
    this.namespaces.clear()
    this.serviceFiles.clear()
    this.mixinSources.clear()

    const records = this.parseAll(collectFiles(rootPath))
    const mixinFailures = this.resolveMixins(records)
    const dropped = this.resolveReferences(records)

    this.lastResult = { dropped, mixinFailures, fileCount: records.length }
    return this.lastResult
  }

  result(): ScanResult {
    return this.lastResult
  }

  namespaceOf(fileId: number): string {
    return this.namespaces.get(fileId) ?? ''
  }

  isServiceFile(fileId: number): boolean {
    return this.serviceFiles.has(fileId)
  }

  mixinSourcesOf(fileId: number): Set<number> {
    return this.mixinSources.get(fileId) ?? new Set()
  }

  private parseAll(files: string[]): FileRecord[] {
    const records: FileRecord[] = []
    for (const filePath of files) {
      const source = readFile(filePath)
      if (source === undefined) {
        continue
      }
      const fileId = this.index.fileId(filePath)
      const parsed = this.parser.parse(filePath, source)
      const namespace = parsed.symbols[0]?.namespace ?? this.parser.namespaceOf(filePath, source)

      this.namespaces.set(fileId, namespace)
      if (parsed.isService) {
        this.serviceFiles.add(fileId)
      }
      for (const symbol of parsed.symbols) {
        symbol.fileId = fileId
        symbol.sourceFileId = fileId
        this.index.insert(symbol)
      }
      for (const reference of parsed.references) {
        reference.location.fileId = fileId
      }
      records.push({
        filePath,
        fileId,
        namespace,
        isService: parsed.isService,
        references: parsed.references,
        mixins: parsed.mixins,
      })
    }
    return records
  }

  private resolveMixins(records: FileRecord[]): MixinFailure[] {
    const failures: MixinFailure[] = []
    const pending: Array<{ record: FileRecord; mixin: MixinRequest; mixinFileId: number }> = []

    for (const record of records) {
      for (const mixin of record.mixins) {
        if (!isLocalRequire(mixin.requirePath)) {
          continue
        }
        const mixinPath = resolveRequire(mixin.sourceFile, mixin.requirePath)
        if (mixinPath.length === 0) {
          failures.push({ ...mixin, reason: DropReason.BrokenRequirePath })
          continue
        }
        if (record.namespace.length === 0) {
          failures.push({ ...mixin, reason: DropReason.NamespaceEmpty })
          continue
        }
        const mixinFileId = this.index.fileId(mixinPath)
        this.linkMixin(record.fileId, mixinFileId)
        pending.push({ record, mixin, mixinFileId })
      }
    }

    while (pending.length > 0) {
      let inserted = 0
      for (const item of pending) {
        inserted += this.copyMixinSymbols(item.record, item.mixinFileId)
      }
      if (inserted === 0) {
        break
      }
    }

    return failures
  }

  private linkMixin(consumerFileId: number, mixinFileId: number): void {
    const existing = this.mixinSources.get(consumerFileId)
    if (existing === undefined) {
      this.mixinSources.set(consumerFileId, new Set([mixinFileId]))
      return
    }
    existing.add(mixinFileId)
  }

  private copyMixinSymbols(record: FileRecord, mixinFileId: number): number {
    let inserted = 0
    for (const symbol of this.index.symbolsByFile(mixinFileId)) {
      const fullName = `${record.namespace}.${symbol.name}`
      if (this.index.has(fullName)) {
        continue
      }
      const copy: Symbol = {
        ...symbol,
        id: 0,
        fullName,
        namespace: record.namespace,
        fileId: record.fileId,
        sourceFileId: symbol.sourceFileId,
      }
      if (this.index.insert(copy)) {
        inserted += 1
      }
    }
    return inserted
  }

  private resolveReferences(records: FileRecord[]): DroppedReference[] {
    const dropped: DroppedReference[] = []
    for (const record of records) {
      for (const reference of record.references) {
        const resolved = this.resolveOne(record, reference)
        if (resolved.fullName !== undefined && this.index.addReference(resolved.fullName, reference.location)) {
          continue
        }
        if (resolved.silent) {
          continue
        }
        dropped.push({
          fullName: reference.fullName,
          kind: reference.kind,
          location: reference.location,
          reason: resolved.reason ?? DropReason.GenuinelyUnresolved,
        })
      }
    }
    return dropped
  }

  private resolveOne(
    record: FileRecord,
    reference: Reference,
  ): { fullName?: string; reason?: DropReason; silent?: boolean } {
    if (isSelfRef(reference.fullName)) {
      if (!record.isService) {
        return { silent: true }
      }
      if (record.namespace.length === 0) {
        return { reason: DropReason.NamespaceEmpty }
      }
      return { fullName: `${record.namespace}.${selfMethod(reference.fullName)}` }
    }

    if (reference.kind === ReferenceKind.Emit || reference.kind === ReferenceKind.Broadcast) {
      return this.resolveEvent(record, reference)
    }

    if (this.index.has(reference.fullName)) {
      return { fullName: reference.fullName }
    }
    return { reason: DropReason.GenuinelyUnresolved }
  }

  private resolveEvent(record: FileRecord, reference: Reference): { fullName?: string; reason?: DropReason } {
    if (this.index.has(reference.fullName)) {
      return { fullName: reference.fullName }
    }
    const targetKind = reference.kind === ReferenceKind.Broadcast ? SymbolKind.Channel : SymbolKind.Event
    const matches = this.index.allSymbols().filter(
      (symbol) => symbol.kind === targetKind && symbol.name === reference.fullName,
    )
    if (matches.length === 0) {
      return { reason: DropReason.EventNoListener }
    }
    const distinctOrigins = new Set(matches.map((symbol) => symbol.sourceFileId))
    if (distinctOrigins.size === 1) {
      return this.pickSameOriginMatch(record, matches)
    }
    const related = matches.filter((symbol) => this.isRelated(record.fileId, record.namespace, symbol))
    const relatedOrigins = new Set(related.map((symbol) => symbol.sourceFileId))
    if (relatedOrigins.size === 1) {
      return this.pickSameOriginMatch(record, related)
    }
    return { reason: DropReason.NameCollision }
  }

  private pickSameOriginMatch(record: FileRecord, matches: Symbol[]): { fullName?: string; reason?: DropReason } {
    const local = matches.find((symbol) => symbol.fileId === record.fileId)
    return { fullName: (local ?? matches[0])?.fullName }
  }

  isRelated(callerFileId: number, callerNamespace: string, candidate: Symbol): boolean {
    if (callerNamespace.length > 0 && candidate.namespace === callerNamespace) {
      return true
    }
    if (candidate.fileId === callerFileId || candidate.sourceFileId === callerFileId) {
      return true
    }
    const sources = this.mixinSources.get(callerFileId)
    if (sources === undefined) {
      return false
    }
    return sources.has(candidate.sourceFileId) || sources.has(candidate.fileId)
  }
}

export function collectFiles(rootPath: string): string[] {
  const results: string[] = []
  const visit = (dir: string): void => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) {
          visit(fullPath)
        }
        continue
      }
      if (entry.isFile() && fullPath.endsWith('.js')) {
        results.push(fullPath)
      }
    }
  }
  visit(rootPath)
  return results
}

function readFile(filePath: string): string | undefined {
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return undefined
  }
}

function isLocalRequire(requirePath: string): boolean {
  return requirePath.startsWith('.') || requirePath.startsWith('/')
}

function resolveRequire(sourceFile: string, requirePath: string): string {
  if (requirePath.length === 0 || !requirePath.startsWith('.')) {
    return ''
  }
  const base = path.resolve(path.dirname(sourceFile), requirePath)
  for (const candidate of [base, `${base}.js`, path.join(base, 'index.js')]) {
    if (candidate.endsWith('.js') && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate
    }
  }
  return ''
}

export { isFileNamespace }
