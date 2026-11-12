#!/usr/bin/env node
import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const serverPath = fileURLToPath(new URL('../dist/main.js', import.meta.url))
const ignored = new Set(['node_modules', '.git', 'dist', 'build', 'coverage'])
const samplesPerKind = 20
const warmRounds = 5
const requestTimeoutMs = 30000

class Client {
  constructor(command, args, cwd) {
    this.child = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'ignore'] })
    this.buffer = Buffer.alloc(0)
    this.nextId = 1
    this.pending = new Map()
    this.listeners = []
    this.child.stdout.on('data', (chunk) => this.receive(chunk))
  }

  request(method, params) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${method} timed out`)), requestTimeoutMs)
      this.pending.set(id, (result) => {
        clearTimeout(timer)
        resolve(result)
      })
      this.send({ jsonrpc: '2.0', id, method, params })
    })
  }

  notify(method, params) {
    this.send({ jsonrpc: '2.0', method, params })
  }

  waitFor(predicate, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for notification')), timeoutMs)
      this.listeners.push((message) => {
        if (!predicate(message)) {
          return false
        }
        clearTimeout(timer)
        resolve(message)
        return true
      })
    })
  }

  send(payload) {
    const body = Buffer.from(JSON.stringify(payload))
    this.child.stdin.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]))
  }

  receive(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n')
      if (headerEnd < 0) {
        return
      }
      const length = Number(/content-length:\s*(\d+)/i.exec(this.buffer.subarray(0, headerEnd).toString())?.[1] ?? 0)
      if (this.buffer.length < headerEnd + 4 + length) {
        return
      }
      const message = JSON.parse(this.buffer.subarray(headerEnd + 4, headerEnd + 4 + length).toString())
      this.buffer = this.buffer.subarray(headerEnd + 4 + length)
      this.dispatch(message)
    }
  }

  dispatch(message) {
    if (message.id !== undefined && message.method !== undefined) {
      const items = message.method === 'workspace/configuration' ? message.params?.items : undefined
      this.send({ jsonrpc: '2.0', id: message.id, result: Array.isArray(items) ? items.map(() => null) : null })
      return
    }
    if (message.id !== undefined) {
      this.pending.get(message.id)?.(message.result)
      this.pending.delete(message.id)
      return
    }
    this.listeners = this.listeners.filter((listener) => !listener(message))
  }

  async stop() {
    await this.request('shutdown', null)
    this.notify('exit', null)
    this.child.kill()
  }
}

function listFiles(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) {
      continue
    }
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      listFiles(fullPath, files)
    } else if (entry.name.endsWith('.js')) {
      files.push(fullPath)
    }
  }
  return files.sort()
}

function positionAt(text, offset) {
  const before = text.slice(0, offset)
  const line = before.split('\n').length - 1
  return { line, character: offset - before.lastIndexOf('\n') - 1 }
}

function findSamples(files) {
  const calls = []
  const imports = []
  for (const filePath of files) {
    const text = fs.readFileSync(filePath, 'utf8')
    for (const match of text.matchAll(/\b(?:ctx|broker|this\.broker)\.call\(\s*["'`]([\w$-]+\.[\w.$-]+)["'`]/g)) {
      const offset = match.index + match[0].length - 1 - match[1].length + match[1].lastIndexOf('.') + 1
      calls.push({ filePath, text, position: positionAt(text, offset) })
    }
    for (const match of text.matchAll(/\b(?:const\s+(\w+)\s*=\s*require\(\s*["']\.[^"']+["']\s*\)|import\s+(\w+)\s+from\s+["']\.[^"']+["'])/g)) {
      const name = match[1] ?? match[2]
      const usage = new RegExp(`\\b${name}\\.(\\w+)\\(`).exec(text.slice(match.index + match[0].length))
      if (usage !== null) {
        const offset = match.index + match[0].length + usage.index + name.length + 1
        imports.push({ filePath, text, position: positionAt(text, offset) })
      }
    }
    for (const match of text.matchAll(/\bimport\s*\{([^}]+)\}\s*from\s*["']\.[^"']+["']/g)) {
      const name = match[1].split(',')[0].trim().split(/\s+as\s+/).pop()
      const usage = new RegExp(`\\b${name}\\b`).exec(text.slice(match.index + match[0].length))
      if (usage !== null) {
        imports.push({ filePath, text, position: positionAt(text, match.index + match[0].length + usage.index) })
      }
    }
  }
  return { calls: spread(calls), imports: spread(imports) }
}

