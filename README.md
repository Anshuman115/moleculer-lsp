# moleculer-lsp

Language server for [Moleculer.js](https://moleculer.services/) codebases, packaged as a Claude Code plugin.

The server indexes literal action and event names, resolves locally required mixins across services, and answers go-to-definition, references, document symbols and diagnostics.

## Features

- **Go to definition**: action strings, event names, `this.method()` calls, and mixin methods.
- **Find references**: `ctx.call`, `ctx.emit`, `broker.broadcast`, hook strings, and internal method calls.
- **Document symbols**: a file outline for services and mixins covering actions, events, methods, channels, mixins and hook phases.
- **Diagnostics**: local mixin paths that do not resolve, mixin applications without a service name, name collisions, and call or event targets absent from the workspace.

Not included: autocomplete, code lens, hover, and TypeScript support.

## What it understands

| Moleculer construct | Handled |
| --- | --- |
| `actions`, `events`, `methods`, `channels` blocks | Indexed as symbols |
| `name` and numeric `version` (`v2.users.create`) | Namespaced accordingly |
| `mixins: [Base]` with local requires | Methods copied into the consuming service |
| Transitive mixin chains | Resolved to a fixed point |
| `ctx.call` / `ctx.emit` / `broker.broadcast` | Indexed as references |
| `this.publish("event.name", payload)` | Indexed as an event reference |
| `broker.sendToChannel("channel.name", payload)` | Indexed as a channel reference |
| Static template-literal names (`` `event.name` ``) | Indexed as event/channel references |
| `this.method()` and `this.helper.method()` | Resolved against the service namespace |
| `hooks: { before: { create: ["validate"] } }` | String hooks resolved as references |
| Package mixins (`moleculer-web`) | Ignored rather than reported as broken |
| Plain classes, adapters, HTTP clients | Recognised as non-services, kept quiet |

## Installation

The plugin bundles its server and requires Node.js 18 or later. No separate language server binary is needed.

```bash
git clone https://github.com/Anshuman115/moleculer-lsp
cd moleculer-lsp
npm install
npm run build
```

Load it into Claude Code:

```bash
claude --plugin-dir /path/to/moleculer-lsp
```

To install it permanently, add the directory as a marketplace source and install `moleculer-lsp` from the `/plugin` interface.

## Diagnostics

| Condition | Severity | Meaning |
| --- | --- | --- |
| Local mixin require path does not resolve to a file | Error | The require target is absent from the workspace |
| Mixin applied to a service with no resolvable name | Error | The mixin methods cannot be namespaced |
| Event name declared in more than one service | Error | Each declaration is reported as a collision |
| Call or emit target matches several services | Error | No target is selected from namespace, file, or mixin relationships |
| Call to a target absent from the workspace | Hint | Another repository can own the service |
| Event with no local listener | Hint | No listener is indexed in the workspace |

Results describe the workspace index, not deployment-wide routing.

Clients that advertise `textDocument.diagnostic` receive a diagnostic provider and pull full reports per document; after indexing or a rescan they receive `workspace/diagnostic/refresh` when they also advertise refresh support. Other clients receive `textDocument/publishDiagnostics` notifications.

## Command line

The binary can be run directly to inspect what the server sees:

```bash
node dist/main.js --scan /path/to/service     # index a workspace and summarise it
node dist/main.js --parse path/to/file.js     # dump symbols and references for one file
```

`--scan` reports unresolved reference counts grouped by reason.

## Development

```bash
npm test           # unit tests
npm run typecheck  # type check without emitting
npm run build      # type check, then bundle to dist/main.js
```

The server exchanges LSP messages over stdio and writes logs to stderr.

## Limitations

- JavaScript only. `.ts` files are not parsed.
- Mixins imported from npm packages are not indexed, only local files.
- A service `name` must be a string literal and its `version` a number literal. Names derived from imported constants, such as `name: MOL.PROVIDER`, are not resolved.
- Dynamic names (`ctx.call(someVariable)`, `this.publish(this.settings.eventName, payload)`, or interpolated template literals) cannot be resolved.
- Cursor context is detected from line text, so unusual formatting can defeat it.

## License

Apache-2.0
