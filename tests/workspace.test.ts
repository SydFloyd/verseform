import { describe, expect, test } from "vitest";
import { WEB_CANON } from "../src/core/canon";
import { contentHash, type EditorNode, type VerseformDocument } from "../src/core/document";
import type { Passage, Translation } from "../src/app/ports";
import { commandForKeyStroke, eventForCommand } from "../src/app/commands";
import { selectCommandEnabled, selectDiagnostics, selectDirty, selectViewModel, selectWindowTitle } from "../src/app/selectors";
import {
  COMMAND_IDS,
} from "../src/app/commands";
import {
  createInitialWorkspace,
  transition,
  type OperationStamp,
  type WorkspaceEffect,
  type WorkspaceEvent,
  type WorkspaceState,
} from "../src/app/workspace";
import { DEFAULT_FORMATTING } from "../src/editor/gateway";

const web: Translation = {
  id: "WEB",
  citationLabel: "WEB",
  name: "World English Bible",
  attribution: "Public domain",
  source: "bundled",
  canon: WEB_CANON,
};
const nasb: Translation = {
  id: "ENGNASB",
  citationLabel: "NASB",
  name: "New American Standard Bible",
  attribution: "NASB notice",
  source: "fake",
  canon: WEB_CANON,
};
const testTranslation: Translation = {
  id: "ENGTEST",
  citationLabel: "TEST",
  name: "Test Bible",
  attribution: "Test notice",
  source: "fake",
  canon: WEB_CANON,
};
const content: EditorNode = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "John 3:16 " }] }],
};
const changedContent: EditorNode = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "John 3:16 changed" }] }],
};
const candidate = {
  kind: "valid" as const,
  from: 1,
  to: 10,
  sourceText: "John 3:16",
  display: "John 3:16",
  matchKind: "exact" as const,
  reference: { bookId: "JHN", bookName: "John", chapter: 3, verseStart: 16 },
};
const passage: Passage = {
  reference: candidate.reference,
  display: candidate.display,
  translationId: "ENGTEST",
  citationLabel: "TEST",
  translationName: "Test Bible",
  attribution: "Test notice",
  text: "For God so loved the world.",
};

function initial(): WorkspaceState {
  return createInitialWorkspace("browser", web);
}

function step(state: WorkspaceState, event: WorkspaceEvent) {
  return transition(state, event);
}

function effect<T extends WorkspaceEffect["type"]>(
  effects: WorkspaceEffect[],
  type: T,
): Extract<WorkspaceEffect, { type: T }> {
  return effects.find((item): item is Extract<WorkspaceEffect, { type: T }> => item.type === type)!;
}

function documentFor(stamp: OperationStamp, body = content): VerseformDocument {
  return {
    format: "verseform",
    schemaVersion: 2,
    title: "Untitled",
    documentId: stamp.documentId ?? "document-1",
    createdAt: "2026-09-03T12:00:00.000Z",
    updatedAt: "2026-09-03T12:00:01.000Z",
    content: body,
  };
}