function spread(items) {
  const step = Math.max(1, Math.floor(items.length / samplesPerKind))
  return items.filter((_, index) => index % step === 0).slice(0, samplesPerKind)
}

function progress(message) {
  process.stderr.write(`${message}\n`)
}

async function timed(action) {
  const started = performance.now()
  const result = await action()
  return { ms: performance.now() - started, result }
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const pick = (ratio) => sorted[Math.min(sorted.length - 1, Math.floor(ratio * sorted.length))]
  return { n: sorted.length, p50: pick(0.5), p95: pick(0.95), max: sorted[sorted.length - 1] }
}

function uriOf(filePath) {
  return pathToFileURL(filePath).href
}

function rssMb(pid) {
  try {
    return Number(execFileSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' }).trim()) / 1024
  } catch {
    return undefined
  }
}

function childPids(pid) {
  try {
    return execFileSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).map(Number)
  } catch {
    return []
  }
}

async function start(command, args, root) {
  const client = new Client(command, args, root)
  const initialize = await timed(() => client.request('initialize', {
    processId: process.pid,
    rootUri: uriOf(root),
    capabilities: { textDocument: { publishDiagnostics: {} } },
  }))
  client.notify('initialized', {})
  return { client, initializeMs: initialize.ms }
}

function open(client, sample, opened) {
  if (!opened.has(sample.filePath)) {
    client.notify('textDocument/didOpen', { textDocument: { uri: uriOf(sample.filePath), languageId: 'javascript', version: 1, text: sample.text } })
    opened.add(sample.filePath)
    if (client.pullDiagnosticsOnOpen) {
      client.request('textDocument/diagnostic', { textDocument: { uri: uriOf(sample.filePath) } }).catch(() => undefined)
    }
  }
}

async function measure(client, method, samples, extra = {}) {
  progress(`${method} on ${samples.length} samples`)
  const opened = new Set()
  const first = []
  const warm = []
  let answered = 0
  for (const sample of samples) {
    open(client, sample, opened)
    const params = { textDocument: { uri: uriOf(sample.filePath) }, position: sample.position, ...extra }
    const cold = await timed(() => client.request(method, params))
    first.push(cold.ms)
    answered += hasAnswer(cold.result) ? 1 : 0
    for (let round = 0; round < warmRounds; round += 1) {
      const { ms } = await timed(() => client.request(method, params))
      if (ms > 100) {
        progress(`slow ${method} ${sample.filePath}:${sample.position.line + 1}:${sample.position.character + 1} round ${round + 1}: ${Math.round(ms)}ms`)
      }
      warm.push(ms)
    }
  }
  return { method, answered: `${answered}/${samples.length}`, first: stats(first), warm: stats(warm) }
}

function hasAnswer(result) {
  return Array.isArray(result) ? result.length > 0 : result !== null && result !== undefined
}

async function editLoop(client, sample) {
  const uri = uriOf(sample.filePath)
  progress(`edit loop on ${sample.filePath}`)
  const lineCount = sample.text.split('\n').length
  const published = (predicate) => client.waitFor((message) => message.method === 'textDocument/publishDiagnostics'
    && message.params.uri === uri && predicate(message.params.diagnostics))
  const pastEnd = (diagnostics) => diagnostics.some((diagnostic) => diagnostic.range.start.line >= lineCount)

  const broken = published(pastEnd)
  const editStarted = performance.now()
  client.notify('textDocument/didChange', { textDocument: { uri, version: 2 }, contentChanges: [{ text: `${sample.text}\nconst moleculerLspBenchmark = (\n` }] })
  await broken
  const typescriptDiagnosticsMs = performance.now() - editStarted

  const fixed = published((diagnostics) => !pastEnd(diagnostics))
  const fixStarted = performance.now()
  client.notify('textDocument/didChange', { textDocument: { uri, version: 3 }, contentChanges: [{ text: sample.text }] })
  await fixed
  const typescriptClearedMs = performance.now() - fixStarted

  const rescanned = published(() => true)
  const saveStarted = performance.now()
  client.notify('textDocument/didSave', { textDocument: { uri } })
  await new Promise((resolve) => setTimeout(resolve, 300))
  const duringRescan = await timed(() => client.request('textDocument/definition', { textDocument: { uri }, position: sample.position }))
  await rescanned
  return {
    typescriptDiagnosticsMs,
    typescriptClearedMs,
    saveToMoleculerDiagnosticsMs: performance.now() - saveStarted,
    definitionDuringRescanMs: duringRescan.ms,
  }
}

