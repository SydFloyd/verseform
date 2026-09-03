import type {
  Passage, ScriptureProvider, Translation, TranslationCatalog,
} from "../app/ports";
import { STANDARD_CANON } from "../core/canon";
import type { NormalizedReference } from "../core/reference";

export const DBS_CATALOG_LIMIT = 8 * 1024 * 1024;
export const DBS_CHAPTER_LIMIT = 2 * 1024 * 1024;
const MAX_TRANSLATIONS = 6_000;
const MAX_VERSES = 250;
const translationIdPattern = /^[A-Za-z0-9_-]{1,64}$/u;
const verseKeyPattern = /^([1-3]?[A-Z]{1,3})(\d{1,3})\.(\d{1,3})([a-z]?)$/u;
const headingMinorWords = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into",
  "of", "on", "or", "the", "through", "to", "versus", "with", "without",
]);

export type DbsTransportResponse = { body: string; cached?: boolean; stale?: boolean };

export interface DbsTransport {
  getCatalog(signal?: AbortSignal): Promise<DbsTransportResponse>;
  getChapter(
    translationId: string,
    bookId: string,
    chapter: number,
    signal?: AbortSignal,
  ): Promise<DbsTransportResponse>;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function boundedString(value: unknown, maximum: number, required = false): string | undefined {
  if (value === null || value === undefined || value === "") return required ? undefined : undefined;
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const normalized = String(value).replace(/\s+/gu, " ").trim();
  return normalized && normalized.length <= maximum ? normalized : undefined;
}

function citationLabel(id: string): string {
  const withoutLanguage = /^[A-Z]{3}[A-Z0-9_-]{2,}$/u.test(id) ? id.slice(3) : id;
  return withoutLanguage.slice(0, 24) || id;
}

function attribution(name: string, id: string, copyright?: string): string {
  return copyright
    ? `${name} (${citationLabel(id)}): ${copyright}`
    : `Scripture quotations from ${name} (${citationLabel(id)}), supplied by Digital Bible Society.`;
}

function probableSectionHeading(value: string): boolean {
  if (!value || /[.!?;:]$/u.test(value)) return false;
  const words = value.split(" ");
  if (words.length < 2 || words.length > 12) return false;
  let titleWords = 0;
  for (const word of words) {
    const plain = word.replace(/^[“‘(']+|[”’)',]+$/gu, "");
    if (!plain) return false;
    if (headingMinorWords.has(plain)) continue;
    if (!/^[\p{Lu}\d][\p{L}\p{M}\d'’()-]*$/u.test(plain)) return false;
    titleWords += 1;
  }
  return titleWords >= 2;
}

function normalizeDbsVerseText(value: string): string {
  let text = value.replace(/\s+/gu, " ").trim();
  const gluedSentenceBoundaries = [...text.matchAll(/[\p{Ll}\p{N}]\.(?=[\p{Lu}])/gu)];
  const lastBoundary = gluedSentenceBoundaries.at(-1);
  if (lastBoundary?.index !== undefined) {
    const punctuationIndex = lastBoundary.index + lastBoundary[0].length - 1;
    const possibleHeading = text.slice(punctuationIndex + 1);
    if (probableSectionHeading(possibleHeading)) text = text.slice(0, punctuationIndex + 1);
  }
  return text
    .replace(/([,;:!?])(?=[\p{Lu}“‘])/gu, "$1 ")
    .replace(/([\p{Ll}\p{N}”’\])}]\.)(?=[\p{Lu}“‘])/gu, "$1 ");
}

export function parseDbsCatalog(body: string): Translation[] {
  if (new TextEncoder().encode(body).byteLength > DBS_CATALOG_LIMIT) {
    throw new Error("The DBS translation catalog exceeded Verseform's safety limit.");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(body); }
  catch { throw new Error("DBS returned a malformed translation catalog."); }
  if (!Array.isArray(parsed) || parsed.length > MAX_TRANSLATIONS) {
    throw new Error("DBS returned an invalid translation catalog.");
  }
  const seen = new Set<string>();
  const translations: Translation[] = [];
  for (const value of parsed) {
    const item = record(value);
    const id = boundedString(item?.abbr, 64, true);
    const name = boundedString(item?.title, 240, true);
    if (!item || !id || !name || !translationIdPattern.test(id)) {
      throw new Error("DBS returned an invalid translation catalog entry.");
    }
    if (seen.has(id) || id === "WEB") continue;
    seen.add(id);
    const copyright = boundedString(item.copyright, 2_000);
    translations.push({
      id,
      citationLabel: citationLabel(id),
      name,
      vernacularName: boundedString(item.title_vernacular, 240),
      languageCode: boundedString(item.iso, 16),
      script: boundedString(item.script, 32),
      year: boundedString(item.year, 32),
      copyright,
      attribution: attribution(name, id, copyright),
      source: "dbs",
      canon: { ...STANDARD_CANON, translationId: id },
    });
  }
  return translations.sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

export function parseDbsChapter(
  body: string,
  requestedChapter: number,
): Map<number, string> {
  if (new TextEncoder().encode(body).byteLength > DBS_CHAPTER_LIMIT) {
    throw new Error("The DBS chapter exceeded Verseform's safety limit.");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(body); }
  catch { throw new Error("DBS returned malformed chapter data."); }
  if (!Array.isArray(parsed) || parsed.length > MAX_VERSES) {
    throw new Error("DBS returned invalid chapter data.");
  }
  const verses = new Map<number, string[]>();
  let entryCount = 0;
  for (const value of parsed) {
    const item = record(value);
    const entries = item ? Object.entries(item) : [];
    if (!entries.length || entryCount + entries.length > MAX_VERSES) {
      throw new Error("DBS returned an invalid verse entry.");
    }
    entryCount += entries.length;
    for (const [key, value] of entries) {
      if (typeof value !== "string" || value.length > 20_000) {
        throw new Error("DBS returned an invalid verse entry.");
      }
      const match = verseKeyPattern.exec(key);
      if (!match || Number(match[2]) !== requestedChapter) {
        throw new Error("DBS returned verse data for the wrong chapter.");
      }
      const verse = Number(match[3]);
      if (verse < 1 || verse > 250) throw new Error("DBS returned an invalid verse number.");
      const text = normalizeDbsVerseText(value);
      if (!text) throw new Error("DBS returned an empty verse.");
      const sections = verses.get(verse) ?? [];
      sections.push(text);
      verses.set(verse, sections);
    }
  }
  return new Map([...verses].map(([verse, sections]) => [verse, sections.join(" ")]));
}

export class DbsScriptureProvider implements ScriptureProvider {
  private catalog?: Translation[];

  constructor(private readonly transport: DbsTransport) {}

  async listTranslations(signal?: AbortSignal): Promise<TranslationCatalog> {
    const response = await this.transport.getCatalog(signal);
    this.catalog = parseDbsCatalog(response.body);
    return { translations: this.catalog, offline: Boolean(response.stale) };
  }

  async getPassage(
    reference: NormalizedReference,
    translationId: string,
    signal?: AbortSignal,
  ): Promise<Passage> {
    if (!translationIdPattern.test(translationId)) throw new Error("That translation identifier is invalid.");
    const translation = this.catalog?.find((item) => item.id === translationId);
    if (!translation) throw new Error("That translation is not in the authorized DBS catalog.");
    const response = await this.transport.getChapter(
      translationId, reference.bookId, reference.chapter, signal,
    );
    const chapter = parseDbsChapter(response.body, reference.chapter);
    const end = reference.verseEnd ?? reference.verseStart;
    const selected: string[] = [];
    for (let verse = reference.verseStart; verse <= end; verse += 1) {
      const text = chapter.get(verse);
      if (!text) throw new Error(`${reference.bookName} ${reference.chapter}:${verse} is unavailable in ${translation.name}.`);
      selected.push(text);
    }
    return {
      reference,
      display: `${reference.bookName} ${reference.chapter}:${reference.verseStart}${reference.verseEnd === undefined ? "" : `-${reference.verseEnd}`}`,
      translationId: translation.id,
      citationLabel: translation.citationLabel,
      translationName: translation.name,
      attribution: translation.attribution,
      text: selected.join(" "),
      cached: response.cached,
    };
  }
}
