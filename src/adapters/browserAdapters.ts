import type {
  DocumentStore, ExternalLinkAdapter, OutputAdapter, PreferenceStore, RecentDocument, RecoverySnapshot, RuntimeAdapters, WindowAdapter,
} from "../app/ports";
import { CREDIT_LINK_URLS, type CreditLinkId } from "../app/credits";
import {
  parseVerseformDocument, serializeVerseformDocument, type VerseformDocument,
} from "../core/document";
import type { PrintSnapshot } from "../core/output";
import type { DbsTransport, DbsTransportResponse } from "./dbsScriptureProvider";
import { DbsScriptureProvider } from "./dbsScriptureProvider";
import { CompositeScriptureProvider } from "./scriptureProvider";
import { WebScriptureProvider } from "./webScriptureProvider";

const documentPrefix = "verseform.browser.document.";
const recentKey = "verseform.browser.recent";
const recoveryPrefix = "verseform.browser.recovery.";
const preferredTranslationKey = "verseform.preferredTranslation";
const dbsCachePrefix = "verseform.browser.dbs-cache.";

function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Passage request cancelled.", "AbortError"));
      return;
    }
    const timer = window.setTimeout(resolve, delayMs);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Passage request cancelled.", "AbortError"));
    }, { once: true });
  });
}

class BrowserDbsTransport implements DbsTransport {
  private readonly mode = new URLSearchParams(window.location.search).get("dbs") ?? "online";

  constructor(private readonly delayMs: number) {}

  async getCatalog(signal?: AbortSignal): Promise<DbsTransportResponse> {
    if (signal?.aborted) throw new DOMException("Catalog request cancelled.", "AbortError");
    window.dispatchEvent(new CustomEvent("verseform:catalog-request"));
    if (this.mode === "offline") throw new Error("DBS is unavailable while this device is offline.");
    const translations = [
      {
        abbr: "ENGNASB",
        title: this.mode === "untrusted-metadata"
          ? "NASB <img data-provider-markup src=x onerror=alert(1)>"
          : "New American Standard Bible",
        title_vernacular: "New American Standard Bible",
        iso: "eng", script: "Latn", year: "1995",
        copyright: this.mode === "untrusted-metadata"
          ? "<script data-provider-markup>alert('untrusted')</script>"
          : "NASB browser fixture — not production scripture.",
      },
      {
        abbr: "ENGTEST", title: "DBS Test Bible", title_vernacular: "DBS Test Bible",
        iso: "eng", script: "Latn", year: "2026", copyright: "DBS test fixture — not production scripture.",
      },
    ];
    return { body: JSON.stringify(translations) };
  }

  async getChapter(
    translationId: string,
    bookId: string,
    chapter: number,
    signal?: AbortSignal,
  ): Promise<DbsTransportResponse> {
    window.dispatchEvent(new CustomEvent("verseform:fake-provider-request"));
    const cacheKey = `${dbsCachePrefix}${translationId}.${bookId}.${chapter}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) return { body: cached, cached: true };
    await wait(this.delayMs, signal);
    if (this.mode === "chapter-failure") throw new Error("DBS is unavailable while this device is offline.");
    if (this.mode === "malformed") return { body: "{not-json" };
    window.dispatchEvent(new CustomEvent("verseform:dbs-network-request"));
    const prefix = bookId === "JHN" ? "JN" : bookId;
    const body = JSON.stringify(Array.from({ length: 200 }, (_, index) => ({
      [`${prefix}${chapter}.${index + 1}`]: `DBS test verse ${index + 1} for ${bookId}.`,
    })));
    localStorage.setItem(cacheKey, body);
    return { body };
  }
}

class BrowserPreferenceStore implements PreferenceStore {
  async getPreferredTranslation() { return localStorage.getItem(preferredTranslationKey) ?? undefined; }
  async setPreferredTranslation(translationId: string) {
    localStorage.setItem(preferredTranslationKey, translationId);
  }
}

function readRecent(): RecentDocument[] {
  try {
    const value = JSON.parse(localStorage.getItem(recentKey) ?? "[]") as unknown;
    return Array.isArray(value) ? value as RecentDocument[] : [];
  } catch { return []; }
}

function recordRecent(saved: { path: string; displayName: string }): void {
  localStorage.setItem(recentKey, JSON.stringify([
    { ...saved, lastOpenedAtMs: Date.now() },
    ...readRecent().filter((item) => item.path !== saved.path),
  ].slice(0, 10)));
}

function storageKey(path: string): string {
  return `${documentPrefix}${encodeURIComponent(path)}`;
}

class BrowserDocumentStore implements DocumentStore {
  private readonly saveMode = new URLSearchParams(window.location.search).get("save");

  async saveAs(document: VerseformDocument, suggestedName: string) {
    if (this.saveMode === "error") throw new Error("The destination is full or unavailable.");
    const name = suggestedName.toLowerCase().endsWith(".verseform")
      ? suggestedName : `${suggestedName}.verseform`;
    const saved = { path: `browser://documents/${document.documentId}.verseform`, displayName: name };
    localStorage.setItem(storageKey(saved.path), serializeVerseformDocument(document));
    recordRecent(saved);
    return saved;
  }

