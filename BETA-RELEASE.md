# Verseform 0.2.2 Windows Beta candidate

## Corrected patch release

The clean Windows workflow will publish Verseform 0.2.2 only after the exact commit passes the canonical suite, Alpha-to-patch preservation, a separate clean offline installer lifecycle, npm and Rust advisory audits, and release-boundary checks. The release will attach `Verseform_0.2.2_x64-setup.exe`, `SHA256SUMS.txt`, and `release-evidence.json` from that same run; verify the installer against the attached checksum before installation.

This remains an unsigned field Beta, not a stable `1.0` or verified-publisher release. Windows SmartScreen may show an unrecognized-publisher warning. Optional defect and daily-use reports belong in the [privacy-constrained Beta feedback form](https://github.com/SydFloyd/verseform/issues/new?template=beta-feedback.yml); never attach private writing or Verseform document, recovery, or cache files.

## Supported Beta

Verseform 0.2.2 targets current 64-bit Windows 10 and Windows 11 systems with Microsoft Edge WebView2. Its per-user NSIS installer does not require administrator rights. A user can write and format local `.verseform` documents; detect valid, fuzzy, ranged, and invalid scripture references locally after a delimiter; preview and insert an authorized passage with one click; recover interrupted work; reopen recent documents; print through browser preview; and review then export attributed Letter-size PDFs without an account.

Online sessions load authorized translations from the public Digital Bible Society ARC API, prefer a saved translation and otherwise NASB when available, and cache successful catalogs for one day and chapters for seven days. Offline sessions explicitly use the bundled public-domain World English Bible (WEB) without changing the saved online preference. Help → Credits & Licenses records the installed version, thanks and links to DBS, identifies the effective translation and WEB, and exposes the audited software-license inventory locally.

The patch keeps the Alpha/Beta application identity and document schema. Installing 0.2.2 over 0.1.0, 0.2.0, or 0.2.1 preserves documents, recent-file/profile settings, recovery snapshots, scripture cache, semantic citation metadata, and required attribution. Uninstall removes the program and Windows registration but deliberately leaves user documents and recoverable app-local data.

## Corrected since 0.2.0

- Recovery Restore now identifies the recovery and protects a different dirty draft with Save, Discard, or Cancel. A canceled/failed Save or newer edit does not restore over accepted writing.
- `F6` moves from writing through detected references to File; `Shift+F6` reverses the route, arrows traverse references, and Escape returns to writing without taking Tab/Shift+Tab away from paragraph indentation.
- Save PDF now reviews the same fixed Letter page tree used by WebView2 output, including actual page boundaries, repeated translation attribution, and optional page numbers. The editor remains continuous.
- A later reference now remains insertable after an earlier replacement shifts its document position; the live range is resolved at interaction time while the existing source-text and revision checks still reject genuinely stale lookups.
- Windows X-close now uses one native path through Verseform's Save/Discard/Cancel gate. The desktop no longer registers a competing browser unload blocker that can strand a dirty WebView2 window.

The immutable [0.2.0 pre-release](https://github.com/SydFloyd/verseform/releases/tag/v0.2.0) remains available as historical evidence; its assets are not replaced.

## Session blockers corrected in 0.2.2

Session testing found that `0.2.1` can preview but refuse to insert a later reference after an earlier reference expands and shifts its document position, and can refuse to close a dirty Windows window from X. The immutable public release remains available as its exact verified artifact; `0.2.2` corrects both blockers and must pass the clean release gate before the affected tasks are retested.

## Keyboard

- `Ctrl+N`, `Ctrl+O`, `Ctrl+S`, `Ctrl+Shift+S`, and `Ctrl+P` run the matching document action.
- `Ctrl+F` or `Ctrl+H` opens Find and Replace. `Ctrl+Z` and `Ctrl+Y` undo and redo.
- `Ctrl+B`, `Ctrl+I`, and `Ctrl+U` toggle familiar text formatting. `Tab` and `Shift+Tab` indent or outdent the current paragraph by one level while editor focus remains active.
- `F6` moves from writing to the first detected reference and then to File; `Shift+F6` reverses that route, arrow keys move among reference decorations, and `Enter` or `Space` inserts a focused valid reference. `Escape` returns from a reference to writing.
- `F1` opens Credits & Licenses. The visible skip link lets a keyboard user move directly past the command deck to the writing surface.

## First-use walkthrough

1. Start writing, then type a reference such as `John 3:16` followed by a delimiter: a space, punctuation, or Enter. Detection happens locally only after that delimiter. A valid reference is highlighted; an invalid chapter or verse is marked with an explanation.
2. Hover a reference to preview it, or press `F6` from writing to reach the first detected reference and use the arrow keys to move among references. Click a valid reference—or press `Enter` or `Space` while it is focused—to replace only that reference with the passage and editable citation. No replacement happens on hover or detection alone. Press `Escape` to return to writing.
3. Press `Ctrl+Z` if you want the original reference back. The passage and citation are inserted as one undo step.
4. The Scripture control shows the translation that will actually be used. Search and select an authorized online translation there. When that text is unavailable offline, Verseform visibly uses bundled public-domain WEB instead and labels the inserted citation accordingly; it does not silently call WEB by the saved online translation's name.
5. Press `Ctrl+S` to choose a durable `.verseform` file, or `Ctrl+Shift+S` to save another copy. Autosave can update an already-saved document, while app-local recovery protects interrupted unsaved work; recovery is not a replacement for choosing a file you can reopen. Restoring an older recovery while another draft is dirty first offers Save, Discard, or Cancel. Use `Ctrl+O` or File → Open Recent to reopen a saved document.
6. Use File → Print to open the Windows/WebView2 print route. Use File → Save PDF to review the frozen Letter pages, including repeated attribution and optional page numbers, before choosing the PDF destination. The live editor remains continuous and unchanged.
7. Optional defect or daily-use feedback belongs in the linked Beta feedback form. Describe the issue with invented text and never attach private writing, `.verseform` documents, recovery data, cache files, personal information, or credentials.

## First independent tester handoff

Use invented writing in one observed 20–30 minute Windows session. Give the tester this ordinary release record and walkthrough, then record coaching rather than counting a coached task as independent discovery.

1. Record the exact installer checksum, Windows/WebView2 version, display and text scale, and any unsigned-installer friction.
2. Observe writing/formatting, delimiter discovery, valid and invalid reference handling, preview, insert, Undo, translation choice, Save/reopen, autosave/recovery, one cancellation, and one disposable failed destination.
3. Start once offline with WEB, reopen online with the saved preferred translation, compare a multi-page PDF review with its export, and exercise a printer when available or record physical printing as unverified.
4. Record task completion, hesitation, coaching, recoverability, and willingness to use Verseform again. Collect no private document, cache, recovery, identity, or credential data.

Automation is not a substitute for this session. `VFM-160` closes only when a person completes it with no unresolved writing-loss, scripture-correctness, or core-task blocker.

## Privacy and scripture credit

[PRIVACY.md](PRIVACY.md) is the authoritative privacy statement. Detection is local. Verseform sends DBS only the chosen translation, book, and chapter when a preview or insertion needs uncached online text; it never sends document prose, file names, identity, recovery data, or analytics. Remote text is size- and schema-checked, normalized to plain text, and never executed as provider HTML.

Scripture service is provided by [Digital Bible Society](https://dbs.org/). Translation-specific notices travel with citations and are included automatically in print and PDF output. Bundled WEB text comes from the [eBible.org World English Bible](https://ebible.org/find/show.php?id=engwebp) and is public domain. DBS is credited with gratitude; no endorsement is implied.

## Known limits

- The installer is **not code-signed**. Windows SmartScreen may show an unrecognized-publisher warning. Verseform does not claim verified-publisher status.
- The installed app needs Microsoft Edge WebView2. Setup may require a connection to obtain Microsoft's WebView2 bootstrapper when the runtime is absent.
- A document is limited to 10 MiB serialized, 1,000,000 text characters, 50,000 content nodes, and 64 levels of nesting. An edit or paste that would cross a limit is rejected without replacing accepted writing.
- Scripture detection uses the standard 66-book Protestant canon. Provider-confirmed chapter omissions remain authoritative, and translations other than bundled WEB require DBS connectivity at least once before their chapters can be cached.
- The editor is a continuous writing surface. Editing-view pagination, configurable margins, editable headers/footers, DOCX, accounts, sync, collaboration, macOS, Linux, and web distribution are outside this Beta.
- Print uses the WebView2 browser-preview path. PDF export uses a fixed Letter layout with required scripture notices and an optional page number; printer availability and native destination permissions remain Windows responsibilities.
- Independent-user validation remains pending until the session above is completed; automated and owner checks establish the candidate, not uncoached usability.
- The public `0.2.1` build contains the two session blockers described above; do not use it as completion evidence for the independent-user gate.

## Release evidence

- The workflow archives the exact unsigned 0.1.0 installer as a non-latest [`v0.1.0` upgrade-baseline pre-release](https://github.com/SydFloyd/verseform/releases/tag/v0.1.0), then verifies its 4,197,262 bytes and SHA-256 `0caebf685ed7debfbb164b32a807871fb5d94026c471e1c03f23d2b025544001` before every patch gate. It came from Alpha run `33759181934` at commit `0c41ff0ad845533679611ccb4c5bf969ceaf5e0a`; future patch verification no longer depends on that expiring Actions artifact.
- The 0.2.2 workflow runs the complete canonical gate, builds the unsigned NSIS installer, proves Alpha-to-patch profile/recovery/cache/document preservation, proves a separate clean offline install/uninstall lifecycle, audits advisories, and records version, commit, run, runner, installer SHA-256, unsigned status, and baseline provenance in `release-evidence.json`.
- The canonical gate currently contains 44 pure/provider/kernel/controller/architecture tests plus one opt-in live smoke, 40 production-browser journeys, 11 native unit tests plus one opt-in live smoke, 7 Windows smoke tests, TypeScript, Rust formatting, Clippy, capability/CSP validation, and 678 locked dependency-license records.
- [Clean Windows run `33995590945`](https://github.com/SydFloyd/verseform/actions/runs/33995590945) passed at commit `1da671920bffa5c373640278281d7c213aa95336`: the durable-baseline archive check, canonical suite, release build, Alpha-to-patch preservation, separate clean offline installer lifecycle, Rust advisory scan, evidence upload, publication, and public re-download verification all succeeded. Its 30-day artifact `verseform-0.2.1-windows-beta` is ID `9978236778` with archive SHA-256 `66d76c9effd7230765051400f26a921a82e7d0d365f16878c04b83fa539b1856`.
- The public [`v0.2.1` pre-release](https://github.com/SydFloyd/verseform/releases/tag/v0.2.1) resolves to that exact commit. Its unsigned 4,309,127-byte installer has SHA-256 `888a771cc705b214115b50e32298ddb6c5c3dd01b7d25d04ebf75be6fbf8a80a`; a fresh public download returned the same size, digest, and `NotSigned` status. GitHub records `SHA256SUMS.txt` as `sha256:0e78bb4e92a76002ad43d82bd2b3faf96a7483e12c400081fbad2ea84fa633e8` and `release-evidence.json` as `sha256:d5712fa3a7efdd97de2590020044c1082bd8aaaa75fc994e8e8d4fc894dc22d9`. Historical 0.2.0 evidence remains in that release and version control.
- Exact 0.2.2 run, artifact, installer, checksum, signature, and public re-download evidence remain pending until the clean Windows workflow succeeds.

## Reproduce the release gate

From a clean checkout with Node.js 22, stable Rust, and Windows WebView2:

```powershell
npm ci
npm run fetch:upgrade-baseline
npm audit --audit-level=high
cargo install cargo-audit --locked
cargo audit --file src-tauri/Cargo.lock
npm run check
npm run build:desktop
npm run test:upgrade
npm run test:installer
```

The authoritative installer is the one attached to the exact successful run and public pre-release. Verify it against the adjacent `SHA256SUMS.txt` before installation.
