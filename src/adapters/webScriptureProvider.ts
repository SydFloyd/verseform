import type { Passage, ScriptureProvider, Translation, TranslationCatalog } from "../app/ports";
import { WEB_CANON } from "../core/canon";
import { formatReference, passageSegments, type NormalizedReference } from "../core/reference";
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
    throwIfAborted(signal);
    if (translationId !== WEB_TRANSLATION.id) {
      throw new Error(`The bundled provider does not contain ${translationId}.`);
    }
    const segments = passageSegments(reference, WEB_CANON);
    this.options.onLookup?.();
    await wait(this.options.delayMs ?? 0, signal);
    throwIfAborted(signal);
    const selected: string[] = [];
    for (const segment of segments) {
      const verses = this.corpus.books[reference.bookId]?.[segment.chapter - 1];
      for (let verse = segment.verseStart; verse <= segment.verseEnd; verse += 1) {
        const text = verses?.[verse - 1];
        if (!text) throw new Error(`${reference.bookName} ${segment.chapter}:${verse} is unavailable in bundled WEB.`);
        selected.push(text);
      }
    }
    throwIfAborted(signal);
    return {
      reference,
      display: formatReference(reference),
      translationId: WEB_TRANSLATION.id,
      citationLabel: WEB_TRANSLATION.citationLabel,
      translationName: WEB_TRANSLATION.name,
      attribution: WEB_TRANSLATION.attribution,
      text: selected.join(" ").replace(/\s+/gu, " ").trim(),
    };
  }
}
