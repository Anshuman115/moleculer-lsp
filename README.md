# moleculer-lsp

Language server for [Moleculer.js](https://github.com/moleculerjs/moleculer). It indexes literal action and event names and locally required mixins, then answers go-to-definition, references, document symbols and diagnostics across services.

## Requirements

Node.js 18 or later.

## Install

```bash
git clone https://github.com/Anshuman115/moleculer-lsp
cd moleculer-lsp
npm install
npm run build
```

## Use

Point an LSP client at the built server:

```bash
node dist/main.js --stdio
```

Or load it as a Claude Code plugin:

```bash
claude --plugin-dir /path/to/moleculer-lsp
```

## License

Apache-2.0
