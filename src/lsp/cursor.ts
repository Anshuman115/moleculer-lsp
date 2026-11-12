export enum CursorKind {
  Unknown = 'unknown',
  ActionString = 'actionString',
  ServiceName = 'serviceName',
  MethodAccess = 'methodAccess',
  DefinitionSite = 'definitionSite',
}

export interface CursorContext {
  kind: CursorKind
  fullName: string
  rawString?: string
  chained?: boolean
}

const reservedThisProps = new Set([
  'broker', 'logger', 'actions', 'settings', 'metadata', 'schema', 'Promise', 'name', 'version',
])

export function detect(source: string, line: number, character: number, namespace: string): CursorContext {
  const text = source.split('\n')[line]
  if (text === undefined) {
    return unknown()
  }
  return definitionAt(text, character, namespace)
    ?? stringLiteralAt(text, character, namespace)
    ?? thisCallAt(text, character, namespace)
    ?? unknown()
}

function stringLiteralAt(text: string, character: number, namespace: string): CursorContext | undefined {
  let i = 0
  while (i < text.length) {
    const quote = text[i]
    if (quote !== '"' && quote !== "'" && quote !== '`') {
      i += 1
      continue
    }
    const start = i
    i += 1
    while (i < text.length && text[i] !== quote) {
      i += text[i] === '\\' ? 2 : 1
    }
    if (i < text.length && character > start && character <= i) {
      return classifyString(text.slice(start + 1, i), character - start - 1, namespace)
    }
    i += 1
  }
  return undefined
}

function classifyString(value: string, offset: number, namespace: string): CursorContext | undefined {
  if (value.length === 0) {
    return undefined
  }
  const parts = value.split('.')
  if (parts.length < 2) {
    return isIdentifier(value)
      ? { kind: CursorKind.MethodAccess, fullName: `${namespace}.${value}`, rawString: value }
      : undefined
  }
  let position = 0
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i] ?? ''
    if (offset >= position && offset < position + part.length) {
      return { kind: segmentKind(parts, i), fullName: value, rawString: value }
    }
    position += part.length + 1
  }
  return { kind: CursorKind.ActionString, fullName: value, rawString: value }
}

function segmentKind(parts: string[], index: number): CursorKind {
  const first = parts[0] ?? ''
  const versioned = first.length >= 2 && first[0] === 'v' && isDigit(first[1] ?? '')
  const serviceIndex = versioned ? 1 : 0
  return index <= serviceIndex ? CursorKind.ServiceName : CursorKind.ActionString
}

function thisCallAt(text: string, character: number, namespace: string): CursorContext | undefined {
  const marker = 'this.'
  let from = 0
  while (from < text.length) {
    const start = text.indexOf(marker, from)
    if (start < 0) {
      return undefined
    }
    const nameStart = start + marker.length
    const open = text.indexOf('(', nameStart)
    if (open < 0) {
      return undefined
    }
    const raw = text.slice(nameStart, open).trim()
    const dot = raw.lastIndexOf('.')
    const method = dot < 0 ? raw : raw.slice(dot + 1)
    const holder = dot < 0 ? undefined : raw.slice(0, dot)
    const blocked = holder === undefined ? reservedThisProps.has(method) : reservedThisProps.has(holder)
    const methodStart = nameStart + text.slice(nameStart, open).indexOf(raw) + dot + 1
    if (isMemberChain(raw) && !blocked && character >= methodStart && character < methodStart + method.length) {
      return { kind: CursorKind.MethodAccess, fullName: `${namespace}.${method}`, chained: holder !== undefined }
    }
    from = open + 1
  }
  return undefined
}

function definitionAt(text: string, character: number, namespace: string): CursorContext | undefined {
  const indent = text.length - text.trimStart().length
  const name = definitionName(text.trim())
  if (name === undefined) {
    return undefined
  }
  const start = text.indexOf(name, indent)
  if (start < 0 || character < start || character >= start + name.length) {
    return undefined
  }
  return {
    kind: CursorKind.DefinitionSite,
    fullName: namespace.length === 0 ? name : `${namespace}.${name}`,
  }
}

function definitionName(trimmed: string): string | undefined {
  const colon = trimmed.indexOf(':')
  const paren = trimmed.indexOf('(')
  const boundary = colon >= 0 && (paren < 0 || colon < paren) ? colon : paren
  if (boundary <= 0) {
    return undefined
  }
  const head = stripAsync(trimmed.slice(0, boundary)).trim()
  const name = unquote(head)
  if (name.length === 0 || name === 'handler' || /[\s\t]/.test(name)) {
    return undefined
  }
  if (name.includes('.') && name === head) {
    return undefined
  }
  return name
}

function stripAsync(value: string): string {
  const trimmed = value.trimStart()
  return trimmed.startsWith('async ') ? trimmed.slice(6).trimStart() : value
}

function unquote(value: string): string {
  if (value.length < 2) {
    return value
  }
  const first = value[0]
  if ((first === '"' || first === "'") && value[value.length - 1] === first) {
    return value.slice(1, -1)
  }
  return value
}

function isDigit(value: string): boolean {
  return value >= '0' && value <= '9'
}

function isIdentifier(value: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(value)
}

function isMemberChain(value: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z_$][a-zA-Z0-9_$]*)*$/.test(value)
}

function unknown(): CursorContext {
  return { kind: CursorKind.Unknown, fullName: '' }
}