describe("workspace kernel", () => {
  test("startup emits each boundary read once and exposes only redacted diagnostics", () => {
    const started = step(initial(), { type: "app.started" });
    expect(started.effects.map((item) => item.type)).toEqual([
      "library.listRecent",
      "library.listRecoveries",
      "scripture.loadCatalog",
      "window.title",
    ]);
    expect(step(started.state, { type: "app.started" }).effects).toEqual([]);
    const diagnostics = selectDiagnostics(started.state, COMMAND_IDS);
    expect(diagnostics.document).toEqual(expect.objectContaining({ revision: 0, dirty: false }));
    expect(JSON.stringify(diagnostics)).not.toMatch(/path|content|John/i);
  });

  test("an edit derives dirty/title and replaces both persistence timers", () => {
    const ready = step(initial(), { type: "editor.ready" }).state;
    const unchangedSelection = step(ready, {
      type: "editor.observed",
      contentHash: ready.document.currentHash,
      formatting: DEFAULT_FORMATTING,
      documentChanged: false,
    });
    expect(unchangedSelection.state).toBe(ready);
    const edited = step(ready, {
      type: "editor.observed",
      contentHash: contentHash(content),
      formatting: DEFAULT_FORMATTING,
      documentChanged: true,
    });
    expect(selectDirty(edited.state)).toBe(true);
    expect(selectWindowTitle(edited.state)).toContain("Unsaved changes");
    expect(edited.effects.map((item) => item.type)).toEqual([
      "timer.cancel", "timer.cancel", "timer.schedule", "window.title",
    ]);
    expect(edited.state.persistence.recovery?.phase).toBe("scheduled");

    const withPath = {
      ...edited.state,
      document: { ...edited.state.document, path: "browser://documents/one.verseform" },
    };
    const again = step(withPath, {
      type: "editor.observed",
      contentHash: contentHash(changedContent),
      formatting: DEFAULT_FORMATTING,
      documentChanged: true,
    });
    expect(again.effects.filter((item) => item.type === "timer.schedule")).toHaveLength(2);
    expect(again.state.persistence.autosave?.phase).toBe("scheduled");
    const stale = step(again.state, { type: "timer.fired", timer: "recovery", operationId: 1 });
    expect(stale.state).toBe(again.state);
  });

  test("recovery and autosave accept only their owning operations", () => {
    const base = {
      ...initial(),
      document: {
        ...initial().document,
        path: "browser://documents/one.verseform",
        revision: 3,
        currentHash: contentHash(content),
      },
    };
    const queued = step(base, {
      type: "editor.observed",
      contentHash: contentHash(changedContent),
      formatting: DEFAULT_FORMATTING,
      documentChanged: true,
    });
    const recoveryStamp = queued.state.persistence.recovery!.stamp;
    const firing = step(queued.state, { type: "timer.fired", timer: "recovery", operationId: recoveryStamp.id });
    expect(effect(firing.effects, "editor.capture").purpose).toEqual({ type: "recovery" });
    const captured = step(firing.state, {
      type: "editor.captured",
      stamp: recoveryStamp,
      purpose: { type: "recovery" },
      document: documentFor(recoveryStamp, changedContent),
    });
    expect(effect(captured.effects, "document.writeRecovery").snapshot.sourcePath).toContain("browser://");
    const staleResult = step(captured.state, { type: "persistence.recoveryWritten", operationId: recoveryStamp.id + 99 });
    expect(staleResult.state).toBe(captured.state);
  });

  test("explicit save clears the matching edit but a late save keeps newer writing dirty and queued", () => {
    let state = step(initial(), {
      type: "editor.observed",
      contentHash: contentHash(content),
      formatting: DEFAULT_FORMATTING,
      documentChanged: true,
    }).state;
    const saving = step(state, { type: "persistence.saveRequest", forceSaveAs: false });
    const capture = effect(saving.effects, "editor.capture");
    const frozen = documentFor(capture.stamp);
    const writing = step(saving.state, { type: "editor.captured", stamp: capture.stamp, purpose: { type: "save" }, document: frozen });
    expect(effect(writing.effects, "document.saveAs").suggestedName).toBe("Untitled.verseform");

    state = step(writing.state, {
      type: "editor.observed",
      contentHash: contentHash(changedContent),
      formatting: DEFAULT_FORMATTING,
      documentChanged: true,
    }).state;
    const late = step(state, {
      type: "persistence.saved",
      operationId: capture.stamp.id,
      document: frozen,
      saved: { path: "browser://documents/one.verseform", displayName: "Untitled.verseform" },
      autosave: false,
    });
    expect(selectDirty(late.state)).toBe(true);
    expect(late.state.notice.message).toContain("changed while saving");
    expect(late.state.persistence.autosave?.phase).toBe("scheduled");

    const exactBase = step(initial(), {
      type: "editor.observed", contentHash: contentHash(content), formatting: DEFAULT_FORMATTING, documentChanged: true,
    }).state;
    const exactSaving = step(exactBase, { type: "persistence.saveRequest", forceSaveAs: false });
    const exactCapture = effect(exactSaving.effects, "editor.capture");
    const exactDocument = documentFor(exactCapture.stamp);
    const exactWriting = step(exactSaving.state, { type: "editor.captured", stamp: exactCapture.stamp, purpose: { type: "save" }, document: exactDocument });
    const exact = step(exactWriting.state, {
      type: "persistence.saved",
      operationId: exactCapture.stamp.id,
      document: exactDocument,
      saved: { path: "browser://documents/one.verseform", displayName: "One.verseform" },
      autosave: false,
    });
    expect(selectDirty(exact.state)).toBe(false);
    expect(effect(exact.effects, "document.discardRecovery").documentId).toBe("document-1");
  });

  test("new, open, recent, and close share the same dirty confirmation gate", () => {
    const dirty = {
      ...initial(),
      document: { ...initial().document, currentHash: "changed" },
    };
    for (const action of [
      { type: "new" as const },
      { type: "open" as const },
      { type: "recent" as const, path: "browser://one" },
      { type: "close" as const },
    ]) {
      expect(step(dirty, { type: "document.request", action }).state.overlay).toEqual({ type: "confirm", action });
    }
    const cancel = step(step(dirty, { type: "document.request", action: { type: "new" } }).state, {
      type: "document.confirm", choice: "cancel",
    });
    expect(cancel.state.overlay.type).toBe("none");
    expect(cancel.state.document.currentHash).toBe("changed");

    const cleanOpen = step(initial(), { type: "document.request", action: { type: "open" } });
    const openEffect = effect(cleanOpen.effects, "document.open");
    const openedDocument = documentFor(openEffect.stamp);
    const opened = step(cleanOpen.state, {
      type: "document.opened",
      operationId: openEffect.stamp.id,
      opened: { document: openedDocument, path: "browser://one", displayName: "One.verseform" },
      contentHash: contentHash(content),
    });
    expect(opened.state.document.displayName).toBe("One.verseform");
    expect(selectDirty(opened.state)).toBe(false);
    expect(effect(opened.effects, "editor.dispatch").instruction.type).toBe("content.set");
    expect(effect(step(initial(), { type: "document.request", action: { type: "close" } }).effects, "window.close")).toBeTruthy();
  });

  test("catalog choice honors NASB, saved preference, offline WEB, and fallback", () => {
    const started = step(initial(), { type: "app.started" }).state;
    const catalogId = started.scripture.catalogOperationId!;
    const online = step(started, {
      type: "scripture.catalogResult",
      operationId: catalogId,
      catalog: { translations: [web, testTranslation, nasb], offline: false },
    });
    expect(online.state.scripture.selectedId).toBe("ENGNASB");

    const preferredStarted = step(initial(), { type: "app.started" }).state;
    const preferred = step(preferredStarted, {
      type: "scripture.catalogResult",
      operationId: preferredStarted.scripture.catalogOperationId!,
      catalog: { translations: [web, testTranslation, nasb], offline: false },
      preferred: "ENGTEST",
    });
    expect(preferred.state.scripture.selectedId).toBe("ENGTEST");

    const offlineStarted = step(initial(), { type: "app.started" }).state;
    const offline = step(offlineStarted, {
      type: "scripture.catalogResult",
      operationId: offlineStarted.scripture.catalogOperationId!,
      catalog: { translations: [], offline: true, message: "No network" },
    });
    expect(offline.state.scripture).toEqual(expect.objectContaining({ selectedId: "WEB", catalogPhase: "offline" }));

    const hovering = step(preferred.state, { type: "scripture.hover", candidate, top: 12, left: 12 });
    const previewStamp = hovering.state.scripture.previewOperation!.stamp;
    const fallback = step(hovering.state, {
      type: "scripture.previewResult",
      operationId: previewStamp.id,
      passage: { ...passage, translationId: "WEB", translationName: web.name, fallbackFrom: { id: "ENGTEST", name: testTranslation.name } },
    });
    expect(fallback.state.scripture).toEqual(expect.objectContaining({ selectedId: "WEB", catalogPhase: "offline" }));
  });

  test("preview and insertion results are accepted only by the current stamped request", () => {
    const first = step(initial(), { type: "scripture.hover", candidate, top: 12, left: 12 });
    const secondCandidate = { ...candidate, from: 12, to: 21 };
    const second = step(first.state, { type: "scripture.hover", candidate: secondCandidate, top: 20, left: 20 });
    const oldId = first.state.scripture.previewOperation!.stamp.id;
    expect(step(second.state, { type: "scripture.previewResult", operationId: oldId, passage }).state).toBe(second.state);

    const requested = step(initial(), { type: "scripture.insertRequest", candidate });
    const insertionId = requested.state.scripture.insertion!.stamp.id;
    const loaded = step(requested.state, { type: "scripture.insertionResult", operationId: insertionId, passage });
    expect(effect(loaded.effects, "scripture.verifyInsertion").request.revision).toBe(0);
    const stale = step(loaded.state, { type: "scripture.insertionVerified", operationId: insertionId, fresh: false });
    expect(stale.state.notice.message).toContain("document changed");
    expect(stale.effects).toEqual([]);

    const requestedAgain = step(initial(), { type: "scripture.insertRequest", candidate });
    const id = requestedAgain.state.scripture.insertion!.stamp.id;
    const loadedAgain = step(requestedAgain.state, { type: "scripture.insertionResult", operationId: id, passage });
    const fresh = step(loadedAgain.state, { type: "scripture.insertionVerified", operationId: id, fresh: true });
    expect(effect(fresh.effects, "editor.dispatch").instruction.type).toBe("scripture.insert");
  });

  test("output is immutable through paint, cancellation, and failure", () => {
    const requested = step(initial(), { type: "output.request", mode: "pdf" });
    const capture = effect(requested.effects, "editor.capture");
    const mismatchedCapture = step(requested.state, {
      type: "editor.captured",
      stamp: capture.stamp,
      purpose: { type: "output", mode: "print" },
      document: documentFor(capture.stamp),
    });
    expect(mismatchedCapture.state).toBe(requested.state);
    expect(mismatchedCapture.effects).toEqual([]);
    const prepared = step(requested.state, {
      type: "editor.captured",
      stamp: capture.stamp,
      purpose: { type: "output", mode: "pdf" },
      document: documentFor(capture.stamp),
    });
    expect(prepared.state.output.snapshot?.bodyHtml).toContain("John 3:16");
    expect(prepared.state.document.identity).toBeUndefined();
    expect(prepared.state.output.phase).toBe("previewingPdf");
    expect(prepared.state.overlay.type).toBe("pdfExport");
    expect(prepared.effects).toEqual([]);

    const paged = step(prepared.state, { type: "output.togglePageNumbers" });
    expect(paged.state.output.snapshot?.bodyHtml).toBe(prepared.state.output.snapshot?.bodyHtml);
    expect(paged.state.output.snapshot?.pageNumbers).toBe(true);
    expect(step(paged.state, { type: "output.paintReady", operationId: capture.stamp.id, mode: "pdf" }).effects).toEqual([]);

    const confirmed = step(paged.state, { type: "output.confirmPdf" });
    expect(confirmed.state.output.phase).toBe("preparing");
    expect(confirmed.state.overlay.type).toBe("none");
    expect(effect(confirmed.effects, "output.afterPaint").mode).toBe("pdf");
    const painted = step(confirmed.state, { type: "output.paintReady", operationId: capture.stamp.id, mode: "pdf" });
    expect(effect(painted.effects, "output.savePdf").snapshot).toBe(paged.state.output.snapshot);
    const canceled = step(painted.state, { type: "output.pdfResult", operationId: capture.stamp.id, saved: null });
    expect(canceled.state.output.phase).toBe("idle");
    expect(canceled.state.notice.message).toContain("canceled");

    const requestedForDialogCancel = step(initial(), { type: "output.request", mode: "pdf" });
    const cancelCapture = effect(requestedForDialogCancel.effects, "editor.capture");
    const previewedForCancel = step(requestedForDialogCancel.state, {
      type: "editor.captured",
      stamp: cancelCapture.stamp,
      purpose: { type: "output", mode: "pdf" },
      document: documentFor(cancelCapture.stamp),
    });
    const dialogCanceled = step(previewedForCancel.state, { type: "output.cancelPdf" });
    expect(dialogCanceled.state.output.phase).toBe("idle");
    expect(dialogCanceled.state.output.snapshot).toBeUndefined();
    expect(dialogCanceled.state.overlay.type).toBe("none");

    const print = step(initial(), { type: "output.request", mode: "print" });
    const printId = print.state.output.stamp!.id;
    const failed = step({ ...print.state, output: { ...print.state.output, phase: "printing" } }, {
      type: "output.failed", operationId: printId, mode: "print", error: "Printer unavailable",
    });
    expect(failed.state.output.phase).toBe("idle");
    expect(failed.state.notice.message).toContain("Printer unavailable");
  });

  test("one overlay owns modality and command enablement is derived", () => {
    const find = step(initial(), { type: "overlay.openFind" });
    expect(find.state.overlay.type).toBe("find");
    const paragraph = step(find.state, { type: "overlay.openParagraph" });
    expect(paragraph.state.overlay.type).toBe("paragraph");
    expect(selectCommandEnabled(initial(), "file.print")).toBe(false);
    const ready = step(initial(), { type: "editor.ready" }).state;
    expect(selectCommandEnabled(ready, "file.print")).toBe(true);
    expect(selectCommandEnabled(ready, "edit.undo")).toBe(false);
    const undoReady = { ...ready, formatting: { ...ready.formatting, canUndo: true } };
    expect(selectCommandEnabled(undoReady, "edit.undo")).toBe(true);
    expect(eventForCommand(undoReady, "edit.undo")).toEqual({ type: "editor.command", instruction: { type: "history.undo" } });
  });

  test("credits are a local overlay with effective metadata and stamped allowlisted link effects", () => {
    const ready = step(initial(), { type: "editor.ready" }).state;
    const selected = {
      ...ready,
      scripture: { ...ready.scripture, translations: [web, nasb], selectedId: nasb.id },
    };
    const view = selectViewModel(selected);
    expect(view.credits).toEqual(expect.objectContaining({
      version: "0.2.0",
      softwarePackageCount: expect.any(Number),
      translation: expect.objectContaining({ name: nasb.name, notice: nasb.attribution }),
    }));
    expect(view.credits.softwareNotices).toContain("VERSEFORM DEPENDENCY LICENSE INVENTORY");

    const opened = step(selected, eventForCommand(selected, "help.credits")!);
    expect(opened.state.overlay).toEqual({ type: "credits" });
    expect(selectCommandEnabled(opened.state, "file.open")).toBe(false);
    const openingLink = step(opened.state, { type: "credits.openLink", target: "digital-bible-society" });
    const linkEffect = effect(openingLink.effects, "external.open");
    expect(linkEffect.target).toBe("digital-bible-society");
    expect(openingLink.state.overlay.type === "credits" && openingLink.state.overlay.link?.stamp.id).toBe(linkEffect.stamp.id);
    expect(step(openingLink.state, { type: "credits.linkOpened", operationId: linkEffect.stamp.id + 1 }).state).toBe(openingLink.state);
    expect(step(openingLink.state, { type: "credits.linkOpened", operationId: linkEffect.stamp.id }).state.overlay).toEqual({ type: "credits" });
    const failed = step(openingLink.state, {
      type: "credits.linkFailed", operationId: linkEffect.stamp.id, error: "No default browser",
    });
    expect(failed.state.overlay).toEqual({
      type: "credits", error: "Could not open the website: No default browser",
    });

    const find = step(selected, { type: "overlay.openFind" });
    const creditsFromFind = step(find.state, { type: "overlay.openCredits" });
    expect(effect(creditsFromFind.effects, "editor.dispatch").instruction).toEqual({
      type: "find.set", query: "", index: 0,
    });
    expect(commandForKeyStroke({ key: "F1", ctrl: false, meta: false, shift: false, alt: false })).toBe("help.credits");
  });

  test("a completed background recovery cannot overwrite a newer notice", () => {
    const edited = step(initial(), {
      type: "editor.observed", contentHash: contentHash(content), formatting: DEFAULT_FORMATTING, documentChanged: true,
    });
    const stamp = edited.state.persistence.recovery!.stamp;
    const writing = {
      ...edited.state,
      persistence: { ...edited.state.persistence, recovery: { phase: "writing" as const, stamp } },
      notice: { id: edited.state.notice.id + 1, message: "Newer notice" },
    };
    const done = step(writing, { type: "persistence.recoveryWritten", operationId: stamp.id });
    expect(done.state.notice.message).toBe("Newer notice");
  });
});
