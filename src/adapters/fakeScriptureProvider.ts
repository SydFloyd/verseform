import type { Passage, ScriptureProvider, TranslationCatalog } from "../app/ports";
import { WEB_TRANSLATION } from "./webScriptureProvider";
import type { NormalizedReference } from "../core/reference";

const john316 =
  "For God so loved the world, that he gave his one and only Son, that whoever believes in him should not perish, but have eternal life.";

function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Passage request cancelled.", "AbortError"));
      return;
    }

    const timer = globalThis.setTimeout(resolve, delayMs);
    signal?.addEventListener(
      "abort",
      () => {
        globalThis.clearTimeout(timer);
        reject(new DOMException("Passage request cancelled.", "AbortError"));
      },
      { once: true },
    );
  });
}

export class FakeScriptureProvider implements ScriptureProvider {
  constructor(private readonly delayMs = 35) {}

  async listTranslations(): Promise<TranslationCatalog> {
    return {
      translations: [{ ...WEB_TRANSLATION, name: "WEB (fake provider)", source: "fake" }],
      offline: false,
    };
  }

  async getPassage(
    reference: NormalizedReference,
    translationId: string,
    signal?: AbortSignal,
  ): Promise<Passage> {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("verseform:fake-provider-request"));
    }
    await wait(this.delayMs, signal);
    const isWalkingReference =
      reference.bookId === "JHN" &&
      reference.chapter === 3 &&
      reference.verseStart === 16 &&
      reference.verseEnd === undefined;
    const display = `${reference.bookName} ${reference.chapter}:${reference.verseStart}${reference.verseEnd === undefined ? "" : `-${reference.verseEnd}`}`;

    return {
      reference,
      display,
      translationId,
      citationLabel: "WEB",
      translationName: "WEB (fake provider)",
      attribution: WEB_TRANSLATION.attribution,
      text: isWalkingReference ? john316 : `Local test passage for ${reference.bookName}.`,
    };
  }
}
