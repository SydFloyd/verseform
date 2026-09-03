# Verseform work state

Updated: 2026-09-03

## Now

- Stage: `VFM-100` is owner-accepted and complete. `VFM-110` stabilization is active; the owner-approved daily-use pass now covers indentation keys, persistent controls, starter-hint noise, observed DBS verse-text artifacts, and the output interaction split in `D-021`.
- Active item: `VFM-110` — exercise upgrade, endurance, failure, installer, and final Beta release evidence.
- Output baseline: Print freezes and paints one attributed snapshot before opening WebView2's browser print preview. Save PDF opens an exclusive Verseform dialog over the same immutable renderer; page-number changes rebuild presentation from frozen title/body/notices, Cancel invokes no platform effect, and Export alone advances to the native destination dialog. The old below-editor preview is gone and the editor remains continuous.
- Writing baseline: the native title is the only visible Verseform/document identity; the glued File/Edit/Help and formatting deck stays visible while documents scroll, Tab/Shift+Tab dispatch the same single-level indentation path as the toolbar, and no permanent starter hint competes with writing. The active translation uses the normalized citation abbreviation at rest and expands into a keyboard-accessible local search over full catalog titles. DBS chapter normalization removes only evidence-backed glued heading suffixes and repairs unambiguous punctuation spacing before preview or insertion.
- Trust boundary: React still has no adapter access. PDF preview content is locally generated from escaped editor data and sandboxed; mode/phase/stamp checks guard every output boundary. Credits website intents travel through a stamped workspace effect to a typed external-link port; the Windows command maps only two fixed IDs to HTTPS constants and launches them in the default browser. Provider metadata remains React text, the webview CSP still has no remote origins, and opening Credits makes no scripture request.

## Last verified

- `npm run check` passed on 2026-09-03: thirty-nine pure/provider/kernel/controller/architecture tests (plus one intentionally skipped live smoke), thirty production-browser tests, nine native unit tests (plus one intentionally ignored live smoke), and six Windows smoke tests, with clean TypeScript, Rust formatting, Clippy, CSP/capability checks, and 660 locked dependency-license records.
- The VFM-110 output proof covers an immutable modal preview; page-number changes without editor recapture; focus containment and return; Axe A/AA; cancellation before the platform effect and from the native-dialog adapter; an unwritable destination; provider-free offline output; and complete attributed multi-page PDF text. A native assertion locks Print to WebView2 browser-preview mode. The visual capture `artifacts/vfm-110-pdf-export-dialog.png` shows the reviewed desktop dialog.
- The earlier feedback proof remains green for one-level Tab/Shift+Tab indentation with retained focus; removal of the permanent hint; the complete two-row command deck pinned after a 500px document scroll; and recorded NASB James 1:1, 1:27, and 4:17 payload normalization while preserving a genuine glued sentence boundary. Representative-width, translation-picker, credits, document, recovery, scripture, keyboard, and walking journeys also remain green.
- The native allowlist unit proof rejects arbitrary URL and local-file input and accepts only the fixed DBS and eBible target IDs. Local visual captures show the writing-first chrome, the two-column Credits hierarchy, and the dedicated PDF review workflow at representative sizes.
- `npm audit --audit-level=high` reports zero vulnerabilities. RustSec scanned all 474 locked Rust packages and reports no vulnerabilities; allowed maintenance warnings remain in Tauri's transitive graph, and the reported unsound GTK crate is absent from the Windows target graph.
- `npm run build:desktop` produced the current unsigned 4,215,891-byte `src-tauri/target/release/bundle/nsis/Verseform_0.1.0_x64-setup.exe` with SHA-256 `331F9F284305ABA1E4A41DB6BDBF3257B81EA10BB3AC2E28579BAF2D503ED155`. The prior local lifecycle proof remains valid for the unchanged per-user packaging and uninstall boundaries.
- GitHub Actions Windows alpha run `33759181934` passed on a clean Windows Server 2025 runner at alpha-closeout commit `0c41ff0`: npm and Rust advisory audits, the canonical regression suite, a fresh NSIS build, the installer lifecycle, and artifact upload all succeeded. Artifact `verseform-0.1.0-windows-alpha` is retained through 2026-09-17; the same run independently proved the refinement cases and the complete provider-free offline detect-to-insert/save/reopen/print/PDF flow.

## Handoff rule

Replace the **Now** and **Last verified** sections as work advances. Keep blockers only while they remain actionable. Detailed history belongs in version control, not this file.
