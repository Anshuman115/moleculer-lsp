import type { Location } from '../types.js'

export class InvertedIndex {
  private readonly refs = new Map<number, Location[]>()

  add(symbolId: number, location: Location): void {
    const existing = this.refs.get(symbolId)
    if (existing === undefined) {
      this.refs.set(symbolId, [location])
      return
    }
    existing.push(location)
  }

  deleteAll(symbolId: number): void {
    this.refs.delete(symbolId)
  }

  deleteByFile(fileId: number): void {
    for (const [symbolId, locations] of this.refs) {
      const next = locations.filter((location) => location.fileId !== fileId)
      if (next.length === 0) {
        this.refs.delete(symbolId)
        continue
      }
      if (next.length !== locations.length) {
        this.refs.set(symbolId, next)
      }
    }
  }

  lookup(symbolId: number): Location[] {
    return this.refs.get(symbolId) ?? []
  }

  count(symbolId: number): number {
    return this.refs.get(symbolId)?.length ?? 0
  }

  clear(): void {
    this.refs.clear()
  }
}
