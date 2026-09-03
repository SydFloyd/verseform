import { describe, expect, it } from "vitest";
import {
  createVerseformDocument,
  parseVerseformDocument,
  serializeVerseformDocument,
  type EditorNode,
} from "../src/core/document";
import formattedFixture from "./fixtures/formatted-v2.verseform.json";
import legacyFixture from "./fixtures/legacy-v1.verseform.json";
import { isLookupFresh } from "../src/core/lookup";
import { buildPrintSnapshot } from "../src/core/output";
import { WEB_CANON, type CanonMetadata } from "../src/core/canon";
import { isValidReference, scanReferences } from "../src/core/reference";
import referenceCorpus from "./fixtures/reference-corpus-v1.json";

const content: EditorNode = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "John 3:16 " }],
    },
  ],
};

describe("reference detection", () => {
  it("covers every WEB book, approved alias, and chapter boundary", () => {
    expect(referenceCorpus).toMatchObject({ version: 1, translationId: "WEB" });
    expect(WEB_CANON.books).toHaveLength(referenceCorpus.expectedBooks);
    expect(WEB_CANON.books.reduce((total, book) => total + book.verseCounts.length, 0))
      .toBe(referenceCorpus.expectedChapters);

    for (const book of WEB_CANON.books) {
      for (const spelling of [book.name, ...book.aliases]) {
        const [candidate] = scanReferences(`${spelling} 1:1 `);
        expect(candidate, spelling).toMatchObject({ kind: "valid", reference: { bookId: book.id } });
      }
      const chapter = book.verseCounts.length;
      const verseCount = book.verseCounts.at(-1)!;
      const unavailable = new Set(book.unavailableVerses?.[chapter] ?? []);
      let verse = verseCount;
      while (unavailable.has(verse)) verse -= 1;
      expect(scanReferences(`${book.name} ${chapter}:${verse} `)[0], book.name)
        .toMatchObject({ kind: "valid", reference: { bookId: book.id, chapter, verseStart: verse } });
      expect(scanReferences(`${book.name} ${chapter}:${verseCount + 1} `)[0], book.name)
        .toMatchObject({ kind: "invalid", issue: { code: "verse_out_of_range" } });
      expect(scanReferences(`${book.name} ${chapter + 1}:1 `)[0], book.name)
        .toMatchObject({ kind: "invalid", issue: { code: "chapter_out_of_range" } });
      if (verse > 1) {
        expect(scanReferences(`${book.name} ${chapter}:${verse - 1}-${verse} `)[0], book.name)
          .toMatchObject({ kind: "valid", reference: { verseEnd: verse } });
      }
      expect(scanReferences(`${book.name} ${chapter}:${verse}-${verseCount + 1} `)[0], book.name)
        .toMatchObject({ kind: "invalid", issue: { code: "range_end_out_of_range" } });
    }
  });

  it("normalizes punctuation, aliases, fuzzy spellings, and ranges", () => {
    for (const testCase of referenceCorpus.exact) {
      expect(scanReferences(testCase.input)[0], testCase.input).toMatchObject({
        kind: "valid", display: testCase.display, reference: { bookId: testCase.bookId },
      });
    }
    for (const testCase of referenceCorpus.fuzzyAccepted) {
      expect(scanReferences(testCase.input)[0], testCase.input).toMatchObject({
        kind: "valid", matchKind: "fuzzy", reference: { bookId: testCase.bookId },
      });
    }
    for (const input of referenceCorpus.fuzzyRejected) expect(scanReferences(input), input).toEqual([]);
  });

  it("returns visible reasons for every invalid class", () => {
    for (const testCase of referenceCorpus.invalid) {
      expect(scanReferences(testCase.input)[0], testCase.input).toMatchObject({
        kind: "invalid", issue: { code: testCase.code },
      });
    }
  });

  it("waits for delimiters, rejects representative prose, and excludes citations", () => {
    for (const input of referenceCorpus.falsePositives) expect(scanReferences(input), input).toEqual([]);
    expect(scanReferences("John 3:16 ", [{ from: 0, to: 9 }])).toEqual([]);
  });

  it("uses the active translation's canon bounds", () => {
    expect(scanReferences("Romans 14:24 ")[0]).toMatchObject({ kind: "valid" });
    const books = WEB_CANON.books.map((book) => book.id === "ROM"
      ? { ...book, verseCounts: book.verseCounts.map((count, index) => index === 13 ? 23 : count) }
      : book);
    const alternate: CanonMetadata = { translationId: "TEST", version: 1, books };
    expect(scanReferences("Romans 14:24 ", [], alternate)[0])
      .toMatchObject({ kind: "invalid", issue: { code: "verse_out_of_range" } });
  });

  it("rejects verses absent from the selected translation's main text", () => {
    expect(scanReferences("Luke 17:36 ")[0]).toMatchObject({
      kind: "invalid", issue: { code: "verse_unavailable" },
    });
    expect(scanReferences("Luke 17:36 ", [], {
      ...WEB_CANON,
      translationId: "STANDARD",
      books: WEB_CANON.books.map((book) => ({ ...book, unavailableVerses: undefined })),
    })[0]).toMatchObject({ kind: "valid" });
  });

  it("scans a long document locally within the responsiveness budget", () => {
    const longDocument = `${"Ordinary writing without coordinates. ".repeat(25_000)}John 3:16 `;
    const started = performance.now();
    expect(scanReferences(longDocument).filter(isValidReference)).toHaveLength(1);
    expect(performance.now() - started).toBeLessThan(750);
  });
});

