import { Index } from '../index/Index.js'
import { errorMessage, log } from '../log.js'
import { collectFiles, isMoleculerWorkspace } from './files.js'
import { Resolution } from './resolution.js'
import { Scanner, type ScanResult } from './scanner.js'
import { Watcher } from './watcher.js'

export class Workspace {
  readonly index = new Index()
  private readonly scanner = new Scanner(this.index)
  readonly resolution: Resolution = this.scanner.resolution
  private readonly watcher = new Watcher(() => this.scan())
  readonly moleculer: boolean
  private scanFailure: string | undefined

  constructor(private readonly rootPath: string, private readonly onScan: (result: ScanResult) => void) {
    this.moleculer = isMoleculerWorkspace(rootPath)
  }

  get failure(): string | undefined {
    return this.scanFailure
  }

  start(): void {
    this.scan()
    if (this.moleculer) {
      this.watcher.watch(this.rootPath)
    } else {
      log(`no moleculer.config.* or moleculer dependency at or above ${this.rootPath}; index disabled`)
    }
  }

  changed(): void {
    this.watcher.trigger()
  }

  close(): void {
    this.watcher.close()
  }

  private files(): string[] {
    return this.moleculer ? collectFiles(this.rootPath) : []
  }

  private scan(): void {
    const started = Date.now()
    let result: ScanResult
    try {
      result = this.scanner.scan(this.files())
    } catch (error) {
      this.scanFailure = errorMessage(error)
      log(`scan failed: ${this.scanFailure}`)
      return
    }
    this.scanFailure = undefined
    const stats = this.index.stats()
    log(`indexed ${stats.symbolCount} symbols in ${result.fileCount} files (${Date.now() - started}ms)`)
    log(`references ${stats.referenceCount}, unresolved ${result.dropped.length}, mixin failures ${result.mixinFailures.length}`)
    this.onScan(result)
  }
}