  async save(path: string, document: VerseformDocument) {
    if (this.saveMode === "error") throw new Error("The destination is full or unavailable.");
    const recent = readRecent().find((item) => item.path === path);
    if (!path.startsWith("browser://documents/") || !recent) {
      throw new Error("The browser harness refused an ungranted document path.");
    }
    const saved = { path, displayName: recent.displayName };
    localStorage.setItem(storageKey(path), serializeVerseformDocument(document));
    recordRecent(saved);
    return saved;
  }

  async openWithDialog() {
    const recent = readRecent()[0];
    return recent ? this.openRecent(recent.path) : null;
  }

  async openRecent(path: string) {
    const recent = readRecent().find((item) => item.path === path);
    if (!recent) throw new Error("That recent document is no longer available.");
    const serialized = localStorage.getItem(storageKey(path));
    if (!serialized) throw new Error("That recent document is no longer available.");
    const document = parseVerseformDocument(serialized);
    recordRecent(recent);
    return { document, path, displayName: recent.displayName };
  }

  async listRecent() {
    return readRecent().filter((item) => localStorage.getItem(storageKey(item.path)) !== null);
  }

  async writeRecovery(snapshot: RecoverySnapshot) {
    localStorage.setItem(`${recoveryPrefix}${snapshot.document.documentId}`, JSON.stringify(snapshot));
  }

  async listRecoveries() {
    const recoveries: RecoverySnapshot[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(recoveryPrefix)) continue;
      try {
        const value = JSON.parse(localStorage.getItem(key) ?? "null") as RecoverySnapshot;
        const document = parseVerseformDocument(JSON.stringify(value.document));
        if (value.sourcePath) {
          const savedValue = localStorage.getItem(storageKey(value.sourcePath));
          if (savedValue) {
            const saved = parseVerseformDocument(savedValue);
            if (saved.documentId === document.documentId && saved.updatedAt >= document.updatedAt) continue;
          }
        }
        recoveries.push({ ...value, document });
      } catch { /* A corrupt recovery entry is isolated. */ }
    }
    return recoveries.sort((left, right) => right.capturedAtMs - left.capturedAtMs);
  }

  async discardRecovery(documentId: string) {
    localStorage.removeItem(`${recoveryPrefix}${documentId}`);
  }
}

class BrowserOutputAdapter implements OutputAdapter {
  async print(_snapshot: PrintSnapshot): Promise<void> {}
  async savePdf(snapshot: PrintSnapshot, suggestedName: string) {
    const mode = new URLSearchParams(window.location.search).get("pdf");
    if (mode === "cancel") return null;
    if (mode === "error") throw new Error("The selected PDF destination is not writable.");
    window.dispatchEvent(new CustomEvent("verseform:pdf-export", { detail: snapshot }));
    const displayName = suggestedName.toLowerCase().endsWith(".pdf")
      ? suggestedName : `${suggestedName}.pdf`;
    return { path: `browser://pdf/${encodeURIComponent(displayName)}`, displayName };
  }
}

class BrowserWindowAdapter implements WindowAdapter {
  async onCloseRequested(_handler: () => void) { return () => undefined; }
  async setTitle(title: string) { document.title = title; }
  async close() {}
}

class BrowserExternalLinkAdapter implements ExternalLinkAdapter {
  async open(target: CreditLinkId): Promise<void> {
    window.dispatchEvent(new CustomEvent("verseform:external-link", {
      detail: Object.freeze({ target, url: CREDIT_LINK_URLS[target] }),
    }));
  }
}

export function createBrowserAdapters(delayMs: number): RuntimeAdapters {
  const web = new WebScriptureProvider({
    delayMs,
    onLookup: () => window.dispatchEvent(new CustomEvent("verseform:fake-provider-request")),
  });
  const dbs = new DbsScriptureProvider(new BrowserDbsTransport(delayMs));
  return {
    scripture: new CompositeScriptureProvider(web, dbs),
    preferences: new BrowserPreferenceStore(), documents: new BrowserDocumentStore(),
    output: new BrowserOutputAdapter(), externalLinks: new BrowserExternalLinkAdapter(),
    window: new BrowserWindowAdapter(), kind: "browser",
  };
}
