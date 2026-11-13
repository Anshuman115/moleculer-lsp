import fs from 'node:fs'
import path from 'node:path'

const skipDirs = new Set(['node_modules', '.git', '.vscode', 'dist', 'build', 'coverage', '.next', 'out'])
const configFiles = ['moleculer.config.js', 'moleculer.config.cjs', 'moleculer.config.mjs', 'moleculer.config.json', 'moleculer.config.ts']
const dependencyFields = ['dependencies', 'devDependencies', 'peerDependencies']

export function isSourceFile(filePath: string): boolean {
  return filePath.endsWith('.js')
}

export function isSkippedPath(rootPath: string, filePath: string): boolean {
  return path.relative(rootPath, filePath).split(path.sep).some((part) => skipDirs.has(part))
}

export function collectFiles(rootPath: string): string[] {
  const results: string[] = []
  const visit = (dir: string): void => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory() && !skipDirs.has(entry.name)) {
        visit(fullPath)
      } else if (entry.isFile() && isSourceFile(fullPath)) {
        results.push(fullPath)
      }
    }
  }
  visit(rootPath)
  return results
}

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
