# Verseform privacy

Verseform is local-first and requires no account. Your documents, recent-file list, settings, recovery copies, and scripture cache remain on your Windows device. Verseform does not include advertising, analytics, telemetry, or cloud document storage.

## Network use

When a connection is available, Verseform requests the translation catalog from the public Digital Bible Society ARC service at startup. Hovering or clicking a detected reference may request the selected translation, book, and chapter. Verseform does not send your document, surrounding prose, file name, identity, or recovery data. Detection itself is local and makes no network request.

Successful catalogs are cached for up to 24 hours and chapters for up to 7 days in app-local storage. The chapter cache is bounded to 32 MB and 192 files. If the service is unavailable, Verseform visibly uses its bundled public-domain World English Bible (WEB).

## Local data and removal

`.verseform` documents and exported PDFs are stored only where you choose. Uninstalling Verseform does not delete those files. Windows may leave app-local preferences, recovery data, and cached scripture after uninstall so an accidental uninstall cannot erase recoverable writing; those files can be removed manually from the app's local-data directory.

## Provider content

Inserted scripture records its translation identity and attribution in the local document. Remote provider data is treated as untrusted text: it is size- and schema-checked, never executed, and never rendered as provider HTML.
