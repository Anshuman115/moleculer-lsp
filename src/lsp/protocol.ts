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
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  ServerNotInitialized: -32002,
} as const

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function spanRange(line: number, character: number, length: number): Range {
  return { start: { line, character }, end: { line, character: character + length } }
}

export function textDocumentOf(params: unknown): { uri: string; text?: unknown } | undefined {
  const record = isRecord(params) ? params : {}
  const document = isRecord(record.textDocument) ? record.textDocument : undefined
  if (document === undefined || typeof document.uri !== 'string') {
    return undefined
  }
  return { uri: document.uri, text: document.text }
}

export function positionParams(params: unknown): TextDocumentPositionParams | undefined {
  const uri = textDocumentOf(params)?.uri
  const position = isRecord(params) && isRecord(params.position) ? params.position : {}
  const { line, character } = position
  if (uri === undefined || typeof line !== 'number' || typeof character !== 'number') {
    return undefined
  }
  return { textDocument: { uri }, position: { line, character } }
}

export function referenceParams(params: unknown): ReferenceParams | undefined {
  const position = positionParams(params)
  const context = isRecord(params) && isRecord(params.context) ? params.context : {}
  return position === undefined ? undefined : { ...position, context: { includeDeclaration: context.includeDeclaration === true } }
}

export function documentSymbolParams(params: unknown): DocumentSymbolParams | undefined {
  const uri = textDocumentOf(params)?.uri
  return uri === undefined ? undefined : { textDocument: { uri } }
}
