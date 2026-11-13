import fs from 'node:fs'

export class Documents {
  private readonly open = new Map<string, string>()

  set(filePath: string, text: string): void {
    this.open.set(filePath, text)
  }

  delete(filePath: string): void {
    this.open.delete(filePath)
  }

  isOpen(filePath: string): boolean {
    return this.open.has(filePath)
  }

  openPaths(): IterableIterator<string> {
    return this.open.keys()
  }

  text(filePath: string): string | undefined {
    const text = this.open.get(filePath)
    if (text !== undefined) {
      return text
    }
    try {
      return fs.readFileSync(filePath, 'utf8')
    } catch {
      return undefined
    }
  }
}
