import { WEB_CANON, type CanonBook, type CanonMetadata } from "./canon";

export type ReferenceRange = {
  chapter: number;
  verseStart: number;
  verseEnd?: number;
  chapterEnd?: number;
};

export type NormalizedReference = ReferenceRange & {
  bookId: string;
  bookName: string;
  wholeChapter?: true;
  additionalRanges?: ReferenceRange[];
};

export const MAX_CROSS_CHAPTER_VERSES = 50;
export const PASSAGE_LIMIT_DESCRIPTION = "Insert up to one whole chapter, or 50 verses across chapters, at a time.";

export type TextRange = { from: number; to: number };
export type ReferenceMatchKind = "exact" | "fuzzy";

type CandidateBase = TextRange & {
  sourceText: string;
  display: string;
  matchKind: ReferenceMatchKind;
};

export type ReferenceCandidate = CandidateBase & {
  kind: "valid";
  reference: NormalizedReference;
};

export type ReferenceIssueCode =
  | "chapter_out_of_range"
  | "verse_out_of_range"
  | "verse_unavailable"
  | "range_reversed"
  | "range_end_out_of_range"
  | "unsupported_reference"
  | "passage_too_long"
  | "list_out_of_order";

export type InvalidReferenceCandidate = CandidateBase & {
  kind: "invalid";
  bookId: string;
  bookName: string;
  chapter: number;
  verseStart: number;
  verseEnd?: number;
  issue: { code: ReferenceIssueCode; message: string };
};

export type DetectedReference = ReferenceCandidate | InvalidReferenceCandidate;

type CompiledCanon = {
  exactPattern: RegExp;
  leadingBookPattern: RegExp;
  aliases: Map<string, CanonBook>;
};

const compiledCanons = new WeakMap<CanonMetadata, CompiledCanon>();
const coordinatePattern = /(?<![\p{L}\p{N}])\d+/gu;
// Read the entire numeric expression before applying the supported grammar. A
// comma/semicolon before a numbered book starts a separate complete reference.
const expressionPattern = /^\d+(?:(?:[ \t]*[:\-–—/+&][ \t]*\d*)|(?:[ \t]*[,;.][ \t]*(?![1-3][ \t]*[A-Za-z])\d+)|(?:[ \t]+\d+))*/u;
const delimiterPattern = /^[\s.,;:!?)\]}"'’”]/u;

function normalizeBookName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^first(?=\s)/, "1")
    .replace(/^second(?=\s)/, "2")
    .replace(/^third(?=\s)/, "3")
    .replace(/^iii(?=\s)/, "3")
    .replace(/^ii(?=\s)/, "2")
    .replace(/^i(?=\s)/, "1")
    .replace(/[^a-z0-9]/g, "");
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasPattern(alias: string): string {
  return alias.trim().split(/\s+/).map(escapePattern).join("\\s*");
}

function compileCanon(canon: CanonMetadata): CompiledCanon {
  const cached = compiledCanons.get(canon);
  if (cached) return cached;

  const aliases = new Map<string, CanonBook>();
  const spellings: string[] = [];
  for (const book of canon.books) {
    for (const spelling of [book.name, ...book.aliases]) {
      const key = normalizeBookName(spelling);
      const existing = aliases.get(key);
      if (existing && existing.id !== book.id) {
        throw new Error(`Ambiguous canon alias: ${spelling}`);
      }
      aliases.set(key, book);
      spellings.push(spelling);
    }
  }

  const alternatives = [...new Set(spellings)]
    .sort((left, right) => right.length - left.length)
    .map(aliasPattern)
    .join("|");
  const exactPattern = new RegExp(
    `(?<![\\p{L}\\p{N}])(${alternatives})\\.?\\s+(?=\\d)`,
    "giu",
  );
  const leadingBookPattern = new RegExp(`^(${alternatives})\\.?\\s+(?=\\d)`, "iu");
  const compiled = { aliases, exactPattern, leadingBookPattern };
  compiledCanons.set(canon, compiled);
  return compiled;
}

