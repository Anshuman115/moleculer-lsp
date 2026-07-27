import {
  column,
  elements,
  firstArgument,
  firstStringArgument,
  identifier,
  isNode,
  line,
  memberName,
  numberValue,
  objectProperty,
  parseSource,
  properties,
  propertyKey,
  propertyValue,
  staticStringValue,
  stringValue,
  walk,
  type AstNode,
} from './ast.js'
import { ReferenceKind, SymbolKind, type DocumentOutline, type MixinRequest, type OutlineNode, type ParseResult, type Reference, type Symbol } from '../types.js'

const reservedThisProps = new Set([
  'broker', 'logger', 'actions', 'settings', 'metadata', 'schema', 'Promise', 'name', 'version',
])

const symbolBlocks: Array<[string, SymbolKind]> = [
  ['actions', SymbolKind.Action],
  ['events', SymbolKind.Event],
  ['methods', SymbolKind.Method],
  ['channels', SymbolKind.Channel],
]

export class MoleculerParser {
  parse(filePath: string, source: string): ParseResult {
    const ast = parseSource(source)
    const service = findServiceObject(ast)
    if (service === undefined) {
      return this.parsePlainFile(filePath, ast)
    }
    const named = hasServiceName(service)
    const namespace = serviceNamespace(filePath, service)
    const symbols = extractSymbols(service, namespace)
    if (!named && symbols.length === 0) {
      return this.parsePlainFile(filePath, ast)
    }
    return {
      symbols,
      references: [...extractReferences(ast), ...extractHookReferences(service)],
      mixins: extractMixins(service, filePath, requirePaths(ast)),
      isService: named,
      outline: extractOutline(service, named ? namespace : outlineName(filePath)),
    }
  }

  namespaceOf(filePath: string, source: string): string {
    const service = findServiceObject(parseSource(source))
    return service === undefined ? fallbackNamespace(filePath) : serviceNamespace(filePath, service)
  }

  private parsePlainFile(filePath: string, ast: AstNode): ParseResult {
    const namespace = fallbackNamespace(filePath)
    return {
      symbols: extractClassMethods(ast, namespace),
      references: extractReferences(ast),
      mixins: [],
      isService: false,
    }
  }
}

