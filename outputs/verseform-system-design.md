# Verseform — System Design

## Purpose

This document owns Verseform's system shape: how product behavior, code boundaries, data, trust, testing, and agent operation fit together. Product behavior remains authoritative in the requirements; delivery order remains authoritative in the roadmap.

## Design stance

Verseform is a controlled state-transition system inside a thin desktop shell. Deterministic document and scripture rules should be cheap to understand and test. Framework, editor, network, filesystem, clock, and Windows behavior stay at named seams. Application intent enters once, the application kernel decides the next state and required effects, adapters execute only those effects, and results return as identified events. Direct contenteditable input remains inside Tiptap and returns to the kernel as an immutable editor observation; the kernel does not reimplement typing.

The Alpha proved the product loop. `VFM-090` then moved its orchestration out of `src/ui/App.tsx`: the framework-free application kernel now owns lifecycle facts and decides effects, the controller alone schedules persistence and calls ports, and Tiptap is isolated behind the editor gateway. The migration did not change document, provider, native, output, or visible Alpha contracts. Splitting JSX alone was not the goal; establishing one control plane was.

## System tower

```text
User ── menu/toolbar intent ──► React UI ── WorkspaceEvent ──┐
  └── typing / IME ──► Tiptap editor gateway ─ EditorObserved ┤
Windows / adapter result ──────────────── WorkspaceEvent ─────┘
                                                             ▼
Application kernel ── pure transition ──► canonical workspace state
        │                                      │
        │ closed WorkspaceEffect               └─ selectors ──► React UI
        ▼
Effect controller ───────► editor commands / immutable snapshots
        │
        └─► Runtime ports
            documents · recovery · preferences · scripture
            output · window · scheduler · approved external links
                    │
                    ▼
            Native/browser adapters
            Tauri commands · DBS/WEB · WebView2 · deterministic fakes

Pure core beneath every layer
references · canon · lookup freshness · document envelope · output · attribution
```

Dependencies point inward toward contracts and the pure core. The composition root is the only place that knows which concrete adapters are active. No view imports a concrete adapter, and no adapter decides product state.

## Chosen shape

- **Shell:** Tauri 2 on Windows, with narrow custom Rust commands for privileged operations; an independent Vite production composition supplies browser-local behavior for desktop Chrome/Edge.
- **Application kernel:** A framework-free TypeScript workspace model, closed event/effect unions, pure transition function, and derived selectors. This is the sole owner of cross-cutting application state and async acceptance rules.
- **UI:** React and TypeScript, kept thin and driven by the kernel's view model. Views dispatch named intent and never call runtime adapters directly; their remaining effects are presentation-only focus management.
- **Editor:** Tiptap on ProseMirror. Its schema, transactions, extensions, and decorations fit the custom citation mark and transient detected-reference styling without building an editor engine.
- **Core:** Pure TypeScript so parsing, validation, insertion planning, migrations, and attribution share types with the editor and run without a desktop shell.
- **Testing:** Fast unit and component tests plus a browser-hosted fake-adapter harness. Native Windows evidence is required only for filesystem, recovery, WebView2 output, installation, and other actual platform seams.
- **Repository:** One application and one lockfile. Do not introduce a monorepo, service, database, or generalized plugin architecture without a demonstrated need.

Use open-source Tiptap/ProseMirror capabilities only unless the owner approves a paid dependency.

## Module ownership

Implemented source layout after the Beta interaction engineering pass:

```text
src/core/        Pure value objects and policies: parser, canon, lookup, document, output
src/app/         Workspace state/events/effects/selectors, command catalog, controller, ports
src/editor/      Tiptap schema/extensions plus the application-facing editor gateway
src/adapters/    DBS, WEB, fake providers, browser test adapters
src/web/         Production browser composition, IndexedDB, DBS transport, host boundaries
src/ui/          Stateless shell, menus/toolbars, document surface, dialogs, styles
src-tauri/       Composition, narrow native commands, Windows integration
tests/fixtures/  Stable references, provider contracts, documents, output cases
```

