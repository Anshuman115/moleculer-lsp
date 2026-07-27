interface FileWatcher {
  on(event: string, listener: (filePath: string) => void): FileWatcher
  close(): Promise<void>
}

const ignoredParts = ['/node_modules/', '/.git/', '/dist/', '/build/', '/coverage/']

export class Watcher {
  private watcher: FileWatcher | undefined
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly onChange: () => void, private readonly debounceMs = 250) {}

  watch(rootPath: string): void {
    void import('chokidar').then((module) => {
      const watcher = module.default.watch(rootPath, {
        ignored: (filePath: string) => isIgnored(filePath),
        ignoreInitial: true,
      }) as unknown as FileWatcher
      for (const event of ['add', 'change', 'unlink']) {
        watcher.on(event, (filePath) => this.schedule(filePath))
      }
      watcher.on('error', () => undefined)
      this.watcher = watcher
    }).catch(() => undefined)
  }

  close(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    void this.watcher?.close()
    this.watcher = undefined
  }

  private schedule(filePath: string): void {
    if (!filePath.endsWith('.js')) {
      return
    }
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
    }
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.onChange()
    }, this.debounceMs)
  }
}

function isIgnored(filePath: string): boolean {
  return ignoredParts.some((part) => filePath.includes(part))
}
