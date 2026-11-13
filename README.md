# Moleculer LSP

[![npm](https://img.shields.io/npm/v/moleculer-lsp)](https://www.npmjs.com/package/moleculer-lsp)
[![license](https://img.shields.io/npm/l/moleculer-lsp)](./LICENSE)

Go to definition, find references and diagnostics for [Moleculer.js](https://moleculer.services/) services, actions, events and mixins. Optional JavaScript support uses the bundled [tsrs](https://github.com/oxc-project/tsrs) language server.

```js
ctx.call("orders.create");  // Jump to the action handler
ctx.emit("order.created");  // Find listeners and emitters
this.validateOrder();      // Resolve service and mixin methods
```

## Install

```sh
npm install -g moleculer-lsp
moleculer-lsp --stdio --typescript-diagnostics
```

Requires Node.js 18 or later. tsrs `0.25.0-ts7.1.0-beta` installs with the package and requires its platform-specific optional dependency. Do not install with `--omit=optional`. tsrs is beta; see its [compatibility notes](https://github.com/oxc-project/tsrs/blob/main/docs/COMPATIBILITY.md).

## Client setup

### Claude Code

```sh
claude plugin marketplace add Anshuman115/moleculer-lsp
claude plugin install moleculer-lsp@moleculer-tools
```

The plugin uses the CLI installed above, running `moleculer-lsp --stdio --typescript-diagnostics` from `PATH` for `.js` files. Restart Claude Code after installation or updates.

If another plugin also registers `.js`, check the LSP debug logs and ensure Moleculer LSP handles JavaScript. Do not rely on results from both servers being merged. Keep a separate TypeScript server registered for its other extensions.

### oh-my-pi (omp)

For a JavaScript-only project, add `.omp/lsp.json`:

```json
{
  "servers": {
    "typescript-native": { "disabled": true },
    "typescript-language-server": { "disabled": true },
    "moleculer": {
      "command": "moleculer-lsp",
      "args": ["--stdio", "--typescript-diagnostics"],
      "fileTypes": [".js"],
      "rootMarkers": ["package.json", "moleculer.config.js"]
    }
  }
}
```

This disables omp's separate TypeScript servers for the project. For mixed-language projects, restrict their `fileTypes` instead. Reload LSP configuration or restart omp. See [omp's configuration reference](https://github.com/can1357/oh-my-pi/blob/main/docs/lsp-config.md).

### Neovim

Neovim 0.11 or later:

```lua
vim.lsp.config('moleculer_lsp', {
  cmd = { 'moleculer-lsp', '--stdio', '--typescript-diagnostics' },
  filetypes = { 'javascript' },
  root_markers = { 'package.json', 'moleculer.config.js' },
})
vim.lsp.enable('moleculer_lsp')
```

Disable other JavaScript servers for these buffers. If your editor already manages JavaScript and merges servers, omit the fallback flags instead.

### Other clients

Run `moleculer-lsp --stdio --typescript-diagnostics`, use language ID `javascript`, and set `rootUri` to the workspace directory. The server uses full-document text synchronization, pull diagnostics when the client advertises them, and push diagnostics otherwise. Logs go to stderr; stdout carries JSON-RPC only.

## Features

| Feature | Supported forms |
| --- | --- |
| Definitions | Action strings, event and channel names, service and mixin methods |
| References | Literal calls, emits, broadcasts, channel sends, method calls and string hooks |
| Document symbols | Services, actions, events, methods, channels, mixins and hooks |
| Namespaces | Literal service names and numeric versions, including `v2.orders.create` |
| Mixins | Local `require` bindings and transitive mixin chains |

A Moleculer workspace has `moleculer.config.{js,cjs,mjs,json,ts}` or a `package.json` with a Moleculer dependency at its root or an ancestor. Only `.js` source files are indexed.

With JavaScript fallback enabled, Moleculer answers take priority. Unanswered definitions, references and outlines go to tsrs, along with hover, implementation, call hierarchy and workspace symbol requests. Unrecognized workspaces skip Moleculer indexing; tsrs handles requests there only when a fallback flag is set.

### Diagnostics

| Condition | Severity |
| --- | --- |
| Broken local mixin path | Error |
| Event name declared by multiple services (each declaration) | Error |
| Ambiguous event or channel reference | Error |
| Ambiguous `this.method()` target | Hint |
| Unknown cross-service target | Hint |
| Event or channel without a local listener | Hint |

Unknown targets may belong to remote services. Third-party npm mixins are not indexed and do not produce missing-path diagnostics.

## CLI

| Option | Behavior |
| --- | --- |
| `--stdio` | Use stdio transport (default) |
| `--typescript-fallback` | Add JavaScript navigation through tsrs |
| `--typescript-diagnostics` | Add tsrs diagnostics for open files; implies fallback |
| `--scan <dir>` | Print workspace index statistics |
| `--parse <file>` | Print one file's symbols and references |
| `--version` | Print the version |
| `--help`, `-h` | Print CLI help |

Without fallback flags, only Moleculer features are enabled.

## Performance

Apple M2 Pro, macOS arm64, Node.js 26.8.1, private Moleculer workspace with 1,139 JavaScript files:

| Metric | 0.3.0 | 0.4.0 (tsrs) |
| --- | ---: | ---: |
| Total process-tree RSS, MiB | 2,740.2 | 1,159.6 |
| Unsaved edit to JS diagnostics, ms | 13.1 | 5.9 |
| First JS definition per position p50, ms | 131.7 | 64.5 |
| Save to Moleculer diagnostics (full rescan), ms | 1,501.3 | 1,263.1 |

Warm Moleculer definition p50 was 1 ms or less in both runs.

Single sequential run per version with `--typescript-diagnostics`, normal SDK type resolution, 20 Moleculer call positions, 20 local-import positions and five repeated requests per position. tsrs used default mode and native macOS watching. RSS is a snapshot after requests and edits.

Nonempty-response counts matched: 20/20 Moleculer definitions, 20/20 Moleculer references, 17/20 JavaScript definitions and 19/20 hovers.

## Development

```sh
npm install
npm run build
npm test
npm run bench -- /path/to/workspace
```

The benchmark compares the combined server and tsrs alone, each with and without JavaScript diagnostics. Edits use unsaved overlays; workspace source files are not written.

## License

[Apache-2.0](./LICENSE)