Do not create pass-through layers. A module exists only when it owns a rule, a boundary, or a testable adaptation.

### Application kernel

Begin with four cohesive modules rather than one file per event:

- `workspace.ts` owns `WorkspaceState`, `WorkspaceEvent`, `WorkspaceEffect`, initialization, the pure `transition(state, event)` function, and state invariants.
- `selectors.ts` derives dirty state, window title, enabled commands, active translation, visible status, and the React-facing view model. Derived facts are never mirrored in mutable refs.
- `commands.ts` is a closed registry for application commands such as New, Open, Save, Print, Find, Paragraph, Credits & Licenses, and formatting. Menus, shortcuts, enablement, and accessible labels consume the same descriptor.
- `credits.ts` derives the local Credits & Licenses model from the effective normalized translation, package version, WEB provenance, and the release-audited dependency inventory embedded at build time.
- `controller.ts` executes effects through injected ports and the editor gateway, stamps result events, owns cancellable timers, and exposes a subscribe/dispatch boundary to React.

This is not event sourcing, Redux, a plugin system, or a generalized workflow engine. Events are ephemeral typed messages; the portable `.verseform` document remains the only user artifact.

### Canonical workspace state

The workspace is one aggregate with explicit, concurrently valid regions:

| Region | Sole owner and truth |
|---|---|
| `document` | Document identity, optional granted path, display name, editor revision, current content hash, and saved content hash. `dirty` is derived by comparing hashes. Tiptap alone owns the live editable tree. |
| `persistence` | Idle, scheduled recovery/autosave, or an identified explicit/automatic save with its frozen document ID and content hash. |
| `scripture` | Catalog phase, available translations, selected preference, effective fallback, and at most one identified preview/insertion request. |
| `output` | Page-number preference, optional frozen snapshot and operation stamp, and one of idle, capturing, previewing PDF, preparing, printing, or saving PDF. The requested output mode is explicit while an operation is active. |
| `overlay` | Exactly one of none, Find, Paragraph, PDF Export, browser Using Verseform, Credits & Licenses, or unsaved-navigation confirmation. An in-flight credits link holds its own operation stamp. Non-modal menus are separate ephemeral view state. |
| `notice` | The latest user-facing message and its monotonic identity; identified background completions cannot overwrite a newer message. |

The editor gateway emits immutable observations containing the content hash, whether the completed transaction changed the document, selection formatting, and command availability. The kernel alone advances the editor revision. Observations cross a microtask boundary so ProseMirror completes selection handling before React renders the result. The gateway accepts a closed instruction union and can freeze one editor snapshot for save/output. Native typing and IME composition apply within Tiptap first, then emit an observation; application and toolbar commands follow the command/event/effect path. This keeps high-frequency editing responsive, keeps ProseMirror positions and transactions in `src/editor/`, and lets the application kernel reason about lifecycle without importing Tiptap.

Every asynchronous effect carries an `OperationStamp`: monotonic operation ID plus the relevant document ID, revision, snapshot hash, and translation ID. A result event is accepted only if its stamp still matches the region that requested it. Lookup freshness additionally rechecks the exact source text before insertion. Cancellation is an optimization; identity validation is the correctness boundary.

### Control and diagnostic contract

For agent and test legibility, every application capability follows one traceable path:

```text
command or external event
  → WorkspaceEvent
  → transition
  → WorkspaceEffect (if any)
  → one port/editor command
  → stamped result event
  → selector
  → visible UI and executable assertion
```

The browser harness exposes the frozen, versioned `window.__VERSEFORM_DIAGNOSTICS__` snapshot containing region phases, operation IDs, revision and hashes, effective translation, and enabled commands. It omits document text, arbitrary paths, provider payloads, and credentials and is absent from the production Tauri composition. A browser test verifies those properties. This replaces DOM inference for orchestration tests without becoming telemetry or persisted application state.

