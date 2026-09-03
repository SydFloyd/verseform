import { contentHash, createVerseformDocument } from "../core/document";
import { isLookupFresh } from "../core/lookup";
import type { DetectedReference, ReferenceCandidate } from "../core/reference";
import type { EditorGateway, FindResult, ParagraphSettings } from "../editor/gateway";
import type { RuntimeAdapters, Translation } from "./ports";
import {
  COMMAND_IDS,
  commandForKeyStroke,
  eventForCommand,
  type CommandPayload,
  type KeyStroke,
  type WorkspaceCommandId,
} from "./commands";
import { selectActiveTranslation, selectCommandEnabled, selectDiagnostics, selectDirty, selectViewModel, type DiagnosticSnapshot, type WorkspaceViewModel } from "./selectors";
import {
  createInitialWorkspace,
  transition,
  type CapturePurpose,
  type OperationStamp,
  type WorkspaceEffect,
  type WorkspaceEvent,
  type WorkspaceState,
} from "./workspace";

export interface WorkspaceScheduler {
  schedule(delayMs: number, callback: () => void): unknown;
  cancel(handle: unknown): void;
  afterPaint(callback: () => void): unknown;
}

export interface WorkspaceHost {
  onBeforeUnload(shouldBlock: () => boolean): () => void;
  onKeyStroke(handler: (stroke: KeyStroke) => boolean): () => void;
  promptForLink(current: string): string | null;
  publishDiagnostics(snapshot: DiagnosticSnapshot): void;
}

