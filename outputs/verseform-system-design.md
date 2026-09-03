# Verseform — System Design

## Purpose

This document owns Verseform's system shape: how product behavior, code boundaries, data, trust, testing, and agent operation fit together. Product behavior remains authoritative in the requirements; delivery order remains authoritative in the roadmap.

## Design stance

Verseform is a functional core inside a thin desktop shell. Deterministic document and scripture rules should be cheap to understand and test. Framework, editor, network, filesystem, and Windows behavior stay at named seams. The first implementation must prove the complete product loop before the feature surface expands.

## System tower

```text
React views and toolbar
        │ user intent / view state
Tiptap editor integration ───── transient reference decorations
        │ editor commands              │ pure scan results
Application use cases ─────────────────┤
        │ ports                        │
Pure TypeScript core: reference parser, canon validation,
citation/insertion rules, document envelope, migrations, attribution
        │                              │
Native adapters                   Scripture adapters
Tauri commands                    DBS HTTP / bundled WEB / fakes
files, recovery, profile,         translation policy and validation
WebView2 print/PDF
```

Dependencies point toward the pure core. The composition root is the only place that knows which concrete adapters are active.

## Chosen shape

- **Shell:** Tauri 2 on Windows, with narrow custom Rust commands for privileged operations.
- **UI:** React and TypeScript, kept thin and driven by explicit application states.
- **Editor:** Tiptap on ProseMirror. Its schema, transactions, extensions, and decorations fit the custom citation mark and transient detected-reference styling without building an editor engine.
- **Core:** Pure TypeScript so parsing, validation, insertion planning, migrations, and attribution share types with the editor and run without a desktop shell.
- **Testing:** Fast unit and component tests plus a browser-hosted fake-adapter harness. Native Windows evidence is required only for filesystem, recovery, WebView2 output, installation, and other actual platform seams.
- **Repository:** One application and one lockfile. Do not introduce a monorepo, service, database, or generalized plugin architecture without a demonstrated need.

Use open-source Tiptap/ProseMirror capabilities only unless the owner approves a paid dependency.

## Module ownership

Suggested source layout after bootstrap:

```text
src/core/        Pure schemas, parser, canon rules, citations, migrations
src/app/         Use cases, ports, and explicit state machines
src/editor/      Tiptap schema, commands, decorations, selection bridge
src/adapters/    DBS, WEB, fake providers, browser test adapters
src/ui/          React views and accessible controls
src-tauri/       Composition, narrow native commands, Windows integration
tests/fixtures/  Stable references, provider contracts, documents, output cases
```

Do not create pass-through layers. A module exists only when it owns a rule, a boundary, or a testable adaptation.

## Core contracts

### Document

The native `.verseform` file is a UTF-8 JSON envelope with a format identifier, schema version, document identity, timestamps, and validated editor JSON. It is the portable user artifact; local profile and recovery state do not travel inside it.

Writes are atomic: validate and serialize, write a sibling temporary file, flush as supported, then replace the destination without exposing a partial document. Recovery snapshots live in app-local data, are keyed by document identity, and never silently overwrite the user's chosen file. Migrations are forward-only, fixture-backed, and preserve the original when migration fails.

### Local profile

The local profile stores the preferred translation, recent-document pointers, and modest UI/print preferences. Missing paths are harmless. Document contents, verse history, and provider responses are not telemetry.

### Reference

A normalized reference contains translation context, book identity, chapter, verse start, and optional end. Detection decorations are derived view state and are not serialized. A generated citation is serialized as an editable semantic mark containing its normalized reference and translation identifier; detection ignores marked ranges.

The scanner runs only over changed text blocks after delimiters. It recognizes approved aliases and fuzzy book names, then validates exact bounds against translation-aware canon metadata. Parsing never contacts a provider.

### Scripture provider

Every provider implements the same small contract: list authorized translations, describe canon/attribution metadata, and fetch a normalized passage. Fake, bundled WEB, and DBS adapters share contract tests. Production DBS requests use the public ARC JSON endpoints through dedicated Tauri commands; the privileged webview never loads remote code or provider HTML.

DBS responses are redirect-, time-, size-, and schema-bounded, normalized to plain text, and treated as untrusted. Consumer requests support cancellation; native requests have an eight-second deadline. With the owner's confirmed DBS permission, successful catalogs and chapters use a versioned app-local cache; chapters are capped at 32 MB/192 files and catalogs at one 8 MB response. Fresh catalog/chapter lifetimes are one and seven days respectively; a stale catalog response selects bundled WEB, and a failed uncached passage lookup visibly switches to WEB before any insertion.

