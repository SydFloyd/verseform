import TextAlign from "@tiptap/extension-text-align";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { TextStyleKit } from "@tiptap/extension-text-style";
import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OpenedDocument, Passage, RecentDocument, RecoverySnapshot, Translation } from "../app/ports";
import { selectInitialTranslation } from "../app/translationSelection";
import { createRuntimeAdapters } from "../adapters/runtime";
import { WEB_TRANSLATION } from "../adapters/webScriptureProvider";
import {
  contentHash, createVerseformDocument, type EditorNode, type VerseformDocument,
} from "../core/document";
import { isLookupFresh, type LookupRequest } from "../core/lookup";
import { buildPrintSnapshot, type PrintSnapshot } from "../core/output";
import { Citation } from "../editor/Citation";
import { cleanPastedHtml } from "../editor/cleanPaste";
import { DocumentLimits } from "../editor/DocumentLimits";
import {
  FindReplace, findMatches, replaceAllMatches, replaceMatch, setFindState,
} from "../editor/FindReplace";
import { ParagraphStyle } from "../editor/ParagraphStyle";
import {
  ReferenceDecorations, refreshReferenceDecorations,
  type PositionedReference, type PositionedValidReference,
} from "../editor/ReferenceDecorations";
import { insertPassage } from "../editor/insertPassage";

type PreviewState = {
  candidate: PositionedReference; top: number; left: number; loading: boolean;
  passage?: Passage; error?: string;
};
type Session = {
  document?: VerseformDocument; path?: string; displayName: string; savedHash?: string;
};
type PendingAction = { type: "new" | "open" | "recent" | "close"; path?: string };
type MenuName = "file" | "edit";
type Alignment = "left" | "center" | "right" | "justify";
type ParagraphSettings = { lineHeight: string; spaceBefore: number; spaceAfter: number };

const emptyDocument: EditorNode = { type: "doc", content: [{ type: "paragraph" }] };
const fonts = ["Garamond", "Georgia", "Arial", "Calibri", "Times New Roman", "Verdana"];
const sizes = ["10pt", "11pt", "12pt", "14pt", "18pt", "24pt"];
const paragraphSpacing = [0, 6, 8, 12, 18, 24];
const defaultParagraph: ParagraphSettings = { lineHeight: "1.5", spaceBefore: 0, spaceAfter: 0 };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function ToolbarButton({ editor, command, active, children, title }: {
  editor: Editor | null; command: () => void; active?: boolean; children: React.ReactNode; title: string;
}) {
  return <button type="button" onClick={command} aria-label={title} aria-pressed={active} title={title}>{children}</button>;
}

function ToolbarMenu({ id, label, open, buttonRef, onToggle, children }: {
  id: string;
  label: string;
  open: boolean;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  onToggle: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const focusItem = (menu: HTMLElement, direction: 1 | -1, current?: Element | null) => {
    const items = Array.from(menu.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])'));
    if (!items.length) return;
    const currentIndex = current ? items.indexOf(current as HTMLElement) : -1;
    const nextIndex = currentIndex < 0
      ? direction > 0 ? 0 : items.length - 1
      : (currentIndex + direction + items.length) % items.length;
    items[nextIndex].focus();
  };
  return <div className="menu-container" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) onToggle(false);
  }}>
    <button
      ref={buttonRef}
      type="button"
      className="menu-trigger"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={id}
      onClick={() => onToggle(!open)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          onToggle(false);
          return;
        }
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        onToggle(true);
        requestAnimationFrame(() => {
          const menu = document.getElementById(id);
          if (menu) focusItem(menu, event.key === "ArrowDown" ? 1 : -1);
        });
      }}
    >{label}<span aria-hidden="true">⌄</span></button>
    {open ? <div id={id} className="app-menu" role="menu" aria-label={`${label} menu`} onKeyDown={(event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onToggle(false);
        buttonRef.current?.focus();
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        focusItem(event.currentTarget, event.key === "ArrowDown" ? 1 : -1, document.activeElement);
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        focusItem(event.currentTarget, event.key === "Home" ? 1 : -1);
      }
    }}>{children}</div> : null}
  </div>;
}

function MenuItem({ children, shortcut, onClick, disabled, checked }: {
  children: React.ReactNode;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  checked?: boolean;
}) {
  return <button
    type="button"
    role={checked === undefined ? "menuitem" : "menuitemcheckbox"}
    aria-checked={checked}
    aria-keyshortcuts={shortcut?.replace("Ctrl", "Control")}
    disabled={disabled}
    onClick={onClick}
  ><span>{children}</span>{shortcut ? <kbd>{shortcut}</kbd> : null}</button>;
}

function AlignmentIcon({ alignment }: { alignment: Alignment }) {
  const widths = alignment === "justify" ? [16, 16, 16, 16] : [16, 11, 16, 12];
  return <svg className="toolbar-icon" viewBox="0 0 20 20" aria-hidden="true">
    {widths.map((width, index) => {
      const x = alignment === "center" ? (20 - width) / 2 : alignment === "right" ? 18 - width : 2;
      return <line key={index} x1={x} x2={x + width} y1={4 + index * 4} y2={4 + index * 4} />;
    })}
  </svg>;
}

function ListIcon({ ordered }: { ordered?: boolean }) {
  return <svg className="toolbar-icon" viewBox="0 0 20 20" aria-hidden="true">
    {ordered
      ? <><text x="1.5" y="6">1</text><text x="1.5" y="12">2</text><text x="1.5" y="18">3</text></>
      : <><circle cx="3" cy="4" r="1" /><circle cx="3" cy="10" r="1" /><circle cx="3" cy="16" r="1" /></>}
    <line x1="7" x2="18" y1="4" y2="4" />
    <line x1="7" x2="18" y1="10" y2="10" />
    <line x1="7" x2="18" y1="16" y2="16" />
  </svg>;
}

