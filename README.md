# Verseform

Verseform is a lightweight, local-first Windows text editor with one-click scripture insertion from authorized DBS translations and bundled WEB fallback.

## Start here

- `WORK.md` — current truth and next action.
- `outputs/scripture-text-editor-requirements.md` — product contract.
- `outputs/verseform-system-design.md` — system shape and boundaries.
- `outputs/verseform-decisions.md` — durable decisions and unresolved gates.
- `outputs/verseform-roadmap.md` — tight delivery sequence.

## Current milestone

Verseform `0.2.0` Windows Beta is complete. Its compact writing-first interface and application kernel passed repeated daily-use, bounded cache/recovery, Alpha-to-Beta upgrade, clean offline install, advisory, and license proofs on a clean Windows runner. The public [Digital Bible Society ARC API](https://arc.dbs.org/docs) and bundled World English Bible remain the online and explicit offline scripture sources; detection remains entirely local.

Read [BETA-RELEASE.md](BETA-RELEASE.md) for supported behavior, keyboard commands, known limits, the exact verified installer, and its checksum. [ALPHA-RELEASE.md](ALPHA-RELEASE.md) preserves the prior milestone evidence. [PRIVACY.md](PRIVACY.md) describes exactly what stays local and when the DBS service is contacted.

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
