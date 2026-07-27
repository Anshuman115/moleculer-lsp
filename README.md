# moleculer-lsp

Language server for [Moleculer.js](https://moleculer.services/) codebases, packaged as a
Claude Code plugin. It gives Claude real code navigation across services, mixins, and
events instead of leaving it to grep for string literals.

Moleculer resolves calls at runtime through string names (`ctx.call("billing.charge")`),
and composes behaviour through mixins that copy methods between services. Neither is
visible to a general JavaScript language server, so a symbol defined in one mixin and used
in fifteen services looks like fifteen unrelated strings. This server models both.

## Features

- **Go to definition** — action strings, event names, `this.method()` calls, and mixin
  methods resolve to their real declaration site.
- **Find references** — every `ctx.call`, `ctx.emit`, `broker.broadcast`, hook string, and
  internal method call that reaches a symbol.
- **Document symbols** — a Moleculer-aware file outline for services and mixins: actions,
  events, methods, channels, mixins, and hook phases.
- **Diagnostics** — unresolvable mixin requires, ambiguous event names, and calls to
  targets that do not exist in the workspace.

Deliberately not included: autocomplete, code lens, hover, and TypeScript support.

## What it understands

| Moleculer construct | Handled |
| --- | --- |
| `actions`, `events`, `methods`, `channels` blocks | Indexed as symbols |
| `name` and `version` (`v2.users.create`) | Namespaced accordingly |
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

The plugin bundles its own server. Node.js 18 or later is the only requirement — there is
no separate language server binary to install.

```bash
git clone https://github.com/Anshuman115/moleculer-lsp
cd moleculer-lsp
npm install
npm run build
```

Then load it into Claude Code:

```bash
claude --plugin-dir /path/to/moleculer-lsp
```

To install it permanently, add the directory as a marketplace source and install
`moleculer-lsp` from the `/plugin` interface.

## Diagnostics

| Rule | Severity | Why |
| --- | --- | --- |
| Mixin require path does not resolve | Error | The file is missing; the mixin silently does nothing at runtime |
| Event declared in multiple services | Error | An emit cannot be routed unambiguously |
| Emit target matches several services | Error | The intended listener is genuinely undecidable |
| Call to a target not in the workspace | Hint | Normal when another repository owns the service |
| Event with no local listener | Hint | Normal in a distributed system with no shared registry |

Errors are reserved for cases that are wrong regardless of deployment topology. Anything
that is merely unknown to this workspace is a hint, because a microservice repository
routinely calls services it cannot see.

## Command line

The same binary can be run directly, which is useful for checking what the server sees:

```bash
node dist/main.js --scan /path/to/service     # index a workspace and summarise it
node dist/main.js --parse path/to/file.js     # dump symbols and references for one file
```

`--scan` reports unresolved references grouped by reason, which is the fastest way to tell
a real problem from an expected external call.

## Development

```bash
npm test           # unit tests
npm run typecheck  # type check without emitting
npm run build      # type check, then bundle to dist/main.js
```

The server speaks LSP over stdio and writes diagnostics to stderr, so it can be driven by
hand for debugging.

## Limitations

- JavaScript only. `.ts` files are not parsed.
- Mixins imported from npm packages are not indexed, only local files.
- Service `name` and `version` must be string/number literals. Names derived from imported constants, such as `name: MOL.PROVIDER`, are not resolved yet.
- Dynamic names (`ctx.call(someVariable)`, `this.publish(this.settings.eventName, payload)`, or interpolated template literals) cannot be resolved.
- Cursor context is detected from line text, so unusual formatting can defeat it.

## License

Apache-2.0
