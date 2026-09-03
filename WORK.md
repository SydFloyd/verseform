# Verseform work state

Updated: 2026-09-03

## Now

- Stage: Windows beta hardening and packaging is implemented; clean-runner proof is pending.
- Active item: `VFM-060` — harden and ship the Windows beta.
- Next item: none in the current roadmap.
- Baseline: matching editor/native bounds reject unsupported documents and pastes; interrupted writes preserve the last good file; keyboard and screen-reader paths are hardened; CSP and the local-only Tauri capability are audited; privacy, supported behavior, known limits, and locked dependency licenses are documented; and the per-user NSIS package has passed a local install/offline-launch/uninstall lifecycle without deleting a user document.

## Last verified

- `npm run check` passed on 2026-09-03: twenty-one pure/provider tests (plus one intentionally skipped live smoke), twenty production-browser tests, seven native unit tests (plus one intentionally ignored live smoke), and six Windows smoke tests, with clean TypeScript, Rust formatting, Clippy, CSP/capability checks, and 660 locked dependency-license records.
- The focused browser cases include a zero-violation axe WCAG A/AA scan, skip/focus/dialog/reference keyboard behavior, one-million-character paste rejection, recovery after a simulated full destination, and the complete provider-free offline detect-to-insert/save/reopen/print/PDF flow.
- `npm audit --audit-level=high` reports zero vulnerabilities. RustSec scanned all 474 locked Rust packages and reports no vulnerabilities; allowed maintenance warnings remain in Tauri's transitive graph, and the reported unsound GTK crate is absent from the Windows target graph.
- `npm run build:desktop` produced `src-tauri/target/release/bundle/nsis/Verseform_0.1.0_x64-setup.exe`. Two local installer lifecycle runs verified exit code 0 for per-user silent install/uninstall, responsive launch with provider networking blocked, correct Windows registration/removal, and preservation of a user document. `.github/workflows/windows-beta.yml` owns the final fresh-runner proof after push.

## Handoff rule

Replace the **Now** and **Last verified** sections as work advances. Keep blockers only while they remain actionable. Detailed history belongs in version control, not this file.
