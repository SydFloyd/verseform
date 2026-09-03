import type { EditorFormatting } from "../editor/gateway";
import type { Translation } from "./ports";
import type { WorkspaceCommandId } from "./commands";
import type { PreviewState, WorkspaceOverlay, WorkspaceState } from "./workspace";
import { creditsFor, type CreditsModel } from "./credits";

export function selectDirty(state: WorkspaceState): boolean {
  return state.document.currentHash !== state.document.savedHash;
}

export function selectWindowTitle(state: WorkspaceState): string {
  return `${state.document.displayName}${selectDirty(state) ? " — Unsaved changes" : ""} — Verseform`;
}

export function selectActiveTranslation(state: WorkspaceState): Translation {
  return state.scripture.translations.find((item) => item.id === state.scripture.selectedId)
    ?? state.scripture.fallback;
}

export function selectCommandEnabled(state: WorkspaceState, command: WorkspaceCommandId): boolean {
  if (state.overlay.type === "confirm" || state.overlay.type === "paragraph" || state.overlay.type === "pdfExport" || state.overlay.type === "credits") return false;
  if (command === "file.new" || command === "file.open" || command === "file.openRecent") {
    return state.editorReady;
  }
  if (command === "edit.undo") return state.editorReady && state.formatting.canUndo;
  if (command === "edit.redo") return state.editorReady && state.formatting.canRedo;
  if (command === "file.print" || command === "file.savePdf" || command === "file.pageNumbers") {
    return state.editorReady && state.output.phase === "idle";
  }
  if (command === "file.save" || command === "file.saveAs") {
    return state.editorReady && !state.persistence.save;
  }
  if (command.startsWith("format.") || command === "edit.find" || command === "edit.paragraph") {
    return state.editorReady;
  }
  return true;
}

export type WorkspaceViewModel = {
  displayName: string;
  dirty: boolean;
  status: string;
  recent: WorkspaceState["library"]["recent"];
  recoveries: WorkspaceState["library"]["recoveries"];
  translations: Translation[];
  translationId: string;
  catalogOffline: boolean;
  preview?: PreviewState;
  pageNumbers: boolean;
  outputBusy: boolean;
  printSnapshot: WorkspaceState["output"]["snapshot"];
  overlay: WorkspaceOverlay;
  formatting: EditorFormatting;
  credits: CreditsModel;
};

export function selectViewModel(state: WorkspaceState): WorkspaceViewModel {
  return {
    displayName: state.document.displayName,
    dirty: selectDirty(state),
    status: state.notice.message,
    recent: state.library.recent,
    recoveries: state.library.recoveries,
    translations: state.scripture.translations,
    translationId: state.scripture.selectedId,
    catalogOffline: state.scripture.catalogPhase === "offline",
    preview: state.scripture.preview,
    pageNumbers: state.output.pageNumbers,
    outputBusy: state.output.phase !== "idle",
    printSnapshot: state.output.snapshot,
    overlay: state.overlay,
    formatting: state.formatting,
    credits: creditsFor(selectActiveTranslation(state)),
  };
}

export type DiagnosticSnapshot = {
  version: 1;
  document: { revision: number; currentHash: string; savedHash: string; dirty: boolean };
  phases: {
    recovery: string;
    autosave: string;
    save: string;
    catalog: string;
    preview: string;
    insertion: string;
    output: string;
    overlay: WorkspaceOverlay["type"];
  };
  translationId: string;
  enabledCommands: WorkspaceCommandId[];
  pendingOperationIds: number[];
};

export function selectDiagnostics(
  state: WorkspaceState,
  commandIds: readonly WorkspaceCommandId[],
): DiagnosticSnapshot {
  const pendingOperationIds = [
    state.persistence.recovery?.stamp.id,
    state.persistence.autosave?.stamp.id,
    state.persistence.save?.stamp.id,
    state.document.operation?.stamp.id,
    state.scripture.previewOperation?.stamp.id,
    state.scripture.insertion?.stamp.id,
    state.output.stamp?.id,
    state.library.recentOperationId,
    state.library.recoveryOperationId,
    state.scripture.catalogOperationId,
    state.scripture.preferenceOperationId,
    state.overlay.type === "credits" ? state.overlay.link?.stamp.id : undefined,
  ].filter((value): value is number => value !== undefined);
  return {
    version: 1,
    document: {
      revision: state.document.revision,
      currentHash: state.document.currentHash,
      savedHash: state.document.savedHash,
      dirty: selectDirty(state),
    },
    phases: {
      recovery: state.persistence.recovery?.phase ?? "idle",
      autosave: state.persistence.autosave?.phase ?? "idle",
      save: state.persistence.save?.phase ?? "idle",
      catalog: state.scripture.catalogPhase,
      preview: state.scripture.previewOperation ? "loading" : "idle",
      insertion: state.scripture.insertion?.phase ?? "idle",
      output: state.output.phase,
      overlay: state.overlay.type,
    },
    translationId: state.scripture.selectedId,
    enabledCommands: commandIds.filter((id) => selectCommandEnabled(state, id)),
    pendingOperationIds,
  };
}
