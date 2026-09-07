# Verseform — Product Requirements

## Product

Verseform is a lightweight Windows desktop text editor with an authorized browser edition for writing ordinary rich-text documents and quickly inserting scripture from authorized DBS endpoints. The application is local-first, requires no account, and treats scripture insertion as a fast part of typing rather than a separate search workflow. The Windows contracts below retain their native semantics; the Browser edition section defines its platform differences.

## Product principles

- Fast to open, learn, and use.
- Familiar document-editing conventions and keyboard shortcuts.
- The writing surface is visually primary. Application chrome is compact, stable, and quiet without making targets, labels, focus, or current state hard to perceive.
- Local documents and preferences by default; no sign-in or managed cloud storage.
- Scripture assistance is visible but unobtrusive and never changes text without a click.
- Reliable printing and PDF output take priority over broad format compatibility.

## Editing

The editor must provide:

- A restrained list of familiar fonts, including Garamond.
- Font size; bold, italic, underline, and strikethrough.
- Bulleted and numbered lists.
- Superscript and subscript.
- Text highlight and font color.
- Standard indentation. In ordinary text, Tab increases only the current paragraph's first-line indent by one level; Shift+Tab decreases its full left indent by one level. Dedicated toolbar buttons increase or decrease the full paragraph indent and use paragraph-line icons that distinguish them from first-line Tab behavior. In lists, Tab and Shift+Tab change nesting by one level. All paths keep focus in the editor.
- Left, center, right, and justified alignment.
- Line spacing and paragraph spacing before and after.
- Hyperlinks.
- Undo/redo, find/replace, spellcheck, clean paste, and common keyboard shortcuts.
- File actions and output settings live in a familiar File menu; the browser's portable document download appears there rather than as a duplicate top-level action. Undo/redo and paragraph spacing live in Edit, with find/replace hidden until requested. Browser usage guidance and Credits & Licenses live in Help. The menu and formatting deck remains available while the document scrolls.
- Accessible controls, visible focus states, and keyboard operation for core actions.
- The native window title owns the visible Verseform identity, document name, and unsaved indicator. The document view does not repeat a visible Verseform heading above the controls.
- Controls use a simple flat visual language, compact spacing, familiar icons, stable grouping, and no layout shift during ordinary editing. Command buttons and the File/Edit/Help menu strip remain visually quiet at rest; hover, keyboard focus, and active state reveal their boundaries. The collapsed scripture selector retains a subtle border and disclosure arrow, and unchecked menu settings show an empty checkbox as well as accessible checked state.

The editor will not initially include editable headers or footers, margin controls, or DOCX support.

## Help, credits, and licenses

- A Help menu exposes a local **Credits & Licenses** view without interrupting or changing the document. In the browser edition it also exposes **Using Verseform** guidance that previously occupied the document bar.
- The view identifies the installed Verseform version; thanks and credits Digital Bible Society for scripture access; identifies the bundled World English Bible and its provenance; and exposes applicable translation and third-party software notices.
- Translation notices come from the same normalized metadata used by citations and print/PDF output. Provider text is rendered as plain text and never as remote HTML.
- Viewing credits requires no provider request. Any external website action leaves the privileged webview through a narrow allowlisted adapter and must not imply that DBS endorses Verseform.

## Scripture detection and insertion

1. Detection runs after the user types a delimiter such as a space, punctuation mark, or paragraph break, not while a word is being entered.
2. A valid reference receives subtle special formatting that communicates it is interactive.
3. Common book-name abbreviations and plausible misspellings may match fuzzily. Chapter and verse numbers must resolve to a valid passage.
4. A recognizable but invalid reference receives distinct warning styling. Its hover card explains the problem and does not offer insertion.
5. Hovering over a valid reference shows the passage preview and active translation.
6. Clicking the formatted reference replaces it immediately with the verse text followed by a citation, for example: `[verse text] (John 3:16, NASB)`.
7. Inserted citations are semantically marked and excluded from future reference detection. They remain editable by the user.
8. Support a whole chapter (`Psalm 23`), a verse or range (`John 3:16-18`), a range crossing chapters in the same book (`John 3:36-4:2`), and comma-separated verses/ranges (`John 3:16,18-20`). Explicit chapter coordinates may follow a comma or semicolon within the same book. Lists must be in Bible order without repeated or overlapping verses.
9. The insertion limit is **one chapter or 50 verses, whichever is larger**: a selection contained within a single chapter may include that entire chapter, even when it exceeds 50 verses; a selection spanning chapters may contain at most 50 verses in total. This is a per-insertion product limit, not a document-wide quotation allowance. Translation attribution remains required.
10. Consume and validate the complete reference after a delimiter. Never make a valid prefix of a malformed, unsupported, out-of-bounds, or over-limit reference insertable. Show a local explanation and leave all original text intact. Chapter-only ranges, references spanning books, and shorthand such as `ff` are unsupported; users can enter separate complete references instead.

Inserted scripture contains verse text only, not flattened section headings, and repairs unambiguous missing spacing introduced by provider serialization without rewriting legitimate wording.

Available authorized translations are loaded from DBS. The compact selector shows the active translation's citation abbreviation at rest and expands to a keyboard-accessible, searchable list that presents each abbreviation with its full title. The user's preferred translation is stored in a local device profile and used by default across documents. On a first online session with no saved preference, NASB is preferred when the DBS catalog offers it. Without connectivity, the editor clearly switches to the bundled WEB translation and identifies the fallback in previews and inserted citations; that temporary fallback does not overwrite the saved preference.

