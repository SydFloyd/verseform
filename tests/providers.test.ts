import { describe, expect, it } from "vitest";
import type { ScriptureProvider } from "../src/app/ports";
import { WEB_CANON } from "../src/core/canon";
import type { NormalizedReference } from "../src/core/reference";
import {
  DbsScriptureProvider, parseDbsCatalog, parseDbsChapter, type DbsTransport,
} from "../src/adapters/dbsScriptureProvider";
import { FakeScriptureProvider } from "../src/adapters/fakeScriptureProvider";
import { CompositeScriptureProvider } from "../src/adapters/scriptureProvider";
import { WebScriptureProvider } from "../src/adapters/webScriptureProvider";
import webCorpus from "../src/assets/web-corpus.json";

const john316: NormalizedReference = {
  bookId: "JHN", bookName: "John", chapter: 3, verseStart: 16,
};
const catalogBody = JSON.stringify([{
  abbr: "ENGTEST", title: "DBS Test Bible", title_vernacular: "DBS Test Bible",
  iso: "eng", script: "Latn", year: 2026, copyright: "Fixture copyright notice.",
}]);
const chapterBody = JSON.stringify([
  { "JN3.16a": "For the first section " },
  { "JN3.16b": "and the second section." },
  { "JN3.17": "The next verse." },
]);

class RecordedTransport implements DbsTransport {
  catalogCalls = 0;
  chapterCalls = 0;

  constructor(private readonly failChapter = false) {}

  async getCatalog() {
    this.catalogCalls += 1;
    return { body: catalogBody };
  }

  async getChapter() {
    this.chapterCalls += 1;
    if (this.failChapter) throw new Error("offline");
    return { body: chapterBody };
  }
}

async function expectProviderContract(
  provider: ScriptureProvider,
  translationId: string,
): Promise<void> {
  const catalog = await provider.listTranslations();
  expect(catalog.translations.some((translation) => translation.id === translationId)).toBe(true);
  const passage = await provider.getPassage(john316, translationId);
  expect(passage).toMatchObject({
    reference: john316,
    translationId,
  });
  expect(passage.citationLabel).not.toBe("");
  expect(passage.translationName).not.toBe("");
  expect(passage.attribution).not.toBe("");
  expect(passage.text).not.toBe("");
}

describe("scripture provider contract", () => {
  it("is shared by fake, bundled WEB, and recorded DBS adapters", async () => {
    await expectProviderContract(new FakeScriptureProvider(0), "WEB");
    await expectProviderContract(new WebScriptureProvider(), "WEB");
    const dbs = new DbsScriptureProvider(new RecordedTransport());
    await expectProviderContract(dbs, "ENGTEST");
  });

  it("combines DBS split verse keys without interpreting remote text as HTML", async () => {
    const transport = new RecordedTransport();
    const provider = new DbsScriptureProvider(transport);
    await provider.listTranslations();
    const passage = await provider.getPassage(john316, "ENGTEST");
    expect(passage.text).toBe("For the first section and the second section.");
    expect(passage.citationLabel).toBe("TEST");
    expect(passage.attribution).toContain("Fixture copyright notice.");
    expect(transport.chapterCalls).toBe(1);
  });
});

describe("provider trust boundaries", () => {
  it("rejects malformed, oversized, and wrong-chapter DBS payloads", () => {
    expect(() => parseDbsCatalog("{bad-json")).toThrow(/malformed/);
    expect(() => parseDbsCatalog(JSON.stringify([{ abbr: "../WEB", title: "Bad" }]))).toThrow(/invalid/);
    expect(() => parseDbsChapter("[]".padEnd(2 * 1024 * 1024 + 2, " "), 3)).toThrow(/safety limit/);
    expect(() => parseDbsChapter(JSON.stringify([{ "JN4.16": "Wrong chapter" }]), 3)).toThrow(/wrong chapter/);
    expect(() => parseDbsChapter(JSON.stringify([{ "JN3.16": "" }]), 3)).toThrow(/empty verse/);
  });

  it("accepts the live DBS shape with many verses in one object", () => {
    const verses = parseDbsChapter(JSON.stringify([{
      "JN3.16": "For God so loved the world.",
      "JN3.17": "God sent his Son.",
    }]), 3);
    expect(verses.get(16)).toBe("For God so loved the world.");
    expect(verses.get(17)).toBe("God sent his Son.");
  });

  it("propagates cancellation instead of falling back or inserting", async () => {
    const transport: DbsTransport = {
      getCatalog: async () => ({ body: catalogBody }),
      getChapter: (_translation, _book, _chapter, signal) => new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")), { once: true });
      }),
    };
    const composite = new CompositeScriptureProvider(
      new WebScriptureProvider(), new DbsScriptureProvider(transport),
    );
    await composite.listTranslations();
    const controller = new AbortController();
    const pending = composite.getPassage(john316, "ENGTEST", controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("uses explicit bundled WEB metadata when DBS fails", async () => {
    const dbs = new DbsScriptureProvider(new RecordedTransport(true));
    const composite = new CompositeScriptureProvider(new WebScriptureProvider(), dbs);
    await composite.listTranslations();
    const passage = await composite.getPassage(john316, "ENGTEST");
    expect(passage).toMatchObject({
      translationId: "WEB",
      citationLabel: "WEB",
      fallbackFrom: { id: "ENGTEST", name: "DBS Test Bible" },
    });
    expect(passage.text).toContain("only born Son");
  });
});

describe("bundled WEB integrity", () => {
  it("contains every verse declared by the local canon", () => {
    expect(webCorpus.version).toBe(1);
    expect(Object.keys(webCorpus.books)).toHaveLength(66);
    for (const book of WEB_CANON.books) {
      const chapters = webCorpus.books[book.id as keyof typeof webCorpus.books];
      expect(chapters, book.id).toHaveLength(book.verseCounts.length);
      book.verseCounts.forEach((verseCount, index) => {
        expect(chapters[index], `${book.id} ${index + 1}`).toHaveLength(verseCount);
        const unavailable = new Set(book.unavailableVerses?.[index + 1] ?? []);
        expect(chapters[index].every((verse, verseIndex) => verse.trim().length > 0 || unavailable.has(verseIndex + 1)), `${book.id} ${index + 1}`).toBe(true);
      });
    }
  });
});

const liveEnvironment = (globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
}).process?.env;
const live = liveEnvironment?.DBS_LIVE_SMOKE === "1" ? it : it.skip;
live("loads the public DBS catalog and one passage without a secret", async () => {
  const transport: DbsTransport = {
    async getCatalog(signal) {
      const response = await fetch("https://arc.dbs.org/api/bible-text/", {
        headers: { Accept: "application/json", "User-Agent": "Verseform-live-smoke/0.1" }, signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { body: await response.text() };
    },
    async getChapter(translationId, bookId, chapter, signal) {
      const response = await fetch(`https://arc.dbs.org/api/bible-text/${translationId}/${bookId}/${chapter}`, {
        headers: { Accept: "application/json", "User-Agent": "Verseform-live-smoke/0.1" }, signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { body: await response.text() };
    },
  };
  const provider = new DbsScriptureProvider(transport);
  const catalog = await provider.listTranslations();
  expect(catalog.translations.some((translation) => translation.id === "ENGWEB")).toBe(true);
  const passage = await provider.getPassage(john316, "ENGWEB");
  expect(passage.text).toContain("God");
});
