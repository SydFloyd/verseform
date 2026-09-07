import type { DocumentStore, OpenedDocument, RecentDocument, RecoverySnapshot, SavedDocument } from "../app/ports";
import { contentHash, MAX_DOCUMENT_BYTES, parseVerseformDocument, serializeVerseformDocument, type VerseformDocument } from "../core/document";
import { WebDatabase } from "./database";

type DraftIndex = RecentDocument & { revision: number; documentId: string; contentHash: string };
type StoredRecovery = RecoverySnapshot & { key: string; session: string };

export function documentFileName(value: string): string {
  const name = value.replace(/\.verseform$/iu, "").replace(/[\u0000-\u001f<>:"/\\|?*]/gu, " ").trim().slice(0, 100);
  return `${name || "Untitled"}.verseform`;
}

export class WebDocumentStore implements DocumentStore {
  private readonly session = crypto.randomUUID();
  private readonly revisions = new Map<string, number>();
  private writes: Promise<unknown> = Promise.resolve();
  constructor(private readonly db: WebDatabase) {}

  private queue<T>(action: () => Promise<T>): Promise<T> {
    const next = this.writes.catch(() => undefined).then(action);
    this.writes = next;
    return next;
  }

  private async write(path: string, document: VerseformDocument, name: string, create: boolean): Promise<SavedDocument> {
    const serialized = serializeVerseformDocument(document);
    const hash = contentHash(document.content);
    const index = await this.db.transaction<DraftIndex>(["drafts", "index", "recoveries"], "readwrite", (tx, result, fail) => {
      const request = tx.objectStore("index").get(path);
      request.onsuccess = () => {
        try {
          const previous = request.result as DraftIndex | undefined;
          if (previous ? create || previous.revision !== this.revisions.get(path) : !create && this.revisions.has(path)) {
            fail(new Error("This draft changed in another tab. Use Save a copy or Download to keep your version.")); return;
          }
          const record: DraftIndex = {
            path, displayName: previous?.displayName ?? documentFileName(name),
            documentId: document.documentId, contentHash: hash,
            revision: (previous?.revision ?? 0) + 1, lastOpenedAtMs: Date.now(),
          };
          tx.objectStore("drafts").put(serialized, path);
          tx.objectStore("index").put(record);
          const cursor = tx.objectStore("recoveries").openCursor();
          cursor.onsuccess = () => {
            const entry = cursor.result;
            if (!entry) return;
            const recovery = entry.value as StoredRecovery;
            if (recovery.document?.documentId === document.documentId && recovery.contentHash === hash) entry.delete();
            entry.continue();
          };
          result(record);
        } catch (error) { fail(error); }
      };
    });
    this.revisions.set(path, index.revision);
    return { path, displayName: index.displayName, identity: { documentId: document.documentId, title: document.title, createdAt: document.createdAt } };
  }

  save(path: string, document: VerseformDocument): Promise<SavedDocument> {
    if (!path.startsWith("draft:") || (!this.revisions.has(path) && path !== `draft:${document.documentId}`)) {
      return Promise.reject(new Error("That draft has not been opened in this tab."));
    }
    return this.queue(() => this.write(path, document, document.title, false));
  }

  async saveAs(document: VerseformDocument, suggestedName: string): Promise<SavedDocument | null> {
    const name = window.prompt("Name this local draft copy", documentFileName(suggestedName).replace(/\.verseform$/u, ""));
    if (name === null) return null;
    const copy = { ...document, documentId: crypto.randomUUID(), title: documentFileName(name).replace(/\.verseform$/u, "") };
    return this.queue(() => this.write(`draft:${copy.documentId}`, copy, name, true));
  }

  async openWithDialog(): Promise<OpenedDocument | null> {
    const file = await new Promise<File | null>((resolve) => {
      const input = window.document.createElement("input");
      input.type = "file";
      input.accept = ".verseform,application/json";
      input.hidden = true;
      const finish = (selected: File | null) => { input.remove(); resolve(selected); };
      input.addEventListener("change", () => finish(input.files?.[0] ?? null), { once: true });
      input.addEventListener("cancel", () => finish(null), { once: true });
      window.document.body.append(input);
      input.click();
    });
    if (!file) return null;
    if (file.size > MAX_DOCUMENT_BYTES) throw new Error("This document exceeds the 10 MiB file limit. Your current writing was kept.");
    const parsed = parseVerseformDocument(await file.text());
    const document = { ...parsed, documentId: crypto.randomUUID(), title: documentFileName(file.name).replace(/\.verseform$/u, "") };
    const saved = await this.queue(() => this.write(`draft:${document.documentId}`, document, file.name, true));
    return { ...saved, document };
  }

  async openRecent(path: string): Promise<OpenedDocument> {
    const opened = await this.db.transaction<{ index: DraftIndex; document: VerseformDocument }>(["drafts", "index"], "readonly", (tx, result, fail) => {
      const meta = tx.objectStore("index").get(path);
      meta.onsuccess = () => {
        if (!meta.result) { fail(new Error("That browser draft is no longer available.")); return; }
        const body = tx.objectStore("drafts").get(path);
        body.onsuccess = () => {
          try { result({ index: meta.result as DraftIndex, document: parseVerseformDocument(body.result as string) }); }
          catch (error) { fail(error); }
        };
      };
    });
    this.revisions.set(path, opened.index.revision);
    return { path, displayName: opened.index.displayName, document: opened.document };
  }

  async listRecent(): Promise<RecentDocument[]> {
    const entries = await this.db.all<DraftIndex>("index");
    return entries.filter((entry) => typeof entry.path === "string" && typeof entry.displayName === "string" && Number.isSafeInteger(entry.revision))
      .sort((a, b) => b.lastOpenedAtMs - a.lastOpenedAtMs)
      .map(({ path, displayName, lastOpenedAtMs }) => ({ path, displayName, lastOpenedAtMs }));
  }

  async writeRecovery(snapshot: RecoverySnapshot): Promise<void> {
    if (snapshot.contentHash === snapshot.savedContentHash) return;
    parseVerseformDocument(serializeVerseformDocument(snapshot.document));
    await this.db.put("recoveries", { ...snapshot, session: this.session, key: `${snapshot.document.documentId}:${this.session}` });
  }

  async listRecoveries(): Promise<RecoverySnapshot[]> {
    const records = await this.db.all<StoredRecovery>("recoveries");
    const result: RecoverySnapshot[] = [];
    for (const entry of records.sort((a, b) => b.capturedAtMs - a.capturedAtMs)) {
      try {
        const document = parseVerseformDocument(JSON.stringify(entry.document));
        if (!Number.isFinite(entry.capturedAtMs) || contentHash(document.content) !== entry.contentHash) continue;
        if (entry.sourcePath) {
          const saved = await this.db.read<DraftIndex>("index", entry.sourcePath);
          if (saved?.contentHash === entry.contentHash) continue;
          if (saved && !this.revisions.has(entry.sourcePath)) this.revisions.set(entry.sourcePath, saved.revision);
        }
        result.push({ document, sourcePath: entry.sourcePath, contentHash: entry.contentHash, savedContentHash: entry.savedContentHash, capturedAtMs: entry.capturedAtMs });
      } catch { /* Isolate a corrupt entry; retain the stored bytes. */ }
    }
    return result;
  }

  discardRecovery(documentId: string, capturedAtMs?: number): Promise<void> {
    return this.db.transaction(["recoveries"], "readwrite", (tx, result) => {
      const request = tx.objectStore("recoveries").openCursor();
      request.onsuccess = () => {
        const entry = request.result;
        if (!entry) { result(); return; }
        const value = entry.value as StoredRecovery;
        if (value.document.documentId === documentId && (capturedAtMs === undefined ? value.session === this.session : value.capturedAtMs === capturedAtMs)) entry.delete();
        entry.continue();
      };
    });
  }

  async download(document: VerseformDocument, suggestedName: string): Promise<void> {
    const blob = new Blob([serializeVerseformDocument(document)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = documentFileName(suggestedName);
    anchor.hidden = true;
    window.document.body.append(anchor);
    try { anchor.click(); } finally {
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  }
}
