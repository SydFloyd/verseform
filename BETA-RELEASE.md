# Verseform Windows beta release

## Supported beta

Verseform 0.1.0 targets current 64-bit Windows 10 and Windows 11 systems with Microsoft Edge WebView2. The NSIS installer is per-user and does not require administrator rights. The app can write and format local `.verseform` documents; detect, preview, and insert scripture; recover interrupted work; reopen recent documents; print; and export attributed Letter-size PDFs without an account.

The installed app works offline with the bundled public-domain World English Bible. On a minimal Windows installation that lacks WebView2, installer setup may need a connection to obtain Microsoft's WebView2 bootstrapper.

## Keyboard

- `Ctrl+N`, `Ctrl+O`, `Ctrl+S`, `Ctrl+Shift+S`, and `Ctrl+P` run the matching document action.
- `Ctrl+F` or `Ctrl+H` opens Find / Replace; `Escape` closes it and returns focus to the document.
- `Tab` reaches the visible skip link first. `Enter` moves directly to the editor.
- A focused scripture reference previews with focus and inserts with `Enter` or `Space`; `Escape` closes its preview.
- The unsaved-changes dialog traps focus until Save, Discard, Cancel, or `Escape` resolves it.

## Known limits

- A document is limited to 10 MiB serialized, 1,000,000 text characters, 50,000 content nodes, and 64 levels of nesting. A paste that would cross an editor limit is rejected without changing accepted writing.
- Scripture detection supports the standard 66-book Protestant canon. Provider-confirmed chapter omissions remain authoritative.
- Editing-view pagination, configurable margins, editable headers/footers, DOCX, accounts, sync, collaboration, and non-Windows releases are outside this beta.
- The beta installer is not code-signed. Windows SmartScreen may show an unrecognized-publisher warning.

## Release checklist

Run from a clean dependency install:

```powershell
npm ci
npm audit --audit-level=high
cargo audit --file src-tauri/Cargo.lock
npm run check
npm run build:desktop
npm run test:installer
```

Then verify the generated NSIS installer installs per-user, launches with networking disabled, completes the offline detect-to-insert/save/reopen/print/PDF flow, appears in Windows installed apps, and uninstalls without removing a user-created `.verseform` document. Record the exact evidence in `WORK.md` before marking `VFM-060` done.
