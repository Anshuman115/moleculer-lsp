export function log(message: string): void {
  process.stderr.write(`[moleculer-lsp] ${message}\n`)
}
