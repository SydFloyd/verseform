import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  DocumentStore, OpenedDocument, OutputAdapter, PreferenceStore, RecentDocument, RecoverySnapshot,
  RuntimeAdapters, SavedDocument, WindowAdapter,
} from "../app/ports";
import { migrateVerseformDocument, type VerseformDocument } from "../core/document";
import type { PrintSnapshot } from "../core/output";
import type { DbsTransport, DbsTransportResponse } from "./dbsScriptureProvider";
import { DbsScriptureProvider } from "./dbsScriptureProvider";
import { CompositeScriptureProvider } from "./scriptureProvider";
import { WebScriptureProvider } from "./webScriptureProvider";

function abortable<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending;
  if (signal.aborted) return Promise.reject(new DOMException("DBS request cancelled.", "AbortError"));
  return new Promise((resolve, reject) => {
    const cancel = () => reject(new DOMException("DBS request cancelled.", "AbortError"));
    signal.addEventListener("abort", cancel, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", cancel));
  });
}

class TauriDbsTransport implements DbsTransport {
  getCatalog(signal?: AbortSignal) {
    return abortable(invoke<DbsTransportResponse>("dbs_get_catalog"), signal);
  }
  getChapter(translationId: string, bookId: string, chapter: number, signal?: AbortSignal) {
    return abortable(
      invoke<DbsTransportResponse>("dbs_get_chapter", { translationId, bookId, chapter }),
      signal,
    );
  }
}

class TauriPreferenceStore implements PreferenceStore {
  getPreferredTranslation() { return invoke<string | null>("get_preferred_translation").then((value) => value ?? undefined); }
  async setPreferredTranslation(translationId: string) {
    await invoke("set_preferred_translation", { translationId });
  }
}

function opened(value: Omit<OpenedDocument, "document"> & { document: unknown }): OpenedDocument {
  return { ...value, document: migrateVerseformDocument(value.document) };
}

class TauriDocumentStore implements DocumentStore {
  async openWithDialog() {
    const value = await invoke<(Omit<OpenedDocument, "document"> & { document: unknown }) | null>("open_document_dialog");
    return value ? opened(value) : null;
  }
  async openRecent(path: string) { return opened(await invoke("open_recent_document", { path })); }
  async save(path: string, document: VerseformDocument) {
    return invoke<SavedDocument>("save_document_path", { path, document });
  }
  async saveAs(document: VerseformDocument, suggestedName: string) {
    return invoke<SavedDocument | null>("save_document_as_dialog", { document, suggestedName });
  }
  async listRecent() { return invoke<RecentDocument[]>("list_recent_documents"); }
  async writeRecovery(snapshot: RecoverySnapshot) { await invoke("write_recovery", { snapshot }); }
  async listRecoveries() {
    const values = await invoke<Array<Omit<RecoverySnapshot, "document"> & { document: unknown }>>("list_recoveries");
    return values.map((value) => ({ ...value, document: migrateVerseformDocument(value.document) }));
  }
  async discardRecovery(documentId: string) { await invoke("discard_recovery", { documentId }); }
}

class WebView2OutputAdapter implements OutputAdapter {
  async print(_snapshot: PrintSnapshot): Promise<void> { await invoke("show_print_dialog"); }
}

class TauriWindowAdapter implements WindowAdapter {
  async onCloseRequested(handler: () => void) {
    return getCurrentWindow().onCloseRequested((event) => { event.preventDefault(); handler(); });
  }
  async close() { await getCurrentWindow().destroy(); }
}

export function createTauriAdapters(_delayMs: number): RuntimeAdapters {
  const scripture = new CompositeScriptureProvider(
    new WebScriptureProvider(),
    new DbsScriptureProvider(new TauriDbsTransport()),
  );
  return {
    scripture, preferences: new TauriPreferenceStore(), documents: new TauriDocumentStore(),
    output: new WebView2OutputAdapter(), window: new TauriWindowAdapter(), kind: "tauri",
  };
}
