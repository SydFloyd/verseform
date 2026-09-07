# Verseform

Verseform is a lightweight, local-first Windows text editor with one-click scripture insertion from authorized DBS translations and bundled WEB fallback.

## Start here

- `WORK.md` — current truth and next action.
- `outputs/scripture-text-editor-requirements.md` — product contract.
- `outputs/verseform-system-design.md` — system shape and boundaries.
- `outputs/verseform-decisions.md` — durable decisions and unresolved gates.
- `outputs/verseform-roadmap.md` — tight delivery sequence.

## Current milestone

Verseform `0.2.2` is the current Windows Beta patch candidate. Public `0.2.1` remains immutable, but session testing found that expanding an earlier reference can leave a later reference previewable but unable to insert, and that X can fail to close a dirty Windows window. The 0.2.2 source corrects both blockers and has passed targeted native retesting; clean Windows release verification and patched delivery remain pending. The exact Alpha upgrade baseline remains durable, the public [Digital Bible Society ARC API](https://arc.dbs.org/docs) and bundled World English Bible remain the online and explicit offline scripture sources, and detection remains entirely local.

The 2026-09-05 review identified recovery-restore safety, keyboard reachability, and PDF-preview pagination gaps despite a passing automated suite. `VFM-130`–`VFM-150` correct all three in 0.2.1; the [immutable 0.2.0 pre-release](https://github.com/SydFloyd/verseform/releases/tag/v0.2.0) remains historical and unchanged. **First independent-user validation is still pending.** [The preparation roadmap](outputs/verseform-roadmap.md#first-user-preparation-review--2026-09-05) and release record define the remaining observed session required to close `VFM-160`.

Read [BETA-RELEASE.md](BETA-RELEASE.md) for supported behavior, keyboard commands, known limits, the exact verified installer, and its checksum. The installer is an explicitly unsigned field Beta; Windows may show an unrecognized-publisher warning. [ALPHA-RELEASE.md](ALPHA-RELEASE.md) preserves the prior milestone evidence, and [PRIVACY.md](PRIVACY.md) describes exactly what stays local and when the DBS service is contacted. Report defects and daily-use friction through the [Beta feedback form](https://github.com/SydFloyd/verseform/issues/new?template=beta-feedback.yml) without attaching private writing or Verseform data files.

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

Build and exercise the per-user Windows installer:

```powershell
npm run build:desktop
npm run test:installer
```
