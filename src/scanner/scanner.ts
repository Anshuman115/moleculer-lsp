import fs from 'node:fs'
import path from 'node:path'
import { Index } from '../index/Index.js'
import { errorMessage, log } from '../log.js'
import { parse } from '../parser/moleculerParser.js'
import { qualify, Resolution } from './resolution.js'
import { ReferenceKind, type DroppedReference, type MixinFailure, type MixinRequest, type ParseResult, type Reference } from '../types.js'

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
  readonly resolution: Resolution

  constructor(private readonly index: Index) {
    this.resolution = new Resolution(index)
  }

  scan(files: string[]): ScanResult {
    this.index.clear()
    this.resolution.clear()

    const records = this.parseAll(files)
    const mixinFailures = this.resolveMixins(records)
    const dropped = this.resolveReferences(records)

    return { dropped, mixinFailures, fileCount: records.length }
  }

  private parseAll(files: string[]): FileRecord[] {
    const records: FileRecord[] = []
    for (const filePath of files) {
      const parsed = parseFile(filePath)
      if (parsed === undefined) {
        continue
      }
      const fileId = this.index.fileId(filePath)
      const { declarations, references, mixins } = parsed
      const namespace = parsed.namespace ?? `#file_${fileId}`
      const isService = parsed.namespace !== undefined
      this.resolution.setNamespace(fileId, namespace)
      for (const declaration of declarations) {
        this.index.insert({ ...declaration, fullName: qualify(namespace, declaration.name), namespace, fileId, sourceFileId: fileId })
      }
      records.push({ filePath, fileId, namespace, isService, references, mixins })
    }
    return records
  }

  private resolveMixins(records: FileRecord[]): MixinFailure[] {
    const failures: MixinFailure[] = []
    const pending: Array<{ record: FileRecord; mixinFileId: number }> = []

    for (const record of records) {
      for (const mixin of record.mixins) {
        if (!isLocalRequire(mixin.requirePath)) {
          continue
        }
        const mixinPath = resolveRequire(record.filePath, mixin.requirePath)
        if (mixinPath === undefined) {
          failures.push({ ...mixin, filePath: record.filePath })
          continue
        }
        const mixinFileId = this.index.fileId(mixinPath)
        this.resolution.linkMixin(record.fileId, mixinFileId)
        pending.push({ record, mixinFileId })
      }
    }

    let inserted = pending.length
    while (inserted > 0) {
      inserted = 0
      for (const item of pending) {
        inserted += this.copyMixinSymbols(item.record, item.mixinFileId)
      }
    }

    return failures
  }

  private copyMixinSymbols(record: FileRecord, mixinFileId: number): number {
    let inserted = 0
    for (const symbol of this.index.symbolsByFile(mixinFileId)) {
      const copy = { ...symbol, fullName: qualify(record.namespace, symbol.name), namespace: record.namespace, fileId: record.fileId }
      if (this.index.insert(copy)) {
        inserted += 1
      }
    }
    return inserted
  }

  private resolveReferences(records: FileRecord[]): DroppedReference[] {
    const dropped: DroppedReference[] = []
    for (const record of records) {
      for (const { kind, target, span } of record.references) {
        const location = { ...span, fileId: record.fileId }
        const resolved = this.resolution.resolve(kind, target, record.fileId)
        if ('symbol' in resolved) {
          this.index.addReference(resolved.symbol, location)
        } else if (kind !== ReferenceKind.Self || record.isService) {
          dropped.push({ kind, target, location, reason: resolved.reason })
        }
      }
    }
    return dropped
  }
}

function parseFile(filePath: string): ParseResult | undefined {
  try {
    return parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    log(`skipped ${filePath}: ${errorMessage(error)}`)
    return undefined
  }
}

function isLocalRequire(requirePath: string): boolean {
  return requirePath.startsWith('.') || path.isAbsolute(requirePath)
}

function resolveRequire(sourceFile: string, requirePath: string): string | undefined {
  const base = path.resolve(path.dirname(sourceFile), requirePath)
  return [base, `${base}.js`, path.join(base, 'index.js')]
    .find((candidate) => candidate.endsWith('.js') && fs.existsSync(candidate) && fs.statSync(candidate).isFile())
}
