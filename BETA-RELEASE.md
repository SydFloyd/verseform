# Verseform 0.2.0 Windows Beta

## Public Beta download

[Verseform 0.2.0 Windows Beta](https://github.com/SydFloyd/verseform/releases/tag/v0.2.0) is published as a GitHub pre-release from the exact verified candidate commit. Download [the Windows installer](https://github.com/SydFloyd/verseform/releases/download/v0.2.0/Verseform_0.2.0_x64-setup.exe) together with [SHA256SUMS.txt](https://github.com/SydFloyd/verseform/releases/download/v0.2.0/SHA256SUMS.txt); [release-evidence.json](https://github.com/SydFloyd/verseform/releases/download/v0.2.0/release-evidence.json) records the source commit and clean workflow run. Installer SHA-256: `efe2b30270afb22ee5a8e9d99ded947b8a44ac82aa13e8096527c706e2ecb241`.

This is an unsigned field Beta, not a stable `1.0` or verified-publisher release. Windows SmartScreen may show an unrecognized-publisher warning. Optional defect and daily-use reports belong in the [privacy-constrained Beta feedback form](https://github.com/SydFloyd/verseform/issues/new?template=beta-feedback.yml); never attach private writing or Verseform document, recovery, or cache files.

## Supported Beta

Verseform 0.2.0 targets current 64-bit Windows 10 and Windows 11 systems with Microsoft Edge WebView2. Its per-user NSIS installer does not require administrator rights. A user can write and format local `.verseform` documents; detect valid, fuzzy, ranged, and invalid scripture references locally after a delimiter; preview and insert an authorized passage with one click; recover interrupted work; reopen recent documents; print through browser preview; and review then export attributed Letter-size PDFs without an account.

Online sessions load authorized translations from the public Digital Bible Society ARC API, prefer a saved translation and otherwise NASB when available, and cache successful catalogs for one day and chapters for seven days. Offline sessions explicitly use the bundled public-domain World English Bible (WEB) without changing the saved online preference. Help → Credits & Licenses records the installed version, thanks and links to DBS, identifies the effective translation and WEB, and exposes the audited software-license inventory locally.

The Beta keeps the Alpha application identity and document schema. Installing 0.2.0 over 0.1.0 preserves documents, recent-file/profile settings, recovery snapshots, scripture cache, semantic citation metadata, and required attribution. Uninstall removes the program and Windows registration but deliberately leaves user documents and recoverable app-local data.

## Keyboard

- `Ctrl+N`, `Ctrl+O`, `Ctrl+S`, `Ctrl+Shift+S`, and `Ctrl+P` run the matching document action.
- `Ctrl+F` or `Ctrl+H` opens Find and Replace. `Ctrl+Z` and `Ctrl+Y` undo and redo.
- `Ctrl+B`, `Ctrl+I`, and `Ctrl+U` toggle familiar text formatting. `Tab` and `Shift+Tab` indent or outdent the current paragraph by one level while editor focus remains active.
- `Enter` or `Space` activates a focused detected reference. `Escape` closes transient previews, menus, and dialogs where applicable and returns focus predictably.
- `F1` opens Credits & Licenses. The visible skip link lets a keyboard user move directly past the command deck to the writing surface.

## Privacy and scripture credit

[PRIVACY.md](PRIVACY.md) is the authoritative privacy statement. Detection is local. Verseform sends DBS only the chosen translation, book, and chapter when a preview or insertion needs uncached online text; it never sends document prose, file names, identity, recovery data, or analytics. Remote text is size- and schema-checked, normalized to plain text, and never executed as provider HTML.

Scripture service is provided by [Digital Bible Society](https://dbs.org/). Translation-specific notices travel with citations and are included automatically in print and PDF output. Bundled WEB text comes from the [eBible.org World English Bible](https://ebible.org/find/show.php?id=engwebp) and is public domain. DBS is credited with gratitude; no endorsement is implied.

## Known limits

- **Review findings, 2026-09-05:** the first independent test user has not started. These findings are present in the published `0.2.0` installer and are tracked in [`VFM-130`–`VFM-160`](outputs/verseform-roadmap.md). `VFM-130` corrects recovery restore in later source; the published installer has not been changed.
- **Recovery restore:** choosing Restore can replace current unsaved writing without a Save/Discard/Cancel prompt. Save any current draft before restoring an earlier recovery.
- **Keyboard navigation:** Enter/Space activates a reference once focused, but a direct documented keyboard route from typing to that reference or the command deck is missing; the existing activation test uses programmatic focus. Tab/Shift+Tab remain indentation commands.
- **PDF review:** the dedicated dialog shows the frozen document as a continuous sheet with one Page 1 label when numbering is enabled. It does not show actual exported page breaks or repeated footers. Multi-page PDF text/attribution checks pass; inspect the exported PDF for page layout until `VFM-150` closes this gap.
- The installer is **not code-signed**. Windows SmartScreen may show an unrecognized-publisher warning. Verseform does not claim verified-publisher status.
- The installed app needs Microsoft Edge WebView2. Setup may require a connection to obtain Microsoft's WebView2 bootstrapper when the runtime is absent.
- A document is limited to 10 MiB serialized, 1,000,000 text characters, 50,000 content nodes, and 64 levels of nesting. An edit or paste that would cross a limit is rejected without replacing accepted writing.
- Scripture detection uses the standard 66-book Protestant canon. Provider-confirmed chapter omissions remain authoritative, and translations other than bundled WEB require DBS connectivity at least once before their chapters can be cached.
- The editor is a continuous writing surface. Editing-view pagination, configurable margins, editable headers/footers, DOCX, accounts, sync, collaboration, macOS, Linux, and web distribution are outside this Beta.
- Print uses the WebView2 browser-preview path. PDF export uses a fixed Letter layout with required scripture notices and an optional page number; printer availability and native destination permissions remain Windows responsibilities.

## Verified release evidence

- [Windows Beta run 33807242045](https://github.com/SydFloyd/verseform/actions/runs/33807242045) verifies candidate commit `8b625569c535f4aeae21be7eea10ecd0b0982acf` on a clean GitHub-hosted Windows runner. It downloads the retained 0.1.0 Alpha artifact by exact run, audits npm and Rust dependencies, executes the canonical and stabilization suites, builds 0.2.0, proves Alpha-to-Beta profile/recovery/cache/document preservation, proves a separate clean offline installer lifecycle, and uploads the recorded artifact.
- [Artifact `verseform-0.2.0-windows-beta`](https://github.com/SydFloyd/verseform/actions/runs/33807242045/artifacts/9914089711) contains `Verseform_0.2.0_x64-setup.exe`, `SHA256SUMS.txt`, and `release-evidence.json`. Installer SHA-256: `efe2b30270afb22ee5a8e9d99ded947b8a44ac82aa13e8096527c706e2ecb241`. GitHub retains the artifact through `2026-10-03T21:39:46Z`; its uploaded archive digest is `sha256:5c0731c4d54f5ccee3e9c3fe6f12a5b2b2d30ea47a240d02cb825743cc6bbf0e`.
- Public pre-release [`v0.2.0`](https://github.com/SydFloyd/verseform/releases/tag/v0.2.0) targets that exact candidate. GitHub reports the public 4,216,346-byte installer asset with the same SHA-256, and an independent direct download was re-hashed successfully after publication. Published assets are not replaced in place; any corrected binary receives a new version and clean-runner proof.
- The canonical gate contains 39 pure/provider/kernel/controller/architecture tests plus one opt-in live smoke, 33 production-browser journeys, 11 native unit tests plus one opt-in live smoke, 7 Windows smoke tests, TypeScript, Rust formatting, Clippy, capability/CSP validation, and 660 locked dependency-license records. The focused endurance case repeats six complete document/scripture/save/print/PDF cycles while reusing one cached chapter; aging tests cover both TTLs and both cache bounds.

## Reproduce the release gate

From a clean checkout with Node.js 22, stable Rust, Windows WebView2, and the retained Alpha installer at `artifacts/alpha/Verseform_0.1.0_x64-setup.exe`:

```powershell
npm ci
npm audit --audit-level=high
cargo install cargo-audit --locked
cargo audit --file src-tauri/Cargo.lock
npm run check
npm run build:desktop
npm run test:upgrade
npm run test:installer
```

The authoritative artifact is the one attached to the exact successful run above. Verify its installer against the bundled `SHA256SUMS.txt` before installation.
