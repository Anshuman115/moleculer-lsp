import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveTypeScriptCommand } from './typescript-bridge.js'

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'mol-lsp-bridge-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

function installTypeScript(withTsserver: boolean): void {
  const packageDir = path.join(root, 'node_modules', 'typescript')
  fs.mkdirSync(path.join(packageDir, 'bin'), { recursive: true })
  fs.writeFileSync(path.join(packageDir, 'package.json'), '{"name":"typescript"}')
  fs.writeFileSync(path.join(packageDir, 'bin', 'tsc'), '', { mode: 0o755 })
  if (withTsserver) {
    fs.mkdirSync(path.join(packageDir, 'lib'))
    fs.writeFileSync(path.join(packageDir, 'lib', 'tsserver.js'), '')
  }
  fs.mkdirSync(path.join(root, 'node_modules', '.bin'), { recursive: true })
  fs.symlinkSync(path.join(packageDir, 'bin', 'tsc'), path.join(root, 'node_modules', '.bin', 'tsc'))
}

function installLanguageServer(): string {
  const binDir = path.join(root, 'bin')
  fs.mkdirSync(binDir, { recursive: true })
  fs.writeFileSync(path.join(binDir, 'typescript-language-server'), '', { mode: 0o755 })
  return binDir
}

describe('resolveTypeScriptCommand', () => {
  it('uses tsc --lsp when TypeScript ships without tsserver.js', () => {
    installTypeScript(false)
    const command = resolveTypeScriptCommand(root, installLanguageServer())

    expect(command?.command).toBe(path.join(root, 'node_modules', '.bin', 'tsc'))
    expect(command?.args).toEqual(['--lsp', '--stdio'])
  })

  it('uses typescript-language-server when TypeScript still ships tsserver.js', () => {
    installTypeScript(true)
    const binDir = installLanguageServer()

    expect(resolveTypeScriptCommand(root, binDir)).toEqual({
      command: path.join(binDir, 'typescript-language-server'),
      args: ['--stdio'],
    })
  })

  it('finds nothing when no server is installed or bundled', () => {
    installTypeScript(true)

    expect(resolveTypeScriptCommand(root, '', () => undefined)).toBeUndefined()
  })

  it('resolves the bundled TypeScript 7 by default', () => {
    const command = resolveTypeScriptCommand(root, '')

    expect(command?.command).toBe(process.execPath)
    expect(command?.args[0]).toMatch(/node_modules\/typescript\/bin\/tsc$/)
    expect(command?.args.slice(1)).toEqual(['--lsp', '--stdio'])
  })
})