Close has one platform owner. The browser harness uses `beforeunload` to protect dirty writing. The Windows composition instead prevents the initial Tauri close request, routes it through the kernel's shared Save/Discard/Cancel transition, and force-destroys the window only after the transition authorizes closing. The local, main-window-only Tauri capability explicitly allows that destroy command; a rejected destroy returns a typed failure notice and leaves dirty writing intact. The desktop composition does not register the browser unload blocker, because two independent guards can strand a dirty WebView2 window.

The command registry and diagnostic schema are finite product contracts. Do not add dynamic registration, reflection, remote control, or production logging infrastructure.

## Core contracts

### Document

The native `.verseform` file is a UTF-8 JSON envelope with a format identifier, schema version, document identity, timestamps, and validated editor JSON. It is the portable user artifact; local profile and recovery state do not travel inside it.

Writes are atomic: validate and serialize, write a sibling temporary file, flush as supported, then replace the destination without exposing a partial document. Recovery snapshots live in app-local data, are keyed by document identity, and never silently overwrite the user's chosen file. Migrations are forward-only, fixture-backed, and preserve the original when migration fails.

### Local profile

The local profile stores the preferred translation, recent-document pointers, and modest UI/print preferences. Missing paths are harmless. Document contents, verse history, and provider responses are not telemetry. The Windows application identifier `com.verseform.editor` is stable across Alpha and Beta, so an in-place per-user upgrade reaches the same profile, recovery, and scripture-cache roots. Upgrade and uninstall must preserve these user-data classes; a clean-runner lifecycle hashes representative seeded state before and after installation changes.

### Reference

A normalized reference contains book identity, chapter, verse start, and optional end. Optional `chapterEnd`, `additionalRanges`, and `wholeChapter` metadata represent a cross-chapter range, ordered list, or whole chapter while preserving existing single-range references and the version-2 document envelope. Detection decorations are derived view state and are not serialized. A generated citation is serialized as an editable semantic mark containing its normalized reference and translation identifier; detection ignores marked ranges.

The scanner runs only over changed text blocks after delimiters. It captures a complete numeric expression before applying the supported grammar, recognizes approved aliases and fuzzy book names, then validates exact bounds against translation-aware canon metadata. Unsupported continuations cannot activate a shorter valid prefix. `passageSegments` owns bounds, omissions, ordering, and the volume policy: any selection in one chapter, or at most 50 selected verses across chapters. Parsing never contacts a provider. Invalid candidates use the existing `scripture.hover` → preview selector/UI path with no lookup effect; valid candidates use the existing stamped `ScriptureProvider.getPassage` effect and atomic editor insertion command.

WEB and DBS both validate through that same pure segment policy. DBS retrieves each selected chapter once per passage, checks cancellation after every awaited response, and assembles only the selected verses in order. It returns no partial result; if the composite provider falls back, the complete selection is retrieved again as WEB and carries WEB metadata. Save/reopen retains all reference fields as citation metadata; output continues to derive attribution from the existing citation marks. Long hover previews stay within the viewport and scroll; Page Up/Page Down on a focused reference scroll only its preview through a presentation callback, preserving arrow navigation, Tab indentation, and the kernel's sole ownership of preview state.

### Scripture provider

Every provider implements the same small contract: list authorized translations, describe canon/attribution metadata, and fetch a normalized passage. Fake, bundled WEB, and DBS adapters share contract tests. The DBS adapter converts the core's 66 standard USFM book IDs to ARC's two-character DBS IDs before either web or Tauri transport runs; response parsing matches the complete requested book-and-chapter prefix so trailing-number IDs such as `P2` remain unambiguous. Production DBS requests use the public ARC JSON endpoints through dedicated Tauri commands; the privileged webview never loads remote code or provider HTML.

