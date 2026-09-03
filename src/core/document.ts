export const CURRENT_SCHEMA_VERSION = 2 as const;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEditorNode(value: unknown): value is EditorNode {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (value.text !== undefined && typeof value.text !== "string") return false;
  if (value.attrs !== undefined && !isRecord(value.attrs)) return false;
  if (
    value.content !== undefined &&
    (!Array.isArray(value.content) || !value.content.every(isEditorNode))
  ) {
    return false;
  }
  if (
    value.marks !== undefined &&
    (!Array.isArray(value.marks) ||
      !value.marks.every(
        (mark) =>
          isRecord(mark) &&
          typeof mark.type === "string" &&
          (mark.attrs === undefined || isRecord(mark.attrs)),
      ))
  ) {
    return false;
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
  previous?: VerseformDocument,
  now = new Date(),
): VerseformDocument {
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
  return `${JSON.stringify(document, null, 2)}\n`;
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