function typescriptCommand() {
  const manifest = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url))
  return [process.execPath, [manifest, '--lsp', '--stdio']]
}

async function benchmarkServer(root, samples, flag) {
  progress(`moleculer-lsp ${flag}`)
  const { client, initializeMs } = await start(process.execPath, [serverPath, '--stdio', flag], root)
  const opened = new Set()
  const firstCall = samples.calls[0] ?? samples.imports[0]
  open(client, firstCall, opened)
  const indexReady = await timed(() => client.request('textDocument/definition', { textDocument: { uri: uriOf(firstCall.filePath) }, position: firstCall.position }))
  const firstImport = samples.imports[0]
  const typescriptReady = firstImport === undefined ? undefined
    : await timed(() => client.request('textDocument/definition', { textDocument: { uri: uriOf(firstImport.filePath) }, position: firstImport.position }))
  const results = [
    await measure(client, 'textDocument/definition', samples.calls),
    await measure(client, 'textDocument/references', samples.calls, { context: { includeDeclaration: false } }),
    await measure(client, 'textDocument/definition', samples.imports),
    await measure(client, 'textDocument/hover', samples.imports),
  ]
  const edit = samples.calls[0] === undefined || flag !== '--typescript-diagnostics' ? undefined : await editLoop(client, samples.calls[0])
  const memory = { server: rssMb(client.child.pid), typescript: childPids(client.child.pid).map(rssMb).reduce((sum, value) => sum + (value ?? 0), 0) }
  await client.stop()
  return { initializeMs, firstAnswerMs: indexReady.ms, firstTypescriptAnswerMs: typescriptReady?.ms, results, edit, memory }
}

async function benchmarkTypescript(root, samples, pullDiagnostics) {
  progress(`typescript only${pullDiagnostics ? ' with diagnostics' : ''}`)
  const [command, args] = typescriptCommand()
  const { client } = await start(command, args, root)
  client.pullDiagnosticsOnOpen = pullDiagnostics
  const firstImport = samples.imports[0]
  const ready = firstImport === undefined ? undefined : await timed(async () => {
    open(client, firstImport, new Set())
    return client.request('textDocument/definition', { textDocument: { uri: uriOf(firstImport.filePath) }, position: firstImport.position })
  })
  const results = [
    await measure(client, 'textDocument/definition', samples.calls),
    await measure(client, 'textDocument/references', samples.calls, { context: { includeDeclaration: false } }),
    await measure(client, 'textDocument/definition', samples.imports),
    await measure(client, 'textDocument/hover', samples.imports),
  ]
  const memory = rssMb(client.child.pid)
  await client.stop()
  return { firstAnswerMs: ready?.ms, results, memory }
}

function scanSummary(root) {
  const output = execFileSync(process.execPath, [serverPath, '--scan', root], { encoding: 'utf8' })
  return output.split('\n').filter((line) => /^(files|symbols|references|time|indexed)/i.test(line)).join('; ')
}

async function main() {
  const root = path.resolve(process.argv[2] ?? '.')
  const files = listFiles(root)
  const samples = findSamples(files)
  const report = {
    root,
    node: process.version,
    files: files.length,
    samples: { calls: samples.calls.length, imports: samples.imports.length },
    scan: scanSummary(root),
    moleculerLspDiagnostics: await benchmarkServer(root, samples, '--typescript-diagnostics'),
    moleculerLspFallback: await benchmarkServer(root, samples, '--typescript-fallback'),
    typescriptOnlyDiagnostics: await benchmarkTypescript(root, samples, true),
    typescriptOnly: await benchmarkTypescript(root, samples, false),
  }
  process.stdout.write(`${JSON.stringify(report, (_key, value) => (typeof value === 'number' ? Math.round(value * 10) / 10 : value), 2)}\n`)
}

await main()
process.exit(0)
