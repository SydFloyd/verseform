# Verseform privacy

Verseform is local-first and requires no account. Your documents, draft/recent-file list, settings, recovery copies, and scripture cache remain on your device. Windows uses local files; the web edition uses browser storage for the current site. Verseform does not include advertising, analytics, telemetry, or cloud document storage.

## Network use

When a connection is available, Verseform requests the translation catalog from the public Digital Bible Society ARC service at startup. Hovering or clicking a detected reference may request the selected translation, book, and chapter. Verseform does not send your document, surrounding prose, file name, identity, or recovery data. Detection itself is local and makes no network request.

Successful catalogs are cached for up to 24 hours and chapters for up to 7 days in app-local storage. The chapter cache is bounded to 32 MB and 192 files. If the service is unavailable, Verseform visibly uses its bundled public-domain World English Bible (WEB).

The web edition downloads its application and bundled WEB from the hosting service (Vercel), then caches application files for offline reopening after a successful first visit. Updates wait for existing tabs to close. DBS requests go directly from your browser to `arc.dbs.org` without cookies, authentication, or a referrer; cached permitted scripture is stored in IndexedDB (up to 192 chapters/32 MB). Hosting and scripture services receive ordinary network information such as your IP address, requested URL, and browser connection headers. They do not receive your writing, draft names, or recovery records. The Windows download link contacts GitHub Releases; optional privacy, credits, and release-note links contact their displayed destination when opened.

## Local data and removal

`.verseform` documents and exported PDFs are stored only where you choose. Uninstalling Verseform does not delete those files. Windows may leave app-local preferences, recovery data, and cached scripture after uninstall so an accidental uninstall cannot erase recoverable writing; those files can be removed manually from the app's local-data directory.

In the web edition, typing and Save keep drafts in this browser's IndexedDB. Save a copy creates a separate named draft. Download makes a portable `.verseform` file; Import stores a separate local copy. File → Save PDF prepares attributed pages and opens your browser's print dialog; the browser handles the destination. No document-rendering server is involved.

Browser drafts are specific to the browser profile and website origin. They do not sync or follow you to another domain/device. Clearing site data, storage cleanup/eviction, or ending a private browsing session can remove drafts, recoveries, preferences, scripture cache, and offline application files. Download important writing regularly. Verseform reports denied/full storage and conflicting saves from another tab while keeping writing open; browser storage is not a substitute for an independently retained file.

## Provider content

Inserted scripture records its translation identity and attribution in the local document. Remote provider data is treated as untrusted text: it is size- and schema-checked, never executed, and never rendered as provider HTML.