DBS responses are redirect-, time-, size-, and schema-bounded, normalized to plain text, and treated as untrusted. Some ARC editions flatten a section heading into the preceding verse and omit whitespace at punctuation boundaries. The DBS adapter repairs only unambiguous punctuation joins and removes only a glued, terminal, unpunctuated title-case suffix after a completed sentence; exact recorded James payload shapes guard this policy so ordinary verse sentences are retained. Consumer requests support cancellation; native requests have an eight-second deadline. With the owner's confirmed DBS permission, successful catalogs and chapters use a versioned app-local cache; chapters are capped at 32 MB/192 files and catalogs at one 8 MB response. Fresh catalog/chapter lifetimes are one and seven days respectively; a stale catalog response selects bundled WEB, and a failed uncached passage lookup visibly switches to WEB before any insertion.

### Output

Printing and PDF export operate on an immutable document snapshot, not the live editor DOM. The output renderer creates escaped semantic HTML and derives translation notices from citation marks. A pinned, locally bundled Paged.js boundary turns that source into fixed Letter page DOM; Verseform inserts the escaped DBS footer, notices, and optional page number into every generated page and rejects output if the footer does not fit its reserved area. The editor remains a continuous writing surface.

The same generated page tree is the Save PDF review surface and the offscreen WebView2 print surface. A page-number change increments the snapshot's layout version and repaginates only the already-frozen content. The kernel accepts readiness or failure only for the current operation, mode, and layout version; Print or Export cannot reach the platform adapter until pagination completes. Print then invokes WebView2's browser print-preview UI. Save PDF grants one destination through a native Save dialog and awaits WebView2 `PrintToPdf` completion with fixed Letter settings and browser headers disabled.

The output adapter remains the only platform-specific seam. Browser proof compares page count, boundaries, numbering, visible content, mixed formatting, and multiple notices between one-page and representative multi-page reviews and Chromium PDFs; it also retains focus, cancellation, immutable-option, failure, and no-provider-network cases. Native proof covers WebView2 browser-preview availability, destination validation, and visual inspection of a real WebView2 PDF export.

### Beta interaction surface

The native window title is the visible application identity and carries the document name and unsaved state. The content view begins with a compact menu/command row, a compact formatting row, and then the writing surface; it does not repeat a visible Verseform wordmark or permanent starter hint. The two-row command deck remains sticky as the continuous document scrolls. Removing visual guidance must not remove the window's accessible name, landmark labels, or skip-to-editor path.

File owns document and output commands, including browser download. Edit owns undo/redo, Find, and Paragraph. Help owns **Credits & Licenses** and the browser's **Using Verseform** panel. File/Edit/Help form one quiet menu strip without disclosure arrows; command and formatting controls reserve their border geometry but reveal it only on hover, keyboard focus, or active state. Unchecked settings retain a visible empty box. Shared size, gap, border, focus, active, and color tokens keep targets consistent while the chrome stays visually light. The editor's high-priority Tab binding dispatches a first-line-indent instruction for ordinary paragraphs, while Shift+Tab and the clearly labeled paragraph-arrow controls retain the full-left-indent path; list items keep Tiptap nesting behavior. Both attributes live in the Tiptap block and travel through the existing portable document and output boundaries. F6 is the separate region route: writing moves to the first detected reference and then to File, Shift+F6 reverses through the last reference, arrow keys move among reference decorations, and Escape returns to writing. The editor gateway owns targeted editor/reference focus instructions while the command deck owns its File focus target; accessible reference names state validity and available actions. The translation picker consumes the normalized catalog's `citationLabel` and full `name`: its bordered collapsed trigger shows the active abbreviation and a disclosure chevron, while its expanded list supports keyboard navigation and local search across abbreviation, identifier, title, vernacular title, and language code. Selection still enters through the controller; open/query/highlight are ephemeral React view state. A finite command registry supplies labels, shortcuts, enablement, and actions to menus and global keyboard handling.

Credits & Licenses is local application content. It shows the installed Verseform version, a clear thank-you and scripture-service credit to Digital Bible Society, the bundled WEB provenance, catalog-supplied notice for the effective translation, and the complete generated third-party dependency inventory. Provider metadata is rendered only as React text. Opening the view performs no provider or filesystem read because version and notices are embedded at build time.

