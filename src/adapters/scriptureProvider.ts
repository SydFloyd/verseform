import type {
  Passage, ScriptureProvider, TranslationCatalog,
} from "../app/ports";
import type { NormalizedReference } from "../core/reference";
import { DbsScriptureProvider } from "./dbsScriptureProvider";
import { WEB_TRANSLATION, WebScriptureProvider } from "./webScriptureProvider";

function abortError(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (error instanceof DOMException && error.name === "AbortError");
}

export class CompositeScriptureProvider implements ScriptureProvider {
  constructor(
    private readonly web: WebScriptureProvider,
    private readonly dbs: DbsScriptureProvider,
  ) {}

  async listTranslations(signal?: AbortSignal): Promise<TranslationCatalog> {
    try {
      const catalog = await this.dbs.listTranslations(signal);
      return { ...catalog, translations: [WEB_TRANSLATION, ...catalog.translations] };
    } catch (error) {
      if (abortError(error, signal)) throw error;
      return {
        translations: [WEB_TRANSLATION],
        offline: true,
        message: error instanceof Error ? error.message : "DBS is unavailable.",
      };
    }
  }

  async getPassage(
    reference: NormalizedReference,
    translationId: string,
    signal?: AbortSignal,
  ): Promise<Passage> {
    if (translationId === WEB_TRANSLATION.id) {
      return this.web.getPassage(reference, translationId, signal);
    }
    try {
      return await this.dbs.getPassage(reference, translationId, signal);
    } catch (error) {
      if (abortError(error, signal)) throw error;
      const translations = await this.dbs.listTranslations(signal).catch(() => ({ translations: [], offline: true }));
      const requested = translations.translations.find((item) => item.id === translationId);
      const fallback = await this.web.getPassage(reference, WEB_TRANSLATION.id, signal);
      return {
        ...fallback,
        fallbackFrom: { id: translationId, name: requested?.name ?? translationId },
      };
    }
  }
}
