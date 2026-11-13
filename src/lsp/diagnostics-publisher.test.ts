import { describe, expect, it } from 'vitest'
import { DiagnosticsMode, DiagnosticsPublisher } from './diagnostics-publisher.js'
import { Documents } from './documents.js'
import { DiagnosticSeverity, type Diagnostic } from './protocol.js'

function diagnostic(message: string): Diagnostic {
  return { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, severity: DiagnosticSeverity.Hint, source: 'test', message }
}

function recorder(mode: DiagnosticsMode) {
  const published: Array<[string, string[]]> = []
  let refreshes = 0
  const documents = new Documents()
  const publisher = new DiagnosticsPublisher({
    publish: (uri, diagnostics) => published.push([uri, diagnostics.map((entry) => entry.message)]),
    refresh: () => { refreshes += 1 },
  }, mode, documents)
  const open = (filePath: string): void => {
    documents.set(filePath, '')
    publisher.open(filePath)
  }
  const close = (filePath: string): void => {
    documents.delete(filePath)
    publisher.close(filePath)
  }
  return { publisher, published, refreshes: () => refreshes, open, close }
}

describe('DiagnosticsPublisher in push mode', () => {
  it('publishes Moleculer and TypeScript diagnostics together, only for open files', () => {
    const { publisher, published, open } = recorder(DiagnosticsMode.Push)
    open('/w/open.js')
    publisher.setMoleculer(new Map([['/w/open.js', [diagnostic('moleculer')]], ['/w/closed.js', [diagnostic('other')]]]))
    publisher.setTypeScript('/w/open.js', [diagnostic('typescript')])

    expect(published).toEqual([
      ['file:///w/open.js', ['moleculer']],
      ['file:///w/open.js', ['moleculer', 'typescript']],
    ])
  })

  it('waits for the first index before publishing an opened file', () => {
    const { publisher, published, open } = recorder(DiagnosticsMode.Push)
    open('/w/a.js')
    expect(published).toEqual([])
    publisher.setMoleculer(new Map())
    expect(published).toEqual([['file:///w/a.js', []]])
  })

  it('clears a closed file and drops its TypeScript diagnostics', () => {
    const { publisher, published, open, close } = recorder(DiagnosticsMode.Push)
    publisher.setMoleculer(new Map())
    open('/w/a.js')
    publisher.setTypeScript('/w/a.js', [diagnostic('typescript')])
    close('/w/a.js')

    expect(published.at(-1)).toEqual(['file:///w/a.js', []])
    expect(publisher.report('/w/a.js')).toEqual([])
  })

  it('ignores TypeScript diagnostics for files the client has not opened', () => {
    const { publisher, published } = recorder(DiagnosticsMode.Push)
    publisher.setMoleculer(new Map())
    publisher.setTypeScript('/w/temporary.js', [diagnostic('typescript')])

    expect(published).toEqual([])
    expect(publisher.report('/w/temporary.js')).toEqual([])
  })

  it('encodes reserved URI characters in file paths', () => {
    const { publisher, published, open } = recorder(DiagnosticsMode.Push)
    publisher.setMoleculer(new Map())
    open('/w/a#b?.js')

    expect(published).toEqual([['file:///w/a%23b%3F.js', []]])
  })
})

describe('DiagnosticsPublisher in pull mode', () => {
  it('asks the client to refresh instead of publishing, and reports merged diagnostics', () => {
    const { publisher, published, refreshes, open } = recorder(DiagnosticsMode.Pull)
    open('/w/a.js')
    publisher.setMoleculer(new Map([['/w/a.js', [diagnostic('moleculer')]]]))
    publisher.setTypeScript('/w/a.js', [diagnostic('typescript')])

    expect(published).toEqual([])
    expect(refreshes()).toBe(2)
    expect(publisher.report('/w/a.js').map((entry) => entry.message)).toEqual(['moleculer', 'typescript'])
  })
})