External DBS and WEB-provenance buttons emit typed target IDs through the kernel and dedicated external-link port. The Windows command independently maps only those IDs to fixed HTTPS constants before calling the default browser; arbitrary URLs and local paths are rejected. The browser harness substitutes a deterministic event-producing fake. No remote origin enters the privileged webview CSP, and the view explicitly presents Verseform as independent rather than DBS-endorsed.

## Critical flows

### Detect, preview, insert

1. A delimiter transaction identifies the changed text block; the editor gateway emits a new revision and content hash.
2. The pure scanner returns valid and invalid candidates, and the editor maps them to transient decorations.
3. Hover/click dispatches a workspace event containing the candidate and anchor or source range.
4. The kernel emits one provider effect stamped with the operation, document, revision, source text, and effective translation.
5. The controller returns success, fallback, cancellation, or failure as a stamped event.
6. The kernel rejects any result that no longer owns the scripture region; insertion additionally rechecks the exact source range and text through the editor gateway.
7. One editor command replaces the reference and applies citation metadata in one transaction, producing one undo step; the resulting editor observation becomes the new document truth.

Stale, cancelled, malformed, unauthorized, or offline responses cannot mutate the document. Offline fallback to WEB is explicit before insertion, so the citation always names the text actually inserted.

### Save and recover

Editor observations update revision/current hash; dirty state is derived and a stamped scheduler effect replaces any older recovery/autosave timer. Explicit Save freezes and validates one immutable editor snapshot before emitting a native write effect. A matching success updates the saved-content hash and clears superseded recovery data; a late success cannot mark newer writing clean. On restart, Verseform offers recovery only when the recovery snapshot is newer or differs from the saved artifact.

Recovery Restore is a document action carrying the selected recovery identity, display name, and captured time. A different dirty draft therefore enters the same Save/Discard/Cancel overlay as New, Open, Recent, and Close. Cancel retains the draft; Save continues only after the exact frozen draft is saved; cancellation, failure, or intervening writing does not restore; and Discard explicitly abandons the draft before switching identity. The authorized switch clears the previous persistence, preview, insertion, and output owners before `content.set`, cancels their timers and lookups, and stamps subsequent recovery work with the restored document identity. Recovery writes and discards are serialized per document at the controller boundary so an older write cannot overtake cleanup or a cleanup overtake newer writing. Late results find no owning operation and cannot mutate the restored document or its recovery state.

### Print and export

The output transition claims the output region with an explicit mode and stamp, freezes one editor snapshot, validates it, aggregates translation notices, and renders print HTML. Print waits until the hidden frozen surface has painted, then hands it to WebView2's browser print-preview UI. Save PDF enters the exclusive PDF Export overlay without executing an adapter effect; Cancel releases the operation, while Export closes the overlay, waits for the selected snapshot to paint, and only then invokes the native Save/`PrintToPdf` boundary. Mismatched mode, phase, or operation results are ignored. Export writes only the user-selected PDF destination and never mutates the open document.

## Trust and privacy boundaries

- The main webview loads packaged application code only and uses a restrictive content security policy.
- Tauri capabilities grant the main window only the commands it needs. Prefer dedicated file commands over broad frontend filesystem scope.
- A path chosen by a native dialog is validated again by the native command. App-local profile and recovery commands never accept arbitrary roots.
- Provider URLs are allowlisted; redirects and response sizes are bounded.
- HTML from documents, paste, or providers is sanitized against the editor schema.
- Development fixtures contain no production credential or copyrighted corpus without redistribution permission.
- Do not add a global DBS secret: the accepted public ARC contract requires none, and a secret embedded in a shipped binary would not be protected. If DBS authorization changes, stop and establish a new distributable-client boundary before implementation.

## State and failure model

