# Verseform work state

Updated: 2026-09-03

## Now

- Stage: the verified Windows Alpha is complete; the coherent-system plan for Beta is complete through `VFM-080`.
- Active item: none; `VFM-080` is complete.
- Next item: `VFM-090` — preserve Alpha behavior while moving orchestration from React into the application kernel, command registry, and editor gateway.
- Baseline: the completed alpha uses familiar File/Edit menus and icon controls; live font, size, document-title, and dirty state stay synchronized; paragraph breaks trigger reference detection; NASB is preferred for a first online session without overriding saved preferences or offline WEB; and the established document-safety, accessibility, privacy, output, packaging, and attribution guarantees remain verified.
- Beta control target: one canonical regional workspace state; one typed intent→event→effect→result loop; derived dirty/title/enablement state; stamped async operations; one command catalog for menus and shortcuts; one editor gateway; no runtime calls from views; and a redacted browser-only diagnostic snapshot. `VFM-100` then uses those contracts for the compact chrome and Help → Credits & Licenses experience.

## Last verified

- `npm run check` passed on 2026-09-03: twenty-three pure/provider tests (plus one intentionally skipped live smoke), twenty-three production-browser tests, seven native unit tests (plus one intentionally ignored live smoke), and six Windows smoke tests, with clean TypeScript, Rust formatting, Clippy, CSP/capability checks, and 660 locked dependency-license records.
- Browser proof now covers File/Edit menu and keyboard paths, hidden find/paragraph dialogs, live formatting selectors, native-title state through the window adapter, paragraph-break detection, NASB-first online selection, retained saved preferences, offline WEB, and the prior zero-violation axe, safety, recovery, output, and stale-response cases.
- `npm audit --audit-level=high` reports zero vulnerabilities. RustSec scanned all 474 locked Rust packages and reports no vulnerabilities; allowed maintenance warnings remain in Tauri's transitive graph, and the reported unsound GTK crate is absent from the Windows target graph.
- `npm run build:desktop` produced the refined unsigned 4,195,936-byte `src-tauri/target/release/bundle/nsis/Verseform_0.1.0_x64-setup.exe` with SHA-256 `5B637F9CF98380186B79DA60AD1ED5B51EEDCDA14A491F5476E07EEDC985B050`. The prior local lifecycle proof remains valid for the unchanged per-user packaging and uninstall boundaries.
- GitHub Actions Windows alpha run `33759181934` passed on a clean Windows Server 2025 runner at alpha-closeout commit `0c41ff0`: npm and Rust advisory audits, the canonical regression suite, a fresh NSIS build, the installer lifecycle, and artifact upload all succeeded. Artifact `verseform-0.1.0-windows-alpha` is retained through 2026-09-17; the same run independently proved the refinement cases and the complete provider-free offline detect-to-insert/save/reopen/print/PDF flow.

## Handoff rule

Replace the **Now** and **Last verified** sections as work advances. Keep blockers only while they remain actionable. Detailed history belongs in version control, not this file.
