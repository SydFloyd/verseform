import { afterEach, expect, test, vi } from "vitest";
import { WebDatabase } from "../src/web/database";
import { WebDbsTransport } from "../src/web/scripture";
import { DBS_CHAPTER_LIMIT } from "../src/adapters/dbsScriptureProvider";

function setup() {
  const db = new WebDatabase();
  vi.spyOn(db, "read").mockResolvedValue(undefined);
  vi.spyOn(db, "transaction").mockRejectedValue(new Error("Cache unavailable"));
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  vi.stubGlobal("navigator", { onLine: true });
  return { db, transport: new WebDbsTransport(db) };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test("web transport rejects invalid coordinates and bounds streamed bytes before parsing or caching", async () => {
  const { db, transport } = setup();
  const fetch = vi.fn().mockImplementation(async () => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(DBS_CHAPTER_LIMIT));
    controller.enqueue(new Uint8Array(1));
    controller.close();
  } })));
  vi.stubGlobal("fetch", fetch);
  await expect(transport.getChapter("../secret", "JHN", 3)).rejects.toThrow("Invalid scripture coordinates");
  expect(fetch).not.toHaveBeenCalled();
  await expect(transport.getChapter("ENGNASB", "JHN", 3)).rejects.toThrow("size limit");
  expect(db.transaction).not.toHaveBeenCalled();
});

test("caller cancellation never returns a stale cached passage", async () => {
  const { db, transport } = setup();
  vi.mocked(db.read).mockResolvedValue({ key: "ENGNASB/JHN/3", body: '[{"JN3.16":"Cached text"}]', fetchedAtMs: 0, bytes: 35 });
  const abort = new AbortController();
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_url, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal!.addEventListener("abort", () => reject(options.signal!.reason));
    abort.abort(new DOMException("Canceled", "AbortError"));
  })));
  await expect(transport.getChapter("ENGNASB", "JHN", 3, abort.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(db.transaction).not.toHaveBeenCalled();
});

test("validated stale data survives service failure and cache failure cannot suppress valid online text", async () => {
  const { db, transport } = setup();
  const body = '[{"JN3.16":"Cached text"}]';
  vi.mocked(db.read).mockResolvedValue({ key: "ENGNASB/JHN/3", body, fetchedAtMs: 0, bytes: body.length });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));
  await expect(transport.getChapter("ENGNASB", "JHN", 3)).resolves.toEqual({ body, cached: true, stale: true });
  vi.mocked(db.read).mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
  await expect(transport.getChapter("ENGNASB", "JHN", 3)).resolves.toEqual({ body });
});
