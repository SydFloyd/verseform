# Verseform — Decision Register

Record only durable choices that constrain later work. Change a decision by adding a superseding row; do not rewrite history after implementation depends on it.

| ID | Status | Decision | Reason |
|---|---|---|---|
| `D-001` | Accepted | Ship Windows first; make no macOS, Linux, or web-distribution claim. | Removes platform evidence that does not serve the first release. |
| `D-002` | Accepted | Use Tauri 2, React, TypeScript, and open-source Tiptap/ProseMirror. | Provides a light native shell and mature rich-text semantics without building an editor engine. |
| `D-003` | Accepted | Keep deterministic rules in a pure TypeScript core and privileged OS work in narrow Rust commands. | Makes most behavior fast to test while preserving a small trust boundary. |
| `D-004` | Accepted | Use a versioned `.verseform` JSON envelope and atomic native writes. | Creates a portable, inspectable format with explicit migration and recovery. |
| `D-005` | Accepted | Store detected references as transient decorations and inserted citations as editable semantic marks. | Prevents detection styling from polluting files while reliably excluding generated citations. |
| `D-006` | Accepted | Run most end-to-end behavior in a browser harness with fake ports; run Windows evidence only for native claims and gates. | Minimizes slow, fragile, and expensive verification without weakening platform-specific claims. |
| `D-007` | Accepted | Bundle WEB for offline use; do not persistently cache other passage text without permission. | Guarantees offline behavior while respecting translation licensing. |
| `D-008` | Pending `VFM-010` proof | Use WebView2 print UI and PDF output behind an output adapter. | Official APIs appear to cover both paths, but page numbering and attribution layout require an executable proof. |
| `D-009` | Pending DBS input | Select the production desktop authorization mechanism and exact DBS contract. | A shared secret embedded in a distributed binary is recoverable and cannot be treated as confidential. |
| `D-010` | Pending DBS input | Source canon bounds and attribution rules per translation from DBS when available. | Validation and legal output must match the actual authorized translation. |
