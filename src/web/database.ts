export type StoreName = "drafts" | "index" | "recoveries" | "preferences" | "cache";

export function storageError(error: unknown): Error {
  if (error instanceof Error && error.name === "QuotaExceededError") {
    return new Error("Browser storage is full. Download your writing, then free storage before saving again.");
  }
  if (error instanceof Error && (error.name === "SecurityError" || error.name === "InvalidStateError")) {
    return new Error("Browser storage is unavailable. Allow site storage or download your writing to keep it.");
  }
  return error instanceof Error ? error : new Error("Browser storage could not complete the operation. Download your writing to keep it.");
}

/** IndexedDB completion, rather than a successful individual request, is the commit boundary. */
export class WebDatabase {
  private opening?: Promise<IDBDatabase>;
  constructor(private readonly name = "verseform.web.v1") {}

  private open(): Promise<IDBDatabase> {
    if (this.opening) return this.opening;
    this.opening = new Promise<IDBDatabase>((resolve, reject) => {
      let finished = false;
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore("drafts");
        db.createObjectStore("index", { keyPath: "path" });
        db.createObjectStore("recoveries", { keyPath: "key" });
        db.createObjectStore("preferences");
        db.createObjectStore("cache", { keyPath: "key" });
      };
      request.onsuccess = () => {
        if (finished) { request.result.close(); return; }
        finished = true;
        request.result.onversionchange = () => { request.result.close(); this.opening = undefined; };
        resolve(request.result);
      };
      request.onerror = () => { finished = true; reject(storageError(request.error)); };
      request.onblocked = () => { finished = true; reject(new Error("Close the other Verseform tabs, then reload to update browser storage.")); };
    }).catch((error: unknown) => { this.opening = undefined; throw storageError(error); });
    return this.opening;
  }

  async transaction<T>(stores: StoreName[], mode: IDBTransactionMode,
    action: (tx: IDBTransaction, result: (value: T) => void, fail: (error: unknown) => void) => void,
  ): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      let value: T;
      let finished = false;
      const tx = db.transaction(stores, mode);
      const fail = (error: unknown) => {
        if (finished) return;
        finished = true;
        try { tx.abort(); } catch { /* Already committed or aborted. */ }
        reject(storageError(error));
      };
      tx.oncomplete = () => { if (!finished) { finished = true; resolve(value!); } };
      tx.onerror = () => fail(tx.error);
      tx.onabort = () => fail(tx.error ?? new Error("The browser canceled the save. Your writing remains open."));
      try { action(tx, (next) => { value = next; }, fail); } catch (error) { fail(error); }
    }).catch((error: unknown) => { throw storageError(error); });
  }

  read<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
    return this.transaction([store], "readonly", (tx, result) => {
      const request = tx.objectStore(store).get(key);
      request.onsuccess = () => result(request.result as T | undefined);
    });
  }

  all<T>(store: StoreName): Promise<T[]> {
    return this.transaction([store], "readonly", (tx, result) => {
      const request = tx.objectStore(store).getAll();
      request.onsuccess = () => result(request.result as T[]);
    });
  }

  put(store: StoreName, value: unknown, key?: IDBValidKey): Promise<void> {
    return this.transaction([store], "readwrite", (tx, result) => { tx.objectStore(store).put(value, key); result(); });
  }
}
