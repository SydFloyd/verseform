# Verseform work state

Updated: 2026-09-03

## Now

- Stage: all planned roadmap slices are complete and the Windows beta package is verified.
- Active item: none.
- Next item: collect owner/user beta feedback before changing scope or sequencing new work.
- Baseline: matching editor/native bounds reject unsupported documents and pastes; interrupted writes preserve the last good file; keyboard and screen-reader paths are hardened; CSP and the local-only Tauri capability are audited; privacy, supported behavior, known limits, and locked dependency licenses are documented; and the per-user NSIS beta has passed local and clean-runner install/offline-launch/uninstall lifecycles without deleting a user document.

## Last verified

- `npm run check` passed on 2026-09-03: twenty-one pure/provider tests (plus one intentionally skipped live smoke), twenty production-browser tests, seven native unit tests (plus one intentionally ignored live smoke), and six Windows smoke tests, with clean TypeScript, Rust formatting, Clippy, CSP/capability checks, and 660 locked dependency-license records.
- The focused browser cases include a zero-violation axe WCAG A/AA scan, skip/focus/dialog/reference keyboard behavior, one-million-character paste rejection, recovery after a simulated full destination, and the complete provider-free offline detect-to-insert/save/reopen/print/PDF flow.
- `npm audit --audit-level=high` reports zero vulnerabilities. RustSec scanned all 474 locked Rust packages and reports no vulnerabilities; allowed maintenance warnings remain in Tauri's transitive graph, and the reported unsound GTK crate is absent from the Windows target graph.
- `npm run build:desktop` produced the unsigned 4,193,533-byte `src-tauri/target/release/bundle/nsis/Verseform_0.1.0_x64-setup.exe` with SHA-256 `B18294AE915BA7561BB516B83EBDA25AB6BF18560516399AA443B2DA77C63C53`. Two local lifecycle runs verified per-user silent install/uninstall, provider-blocked responsive launch, Windows registration/removal, and preservation of a user document.
- GitHub Actions Windows beta run `33750557124` passed on a clean Windows Server 2025 runner at commit `cd87174`: npm and Rust advisory audits, the canonical regression suite, a fresh NSIS build, the installer lifecycle, and artifact upload all succeeded. Artifact `verseform-0.1.0-windows-beta` is retained through 2026-09-17; the same run's browser suite proved the complete provider-free offline detect-to-insert/save/reopen/print/PDF flow.

## Handoff rule

Replace the **Now** and **Last verified** sections as work advances. Keep blockers only while they remain actionable. Detailed history belongs in version control, not this file.