function overlaps(range: TextRange, excluded: readonly TextRange[]): boolean {
  return excluded.some((item) => range.from < item.to && range.to > item.from);
}

function likelyUrlContext(text: string, from: number): boolean {
  if (from > 0 && /[/@]/.test(text[from - 1])) return true;
  const tokenStart = Math.max(text.lastIndexOf(" ", from - 1), text.lastIndexOf("\n", from - 1)) + 1;
  return text.slice(tokenStart, from).includes("://");
}

export function formatReference(reference: NormalizedReference): string {
  if (reference.wholeChapter) return `${reference.bookName} ${reference.chapter}`;
  let previousChapter = reference.chapter;
  const parts = [reference, ...(reference.additionalRanges ?? [])].map((range, index) => {
    const start = index === 0 || range.chapter !== previousChapter
      ? `${range.chapter}:${range.verseStart}` : String(range.verseStart);
    previousChapter = range.chapterEnd ?? range.chapter;
    return `${start}${range.verseEnd === undefined ? "" : `-${range.chapterEnd === undefined ? "" : `${range.chapterEnd}:`}${range.verseEnd}`}`;
  });
  return `${reference.bookName} ${parts.join(",")}`;
}

class ReferenceValidationError extends Error {
  constructor(readonly code: ReferenceIssueCode, message: string) { super(message); }
}

function fail(code: ReferenceIssueCode, message: string): never {
  throw new ReferenceValidationError(code, message);
}

export type PassageSegment = { chapter: number; verseStart: number; verseEnd: number };

// Shared by detection and both real providers: reject before requesting text,
// then retrieve every selected verse. Existing single-range metadata still works.
export function passageSegments(reference: NormalizedReference, canon: CanonMetadata): PassageSegment[] {
  const book = canon.books.find((item) => item.id === reference.bookId);
  if (!book) return fail("unsupported_reference", "That book is unavailable in this translation.");
  const segments: PassageSegment[] = [];
  let count = 0;
  let previous: PassageSegment | undefined;
  const chapterCount = (chapter: number) => {
    if (!Number.isSafeInteger(chapter) || chapter < 1 || chapter > book.verseCounts.length) {
      return fail("chapter_out_of_range", `${book.name} has chapters 1–${book.verseCounts.length}; chapter ${chapter} does not exist.`);
    }
    return book.verseCounts[chapter - 1];
  };
  for (const range of [reference, ...(reference.additionalRanges ?? [])]) {
    const startCount = chapterCount(range.chapter);
    const endChapter = range.chapterEnd ?? range.chapter;
    const endCount = chapterCount(endChapter);
    const endVerse = range.verseEnd ?? range.verseStart;
    if (!Number.isSafeInteger(range.verseStart) || range.verseStart < 1 || range.verseStart > startCount) {
      return fail("verse_out_of_range", `${book.name} ${range.chapter} has verses 1–${startCount}; verse ${range.verseStart} does not exist.`);
    }
    if (endChapter < range.chapter || (endChapter === range.chapter && endVerse < range.verseStart)) {
      return fail("range_reversed", "The ending verse must not come before the starting verse.");
    }
    if (!Number.isSafeInteger(endVerse) || endVerse < 1 || endVerse > endCount) {
      return fail("range_end_out_of_range", `${book.name} ${endChapter} ends at verse ${endCount}; verse ${endVerse} does not exist.`);
    }
    if (previous && (range.chapter < previous.chapter || (range.chapter === previous.chapter && range.verseStart <= previous.verseEnd))) {
      return fail("list_out_of_order", "List verses in Bible order without repeats or overlapping ranges.");
    }
    for (let chapter = range.chapter; chapter <= endChapter; chapter += 1) {
      const segment = {
        chapter,
        verseStart: chapter === range.chapter ? range.verseStart : 1,
        verseEnd: chapter === endChapter ? endVerse : book.verseCounts[chapter - 1],
      };
      count += segment.verseEnd - segment.verseStart + 1;
      if (chapter !== reference.chapter && count > MAX_CROSS_CHAPTER_VERSES) {
        return fail("passage_too_long", `${PASSAGE_LIMIT_DESCRIPTION} Split this reference into smaller passages.`);
      }
      const absent = book.unavailableVerses?.[chapter]?.find((verse) => verse >= segment.verseStart && verse <= segment.verseEnd);
      if (absent !== undefined) {
        return fail("verse_unavailable", `${book.name} ${chapter}:${absent} is not present in this translation's main text.`);
      }
      segments.push(segment);
      previous = segment;
    }
  }
  return segments;
}

