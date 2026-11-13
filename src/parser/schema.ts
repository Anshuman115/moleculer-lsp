import {
  elements,
  identifier,
  isNode,
  memberName,
  numberValue,
  objectProperty,
  properties,
  propertyKey,
  stringValue,
  walk,
  type AstNode,
} from './ast.js'
import { SymbolKind } from '../types.js'

export const reservedThisProps = new Set([
  'broker', 'logger', 'actions', 'settings', 'metadata', 'schema', 'Promise', 'name', 'version',
])

export const symbolBlocks: Array<[string, SymbolKind]> = [
  ['actions', SymbolKind.Action],
  ['events', SymbolKind.Event],
  ['methods', SymbolKind.Method],
  ['channels', SymbolKind.Channel],
]

export const hookPhases = ['before', 'after', 'error']

export function isDeclarationKey(name: string): boolean {
  return name !== 'handler'
}

export function moleculerObject(ast: AstNode): AstNode | undefined {
  const exported = moduleExportsObject(ast)
  if (exported === undefined) {
    return undefined
  }
  const shaped = serviceNamespace(exported) !== undefined
    || symbolBlocks.some(([blockName]) => declarationKeys(objectProperty(exported, blockName)).length > 0)
    || mixinNames(exported).length > 0
  return shaped ? exported : undefined
}

export function serviceNamespace(service: AstNode): string | undefined {
  const name = stringValue(objectProperty(service, 'name'))
  if (name === undefined || name.length === 0) {
    return undefined
  }
  const version = numberValue(objectProperty(service, 'version')) ?? 0
  return version > 0 ? `v${version}.${name}` : name
}

export function declarationKeys(block: AstNode | undefined): Array<{ name: string; key: AstNode }> {
  return properties(block).flatMap((property) => {
    const name = propertyKey(property)
    if (name === undefined || !isDeclarationKey(name)) {
      return []
    }
    return [{ name, key: isNode(property.key) ? property.key : property }]
  })
}

export function mixinNames(service: AstNode): Array<{ name: string; node: AstNode }> {
  return elements(objectProperty(service, 'mixins')).flatMap((node) => {
    const name = identifier(node)
    return name === undefined ? [] : [{ name, node }]
  })
}

function moduleExportsObject(ast: AstNode): AstNode | undefined {
  let found: AstNode | undefined
  walk(ast, (node) => {
    if (found !== undefined || node.type !== 'AssignmentExpression') {
      return
    }
    if (isModuleExports(node.left) && isNode(node.right) && node.right.type === 'ObjectExpression') {
      found = node.right
    }
  })
  return found
}

function isModuleExports(value: unknown): boolean {
  if (!isNode(value) || value.type !== 'MemberExpression') {
    return false
  }
  return identifier(value.object) === 'module' && memberName(value) === 'exports'
}
