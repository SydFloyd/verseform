# Verseform work state

Updated: 2026-09-02

## Now

- Stage: trustworthy attributed print and PDF output is complete.
- Active item: none.
- Next item: `VFM-060` — harden and ship the Windows beta.
- Baseline: `VFM-050` freezes escaped semantic output snapshots, keeps the page-number choice inside the snapshot, repeats the DBS footer and every used translation notice on each Letter page, opens the WebView2 system print UI, and writes PDF only after a native destination dialog. `VFM-040`'s authorized ARC provider and bundled WEB fallback, `VFM-030`'s local reference intelligence, and `VFM-020`'s trustworthy editor/document lifecycle remain intact.

## Last verified

- `npm run check` passed on 2026-09-02: twenty pure/provider tests (plus one intentionally skipped live smoke), fifteen production-browser tests, six native unit tests (plus one intentionally ignored live smoke), and five Windows smoke tests, with clean TypeScript, Rust formatting, and Clippy checks.
- The three-page Edge acceptance PDF is Letter-sized and its automated PDF.js and pdfplumber checks find complete content, `Page 1` through `Page 3`, `Powered by DBS`, the WEB public-domain notice, and the recorded DBS notice on every page. All three rendered pages passed visual inspection without clipping, overlap, or broken page flow.
- Browser cases prove cancellation, rejected destinations, provider-free offline output, and frozen output settings preserve the open document. Native tests prove absolute-path and extension confinement; `npm audit` reports zero known vulnerabilities.
- `npx tauri build --debug --no-bundle` produced `src-tauri/target/debug/verseform.exe` with the WebView2 system-print and direct-PDF commands.

## Handoff rule

Replace the **Now** and **Last verified** sections as work advances. Keep blockers only while they remain actionable. Detailed history belongs in version control, not this file.
