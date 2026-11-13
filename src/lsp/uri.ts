import { fileURLToPath, pathToFileURL } from 'node:url'

export function uriToPath(uri: string): string {
  return uri.startsWith('file:') ? fileURLToPath(uri) : uri
}

export function pathToUri(filePath: string): string {
  return pathToFileURL(filePath).toString()
}
