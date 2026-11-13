export enum SymbolKind {
  Action = 'action',
  Event = 'event',
  Method = 'method',
  Channel = 'channel',
}

export enum ReferenceKind {
  Action = 'action',
  Event = 'event',
  Channel = 'channel',
  Self = 'self',
}

export enum DropReason {
  NameCollision = 'name-collision',
  EventNoListener = 'event-no-listener',
  GenuinelyUnresolved = 'genuinely-unresolved',
}

export interface Declaration {
  name: string
  kind: SymbolKind
  line: number
  column: number
}

export interface Symbol extends Declaration {
  fullName: string
  namespace: string
  fileId: number
  sourceFileId: number
}

export interface Span {
  line: number
  column: number
  length: number
}

export interface Location extends Span {
  fileId: number
}

export interface Reference {
  kind: ReferenceKind
  target: string
  span: Span
}

export interface MixinRequest {
  mixinName: string
  requirePath: string
}

export interface ParseResult {
  namespace: string | undefined
  declarations: Declaration[]
  references: Reference[]
  mixins: MixinRequest[]
}

export interface DroppedReference {
  kind: ReferenceKind
  target: string
  location: Location
  reason: DropReason
}

export interface MixinFailure extends MixinRequest {
  filePath: string
}
