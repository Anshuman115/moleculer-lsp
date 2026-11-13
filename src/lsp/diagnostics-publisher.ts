import { Documents } from './documents.js'
import type { Diagnostic } from './protocol.js'
import { pathToUri } from './uri.js'

export interface DiagnosticsSink {
  publish(uri: string, diagnostics: Diagnostic[]): void
  refresh(): void
}

export enum DiagnosticsMode {
  Push = 'push',
  Pull = 'pull',
}

export class DiagnosticsPublisher {
  private moleculer = new Map<string, Diagnostic[]>()
  private readonly typescript = new Map<string, Diagnostic[]>()
  private indexed = false

  constructor(
    private readonly sink: DiagnosticsSink,
    private readonly mode: DiagnosticsMode,
    private readonly documents: Documents,
  ) {}

  setMoleculer(byFile: Map<string, Diagnostic[]>): void {
    this.moleculer = byFile
    this.indexed = true
    this.publishAll()
  }

  setTypeScript(filePath: string, diagnostics: Diagnostic[]): void {
    if (!this.documents.isOpen(filePath)) {
      return
    }
    this.typescript.set(filePath, diagnostics)
    if (this.mode === DiagnosticsMode.Pull) {
      this.sink.refresh()
    } else {
      this.publishFile(filePath)
    }
  }

  open(filePath: string): void {
    if (this.indexed && this.mode === DiagnosticsMode.Push) {
      this.publishFile(filePath)
    }
  }

  close(filePath: string): void {
    this.typescript.delete(filePath)
    if (this.mode === DiagnosticsMode.Push) {
      this.sink.publish(pathToUri(filePath), [])
    }
  }

  report(filePath: string): Diagnostic[] {
    return [...this.moleculer.get(filePath) ?? [], ...this.typescript.get(filePath) ?? []]
  }

  private publishAll(): void {
    if (this.mode === DiagnosticsMode.Pull) {
      this.sink.refresh()
      return
    }
    for (const filePath of this.documents.openPaths()) {
      this.publishFile(filePath)
    }
  }

  private publishFile(filePath: string): void {
    this.sink.publish(pathToUri(filePath), this.report(filePath))
  }
}