function LinkIcon() {
  return <svg className="toolbar-icon" viewBox="0 0 20 20" aria-hidden="true">
    <path d="M8.1 12.7 6.4 14.4a3.1 3.1 0 0 1-4.4-4.4l3-3a3.1 3.1 0 0 1 4.4 0" />
    <path d="m11.9 7.3 1.7-1.7A3.1 3.1 0 0 1 18 10l-3 3a3.1 3.1 0 0 1-4.4 0" />
    <line x1="7" x2="13" y1="10" y2="10" />
  </svg>;
}

function ColorIcon({ color, highlight }: { color: string; highlight?: boolean }) {
  return <svg className="toolbar-icon" viewBox="0 0 20 20" aria-hidden="true">
    {highlight ? <rect x="3" y="2" width="14" height="15" rx="2" fill={color} stroke="none" /> : null}
    <path d="M5 15 10 3l5 12M7 10h6" />
    {!highlight ? <rect x="3" y="17" width="14" height="2" fill={color} stroke="none" /> : null}
  </svg>;
}

function trapFocus(
  event: React.KeyboardEvent<HTMLElement>,
  container: HTMLElement | null,
  onEscape: () => void,
) {
  if (event.key === "Escape") {
    event.preventDefault();
    onEscape();
    return;
  }
  if (event.key !== "Tab") return;
  const controls = Array.from(container?.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ) ?? []);
  if (!controls.length) return;
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault(); first.focus();
  }
}

