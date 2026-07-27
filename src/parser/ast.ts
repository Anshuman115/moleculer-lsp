import { parse } from 'acorn'

export interface AstNode {
  type: string
  start: number
  end: number
  loc?: { start: { line: number; column: number } } | null
  [key: string]: unknown
}

const skipKeys = new Set(['type', 'start', 'end', 'loc', 'range'])

export function isNode(value: unknown): value is AstNode {
  return typeof value === 'object' && value !== null
    && typeof (value as AstNode).type === 'string'
    && typeof (value as AstNode).start === 'number'
}

export function parseSource(source: string): AstNode {
  for (const sourceType of ['script', 'module'] as const) {
    try {
      return parse(source, {
        ecmaVersion: 'latest',
        sourceType,
        locations: true,
        allowHashBang: true,
      }) as unknown as AstNode
    } catch {
      continue
    }
  }
  return { type: 'Program', start: 0, end: 0, body: [], loc: null }
}

export function walk(root: AstNode, visit: (node: AstNode) => void): void {
  const stack: AstNode[] = [root]
  while (stack.length > 0) {
    const node = stack.pop()
    if (node === undefined) {
      continue
    }
    visit(node)
    for (const child of children(node)) {
      stack.push(child)
    }
  }
}

export function children(node: AstNode): AstNode[] {
  const result: AstNode[] = []
  for (const [key, value] of Object.entries(node)) {
    if (skipKeys.has(key)) {
      continue
    }
    if (isNode(value)) {
      result.push(value)
      continue
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) {
          result.push(item)
        }
      }
    }
  }
  return result
}

export function line(node: AstNode): number {
  const value = node.loc?.start.line
  return value === undefined ? 0 : value - 1
}

export function column(node: AstNode): number {
  return node.loc?.start.column ?? 0
}

export function identifier(node: unknown): string | undefined {
  if (!isNode(node) || node.type !== 'Identifier') {
    return undefined
  }
  return typeof node.name === 'string' ? node.name : undefined
}

export function stringValue(node: unknown): string | undefined {
  if (!isNode(node) || node.type !== 'Literal') {
    return undefined
  }
  return typeof node.value === 'string' ? node.value : undefined
}

export function staticStringValue(node: unknown): string | undefined {
  const literal = stringValue(node)
  if (literal !== undefined) {
    return literal
  }
  if (!isNode(node) || node.type !== 'TemplateLiteral') {
    return undefined
  }
  const expressions = node.expressions
  if (Array.isArray(expressions) && expressions.length > 0) {
    return undefined
  }
  const quasis = node.quasis
  if (!Array.isArray(quasis) || quasis.length !== 1) {
    return undefined
  }
  const quasi = quasis[0]
  const cooked = isNode(quasi) ? (quasi.value as { cooked?: unknown } | undefined)?.cooked : undefined
  return typeof cooked === 'string' ? cooked : undefined
}

export function numberValue(node: unknown): number | undefined {
  if (!isNode(node) || node.type !== 'Literal') {
    return undefined
  }
  return typeof node.value === 'number' ? node.value : undefined
}

export function properties(node: AstNode | undefined): AstNode[] {
  if (node === undefined || node.type !== 'ObjectExpression' || !Array.isArray(node.properties)) {
    return []
  }
  return node.properties.filter(isNode).filter((property) => property.type === 'Property')
}

export function elements(node: AstNode | undefined): AstNode[] {
  if (node === undefined || node.type !== 'ArrayExpression' || !Array.isArray(node.elements)) {
    return []
  }
  return node.elements.filter(isNode)
}

export function propertyKey(property: AstNode): string | undefined {
  const key = property.key
  const numeric = numberValue(key)
  return identifier(key) ?? stringValue(key) ?? (numeric === undefined ? undefined : String(numeric))
}

export function propertyValue(property: AstNode): AstNode | undefined {
  return isNode(property.value) ? property.value : undefined
}

export function memberName(node: AstNode): string | undefined {
  return identifier(node.property) ?? stringValue(node.property)
}

export function objectProperty(node: AstNode | undefined, name: string): AstNode | undefined {
  if (node === undefined) {
    return undefined
  }
  for (const property of properties(node)) {
    if (propertyKey(property) === name) {
      return propertyValue(property)
    }
  }
  return undefined
}

export function firstArgument(call: AstNode): AstNode | undefined {
  return Array.isArray(call.arguments) && isNode(call.arguments[0]) ? call.arguments[0] : undefined
}

export function firstStringArgument(call: AstNode): string | undefined {
  return stringValue(firstArgument(call))
}
