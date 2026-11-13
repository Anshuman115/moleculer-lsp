#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { Index } from './index/Index.js'
import { parse } from './parser/moleculerParser.js'
import { collectFiles } from './scanner/files.js'
import { Scanner } from './scanner/scanner.js'
import { Server } from './lsp/server.js'
import { resolveTypeScriptCommand } from './lsp/typescript-command.js'
import { errorMessage, log } from './log.js'
import { VERSION } from './version.js'

const usage = `Usage: moleculer-lsp [options]

Options:
  --stdio                    Start the language server over stdio (default)
  --typescript-fallback      Send requests the index cannot answer, and hover, implementation,
                             call hierarchy and workspace symbol requests, to bundled tsrs
  --typescript-diagnostics   Also report tsrs diagnostics for open files (implies --typescript-fallback)
  --scan <dir>               Index a workspace and print a summary
  --parse <file>             Print symbols and references for one file
  --version                  Print the version
  --help                     Print this help
`

const typescriptFallbackFlag = '--typescript-fallback'
const typescriptDiagnosticsFlag = '--typescript-diagnostics'

async function main(args: string[]): Promise<void> {
  const command = args.find((arg) => arg !== typescriptFallbackFlag && arg !== typescriptDiagnosticsFlag && !arg.startsWith('--stdio'))

  if (command === '--version') {
    process.stdout.write(`moleculer-lsp ${VERSION}\n`)
    return
  }
  if (command === '--help' || command === '-h') {
    process.stdout.write(usage)
    return
  }
  if (command === '--parse') {
    parseFile(args[args.indexOf('--parse') + 1])
    return
  }
  if (command === '--scan') {
    scanWorkspace(args[args.indexOf('--scan') + 1])
    return
  }

  const typescriptDiagnostics = args.includes(typescriptDiagnosticsFlag)
  const typescriptFallback = typescriptDiagnostics || args.includes(typescriptFallbackFlag)
  await new Server(process.stdin, process.stdout, {
    typescript: typescriptFallback ? resolveTypeScriptCommand : undefined,
    typescriptDiagnostics,
  }).run()
}

function parseFile(filePath: string | undefined): void {
  if (filePath === undefined) {
    throw new Error('usage: moleculer-lsp --parse <file>')
  }
  const result = parse(fs.readFileSync(filePath, 'utf8'))
  process.stdout.write(`file: ${filePath}\nnamespace: ${result.namespace ?? '(none)'}\n`)
  process.stdout.write('symbols:\n')
  for (const declaration of result.declarations) {
    process.stdout.write(`  ${declaration.name} [${declaration.kind}] ${declaration.line + 1}:${declaration.column + 1}\n`)
  }
  process.stdout.write('references:\n')
  for (const reference of result.references) {
    process.stdout.write(`  ${reference.target} [${reference.kind}] ${reference.span.line + 1}:${reference.span.column + 1}\n`)
  }
  process.stdout.write('mixins:\n')
  for (const mixin of result.mixins) {
    process.stdout.write(`  ${mixin.mixinName} -> ${mixin.requirePath}\n`)
  }
}

function scanWorkspace(rootPath: string | undefined): void {
  if (rootPath === undefined) {
    throw new Error('usage: moleculer-lsp --scan <root>')
  }
  const index = new Index()
  const scanner = new Scanner(index)
  const started = Date.now()
  const result = scanner.scan(collectFiles(path.resolve(rootPath)))
  const stats = index.stats()

  process.stdout.write(`root: ${rootPath}\n`)
  process.stdout.write(`files: ${result.fileCount}\n`)
  process.stdout.write(`symbols: ${stats.symbolCount}\n`)
  process.stdout.write(`references: ${stats.referenceCount}\n`)
  process.stdout.write(`elapsed: ${Date.now() - started}ms\n`)
  process.stdout.write(`mixin failures: ${result.mixinFailures.length}\n`)
  process.stdout.write(`unresolved references: ${result.dropped.length}\n`)

  const byReason = new Map<string, number>()
  for (const dropped of result.dropped) {
    byReason.set(dropped.reason, (byReason.get(dropped.reason) ?? 0) + 1)
  }
  for (const [reason, count] of [...byReason].sort((a, b) => b[1] - a[1])) {
    process.stdout.write(`  ${reason}: ${count}\n`)
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  log(errorMessage(error))
  process.exit(1)
})
