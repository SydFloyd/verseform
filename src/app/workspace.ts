import { contentHash, type DocumentIdentity, type EditorNode, type VerseformDocument } from "../core/document";
import { buildPrintSnapshot, updatePrintSnapshotOptions, type PrintSnapshot } from "../core/output";
import type { DetectedReference, ReferenceCandidate } from "../core/reference";
import type { LookupRequest } from "../core/lookup";
import type {
  OpenedDocument,
  Passage,
  RecentDocument,
  RecoverySnapshot,
  SavedDocument,
  SavedPdf,
  Translation,
  TranslationCatalog,
} from "./ports";
import { selectInitialTranslation } from "./translationSelection";
import type { CreditLinkId } from "./credits";
import {
  DEFAULT_FORMATTING,
  DEFAULT_PARAGRAPH,
  type EditorFormatting,
  type EditorInstruction,
  type FindResult,
  type ParagraphSettings,
} from "../editor/gateway";

export const EMPTY_DOCUMENT: EditorNode = { type: "doc", content: [{ type: "paragraph" }] };
export const EMPTY_CONTENT_HASH = contentHash(EMPTY_DOCUMENT);

export type OperationStamp = {
  id: number;
  noticeId: number;
  revision: number;
  contentHash: string;
  documentId?: string;
  translationId?: string;
  sourceText?: string;
};

export type PendingDocumentAction =
  | { type: "new" }
  | { type: "open" }
  | { type: "recent"; path: string }
  | { type: "close" }
  | { type: "recovery"; recovery: RecoverySnapshot; displayName: string };

export type PreviewState = {
  candidate: DetectedReference;
  top: number;
  left: number;
  loading: boolean;
  passage?: Passage;
  error?: string;
};

export type WorkspaceOverlay =
  | { type: "none" }
  | { type: "confirm"; action: PendingDocumentAction }
  | { type: "find"; query: string; replacement: string; index: number; count: number }
  | { type: "paragraph"; draft: ParagraphSettings }
  | { type: "pdfExport" }
  | { type: "credits"; link?: { target: CreditLinkId; stamp: OperationStamp }; error?: string };

type TimerOperation = { phase: "scheduled" | "capturing" | "writing"; stamp: OperationStamp };
type SaveOperation = {
  phase: "capturing" | "writing";
  stamp: OperationStamp;
  forceSaveAs: boolean;
  continuation?: PendingDocumentAction;
};
type DocumentOperation = { phase: "opening"; stamp: OperationStamp; action: PendingDocumentAction };
type LookupOperation = {
  phase: "loading" | "verifying";
  stamp: OperationStamp;
  candidate: ReferenceCandidate;
  passage?: Passage;
};

export type WorkspaceState = {
  started: boolean;
  editorReady: boolean;
  nextOperationId: number;
  kind: "browser" | "tauri";
  document: {
    identity?: DocumentIdentity;
    path?: string;
    displayName: string;
    revision: number;
    currentHash: string;
    savedHash: string;
    operation?: DocumentOperation;
  };
  persistence: {
    recovery?: TimerOperation;
    autosave?: TimerOperation;
    save?: SaveOperation;
  };
  library: {
    recent: RecentDocument[];
    recoveries: RecoverySnapshot[];
    recentOperationId?: number;
    recoveryOperationId?: number;
  };
  scripture: {
    fallback: Translation;
    translations: Translation[];
    selectedId: string;
    preferredId?: string;
    catalogPhase: "loading" | "ready" | "offline" | "failed";
    catalogMessage?: string;
    catalogOperationId?: number;
    preferenceOperationId?: number;
    preview?: PreviewState;
    previewOperation?: { stamp: OperationStamp; candidate: ReferenceCandidate };
    insertion?: LookupOperation;
  };
  output: {
    pageNumbers: boolean;
    phase: "idle" | "capturing" | "previewingPdf" | "preparing" | "printing" | "savingPdf";
    mode?: "print" | "pdf";
    stamp?: OperationStamp;
    snapshot?: PrintSnapshot;
  };
  overlay: WorkspaceOverlay;
  formatting: EditorFormatting;
  notice: { id: number; message: string };
};

export type CapturePurpose =
  | { type: "recovery" }
  | { type: "autosave" }
  | { type: "save" }
  | { type: "output"; mode: "print" | "pdf" };

export type WorkspaceEffect =
  | { type: "library.listRecent"; stamp: OperationStamp }
  | { type: "library.listRecoveries"; stamp: OperationStamp }
  | { type: "scripture.loadCatalog"; stamp: OperationStamp }
  | { type: "window.title"; title: string }
  | { type: "timer.cancel"; timer: "recovery" | "autosave" }
  | { type: "timer.schedule"; timer: "recovery" | "autosave"; delayMs: number; stamp: OperationStamp }
  | { type: "editor.capture"; stamp: OperationStamp; purpose: CapturePurpose }
  | { type: "editor.dispatch"; instruction: EditorInstruction }
  | { type: "document.writeRecovery"; stamp: OperationStamp; snapshot: RecoverySnapshot }
  | { type: "document.save"; stamp: OperationStamp; document: VerseformDocument; path: string; autosave: boolean }
  | { type: "document.saveAs"; stamp: OperationStamp; document: VerseformDocument; suggestedName: string }
  | { type: "document.open"; stamp: OperationStamp }
  | { type: "document.openRecent"; stamp: OperationStamp; path: string }
  | { type: "document.discardRecovery"; documentId: string }
  | { type: "window.close" }
  | { type: "preference.saveTranslation"; translationId: string; stamp: OperationStamp }
  | { type: "scripture.lookupPreview"; candidate: ReferenceCandidate; stamp: OperationStamp }
  | { type: "scripture.lookupInsertion"; candidate: ReferenceCandidate; stamp: OperationStamp }
  | { type: "scripture.verifyInsertion"; request: LookupRequest; passage: Passage; stamp: OperationStamp }
  | { type: "scripture.cancelLookups" }
  | { type: "output.afterPaint"; mode: "print" | "pdf"; stamp: OperationStamp }
  | { type: "output.print"; snapshot: PrintSnapshot; stamp: OperationStamp }
  | { type: "output.savePdf"; snapshot: PrintSnapshot; suggestedName: string; stamp: OperationStamp }
  | { type: "external.open"; target: CreditLinkId; stamp: OperationStamp }
  | { type: "prompt.link" };

