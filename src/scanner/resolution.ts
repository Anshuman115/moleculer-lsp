import { Index } from '../index/Index.js'
import { DropReason, ReferenceKind, SymbolKind, type Location, type Symbol } from '../types.js'

export type Resolved = { symbol: Symbol } | { reason: DropReason }

const targetKinds = {
  [ReferenceKind.Action]: SymbolKind.Action,
  [ReferenceKind.Event]: SymbolKind.Event,
  [ReferenceKind.Channel]: SymbolKind.Channel,
} as const

const selfKinds = [SymbolKind.Method, SymbolKind.Action, SymbolKind.Event, SymbolKind.Channel]

export function qualify(namespace: string, name: string): string {
  return `${namespace}.${name}`
}

export class Resolution {
  private readonly namespaces = new Map<number, string>()
  private readonly mixinSources = new Map<number, Set<number>>()
  private readonly consumers = new Map<number, Set<number>>()
  private readonly hostCache = new Map<number, Set<string>>()

  constructor(private readonly index: Index) {}

  clear(): void {
    this.namespaces.clear()
    this.mixinSources.clear()
    this.consumers.clear()
    this.hostCache.clear()
  }

  setNamespace(fileId: number, namespace: string): void {
    this.namespaces.set(fileId, namespace)
  }

  linkMixin(consumerFileId: number, mixinFileId: number): void {
    addTo(this.mixinSources, consumerFileId, mixinFileId)
    addTo(this.consumers, mixinFileId, consumerFileId)
    this.hostCache.clear()
  }

  resolve(kind: ReferenceKind, target: string, callerFileId: number): Resolved {
    if (kind === ReferenceKind.Self) {
      return this.self(target, callerFileId)
    }
    const symbolKind = targetKinds[kind]
    const exact = this.index.lookup(target, symbolKind)
    if (exact !== undefined) {
      return { symbol: exact }
    }
    if (symbolKind === SymbolKind.Action) {
      return { reason: DropReason.GenuinelyUnresolved }
    }
    return this.event(target, symbolKind, callerFileId)
  }

  resolveText(value: string, callerFileId: number): Symbol | undefined {
    for (const kind of [SymbolKind.Event, SymbolKind.Channel] as const) {
      const listener = this.event(value, kind, callerFileId)
      if ('symbol' in listener) {
        return listener.symbol
      }
    }
    const resolved = this.resolve(value.includes('.') ? ReferenceKind.Action : ReferenceKind.Self, value, callerFileId)
    return 'symbol' in resolved ? resolved.symbol : undefined
  }

  serviceFile(namespace: string): number | undefined {
    for (const [fileId, fileNamespace] of this.namespaces) {
      if (fileNamespace === namespace) {
        return fileId
      }
    }
    return undefined
  }

  references(symbol: Symbol): Location[] {
    return this.index.named(symbol.name)
      .filter((candidate) => candidate.kind === symbol.kind && candidate.sourceFileId === symbol.sourceFileId)
      .flatMap((candidate) => this.index.referencesTo(candidate))
  }

  private self(name: string, callerFileId: number): Resolved {
    const namespace = this.namespaces.get(callerFileId)
    const symbol = this.ownByName(namespace, name)
    return symbol === undefined ? this.relatedByName(name, callerFileId) : { symbol }
  }

  private ownByName(namespace: string | undefined, name: string): Symbol | undefined {
    if (namespace === undefined) {
      return undefined
    }
    const fullName = qualify(namespace, name)
    return selfKinds.map((kind) => this.index.lookup(fullName, kind)).find((symbol) => symbol !== undefined)
  }

  private relatedByName(name: string, callerFileId: number): Resolved {
    const related = this.index.named(name).filter((symbol) => this.isRelated(callerFileId, symbol))
    for (const kind of selfKinds) {
      const ofKind = related.filter((symbol) => symbol.kind === kind)
      if (ofKind.length === 0) {
        continue
      }
      if (!hasSingleOrigin(ofKind)) {
        return { reason: DropReason.NameCollision }
      }
      return { symbol: ofKind.find((candidate) => candidate.fileId === candidate.sourceFileId) ?? ofKind[0]! }
    }
    return { reason: DropReason.GenuinelyUnresolved }
  }

  private event(name: string, kind: SymbolKind.Event | SymbolKind.Channel, callerFileId: number): Resolved {
    const matches = this.index.named(name).filter((symbol) => symbol.kind === kind)
    if (matches.length === 0) {
      return { reason: DropReason.EventNoListener }
    }
    const candidates = hasSingleOrigin(matches)
      ? matches
      : matches.filter((symbol) => this.isRelated(callerFileId, symbol))
    if (!hasSingleOrigin(candidates)) {
      return { reason: DropReason.NameCollision }
    }
    return { symbol: candidates.find((symbol) => symbol.fileId === callerFileId) ?? candidates[0]! }
  }

  private isRelated(callerFileId: number, candidate: Symbol): boolean {
    if (candidate.namespace === this.namespaces.get(callerFileId)) {
      return true
    }
    if (candidate.fileId === callerFileId || candidate.sourceFileId === callerFileId) {
      return true
    }
    if (this.hostNamespaces(callerFileId).has(candidate.namespace)) {
      return true
    }
    const sources = this.mixinSources.get(callerFileId)
    return sources !== undefined && (sources.has(candidate.sourceFileId) || sources.has(candidate.fileId))
  }

  private hostNamespaces(mixinFileId: number): Set<string> {
    const cached = this.hostCache.get(mixinFileId)
    if (cached !== undefined) {
      return cached
    }
    const hosts = new Set<string>()
    const visited = new Set<number>([mixinFileId])
    const queue = [...this.consumers.get(mixinFileId) ?? []]
    while (queue.length > 0) {
      const fileId = queue.pop()!
      if (visited.has(fileId)) {
        continue
      }
      visited.add(fileId)
      const namespace = this.namespaces.get(fileId)
      if (namespace !== undefined) {
        hosts.add(namespace)
      }
      queue.push(...this.consumers.get(fileId) ?? [])
    }
    this.hostCache.set(mixinFileId, hosts)
    return hosts
  }
}

function hasSingleOrigin(symbols: Symbol[]): boolean {
  return symbols.length > 0 && new Set(symbols.map((symbol) => symbol.sourceFileId)).size === 1
}

function addTo(map: Map<number, Set<number>>, key: number, value: number): void {
  const existing = map.get(key)
  if (existing === undefined) {
    map.set(key, new Set([value]))
    return
  }
  existing.add(value)
}