Use the canonical regions and discriminated states above rather than independent booleans or ref/state mirrors. Every async result carries an operation stamp. Late results are ignored by the pure transition function. Errors become typed result events, remain visible and recoverable, and never destroy accepted work. A modal overlay is exclusive; provider fallback changes the effective translation but never rewrites the saved preference; output and persistence always consume frozen snapshots.

## Invariant-to-proof map

| Invariant | Owning rule | Cheapest truthful proof |
|---|---|---|
| Detection is local and delimiter-triggered. | Core scanner + editor gateway | Pure corpus and editor transaction tests with provider-call count fixed at zero. |
| Text changes only by user edit or confirmed insertion. | Workspace transition + editor command | Transition table and one browser click/keyboard case. |
| A stale lookup never replaces changed text. | Operation stamp + source recheck | Pure transition/freshness tests; one delayed browser case. |
| Dirty state cannot disagree with the document. | Hash selector | Pure selector tests across edit/save/late-save/open/new events. |
| Recovery/autosave cannot clean or overwrite newer work. | Persistence region | Fake scheduler/store transition tests; native atomic-write smoke only for the filesystem claim. |
| Citations identify the text actually inserted. | Scripture fallback transition + citation command | Provider contract and browser fallback insertion case. |
| Output cannot mutate live writing or omit attribution. | Frozen output snapshot | Pure renderer/PDF extraction; native test only for WebView2/destination behavior. |
| Only one modal interaction owns focus. | Overlay union | Pure transition plus focused browser accessibility cases. |
| Menus and shortcuts execute the same enabled command. | Command registry | Registry unit table plus a small browser parity matrix. |
| Credits are complete, local, and safe. | Credits selector + allowlisted link port | Pure metadata tests, browser no-network assertion, and one native external-link allowlist test. |

## Verification economy

- **Pure tests:** parser, fuzz threshold, canon bounds, citation formatting, migrations, attribution, workspace transitions/selectors, command registry, operation stamps, and stale-result rules.
- **Editor integration:** transactions, selection, undo, citation exclusion, formatting, paste, hover/click mapping.
- **Provider contracts:** the same suite for fake, WEB, and recorded/schema-safe DBS responses; live DBS smoke is explicit and credential-gated.
- **Browser harness:** almost all user flows with fake ports, a redacted diagnostic snapshot, keyboard/accessibility checks, and a few vertical command-to-visible-result cases.
- **Windows checks:** atomic file behavior, crash recovery, print/PDF, WebView2 behavior, installer, and a short end-to-end smoke at milestone gates.

Every defect should leave a regression test at the cheapest layer that can truthfully reproduce it. During implementation, run the smallest owning test and its direct consumer; run `npm run check` once before a completed slice. Retain heavy PDF, installer, and native evidence only for release claims or previously unstable platform seams.

Release evidence is produced from a clean Windows runner, not inferred from a developer workstation. The release workflow preserves the exact verified Alpha installer once in a non-latest `v0.1.0` archival pre-release, records its source/run/archive/installer digests in a committed manifest, and re-downloads and hashes that immutable release asset before each patch gate. The patch job therefore has no dependency on the expiring Actions-only artifact. It exercises clean install and Alpha-to-patch upgrade lifecycles and uploads the installer beside machine-readable commit, run, version, signing, baseline, and SHA-256 records. The release record links that immutable run and states signing status, supported behavior, privacy, credits, and known limits.

### Field Beta distribution boundary

Each public GitHub pre-release is a projection of clean-runner evidence, not a second build path. The `v0.2.0`, `v0.2.1`, and session-blocker patch `v0.2.2` tags remain fixed to their field builds. For each version, the installer, `SHA256SUMS.txt`, and `release-evidence.json` are copied byte-for-byte from its clean run. The release page links the full local release record and privacy statement, labels the build as an unsigned Windows Beta, and never presents it as stable or publisher-verified. Once published, an asset is immutable by policy; a changed executable requires a new version, a new clean run, and a new release.