export type WorkspaceControllerDependencies = {
  runtime: RuntimeAdapters;
  scheduler: WorkspaceScheduler;
  host: WorkspaceHost;
  fallback: Translation;
  now?: () => Date;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export class WorkspaceController {
  private state: WorkspaceState;
  private view: WorkspaceViewModel;
  private readonly listeners = new Set<() => void>();
  private readonly timers = new Map<"recovery" | "autosave", unknown>();
  private readonly aborts = new Map<"catalog" | "preview", AbortController>();
  private readonly disposers: Array<() => void> = [];
  private editor?: EditorGateway;
  private detachEditor?: () => void;
  private started = false;

  constructor(private readonly dependencies: WorkspaceControllerDependencies) {
    this.state = createInitialWorkspace(dependencies.runtime.kind, dependencies.fallback);
    this.view = selectViewModel(this.state);
  }

  getState = (): WorkspaceState => this.state;

  getView = (): WorkspaceViewModel => this.view;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start(): void {
    if (this.started) return;
    this.started = true;
    this.disposers.push(this.dependencies.host.onBeforeUnload(() => selectDirty(this.state)));
    this.disposers.push(this.dependencies.host.onKeyStroke((stroke) => {
      const command = commandForKeyStroke(stroke);
      if (!command) return false;
      this.execute(command);
      return true;
    }));
    void this.dependencies.runtime.window.onCloseRequested(() => {
      this.send({ type: "document.request", action: { type: "close" } });
    }).then((dispose) => this.disposers.push(dispose)).catch(() => undefined);
    this.send({ type: "app.started" });
  }

  destroy(): void {
    this.detachEditor?.();
    this.detachEditor = undefined;
    this.editor = undefined;
    for (const handle of this.timers.values()) this.dependencies.scheduler.cancel(handle);
    this.timers.clear();
    for (const abort of this.aborts.values()) abort.abort();
    this.aborts.clear();
    for (const dispose of this.disposers.splice(0)) dispose();
    this.started = false;
  }

  attachEditor(gateway: EditorGateway | undefined): void {
    this.detachEditor?.();
    this.detachEditor = undefined;
    this.editor = gateway;
    if (!gateway) {
      this.send({ type: "editor.detached" });
      return;
    }
    gateway.setCanon(selectActiveTranslation(this.state).canon);
    this.detachEditor = gateway.subscribe((observation) => this.send({
      type: "editor.observed",
      ...observation,
    }));
    this.send({ type: "editor.ready" });
  }

  execute(id: WorkspaceCommandId, payload?: CommandPayload): void {
    const event = eventForCommand(this.state, id, payload);
    if (event) this.send(event);
  }

  isEnabled(id: WorkspaceCommandId): boolean {
    return selectCommandEnabled(this.state, id);
  }

  focusEditor(position?: "start"): void {
    this.send({ type: "editor.command", instruction: { type: "focus", position } });
  }

  send(event: WorkspaceEvent): void {
    if (event.type === "scripture.hover" || event.type === "scripture.leave" || event.type === "scripture.select") {
      this.aborts.get("preview")?.abort();
      this.aborts.delete("preview");
    }
    const result = transition(this.state, event);
    if (result.state !== this.state) {
      this.state = result.state;
      this.publish();
    }
    for (const effect of result.effects) this.run(effect);
  }

  resolveConfirmation(choice: "save" | "discard" | "cancel"): void {
    this.send({ type: "document.confirm", choice });
  }

  restoreRecovery(index = 0): void {
    const recovery = this.state.library.recoveries[index];
    if (!recovery) return;
    const displayName = this.state.library.recent.find((item) => item.path === recovery.sourcePath)?.displayName
      ?? "Recovered.verseform";
    this.send({ type: "recovery.restore", recovery, displayName });
  }

  discardRecovery(index = 0): void {
    const recovery = this.state.library.recoveries[index];
    if (recovery) this.send({ type: "recovery.discard", recovery });
  }

  selectTranslation(translationId: string): void {
    this.send({ type: "scripture.select", translationId });
  }

  referenceHover(candidate: DetectedReference, position: { top: number; left: number }): void {
    const current = this.state.scripture.preview?.candidate;
    const same = current
      && current.kind === candidate.kind
      && current.from === candidate.from
      && current.to === candidate.to
      && current.sourceText === candidate.sourceText;
    if (!same) this.send({ type: "scripture.hover", candidate, ...position });
  }

  referenceLeave(): void {
    this.send({ type: "scripture.leave" });
  }

  referenceClick(candidate: ReferenceCandidate): void {
    this.send({ type: "scripture.insertRequest", candidate });
  }

  updateFind(query: string, index?: number): void {
    this.send({ type: "overlay.findQuery", query, index });
  }

  updateReplacement(replacement: string): void {
    this.send({ type: "overlay.findReplacement", replacement });
  }

  replaceFind(): void {
    this.send({ type: "overlay.findReplace" });
  }

  replaceAllFind(): void {
    this.send({ type: "overlay.findReplaceAll" });
  }

  closeFind(): void {
    this.send({ type: "overlay.closeFind" });
  }

  updateParagraph(draft: ParagraphSettings): void {
    this.send({ type: "overlay.paragraphDraft", draft });
  }

  closeParagraph(): void {
    this.send({ type: "overlay.closeParagraph" });
  }

  applyParagraph(): void {
    this.send({ type: "overlay.applyParagraph" });
  }

  private publish(): void {
    this.view = selectViewModel(this.state);
    this.dependencies.host.publishDiagnostics(selectDiagnostics(this.state, COMMAND_IDS));
    for (const listener of this.listeners) listener();
  }

  private capture(stamp: OperationStamp, purpose: CapturePurpose): void {
    if (!this.editor) {
      this.send({ type: "editor.captureFailed", stamp, purpose, error: "The editor is not ready." });
      return;
    }
    try {
      const document = createVerseformDocument(
        this.editor.freeze(),
        this.state.document.identity,
        this.dependencies.now?.() ?? new Date(),
      );
      this.send({ type: "editor.captured", stamp, purpose, document });
    } catch (error) {
      this.send({ type: "editor.captureFailed", stamp, purpose, error: errorMessage(error) });
    }
  }

  private run(effect: WorkspaceEffect): void {
    const runtime = this.dependencies.runtime;
    switch (effect.type) {
      case "library.listRecent":
        void runtime.documents.listRecent()
          .then((recent) => this.send({ type: "library.recentResult", operationId: effect.stamp.id, recent }))
          .catch((error: unknown) => this.send({ type: "library.recentFailed", operationId: effect.stamp.id, error: errorMessage(error) }));
        return;
      case "library.listRecoveries":
        void runtime.documents.listRecoveries()
          .then((recoveries) => this.send({ type: "library.recoveryResult", operationId: effect.stamp.id, recoveries }))
          .catch((error: unknown) => this.send({ type: "library.recoveryFailed", operationId: effect.stamp.id, error: errorMessage(error) }));
        return;
      case "scripture.loadCatalog": {
        this.aborts.get("catalog")?.abort();
        const abort = new AbortController();
        this.aborts.set("catalog", abort);
        void Promise.all([
          runtime.scripture.listTranslations(abort.signal),
          runtime.preferences.getPreferredTranslation(),
        ]).then(([catalog, preferred]) => {
          if (!abort.signal.aborted) this.send({ type: "scripture.catalogResult", operationId: effect.stamp.id, catalog, preferred });
        }).catch((error: unknown) => {
          if (!abort.signal.aborted) this.send({ type: "scripture.catalogFailed", operationId: effect.stamp.id, error: errorMessage(error) });
        });
        return;
      }
      case "window.title":
        void runtime.window.setTitle(effect.title).catch(() => undefined);
        return;
      case "timer.cancel": {
        const handle = this.timers.get(effect.timer);
        if (handle !== undefined) this.dependencies.scheduler.cancel(handle);
        this.timers.delete(effect.timer);
        return;
      }
      case "timer.schedule": {
        const prior = this.timers.get(effect.timer);
        if (prior !== undefined) this.dependencies.scheduler.cancel(prior);
        const handle = this.dependencies.scheduler.schedule(effect.delayMs, () => {
          this.timers.delete(effect.timer);
          this.send({ type: "timer.fired", timer: effect.timer, operationId: effect.stamp.id });
        });
        this.timers.set(effect.timer, handle);
        return;
      }
      case "editor.capture": this.capture(effect.stamp, effect.purpose); return;
      case "editor.dispatch": {
        if (!this.editor) return;
        if (effect.instruction.type === "references.refresh") {
          this.editor.setCanon(selectActiveTranslation(this.state).canon);
          return;
        }
        const result = this.editor.dispatch(effect.instruction);
        if (effect.instruction.type === "find.set" || effect.instruction.type === "find.replace") {
          if (result && "count" in result) this.send({ type: "overlay.findResult", result });
        } else if (effect.instruction.type === "find.replaceAll" && result && "replacements" in result) {
          const find = this.state.overlay.type === "find"
            ? this.editor.dispatch({ type: "find.set", query: this.state.overlay.query, index: 0 })
            : undefined;
          const findResult: FindResult = find && "count" in find ? find : { count: 0, index: 0 };
          this.send({ type: "overlay.findReplaceAllResult", replacements: result.replacements, result: findResult });
        }
        return;
      }
      case "document.writeRecovery":
        void runtime.documents.writeRecovery({ ...effect.snapshot, capturedAtMs: (this.dependencies.now?.() ?? new Date()).getTime() })
          .then(() => this.send({ type: "persistence.recoveryWritten", operationId: effect.stamp.id }))
          .catch((error: unknown) => this.send({ type: "persistence.recoveryFailed", operationId: effect.stamp.id, error: errorMessage(error) }));
        return;
      case "document.save":
        void runtime.documents.save(effect.path, effect.document)
          .then((saved) => this.send({ type: "persistence.saved", operationId: effect.stamp.id, document: effect.document, saved, autosave: effect.autosave }))
          .catch((error: unknown) => this.send({ type: "persistence.saveFailed", operationId: effect.stamp.id, error: errorMessage(error), autosave: effect.autosave }));
        return;
      case "document.saveAs":
        void runtime.documents.saveAs(effect.document, effect.suggestedName)
          .then((saved) => saved
            ? this.send({ type: "persistence.saved", operationId: effect.stamp.id, document: effect.document, saved, autosave: false })
            : this.send({ type: "persistence.saveCanceled", operationId: effect.stamp.id }))
          .catch((error: unknown) => this.send({ type: "persistence.saveFailed", operationId: effect.stamp.id, error: errorMessage(error), autosave: false }));
        return;
      case "document.open":
        void runtime.documents.openWithDialog()
          .then((opened) => opened
            ? this.send({ type: "document.opened", operationId: effect.stamp.id, opened, contentHash: contentHash(opened.document.content) })
            : this.send({ type: "document.openCanceled", operationId: effect.stamp.id }))
          .catch((error: unknown) => this.send({ type: "document.openFailed", operationId: effect.stamp.id, error: errorMessage(error) }));
        return;
      case "document.openRecent":
        void runtime.documents.openRecent(effect.path)
          .then((opened) => this.send({ type: "document.opened", operationId: effect.stamp.id, opened, contentHash: contentHash(opened.document.content) }))
          .catch((error: unknown) => this.send({ type: "document.openFailed", operationId: effect.stamp.id, error: errorMessage(error) }));
        return;
      case "document.discardRecovery":
        void runtime.documents.discardRecovery(effect.documentId).catch(() => undefined);
        return;
      case "window.close": void runtime.window.close().catch(() => undefined); return;
      case "preference.saveTranslation":
        void runtime.preferences.setPreferredTranslation(effect.translationId)
          .then(() => this.send({ type: "scripture.preferenceSaved", operationId: effect.stamp.id, translationId: effect.translationId }))
          .catch((error: unknown) => this.send({ type: "scripture.preferenceFailed", operationId: effect.stamp.id, error: errorMessage(error) }));
        return;
      case "scripture.lookupPreview": {
        this.aborts.get("preview")?.abort();
        const abort = new AbortController();
        this.aborts.set("preview", abort);
        void runtime.scripture.getPassage(effect.candidate.reference, effect.stamp.translationId!, abort.signal)
          .then((passage) => this.send({ type: "scripture.previewResult", operationId: effect.stamp.id, passage }))
          .catch((error: unknown) => this.send({ type: "scripture.previewFailed", operationId: effect.stamp.id, error: errorMessage(error), aborted: abort.signal.aborted }));
        return;
      }
      case "scripture.lookupInsertion":
        void runtime.scripture.getPassage(effect.candidate.reference, effect.stamp.translationId!)
          .then((passage) => this.send({ type: "scripture.insertionResult", operationId: effect.stamp.id, passage }))
          .catch((error: unknown) => this.send({ type: "scripture.insertionFailed", operationId: effect.stamp.id, error: errorMessage(error) }));
        return;
      case "scripture.verifyInsertion": {
        const sourceText = this.editor?.readRange(effect.request.from, effect.request.to) ?? "";
        const fresh = isLookupFresh(effect.request, this.state.document.revision, sourceText);
        this.send({ type: "scripture.insertionVerified", operationId: effect.stamp.id, fresh });
        return;
      }
      case "output.afterPaint": {
        this.dependencies.scheduler.afterPaint(() => this.dependencies.scheduler.afterPaint(() => {
          this.send({ type: "output.paintReady", operationId: effect.stamp.id, mode: effect.mode });
        }));
        return;
      }
      case "output.print":
        void runtime.output.print(effect.snapshot)
          .then(() => this.send({ type: "output.printed", operationId: effect.stamp.id }))
          .catch((error: unknown) => this.send({ type: "output.failed", operationId: effect.stamp.id, mode: "print", error: errorMessage(error) }));
        return;
      case "output.savePdf":
        void runtime.output.savePdf(effect.snapshot, effect.suggestedName)
          .then((saved) => this.send({ type: "output.pdfResult", operationId: effect.stamp.id, saved }))
          .catch((error: unknown) => this.send({ type: "output.failed", operationId: effect.stamp.id, mode: "pdf", error: errorMessage(error) }));
        return;
      case "prompt.link": {
        const href = this.dependencies.host.promptForLink(this.editor?.linkHref() ?? "https://");
        this.send({ type: "editor.linkResolved", href });
      }
    }
  }
}
