import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { errorMessage } from '../log.js'

export interface TypeScriptCommand {
  command: string
  args: string[]
}

export function resolveTypeScriptCommand(): TypeScriptCommand {
  try {
    const manifestPath = createRequire(import.meta.url).resolve('tsrs/package.json')
    const binPath = path.join(path.dirname(manifestPath), 'bin', 'tsrs')
    fs.accessSync(binPath, fs.constants.R_OK)
    return { command: process.execPath, args: [binPath, '--lsp', '--stdio'] }
  } catch (error) {
    throw new Error(`Bundled tsrs is unavailable; reinstall moleculer-lsp with optional dependencies enabled. ${errorMessage(error)}`)
  }
}
