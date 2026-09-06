import { describe, expect, test, vi } from "vitest";
import { WEB_CANON } from "../src/core/canon";
import { contentHash, type EditorNode } from "../src/core/document";
import { WorkspaceController, type WorkspaceHost, type WorkspaceScheduler } from "../src/app/controller";
import type { RecoverySnapshot, RuntimeAdapters, Translation } from "../src/app/ports";
import { DEFAULT_FORMATTING, type EditorGateway, type EditorObservation } from "../src/editor/gateway";

class FakeScheduler implements WorkspaceScheduler {
  private now = 0;
  private nextId = 1;
  private tasks = new Map<number, { at: number; callback: () => void }>();

  schedule(delayMs: number, callback: () => void): number {
    const id = this.nextId++;
    this.tasks.set(id, { at: this.now + delayMs, callback });
    return id;
  }

  cancel(handle: unknown): void {
    this.tasks.delete(handle as number);
  }

  afterPaint(callback: () => void): number {
    return this.schedule(0, callback);
  }

  advanceBy(delayMs: number): void {
    const target = this.now + delayMs;
    while (true) {
      const due = [...this.tasks.entries()]
        .filter(([, task]) => task.at <= target)
        .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
      if (!due) break;
      this.tasks.delete(due[0]);
      this.now = due[1].at;
      due[1].callback();
    }
    this.now = target;
  }
}

const web: Translation = {
  id: "WEB",
  citationLabel: "WEB",
  name: "World English Bible",
  attribution: "Public domain",
  source: "bundled",
  canon: WEB_CANON,
};
const firstContent: EditorNode = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "first" }] }],
};
const latestContent: EditorNode = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "latest" }] }],
};

type HarnessOptions = {
  kind?: RuntimeAdapters["kind"];
  closeWindow?: () => Promise<void>;
  writeRecovery?: (snapshot: RecoverySnapshot) => Promise<void>;
  listRecoveries?: () => Promise<RecoverySnapshot[]>;
  discardRecovery?: (documentId: string) => Promise<void>;
};

function harness(options: HarnessOptions = {}) {
  const scheduler = new FakeScheduler();
  let shortcut: ((stroke: { key: string; ctrl: boolean; meta: boolean; shift: boolean; alt: boolean }) => boolean) | undefined;
  let closeRequested: (() => void) | undefined;
  const diagnostics: unknown[] = [];
  const onBeforeUnload = vi.fn(() => () => undefined);
  const host: WorkspaceHost = {
    onBeforeUnload,
    onKeyStroke: (handler) => { shortcut = handler; return () => { shortcut = undefined; }; },
    promptForLink: () => null,
    publishDiagnostics: (snapshot) => diagnostics.push(snapshot),
  };
  const writeRecovery = vi.fn(options.writeRecovery ?? (async (_snapshot: RecoverySnapshot) => undefined));
  const discardRecovery = vi.fn(options.discardRecovery ?? (async (_documentId: string) => undefined));
  const onCloseRequested = vi.fn(async (handler: () => void) => {
    closeRequested = handler;
    return () => { closeRequested = undefined; };
  });
  const closeWindow = vi.fn(options.closeWindow ?? (async () => undefined));
  const runtime: RuntimeAdapters = {
    kind: options.kind ?? "browser",
    scripture: {
      listTranslations: async () => ({ translations: [web], offline: false }),
      getPassage: async () => { throw new Error("not used"); },
    },
    preferences: {
      getPreferredTranslation: async () => "WEB",
      setPreferredTranslation: async () => undefined,
    },
    documents: {
      openWithDialog: async () => null,
      openRecent: async () => { throw new Error("not used"); },
      save: async () => { throw new Error("not used"); },
      saveAs: async () => null,
      listRecent: async () => [],
      writeRecovery,
      listRecoveries: options.listRecoveries ?? (async () => []),
      discardRecovery,
    },
    output: {
      print: async () => undefined,
      savePdf: async () => null,
    },
    externalLinks: {
      open: async () => undefined,
    },
    window: {
      onCloseRequested,
      setTitle: async () => undefined,
      close: closeWindow,
    },
  };
  let observation: ((value: EditorObservation) => void) | undefined;
  let frozen = firstContent;
  const dispatched: string[] = [];
  const gateway: EditorGateway = {
    subscribe(listener) {
      observation = listener;
      listener({ contentHash: contentHash(frozen), formatting: DEFAULT_FORMATTING, documentChanged: false });
      return () => { observation = undefined; };
    },
    freeze: () => frozen,
    readRange: () => "",
    linkHref: () => "https://",
    dispatch(instruction) { dispatched.push(instruction.type); return; },
    setCanon: () => undefined,
  };
  const controller = new WorkspaceController({
    runtime,
    fallback: web,
    scheduler,
    host,
    now: () => new Date("2026-09-03T12:00:00.000Z"),
  });
  return {
    controller,
    scheduler,
    gateway,
    writeRecovery,
    discardRecovery,
    diagnostics,
    dispatched,
    onBeforeUnload,
    onCloseRequested,
    closeWindow,
    requestClose() {
      if (!closeRequested) throw new Error("The close-request listener is not ready.");
      closeRequested();
    },
    emit(value: EditorObservation) { observation?.(value); },
    freeze(value: EditorNode) { frozen = value; },
    shortcut(value: { key: string; ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean }) {
      return shortcut?.({ ctrl: false, meta: false, shift: false, alt: false, ...value });
    },
  };
}

