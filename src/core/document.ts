export const CURRENT_SCHEMA_VERSION = 2 as const;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_TEXT_CHARACTERS = 1_000_000;
export const MAX_DOCUMENT_NODES = 50_000;
export const MAX_DOCUMENT_DEPTH = 64;

export type EditorMark = {
  type: string;
  attrs?: Record<string, unknown>;
};

export type EditorNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: EditorNode[];
  marks?: EditorMark[];
  text?: string;
};

type VerseformDocumentV1 = {
  format: "verseform";
  schemaVersion: 1;
  documentId: string;
  createdAt: string;
  updatedAt: string;
  content: EditorNode;
};

export type VerseformDocument = {
  format: "verseform";
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  title: string;
  documentId: string;
  createdAt: string;
  updatedAt: string;
  content: EditorNode;
};

export type DocumentIdentity = Pick<VerseformDocument, "title" | "documentId" | "createdAt">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEditorNode(value: unknown): value is EditorNode {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 1 }];
  let nodeCount = 0;
  let textCharacters = 0;

  while (pending.length) {
    const current = pending.pop()!;
    if (current.depth > MAX_DOCUMENT_DEPTH || !isRecord(current.value)) return false;
    if (typeof current.value.type !== "string") return false;
    if (++nodeCount > MAX_DOCUMENT_NODES) return false;
    if (current.value.type === "text" && typeof current.value.text !== "string") return false;
    if (current.value.text !== undefined) {
      if (typeof current.value.text !== "string") return false;
      textCharacters += current.value.text.length;
      if (textCharacters > MAX_DOCUMENT_TEXT_CHARACTERS) return false;
    }
    if (current.value.attrs !== undefined && !isRecord(current.value.attrs)) return false;
    if (current.value.content !== undefined) {
      if (!Array.isArray(current.value.content)) return false;
      for (let index = current.value.content.length - 1; index >= 0; index -= 1) {
        pending.push({ value: current.value.content[index], depth: current.depth + 1 });
      }
    }
    if (
      current.value.marks !== undefined &&
      (!Array.isArray(current.value.marks) ||
        !current.value.marks.every(
          (mark) =>
            isRecord(mark) &&
            typeof mark.type === "string" &&
            (mark.attrs === undefined || isRecord(mark.attrs)),
        ))
    ) return false;
  }
  return true;
}

function hasEnvelopeFields(value: Record<string, unknown>): boolean {
  return (
    value.format === "verseform" &&
    typeof value.documentId === "string" &&
    value.documentId.trim().length > 0 &&
    typeof value.createdAt === "string" &&
    !Number.isNaN(Date.parse(value.createdAt)) &&
    typeof value.updatedAt === "string" &&
    !Number.isNaN(Date.parse(value.updatedAt)) &&
    isEditorNode(value.content) &&
    value.content.type === "doc"
  );
}

function isVerseformDocumentV1(value: unknown): value is VerseformDocumentV1 {
  return isRecord(value) && value.schemaVersion === 1 && hasEnvelopeFields(value);
}

export function isVerseformDocument(value: unknown): value is VerseformDocument {
  return (
    isRecord(value) &&
    value.schemaVersion === CURRENT_SCHEMA_VERSION &&
    typeof value.title === "string" &&
    value.title.trim().length > 0 &&
    hasEnvelopeFields(value)
  );
}

export function migrateVerseformDocument(value: unknown): VerseformDocument {
  if (isVerseformDocument(value)) return value;
  if (isVerseformDocumentV1(value)) {
    return {
      ...value,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      title: "Untitled",
    };
  }
  if (
    isRecord(value) &&
    value.format === "verseform" &&
    typeof value.schemaVersion === "number" &&
    value.schemaVersion > CURRENT_SCHEMA_VERSION
  ) {
    throw new Error(
      `This document was created by a newer Verseform version (schema ${value.schemaVersion}).`,
    );
  }
  throw new Error("This is not a supported Verseform document.");
}

export function parseVerseformDocument(serialized: string): VerseformDocument {
  if (new TextEncoder().encode(serialized).byteLength > MAX_DOCUMENT_BYTES) {
    throw new Error("This document exceeds Verseform's 10 MiB limit.");
  }
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error("This is not valid JSON.");
  }
  return migrateVerseformDocument(value);
}

export function createVerseformDocument(
  content: EditorNode,
  previous?: DocumentIdentity,
  now = new Date(),
): VerseformDocument {
  if (!isEditorNode(content) || content.type !== "doc") {
    throw new Error("The document exceeds Verseform's supported size or structure limits.");
  }
  const timestamp = now.toISOString();
  return {
    format: "verseform",
    schemaVersion: CURRENT_SCHEMA_VERSION,
    title: previous?.title ?? "Untitled",
    documentId: previous?.documentId ?? crypto.randomUUID(),
    createdAt: previous?.createdAt ?? timestamp,
    updatedAt: timestamp,
    content,
  };
}

export function serializeVerseformDocument(document: VerseformDocument): string {
  if (!isVerseformDocument(document)) {
    throw new Error("Refusing to serialize an invalid Verseform document.");
  }
  const serialized = `${JSON.stringify(document, null, 2)}\n`;
  if (new TextEncoder().encode(serialized).byteLength > MAX_DOCUMENT_BYTES) {
    throw new Error("This document exceeds Verseform's 10 MiB limit.");
  }
  return serialized;
}

export function contentHash(content: EditorNode): string {
  const source = JSON.stringify(content);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
