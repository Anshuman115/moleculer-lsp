export enum SymbolKind {
  Action = 'action',
  Event = 'event',
  Method = 'method',
  Channel = 'channel',
}

export enum ReferenceKind {
  Call = 'call',
  Emit = 'emit',
  Broadcast = 'broadcast',
}

export enum DropReason {
  NamespaceEmpty = 'namespace-empty',
  BrokenRequirePath = 'broken-require-path',
  NameCollision = 'name-collision',
  EventNoListener = 'event-no-listener',
  GenuinelyUnresolved = 'genuinely-unresolved',
}

export interface Symbol {
  id: number
  name: string
  fullName: string
  namespace: string
  kind: SymbolKind
  fileId: number
  sourceFileId: number
  line: number
  column: number
}

export interface Location {
  fileId: number
  line: number
  column: number
}

export interface Reference {
  fullName: string
  location: Location
  kind: ReferenceKind
}

export interface MixinRequest {
  mixinName: string
  requirePath: string
  sourceFile: string
}

export interface OutlineNode {
  name: string
  kind: 'root' | 'group' | 'action' | 'event' | 'method' | 'channel' | 'mixin' | 'hookPhase' | 'hook'
  line: number
  column: number
  children: OutlineNode[]
}

export interface DocumentOutline {
  name: string
  line: number
  column: number
  groups: OutlineNode[]
}

export interface ParseResult {
  symbols: Symbol[]
  references: Reference[]
  mixins: MixinRequest[]
  isService: boolean
  outline?: DocumentOutline
}

export interface DroppedReference {
  fullName: string
  kind: ReferenceKind
  location: Location
  reason: DropReason
}

export interface MixinFailure {
  mixinName: string
  requirePath: string
  sourceFile: string
  reason: DropReason
}

export interface IndexStats {
  symbolCount: number
  fileCount: number
  referenceCount: number
}