function findServiceObject(ast: AstNode): AstNode | undefined {
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

function hasServiceName(service: AstNode): boolean {
  const name = stringValue(objectProperty(service, 'name'))
  return name !== undefined && name.length > 0
}

function serviceNamespace(filePath: string, service: AstNode): string {
  const name = stringValue(objectProperty(service, 'name')) ?? ''
  if (name.length === 0) {
    return fallbackNamespace(filePath)
  }
  const version = numberValue(objectProperty(service, 'version')) ?? 0
  return version > 0 ? `v${version}.${name}` : name
}

function fallbackNamespace(filePath: string): string {
  const base = filePath.split('/').pop() ?? ''
  const stem = base.replace(/\.mixins?\.js$/, '').replace(/\.js$/, '')
  let hash = 0
  for (let i = 0; i < filePath.length; i += 1) {
    hash = ((hash << 5) - hash + filePath.charCodeAt(i)) | 0
  }
  return `#file_${stem}_${Math.abs(hash).toString(36)}`
}

export function isFileNamespace(namespace: string): boolean {
  return namespace.startsWith('#file_')
}

function extractSymbols(service: AstNode, namespace: string): Symbol[] {
  return symbolBlocks.flatMap(([blockName, kind]) => {
    const block = objectProperty(service, blockName)
    return properties(block).flatMap((property) => {
      const name = propertyKey(property)
      if (name === undefined || name === 'handler') {
        return []
      }
      const key = isNode(property.key) ? property.key : property
      return [{
        id: 0,
        name,
        fullName: `${namespace}.${name}`,
        namespace,
        kind,
        fileId: 0,
        sourceFileId: 0,
        line: line(key),
        column: column(key),
      }]
    })
  })
}

function extractOutline(service: AstNode, name: string): DocumentOutline {
  const groups: OutlineNode[] = []
  const mixins = objectProperty(service, 'mixins')
  if (mixins !== undefined) {
    groups.push(group('mixins', mixins, elements(mixins).flatMap((mixin) => {
      const mixinName = identifier(mixin)
      return mixinName === undefined ? [] : [node(mixinName, 'mixin', mixin)]
    })))
  }
  for (const [blockName, kind] of symbolBlocks) {
    const block = objectProperty(service, blockName)
    if (block === undefined) {
      continue
    }
    groups.push(group(blockName, block, properties(block).flatMap((property) => {
      const name = propertyKey(property)
      if (name === undefined || name === 'handler') {
        return []
      }
      const key = isNode(property.key) ? property.key : property
      return [node(name, outlineKind(kind), key)]
    })))
  }
  const hooks = objectProperty(service, 'hooks')
  if (hooks !== undefined) {
    groups.push(group('hooks', hooks, ['before', 'after', 'error'].flatMap((phase) => {
      const phaseValue = objectProperty(hooks, phase)
      if (phaseValue === undefined) {
        return []
      }
      return [group(phase, phaseValue, properties(phaseValue).flatMap((property) => {
        const action = propertyKey(property)
        const key = isNode(property.key) ? property.key : property
        return action === undefined ? [] : [node(action, 'hook', key)]
      }), 'hookPhase')]
    })))
  }
  return { name, line: line(service), column: column(service), groups }
}

function group(name: string, source: AstNode, children: OutlineNode[], kind: OutlineNode['kind'] = 'group'): OutlineNode {
  return { name, kind, line: line(source), column: column(source), children }
}

function node(name: string, kind: OutlineNode['kind'], source: AstNode): OutlineNode {
  return { name, kind, line: line(source), column: column(source), children: [] }
}

function outlineKind(kind: SymbolKind): OutlineNode['kind'] {
  if (kind === SymbolKind.Action) return 'action'
  if (kind === SymbolKind.Event) return 'event'
  if (kind === SymbolKind.Channel) return 'channel'
  return 'method'
}

function outlineName(filePath: string): string {
  const base = filePath.split('/').pop() ?? filePath
  return base.replace(/\.js$/, '')
}

function extractClassMethods(ast: AstNode, namespace: string): Symbol[] {
  const symbols: Symbol[] = []
  walk(ast, (node) => {
    if (node.type !== 'ClassDeclaration' && node.type !== 'ClassExpression') {
      return
    }
    const body = node.body
    if (!isNode(body) || !Array.isArray(body.body)) {
      return
    }
    for (const member of body.body) {
      if (!isNode(member) || member.type !== 'MethodDefinition' || !isNode(member.key)) {
        continue
      }
      const name = identifier(member.key)
      if (name === undefined || name === 'constructor') {
        continue
      }
      symbols.push({
        id: 0,
        name,
        fullName: `${namespace}.${name}`,
        namespace,
        kind: SymbolKind.Method,
        fileId: 0,
        sourceFileId: 0,
        line: line(member.key),
        column: column(member.key),
      })
    }
  })
  return symbols
}

function requirePaths(ast: AstNode): Map<string, string> {
  const paths = new Map<string, string>()
  walk(ast, (node) => {
    if (node.type !== 'VariableDeclarator') {
      return
    }
    const name = identifier(node.id)
    const init = node.init
    if (name === undefined || !isNode(init) || init.type !== 'CallExpression') {
      return
    }
    if (identifier(init.callee) !== 'require') {
      return
    }
    const target = firstStringArgument(init)
    if (target !== undefined) {
      paths.set(name, target)
    }
  })
  return paths
}

function extractMixins(service: AstNode, filePath: string, paths: Map<string, string>): MixinRequest[] {
  return elements(objectProperty(service, 'mixins')).flatMap((element) => {
    const mixinName = identifier(element)
    if (mixinName === undefined) {
      return []
    }
    return [{ mixinName, requirePath: paths.get(mixinName) ?? '', sourceFile: filePath }]
  })
}

function extractReferences(ast: AstNode): Reference[] {
  const references: Reference[] = []
  walk(ast, (node) => {
    if (node.type !== 'CallExpression' || !isNode(node.callee) || node.callee.type !== 'MemberExpression') {
      return
    }
    const callee = node.callee
    const method = memberName(callee)
    if (method === undefined) {
      return
    }

    if (method === 'call' || method === 'emit' || method === 'broadcast') {
      const target = firstStringArgument(node)
      if (target !== undefined && isBrokerLike(callee.object)) {
        const arg = firstArgument(node)
        references.push({
          fullName: target,
          location: { fileId: 0, line: line(arg ?? node), column: column(arg ?? node) },
          kind: referenceKind(method),
        })
      }
      return
    }

    if (method === 'publish' || method === 'sendToChannel') {
      const arg = firstArgument(node)
      const target = staticStringValue(arg)
      if (target !== undefined && isPublishLike(callee.object, method)) {
        references.push({
          fullName: target,
          location: { fileId: 0, line: line(arg ?? node), column: column(arg ?? node) },
          kind: method === 'sendToChannel' ? ReferenceKind.Broadcast : ReferenceKind.Emit,
        })
      }
      return
    }

    const selfName = selfCallName(callee, method)
    if (selfName !== undefined) {
      const anchor = isNode(callee.property) ? callee.property : callee
      references.push({
        fullName: selfName,
        location: { fileId: 0, line: line(anchor), column: column(anchor) },
        kind: ReferenceKind.Call,
      })
    }
  })
  return references
}

function isPublishLike(value: unknown, method: string): boolean {
  if (method === 'publish') {
    return isNode(value) && value.type === 'ThisExpression'
  }
  return isBrokerLike(value)
}

function selfCallName(callee: AstNode, method: string): string | undefined {
  const object = callee.object
  if (!isNode(object)) {
    return undefined
  }
  if (object.type === 'ThisExpression') {
    return reservedThisProps.has(method) ? undefined : selfRef(method)
  }
  if (object.type === 'MemberExpression' && isNode(object.object) && object.object.type === 'ThisExpression') {
    const holder = memberName(object)
    return holder === undefined || reservedThisProps.has(holder) ? undefined : selfRef(method)
  }
  return undefined
}

function extractHookReferences(service: AstNode): Reference[] {
  const references: Reference[] = []
  const hooks = objectProperty(service, 'hooks')
  if (hooks === undefined) {
    return references
  }
  for (const phase of ['before', 'after', 'error']) {
    const phaseValue = objectProperty(hooks, phase)
    if (phaseValue === undefined) {
      continue
    }
    for (const action of properties(phaseValue)) {
      const value = propertyValue(action)
      if (value === undefined) {
        continue
      }
      const nodes = value.type === 'ArrayExpression' ? elements(value) : [value]
      for (const node of nodes) {
        const name = stringValue(node)
        if (name !== undefined && name.length > 0 && !name.includes('.')) {
          references.push({
            fullName: selfRef(name),
            location: { fileId: 0, line: line(node), column: column(node) },
            kind: ReferenceKind.Call,
          })
        }
      }
    }
  }
  return references
}

function isBrokerLike(value: unknown): boolean {
  if (!isNode(value)) {
    return false
  }
  const name = identifier(value)
  if (name === 'ctx' || name === 'broker') {
    return true
  }
  if (value.type !== 'MemberExpression' || memberName(value) !== 'broker') {
    return false
  }
  const object = value.object
  return isNode(object) && (object.type === 'ThisExpression' || identifier(object) === 'ctx')
}

function referenceKind(method: string): ReferenceKind {
  if (method === 'emit') {
    return ReferenceKind.Emit
  }
  if (method === 'broadcast') {
    return ReferenceKind.Broadcast
  }
  return ReferenceKind.Call
}

export const SELF_PREFIX = '#self.'

export function selfRef(method: string): string {
  return `${SELF_PREFIX}${method}`
}

export function isSelfRef(fullName: string): boolean {
  return fullName.startsWith(SELF_PREFIX)
}

export function selfMethod(fullName: string): string {
  return fullName.slice(SELF_PREFIX.length)
}