export type WorkspaceEvent =
  | { type: "app.started" }
  | { type: "editor.ready" }
  | { type: "editor.detached" }
  | { type: "editor.observed"; contentHash: string; formatting: EditorFormatting; documentChanged: boolean }
  | { type: "editor.limit" }
  | { type: "timer.fired"; timer: "recovery" | "autosave"; operationId: number }
  | { type: "editor.captured"; stamp: OperationStamp; purpose: CapturePurpose; document: VerseformDocument }
  | { type: "editor.captureFailed"; stamp: OperationStamp; purpose: CapturePurpose; error: string }
  | { type: "library.recentResult"; operationId: number; recent: RecentDocument[] }
  | { type: "library.recentFailed"; operationId: number; error: string }
  | { type: "library.recoveryResult"; operationId: number; recoveries: RecoverySnapshot[] }
  | { type: "library.recoveryFailed"; operationId: number; error: string }
  | { type: "persistence.recoveryWritten"; operationId: number }
  | { type: "persistence.recoveryFailed"; operationId: number; error: string }
  | { type: "persistence.saved"; operationId: number; document: VerseformDocument; saved: SavedDocument; autosave: boolean }
  | { type: "persistence.saveCanceled"; operationId: number }
  | { type: "persistence.saveFailed"; operationId: number; error: string; autosave: boolean }
  | { type: "persistence.saveRequest"; forceSaveAs: boolean }
  | { type: "document.request"; action: PendingDocumentAction }
  | { type: "document.confirm"; choice: "save" | "discard" | "cancel" }
  | { type: "document.opened"; operationId: number; opened: OpenedDocument; contentHash: string }
  | { type: "document.openCanceled"; operationId: number }
  | { type: "document.openFailed"; operationId: number; error: string }
  | { type: "recovery.discard"; recovery: RecoverySnapshot }
  | { type: "scripture.catalogResult"; operationId: number; catalog: TranslationCatalog; preferred?: string }
  | { type: "scripture.catalogFailed"; operationId: number; error: string }
  | { type: "scripture.select"; translationId: string }
  | { type: "scripture.preferenceSaved"; operationId: number; translationId: string }
  | { type: "scripture.preferenceFailed"; operationId: number; error: string }
  | { type: "scripture.hover"; candidate: DetectedReference; top: number; left: number }
  | { type: "scripture.leave" }
  | { type: "scripture.previewResult"; operationId: number; passage: Passage }
  | { type: "scripture.previewFailed"; operationId: number; error: string; aborted: boolean }
  | { type: "scripture.insertRequest"; candidate: ReferenceCandidate }
  | { type: "scripture.insertionResult"; operationId: number; passage: Passage }
  | { type: "scripture.insertionFailed"; operationId: number; error: string }
  | { type: "scripture.insertionVerified"; operationId: number; fresh: boolean }
  | { type: "output.togglePageNumbers" }
  | { type: "output.request"; mode: "print" | "pdf" }
  | { type: "output.confirmPdf" }
  | { type: "output.cancelPdf" }
  | { type: "output.paintReady"; operationId: number; mode: "print" | "pdf" }
  | { type: "output.printed"; operationId: number }
  | { type: "output.pdfResult"; operationId: number; saved: SavedPdf | null }
  | { type: "output.failed"; operationId: number; mode: "print" | "pdf"; error: string }
  | { type: "overlay.openFind" }
  | { type: "overlay.findQuery"; query: string; index?: number }
  | { type: "overlay.findReplacement"; replacement: string }
  | { type: "overlay.findResult"; result: FindResult }
  | { type: "overlay.findReplace" }
  | { type: "overlay.findReplaceAll" }
  | { type: "overlay.findReplaceAllResult"; replacements: number; result: FindResult }
  | { type: "overlay.closeFind" }
  | { type: "overlay.openParagraph" }
  | { type: "overlay.paragraphDraft"; draft: ParagraphSettings }
  | { type: "overlay.applyParagraph" }
  | { type: "overlay.closeParagraph" }
  | { type: "overlay.openCredits" }
  | { type: "overlay.closeCredits" }
  | { type: "credits.openLink"; target: CreditLinkId }
  | { type: "credits.linkOpened"; operationId: number }
  | { type: "credits.linkFailed"; operationId: number; error: string }
  | { type: "editor.command"; instruction: EditorInstruction }
  | { type: "editor.promptLink" }
  | { type: "editor.linkResolved"; href: string | null };

export type TransitionResult = { state: WorkspaceState; effects: WorkspaceEffect[] };

function operationStamp(state: WorkspaceState, extra: Partial<OperationStamp> = {}): OperationStamp {
  return {
    id: state.nextOperationId,
    noticeId: state.notice.id,
    revision: state.document.revision,
    contentHash: state.document.currentHash,
    documentId: state.document.identity?.documentId,
    ...extra,
  };
}

function advance(state: WorkspaceState): WorkspaceState {
  return { ...state, nextOperationId: state.nextOperationId + 1 };
}

function titleFor(state: WorkspaceState): string {
  const dirty = state.document.currentHash !== state.document.savedHash;
  return `${state.document.displayName}${dirty ? " — Unsaved changes" : ""} — Verseform`;
}

function titleEffect(state: WorkspaceState): WorkspaceEffect {
  return { type: "window.title", title: titleFor(state) };
}

function notice(state: WorkspaceState, message: string): WorkspaceState {
  return { ...state, notice: { id: state.notice.id + 1, message } };
}

function sameFormatting(left: EditorFormatting, right: EditorFormatting): boolean {
  return (Object.keys(left) as Array<keyof EditorFormatting>)
    .every((key) => left[key] === right[key]);
}

