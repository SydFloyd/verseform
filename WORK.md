# Verseform work state

Updated: 2026-09-03

## Now

- Stage: `VFM-100` engineering and automated proof are complete. The owner accepted the arrangement; the requested quiet-at-rest control styling and abbreviation-first translation picker are implemented and await final visual acceptance before the roadmap item is closed.
- Active item: `VFM-100` styling acceptance. Do not expand the slice while it is in review.
- Next item after acceptance: `VFM-110` — stabilize, exercise Alpha-to-Beta upgrade preservation, and release the Windows Beta.
- Baseline: the native title is the only visible Verseform/document identity; File/Edit/Help form a glued, arrow-free menu strip, and formatting command boundaries appear only on hover, focus, or active state. The active translation uses the normalized citation abbreviation at rest and expands into a keyboard-accessible local search over full catalog titles. The Credits & Licenses overlay is a kernel-owned, F1-accessible local view of version, DBS thanks, effective-translation notice, bundled WEB provenance, and all generated dependency-license records.
- Trust boundary: React still has no adapter access. Credits website intents travel through a stamped workspace effect to a typed external-link port; the Windows command maps only two fixed IDs to HTTPS constants and launches them in the default browser. Provider metadata remains React text, the webview CSP still has no remote origins, and opening Credits makes no scripture request.

## Last verified

- `npm run check` passed on 2026-09-03: thirty-eight pure/provider/kernel/controller/architecture tests (plus one intentionally skipped live smoke), twenty-eight production-browser tests, eight native unit tests (plus one intentionally ignored live smoke), and six Windows smoke tests, with clean TypeScript, Rust formatting, Clippy, CSP/capability checks, and 660 locked dependency-license records.
- The browser proof covers 1120px/100%, 960px/125%, and 780px/150% layouts, whole-group wrapping, 32px controls, no horizontal clipping, chrome stability after editing, quiet idle borders with hover/active feedback, abbreviation-first translation display, full-title search, keyboard navigation and focus return, F1/pointer parity, modal focus and return, zero-request local credits, hostile provider metadata escaping, the browser external-link fake, and zero axe A/AA violations with the picker both closed and expanded. All prior Alpha document, recovery, scripture, output, keyboard, and walking journeys still pass against the intentional title-based dirty/saved contract.
- The native allowlist unit proof rejects arbitrary URL and local-file input and accepts only the fixed DBS and eBible target IDs. The local visual captures show the writing-first chrome and the two-column Credits hierarchy at the representative sizes.
- `npm audit --audit-level=high` reports zero vulnerabilities. RustSec scanned all 474 locked Rust packages and reports no vulnerabilities; allowed maintenance warnings remain in Tauri's transitive graph, and the reported unsound GTK crate is absent from the Windows target graph.
- `npm run build:desktop` produced the refined VFM-100 review build as unsigned 4,216,015-byte `src-tauri/target/release/bundle/nsis/Verseform_0.1.0_x64-setup.exe` with SHA-256 `82FADFF301B47A16FF40465EFC084F97204AECA2F09413EF0199E2E09D7E4F13`. The prior local lifecycle proof remains valid for the unchanged per-user packaging and uninstall boundaries.
- GitHub Actions Windows alpha run `33759181934` passed on a clean Windows Server 2025 runner at alpha-closeout commit `0c41ff0`: npm and Rust advisory audits, the canonical regression suite, a fresh NSIS build, the installer lifecycle, and artifact upload all succeeded. Artifact `verseform-0.1.0-windows-alpha` is retained through 2026-09-17; the same run independently proved the refinement cases and the complete provider-free offline detect-to-insert/save/reopen/print/PDF flow.

## Handoff rule

Replace the **Now** and **Last verified** sections as work advances. Keep blockers only while they remain actionable. Detailed history belongs in version control, not this file.
