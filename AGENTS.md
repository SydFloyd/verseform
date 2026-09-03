# Verseform agent contract

## Mission

Build a lightweight, local-first Windows text editor that is excellent for ordinary writing and exceptionally fast at inserting scripture. A completed reference becomes interactive after a delimiter; hover previews it, and click replaces it with the passage and citation.

## Read order and authority

Start every work session with `WORK.md`, then read only the material needed for the active item:

1. `outputs/scripture-text-editor-requirements.md` — product behavior and scope; highest authority.
2. `outputs/verseform-system-design.md` — architecture, contracts, and trust boundaries.
3. `outputs/verseform-decisions.md` — accepted and pending durable decisions.
4. `outputs/verseform-roadmap.md` — sequence and exit proof.

If documents conflict, follow that order and repair the lower-authority document in the same change. Tests and schemas are executable evidence, but they do not silently redefine product intent.

## Operating loop

1. Inspect `git status` and `WORK.md`; preserve unrelated user changes.
2. Select exactly one roadmap item and state its outcome and proof before editing.
3. Trace the change through the system tower: owning requirement and invariant → workspace region/event/effect → one port or editor command → selector/UI → cheapest truthful proof. Repair ambiguous ownership before adding behavior.
4. Implement the smallest end-to-end slice that changes real user behavior. Avoid horizontal infrastructure without a consumer in the same item.
5. Put deterministic rules in the pure core; keep editor, network, filesystem, clock, and Windows details behind named boundaries.
6. Add the cheapest test that would catch a regression. Prefer pure transition/selector and browser-harness tests; reserve native Windows runs for native claims.
7. Run focused checks, then the repository check command once. Do not claim unrun evidence or repeatedly pay for a full gate when the owning test is sufficient during iteration.
8. Update `WORK.md`, roadmap status, and a durable decision only when their truth changed.

## Product invariants

- No account or cloud dependency. Documents, settings, history, and recovery data remain local.
- Detection is local, deterministic, and triggered after delimiters. Only book names are fuzzy; chapter and verse bounds are strict.
- Detection never makes a network request. Hover or click may request a preview or passage.
- No replacement occurs without a click. A stale response must never replace text that changed while the request was in flight.
- Generated citations remain editable but carry semantic metadata and are excluded from detection.
- Authorized DBS translations are online providers. Bundled WEB is the explicit offline fallback.
- Save, recovery, reopen, print, and PDF preserve visible content and required attribution.
- Remote content is untrusted. Never render unsanitized provider HTML or load remote code in a privileged webview.
- No committed credentials. A distributable desktop client cannot make an embedded shared secret truly secret.
- Application state has one owner per dimension. Derive dirty/title/enablement facts, stamp async operations, and never leave a migrated flow with both React-local and kernel control paths.

## Beta refactor guardrail

For `VFM-090`, preserve every visible Alpha behavior and existing document/provider/native contract. Migrate one complete flow at a time through the application kernel and editor gateway, delete the superseded UI-local path in the same change, and keep the app runnable between commits. Do not mix the `VFM-100` visual redesign or Credits & Licenses capability into the behavior-preserving kernel refactor.

## Scope control

Target Windows first. Do not add accounts, sync, collaboration, DOCX, editable headers/footers, margin controls, editing-view pagination, macOS, Linux, or web distribution without an explicit requirements change.

Prefer a small mature dependency over custom infrastructure, but keep it behind the boundary that owns it. Avoid speculative abstraction, plugin systems, telemetry, background services, and new planning documents. A new document must own information that has no existing home.

## Completion standard

Work is complete only when its roadmap exit proof passes, failure and cancellation paths are covered in proportion to risk, accessibility is preserved, documentation reflects reality, and `WORK.md` leaves the next agent an accurate starting point. Do not push, publish, spend money, change external DBS state, or handle production credentials without owner authority.
