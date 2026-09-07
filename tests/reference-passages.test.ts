import { describe, expect, it } from "vitest";
import { WEB_CANON } from "../src/core/canon";
import { formatReference, passageSegments, scanReferences, type NormalizedReference } from "../src/core/reference";
import { DbsScriptureProvider, type DbsTransport } from "../src/adapters/dbsScriptureProvider";
import { CompositeScriptureProvider } from "../src/adapters/scriptureProvider";
import { WebScriptureProvider } from "../src/adapters/webScriptureProvider";
import webCorpus from "../src/assets/web-corpus.json";

function reference(text: string): NormalizedReference {
  const [candidate] = scanReferences(`${text} `);
  if (candidate?.kind !== "valid") throw new Error(`Expected a valid reference: ${text}`);
  return candidate.reference;
}

describe("complete scripture references", () => {
  it("selects every requested verse, including whole chapters, lists, and cross-chapter ranges", () => {
    const cases = [
      ["Psalm 23", [[23, 1, 6]]],
      ["Psalm 119", [[119, 1, 176]]],
      ["John 3:16,18-20", [[3, 16, 16], [3, 18, 20]]],
      ["John 3:36-4:2", [[3, 36, 36], [4, 1, 2]]],
      ["John 3:1-4:2", [[3, 1, 36], [4, 1, 2]]],
      ["John 3:36; 4:1-2", [[3, 36, 36], [4, 1, 2]]],
      ["John 3:35–4:2,4", [[3, 35, 36], [4, 1, 2], [4, 4, 4]]],
    ] as const;
    for (const [input, expected] of cases) {
      const candidates = scanReferences(`${input} `);
      expect(candidates, input).toHaveLength(1);
      expect(candidates[0].sourceText).toBe(input);
      const normalized = reference(input);
      expect(passageSegments(normalized, WEB_CANON).map((range) => [range.chapter, range.verseStart, range.verseEnd]), input).toEqual(expected);
      expect(reference(formatReference(normalized)), input).toEqual(normalized);
    }
  });

  it("permits 50 verses across chapters and all 176 verses of Psalm 119, but rejects 51 across chapters", () => {
    for (const input of ["John 3:1-4:14", "John 3:1-36,4:1-14", "Psalm 119", "Psalm 119:1-176"]) {
      expect(scanReferences(`${input} `)[0], input).toMatchObject({ kind: "valid" });
    }
    for (const input of ["John 3:1-4:15", "John 3:1-36,4:1-15", "Psalm 119:1-120:1"]) {
      expect(scanReferences(`${input} `), input).toMatchObject([{ kind: "invalid", sourceText: input, issue: { code: "passage_too_long" } }]);
    }
  });

  it("rejects the entire malformed, reversed, overlapping, or out-of-bounds expression", () => {
    const cases = [
      ["John 3:16,999", "verse_out_of_range"],
      ["John 3:16-4:999", "range_end_out_of_range"],
      ["John 3:36-22:1", "chapter_out_of_range"],
      ["John 4:2-3:36", "range_reversed"],
      ["John 3:16,16", "list_out_of_order"],
      ["John 3:16-18,17", "list_out_of_order"],
      ["John 3:18,16", "list_out_of_order"],
      ["John 3-4", "unsupported_reference"],
      ["John 3:16.18", "unsupported_reference"],
      ["John 3:16:18", "unsupported_reference"],
      ["John 3:16/18", "unsupported_reference"],
      ["John 3:16+18", "unsupported_reference"],
      ["John 3:16ff", "unsupported_reference"],
      ["John 3:16-Romans 1:1", "unsupported_reference"],
      ["John 3:16 - 1 Cor 1:1", "unsupported_reference"],
      ["Psalm 1 19", "unsupported_reference"],
      ["John 3:16-", "unsupported_reference"],
      ["Luke 17:35-37", "verse_unavailable"],
      ["Luke 17:35,36", "verse_unavailable"],
    ];
    for (const [input, code] of cases) {
      expect(scanReferences(`${input} `), input).toMatchObject([{ kind: "invalid", sourceText: input, issue: { code } }]);
      expect(scanReferences(`${input} `), input).toHaveLength(1);
    }
  });

  it("never activates a completed prefix while the longer reference is still being typed", () => {
    for (const input of ["Psalm 23", "John 3:16,18", "John 3:1-4:2", "John 3:1-4:", "John 3:16ff. ", "John 3:16-Romans 1:1 "]) {
      expect(scanReferences(input).filter((candidate) => candidate.kind === "valid"), input).toEqual([]);
    }
    expect(scanReferences("John 3:16,18 ", [{ from: 10, to: 12 }])).toEqual([]);
    expect(scanReferences("John 3:16; 1 Cor 13:4. ").map((candidate) => candidate.display))
      .toEqual(["John 3:16", "1 Corinthians 13:4"]);
    expect(scanReferences("John 3:16, followed by John 4:2. ").map((candidate) => candidate.display))
      .toEqual(["John 3:16", "John 4:2"]);
    expect(scanReferences("Gensis 1:31-2:2 ")[0]).toMatchObject({ kind: "valid", matchKind: "fuzzy", sourceText: "Gensis 1:31-2:2" });
  });
});

