export function log(message: string): void {
  process.stderr.write(`[moleculer-lsp] ${message}\n`)
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
