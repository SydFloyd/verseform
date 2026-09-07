import { DBS_BOOK_IDS, DBS_CATALOG_LIMIT, DBS_CHAPTER_LIMIT, parseDbsCatalog, parseDbsChapter, type DbsTransport, type DbsTransportResponse } from "../adapters/dbsScriptureProvider";
import { WebDatabase } from "./database";

const endpoint = "https://arc.dbs.org/api/bible-text/";
const day = 86_400_000;
type CachedResponse = { key: string; body: string; fetchedAtMs: number; bytes: number };

export class WebDbsTransport implements DbsTransport {
  constructor(private readonly db: WebDatabase) {}

  getCatalog(signal?: AbortSignal): Promise<DbsTransportResponse> {
    return this.get("catalog", endpoint, DBS_CATALOG_LIMIT, day, (body) => { parseDbsCatalog(body); }, signal);
  }

  getChapter(translationId: string, bookId: string, chapter: number, signal?: AbortSignal): Promise<DbsTransportResponse> {
    if (!/^[A-Za-z0-9_-]{1,64}$/u.test(translationId) || !/^[1-3]?[A-Z]{2,3}$/u.test(bookId) || !Number.isInteger(chapter) || chapter < 1 || chapter > 150) {
      return Promise.reject(new Error("Invalid scripture coordinates."));
    }
    return this.get(`${translationId}/${bookId}/${chapter}`, `${endpoint}${translationId}/${bookId}/${chapter}`,
      DBS_CHAPTER_LIMIT, 7 * day, (body) => {
        const responseBookId = DBS_BOOK_IDS[bookId];
        if (!responseBookId) throw new Error("Invalid scripture coordinates.");
        parseDbsChapter(body, chapter, responseBookId);
      }, signal);
  }

  private async get(key: string, url: string, limit: number, ttl: number, validate: (body: string) => void, signal?: AbortSignal): Promise<DbsTransportResponse> {
    signal?.throwIfAborted();
    let cached = await this.db.read<CachedResponse>("cache", key).catch(() => undefined);
    signal?.throwIfAborted();
    if (cached) {
      try {
        if (cached.key !== key || !Number.isFinite(cached.fetchedAtMs)) throw new Error("Invalid cache metadata.");
        validate(cached.body);
      } catch { cached = undefined; }
    }
    if (cached && (!navigator.onLine || (Date.now() >= cached.fetchedAtMs && Date.now() - cached.fetchedAtMs < ttl))) {
      return { body: cached.body, cached: true, stale: !navigator.onLine };
    }
    if (!navigator.onLine) throw new Error("DBS is unavailable offline. Bundled WEB remains available.");
    const abort = new AbortController();
    const cancel = () => abort.abort(signal?.reason);
    signal?.addEventListener("abort", cancel, { once: true });
    const timer = window.setTimeout(() => abort.abort(new Error("The scripture request timed out.")), 12_000);
    try {
      const response = await fetch(url, { signal: abort.signal, credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`DBS returned HTTP ${response.status}.`);
      if (Number(response.headers.get("content-length")) > limit) throw new Error("The scripture response exceeded its size limit.");
      if (!response.body) throw new Error("DBS returned an empty response.");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          bytes += next.value.byteLength;
          if (bytes > limit) { await reader.cancel(); throw new Error("The scripture response exceeded its size limit."); }
          chunks.push(next.value);
        }
      } finally { reader.releaseLock(); }
      const buffer = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
      const body = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      validate(body);
      signal?.throwIfAborted();
      await this.cache({ key, body, fetchedAtMs: Date.now(), bytes }).catch(() => undefined);
      signal?.throwIfAborted();
      return { body };
    } catch (error) {
      signal?.throwIfAborted();
      if (cached) return { body: cached.body, cached: true, stale: true };
      throw error;
    } finally {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    }
  }

  private cache(entry: CachedResponse): Promise<void> {
    return this.db.transaction(["cache"], "readwrite", (tx, result) => {
      const store = tx.objectStore("cache");
      store.put(entry);
      const request = store.getAll();
      request.onsuccess = () => {
        const chapters = (request.result as CachedResponse[]).filter((item) => item.key !== "catalog").sort((a, b) => b.fetchedAtMs - a.fetchedAtMs);
        let total = 0;
        chapters.forEach((item, index) => { total += item.bytes; if (index >= 192 || total > 32 * 1024 * 1024) store.delete(item.key); });
        result();
      };
    });
  }
}