Field feedback is an optional human boundary rather than application telemetry. A repository issue form requests categorical environment context and invented, non-sensitive reproduction steps. It warns users not to attach documents, recovery state, cache contents, private writing, personal information, or credentials. Verseform performs no issue submission, version check, crash upload, background request, or update installation; opening the application cannot contact GitHub.

## Production browser edition (VFM-180)

The owner approved a desktop Chrome/Edge browser edition after Windows 0.2.3. `web/main.tsx` composes the same kernel, controller, editor gateway, React UI, document schema, DBS normalization, and output renderer with real browser adapters. `vite.web.config.ts` builds `web/index.html` into `dist-web/`. The existing `browserAdapters.ts`, default browser `dist/`, fabricated scripture, synthetic paths, and diagnostic globals remain test-harness authority and are excluded from the deployable web bundle.

| Boundary | Production implementation and evidence |
|---|---|
| Documents | `WebDatabase` commits IndexedDB transactions only on transaction completion. `WebDocumentStore` stores validated portable envelopes, a separate lightweight draft index, session-keyed recovery, preferences, and scripture caches in `verseform.web.v1`. Opaque `draft:` IDs are storage keys, never filesystem claims. Draft/index/revision writes are atomic, serialized in each tab, and compare the tab's last observed revision inside the write transaction. A stale tab receives an actionable failure and retains writing. |
| Save and recovery | The web kernel schedules recovery after 250 ms and draft autosave after 1100 ms, including unnamed drafts and restored recovery. Save commits immediately; Save a copy prompts for a name and adopts a fresh returned document identity. Page hiding flushes pending captures, and browser unload protects dirty writing. Recoveries belong to a session; ordinary cleanup only discards that session's recovery, while explicit discard targets the selected timestamp. Browser termination can interrupt the final pending work, so independent downloads remain necessary. |
| Import and download | A user-activated file input accepts a bounded, fully validated `.verseform` envelope and stores an independent copy with a fresh identity. A kernel revision stamp rejects replacement if typing continued during import/open; the imported copy remains in Drafts. Download emits a validated JSON Blob and reports only that a download started, never updates the local saved hash, and resumes pending persistence. Denied/full storage leaves download available. |
| Scripture | `WebDbsTransport` uses only the fixed public ARC catalog/chapter endpoint, validates coordinates, omits credentials/referrer, rejects redirects, times out after 12 seconds, and bounds streamed responses to 8 MiB catalog / 2 MiB chapter. Catalog/chapter TTLs are 24 hours / 7 days; validated stale entries can satisfy offline/service-failure requests, while caller cancellation never falls back. The chapter cache is transactionally pruned to 192 entries / 32 MiB. Storage failure cannot suppress valid online scripture. Composite fallback uses real bundled WEB and its own attribution. |
| Offline application | The production build emits an allowlisted, content-versioned service worker that caches index, scripts, styles, and bundled WEB. Installation failure reports offline reopening unavailable; online writing remains usable. Updates wait for open tabs to close, with no forced reload or skipWaiting. Activation removes only prior application caches and never document storage. The initial JavaScript bundle is about 5.40 MB (1.55 MB gzip), including the entire WEB corpus; first offline availability requires that download. |
| Print/PDF | Shared Paged.js freezes and paginates attributed Letter pages before the browser output port calls `window.print()`. Save PDF explains selecting Save as PDF, Letter, 100% scale, and disabling browser headers/footers. Closing print UI is not evidence of a saved file. Completed snapshots are retired on subsequent web edits; browser-chrome printing without a current prepared snapshot shows a File-menu guide instead of blank or stale output. No document-rendering server is involved. |
| Shell | A passive web document bar supplies name/save status and the Windows download. File contains the portable document download, while Help opens the usage/storage/output guidance in a keyboard-contained dialog. Tab titles and beforeunload stay behind browser ports; key commands retain shared semantics. No account, cloud writing storage, mobile support, remote control, analytics, or production diagnostics are added. |

