[![npm version](https://img.shields.io/npm/v/moleculer-lsp.svg)](https://www.npmjs.com/package/moleculer-lsp)
[![npm downloads](https://img.shields.io/npm/dm/moleculer-lsp.svg)](https://www.npmjs.com/package/moleculer-lsp)
[![license](https://img.shields.io/npm/l/moleculer-lsp.svg)](./LICENSE)

# Moleculer Language Server

[Language Server Protocol](https://microsoft.github.io/language-server-protocol/) implementation for [Moleculer.js](https://github.com/moleculerjs/moleculer) microservices.

- [What is it](#what-is-it)
- [Installing](#installing)
- [Running the language server](#running-the-language-server)
- [CLI options](#cli-options)
- [Editor setup](#editor-setup)
- [Features](#features)
- [Limitations](#limitations)
- [Development](#development)

## What is it

Moleculer connects services through string names (`ctx.call("billing.charge")`, `ctx.emit("user.created")`) and shares behaviour through mixins.

This server indexes services, actions, events, methods, channels and mixins across the workspace. Your editor can then jump from a `ctx.call` to the action, list the indexed callers of an action, and report calls whose target is not defined in the workspace.

It runs alongside a JavaScript language server such as [typescript-language-server](https://github.com/typescript-language-server/typescript-language-server), not in place of one.

## Installing

```sh
npm install -g moleculer-lsp
```

Node.js 18 or later is required. The package has no runtime dependencies.

## Running the language server

```sh
moleculer-lsp --stdio
```

The server speaks LSP over stdin and stdout and writes logs to stderr.

## CLI options

```
Usage: moleculer-lsp [options]

Options:
  --stdio          Start the language server over stdio (default)
  --scan <dir>     Index a workspace and print a summary
  --parse <file>   Print symbols and references for one file
  --version        Print the version
  --help           Print this help
```

`--scan` prints file, symbol and reference counts, and unresolved references grouped by reason.

## Editor setup

### Neovim (0.11+)

```lua
vim.lsp.config('moleculer_lsp', {
  cmd = { 'moleculer-lsp', '--stdio' },
  filetypes = { 'javascript' },
  root_markers = { 'package.json' },
})
vim.lsp.enable('moleculer_lsp')
```

### Helix

```toml
[language-server.moleculer-lsp]
command = "moleculer-lsp"
args = ["--stdio"]

[[language]]
name = "javascript"
language-servers = ["typescript-language-server", "moleculer-lsp"]
```

### Claude Code

```sh
claude plugin marketplace add Anshuman115/moleculer-lsp
claude plugin install moleculer-lsp@moleculer-tools
```

### oh-my-pi (omp)

`~/.omp/agent/lsp.json`:

```json
{
  "servers": {
    "moleculer": {
      "command": "moleculer-lsp",
      "args": ["--stdio"],
      "fileTypes": [".js"],
      "languageId": "javascript",
      "rootMarkers": ["package.json"]
    }
  }
}
```

## Features

| LSP method | Behaviour |
| --- | --- |
| `textDocument/definition` | Action strings, event names, `this.method()` calls and mixin methods resolve to their declaration |
| `textDocument/references` | Indexed `ctx.call`, `ctx.emit`, `broker.broadcast`, `this.publish` and `broker.sendToChannel` references, plus internal calls and string hooks in named services |
| `textDocument/documentSymbol` | Outline of a service or mixin: actions, events, methods, channels, mixins and hooks |
| `textDocument/diagnostic` | Pull diagnostics, for clients that advertise support |
| `textDocument/publishDiagnostics` | Push diagnostics, for all other clients |

The index updates when a file is saved or changes on disk.

### Resolution

- `name` and numeric `version` (`v2.users.create`) form the service namespace.
- Mixins bound to an identifier from a local `require` are copied into the consuming service, including transitive chains: `const Shared = require("./shared.mixin")` with `mixins: [Shared]`.
- `ctx.call`, `ctx.emit` and `broker.broadcast` with string-literal names are indexed as references. `this.publish` and `broker.sendToChannel` also accept template literals without interpolation.
- `this.method()` and `this.helper.method()` resolve against the service namespace in named services.
- String hooks (`hooks: { before: { create: ["validate"] } }`) resolve as references in named services.
- Package mixins such as `moleculer-web` are skipped, not reported.

### Diagnostics

| Condition | Severity |
| --- | --- |
| Local mixin require path does not resolve to a file | Error |
| Event name declared in more than one service | Error |
| Event or channel target cannot be resolved unambiguously | Error |
| Call to a target absent from the workspace | Hint |
| Event or channel with no listener in the workspace | Hint |

## Limitations

- JavaScript only. Workspace scanning covers `.js` files; `.mjs`, `.cjs` and `.ts` files are not scanned.
- Services must be object literals assigned to `module.exports`. `export default`, `broker.createService()` and class-based services are not indexed.
- Mixins from npm packages are not indexed.
- A service `name` must be a string literal and its `version` a number literal.
- Dynamic names such as `ctx.call(someVariable)` are not resolved.
- No completion, hover or code lens.

## Development

```sh
git clone https://github.com/Anshuman115/moleculer-lsp
cd moleculer-lsp
npm install
npm run build   # type check, then bundle to dist/main.js
npm test
```

## License

[Apache-2.0](./LICENSE)
