export interface RequestMessage {
  jsonrpc: string
  id?: unknown
  method: string
  params?: unknown
}

export interface Position {
  line: number
  character: number
}

export interface Range {
  start: Position
  end: Position
}

export interface Location {
  uri: string
  range: Range
}

export interface TextDocumentIdentifier {
  uri: string
}

export interface TextDocumentPositionParams {
  textDocument: TextDocumentIdentifier
  position: Position
}

export interface ReferenceParams extends TextDocumentPositionParams {
  context?: { includeDeclaration?: boolean }
}

export interface DocumentSymbolParams {
  textDocument: TextDocumentIdentifier
}

export interface DocumentSymbol {
  name: string
  kind: number
  range: Range
  selectionRange: Range
  children?: DocumentSymbol[]
}

export const SymbolKind = {
  Module: 2,
  Namespace: 3,
  Method: 6,
  Object: 19,
  Event: 24,
} as const

export interface Diagnostic {
  range: Range
  severity: DiagnosticSeverity
  source: string
  message: string
  code?: string
}

export const DiagnosticSeverity = {
  Error: 1,
  Warning: 2,
  Information: 3,
  Hint: 4,
} as const

export type DiagnosticSeverity = (typeof DiagnosticSeverity)[keyof typeof DiagnosticSeverity]

export const ErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  ServerNotInitialized: -32002,
} as const

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