`tests/web/` serves the actual `dist-web` with Vercel's production CSP/security headers. It covers real IndexedDB/Blob/file-input/service-worker behavior, failed saves and recovery, conflicting tabs, slow/corrupt imports, update waiting, offline reopening, recorded HTTP through the real web transport, fallback, PDF text/attribution, keyboard use, and Axe accessibility. Pure tests cover kernel persistence stamps plus bounded streamed responses, cancellation, and stale-cache behavior. The existing harness and native gates remain independent parity evidence.

`vercel.json` selects the explicit web build and `dist-web`, supplies restrictive static security headers, and keeps index/service-worker responses revalidated. Only `https://arc.dbs.org` is allowed for external fetches; the Windows privileged CSP retains no remote origin. Hosting sends only static application assets; documents stay browser-local. Drafts belong to one stable origin, so preview URLs and production domains do not share data. GitHub Releases hosts the pinned Windows installer. Ordinary push/PR checks are in `check.yml`; Windows publication in `windows-beta.yml` requires explicit workflow dispatch and cannot be triggered by a web push.

The build is ready for Vercel import at repository root with Node.js 22 and no environment variables. Vercel account linking/live deployment is still pending an authenticated owner project. A recorded/local browser test is not deployed-origin CORS evidence. The public catalog and ENGWEB/JHN/3 endpoint returned HTTP 200 and `Access-Control-Allow-Origin: *` in prior header probes; perform a live browser insertion and offline reopening on the final HTTPS origin before calling deployment verified. See [Vercel's Vite integration](https://vercel.com/docs/frameworks/frontend/vite), [IndexedDB transactions](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB), and [DBS ARC documentation](https://arc.dbs.org/docs).

## Refactor method

`VFM-090` applied this strangler sequence around the verified Alpha behavior; keep it as the rule for any later control-plane migration:

1. Preserve the browser cases as parity evidence and introduce workspace types, reducer, selectors, and a fake scheduler without changing rendered behavior.
2. Route one complete flow at a time through the kernel: document/persistence first, scripture second, output/overlays/commands third. A migrated flow can no longer call a runtime adapter from React.
3. Introduce the editor gateway where a migrated flow needs an editor snapshot or instruction. Do not make Tiptap JSON application state or recreate ProseMirror.
4. Delete superseded React refs, booleans, effects, and handlers in the same flow's change; do not leave dual control paths.
5. Split the passive UI by interaction surface only after orchestration has moved. Component boundaries follow stable view-model and intent contracts.

Do not change the `.verseform` schema, DBS/WEB contracts, native file commands, output semantics, or visible Alpha behavior during the kernel refactor. Do not add a state-management dependency unless the pure TypeScript design proves insufficient. Each commit must leave the app runnable and the migrated vertical flow proved.

## Knowledge ownership

- Requirements own **what** the user receives.
- This design owns **how responsibilities connect**.
- Decisions own **why durable choices were made**.
- Roadmap owns **what happens next and its exit proof**.
- `WORK.md` owns **current truth only**.
- Schemas, tests, and fixtures own **executable examples**.

Do not duplicate these authorities. Change the owning artifact and link to it.

For any change, trace the tower in both directions: start at the owning requirement and invariant; identify the workspace event, region, selector, and any effect; follow that effect to exactly one port or editor command; then prove the rule at the cheapest layer and keep only the minimum vertical browser/native evidence. If that path is ambiguous, repair the ownership model before adding behavior.

## Primary references

- [Tauri capabilities and IPC boundaries](https://v2.tauri.app/reference/acl/capability/)
- [Tauri dialog plugin](https://v2.tauri.app/plugin/dialog/)
- [ProseMirror schema, transactions, plugins, and decorations](https://prosemirror.net/docs/guide/)
- [Tiptap schema and custom extensions](https://tiptap.dev/docs/editor/core-concepts/schema)
- [Microsoft WebView2 printing and PDF output](https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/print)