function schedulePersistence(state: WorkspaceState): TransitionResult {
  const recoveryStamp = operationStamp(state);
  let next = advance(state);
  const effects: WorkspaceEffect[] = [
    { type: "timer.cancel", timer: "recovery" },
    { type: "timer.cancel", timer: "autosave" },
    { type: "timer.schedule", timer: "recovery", delayMs: 250, stamp: recoveryStamp },
  ];
  next = {
    ...next,
    persistence: {
      ...next.persistence,
      recovery: { phase: "scheduled", stamp: recoveryStamp },
      autosave: undefined,
    },
  };
  if (next.document.path) {
    const autosaveStamp = operationStamp(next);
    next = advance(next);
    next = {
      ...next,
      persistence: {
        ...next.persistence,
        autosave: { phase: "scheduled", stamp: autosaveStamp },
      },
    };
    effects.push({ type: "timer.schedule", timer: "autosave", delayMs: 1100, stamp: autosaveStamp });
  }
  return { state: next, effects };
}

function beginAction(state: WorkspaceState, action: PendingDocumentAction): TransitionResult {
  if (action.type === "recovery") {
    const { recovery } = action;
    const next = notice({
      ...state,
      document: {
        identity: {
          documentId: recovery.document.documentId,
          title: recovery.document.title,
          createdAt: recovery.document.createdAt,
        },
        path: recovery.sourcePath,
        displayName: action.displayName,
        revision: state.document.revision + 1,
        currentHash: recovery.contentHash,
        savedHash: recovery.savedContentHash ?? EMPTY_CONTENT_HASH,
      },
      persistence: {},
      library: {
        ...state.library,
        recoveries: state.library.recoveries.filter((item) => (
          item.document.documentId !== recovery.document.documentId
          || item.capturedAtMs !== recovery.capturedAtMs
        )),
      },
      scripture: {
        ...state.scripture,
        preview: undefined,
        previewOperation: undefined,
        insertion: undefined,
      },
      output: { ...state.output, phase: "idle", mode: undefined, stamp: undefined, snapshot: undefined },
      overlay: { type: "none" },
    }, "Recovery restored. Save to keep it.");
    return { state: next, effects: [
      { type: "timer.cancel", timer: "recovery" },
      { type: "timer.cancel", timer: "autosave" },
      { type: "scripture.cancelLookups" },
      { type: "editor.dispatch", instruction: { type: "content.set", content: recovery.document.content } },
      titleEffect(next),
    ] };
  }
  if (action.type === "new") {
    const next: WorkspaceState = notice({
      ...state,
      document: {
        displayName: "Untitled.verseform",
        revision: state.document.revision + 1,
        currentHash: EMPTY_CONTENT_HASH,
        savedHash: EMPTY_CONTENT_HASH,
      },
      persistence: {},
      overlay: { type: "none" },
      output: { ...state.output, phase: "idle", mode: undefined, stamp: undefined, snapshot: undefined },
    }, "New document.");
    return { state: next, effects: [
      { type: "timer.cancel", timer: "recovery" },
      { type: "timer.cancel", timer: "autosave" },
      { type: "editor.dispatch", instruction: { type: "content.set", content: EMPTY_DOCUMENT } },
      { type: "editor.dispatch", instruction: { type: "focus", position: "start" } },
      titleEffect(next),
    ] };
  }
  if (action.type === "close") {
    return { state: { ...state, overlay: { type: "none" } }, effects: [{ type: "window.close" }] };
  }
  const stamp = operationStamp(state);
  const next = advance({
    ...state,
    overlay: { type: "none" },
    document: { ...state.document, operation: { phase: "opening", stamp, action } },
  });
  return {
    state: next,
    effects: [action.type === "open"
      ? { type: "document.open", stamp }
      : { type: "document.openRecent", stamp, path: action.path }],
  };
}

function startSave(
  state: WorkspaceState,
  forceSaveAs: boolean,
  continuation?: PendingDocumentAction,
): TransitionResult {
  if (state.persistence.save) return { state, effects: [] };
  const stamp = operationStamp(state);
  const next = advance({
    ...state,
    persistence: {
      ...state.persistence,
      recovery: undefined,
      autosave: undefined,
      save: { phase: "capturing", stamp, forceSaveAs, continuation },
    },
  });
  return { state: next, effects: [
    { type: "timer.cancel", timer: "recovery" },
    { type: "timer.cancel", timer: "autosave" },
    { type: "editor.capture", stamp, purpose: { type: "save" } },
  ] };
}

function finishFallback(state: WorkspaceState, passage: Passage): { state: WorkspaceState; effects: WorkspaceEffect[] } {
  if (!passage.fallbackFrom) return { state, effects: [] };
  return {
    state: {
      ...state,
      scripture: {
        ...state.scripture,
        selectedId: state.scripture.fallback.id,
        catalogPhase: "offline",
      },
    },
    effects: [{ type: "editor.dispatch", instruction: { type: "references.refresh" } }],
  };
}

export function createInitialWorkspace(
  kind: "browser" | "tauri",
  fallback: Translation,
): WorkspaceState {
  return {
    started: false,
    editorReady: false,
    nextOperationId: 1,
    kind,
    document: {
      displayName: "Untitled.verseform",
      revision: 0,
      currentHash: EMPTY_CONTENT_HASH,
      savedHash: EMPTY_CONTENT_HASH,
    },
    persistence: {},
    library: { recent: [], recoveries: [] },
    scripture: {
      fallback,
      translations: [fallback],
      selectedId: fallback.id,
      catalogPhase: "loading",
    },
    output: { pageNumbers: false, phase: "idle" },
    overlay: { type: "none" },
    formatting: DEFAULT_FORMATTING,
    notice: { id: 0, message: kind === "tauri" ? "Desktop mode · ready" : "Browser harness · ready" },
  };
}

