export class StringPool {
  private readonly values: string[] = ['']
  private readonly ids = new Map<string, number>()

  intern(value: string): number {
    const existing = this.ids.get(value)
    if (existing !== undefined) {
      return existing
    }
    const id = this.values.length
    this.values.push(value)
    this.ids.set(value, id)
    return id
  }

  get(id: number): string {
    return this.values[id] ?? ''
  }

  size(): number {
    return this.values.length - 1
  }
}
