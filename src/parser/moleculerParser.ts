import {
  elements,
  firstArgument,
  identifier,
  isNode,
  memberName,
  nameSpan,
  objectProperty,
  parseSource,
  properties,
  propertyValue,
  staticStringValue,
  stringValue,
  walk,
  type AstNode,
} from './ast.js'
import { declarationKeys, hookPhases, mixinNames, moleculerObject, reservedThisProps, serviceNamespace, symbolBlocks } from './schema.js'
import { ReferenceKind, SymbolKind, type Declaration, type MixinRequest, type ParseResult, type Reference } from '../types.js'

export function parse(source: string): ParseResult {
  const ast = parseSource(source)
  const service = moleculerObject(ast)
  if (service === undefined) {
    return { namespace: undefined, declarations: classMethods(ast), references: callReferences(ast), mixins: [] }
  }
  return {
    namespace: serviceNamespace(service),
    declarations: blockDeclarations(service),
    references: [...callReferences(ast), ...hookReferences(service)],
    mixins: mixinRequests(service, requirePaths(ast)),
  }
}

function blockDeclarations(service: AstNode): Declaration[] {
  return symbolBlocks.flatMap(([blockName, kind]) =>
    declarationKeys(objectProperty(service, blockName)).map(({ name, key }) => declaration(name, kind, key)))
}

function classMethods(ast: AstNode): Declaration[] {
  const declarations: Declaration[] = []
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
      if (name !== undefined && name !== 'constructor') {
        declarations.push(declaration(name, SymbolKind.Method, member.key))
      }
    }
  })
  return declarations
}

function declaration(name: string, kind: SymbolKind, key: AstNode): Declaration {
  const { line, column } = nameSpan(key, name)
  return { name, kind, line, column }
}

function requirePaths(ast: AstNode): Map<string, string> {
  const paths = new Map<string, string>()
  walk(ast, (node) => {
    if (node.type !== 'VariableDeclarator') {
      return
    }
    const name = identifier(node.id)
    const init = node.init
    if (name === undefined || !isNode(init) || init.type !== 'CallExpression' || identifier(init.callee) !== 'require') {
      return
    }
    const target = stringValue(firstArgument(init))
    if (target !== undefined) {
      paths.set(name, target)
    }
  })
  return paths
}

function mixinRequests(service: AstNode, paths: Map<string, string>): MixinRequest[] {
  return mixinNames(service).map(({ name }) => ({ mixinName: name, requirePath: paths.get(name) ?? '' }))
}

function callReferences(ast: AstNode): Reference[] {
  const references: Reference[] = []
  walk(ast, (node) => {
    if (node.type !== 'CallExpression' || !isNode(node.callee) || node.callee.type !== 'MemberExpression') {
      return
    }
    const reference = callReference(node, node.callee)
    if (reference !== undefined) {
      references.push(reference)
    }
  })
  return references
}

function callReference(call: AstNode, callee: AstNode): Reference | undefined {
  const method = memberName(callee)
  if (method === undefined) {
    return undefined
  }
  if (method === 'call' || method === 'emit' || method === 'broadcast') {
    const kind = method === 'call' ? ReferenceKind.Action : ReferenceKind.Event
    return isBrokerLike(callee.object) ? stringArgument(call, kind, stringValue) : undefined
  }
  if (method === 'publish') {
    return isThis(callee.object) ? stringArgument(call, ReferenceKind.Event, staticStringValue) : undefined
  }
  if (method === 'sendToChannel') {
    return isBrokerLike(callee.object) ? stringArgument(call, ReferenceKind.Channel, staticStringValue) : undefined
  }
  return selfCall(callee, method)
}

function stringArgument(call: AstNode, kind: ReferenceKind, read: (node: unknown) => string | undefined): Reference | undefined {
  const argument = firstArgument(call)
  const target = read(argument)
  return argument === undefined || target === undefined ? undefined : { kind, target, span: nameSpan(argument, target) }
}

function selfCall(callee: AstNode, method: string): Reference | undefined {
  const object = callee.object
  if (!isNode(object)) {
    return undefined
  }
  const holder = isThis(object) ? method : isThis(object.object) && object.type === 'MemberExpression' ? memberName(object) : undefined
  if (holder === undefined || reservedThisProps.has(holder)) {
    return undefined
  }
  const anchor = isNode(callee.property) ? callee.property : callee
  return { kind: ReferenceKind.Self, target: method, span: nameSpan(anchor, method) }
}

function hookReferences(service: AstNode): Reference[] {
  const hooks = objectProperty(service, 'hooks')
  return hookPhases.flatMap((phase) => properties(objectProperty(hooks, phase)).flatMap((action) => {
    const value = propertyValue(action)
    const nodes = value === undefined ? [] : value.type === 'ArrayExpression' ? elements(value) : [value]
    return nodes.flatMap((node) => {
      const name = stringValue(node)
      if (name === undefined || name.length === 0 || name.includes('.')) {
        return []
      }
      return [{ kind: ReferenceKind.Self, target: name, span: nameSpan(node, name) }]
    })
  }))
}

function isThis(value: unknown): boolean {
  return isNode(value) && value.type === 'ThisExpression'
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
  return isThis(value.object) || identifier(value.object) === 'ctx'
}