const catalog = JSON.stringify([{ abbr: "ENGTEST", title: "Test Bible", copyright: "Test attribution." }]);

function transportFor(getChapter: DbsTransport["getChapter"]): DbsTransport {
  return { getCatalog: async () => ({ body: catalog }), getChapter };
}

function chapterBody(chapter: number, omit?: number): string {
  return JSON.stringify(Array.from({ length: 60 }, (_, index) => index + 1)
    .filter((verse) => verse !== omit)
    .map((verse) => ({ [`JN${chapter}.${verse}`]: `Test ${chapter}:${verse}.` })));
}

describe("complete passage retrieval", () => {
  it("returns exact WEB chapter, list, and cross-chapter text", async () => {
    const provider = new WebScriptureProvider();
    for (const input of ["Psalm 119", "John 3:16,18-20", "John 3:36-4:2"]) {
      const normalized = reference(input);
      const passage = await provider.getPassage(normalized, "WEB");
      const expected = input === "Psalm 119" ? webCorpus.books.PSA[118]
        : input === "John 3:16,18-20" ? [webCorpus.books.JHN[2][15], ...webCorpus.books.JHN[2].slice(17, 20)]
        : [webCorpus.books.JHN[2][35], ...webCorpus.books.JHN[3].slice(0, 2)];
      expect(passage.text).toBe(expected.join(" ").replace(/\s+/gu, " ").trim());
      expect(passage).toMatchObject({ display: formatReference(normalized), translationId: "WEB", reference: normalized });
    }
  });

  it("loads each requested DBS chapter once, selecting only the requested verses in order", async () => {
    const calls: number[] = [];
    const provider = new DbsScriptureProvider(transportFor(async (_translation, _book, chapter) => {
      calls.push(chapter);
      return { body: chapterBody(chapter), cached: chapter === 3 };
    }));
    await provider.listTranslations();
    const passage = await provider.getPassage(reference("John 3:35,36-4:2,4"), "ENGTEST");
    expect(calls).toEqual([3, 4]);
    expect(passage.text).toBe("Test 3:35. Test 3:36. Test 4:1. Test 4:2. Test 4:4.");
    expect(passage).toMatchObject({ display: "John 3:35,36-4:2,4", cached: false, attribution: "Test Bible (TEST): Test attribution." });
  });

  it("rejects over-limit requests before any DBS chapter lookup, even outside detection", async () => {
    let calls = 0;
    const provider = new DbsScriptureProvider(transportFor(async () => { calls += 1; return { body: "[]" }; }));
    await provider.listTranslations();
    const tooLong = { ...reference("John 3:1-4:14"), verseEnd: 15 };
    await expect(provider.getPassage(tooLong, "ENGTEST")).rejects.toThrow(/50 verses/);
    await expect(new WebScriptureProvider().getPassage(tooLong, "WEB")).rejects.toThrow(/50 verses/);
    expect(calls).toBe(0);
  });

  it("never returns an incomplete DBS passage when a later chapter omits a selected verse", async () => {
    const dbs = new DbsScriptureProvider(transportFor(async (_translation, _book, chapter) => ({ body: chapterBody(chapter, chapter === 4 ? 2 : undefined) })));
    const provider = new CompositeScriptureProvider(new WebScriptureProvider(), dbs);
    await provider.listTranslations();
    const requested = reference("John 3:36-4:2");
    await expect(dbs.getPassage(requested, "ENGTEST")).rejects.toThrow(/John 4:2 is unavailable/);
    const fallback = await provider.getPassage(requested, "ENGTEST");
    expect(fallback).toMatchObject({ translationId: "WEB", fallbackFrom: { id: "ENGTEST" } });
    expect(fallback.text).toBe((await new WebScriptureProvider().getPassage(requested, "WEB")).text);
    expect(fallback.text).not.toContain("Test 3:36");
  });

  it("rejects a late chapter response after cancellation without returning partial text or falling back", async () => {
    const abort = new AbortController();
    const calls: number[] = [];
    let release: (() => void) | undefined;
    let secondStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { secondStarted = resolve; });
    const dbs = new DbsScriptureProvider(transportFor(async (_translation, _book, chapter) => {
      calls.push(chapter);
      if (chapter === 4) {
        secondStarted!();
        await new Promise<void>((resolve) => { release = resolve; });
      }
      return { body: chapterBody(chapter) };
    }));
    let fallbackCalls = 0;
    const provider = new CompositeScriptureProvider(new WebScriptureProvider({ onLookup: () => { fallbackCalls += 1; } }), dbs);
    await provider.listTranslations();
    const pending = provider.getPassage(reference("John 3:36-4:2"), "ENGTEST", abort.signal);
    await started;
    abort.abort();
    release!();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toEqual([3, 4]);
    expect(fallbackCalls).toBe(0);
  });
});