describe("workspace controller", () => {
  test("desktop close requests use the native dirty gate without a competing browser unload block", async () => {
    const desktop = harness({ kind: "tauri" });
    desktop.controller.start();
    desktop.controller.attachEditor(desktop.gateway);
    await vi.waitFor(() => expect(desktop.onCloseRequested).toHaveBeenCalledTimes(1));
    expect(desktop.onBeforeUnload).not.toHaveBeenCalled();

    desktop.freeze(latestContent);
    desktop.emit({
      contentHash: contentHash(latestContent),
      formatting: DEFAULT_FORMATTING,
      documentChanged: true,
    });
    desktop.requestClose();
    expect(desktop.controller.getState().overlay).toEqual({ type: "confirm", action: { type: "close" } });
    expect(desktop.closeWindow).not.toHaveBeenCalled();

    desktop.controller.resolveConfirmation("discard");
    await vi.waitFor(() => expect(desktop.closeWindow).toHaveBeenCalledTimes(1));
    desktop.controller.destroy();

    const browser = harness();
    browser.controller.start();
    expect(browser.onBeforeUnload).toHaveBeenCalledTimes(1);
    browser.controller.destroy();
  });

  test("a rejected native destroy stays recoverable and reports the close failure", async () => {
    const desktop = harness({
      kind: "tauri",
      closeWindow: async () => { throw new Error("destroy permission denied"); },
    });
    desktop.controller.start();
    desktop.controller.attachEditor(desktop.gateway);
    await vi.waitFor(() => expect(desktop.onCloseRequested).toHaveBeenCalledTimes(1));

    desktop.freeze(latestContent);
    desktop.emit({
      contentHash: contentHash(latestContent),
      formatting: DEFAULT_FORMATTING,
      documentChanged: true,
    });
    desktop.requestClose();
    expect(desktop.controller.getState().overlay.type).toBe("confirm");
    desktop.controller.resolveConfirmation("discard");
    await vi.waitFor(() => expect(desktop.closeWindow).toHaveBeenCalledTimes(1));
    expect(desktop.controller.getState().notice.message)
      .toBe("Verseform could not close: destroy permission denied");
    expect(desktop.controller.getState().document.currentHash)
      .not.toBe(desktop.controller.getState().document.savedHash);
    desktop.controller.destroy();
  });

  test("the fake scheduler cancels superseded recovery work and freezes only the latest editor state", async () => {
    const testHarness = harness();
    testHarness.controller.start();
    testHarness.controller.attachEditor(testHarness.gateway);
    testHarness.emit({ contentHash: contentHash(firstContent), formatting: DEFAULT_FORMATTING, documentChanged: true });
    testHarness.freeze(latestContent);
    testHarness.emit({ contentHash: contentHash(latestContent), formatting: DEFAULT_FORMATTING, documentChanged: true });

    testHarness.scheduler.advanceBy(249);
    expect(testHarness.writeRecovery).not.toHaveBeenCalled();
    testHarness.scheduler.advanceBy(1);
    await vi.waitFor(() => expect(testHarness.writeRecovery).toHaveBeenCalledTimes(1));
    expect(testHarness.writeRecovery.mock.calls[0][0]).toEqual(expect.objectContaining({
      contentHash: contentHash(latestContent),
      capturedAtMs: new Date("2026-09-03T12:00:00.000Z").getTime(),
    }));
    expect(testHarness.writeRecovery.mock.calls[0][0].document.content).toEqual(latestContent);
    testHarness.controller.destroy();
  });

  test("global shortcuts use the command registry and diagnostics contain no document payload", async () => {
    const testHarness = harness();
    testHarness.controller.start();
    testHarness.controller.attachEditor(testHarness.gateway);
    expect(testHarness.shortcut({ key: "f", ctrl: true })).toBe(true);
    expect(testHarness.controller.getState().overlay.type).toBe("find");
    expect(testHarness.dispatched).toContain("find.set");

    const latest = testHarness.diagnostics.at(-1);
    expect(latest).toEqual(expect.objectContaining({ translationId: "WEB" }));
    expect(JSON.stringify(latest)).not.toContain("first");
    expect(JSON.stringify(latest)).not.toContain("latest");
    await Promise.resolve();
    testHarness.controller.destroy();
  });

  test("recovery cleanup waits for an older write for the same document", async () => {
    let releaseWrite!: () => void;
    const writeGate = new Promise<void>((resolve) => { releaseWrite = resolve; });
    const order: string[] = [];
    const recovered: RecoverySnapshot = {
      document: {
        format: "verseform",
        schemaVersion: 2,
        title: "Recovered draft",
        documentId: "recovered-document",
        createdAt: "2026-09-03T11:00:00.000Z",
        updatedAt: "2026-09-03T11:30:00.000Z",
        content: firstContent,
      },
      contentHash: contentHash(firstContent),
      savedContentHash: contentHash({ type: "doc", content: [{ type: "paragraph" }] }),
      capturedAtMs: new Date("2026-09-03T11:30:00.000Z").getTime(),
    };
    const testHarness = harness({
      listRecoveries: async () => [recovered],
      writeRecovery: async () => {
        order.push("write:start");
        await writeGate;
        order.push("write:end");
      },
      discardRecovery: async () => { order.push("discard"); },
    });
    testHarness.controller.start();
    testHarness.controller.attachEditor(testHarness.gateway);
    await vi.waitFor(() => expect(testHarness.controller.getState().library.recoveries).toEqual([recovered]));
    testHarness.freeze(latestContent);
    testHarness.emit({
      contentHash: contentHash(latestContent),
      formatting: DEFAULT_FORMATTING,
      documentChanged: true,
    });
    testHarness.scheduler.advanceBy(250);
    await vi.waitFor(() => expect(testHarness.writeRecovery).toHaveBeenCalledTimes(1));
    const currentDocumentId = testHarness.writeRecovery.mock.calls[0][0].document.documentId;

    testHarness.controller.restoreRecovery();
    expect(testHarness.controller.getState().overlay.type).toBe("confirm");
    testHarness.controller.resolveConfirmation("discard");
    expect(testHarness.controller.getState().document.identity?.documentId).toBe("recovered-document");
    expect(testHarness.discardRecovery).not.toHaveBeenCalled();
    expect(order).toEqual(["write:start"]);

    releaseWrite();
    await vi.waitFor(() => expect(testHarness.discardRecovery).toHaveBeenCalledWith(currentDocumentId));
    expect(order).toEqual(["write:start", "write:end", "discard"]);
    testHarness.controller.destroy();
  });
});