function parseExpression(book: CanonBook, expression: string): NormalizedReference {
  if (/\d[ \t]+\d/u.test(expression)) {
    return fail("unsupported_reference", "Separate chapter and verse with a colon, and listed verses with commas.");
  }
  const compact = expression.replace(/[ \t]/gu, "").replace(/[–—]/gu, "-");
  if (/^\d+$/u.test(compact)) {
    const chapter = Number(compact);
    return { bookId: book.id, bookName: book.name, chapter, verseStart: 1,
      verseEnd: book.verseCounts[chapter - 1] ?? 1, wholeChapter: true };
  }
  const parts = compact.split(/([,;])/u);
  const ranges: ReferenceRange[] = [];
  let chapter: number | undefined;
  for (let index = 0; index < parts.length; index += 2) {
    const match = /^(?:(\d+):)?(\d+)(?:-(?:(\d+):)?(\d+))?$/u.exec(parts[index]);
    if (!match || (match[1] === undefined && (chapter === undefined || parts[index - 1] === ";"))) {
      return fail("unsupported_reference", "Use a chapter (Psalm 23), verses (John 3:16,18-20), or a same-book range (John 3:36-4:2). Chapter ranges and other shorthand are not supported.");
    }
    chapter = match[1] === undefined ? chapter! : Number(match[1]);
    ranges.push({ chapter, verseStart: Number(match[2]),
      ...(match[4] === undefined ? {} : { verseEnd: Number(match[4]) }),
      ...(match[3] === undefined ? {} : { chapterEnd: Number(match[3]) }),
    });
    chapter = match[3] === undefined ? chapter : Number(match[3]);
  }
  return { bookId: book.id, bookName: book.name, ...ranges[0],
    ...(ranges.length > 1 ? { additionalRanges: ranges.slice(1) } : {}),
  };
}

function classify(book: CanonBook, expression: string, base: CandidateBase, canon: CanonMetadata): DetectedReference {
  try {
    const reference = parseExpression(book, expression);
    passageSegments(reference, canon);
    return { ...base, display: formatReference(reference), kind: "valid", reference };
  } catch (error) {
    if (!(error instanceof ReferenceValidationError)) throw error;
    const coordinates = expression.match(/\d+/gu) ?? [];
    return { ...base, kind: "invalid", bookId: book.id, bookName: book.name,
      chapter: Number(coordinates[0]), verseStart: Number(coordinates[1] ?? 1),
      issue: { code: error.code, message: error.message } };
  }
}

function editDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function ordinal(key: string): string {
  return /^[123]/.test(key) ? key[0] : "";
}

