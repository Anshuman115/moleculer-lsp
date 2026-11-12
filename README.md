[![npm version](https://img.shields.io/npm/v/moleculer-lsp.svg)](https://www.npmjs.com/package/moleculer-lsp)
[![npm downloads](https://img.shields.io/npm/dm/moleculer-lsp.svg)](https://www.npmjs.com/package/moleculer-lsp)
[![license](https://img.shields.io/npm/l/moleculer-lsp.svg)](./LICENSE)

# Moleculer Language Server

[Language Server Protocol](https://microsoft.github.io/language-server-protocol/) implementation for [Moleculer.js](https://github.com/moleculerjs/moleculer) microservices.

- [What is it, exactly?](#what-is-it-exactly)
- [Installing](#installing)
- [Running the language server](#running-the-language-server)
- [CLI Options](#cli-options)
- [Client setup](#client-setup)
  - [Claude Code](#claude-code)
  - [oh-my-pi (omp)](#oh-my-pi-omp)
  - [Neovim](#neovim)
  - [Helix](#helix)
- [Features](#features)
  - [Resolution](#resolution)
  - [Diagnostics](#diagnostics)
  - [TypeScript fallback](#typescript-fallback)
- [Performance](#performance)
- [Limitations](#limitations)
- [Development](#development)
- [License](#license)

## What is it, exactly?

Moleculer connects services through string names (`ctx.call("billing.charge")`, `ctx.emit("user.created")`) and shares behaviour through mixins. A JavaScript language server sees those names as plain strings, so it cannot navigate from a call to the action that handles it.

`moleculer-lsp` indexes services, actions, events, methods, channels and mixins across the workspace. Clients can jump from a `ctx.call` to the action, list the callers of an action or the emitters of an event, and report calls whose target does not exist in the workspace.

In clients that run one language server per file type, such as Claude Code, `moleculer-lsp` can also forward every request it cannot answer to TypeScript. Plain JavaScript navigation, hover and diagnostics then keep working from the same server.

## Installing

```sh
npm install -g moleculer-lsp
```

Node.js 18 or later is required. TypeScript 7 is installed as a dependency and serves plain JavaScript requests when the project provides no TypeScript language server of its own.

## Running the language server

```sh
moleculer-lsp --stdio
```

The server speaks LSP over stdin and stdout. Logs go to stderr.

The workspace is indexed when the workspace root or one of its parents contains `moleculer.config.{js,cjs,mjs,json,ts}`, or a `package.json` that lists `moleculer` in `dependencies`, `devDependencies` or `peerDependencies`. Other workspaces are not indexed and get no Moleculer diagnostics. With `--typescript-fallback`, TypeScript answers every request in them.

## CLI Options

```
Usage: moleculer-lsp [options]

Options:
  --stdio                    Start the language server over stdio (default)
  --typescript-fallback      Send requests the index cannot answer, and hover, implementation,
                             call hierarchy and workspace symbol requests, to TypeScript
  --typescript-diagnostics   Also report TypeScript diagnostics for open files (implies --typescript-fallback)
  --scan <dir>               Index a workspace and print a summary
  --parse <file>             Print symbols and references for one file
  --version                  Print the version
  --help                     Print this help
```

- `--typescript-fallback` is for clients that send each request for a file to one server only. Do not use it in editors that already run a TypeScript server next to `moleculer-lsp` and merge the results.
- `--typescript-diagnostics` is for clients where `moleculer-lsp` is the only server for `.js` files, such as Claude Code.
- `--scan` prints file, symbol and reference counts, and unresolved references grouped by reason.

## Client setup

### Claude Code

```sh
npm install -g moleculer-lsp
claude plugin marketplace add Anshuman115/moleculer-lsp
claude plugin install moleculer-lsp@moleculer-tools
```

The plugin starts `moleculer-lsp --stdio --typescript-diagnostics` from `PATH`. Claude Code started from a terminal, VS Code, Zed or the Claude desktop app inherits the shell `PATH`.

Claude Code assigns each file extension to the first plugin that registers it, in the order of `enabledPlugins` in `~/.claude/settings.json`. The `typescript-lsp` plugin also registers `.js`, and a new install is added at the end of the list. Move `moleculer-lsp` to the top:

```sh
jq '.enabledPlugins = ({"moleculer-lsp@moleculer-tools": true} + (.enabledPlugins | del(.["moleculer-lsp@moleculer-tools"])))' \
  ~/.claude/settings.json > /tmp/settings.json && mv /tmp/settings.json ~/.claude/settings.json
```

To verify, run `claude --debug-file /tmp/claude.log -p ok` and `grep "extension .js" /tmp/claude.log`. The line must read `.js already handled by "plugin:moleculer-lsp:moleculer"`.

`moleculer-lsp` then serves `.js` files, and `typescript-lsp` keeps `.ts`, `.tsx` and `.jsx`. Moleculer answers take priority; every other request goes to TypeScript. In projects without Moleculer, all requests go to TypeScript unchanged.

### oh-my-pi (omp)

Register the server in `~/.omp/agent/lsp.json`:

```json
{
  "servers": {
    "moleculer": {
      "command": "moleculer-lsp",
      "args": ["--stdio", "--typescript-fallback"],
      "fileTypes": [".js"],
      "rootMarkers": ["moleculer.config.js"]
    }
  }
}
```

Use `["package.json"]` as `rootMarkers` for Moleculer projects without `moleculer.config.js`.

omp sends definition and references requests to the first server that accepts the file, and its built-in TypeScript servers come first. In each Moleculer project, add `.omp/lsp.json` so they report diagnostics only:

```json
{
  "servers": {
    "typescript-native": { "isLinter": true },
    "typescript-language-server": { "isLinter": true }
  }
}
```

omp's TypeScript servers keep reporting diagnostics, so do not add `--typescript-diagnostics` here. Rename is not available for `.js` in this setup. Restart omp after installing or updating `moleculer-lsp`.

### Neovim

Neovim 0.11 or later:

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

## Features

| LSP method | Behaviour |
| --- | --- |
| `textDocument/definition` | Action strings, event names, `this.method()` calls and mixin methods resolve to their declaration |
| `textDocument/references` | `ctx.call`, `ctx.emit`, `broker.broadcast`, `this.publish` and `broker.sendToChannel` references, internal calls, and string hooks in named services |
| `textDocument/documentSymbol` | Outline of a service or mixin: actions, events, methods, channels, mixins and hooks |
| `textDocument/diagnostic` | Pull diagnostics, for clients that advertise support |
| `textDocument/publishDiagnostics` | Push diagnostics for open files, for all other clients. Closing a file clears them |
| `textDocument/hover`, `textDocument/implementation`, call hierarchy, `workspace/symbol` | Forwarded to TypeScript unchanged, with `--typescript-fallback` only |

The index is rebuilt when a file is saved or changes on disk.

### Resolution

- `name` and numeric `version` (`v2.users.create`) form the service namespace.
- Mixins bound to a local `require` are merged into the consuming service, including transitive chains: `const Shared = require("./shared.mixin")` with `mixins: [Shared]`.
- `ctx.call`, `ctx.emit` and `broker.broadcast` with string-literal names are indexed. `this.publish` and `broker.sendToChannel` also accept template literals without interpolation.
- `this.method()` and `this.helper.method()` resolve in named services. `this.helper.method()` resolves only to a method of the same service or one of its mixins. Calls on other objects, such as `client.send()`, are left to TypeScript.
- String hooks (`hooks: { before: { create: ["validate"] } }`) resolve as references in named services.
- Mixins from npm packages, such as `moleculer-web`, are skipped without a diagnostic.

### Diagnostics

| Condition | Severity |
| --- | --- |
| Local mixin `require` path does not resolve to a file | Error |
| Event name declared in more than one service | Error |
| Event or channel target cannot be resolved unambiguously | Error |
| Call to a target absent from the workspace | Hint |
| Event or channel with no listener in the workspace | Hint |

### TypeScript fallback

With `--typescript-fallback`, a definition, references or document symbol request that the Moleculer index cannot answer goes to TypeScript. The server uses the first of:

1. `tsc` 7 or later in the project's `node_modules/.bin`, or on `PATH`, started as `tsc --lsp`
2. `typescript-language-server` in the project's `node_modules/.bin`, or on `PATH`
3. TypeScript 7 installed with `moleculer-lsp`

TypeScript starts on the first request that needs it. With `--typescript-diagnostics`, TypeScript diagnostics for open files are merged with the Moleculer diagnostics.

## Performance

Measured with `npm run bench` on an Apple M2 Pro, Node.js 26.8.1 and TypeScript 7.0.2, with `moleculer-lsp --typescript-diagnostics` as Claude Code runs it. Each workspace was run three times; values are medians in milliseconds. Each request type uses 20 positions sampled across the workspace. "First" is the first request at a position; "repeat" is five more requests at the same position. The baseline is `tsc --lsp` alone, pulling diagnostics for each opened file.

| | Moleculer, 1,139 files | Moleculer, 387 files | Plain JS, 426 files |
| --- | --- | --- | --- |
| Index ready after start | 1,312 | 287 | 127 (no index) |
| Moleculer definition, first p50 / p95 | 2.0 / 13.4 | 0.6 / 20.0 | n/a |
| Moleculer references, first p50 / p95 | 1.5 / 11.8 | 0.4 / 1.2 | n/a |
| JS definition, first p50 / p95 | 113 / 846 | 7.7 / 34.8 | 33.7 / 143 |
| JS definition, first p50 / p95, TypeScript alone | 90 / 192 | 9.3 / 18.1 | 34.5 / 150 |
| Hover, first p50 / p95 | 7.2 / 101 | 0.5 / 4.0 | 2.2 / 90.1 |
| Hover, first p50 / p95, TypeScript alone | 8.6 / 121 | 0.7 / 4.3 | 2.4 / 91.6 |
| Any request, repeat p50 | 0.2 – 1.3 | 0.2 – 0.3 | 0.2 – 0.3 |
| Edit to TypeScript diagnostics | 13 | 4.5 | n/a |
| Save to Moleculer diagnostics | 1,478 | 498 | n/a |
| Server memory (RSS, MB) | 196 | 159 | 64 |

TypeScript alone answered none of the 20 Moleculer definition requests in either Moleculer workspace.

A save re-indexes the whole workspace after a 250 ms debounce. Requests that arrive during the re-index wait for it: up to 1.2 s in the 1,139-file workspace and 0.2 s in the 387-file one.

## Limitations

- JavaScript only. `.mjs`, `.cjs` and `.ts` files are not scanned.
- Services must be object literals assigned to `module.exports`. `export default`, `broker.createService()` and class-based services are not indexed.
- A service `name` must be a string literal and its `version` a number literal.
- Dynamic names such as `ctx.call(actionName)` are not resolved.
- The whole workspace is re-indexed on each save. Requests that arrive during a re-index wait for it to finish.
- No completion, rename or code lens. Hover comes from TypeScript, with `--typescript-fallback` only.

## Development

```sh
git clone https://github.com/Anshuman115/moleculer-lsp
cd moleculer-lsp
npm install
```

| Command | Purpose |
| --- | --- |
| `npm run build` | Type check, then bundle to `dist/main.js` |
| `npm test` | Run the unit tests |
| `npm run dev` | Run the server from source |
| `npm run bench -- <workspace>` | Benchmark `dist/main.js` against TypeScript alone on a workspace |

`npm publish` runs the build and the tests first.

## License

[Apache-2.0](./LICENSE)