Every supported 66-book reference must use the scripture provider's corresponding book identifier when retrieving text. The DBS boundary converts Verseform's standard USFM IDs to DBS's two-character IDs, including IDs with a trailing number, and accepts response verses only when their book and chapter match the request. A valid available passage such as `Job 21:1` or `2 Peter 3:8` must not fall back to WEB because of an identifier mismatch.

## Documents and recovery

- Documents use a portable, app-native single-file format that preserves content, formatting, citations, and citation detection metadata.
- Native Open, Save, and Save As dialogs provide direct access to the Windows filesystem.
- A recent-documents list makes local work easy to retrieve.
- Existing documents autosave safely. Unsaved documents and interrupted sessions have crash-recovery copies.
- No document content, scripture history, or user preference is uploaded except the minimum request data needed for an online DBS lookup.

## Print and export

- Print opens WebView2's browser print preview so the user can review output and choose the standard Windows printer settings.
- Save PDF opens a dedicated Verseform dialog with an immutable, accurately formatted preview, then uses a native Save dialog only after the user chooses Export PDF.
- Page numbering is an optional print/PDF setting available in the output workflow rather than an editing feature.
- The live editor remains a continuous writing surface; editing-view pagination and editable page furniture are out of scope.
- Printed and exported pages include a non-editable “Powered by DBS” footer by default.
- The application automatically includes translation-specific attribution or copyright notices required for the scripture quoted, regardless of quotation length.

## Initial platform and exclusions

The first release targets Windows. Accounts, cloud synchronization, collaborative editing, editable page furniture, margin adjustment, and DOCX import/export are outside the initial scope.

The owner authorized the browser edition after publication of Windows 0.2.3. The first browser target is current desktop Chrome and Edge, served over HTTPS from Vercel using this repository's shared editor and core. It opens directly into writing and links the verified Windows release. Mobile, Safari, Firefox, accounts, and cloud document storage are deferred.

### Browser edition

- Drafts, recovery, preferences, and permitted scripture caches stay in transactional IndexedDB storage in the current browser and origin. Typing autosaves locally; Save commits immediately, Save a copy creates an independent draft, and an explicit Download creates a portable `.verseform` snapshot. Import validates the complete file and creates a separate local copy without overwriting an existing draft.
- Name drafts through Save a copy; show all saved browser drafts in the local picker. Clearing browser data or storage eviction can remove local drafts, so provide a brief explanation and a portable download action. Storage denial, quota exhaustion, failed transactions, and another tab changing a draft must retain the current writing and report failure. A stale tab must not overwrite a newer stored revision.
- Browser downloads only report that a download was started; they do not mark local writing saved or claim that a user retained a file. An asynchronous import or open must not replace writing edited while it was loading.
- Use the real public DBS catalog/chapter endpoints directly with bounded, cancelable, anonymous requests and validated cached responses. Detection stays local. Bundled WEB remains explicit fallback, with the same passage limits, citation metadata, and attribution as Windows.
- Print and Save PDF use the shared frozen, attributed Letter-page renderer and the browser print dialog. Save PDF explains choosing the browser's PDF destination, disabling browser headers/footers, and using Letter paper at 100% scale. It does not claim native destination control or completed file creation. If browser chrome invokes printing before a current snapshot exists, show instructions to use Verseform's File menu; never silently print a previous draft snapshot.
- After a successful first visit and application-cache installation, the editor and bundled WEB reopen offline. App updates wait for existing tabs to close; they must not force a reload or delete drafts. Failed offline installation leaves the online editor usable with a visible explanation.
- Browser help explains reference insertion, local-only storage, downloads, output, and credits. Production web output contains no fake scripture, simulated file paths, test controls, or diagnostic globals. Browser deployment and explicit Windows release publication have separate triggers.

## Beta acceptance

The Beta is ready when a daily Windows user can enter the writing surface immediately; create, format, recover, save, reopen, print, and export a document locally; select an authorized translation; recognize valid, fuzzy, and invalid references; preview and insert a passage with one click; reach every common action by predictable menu or shortcut; inspect DBS and software credits locally; and upgrade from the Alpha without losing documents, settings, recovery state, or required attribution.

## Field Beta distribution and feedback

- Publish the Windows Beta as a GitHub pre-release tied to the exact commit and installer that passed the clean Windows release gate. Attach the installer, its SHA-256 file, and machine-readable release evidence; do not rebuild or substitute the binary for publication.
- The release page must state that the installer is unsigned, identify the possible Windows SmartScreen warning, link the privacy statement and DBS/WEB credits, and distinguish the Beta from a stable `1.0` release.
- Published version assets are immutable by policy. A corrected binary receives a new patch version and complete release proof rather than replacing bytes under an existing tag.
- Beta feedback is optional and user-initiated through a public repository issue form. The form requests only Windows/version context, safe reproduction steps, expected behavior, and whether accepted writing remained recoverable. It explicitly prohibits private writing, document/recovery/cache files, personal information, and credentials.
- Verseform adds no telemetry, crash upload, account, updater, or background service for the field Beta. Distribution and feedback must preserve the same local-first privacy boundary as the application.
