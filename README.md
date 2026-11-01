# moleculer-lsp

Language server for [Moleculer.js](https://github.com/moleculerjs/moleculer). It indexes literal action and event names and locally required mixins, then answers go-to-definition, references, document symbols and diagnostics across services.

## Install

```bash
npm install -g https://github.com/Anshuman115/moleculer-lsp/tarball/main
```

## Use

Point an LSP client at the server over stdio:

```bash
moleculer-lsp --stdio
```

Node.js 18 or later is required.

## License

Apache-2.0
