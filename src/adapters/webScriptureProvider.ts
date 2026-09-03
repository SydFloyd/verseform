import type { Passage, ScriptureProvider, Translation, TranslationCatalog } from "../app/ports";
import { WEB_CANON, canonBook } from "../core/canon";
import type { NormalizedReference } from "../core/reference";
import webCorpus from "../assets/web-corpus.json";

type WebCorpus = {
  version: number;
  edition: string;
  source: string;
  books: Record<string, string[][]>;
};

export const WEB_ATTRIBUTION = "Scripture quotations are from the World English Bible (Public Domain).";

export const WEB_TRANSLATION: Translation = {
  id: "WEB",
  citationLabel: "WEB",
  name: "World English Bible",
  vernacularName: "World English Bible",
  languageCode: "eng",
  script: "Latn",
  year: "2020 stable text",
  copyright: "Public Domain",
  attribution: WEB_ATTRIBUTION,
  source: "bundled",
  canon: WEB_CANON,
};

type WebProviderOptions = {
  delayMs?: number;
  onLookup?: () => void;
};

function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (!delayMs) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Passage request cancelled.", "AbortError"));
      return;
    }
    const timer = window.setTimeout(resolve, delayMs);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Passage request cancelled.", "AbortError"));
    }, { once: true });
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Passage request cancelled.", "AbortError");
}

export class WebScriptureProvider implements ScriptureProvider {
  private readonly corpus = webCorpus as WebCorpus;

  constructor(private readonly options: WebProviderOptions = {}) {}

  async listTranslations(signal?: AbortSignal): Promise<TranslationCatalog> {
    throwIfAborted(signal);
    return { translations: [WEB_TRANSLATION], offline: false };
  }

  async getPassage(
    reference: NormalizedReference,
    translationId: string,
    signal?: AbortSignal,
  ): Promise<Passage> {
    this.options.onLookup?.();
    await wait(this.options.delayMs ?? 0, signal);
    throwIfAborted(signal);
    if (translationId !== WEB_TRANSLATION.id) {
      throw new Error(`The bundled provider does not contain ${translationId}.`);
    }
    const book = canonBook(WEB_CANON, reference.bookId);
    const verses = this.corpus.books[reference.bookId]?.[reference.chapter - 1];
    const end = reference.verseEnd ?? reference.verseStart;
    if (!book || !verses || reference.verseStart < 1 || end > verses.length) {
      throw new Error(`${reference.bookName} ${reference.chapter} is unavailable in bundled WEB.`);
    }
    const selected = verses.slice(reference.verseStart - 1, end);
    if (selected.length !== end - reference.verseStart + 1 || selected.some((verse) => !verse)) {
      throw new Error(`${reference.bookName} ${reference.chapter}:${reference.verseStart} is unavailable in bundled WEB.`);
    }
    throwIfAborted(signal);
    return {
      reference,
      display: `${book.name} ${reference.chapter}:${reference.verseStart}${reference.verseEnd === undefined ? "" : `-${reference.verseEnd}`}`,
      translationId: WEB_TRANSLATION.id,
      citationLabel: WEB_TRANSLATION.citationLabel,
      translationName: WEB_TRANSLATION.name,
      attribution: WEB_TRANSLATION.attribution,
      text: selected.join(" ").replace(/\s+/gu, " ").trim(),
    };
  }
}
