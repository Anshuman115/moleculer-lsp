# Changelog

## 0.4.1

### Changed

- README: monthly downloads, total downloads and Node.js version badges.

## 0.4.0

### Changed

- JavaScript fallback uses the bundled, pinned `tsrs` language server. No separate TypeScript server installation or executable discovery is required.
- Imported SDK types use normal project resolution. Project configuration files are not rewritten.
- TypeScript is a development dependency only.

### Fixed

- Definition and references enforce service namespaces and distinguish actions from methods with the same name.
- Mixins that combine other mixins retain transitive definitions and references.
- Shared mixins do not choose between host-specific method implementations. Ambiguous self-calls produce hints rather than errors.
- Diagnostic URIs preserve paths containing `#` or `?`.
- JavaScript fallback remains available when the Moleculer index fails.
- Closing a document clears its diagnostics and prevents reopening it during fallback initialization.
- Scanner and watcher directory exclusions match.
- Non-Moleculer workspaces leave outlines to the JavaScript fallback.
- A timed-out JavaScript request does not disable later fallback requests.
- Versioned JavaScript diagnostics are ignored when their document version is stale.
- Invalid request parameters and malformed JSON messages produce protocol errors.

## 0.3.0

### Added

- `--typescript-diagnostics`: merges TypeScript diagnostics for open files with the Moleculer diagnostics. Implies `--typescript-fallback`.
- With `--typescript-fallback`, hover, implementation, call hierarchy and workspace symbol requests go to TypeScript unchanged.
- TypeScript 7 is a dependency. It answers fallback requests when the project and `PATH` have no `tsc --lsp` or `typescript-language-server`.
- Pull diagnostics from `tsc --lsp`, which never pushes them.
- Workspace detection: the index is built only when `moleculer.config.*` or a `package.json` that depends on `moleculer` exists in the workspace root or a parent. Other workspaces behave as plain JavaScript.
- `npm run bench -- <workspace>` measures startup, request latency, edit-to-diagnostics time and memory against TypeScript alone.

### Changed

- The Claude Code plugin runs the `moleculer-lsp` command from the npm package, with `--typescript-diagnostics`. Install the package with `npm install -g moleculer-lsp`.
- Push diagnostics go only to files the client has open, and are cleared when the file is closed.
- A save no longer triggers a second full rescan next to the file watcher's. TypeScript diagnostics after an edit arrive in about 13 ms instead of up to 2.4 s in a 1,139-file workspace.
- Text the client re-sends unchanged is not re-synced to TypeScript, so TypeScript does not re-check the file.
- Calls on objects other than `this` go to TypeScript. `this.helper.method()` resolves only to a method in a related service or mixin.

### Fixed

- `ctx.emit` inside a mixin used by several services found no event handler.
- A line such as `this.client = Factory.create()` was treated as a call to a service method.
- A cursor on the `this` keyword triggered a Moleculer lookup.
- References with no indexed usages returned only the declaration and blocked the TypeScript fallback.
- `--scan` with a relative path reported thousands of unresolved references.

## 0.2.0

### Added

- `--typescript-fallback`: definition, references and document symbol requests the index cannot answer go to `tsc --lsp` (TypeScript 7 and later) or `typescript-language-server`.

## 0.1.1

### Fixed

- Each LSP frame is written in a single write.

## 0.1.0

- First release: go to definition, references, document symbols and diagnostics for services, actions, events, methods, channels and mixins.
