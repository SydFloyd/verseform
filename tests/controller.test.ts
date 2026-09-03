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

function harness() {
  const scheduler = new FakeScheduler();
  let shortcut: ((stroke: { key: string; ctrl: boolean; meta: boolean; shift: boolean; alt: boolean }) => boolean) | undefined;
  const diagnostics: unknown[] = [];
  const host: WorkspaceHost = {
    onBeforeUnload: () => () => undefined,
    onKeyStroke: (handler) => { shortcut = handler; return () => { shortcut = undefined; }; },
    promptForLink: () => null,
    publishDiagnostics: (snapshot) => diagnostics.push(snapshot),
  };
  const writeRecovery = vi.fn(async (_snapshot: RecoverySnapshot) => undefined);
  const runtime: RuntimeAdapters = {
    kind: "browser",
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
      listRecoveries: async () => [],
      discardRecovery: async () => undefined,
    },
    output: {
      print: async () => undefined,
      savePdf: async () => null,
    },
    externalLinks: {
      open: async () => undefined,
    },
    window: {
      onCloseRequested: async () => () => undefined,
      setTitle: async () => undefined,
      close: async () => undefined,
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
    diagnostics,
    dispatched,
    emit(value: EditorObservation) { observation?.(value); },
    freeze(value: EditorNode) { frozen = value; },
    shortcut(value: { key: string; ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean }) {
      return shortcut?.({ ctrl: false, meta: false, shift: false, alt: false, ...value });
    },
  };
}

describe("workspace controller", () => {
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
});
