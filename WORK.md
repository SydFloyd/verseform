# Verseform work state

Updated: 2026-09-02

## Now

- Stage: authorized online scripture and explicit offline scripture are connected.
- Active item: none.
- Next item: `VFM-050` — finish print and PDF.
- Baseline: `VFM-040` loads the public DBS ARC translation catalog through native HTTPS, stores the local preference, previews and inserts schema-validated plain text, carries catalog attribution into semantic citations/output, and caches permitted DBS chapters within strict limits. The complete 66-book WEB main text is bundled as an explicit offline fallback. The local reference intelligence from `VFM-030` and trustworthy editor/document lifecycle from `VFM-020` remain intact.

## Last verified

- `npm run check` passed on 2026-09-02: twenty pure/provider tests (plus the intentionally skipped live smoke), eleven production-browser tests, five native unit tests, and five Windows smoke tests, with clean TypeScript, Rust formatting, and Clippy checks.
- Both the TypeScript provider smoke (`DBS_LIVE_SMOKE=1 npm run test -- tests/providers.test.ts`) and the native transport smoke passed against the public ARC catalog and `ENGWEB/JHN/3` without a credential. Recorded cases cover multi-field chapter objects, split verse keys, wrong chapters, size/schema failures, cancellation, and truthful WEB fallback.
- The official public-domain WEB source imports into 66 books matching all local chapter/verse bounds, including the five numbered verses absent from the stable edition's main text. Browser proof covers preference persistence, caching, offline startup, provider failure, citation/attribution identity, cancellation, and stale-edit rejection.
- `npx tauri build --debug --no-bundle` produced `src-tauri/target/debug/verseform.exe` with the VFM-040 provider and bundled WEB corpus.
- The `VFM-010` generated Letter PDF remains the latest visually inspected native-output sample; `VFM-050` owns expanded print/PDF visual acceptance.

## Handoff rule

Replace the **Now** and **Last verified** sections as work advances. Keep blockers only while they remain actionable. Detailed history belongs in version control, not this file.
