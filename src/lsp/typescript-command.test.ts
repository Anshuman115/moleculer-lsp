import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveTypeScriptCommand } from './typescript-command.js'

const resolve = vi.hoisted(() => vi.fn())
vi.mock('node:module', () => ({ createRequire: () => ({ resolve }) }))

afterEach(() => {
  vi.restoreAllMocks()
  resolve.mockReset()
})

describe('resolveTypeScriptCommand', () => {
  it('runs only the bundled tsrs launcher with Node without a shell', () => {
    const packageDir = path.resolve('installation with spaces', 'node_modules', 'tsrs')
    resolve.mockReturnValue(path.join(packageDir, 'package.json'))
    vi.spyOn(fs, 'accessSync').mockReturnValue(undefined)

    expect(resolveTypeScriptCommand()).toEqual({
      command: process.execPath,
      args: [path.join(packageDir, 'bin', 'tsrs'), '--lsp', '--stdio'],
    })
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(resolve).toHaveBeenCalledWith('tsrs/package.json')
  })

  it('explains how to repair a missing bundled package instead of discovering another server', () => {
    resolve.mockImplementation(() => { throw new Error('Cannot find tsrs/package.json') })

    expect(() => resolveTypeScriptCommand()).toThrow(/Bundled tsrs is unavailable; reinstall moleculer-lsp/)
  })

  it('reports a broken bundled launcher explicitly', () => {
    resolve.mockReturnValue(path.resolve('node_modules/tsrs/package.json'))
    vi.spyOn(fs, 'accessSync').mockImplementation(() => { throw new Error('launcher is missing') })

    expect(() => resolveTypeScriptCommand()).toThrow(/launcher is missing/)
  })
})