describe("lookup freshness", () => {
  const candidate = scanReferences("John 3:16 ")[0];
  if (!candidate || !isValidReference(candidate)) throw new Error("valid fixture reference expected");
  const request = { ...candidate, revision: 7 };

  it("requires the same document revision and source text", () => {
    expect(isLookupFresh(request, 7, "John 3:16")).toBe(true);
    expect(isLookupFresh(request, 8, "John 3:16")).toBe(false);
    expect(isLookupFresh(request, 7, "John 3:15")).toBe(false);
  });
});

describe("portable documents and output", () => {
  it("round-trips the versioned envelope", () => {
    const document = createVerseformDocument(
      content,
      undefined,
      new Date("2026-09-02T12:00:00.000Z"),
    );
    expect(parseVerseformDocument(serializeVerseformDocument(document))).toEqual(
      document,
    );
  });

  it("migrates schema 1 and refuses newer documents", () => {
    const migrated = parseVerseformDocument(JSON.stringify(legacyFixture));
    expect(migrated).toMatchObject({ schemaVersion: 2, title: "Untitled" });
    expect(() => parseVerseformDocument(JSON.stringify({ ...formattedFixture, schemaVersion: 99 })))
      .toThrow(/newer Verseform version/);
  });

  it("round-trips every formatting class and preserves it in print HTML", () => {
    const document = parseVerseformDocument(JSON.stringify(formattedFixture));
    expect(parseVerseformDocument(serializeVerseformDocument(document))).toEqual(document);
    const html = buildPrintSnapshot(document, { pageNumbers: false }).bodyHtml;
    for (const fragment of [
      "<strong>", "<em>", "<u>", "<s>", "<sub>", "<sup>",
      "font-family: 'Georgia'", "font-size: 18pt", "color: #123456",
      "background-color: #fff0a8", "text-align: justify", "margin-left: 3rem",
      "line-height: 2", "margin-top: 8pt", "margin-bottom: 12pt",
      '<a href="https://example.com">', "<ul>", "<ol>", "<cite",
    ]) expect(html).toContain(fragment);
    expect(html).not.toContain("javascript:");
  });

  it("escapes document text and includes citation attribution", () => {
    const marked: EditorNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "<untrusted> " },
            {
              type: "text",
              text: "(John 3:16, WEB)",
              marks: [
                {
                  type: "citation",
                  attrs: { translationId: "WEB" },
                },
              ],
            },
          ],
        },
      ],
    };
    const snapshot = buildPrintSnapshot(
      createVerseformDocument(marked),
      { pageNumbers: true },
    );
    expect(snapshot.html).toContain("&lt;untrusted&gt;");
    expect(snapshot.html).not.toContain("<untrusted>");
    expect(snapshot.html).toContain("Powered by DBS");
    expect(snapshot.html).toContain("World English Bible");
    expect(snapshot.html).toContain("Page 1");
    expect(snapshot.pageNumbers).toBe(true);
    expect(snapshot.printCss).toContain('content: "Page " counter(page)');
    expect(snapshot.printCss).toContain("@bottom-left");
  });

  it("uses escaped attribution carried by an inserted DBS citation", () => {
    const marked: EditorNode = {
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{
          type: "text",
          text: "(John 3:16, TEST)",
          marks: [{
            type: "citation",
            attrs: {
              translationId: "ENGTEST",
              attribution: "DBS Test Bible <copyright owner>",
            },
          }],
        }],
      }],
    };
    const snapshot = buildPrintSnapshot(createVerseformDocument(marked), { pageNumbers: false });
    expect(snapshot.notices).toEqual(["DBS Test Bible <copyright owner>"]);
    expect(snapshot.html).toContain("DBS Test Bible &lt;copyright owner&gt;");
    expect(snapshot.html).not.toContain("<copyright owner>");
    expect(snapshot.pageNumbers).toBe(false);
    expect(snapshot.printCss).not.toContain('content: "Page " counter(page)');
  });
});
