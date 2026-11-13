import { watch, type FSWatcher } from 'chokidar'
import { errorMessage, log } from '../log.js'
import { isSkippedPath, isSourceFile } from './files.js'

const debounceMs = 250

export class Watcher {
  private watcher: FSWatcher | undefined
  private timer: NodeJS.Timeout | undefined

  constructor(private readonly onChange: () => void) {}

  watch(rootPath: string): void {
    const watcher = watch(rootPath, {
      ignored: (filePath: string) => isSkippedPath(rootPath, filePath),
      ignoreInitial: true,
    })
    for (const event of ['add', 'change', 'unlink'] as const) {
      watcher.on(event, (filePath: string) => {
        if (isSourceFile(filePath)) {
          this.trigger()
        }
      })
    }
    watcher.on('error', (error) => log(`file watcher error: ${errorMessage(error)}`))
    this.watcher = watcher
  }

  trigger(): void {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.onChange()
    }, debounceMs)
  }

  close(): void {
    clearTimeout(this.timer)
    this.timer = undefined
    void this.watcher?.close()
    this.watcher = undefined
  }
}

