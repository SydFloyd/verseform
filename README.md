# Verseform

Verseform is a lightweight, local-first text editor for Windows and desktop browsers, with one-click scripture insertion from authorized DBS translations and bundled WEB fallback.

## Start here

- `WORK.md` — current truth and next action.
- `outputs/scripture-text-editor-requirements.md` — product contract.
- `outputs/verseform-system-design.md` — system shape and boundaries.
- `outputs/verseform-decisions.md` — durable decisions and unresolved gates.
- `outputs/verseform-roadmap.md` — tight delivery sequence.

## Current milestone

Verseform `0.2.4` is the owner-authorized Windows Beta candidate for the shared menu, selector, and indentation refinements. It retains complete-reference recognition: whole chapters, ordered verse lists, and ranges across chapters, with a one-chapter-or-50-verses insertion limit. See [the release record](BETA-RELEASE.md). The installer remains unsigned; the record will identify the exact public bytes after the clean Windows workflow succeeds.

The shifted-reference and dirty Windows-close corrections from `0.2.2` remain included. Previous releases are immutable, and the exact Alpha upgrade baseline remains durable. The public [Digital Bible Society ARC API](https://arc.dbs.org/docs) and bundled World English Bible remain the online and explicit offline scripture sources, and detection remains entirely local.

The 2026-09-05 review identified recovery-restore safety, keyboard reachability, and PDF-preview pagination gaps despite a passing automated suite. `VFM-130`–`VFM-150` correct all three in 0.2.1; the [immutable 0.2.0 pre-release](https://github.com/SydFloyd/verseform/releases/tag/v0.2.0) remains historical and unchanged. **Complete first-user validation is still in progress.** [The preparation roadmap](outputs/verseform-roadmap.md#first-user-preparation-review--2026-09-05) and release record define the remaining observed session required to close `VFM-160`.

Read [BETA-RELEASE.md](BETA-RELEASE.md) for supported behavior, keyboard commands, known limits, the exact verified installer, and its checksum. The installer is an explicitly unsigned field Beta; Windows may show an unrecognized-publisher warning. [ALPHA-RELEASE.md](ALPHA-RELEASE.md) preserves the prior milestone evidence, and [PRIVACY.md](PRIVACY.md) describes exactly what stays local and when the DBS service is contacted. Report defects and daily-use friction through the [Beta feedback form](https://github.com/SydFloyd/verseform/issues/new?template=beta-feedback.yml) without attaching private writing or Verseform data files.

## Develop and verify

The production browser edition is live at [verseform.kmproto.com](https://verseform.kmproto.com). It shares the Windows editor, scripture logic, and portable document format. It saves drafts in this browser without an account, supports `.verseform` import/download through File, and uses the browser's Print/Save as PDF dialog. After the **Ready offline** indicator appears, it can reopen offline with bundled WEB. Clearing site data or private browsing can remove drafts; download documents you want to keep. Current desktop Chrome and Edge are the supported browser targets.

```powershell
npm ci
npm run dev:web
```

Open `http://127.0.0.1:1430`. `npm run build:web` creates the deployable `dist-web/`; `npm run preview:web` serves it on port 1431, and `npm run test:web` tests the actual production build with its hosting security headers. The default `npm run dev` / `dist/` browser mode is a deterministic test harness and must never be deployed as the website.

### Deploy to Vercel

Import **SydFloyd/verseform** into your Vercel account with repository root `.` and Node.js 22. The checked-in `vercel.json` selects Vite, **Build Command: `npm run build:web`**, and **Output Directory: `dist-web`**. No environment variables, API keys, backend, or paid add-on are required. The site opens directly into the editor and links the versioned Windows 0.2.4 installer on GitHub Releases.

Keep the stable `https://verseform.kmproto.com` production origin: drafts belong to their exact browser and origin and do not move between preview URLs or domains. Vercel reports valid domain configuration, and HTTPS navigation plus live NASB insertion were verified after publication.

Ordinary pushes and pull requests run application checks. Windows publication requires explicit dispatch of `Windows patch candidate`; bump to a new immutable version before publishing another Windows release. Web deployments never publish or replace Windows installer bytes.

### Windows development

```powershell
npm ci
npm run dev:desktop
```

The canonical repository check runs TypeScript, pure tests, the deterministic browser harness, production web acceptance, and native Rust/Windows smoke tests:

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
