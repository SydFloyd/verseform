# Verseform — Product Requirements

## Product

Verseform is a lightweight Windows desktop text editor for writing ordinary rich-text documents and quickly inserting scripture from authorized DBS endpoints. The application is local-first, requires no account, and treats scripture insertion as a fast part of typing rather than a separate search workflow.

## Product principles

- Fast to open, learn, and use.
- Familiar document-editing conventions and keyboard shortcuts.
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
- Standard indentation.
- Left, center, right, and justified alignment.
- Line spacing and paragraph spacing before and after.
- Hyperlinks.
- Undo/redo, find/replace, spellcheck, clean paste, and common keyboard shortcuts.
- File actions and output settings live in a familiar File menu. Undo/redo and paragraph spacing live in Edit, with find/replace hidden until requested.
- Accessible controls, visible focus states, and keyboard operation for core actions.

The editor will not initially include editable headers or footers, margin controls, or DOCX support.

## Scripture detection and insertion

1. Detection runs after the user types a delimiter such as a space, punctuation mark, or paragraph break, not while a word is being entered.
2. A valid reference receives subtle special formatting that communicates it is interactive.
3. Common book-name abbreviations and plausible misspellings may match fuzzily. Chapter and verse numbers must resolve to a valid passage.
4. A recognizable but invalid reference receives distinct warning styling. Its hover card explains the problem and does not offer insertion.
5. Hovering over a valid reference shows the passage preview and active translation.
6. Clicking the formatted reference replaces it immediately with the verse text followed by a citation, for example: `[verse text] (John 3:16, NASB)`.
7. Inserted citations are semantically marked and excluded from future reference detection. They remain editable by the user.
8. Verse ranges must be supported when the referenced range is valid.

Available authorized translations are loaded from DBS. The user's preferred translation is stored in a local device profile and used by default across documents. On a first online session with no saved preference, NASB is preferred when the DBS catalog offers it. Without connectivity, the editor clearly switches to the bundled WEB translation and identifies the fallback in previews and inserted citations; that temporary fallback does not overwrite the saved preference.

## Documents and recovery

- Documents use a portable, app-native single-file format that preserves content, formatting, citations, and citation detection metadata.
- Native Open, Save, and Save As dialogs provide direct access to the Windows filesystem.
- A recent-documents list makes local work easy to retrieve.
- Existing documents autosave safely. Unsaved documents and interrupted sessions have crash-recovery copies.
- No document content, scripture history, or user preference is uploaded except the minimum request data needed for an online DBS lookup.

## Print and export

- Print through the standard Windows print flow.
- Export to PDF with accurate formatting.
- Page numbering is an optional print/PDF setting rather than an editing feature.
- Printed and exported pages include a non-editable “Powered by DBS” footer by default.
- The application automatically includes translation-specific attribution or copyright notices required for the scripture quoted, regardless of quotation length.

## Initial platform and exclusions

The first release targets Windows. Accounts, cloud synchronization, collaborative editing, editable page furniture, margin adjustment, and DOCX import/export are outside the initial scope.

## Release acceptance

The product is ready when a user can create, format, recover, save, reopen, print, and export a document locally; select an authorized translation; recognize valid, fuzzy, and invalid references; preview a detected passage; and insert it with one click without the generated citation being detected again.