export function App() {
  const runtime = useMemo(createRuntimeAdapters, []);
  const revision = useRef(0);
  const session = useRef<Session>({ displayName: "Untitled.verseform" });
  const dirtyRef = useRef(false);
  const recoveryTimer = useRef<number | undefined>(undefined);
  const autosaveTimer = useRef<number | undefined>(undefined);
  const persistenceOperation = useRef(0);
  const hoverRequest = useRef(0);
  const activeTranslation = useRef<Translation>(WEB_TRANSLATION);
  const activeHover = useRef<string | undefined>(undefined);
  const hoverAbort = useRef<AbortController | undefined>(undefined);
  const hoverHandler = useRef<(candidate: PositionedReference, rect: DOMRect) => void>(() => undefined);
  const leaveHandler = useRef<() => void>(() => undefined);
  const clickHandler = useRef<(candidate: PositionedValidReference) => void>(() => undefined);
  const dialogRef = useRef<HTMLElement | null>(null);
  const dialogReturnFocus = useRef<HTMLElement | null>(null);
  const paragraphDialogRef = useRef<HTMLElement | null>(null);
  const paragraphReturnFocus = useRef<HTMLElement | null>(null);
  const fileMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const editMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const statusRevision = useRef(0);
  const [preview, setPreview] = useState<PreviewState>();
  const [status, setStatusValue] = useState(runtime.kind === "tauri" ? "Desktop mode · ready" : "Browser harness · ready");
  const [pageNumbers, setPageNumbers] = useState(false);
  const [printSnapshot, setPrintSnapshot] = useState<PrintSnapshot>();
  const [outputBusy, setOutputBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [displayName, setDisplayName] = useState("Untitled.verseform");
  const [recent, setRecent] = useState<RecentDocument[]>([]);
  const [recoveries, setRecoveries] = useState<RecoverySnapshot[]>([]);
  const [pendingAction, setPendingAction] = useState<PendingAction>();
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [findIndex, setFindIndex] = useState(0);
  const [findCount, setFindCount] = useState(0);
  const [openMenu, setOpenMenu] = useState<MenuName>();
  const [paragraphOpen, setParagraphOpen] = useState(false);
  const [paragraphDraft, setParagraphDraft] = useState<ParagraphSettings>(defaultParagraph);
  const [translations, setTranslations] = useState<Translation[]>([WEB_TRANSLATION]);
  const [translationId, setTranslationId] = useState(WEB_TRANSLATION.id);
  const [catalogOffline, setCatalogOffline] = useState(false);

  const setStatus = useCallback((message: string) => {
    statusRevision.current += 1;
    setStatusValue(message);
  }, []);

  const markDirty = useCallback((value: boolean) => {
    dirtyRef.current = value;
    setDirty(value);
  }, []);

  const refreshRecent = useCallback(async () => {
    try { setRecent(await runtime.documents.listRecent()); }
    catch (error) { setStatus(`Recent files unavailable: ${errorMessage(error)}`); }
  }, [runtime]);

  const queuePersistence = useCallback((editor: Editor) => {
    const operation = ++persistenceOperation.current;
    const queuedStatusRevision = statusRevision.current;
    window.clearTimeout(recoveryTimer.current);
    window.clearTimeout(autosaveTimer.current);
    recoveryTimer.current = window.setTimeout(() => {
      const document = createVerseformDocument(editor.getJSON() as EditorNode, session.current.document);
      session.current = { ...session.current, document };
      const hash = contentHash(document.content);
      void runtime.documents.writeRecovery({
        document, sourcePath: session.current.path, savedContentHash: session.current.savedHash,
        contentHash: hash, capturedAtMs: Date.now(),
      }).then(() => {
        if (operation === persistenceOperation.current && queuedStatusRevision === statusRevision.current) {
          setStatusValue("Recovery copy saved locally.");
        }
      }).catch((error: unknown) => {
        if (operation === persistenceOperation.current && queuedStatusRevision === statusRevision.current) {
          setStatusValue(`Recovery failed: ${errorMessage(error)}`);
        }
      });
    }, 250);

    if (session.current.path) {
      autosaveTimer.current = window.setTimeout(() => {
        const path = session.current.path;
        if (!path) return;
        const document = createVerseformDocument(editor.getJSON() as EditorNode, session.current.document);
        const hash = contentHash(document.content);
        void runtime.documents.save(path, document).then((saved) => {
          if (operation !== persistenceOperation.current) return;
          session.current = { document, ...saved, savedHash: hash };
          setDisplayName(saved.displayName);
          if (contentHash(editor.getJSON() as EditorNode) === hash) markDirty(false);
          void runtime.documents.discardRecovery(document.documentId);
          void refreshRecent();
          if (queuedStatusRevision === statusRevision.current) setStatusValue(`Autosaved ${saved.displayName}.`);
        }).catch((error: unknown) => {
          if (queuedStatusRevision === statusRevision.current) setStatusValue(`Autosave failed: ${errorMessage(error)}`);
        });
      }, 1100);
    }
  }, [markDirty, refreshRecent, runtime]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, HTMLAttributes: { rel: "noopener noreferrer" } } }),
      TextStyleKit.configure({ lineHeight: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Subscript, Superscript, ParagraphStyle, FindReplace, Citation,
      DocumentLimits.configure({
        onLimit: () => setStatus("That change was not applied. Documents are limited to 1,000,000 characters and 50,000 content nodes."),
      }),
      ReferenceDecorations.configure({
        onHover: (candidate, rect) => hoverHandler.current(candidate, rect),
        onLeave: () => leaveHandler.current(),
        onClick: (candidate) => clickHandler.current(candidate),
        getCanon: () => activeTranslation.current.canon,
      }),
    ],
    content: emptyDocument,
    editorProps: {
      attributes: {
        id: "document-editor", class: "writing-surface", role: "textbox", "aria-label": "Document editor",
        "aria-multiline": "true", spellcheck: "true",
      },
      transformPastedHTML: cleanPastedHtml,
    },
    onUpdate: ({ editor: changedEditor, transaction }) => {
      if (!transaction.docChanged) return;
      revision.current += 1;
      markDirty(true);
      queuePersistence(changedEditor);
    },
  });

  const formatting = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const textStyle = current?.getAttributes("textStyle") ?? {};
      const blockType = current?.isActive("heading") ? "heading" : "paragraph";
      const block = current?.getAttributes(blockType) ?? {};
      const alignment = (["left", "center", "right", "justify"] as Alignment[])
        .find((value) => current?.isActive({ textAlign: value })) ?? "left";
      return {
        fontFamily: String(textStyle.fontFamily || "Garamond"),
        fontSize: String(textStyle.fontSize || "12pt"),
        color: String(textStyle.color || "#252018"),
        backgroundColor: String(textStyle.backgroundColor || "#fff0a8"),
        lineHeight: String(block.lineHeight || defaultParagraph.lineHeight),
        spaceBefore: Number(block.spaceBefore ?? defaultParagraph.spaceBefore),
        spaceAfter: Number(block.spaceAfter ?? defaultParagraph.spaceAfter),
        alignment,
        bold: Boolean(current?.isActive("bold")),
        italic: Boolean(current?.isActive("italic")),
        underline: Boolean(current?.isActive("underline")),
        strike: Boolean(current?.isActive("strike")),
        subscript: Boolean(current?.isActive("subscript")),
        superscript: Boolean(current?.isActive("superscript")),
        link: Boolean(current?.isActive("link")),
        bulletList: Boolean(current?.isActive("bulletList")),
        orderedList: Boolean(current?.isActive("orderedList")),
        canUndo: Boolean(current?.can().undo()),
        canRedo: Boolean(current?.can().redo()),
      };
    },
  }) ?? {
    fontFamily: "Garamond", fontSize: "12pt", color: "#252018", backgroundColor: "#fff0a8",
    ...defaultParagraph, alignment: "left" as Alignment,
    bold: false, italic: false, underline: false, strike: false,
    subscript: false, superscript: false, link: false, bulletList: false, orderedList: false,
    canUndo: false, canRedo: false,
  };

  useEffect(() => {
    const windowTitle = `${displayName}${dirty ? " — Unsaved changes" : ""} — Verseform`;
    void runtime.window.setTitle(windowTitle).catch(() => undefined);
  }, [dirty, displayName, runtime]);

  useEffect(() => {
    if (!editor) return;
    void refreshRecent();
    void runtime.documents.listRecoveries().then((items) => setRecoveries(
      items.filter((item) => item.contentHash !== item.savedContentHash),
    ))
      .catch((error: unknown) => setStatus(`Recovery check failed: ${errorMessage(error)}`));
    return () => {
      window.clearTimeout(recoveryTimer.current);
      window.clearTimeout(autosaveTimer.current);
    };
  }, [editor, refreshRecent, runtime]);

  useEffect(() => {
    if (!editor) return;
    const abort = new AbortController();
    void Promise.all([
      runtime.scripture.listTranslations(abort.signal),
      runtime.preferences.getPreferredTranslation(),
    ]).then(([catalog, preferred]) => {
      if (abort.signal.aborted) return;
      const available = catalog.offline
        ? [WEB_TRANSLATION]
        : catalog.translations.length ? catalog.translations : [WEB_TRANSLATION];
      const selected = selectInitialTranslation(available, preferred) ?? WEB_TRANSLATION;
      activeTranslation.current = selected;
      setTranslations(available);
      setTranslationId(selected.id);
      setCatalogOffline(catalog.offline);
      refreshReferenceDecorations(editor);
      if (catalog.offline) setStatus(`Offline · using bundled WEB. ${catalog.message ?? ""}`.trim());
    }).catch((error: unknown) => {
      if (!abort.signal.aborted) setStatus(`Translation catalog unavailable: ${errorMessage(error)}`);
    });
    return () => abort.abort();
  }, [editor, runtime]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void runtime.window.onCloseRequested(() => {
      if (dirtyRef.current) setPendingAction({ type: "close" });
      else void runtime.window.close();
    }).then((value) => { unlisten = value; });
    return () => unlisten?.();
  }, [runtime]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === "f" || event.key.toLowerCase() === "h") {
        event.preventDefault();
        setOpenMenu(undefined);
        setFindOpen(true);
        requestAnimationFrame(() => document.getElementById("find-query")?.focus());
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, []);

  hoverHandler.current = (candidate, rect) => {
    const hoverKey = `${candidate.kind}:${candidate.from}:${candidate.to}:${candidate.sourceText}`;
    if (activeHover.current === hoverKey) return;
    activeHover.current = hoverKey;
    const requestId = ++hoverRequest.current;
    hoverAbort.current?.abort();
    const position = {
      top: Math.max(12, Math.min(rect.bottom + 10, window.innerHeight - 210)),
      left: Math.max(12, Math.min(rect.left, window.innerWidth - 390)),
    };
    if (candidate.kind === "invalid") {
      setPreview({ candidate, ...position, loading: false });
      return;
    }
    const abort = new AbortController();
    hoverAbort.current = abort;
    setPreview({ candidate, ...position, loading: true });
    const requestedTranslation = activeTranslation.current;
    void runtime.scripture.getPassage(candidate.reference, requestedTranslation.id, abort.signal).then((passage) => {
      if (requestId !== hoverRequest.current) return;
      if (passage.fallbackFrom) {
        activeTranslation.current = WEB_TRANSLATION;
        setTranslationId(WEB_TRANSLATION.id);
        setCatalogOffline(true);
        refreshReferenceDecorations(editor!);
      }
      setPreview((value) => value ? { ...value, loading: false, passage } : value);
    }).catch((error: unknown) => {
      if (!abort.signal.aborted && requestId === hoverRequest.current) {
        setPreview((value) => value ? { ...value, loading: false, error: errorMessage(error) } : value);
      }
    });
  };
  leaveHandler.current = () => { activeHover.current = undefined; hoverRequest.current += 1; hoverAbort.current?.abort(); setPreview(undefined); };
  clickHandler.current = (candidate) => {
    if (!editor) return;
    const request: LookupRequest = { ...candidate, revision: revision.current };
    const requestedTranslation = activeTranslation.current;
    setStatus(`Looking up ${candidate.display}…`);
    void runtime.scripture.getPassage(candidate.reference, requestedTranslation.id).then((passage) => {
      let sourceText = "";
      try { sourceText = editor.state.doc.textBetween(request.from, request.to, "\n", "\n"); } catch {}
      if (!isLookupFresh(request, revision.current, sourceText)) {
        setStatus("Passage not inserted: the document changed during lookup."); return;
      }
      insertPassage(editor, request, passage);
      if (passage.fallbackFrom) {
        activeTranslation.current = WEB_TRANSLATION;
        setTranslationId(WEB_TRANSLATION.id);
        setCatalogOffline(true);
        refreshReferenceDecorations(editor);
      }
      activeHover.current = undefined;
      setPreview(undefined);
      setStatus(passage.fallbackFrom
        ? `${passage.display} inserted from bundled WEB because ${passage.fallbackFrom.name} was unavailable.`
        : `${passage.display} inserted from ${passage.translationName}${passage.cached ? " (local cache)" : ""}.`);
    }).catch((error: unknown) => setStatus(`Passage not inserted: ${errorMessage(error)}`));
  };

  const loadOpened = useCallback((opened: OpenedDocument) => {
    if (!editor) return;
    window.clearTimeout(recoveryTimer.current);
    window.clearTimeout(autosaveTimer.current);
    persistenceOperation.current += 1;
    editor.commands.setContent(opened.document.content, { emitUpdate: false });
    const hash = contentHash(opened.document.content);
    session.current = { ...opened, savedHash: hash };
    setDisplayName(opened.displayName);
    markDirty(false);
    setPrintSnapshot(undefined);
    revision.current += 1;
    setStatus(`Opened ${opened.displayName}.`);
    void refreshRecent();
  }, [editor, markDirty, refreshRecent]);

  const saveDocument = useCallback(async (forceSaveAs = false): Promise<boolean> => {
    if (!editor) return false;
    try {
      window.clearTimeout(recoveryTimer.current);
      window.clearTimeout(autosaveTimer.current);
      persistenceOperation.current += 1;
      const document = createVerseformDocument(editor.getJSON() as EditorNode, session.current.document);
      const hash = contentHash(document.content);
      const saved = session.current.path && !forceSaveAs
        ? await runtime.documents.save(session.current.path, document)
        : await runtime.documents.saveAs(document, session.current.displayName);
      if (!saved) {
        if (dirtyRef.current) queuePersistence(editor);
        setStatus("Save canceled.");
        return false;
      }
      session.current = { document, ...saved, savedHash: hash };
      setDisplayName(saved.displayName);
      const isCurrent = contentHash(editor.getJSON() as EditorNode) === hash;
      if (isCurrent) {
        markDirty(false);
        await runtime.documents.discardRecovery(document.documentId);
      } else {
        queuePersistence(editor);
        setStatus("The document changed while saving; the latest recovery copy was kept.");
      }
      await refreshRecent();
      if (isCurrent) setStatus(`Saved ${saved.displayName}.`);
      return isCurrent;
    } catch (error) {
      if (dirtyRef.current) queuePersistence(editor);
      setStatus(`Save failed: ${errorMessage(error)}`);
      return false;
    }
  }, [editor, markDirty, queuePersistence, refreshRecent, runtime]);

  const performAction = useCallback(async (action: PendingAction) => {
    if (!editor) return;
    if (action.type === "new") {
      window.clearTimeout(recoveryTimer.current);
      window.clearTimeout(autosaveTimer.current);
      persistenceOperation.current += 1;
      editor.commands.setContent(emptyDocument, { emitUpdate: false });
      session.current = { displayName: "Untitled.verseform" };
      setDisplayName("Untitled.verseform"); markDirty(false); setPrintSnapshot(undefined);
      revision.current += 1; setStatus("New document."); editor.commands.focus("start");
    } else if (action.type === "open") {
      try { const opened = await runtime.documents.openWithDialog(); if (opened) loadOpened(opened); else setStatus("Open canceled."); }
      catch (error) { setStatus(`Open failed: ${errorMessage(error)}`); }
    } else if (action.type === "recent" && action.path) {
      try { loadOpened(await runtime.documents.openRecent(action.path)); }
      catch (error) { setStatus(`Open failed: ${errorMessage(error)}`); void refreshRecent(); }
    } else if (action.type === "close") await runtime.window.close();
  }, [editor, loadOpened, markDirty, refreshRecent, runtime]);

  const requestAction = (action: PendingAction, returnFocus?: HTMLElement | null) => {
    if (dirtyRef.current) {
      dialogReturnFocus.current = returnFocus ?? (document.activeElement instanceof HTMLElement
        ? document.activeElement : null);
      setPendingAction(action);
    } else void performAction(action);
  };

  const dismissDialog = () => {
    setPendingAction(undefined);
    requestAnimationFrame(() => dialogReturnFocus.current?.focus());
  };

  const resolvePending = async (choice: "save" | "discard" | "cancel") => {
    const action = pendingAction;
    if (!action) return;
    if (choice === "cancel") { dismissDialog(); return; }
    if (choice === "save" && !(await saveDocument())) return;
    if (choice === "discard" && session.current.document) {
      await runtime.documents.discardRecovery(session.current.document.documentId);
    }
    setPendingAction(undefined);
    await performAction(action);
  };

  const trapDialogKeys = (event: React.KeyboardEvent<HTMLElement>) => {
    trapFocus(event, dialogRef.current, () => { void resolvePending("cancel"); });
  };

  const freezeOutput = async (): Promise<PrintSnapshot | undefined> => {
    if (!editor) return;
    const immutable = createVerseformDocument(editor.getJSON() as EditorNode, session.current.document);
    const snapshot = buildPrintSnapshot(immutable, { pageNumbers });
    setPrintSnapshot(snapshot);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return snapshot;
  };

  const print = async () => {
    if (outputBusy) return;
    setOutputBusy(true);
    try {
      const snapshot = await freezeOutput();
      if (!snapshot) return;
      await runtime.output.print(snapshot);
      setStatus("Windows print dialog opened with an immutable attributed snapshot.");
    } catch (error) { setStatus(`Print failed: ${errorMessage(error)}`); }
    finally { setOutputBusy(false); }
  };

  const savePdf = async () => {
    if (outputBusy) return;
    setOutputBusy(true);
    try {
      const snapshot = await freezeOutput();
      if (!snapshot) return;
      const suggestedName = displayName.replace(/\.verseform$/i, "") || "Verseform";
      const saved = await runtime.output.savePdf(snapshot, suggestedName);
      setStatus(saved
        ? `Exported ${saved.displayName} without changing the document.`
        : "PDF export canceled. The document was not changed.");
    } catch (error) { setStatus(`PDF export failed: ${errorMessage(error)}`); }
    finally { setOutputBusy(false); }
  };

  const updateBlock = (attributes: Record<string, unknown>) => {
    if (!editor) return;
    const type = editor.isActive("heading") ? "heading" : "paragraph";
    editor.chain().focus().updateAttributes(type, attributes).run();
  };
  const closeParagraph = () => {
    setParagraphOpen(false);
    requestAnimationFrame(() => paragraphReturnFocus.current?.focus());
  };
  const openParagraph = () => {
    paragraphReturnFocus.current = editMenuButtonRef.current;
    setParagraphDraft({
      lineHeight: formatting.lineHeight,
      spaceBefore: formatting.spaceBefore,
      spaceAfter: formatting.spaceAfter,
    });
    setOpenMenu(undefined);
    setParagraphOpen(true);
    requestAnimationFrame(() => document.getElementById("paragraph-line-spacing")?.focus());
  };
  const applyParagraph = () => {
    updateBlock(paragraphDraft);
    closeParagraph();
  };
  const adjustIndent = (direction: 1 | -1) => {
    if (!editor) return;
    if (editor.isActive("listItem")) {
      if (direction > 0) editor.chain().focus().sinkListItem("listItem").run();
      else editor.chain().focus().liftListItem("listItem").run();
      return;
    }
    const type = editor.isActive("heading") ? "heading" : "paragraph";
    const current = Number(editor.getAttributes(type).indent ?? 0);
    updateBlock({ indent: Math.max(0, Math.min(8, current + direction)) });
  };
  const editLink = () => {
    if (!editor) return;
    const current = String(editor.getAttributes("link").href ?? "https://");
    const href = window.prompt("Link address", current);
    if (href === null) return;
    if (!href.trim()) editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
  };
  const updateFind = (query: string, index = 0) => {
    if (!editor) return;
    const matches = setFindState(editor, query, index);
    setFindQuery(query); setFindCount(matches.length);
    setFindIndex(matches.length ? ((index % matches.length) + matches.length) % matches.length : 0);
  };
  const closeFind = () => {
    setFindOpen(false);
    updateFind("");
    editor?.commands.focus();
  };
  const openFind = () => {
    setOpenMenu(undefined);
    setFindOpen(true);
    requestAnimationFrame(() => document.getElementById("find-query")?.focus());
  };

  useEffect(() => {
    const documentShortcuts = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        void saveDocument(event.shiftKey);
      } else if (key === "o") {
        event.preventDefault();
        requestAction({ type: "open" });
      } else if (key === "n") {
        event.preventDefault();
        requestAction({ type: "new" });
      } else if (key === "p") {
        event.preventDefault();
        void print();
      }
    };
    window.addEventListener("keydown", documentShortcuts);
    return () => window.removeEventListener("keydown", documentShortcuts);
  });

  const recovery = recoveries[0];
  const selectTranslation = (selectedId: string) => {
    const selected = translations.find((item) => item.id === selectedId);
    if (!selected || !editor) return;
    hoverRequest.current += 1;
    hoverAbort.current?.abort();
    setPreview(undefined);
    activeHover.current = undefined;
    activeTranslation.current = selected;
    setTranslationId(selected.id);
    setCatalogOffline(selected.id === WEB_TRANSLATION.id && catalogOffline);
    refreshReferenceDecorations(editor);
    void runtime.preferences.setPreferredTranslation(selected.id)
      .then(() => setStatus(`${selected.name} selected for scripture insertion.`))
      .catch((error: unknown) => setStatus(`Translation preference was not saved: ${errorMessage(error)}`));
  };
  return (
    <>
      <a className="skip-link" href="#document-editor" onClick={(event) => {
        event.preventDefault(); editor?.commands.focus();
      }}>Skip to document editor</a>
      <main className="app-shell" inert={pendingAction || paragraphOpen ? true : undefined}>
        <header className="app-header">
          <h1>Verseform</h1>
          <div className="document-state" aria-label="Current document">
            <strong>{displayName}</strong><span>{dirty ? "Unsaved changes" : "Saved locally"}</span>
          </div>
        </header>

        {recovery ? <section className="recovery-banner" aria-label="Recovery available">
          <div><strong>Recovered writing is available</strong><span>{new Date(recovery.capturedAtMs).toLocaleString()}</span></div>
          <button type="button" onClick={() => {
            if (!editor) return;
            const recoveredName = recent.find((item) => item.path === recovery.sourcePath)?.displayName ?? "Recovered.verseform";
            editor.commands.setContent(recovery.document.content, { emitUpdate: false });
            session.current = { document: recovery.document, path: recovery.sourcePath, displayName: recoveredName, savedHash: recovery.savedContentHash };
            setDisplayName(recoveredName); markDirty(recovery.contentHash !== recovery.savedContentHash);
            setRecoveries((items) => items.slice(1)); revision.current += 1; setStatus("Recovery restored. Save to keep it.");
          }}>Restore</button>
          <button type="button" onClick={() => void runtime.documents.discardRecovery(recovery.document.documentId).then(() => setRecoveries((items) => items.slice(1)))}>Discard</button>
        </section> : null}

        <nav className="toolbar document-toolbar" aria-label="Application and scripture controls">
          <ToolbarMenu
            id="file-menu"
            label="File"
            open={openMenu === "file"}
            buttonRef={fileMenuButtonRef}
            onToggle={(open) => setOpenMenu(open ? "file" : undefined)}
          >
            <MenuItem shortcut="Ctrl+N" onClick={() => {
              setOpenMenu(undefined); requestAction({ type: "new" }, fileMenuButtonRef.current);
            }}>New</MenuItem>
            <MenuItem shortcut="Ctrl+O" onClick={() => {
              setOpenMenu(undefined); requestAction({ type: "open" }, fileMenuButtonRef.current);
            }}>Open</MenuItem>
            <div className="menu-separator" role="separator" />
            <MenuItem shortcut="Ctrl+S" onClick={() => {
              setOpenMenu(undefined); void saveDocument();
            }}>Save</MenuItem>
            <MenuItem shortcut="Ctrl+Shift+S" onClick={() => {
              setOpenMenu(undefined); void saveDocument(true);
            }}>Save As</MenuItem>
            <div className="menu-separator" role="separator" />
            <MenuItem checked={pageNumbers} disabled={outputBusy} onClick={() => setPageNumbers((value) => !value)}>
              Page numbers
            </MenuItem>
            <MenuItem shortcut="Ctrl+P" disabled={outputBusy} onClick={() => {
              setOpenMenu(undefined); void print();
            }}>Print</MenuItem>
            <MenuItem disabled={outputBusy} onClick={() => {
              setOpenMenu(undefined); void savePdf();
            }}>Save PDF</MenuItem>
          </ToolbarMenu>
          <ToolbarMenu
            id="edit-menu"
            label="Edit"
            open={openMenu === "edit"}
            buttonRef={editMenuButtonRef}
            onToggle={(open) => setOpenMenu(open ? "edit" : undefined)}
          >
            <MenuItem shortcut="Ctrl+Z" disabled={!formatting.canUndo} onClick={() => {
              setOpenMenu(undefined); editor?.chain().focus().undo().run();
            }}>Undo</MenuItem>
            <MenuItem shortcut="Ctrl+Shift+Z" disabled={!formatting.canRedo} onClick={() => {
              setOpenMenu(undefined); editor?.chain().focus().redo().run();
            }}>Redo</MenuItem>
            <div className="menu-separator" role="separator" />
            <MenuItem shortcut="Ctrl+F" onClick={openFind}>Find / Replace</MenuItem>
            <MenuItem onClick={openParagraph}>Paragraph…</MenuItem>
          </ToolbarMenu>
          {recent.length ? <label className="recent-picker">Recent
            <select aria-label="Recent files" value="" onChange={(event) => requestAction({ type: "recent", path: event.target.value })}>
              <option value="">Choose…</option>{recent.map((item) => <option key={item.path} value={item.path}>{item.displayName}</option>)}
            </select>
          </label> : null}
          <label className="translation-picker">Scripture
            <select aria-label="Scripture translation" value={translationId} onChange={(event) => selectTranslation(event.target.value)}>
              {translations.map((translation) => <option key={translation.id} value={translation.id}>
                {translation.name} ({translation.citationLabel})
              </option>)}
            </select>
          </label>
          {catalogOffline ? <span className="offline-badge" role="note">Offline · WEB</span> : null}
        </nav>

        <nav className="toolbar formatting-toolbar" aria-label="Text formatting">
          <ToolbarButton editor={editor} title="Bold (Ctrl+B)" active={formatting.bold} command={() => editor?.chain().focus().toggleBold().run()}>B</ToolbarButton>
          <ToolbarButton editor={editor} title="Italic (Ctrl+I)" active={formatting.italic} command={() => editor?.chain().focus().toggleItalic().run()}><em>I</em></ToolbarButton>
          <ToolbarButton editor={editor} title="Underline (Ctrl+U)" active={formatting.underline} command={() => editor?.chain().focus().toggleUnderline().run()}><u>U</u></ToolbarButton>
          <ToolbarButton editor={editor} title="Strikethrough" active={formatting.strike} command={() => editor?.chain().focus().toggleStrike().run()}><s>S</s></ToolbarButton>
          <ToolbarButton editor={editor} title="Subscript" active={formatting.subscript} command={() => editor?.chain().focus().toggleSubscript().run()}>X₂</ToolbarButton>
          <ToolbarButton editor={editor} title="Superscript" active={formatting.superscript} command={() => editor?.chain().focus().toggleSuperscript().run()}>X²</ToolbarButton>
          <select aria-label="Font family" value={formatting.fontFamily} onChange={(event) => editor?.chain().focus().setFontFamily(event.target.value).run()}>
            {!fonts.includes(formatting.fontFamily) ? <option value={formatting.fontFamily}>{formatting.fontFamily}</option> : null}
            {fonts.map((font) => <option key={font}>{font}</option>)}
          </select>
          <select aria-label="Font size" value={formatting.fontSize} onChange={(event) => editor?.chain().focus().setFontSize(event.target.value).run()}>
            {!sizes.includes(formatting.fontSize) ? <option value={formatting.fontSize}>{formatting.fontSize}</option> : null}
            {sizes.map((size) => <option key={size}>{size}</option>)}
          </select>
          <label className="color-control icon-color-control" title="Font color"><ColorIcon color={formatting.color} /><input aria-label="Text color" type="color" value={formatting.color} onChange={(event) => editor?.chain().focus().setColor(event.target.value).run()} /></label>
          <label className="color-control icon-color-control" title="Highlight color"><ColorIcon color={formatting.backgroundColor} highlight /><input aria-label="Highlight color" type="color" value={formatting.backgroundColor} onChange={(event) => editor?.chain().focus().setBackgroundColor(event.target.value).run()} /></label>
          <ToolbarButton editor={editor} title="Add or edit link" active={formatting.link} command={editLink}><LinkIcon /></ToolbarButton>
          <ToolbarButton editor={editor} title="Bullet list" active={formatting.bulletList} command={() => editor?.chain().focus().toggleBulletList().run()}><ListIcon /></ToolbarButton>
          <ToolbarButton editor={editor} title="Numbered list" active={formatting.orderedList} command={() => editor?.chain().focus().toggleOrderedList().run()}><ListIcon ordered /></ToolbarButton>
          <span className="toolbar-rule" />
          {(["left", "center", "right", "justify"] as Alignment[]).map((alignment) => <ToolbarButton key={alignment} editor={editor} title={alignment === "justify" ? "Justify" : `Align ${alignment}`} active={formatting.alignment === alignment} command={() => editor?.chain().focus().setTextAlign(alignment).run()}><AlignmentIcon alignment={alignment} /></ToolbarButton>)}
          <ToolbarButton editor={editor} title="Outdent" command={() => adjustIndent(-1)}>←</ToolbarButton>
          <ToolbarButton editor={editor} title="Indent" command={() => adjustIndent(1)}>→</ToolbarButton>
        </nav>

        {findOpen ? <section className="find-panel" role="dialog" aria-label="Find and replace" onKeyDown={(event) => {
          if (event.key === "Escape") closeFind();
        }}>
          <label>Find <input id="find-query" value={findQuery} onChange={(event) => updateFind(event.target.value)} /></label>
          <label>Replace <input value={replacement} onChange={(event) => setReplacement(event.target.value)} /></label>
          <button type="button" onClick={() => updateFind(findQuery, findIndex - 1)} disabled={!findCount}>Previous</button>
          <button type="button" onClick={() => updateFind(findQuery, findIndex + 1)} disabled={!findCount}>Next</button>
          <button type="button" onClick={() => { if (!editor) return; const match = findMatches(editor, findQuery)[findIndex]; if (match) replaceMatch(editor, match, replacement); updateFind(findQuery, findIndex); }} disabled={!findCount}>Replace</button>
          <button type="button" onClick={() => { if (!editor) return; const count = replaceAllMatches(editor, findQuery, replacement); updateFind(findQuery); setStatus(`Replaced ${count} occurrence${count === 1 ? "" : "s"}.`); }} disabled={!findCount}>Replace all</button>
          <span aria-live="polite">{findCount ? `${findIndex + 1} of ${findCount}` : "No matches"}</span>
          <button type="button" aria-label="Close find and replace" onClick={closeFind}>×</button>
        </section> : null}

        <section className="paper" data-testid="editor"><EditorContent editor={editor} /><p className="editor-hint">Try <kbd>John 3:16</kbd> followed by a space.</p></section>
        <p className="status-line" role="status" aria-live="polite">{status}</p>

        {printSnapshot ? <section className="output-preview" aria-labelledby="output-heading"><div><p className="eyebrow">Immutable output snapshot</p><h2 id="output-heading">Print / PDF preview</h2></div><iframe title="Print/PDF preview" srcDoc={printSnapshot.html} data-testid="print-preview" /></section> : null}
        {preview ? <aside className="passage-preview" role="tooltip" aria-live="polite" aria-atomic="true" data-reference-kind={preview.candidate.kind} style={{ top: preview.top, left: preview.left }}><strong>{preview.candidate.display}</strong>{preview.candidate.kind === "invalid" ? <><p className="invalid-reference-message">{preview.candidate.issue.message}</p><small>Nothing will be inserted.</small></> : null}{preview.loading ? <p>Loading preview…</p> : null}{preview.passage ? <><p>{preview.passage.text}</p><small>{preview.passage.translationName}{preview.passage.cached ? " · local cache" : ""}</small>{preview.passage.fallbackFrom ? <small className="fallback-message">Using bundled WEB because {preview.passage.fallbackFrom.name} is unavailable.</small> : null}</> : null}{preview.error ? <p>{preview.error}</p> : null}</aside> : null}
      </main>

      {paragraphOpen ? <div className="modal-backdrop"><section
        ref={paragraphDialogRef}
        className="paragraph-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="paragraph-heading"
        aria-describedby="paragraph-description"
        onKeyDown={(event) => trapFocus(event, paragraphDialogRef.current, closeParagraph)}
      >
        <h2 id="paragraph-heading">Paragraph</h2>
        <p id="paragraph-description">Set spacing for the current paragraph.</p>
        <div className="paragraph-fields">
          <label>Line spacing<select
            id="paragraph-line-spacing"
            value={paragraphDraft.lineHeight}
            onChange={(event) => setParagraphDraft((value) => ({ ...value, lineHeight: event.target.value }))}
          >
            <option value="1">1.0</option><option value="1.15">1.15</option><option value="1.5">1.5</option><option value="2">2.0</option>
          </select></label>
          <label>Space before<select
            value={paragraphDraft.spaceBefore}
            onChange={(event) => setParagraphDraft((value) => ({ ...value, spaceBefore: Number(event.target.value) }))}
          >{paragraphSpacing.map((spacing) => <option key={spacing} value={spacing}>{spacing} pt</option>)}</select></label>
          <label>Space after<select
            value={paragraphDraft.spaceAfter}
            onChange={(event) => setParagraphDraft((value) => ({ ...value, spaceAfter: Number(event.target.value) }))}
          >{paragraphSpacing.map((spacing) => <option key={spacing} value={spacing}>{spacing} pt</option>)}</select></label>
        </div>
        <div className="dialog-actions"><button type="button" onClick={closeParagraph}>Cancel</button><button className="primary-action" type="button" onClick={applyParagraph}>Apply</button></div>
      </section></div> : null}

      {pendingAction ? <div className="modal-backdrop"><section ref={dialogRef} className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="unsaved-heading" aria-describedby="unsaved-description" onKeyDown={trapDialogKeys}><h2 id="unsaved-heading">Save changes?</h2><p id="unsaved-description">Your latest writing has not been saved to the document.</p><div><button autoFocus type="button" onClick={() => void resolvePending("cancel")}>Cancel</button><button type="button" onClick={() => void resolvePending("discard")}>Discard</button><button className="primary-action" type="button" onClick={() => void resolvePending("save")}>Save</button></div></section></div> : null}

      {printSnapshot ? <><style>{printSnapshot.printCss}</style><article className="print-document print-surface" aria-hidden="true"><main dangerouslySetInnerHTML={{ __html: printSnapshot.bodyHtml }} /><footer className="print-footer"><strong>Powered by DBS</strong>{printSnapshot.notices.map((notice) => <p className="translation-notice" key={notice}>{notice}</p>)}</footer>{printSnapshot.pageNumbers ? <div className="preview-page-number">Page 1</div> : null}</article></> : null}
    </>
  );
}
