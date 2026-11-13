import { column, line, objectProperty, parseSource, properties, propertyKey, isNode, type AstNode } from './ast.js'
import { declarationKeys, hookPhases, mixinNames, moleculerObject, serviceNamespace, symbolBlocks } from './schema.js'
import { SymbolKind } from '../types.js'

export interface OutlineNode {
  name: string
  kind: SymbolKind | 'group' | 'mixin' | 'hookPhase' | 'hook'
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

export function outline(filePath: string, source: string): DocumentOutline | undefined {
  const service = serviceObject(source)
  if (service === undefined) {
    return undefined
  }
  const groups = [...mixinGroup(service), ...blockGroups(service), ...hookGroup(service)]
  const name = serviceNamespace(service) ?? fileStem(filePath)
  return { name, line: line(service), column: column(service), groups }
}

function mixinGroup(service: AstNode): OutlineNode[] {
  const mixins = objectProperty(service, 'mixins')
  if (mixins === undefined) {
    return []
  }
  return [group('mixins', mixins, mixinNames(service).map(({ name, node }) => leaf(name, 'mixin', node)))]
}

function blockGroups(service: AstNode): OutlineNode[] {
  return symbolBlocks.flatMap(([blockName, kind]) => {
    const block = objectProperty(service, blockName)
    if (block === undefined) {
      return []
    }
    return [group(blockName, block, declarationKeys(block).map(({ name, key }) => leaf(name, kind, key)))]
  })
}

function hookGroup(service: AstNode): OutlineNode[] {
  const hooks = objectProperty(service, 'hooks')
  if (hooks === undefined) {
    return []
  }
  const phases = hookPhases.flatMap((phase) => {
    const phaseValue = objectProperty(hooks, phase)
    if (phaseValue === undefined) {
      return []
    }
    const actions = properties(phaseValue).flatMap((property) => {
      const action = propertyKey(property)
      return action === undefined ? [] : [leaf(action, 'hook', isNode(property.key) ? property.key : property)]
    })
    return [group(phase, phaseValue, actions, 'hookPhase')]
  })
  return [group('hooks', hooks, phases)]
}

function group(name: string, source: AstNode, children: OutlineNode[], kind: OutlineNode['kind'] = 'group'): OutlineNode {
  return { name, kind, line: line(source), column: column(source), children }
}

function leaf(name: string, kind: OutlineNode['kind'], source: AstNode): OutlineNode {
  return { name, kind, line: line(source), column: column(source), children: [] }
}

function fileStem(filePath: string): string {
  return (filePath.split('/').pop() ?? filePath).replace(/\.js$/, '')
}

function serviceObject(source: string): AstNode | undefined {
  try {
    return moleculerObject(parseSource(source))
  } catch {
    return undefined
  }
}