### Output

Printing and PDF export operate on an immutable document snapshot, not the live editor DOM. The output renderer creates semantic print HTML, derives translation notices from citation marks, adds the DBS footer, and applies print-only pagination styles. A Windows adapter invokes WebView2 print UI or PDF output.

The walking slice must prove page numbering, footer placement, and PDF fidelity before the exact native route is locked. If WebView2 cannot satisfy the contract reliably, only the output adapter changes.

## Critical flows

### Detect, preview, insert

1. A delimiter transaction identifies the changed text block.
2. The pure scanner returns valid and invalid candidates.
3. The editor maps candidates to transient decorations.
4. Hover requests a preview; click requests the passage if needed.
5. The use case records the reference, translation, range, and document revision.
6. On response, it verifies that the source range and text still match.
7. One editor transaction replaces the reference and applies citation metadata, producing one undo step.

Stale, cancelled, malformed, unauthorized, or offline responses cannot mutate the document. Offline fallback to WEB is explicit before insertion, so the citation always names the text actually inserted.

### Save and recover

Editor transactions set dirty state and schedule a recovery snapshot. Explicit Save validates one immutable snapshot and atomically writes it. Successful Save updates the saved-content hash and clears superseded recovery data. On restart, Verseform offers recovery only when the recovery snapshot is newer or differs from the saved artifact.

### Print and export

The application freezes a snapshot, validates it, aggregates translation notices, renders print HTML, and hands it to the Windows output adapter. Cancelling a dialog changes nothing. Export writes only the user-selected PDF destination and never mutates the open document.

## Trust and privacy boundaries

- The main webview loads packaged application code only and uses a restrictive content security policy.
- Tauri capabilities grant the main window only the commands it needs. Prefer dedicated file commands over broad frontend filesystem scope.
- A path chosen by a native dialog is validated again by the native command. App-local profile and recovery commands never accept arbitrary roots.
- Provider URLs are allowlisted; redirects and response sizes are bounded.
- HTML from documents, paste, or providers is sanitized against the editor schema.
- Development fixtures contain no production credential or copyrighted corpus without redistribution permission.
- A global DBS secret embedded in a shipped binary is not considered protected. DBS must supply a distributable-client authorization design or another owner-approved boundary.

## State and failure model

Use discriminated states rather than independent booleans for document lifecycle, lookup, save, recovery, and output. Every async result carries an operation identity and relevant document revision. Late results are ignored. Errors are visible, recoverable, and do not destroy accepted work.

## Verification economy

- **Pure tests:** parser, fuzz threshold, canon bounds, citation formatting, migrations, attribution, stale-result rules.
- **Editor integration:** transactions, selection, undo, citation exclusion, formatting, paste, hover/click mapping.
- **Provider contracts:** the same suite for fake, WEB, and recorded/schema-safe DBS responses; live DBS smoke is explicit and credential-gated.
- **Browser harness:** almost all user flows with fake ports, including keyboard and accessibility checks.
- **Windows checks:** atomic file behavior, crash recovery, print/PDF, WebView2 behavior, installer, and a short end-to-end smoke at milestone gates.

Every defect should leave a regression test at the cheapest layer that can truthfully reproduce it. Retain heavy evidence only for release claims or previously unstable platform seams.

## Knowledge ownership

- Requirements own **what** the user receives.
- This design owns **how responsibilities connect**.
- Decisions own **why durable choices were made**.
- Roadmap owns **what happens next and its exit proof**.
- `WORK.md` owns **current truth only**.
- Schemas, tests, and fixtures own **executable examples**.

Do not duplicate these authorities. Change the owning artifact and link to it.

## Primary references

- [Tauri capabilities and IPC boundaries](https://v2.tauri.app/reference/acl/capability/)
- [Tauri dialog plugin](https://v2.tauri.app/plugin/dialog/)
- [ProseMirror schema, transactions, plugins, and decorations](https://prosemirror.net/docs/guide/)
- [Tiptap schema and custom extensions](https://tiptap.dev/docs/editor/core-concepts/schema)
- [Microsoft WebView2 printing and PDF output](https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/print)
