# Verseform

Verseform is a lightweight, local-first Windows text editor with one-click scripture insertion from authorized DBS translations and bundled WEB fallback.

## Start here

- `WORK.md` — current truth and next action.
- `outputs/scripture-text-editor-requirements.md` — product contract.
- `outputs/verseform-system-design.md` — system shape and boundaries.
- `outputs/verseform-decisions.md` — durable decisions and unresolved gates.
- `outputs/verseform-roadmap.md` — tight delivery sequence.

## Current slice

`VFM-050` completes attributed print and PDF output. Verseform freezes the open document into escaped print HTML, repeats “Powered by DBS” and every used translation notice on each Letter page, and optionally numbers pages. Print opens the Windows system print flow; Save PDF uses a native destination dialog and awaits WebView2's direct PDF writer without mutating the document. The public [Digital Bible Society ARC API](https://arc.dbs.org/docs) and complete bundled World English Bible from `VFM-040` remain the online and explicit offline scripture sources; detection remains entirely local.

## Develop and verify

```powershell
npm ci
npm run dev:desktop
```

The canonical repository check runs TypeScript, pure tests, the production browser harness, and native Rust/Windows smoke tests:

```powershell
npm run check
```

The normal suite uses recorded provider data. The opt-in, no-secret DBS contract smoke is:

```powershell
$env:DBS_LIVE_SMOKE='1'; npm run test -- tests/providers.test.ts
cargo test --manifest-path src-tauri/Cargo.toml live_arc_transport -- --ignored
```

The bundled WEB corpus is generated from the official public-domain eBible.org archive. Provenance and the pinned source checksum are recorded in `src/assets/WEB-SOURCE.md`; rebuild it with `scripts/build-web-corpus.ps1` after obtaining that source archive.

Build a Windows executable without creating an installer:

```powershell
npx tauri build --debug --no-bundle
```
