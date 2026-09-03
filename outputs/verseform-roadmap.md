# Verseform — Tight Roadmap

## Delivery rule

This roadmap is intentionally short. Each item is an end-to-end user outcome with its contract, implementation, failure behavior, and proof included. Do not create separate foundation milestones or one item per toolbar button. A newly discovered defect stays inside the active item unless it is independently shippable or changes product scope.

Status: `done`, `next`, `queued`, or `blocked`.

| ID | Status | Outcome | Exit proof |
|---|---|---|---|
| `VFM-000` | done | Align the product contract, architecture, decisions, agent loop, and work state. | The five authorities are linked, non-duplicative, and identify the next slice and external inputs. |
| `VFM-010` | done | Prove the walking scripture-document slice. Scaffold the Windows Tauri/React/Tiptap app and browser harness. Type one supported reference, decorate it after a delimiter, preview through a fake provider, click to insert an editable marked citation, undo once, save/reopen `.verseform`, and produce one print/PDF sample with attribution and optional page number. | A browser test proves the full interaction and stale-response rejection; Windows smoke proves atomic save/reopen and the selected WebView2 output route. Decisions `D-004`, `D-005`, and `D-008` are confirmed or superseded. |
| `VFM-020` | done | Make ordinary editing and local documents trustworthy. Add the required fonts and formatting, hyperlinks, lists, indentation, alignment and spacing, find/replace, spellcheck, clean paste, native Open/Save/Save As, recent files, dirty-close behavior, autosave, crash recovery, and document migrations. | Formatting survives fixture-backed save/reopen and print rendering; keyboard paths work; kill/restart restores accepted work; corrupt or newer files fail without overwriting originals. |
| `VFM-030` | done | Complete local reference intelligence. Support approved book names and abbreviations, conservative fuzzy book matching, single verses and ranges, translation-aware canon bounds, punctuation, valid/invalid styling, hover anchoring, citation exclusion, and false-positive control. | A versioned corpus covers every supported book/alias, boundary, range, invalid class, citation case, and representative prose false positive; detection remains responsive on a long document and makes no network call. |
| `VFM-040` | done | Connect authorized scripture. Implement the DBS adapter and translation catalog, local default translation, cancellation/timeout/schema limits, attribution metadata, explicit WEB fallback, preview, one-click insertion, and permitted caching policy. | Fake, bundled WEB, and recorded DBS adapters pass one provider contract; an opt-in live ARC smoke passes without a secret; browser cases prove selection, persistence, chapter caching, offline startup, failure fallback, cancellation, attribution, and stale-response rejection; the full repository check and Windows desktop build pass. |
| `VFM-050` | done | Finish print and PDF. Render immutable snapshots with faithful formatting, optional page numbers, default DBS footer, and all translation-specific notices; integrate Windows print and Save PDF flows. | Automated PDF checks find expected text, page numbers, footer, and notices; representative documents pass visual review; cancellation, unwritable paths, and provider-free offline output preserve the open document. |
| `VFM-060` | done | Harden and ship the Windows beta. Close accessibility and keyboard gaps, bound large-document behavior, handle low disk and interrupted writes, audit dependencies/licenses/capabilities/CSP, build the installer, and document privacy, supported behavior, and known limits. | A clean Windows machine installs, launches offline, completes detect-to-insert/save/reopen/print/PDF, and uninstalls without deleting user documents; the release checklist and focused regression suite pass. |

## Scope gates

- `VFM-010` is the only bootstrap gate. If the central interaction or output route is wrong, change it before broad formatting work.
- The DBS gate was resolved in `VFM-040` by the public ARC JSON contract and owner-confirmed cache permission (`D-013`–`D-015`).
- No second operating system, cloud feature, DOCX work, or editable page-layout feature enters this roadmap without an explicit product decision.
- Beta feedback may reorder queued items, but it must not weaken document safety, citation correctness, attribution, or privacy.

## Definition of beta

A Windows user can install Verseform, write and format a document, detect valid/fuzzy/invalid references, preview and insert authorized scripture with one click, work offline with clearly identified WEB text, recover and reopen local work, and print or export an attributed PDF without creating an account.
