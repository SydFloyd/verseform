import type { VerseformDocument } from "../core/document";
import type { NormalizedReference } from "../core/reference";
import type { PrintSnapshot } from "../core/output";
import type { CanonMetadata } from "../core/canon";

export type Translation = {
  id: string;
  citationLabel: string;
  name: string;
  vernacularName?: string;
  languageCode?: string;
  script?: string;
  year?: string;
  copyright?: string;
  attribution: string;
  source: "bundled" | "dbs" | "fake";
  canon: CanonMetadata;
};

export type TranslationCatalog = {
  translations: Translation[];
  offline: boolean;
  message?: string;
};

export type Passage = {
  reference: NormalizedReference;
  display: string;
  translationId: string;
  citationLabel: string;
  translationName: string;
  attribution: string;
  text: string;
  cached?: boolean;
  fallbackFrom?: { id: string; name: string };
};

export interface ScriptureProvider {
  listTranslations(signal?: AbortSignal): Promise<TranslationCatalog>;
  getPassage(
    reference: NormalizedReference,
    translationId: string,
    signal?: AbortSignal,
  ): Promise<Passage>;
}

export interface PreferenceStore {
  getPreferredTranslation(): Promise<string | undefined>;
  setPreferredTranslation(translationId: string): Promise<void>;
}

export interface DocumentStore {
  openWithDialog(): Promise<OpenedDocument | null>;
  openRecent(path: string): Promise<OpenedDocument>;
  save(path: string, document: VerseformDocument): Promise<SavedDocument>;
  saveAs(document: VerseformDocument, suggestedName: string): Promise<SavedDocument | null>;
  listRecent(): Promise<RecentDocument[]>;
  writeRecovery(snapshot: RecoverySnapshot): Promise<void>;
  listRecoveries(): Promise<RecoverySnapshot[]>;
  discardRecovery(documentId: string): Promise<void>;
}

export type OpenedDocument = SavedDocument & { document: VerseformDocument };
export type SavedDocument = { path: string; displayName: string };
export type RecentDocument = SavedDocument & { lastOpenedAtMs: number };
export type RecoverySnapshot = {
  document: VerseformDocument;
  sourcePath?: string;
  savedContentHash?: string;
  contentHash: string;
  capturedAtMs: number;
};

export interface WindowAdapter {
  onCloseRequested(handler: () => void): Promise<() => void>;
  close(): Promise<void>;
}

export interface OutputAdapter {
  print(snapshot: PrintSnapshot): Promise<void>;
}

export type RuntimeAdapters = {
  scripture: ScriptureProvider;
  preferences: PreferenceStore;
  documents: DocumentStore;
  output: OutputAdapter;
  window: WindowAdapter;
  kind: "browser" | "tauri";
};