export function transition(state: WorkspaceState, event: WorkspaceEvent): TransitionResult {
  switch (event.type) {
    case "app.started": {
      if (state.started) return { state, effects: [] };
      const recentStamp = operationStamp(state);
      let next = advance(state);
      const recoveryStamp = operationStamp(next);
      next = advance(next);
      const catalogStamp = operationStamp(next);
      next = advance({
        ...next,
        started: true,
        library: {
          ...next.library,
          recentOperationId: recentStamp.id,
          recoveryOperationId: recoveryStamp.id,
        },
        scripture: { ...next.scripture, catalogOperationId: catalogStamp.id },
      });
      return { state: next, effects: [
        { type: "library.listRecent", stamp: recentStamp },
        { type: "library.listRecoveries", stamp: recoveryStamp },
        { type: "scripture.loadCatalog", stamp: catalogStamp },
        titleEffect(next),
      ] };
    }
    case "editor.ready":
      return { state: { ...state, editorReady: true }, effects: [
        { type: "editor.dispatch", instruction: { type: "references.refresh" } },
      ] };
    case "editor.detached":
      return { state: { ...state, editorReady: false }, effects: [] };
    case "editor.observed": {
      if (!event.documentChanged) {
        return sameFormatting(state.formatting, event.formatting)
          ? { state, effects: [] }
          : { state: { ...state, formatting: event.formatting }, effects: [] };
      }
      const changed = {
        ...state,
        document: {
          ...state.document,
          revision: state.document.revision + 1,
          currentHash: event.contentHash,
        },
        formatting: event.formatting,
      };
      const scheduled = schedulePersistence(changed);
      return { ...scheduled, effects: [...scheduled.effects, titleEffect(scheduled.state)] };
    }
    case "editor.limit":
      return { state: notice(state, "That change was not applied. Documents are limited to 1,000,000 characters and 50,000 content nodes."), effects: [] };
    case "timer.fired": {
      const pending = state.persistence[event.timer];
      if (!pending || pending.phase !== "scheduled" || pending.stamp.id !== event.operationId) {
        return { state, effects: [] };
      }
      const purpose: CapturePurpose = { type: event.timer };
      return {
        state: {
          ...state,
          persistence: { ...state.persistence, [event.timer]: { ...pending, phase: "capturing" } },
        },
        effects: [{ type: "editor.capture", stamp: pending.stamp, purpose }],
      };
    }
    case "editor.captured": {
      const identity: DocumentIdentity = {
        documentId: event.document.documentId,
        title: event.document.title,
        createdAt: event.document.createdAt,
      };
      if (event.purpose.type === "recovery") {
        const pending = state.persistence.recovery;
        if (!pending || pending.stamp.id !== event.stamp.id || pending.phase !== "capturing") return { state, effects: [] };
        const stamp = { ...pending.stamp, documentId: event.document.documentId };
        const next = {
          ...state,
          document: { ...state.document, identity },
          persistence: { ...state.persistence, recovery: { phase: "writing" as const, stamp } },
        };
        return { state: next, effects: [{
          type: "document.writeRecovery",
          stamp,
          snapshot: {
            document: event.document,
            sourcePath: state.document.path,
            savedContentHash: state.document.savedHash,
            contentHash: event.stamp.contentHash,
            capturedAtMs: 0,
          },
        }] };
      }
      if (event.purpose.type === "autosave") {
        const pending = state.persistence.autosave;
        const path = state.document.path;
        if (!pending || pending.stamp.id !== event.stamp.id || pending.phase !== "capturing" || !path) return { state, effects: [] };
        const stamp = { ...pending.stamp, documentId: event.document.documentId };
        return {
          state: {
            ...state,
            document: { ...state.document, identity },
            persistence: { ...state.persistence, autosave: { phase: "writing", stamp } },
          },
          effects: [{ type: "document.save", stamp, document: event.document, path, autosave: true }],
        };
      }
      if (event.purpose.type === "save") {
        const pending = state.persistence.save;
        if (!pending || pending.stamp.id !== event.stamp.id || pending.phase !== "capturing") return { state, effects: [] };
        const stamp = { ...pending.stamp, documentId: event.document.documentId };
        const next = {
          ...state,
          document: { ...state.document, identity },
          persistence: { ...state.persistence, save: { ...pending, phase: "writing" as const, stamp } },
        };
        const path = state.document.path;
        return { state: next, effects: [path && !pending.forceSaveAs
          ? { type: "document.save", stamp, document: event.document, path, autosave: false }
          : { type: "document.saveAs", stamp, document: event.document, suggestedName: state.document.displayName }],
        };
      }
      if (state.output.phase !== "capturing" || state.output.stamp?.id !== event.stamp.id || state.output.mode !== event.purpose.mode) return { state, effects: [] };
      const snapshot = buildPrintSnapshot(event.document, { pageNumbers: state.output.pageNumbers });
      const mode = event.purpose.mode;
      if (mode === "pdf") {
        return {
          state: {
            ...state,
            output: { ...state.output, phase: "previewingPdf", snapshot },
            overlay: { type: "pdfExport" },
          },
          effects: [],
        };
      }
      return {
        state: {
          ...state,
          output: { ...state.output, phase: "preparing", snapshot },
        },
        effects: [{ type: "output.afterPaint", mode, stamp: event.stamp }],
      };
    }
    case "editor.captureFailed": {
      if (event.purpose.type === "output" && state.output.stamp?.id === event.stamp.id && state.output.mode === event.purpose.mode) {
        return { state: notice({ ...state, output: { ...state.output, phase: "idle", mode: undefined, stamp: undefined } }, `${event.purpose.mode === "print" ? "Print" : "PDF export"} failed: ${event.error}`), effects: [] };
      }
      if (event.purpose.type === "save" && state.persistence.save?.stamp.id === event.stamp.id) {
        return { state: notice({ ...state, persistence: { ...state.persistence, save: undefined } }, `Save failed: ${event.error}`), effects: [] };
      }
      if (event.purpose.type !== "recovery" && event.purpose.type !== "autosave") {
        return { state, effects: [] };
      }
      const pending = state.persistence[event.purpose.type];
      if (!pending || pending.stamp.id !== event.stamp.id) return { state, effects: [] };
      return {
        state: notice({ ...state, persistence: { ...state.persistence, [event.purpose.type]: undefined } }, `${event.purpose.type === "recovery" ? "Recovery" : "Autosave"} failed: ${event.error}`),
        effects: [],
      };
    }
    case "library.recentResult":
      return state.library.recentOperationId === event.operationId
        ? { state: { ...state, library: { ...state.library, recent: event.recent, recentOperationId: undefined } }, effects: [] }
        : { state, effects: [] };
    case "library.recentFailed":
      return state.library.recentOperationId === event.operationId
        ? { state: notice({ ...state, library: { ...state.library, recentOperationId: undefined } }, `Recent files unavailable: ${event.error}`), effects: [] }
        : { state, effects: [] };
    case "library.recoveryResult":
      return state.library.recoveryOperationId === event.operationId
        ? { state: { ...state, library: { ...state.library, recoveryOperationId: undefined, recoveries: event.recoveries.filter((item) => item.contentHash !== item.savedContentHash) } }, effects: [] }
        : { state, effects: [] };
    case "library.recoveryFailed":
      return state.library.recoveryOperationId === event.operationId
        ? { state: notice({ ...state, library: { ...state.library, recoveryOperationId: undefined } }, `Recovery check failed: ${event.error}`), effects: [] }
        : { state, effects: [] };
    case "persistence.recoveryWritten": {
      const pending = state.persistence.recovery;
      if (!pending || pending.stamp.id !== event.operationId) return { state, effects: [] };
      const next = { ...state, persistence: { ...state.persistence, recovery: undefined } };
      return {
        state: pending.stamp.revision === state.document.revision
          && pending.stamp.contentHash === state.document.currentHash
          && pending.stamp.noticeId === state.notice.id
          ? { ...next, notice: { ...next.notice, message: "Recovery copy saved locally." } } : next,
        effects: [],
      };
    }
    case "persistence.recoveryFailed": {
      const pending = state.persistence.recovery;
      if (!pending || pending.stamp.id !== event.operationId) return { state, effects: [] };
      const next = { ...state, persistence: { ...state.persistence, recovery: undefined } };
      return {
        state: pending.stamp.noticeId === state.notice.id
          ? notice(next, `Recovery failed: ${event.error}`)
          : next,
        effects: [],
      };
    }
    case "persistence.saved": {
      const pending = event.autosave ? state.persistence.autosave : state.persistence.save;
      if (!pending || pending.stamp.id !== event.operationId) return { state, effects: [] };
      const identity: DocumentIdentity = {
        documentId: event.document.documentId,
        title: event.document.title,
        createdAt: event.document.createdAt,
      };
      const exact = pending.stamp.revision === state.document.revision
        && pending.stamp.contentHash === state.document.currentHash;
      let next: WorkspaceState = {
        ...state,
        document: {
          ...state.document,
          identity,
          path: event.saved.path,
          displayName: event.saved.displayName,
          savedHash: pending.stamp.contentHash,
        },
        persistence: {
          ...state.persistence,
          autosave: event.autosave ? undefined : state.persistence.autosave,
          save: event.autosave ? state.persistence.save : undefined,
        },
        library: { ...state.library, recentOperationId: pending.stamp.id },
      };
      const effects: WorkspaceEffect[] = [
        { type: "library.listRecent", stamp: pending.stamp },
        titleEffect(next),
      ];
      if (exact) effects.push({ type: "document.discardRecovery", documentId: event.document.documentId });
      if (!event.autosave && !exact) {
        const scheduled = schedulePersistence(next);
        next = scheduled.state;
        effects.push(...scheduled.effects);
      }
      if (!event.autosave || pending.stamp.noticeId === state.notice.id) {
        next = notice(next, exact
          ? `${event.autosave ? "Autosaved" : "Saved"} ${event.saved.displayName}.`
          : "The document changed while saving; the latest recovery copy was kept.");
      }
      if (!event.autosave && state.persistence.save?.continuation && exact) {
        const continued = beginAction(next, state.persistence.save.continuation);
        return { state: continued.state, effects: [...effects, ...continued.effects] };
      }
      return { state: next, effects };
    }
    case "persistence.saveCanceled": {
      const pending = state.persistence.save;
      if (!pending || pending.stamp.id !== event.operationId) return { state, effects: [] };
      const cleared = { ...state, persistence: { ...state.persistence, save: undefined } };
      if (cleared.document.currentHash === cleared.document.savedHash) {
        return { state: notice(cleared, "Save canceled."), effects: [] };
      }
      const scheduled = schedulePersistence(cleared);
      return { state: notice(scheduled.state, "Save canceled."), effects: scheduled.effects };
    }
    case "persistence.saveFailed": {
      const pending = event.autosave ? state.persistence.autosave : state.persistence.save;
      if (!pending || pending.stamp.id !== event.operationId) return { state, effects: [] };
      const cleared = {
        ...state,
        persistence: {
          ...state.persistence,
          autosave: event.autosave ? undefined : state.persistence.autosave,
          save: event.autosave ? state.persistence.save : undefined,
        },
      };
      const message = `${event.autosave ? "Autosave" : "Save"} failed: ${event.error}`;
      if (event.autosave && pending.stamp.noticeId !== state.notice.id) {
        return { state: cleared, effects: [] };
      }
      if (event.autosave || cleared.document.currentHash === cleared.document.savedHash) {
        return { state: notice(cleared, message), effects: [] };
      }
      const scheduled = schedulePersistence(cleared);
      return { state: notice(scheduled.state, message), effects: scheduled.effects };
    }
    case "persistence.saveRequest":
      return startSave(state, event.forceSaveAs);
    case "document.request":
      return state.document.currentHash !== state.document.savedHash
        ? { state: { ...state, overlay: { type: "confirm", action: event.action } }, effects: [] }
        : beginAction(state, event.action);
    case "document.confirm": {
      if (state.overlay.type !== "confirm") return { state, effects: [] };
      const action = state.overlay.action;
      if (event.choice === "cancel") return { state: { ...state, overlay: { type: "none" } }, effects: [] };
      if (event.choice === "save") return startSave(state, false, action);
      const discarded = { ...state, overlay: { type: "none" } as const };
      const effects = state.document.identity
        ? [{ type: "document.discardRecovery", documentId: state.document.identity.documentId } as WorkspaceEffect]
        : [];
      const begun = beginAction(discarded, action);
      return { state: begun.state, effects: [...effects, ...begun.effects] };
    }
    case "document.opened": {
      const operation = state.document.operation;
      if (!operation || operation.stamp.id !== event.operationId) return { state, effects: [] };
      const next = notice({
        ...state,
        document: {
          identity: {
            documentId: event.opened.document.documentId,
            title: event.opened.document.title,
            createdAt: event.opened.document.createdAt,
          },
          path: event.opened.path,
          displayName: event.opened.displayName,
          revision: state.document.revision + 1,
          currentHash: event.contentHash,
          savedHash: event.contentHash,
        },
        persistence: {},
        library: { ...state.library, recentOperationId: operation.stamp.id },
        output: { ...state.output, phase: "idle", mode: undefined, stamp: undefined, snapshot: undefined },
      }, `Opened ${event.opened.displayName}.`);
      return { state: next, effects: [
        { type: "timer.cancel", timer: "recovery" },
        { type: "timer.cancel", timer: "autosave" },
        { type: "editor.dispatch", instruction: { type: "content.set", content: event.opened.document.content } },
        { type: "library.listRecent", stamp: operation.stamp },
        titleEffect(next),
      ] };
    }
    case "document.openCanceled": {
      if (state.document.operation?.stamp.id !== event.operationId) return { state, effects: [] };
      return { state: notice({ ...state, document: { ...state.document, operation: undefined } }, "Open canceled."), effects: [] };
    }
    case "document.openFailed": {
      if (state.document.operation?.stamp.id !== event.operationId) return { state, effects: [] };
      return { state: notice({
        ...state,
        document: { ...state.document, operation: undefined },
        library: { ...state.library, recentOperationId: state.document.operation.stamp.id },
      }, `Open failed: ${event.error}`), effects: [
        { type: "library.listRecent", stamp: state.document.operation.stamp },
      ] };
    }
    case "recovery.discard":
      return { state: {
        ...state,
        library: { ...state.library, recoveries: state.library.recoveries.filter((item) => item !== event.recovery) },
      }, effects: [{ type: "document.discardRecovery", documentId: event.recovery.document.documentId }] };
    case "scripture.catalogResult": {
      if (state.scripture.catalogOperationId !== event.operationId) return { state, effects: [] };
      const available = event.catalog.offline
        ? [state.scripture.fallback]
        : event.catalog.translations.length ? event.catalog.translations : [state.scripture.fallback];
      const selected = selectInitialTranslation(available, event.preferred) ?? state.scripture.fallback;
      let next: WorkspaceState = {
        ...state,
        scripture: {
          ...state.scripture,
          translations: available,
          selectedId: selected.id,
          preferredId: event.preferred,
          catalogPhase: event.catalog.offline ? "offline" : "ready",
          catalogMessage: event.catalog.message,
          catalogOperationId: undefined,
        },
      };
      if (event.catalog.offline) next = notice(next, `Offline · using bundled WEB. ${event.catalog.message ?? ""}`.trim());
      return { state: next, effects: [{ type: "editor.dispatch", instruction: { type: "references.refresh" } }] };
    }
    case "scripture.catalogFailed":
      return state.scripture.catalogOperationId === event.operationId
        ? { state: notice({ ...state, scripture: { ...state.scripture, catalogPhase: "failed", catalogOperationId: undefined } }, `Translation catalog unavailable: ${event.error}`), effects: [] }
        : { state, effects: [] };
    case "scripture.select": {
      const selected = state.scripture.translations.find((item) => item.id === event.translationId);
      if (!selected) return { state, effects: [] };
      const stamp = operationStamp(state, { translationId: selected.id });
      const next = advance({
        ...state,
        scripture: {
          ...state.scripture,
          selectedId: selected.id,
          preferredId: selected.id,
          preview: undefined,
          previewOperation: undefined,
          preferenceOperationId: stamp.id,
        },
      });
      return { state: next, effects: [
        { type: "editor.dispatch", instruction: { type: "references.refresh" } },
        { type: "preference.saveTranslation", translationId: selected.id, stamp },
      ] };
    }
    case "scripture.preferenceSaved": {
      if (state.scripture.preferenceOperationId !== event.operationId || state.scripture.selectedId !== event.translationId) return { state, effects: [] };
      const selected = state.scripture.translations.find((item) => item.id === event.translationId);
      const next = { ...state, scripture: { ...state.scripture, preferenceOperationId: undefined } };
      return { state: selected ? notice(next, `${selected.name} selected for scripture insertion.`) : next, effects: [] };
    }
    case "scripture.preferenceFailed":
      return state.scripture.preferenceOperationId === event.operationId
        ? { state: notice({ ...state, scripture: { ...state.scripture, preferenceOperationId: undefined } }, `Translation preference was not saved: ${event.error}`), effects: [] }
        : { state, effects: [] };
    case "scripture.hover": {
      const preview = { candidate: event.candidate, top: event.top, left: event.left, loading: event.candidate.kind === "valid" };
      if (event.candidate.kind === "invalid") {
        return { state: { ...state, scripture: { ...state.scripture, preview, previewOperation: undefined } }, effects: [] };
      }
      const stamp = operationStamp(state, {
        translationId: state.scripture.selectedId,
        sourceText: event.candidate.sourceText,
      });
      const next = advance({
        ...state,
        scripture: { ...state.scripture, preview, previewOperation: { stamp, candidate: event.candidate } },
      });
      return { state: next, effects: [{ type: "scripture.lookupPreview", candidate: event.candidate, stamp }] };
    }
    case "scripture.leave":
      return { state: { ...state, scripture: { ...state.scripture, preview: undefined, previewOperation: undefined } }, effects: [] };
    case "scripture.previewResult": {
      if (state.scripture.previewOperation?.stamp.id !== event.operationId || !state.scripture.preview) return { state, effects: [] };
      const fallback = finishFallback(state, event.passage);
      return {
        state: {
          ...fallback.state,
          scripture: {
            ...fallback.state.scripture,
            preview: { ...state.scripture.preview, loading: false, passage: event.passage },
            previewOperation: undefined,
          },
        },
        effects: fallback.effects,
      };
    }
    case "scripture.previewFailed": {
      if (state.scripture.previewOperation?.stamp.id !== event.operationId) return { state, effects: [] };
      return { state: {
        ...state,
        scripture: {
          ...state.scripture,
          preview: event.aborted || !state.scripture.preview
            ? undefined
            : { ...state.scripture.preview, loading: false, error: event.error },
          previewOperation: undefined,
        },
      }, effects: [] };
    }
    case "scripture.insertRequest": {
      const stamp = operationStamp(state, {
        translationId: state.scripture.selectedId,
        sourceText: event.candidate.sourceText,
      });
      const next = notice(advance({
        ...state,
        scripture: {
          ...state.scripture,
          insertion: { phase: "loading", stamp, candidate: event.candidate },
        },
      }), `Looking up ${event.candidate.display}…`);
      return { state: next, effects: [{ type: "scripture.lookupInsertion", candidate: event.candidate, stamp }] };
    }
    case "scripture.insertionResult": {
      const pending = state.scripture.insertion;
      if (!pending || pending.stamp.id !== event.operationId) return { state, effects: [] };
      const request: LookupRequest = { ...pending.candidate, revision: pending.stamp.revision };
      return {
        state: { ...state, scripture: { ...state.scripture, insertion: { ...pending, phase: "verifying", passage: event.passage } } },
        effects: [{ type: "scripture.verifyInsertion", request, passage: event.passage, stamp: pending.stamp }],
      };
    }
    case "scripture.insertionFailed": {
      if (state.scripture.insertion?.stamp.id !== event.operationId) return { state, effects: [] };
      return { state: notice({ ...state, scripture: { ...state.scripture, insertion: undefined } }, `Passage not inserted: ${event.error}`), effects: [] };
    }
    case "scripture.insertionVerified": {
      const pending = state.scripture.insertion;
      if (!pending || pending.stamp.id !== event.operationId || !pending.passage) return { state, effects: [] };
      if (!event.fresh) return { state: notice({ ...state, scripture: { ...state.scripture, insertion: undefined } }, "Passage not inserted: the document changed during lookup."), effects: [] };
      const passage = pending.passage;
      const fallback = finishFallback(state, passage);
      const next = notice({
        ...fallback.state,
        scripture: {
          ...fallback.state.scripture,
          insertion: undefined,
          preview: undefined,
          previewOperation: undefined,
        },
      }, passage.fallbackFrom
        ? `${passage.display} inserted from bundled WEB because ${passage.fallbackFrom.name} was unavailable.`
        : `${passage.display} inserted from ${passage.translationName}${passage.cached ? " (local cache)" : ""}.`);
      return { state: next, effects: [
        ...fallback.effects,
        { type: "editor.dispatch", instruction: { type: "scripture.insert", request: { ...pending.candidate, revision: pending.stamp.revision }, passage } },
      ] };
    }
    case "output.togglePageNumbers":
      if (state.output.phase === "idle") {
        return { state: { ...state, output: { ...state.output, pageNumbers: !state.output.pageNumbers } }, effects: [] };
      }
      if (state.output.phase === "previewingPdf" && state.overlay.type === "pdfExport" && state.output.snapshot) {
        const pageNumbers = !state.output.pageNumbers;
        return { state: { ...state, output: {
          ...state.output,
          pageNumbers,
          snapshot: updatePrintSnapshotOptions(state.output.snapshot, { pageNumbers }),
        } }, effects: [] };
      }
      return { state, effects: [] };
    case "output.request": {
      if (state.output.phase !== "idle") return { state, effects: [] };
      const stamp = operationStamp(state);
      return { state: advance({ ...state, output: { ...state.output, phase: "capturing", mode: event.mode, stamp } }), effects: [
        { type: "editor.capture", stamp, purpose: { type: "output", mode: event.mode } },
      ] };
    }
    case "output.confirmPdf": {
      if (state.output.phase !== "previewingPdf" || state.output.mode !== "pdf" || state.overlay.type !== "pdfExport" || !state.output.stamp || !state.output.snapshot) {
        return { state, effects: [] };
      }
      return {
        state: { ...state, output: { ...state.output, phase: "preparing" }, overlay: { type: "none" } },
        effects: [{ type: "output.afterPaint", mode: "pdf", stamp: state.output.stamp }],
      };
    }
    case "output.cancelPdf":
      return state.output.phase === "previewingPdf" && state.output.mode === "pdf" && state.overlay.type === "pdfExport"
        ? { state: notice({
          ...state,
          output: { ...state.output, phase: "idle", mode: undefined, stamp: undefined, snapshot: undefined },
          overlay: { type: "none" },
        }, "PDF export canceled. The document was not changed."), effects: [] }
        : { state, effects: [] };
    case "output.paintReady": {
      if (state.output.stamp?.id !== event.operationId || state.output.phase !== "preparing" || state.output.mode !== event.mode || !state.output.snapshot) return { state, effects: [] };
      const next = { ...state, output: { ...state.output, phase: event.mode === "print" ? "printing" as const : "savingPdf" as const } };
      const suggestedName = state.document.displayName.replace(/\.verseform$/i, "") || "Verseform";
      return { state: next, effects: [event.mode === "print"
        ? { type: "output.print", snapshot: state.output.snapshot, stamp: state.output.stamp }
        : { type: "output.savePdf", snapshot: state.output.snapshot, suggestedName, stamp: state.output.stamp }],
      };
    }
    case "output.printed": {
      if (state.output.stamp?.id !== event.operationId || state.output.phase !== "printing") return { state, effects: [] };
      return { state: notice({ ...state, output: { ...state.output, phase: "idle", mode: undefined, stamp: undefined } }, "Browser print preview opened with an immutable attributed snapshot."), effects: [] };
    }
    case "output.pdfResult": {
      if (state.output.stamp?.id !== event.operationId || state.output.phase !== "savingPdf") return { state, effects: [] };
      return { state: notice({ ...state, output: { ...state.output, phase: "idle", mode: undefined, stamp: undefined } }, event.saved
        ? `Exported ${event.saved.displayName} without changing the document.`
        : "PDF export canceled. The document was not changed."), effects: [] };
    }
    case "output.failed": {
      if (state.output.stamp?.id !== event.operationId || state.output.mode !== event.mode) return { state, effects: [] };
      return { state: notice({ ...state, output: { ...state.output, phase: "idle", mode: undefined, stamp: undefined, snapshot: undefined } }, `${event.mode === "print" ? "Print" : "PDF export"} failed: ${event.error}`), effects: [] };
    }
    case "overlay.openFind":
      return { state: { ...state, overlay: { type: "find", query: "", replacement: "", index: 0, count: 0 } }, effects: [
        { type: "editor.dispatch", instruction: { type: "find.set", query: "", index: 0 } },
      ] };
    case "overlay.findQuery": {
      if (state.overlay.type !== "find") return { state, effects: [] };
      const index = event.index ?? 0;
      return { state: { ...state, overlay: { ...state.overlay, query: event.query, index } }, effects: [
        { type: "editor.dispatch", instruction: { type: "find.set", query: event.query, index } },
      ] };
    }
    case "overlay.findReplacement":
      return state.overlay.type === "find"
        ? { state: { ...state, overlay: { ...state.overlay, replacement: event.replacement } }, effects: [] }
        : { state, effects: [] };
    case "overlay.findResult":
      return state.overlay.type === "find"
        ? { state: { ...state, overlay: { ...state.overlay, ...event.result } }, effects: [] }
        : { state, effects: [] };
    case "overlay.findReplace":
      return state.overlay.type === "find" ? { state, effects: [{
        type: "editor.dispatch",
        instruction: { type: "find.replace", query: state.overlay.query, replacement: state.overlay.replacement, index: state.overlay.index },
      }] } : { state, effects: [] };
    case "overlay.findReplaceAll":
      return state.overlay.type === "find" ? { state, effects: [{
        type: "editor.dispatch",
        instruction: { type: "find.replaceAll", query: state.overlay.query, replacement: state.overlay.replacement },
      }] } : { state, effects: [] };
    case "overlay.findReplaceAllResult":
      return state.overlay.type === "find"
        ? { state: notice({ ...state, overlay: { ...state.overlay, ...event.result } }, `Replaced ${event.replacements} occurrence${event.replacements === 1 ? "" : "s"}.`), effects: [] }
        : { state, effects: [] };
    case "overlay.closeFind":
      return state.overlay.type === "find" ? { state: { ...state, overlay: { type: "none" } }, effects: [
        { type: "editor.dispatch", instruction: { type: "find.set", query: "", index: 0 } },
        { type: "editor.dispatch", instruction: { type: "focus" } },
      ] } : { state, effects: [] };
    case "overlay.openParagraph":
      return { state: { ...state, overlay: { type: "paragraph", draft: {
        lineHeight: state.formatting.lineHeight,
        spaceBefore: state.formatting.spaceBefore,
        spaceAfter: state.formatting.spaceAfter,
      } } }, effects: [] };
    case "overlay.paragraphDraft":
      return state.overlay.type === "paragraph"
        ? { state: { ...state, overlay: { ...state.overlay, draft: event.draft } }, effects: [] }
        : { state, effects: [] };
    case "overlay.applyParagraph":
      return state.overlay.type === "paragraph"
        ? { state: { ...state, overlay: { type: "none" } }, effects: [
          { type: "editor.dispatch", instruction: { type: "format.paragraph", settings: state.overlay.draft } },
        ] }
        : { state, effects: [] };
    case "overlay.closeParagraph":
      return state.overlay.type === "paragraph"
        ? { state: { ...state, overlay: { type: "none" } }, effects: [] }
        : { state, effects: [] };
    case "overlay.openCredits":
      return state.overlay.type === "confirm" || state.overlay.type === "paragraph"
        ? { state, effects: [] }
        : {
          state: { ...state, overlay: { type: "credits" } },
          effects: state.overlay.type === "find"
            ? [{ type: "editor.dispatch", instruction: { type: "find.set", query: "", index: 0 } }]
            : [],
        };
    case "overlay.closeCredits":
      return state.overlay.type === "credits"
        ? { state: { ...state, overlay: { type: "none" } }, effects: [] }
        : { state, effects: [] };
    case "credits.openLink": {
      if (state.overlay.type !== "credits" || state.overlay.link) return { state, effects: [] };
      const stamp = operationStamp(state);
      return {
        state: advance({ ...state, overlay: { type: "credits", link: { target: event.target, stamp } } }),
        effects: [{ type: "external.open", target: event.target, stamp }],
      };
    }
    case "credits.linkOpened":
      return state.overlay.type === "credits" && state.overlay.link?.stamp.id === event.operationId
        ? { state: { ...state, overlay: { type: "credits" } }, effects: [] }
        : { state, effects: [] };
    case "credits.linkFailed":
      if (state.overlay.type !== "credits" || state.overlay.link?.stamp.id !== event.operationId) {
        return { state, effects: [] };
      } else {
        const message = `Could not open the website: ${event.error}`;
        const next = { ...state, overlay: { type: "credits" as const, error: message } };
        return {
          state: state.notice.id === state.overlay.link.stamp.noticeId ? notice(next, message) : next,
          effects: [],
        };
      }
    case "editor.command":
      return { state, effects: [{ type: "editor.dispatch", instruction: event.instruction }] };
    case "editor.promptLink":
      return { state, effects: [{ type: "prompt.link" }] };
    case "editor.linkResolved":
      return event.href === null
        ? { state, effects: [] }
        : { state, effects: [{ type: "editor.dispatch", instruction: event.href.trim()
          ? { type: "format.link", href: event.href.trim() }
          : { type: "format.link.remove" } }] };
  }
}