function fuzzyBookBefore(
  text: string,
  coordinateFrom: number,
  canon: CanonMetadata,
): { book: CanonBook; from: number; source: string } | undefined {
  const windowFrom = Math.max(0, coordinateFrom - 40);
  const fragment = text.slice(windowFrom, coordinateFrom);
  const tokens = [...fragment.matchAll(/(?:[1-3]|[A-Za-z]+)\.?/g)];
  const trailing = tokens.at(-1);
  if (!trailing || !/^[\s.]*$/.test(fragment.slice((trailing.index ?? 0) + trailing[0].length))) return undefined;

  type Match = { book: CanonBook; from: number; source: string; distance: number };
  const matches: Match[] = [];
  for (const token of tokens.slice(-3)) {
    const localFrom = token.index ?? 0;
    const source = fragment.slice(localFrom).trim();
    if (!/^[1-3]|^[A-Z]/.test(source)) continue;
    const key = normalizeBookName(source);
    const letters = key.replace(/^[1-3]/, "");
    if (letters.length < 4) continue;
    const allowedDistance = letters.length > 11 ? 2 : 1;
    for (const book of canon.books) {
      const canonical = normalizeBookName(book.name);
      if (ordinal(key) !== ordinal(canonical)) continue;
      const distance = editDistance(key, canonical);
      if (distance > 0 && distance <= allowedDistance) {
        matches.push({ book, from: windowFrom + localFrom, source, distance });
      }
    }
  }
  matches.sort((left, right) => left.distance - right.distance || right.source.length - left.source.length);
  const best = matches[0];
  if (!best) return undefined;
  if (matches.some((match) => match.book.id !== best.book.id && match.distance === best.distance)) return undefined;
  return best;
}

export function isValidReference(candidate: DetectedReference): candidate is ReferenceCandidate {
  return candidate.kind === "valid";
}

export function scanReferences(
  text: string,
  excluded: readonly TextRange[] = [],
  canon: CanonMetadata = WEB_CANON,
): DetectedReference[] {
  const candidates: DetectedReference[] = [];
  const occupied: TextRange[] = [];
  const { aliases, exactPattern, leadingBookPattern } = compileCanon(canon);
  exactPattern.lastIndex = 0;

  const detect = (book: CanonBook, from: number, coordinateFrom: number, matchKind: ReferenceMatchKind) => {
    if (overlaps({ from, to: from + 1 }, occupied)) return;
    let expression = expressionPattern.exec(text.slice(coordinateFrom))?.[0].trimEnd();
    if (!expression) return;
    // Keep unsupported cross-book ranges and suffixes (such as "ff") whole as
    // well. Neither endpoint may become an independent valid reference.
    for (const dash of expression.matchAll(/[-–—][ \t]*/gu)) {
      const nextFrom = coordinateFrom + dash.index + dash[0].length;
      const nextBook = leadingBookPattern.exec(text.slice(nextFrom));
      if (!nextBook) continue;
      const nextCoordinate = nextFrom + nextBook[0].length;
      const nextExpression = expressionPattern.exec(text.slice(nextCoordinate))?.[0].trimEnd();
      if (nextExpression) expression = text.slice(coordinateFrom, nextCoordinate + nextExpression.length);
    }
    const suffix = /^[A-Za-z]+/u.exec(text.slice(coordinateFrom + expression.length))?.[0] ?? "";
    expression += suffix;
    const to = coordinateFrom + expression.length;
    occupied.push({ from, to });
    if (!delimiterPattern.test(text.slice(to, to + 1)) || overlaps({ from, to }, excluded) || likelyUrlContext(text, from)) return;
    // The endpoint of a cross-book range must not become a separate insertion.
    if (/\d[ \t]*[-–—][ \t]*$/u.test(text.slice(Math.max(0, from - 20), from))) return;
    candidates.push(classify(book, expression, {
      from, to, sourceText: text.slice(from, to), display: `${book.name} ${expression}`, matchKind,
    }, canon));
  };

  for (const match of text.matchAll(exactPattern)) {
    const book = aliases.get(normalizeBookName(match[1]));
    if (!book) continue;
    detect(book, match.index, match.index + match[0].length, "exact");
  }

  coordinatePattern.lastIndex = 0;
  for (const coordinate of text.matchAll(coordinatePattern)) {
    const coordinateFrom = coordinate.index;
    const coordinateTo = coordinateFrom + coordinate[0].length;
    if (overlaps({ from: coordinateFrom, to: coordinateTo }, occupied)) continue;
    const fuzzy = fuzzyBookBefore(text, coordinateFrom, canon);
    if (!fuzzy) continue;
    detect(fuzzy.book, fuzzy.from, coordinateFrom, "fuzzy");
  }

  return candidates.sort((left, right) => left.from - right.from);
}
