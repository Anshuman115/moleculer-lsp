import fs from 'node:fs'
import path from 'node:path'

const configFiles = ['moleculer.config.js', 'moleculer.config.cjs', 'moleculer.config.mjs', 'moleculer.config.json', 'moleculer.config.ts']
const dependencyFields = ['dependencies', 'devDependencies', 'peerDependencies']

export function isMoleculerWorkspace(startPath: string): boolean {
  let dir = path.resolve(startPath)
  while (true) {
    if (configFiles.some((name) => fs.existsSync(path.join(dir, name))) || dependsOnMoleculer(dir)) {
      return true
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      return false
    }
    dir = parent
  }
}

function dependsOnMoleculer(dir: string): boolean {
  let manifest: unknown
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  } catch {
    return false
  }
  if (typeof manifest !== 'object' || manifest === null) {
    return false
  }
  const record = manifest as Record<string, unknown>
  return dependencyFields.some((field) => {
    const dependencies = record[field]
    return typeof dependencies === 'object' && dependencies !== null && 'moleculer' in dependencies
  })
}
