# Bundled World English Bible source

`web-corpus.json` is generated from the official eBible.org 66-book protocanon USFX archive:

- Source: https://ebible.org/Scriptures/engwebp_usfx.zip
- Rights: https://ebible.org/engwebp/copyright.htm (Public Domain; “World English Bible” is an eBible.org trademark)
- Source archive SHA-256: `2242945D71CA925BDA03D9F87E6DE7ABD59FA57FB0C3227DC649043BD757EB65`
- Importer: `scripts/build-web-corpus.ps1`

The importer retains verse text, including words-of-Jesus and Hebrew-word element text, while omitting footnotes and cross-reference notes. It rejects DTD resolution and emits only the 66 canonical book identifiers used by Verseform.
