import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { commandDefinition, type WorkspaceCommandId } from "../app/commands";
import type { WorkspaceController } from "../app/controller";
import {
  EditorSurface,
  type PositionedReference,
  type PositionedValidReference,
} from "../editor/EditorSurface";
import type { Alignment } from "../editor/gateway";
import { CreditsDialog } from "./CreditsDialog";

type MenuName = "file" | "edit" | "help";

const fonts = ["Garamond", "Georgia", "Arial", "Calibri", "Times New Roman", "Verdana"];
const sizes = ["10pt", "11pt", "12pt", "14pt", "18pt", "24pt"];
const paragraphSpacing = [0, 6, 8, 12, 18, 24];

function shortcut(id: WorkspaceCommandId): string | undefined {
  return commandDefinition(id).shortcut;
}

function label(id: WorkspaceCommandId): string {
  return commandDefinition(id).label;
}

function commandTitle(id: WorkspaceCommandId): string {
  const item = commandDefinition(id);
  return `${item.label}${item.shortcut ? ` (${item.shortcut})` : ""}`;
}

function ToolbarButton({ command, active, children, title, disabled }: {
  command: () => void;
  active?: boolean;
  children: React.ReactNode;
  title: string;
  disabled?: boolean;
}) {
  return <button type="button" onClick={command} aria-label={title} aria-pressed={active} title={title} disabled={disabled}>{children}</button>;
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

function MenuItem({ children, shortcut: itemShortcut, onClick, disabled, checked }: {
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
    aria-keyshortcuts={itemShortcut?.replace("Ctrl", "Control")}
    disabled={disabled}
    onClick={onClick}
  ><span>{children}</span>{itemShortcut ? <kbd>{itemShortcut}</kbd> : null}</button>;
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

export function App({ controller }: { controller: WorkspaceController }) {
  const view = useSyncExternalStore(controller.subscribe, controller.getView, controller.getView);
  const [openMenu, setOpenMenu] = useState<MenuName>();
  const dialogRef = useRef<HTMLElement | null>(null);
  const dialogReturnFocus = useRef<HTMLElement | null>(null);
  const paragraphDialogRef = useRef<HTMLElement | null>(null);
  const paragraphReturnFocus = useRef<HTMLElement | null>(null);
  const creditsDialogRef = useRef<HTMLElement | null>(null);
  const creditsReturnFocus = useRef<HTMLElement | null>(null);
  const fileMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const editMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const helpMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousOverlay = useRef(view.overlay.type);

  useEffect(() => {
    if (view.overlay.type === "find" && previousOverlay.current !== "find") {
      requestAnimationFrame(() => document.getElementById("find-query")?.focus());
    } else if (view.overlay.type === "paragraph" && previousOverlay.current !== "paragraph") {
      requestAnimationFrame(() => document.getElementById("paragraph-line-spacing")?.focus());
    }
    previousOverlay.current = view.overlay.type;
  }, [view.overlay.type]);

  const run = (id: WorkspaceCommandId, payload?: string | Alignment) => {
    setOpenMenu(undefined);
    controller.execute(id, payload);
  };
  const requestAction = (
    id: "file.new" | "file.open" | "file.openRecent",
    payload?: string,
    returnFocus?: HTMLElement | null,
  ) => {
    if (view.dirty) {
      dialogReturnFocus.current = returnFocus
        ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    }
    run(id, payload);
  };
  const closeParagraph = () => {
    controller.closeParagraph();
    requestAnimationFrame(() => paragraphReturnFocus.current?.focus());
  };
  const resolvePending = (choice: "save" | "discard" | "cancel") => {
    controller.resolveConfirmation(choice);
    if (choice === "cancel") requestAnimationFrame(() => dialogReturnFocus.current?.focus());
  };
  const closeCredits = () => {
    controller.closeCredits();
    requestAnimationFrame(() => {
      if (creditsReturnFocus.current) creditsReturnFocus.current.focus();
      else controller.focusEditor();
      creditsReturnFocus.current = null;
    });
  };

  const find = view.overlay.type === "find" ? view.overlay : undefined;
  const paragraph = view.overlay.type === "paragraph" ? view.overlay : undefined;
  const confirming = view.overlay.type === "confirm";
  const credits = view.overlay.type === "credits" ? view.overlay : undefined;
  const formatting = view.formatting;
  const recovery = view.recoveries[0];
  const initialCanon = controller.getState().scripture.fallback.canon;

  return (
    <>
      <a className="skip-link" href="#document-editor" onClick={(event) => {
        event.preventDefault(); controller.focusEditor();
      }}>Skip to document editor</a>
      <main className="app-shell" inert={confirming || Boolean(paragraph) || Boolean(credits) ? true : undefined}>
        <h1 className="sr-only">Verseform document editor</h1>

        {recovery ? <section className="recovery-banner" aria-label="Recovery available">
          <div><strong>Recovered writing is available</strong><span>{new Date(recovery.capturedAtMs).toLocaleString()}</span></div>
          <button type="button" onClick={() => controller.restoreRecovery()}>Restore</button>
          <button type="button" onClick={() => controller.discardRecovery()}>Discard</button>
        </section> : null}

        <nav className="toolbar document-toolbar" aria-label="Application and scripture controls">
          <div className="menu-strip" role="group" aria-label="Application menus">
          <ToolbarMenu id="file-menu" label="File" open={openMenu === "file"} buttonRef={fileMenuButtonRef} onToggle={(open) => setOpenMenu(open ? "file" : undefined)}>
            <MenuItem shortcut={shortcut("file.new")} disabled={!controller.isEnabled("file.new")} onClick={() => requestAction("file.new", undefined, fileMenuButtonRef.current)}>{label("file.new")}</MenuItem>
            <MenuItem shortcut={shortcut("file.open")} disabled={!controller.isEnabled("file.open")} onClick={() => requestAction("file.open", undefined, fileMenuButtonRef.current)}>{label("file.open")}</MenuItem>
            <div className="menu-separator" role="separator" />
            <MenuItem shortcut={shortcut("file.save")} disabled={!controller.isEnabled("file.save")} onClick={() => run("file.save")}>{label("file.save")}</MenuItem>
            <MenuItem shortcut={shortcut("file.saveAs")} disabled={!controller.isEnabled("file.saveAs")} onClick={() => run("file.saveAs")}>{label("file.saveAs")}</MenuItem>
            <div className="menu-separator" role="separator" />
            <MenuItem checked={view.pageNumbers} disabled={!controller.isEnabled("file.pageNumbers")} onClick={() => run("file.pageNumbers")}>{label("file.pageNumbers")}</MenuItem>
            <MenuItem shortcut={shortcut("file.print")} disabled={!controller.isEnabled("file.print")} onClick={() => run("file.print")}>{label("file.print")}</MenuItem>
            <MenuItem disabled={!controller.isEnabled("file.savePdf")} onClick={() => run("file.savePdf")}>{label("file.savePdf")}</MenuItem>
          </ToolbarMenu>
          <ToolbarMenu id="edit-menu" label="Edit" open={openMenu === "edit"} buttonRef={editMenuButtonRef} onToggle={(open) => setOpenMenu(open ? "edit" : undefined)}>
            <MenuItem shortcut={shortcut("edit.undo")} disabled={!controller.isEnabled("edit.undo")} onClick={() => run("edit.undo")}>{label("edit.undo")}</MenuItem>
            <MenuItem shortcut={shortcut("edit.redo")} disabled={!controller.isEnabled("edit.redo")} onClick={() => run("edit.redo")}>{label("edit.redo")}</MenuItem>
            <div className="menu-separator" role="separator" />
            <MenuItem shortcut={shortcut("edit.find")} onClick={() => run("edit.find")}>{label("edit.find")}</MenuItem>
            <MenuItem onClick={() => {
              paragraphReturnFocus.current = editMenuButtonRef.current;
              run("edit.paragraph");
            }}>{label("edit.paragraph")}…</MenuItem>
          </ToolbarMenu>
          <ToolbarMenu id="help-menu" label="Help" open={openMenu === "help"} buttonRef={helpMenuButtonRef} onToggle={(open) => setOpenMenu(open ? "help" : undefined)}>
            <MenuItem shortcut={shortcut("help.credits")} disabled={!controller.isEnabled("help.credits")} onClick={() => {
              creditsReturnFocus.current = helpMenuButtonRef.current;
              run("help.credits");
            }}>{label("help.credits")}</MenuItem>
          </ToolbarMenu>
          </div>
          <div className="scripture-strip" role="group" aria-label="Scripture controls">
          {view.recent.length ? <label className="recent-picker">Recent
            <select aria-label="Recent files" value="" onChange={(event) => requestAction("file.openRecent", event.target.value)}>
              <option value="">Choose…</option>{view.recent.map((item) => <option key={item.path} value={item.path}>{item.displayName}</option>)}
            </select>
          </label> : null}
          <label className="translation-picker">Scripture
            <select aria-label="Scripture translation" value={view.translationId} onChange={(event) => controller.selectTranslation(event.target.value)}>
              {view.translations.map((translation) => <option key={translation.id} value={translation.id}>{translation.name} ({translation.citationLabel})</option>)}
            </select>
          </label>
          {view.catalogOffline ? <span className="offline-badge" role="note">Offline · WEB</span> : null}
          </div>
        </nav>

        <nav className="toolbar formatting-toolbar" aria-label="Text formatting">
          <div className="format-group typeface-group" role="group" aria-label="Typeface">
            <select aria-label="Font family" value={formatting.fontFamily} onChange={(event) => run("format.fontFamily", event.target.value)}>
              {!fonts.includes(formatting.fontFamily) ? <option value={formatting.fontFamily}>{formatting.fontFamily}</option> : null}
              {fonts.map((font) => <option key={font}>{font}</option>)}
            </select>
            <select aria-label="Font size" value={formatting.fontSize} onChange={(event) => run("format.fontSize", event.target.value)}>
              {!sizes.includes(formatting.fontSize) ? <option value={formatting.fontSize}>{formatting.fontSize}</option> : null}
              {sizes.map((size) => <option key={size}>{size}</option>)}
            </select>
          </div>
          <div className="format-group" role="group" aria-label="Text emphasis">
            <ToolbarButton title={commandTitle("format.bold")} active={formatting.bold} command={() => run("format.bold")}>B</ToolbarButton>
            <ToolbarButton title={commandTitle("format.italic")} active={formatting.italic} command={() => run("format.italic")}><em>I</em></ToolbarButton>
            <ToolbarButton title={commandTitle("format.underline")} active={formatting.underline} command={() => run("format.underline")}><u>U</u></ToolbarButton>
            <ToolbarButton title={commandTitle("format.strike")} active={formatting.strike} command={() => run("format.strike")}><s>S</s></ToolbarButton>
            <ToolbarButton title={commandTitle("format.subscript")} active={formatting.subscript} command={() => run("format.subscript")}>X₂</ToolbarButton>
            <ToolbarButton title={commandTitle("format.superscript")} active={formatting.superscript} command={() => run("format.superscript")}>X²</ToolbarButton>
          </div>
          <div className="format-group" role="group" aria-label="Color and links">
            <label className="color-control icon-color-control" title="Font color"><ColorIcon color={formatting.color} /><input aria-label="Text color" type="color" value={formatting.color} onChange={(event) => run("format.color", event.target.value)} /></label>
            <label className="color-control icon-color-control" title="Highlight color"><ColorIcon color={formatting.backgroundColor} highlight /><input aria-label="Highlight color" type="color" value={formatting.backgroundColor} onChange={(event) => run("format.highlight", event.target.value)} /></label>
            <ToolbarButton title={commandTitle("format.link")} active={formatting.link} command={() => run("format.link")}><LinkIcon /></ToolbarButton>
          </div>
          <div className="format-group" role="group" aria-label="Lists">
            <ToolbarButton title={commandTitle("format.bulletList")} active={formatting.bulletList} command={() => run("format.bulletList")}><ListIcon /></ToolbarButton>
            <ToolbarButton title={commandTitle("format.orderedList")} active={formatting.orderedList} command={() => run("format.orderedList")}><ListIcon ordered /></ToolbarButton>
          </div>
          <div className="format-group" role="group" aria-label="Alignment and indentation">
            {(["left", "center", "right", "justify"] as Alignment[]).map((alignment) => <ToolbarButton key={alignment} title={alignment === "justify" ? "Justify" : `Align ${alignment}`} active={formatting.alignment === alignment} command={() => run("format.align", alignment)}><AlignmentIcon alignment={alignment} /></ToolbarButton>)}
            <ToolbarButton title={commandTitle("format.outdent")} command={() => run("format.outdent")}>←</ToolbarButton>
            <ToolbarButton title={commandTitle("format.indent")} command={() => run("format.indent")}>→</ToolbarButton>
          </div>
        </nav>

        {find ? <section className="find-panel" role="dialog" aria-label="Find and replace" onKeyDown={(event) => {
          if (event.key === "Escape") controller.closeFind();
        }}>
          <label>Find <input id="find-query" value={find.query} onChange={(event) => controller.updateFind(event.target.value)} /></label>
          <label>Replace <input value={find.replacement} onChange={(event) => controller.updateReplacement(event.target.value)} /></label>
          <button type="button" onClick={() => controller.updateFind(find.query, find.index - 1)} disabled={!find.count}>Previous</button>
          <button type="button" onClick={() => controller.updateFind(find.query, find.index + 1)} disabled={!find.count}>Next</button>
          <button type="button" onClick={() => controller.replaceFind()} disabled={!find.count}>Replace</button>
          <button type="button" onClick={() => controller.replaceAllFind()} disabled={!find.count}>Replace all</button>
          <span aria-live="polite">{find.count ? `${find.index + 1} of ${find.count}` : "No matches"}</span>
          <button type="button" aria-label="Close find and replace" onClick={() => controller.closeFind()}>×</button>
        </section> : null}

        <section className="paper" data-testid="editor"><EditorSurface
          initialCanon={initialCanon}
          onGateway={(gateway) => controller.attachEditor(gateway)}
          onLimit={() => controller.send({ type: "editor.limit" })}
          onReferenceHover={(candidate: PositionedReference, position) => controller.referenceHover(candidate, position)}
          onReferenceLeave={() => controller.referenceLeave()}
          onReferenceClick={(candidate: PositionedValidReference) => controller.referenceClick(candidate)}
        /><p className="editor-hint">Try <kbd>John 3:16</kbd> followed by a space.</p></section>
        <p className="status-line" role="status" aria-live="polite">{view.status}</p>

        {view.printSnapshot ? <section className="output-preview" aria-labelledby="output-heading"><div><p className="eyebrow">Immutable output snapshot</p><h2 id="output-heading">Print / PDF preview</h2></div><iframe title="Print/PDF preview" srcDoc={view.printSnapshot.html} data-testid="print-preview" /></section> : null}
        {view.preview ? <aside className="passage-preview" role="tooltip" aria-live="polite" aria-atomic="true" data-reference-kind={view.preview.candidate.kind} style={{ top: view.preview.top, left: view.preview.left }}><strong>{view.preview.candidate.display}</strong>{view.preview.candidate.kind === "invalid" ? <><p className="invalid-reference-message">{view.preview.candidate.issue.message}</p><small>Nothing will be inserted.</small></> : null}{view.preview.loading ? <p>Loading preview…</p> : null}{view.preview.passage ? <><p>{view.preview.passage.text}</p><small>{view.preview.passage.translationName}{view.preview.passage.cached ? " · local cache" : ""}</small>{view.preview.passage.fallbackFrom ? <small className="fallback-message">Using bundled WEB because {view.preview.passage.fallbackFrom.name} is unavailable.</small> : null}</> : null}{view.preview.error ? <p>{view.preview.error}</p> : null}</aside> : null}
      </main>

      {credits ? <CreditsDialog
        model={view.credits}
        linkBusy={Boolean(credits.link)}
        error={credits.error}
        dialogRef={creditsDialogRef}
        onClose={closeCredits}
        onOpenLink={(target) => controller.openCreditLink(target)}
        onKeyDown={(event) => trapFocus(event, creditsDialogRef.current, closeCredits)}
      /> : null}

      {paragraph ? <div className="modal-backdrop"><section ref={paragraphDialogRef} className="paragraph-dialog" role="dialog" aria-modal="true" aria-labelledby="paragraph-heading" aria-describedby="paragraph-description" onKeyDown={(event) => trapFocus(event, paragraphDialogRef.current, closeParagraph)}>
        <h2 id="paragraph-heading">Paragraph</h2>
        <p id="paragraph-description">Set spacing for the current paragraph.</p>
        <div className="paragraph-fields">
          <label>Line spacing<select id="paragraph-line-spacing" value={paragraph.draft.lineHeight} onChange={(event) => controller.updateParagraph({ ...paragraph.draft, lineHeight: event.target.value })}>
            <option value="1">1.0</option><option value="1.15">1.15</option><option value="1.5">1.5</option><option value="2">2.0</option>
          </select></label>
          <label>Space before<select value={paragraph.draft.spaceBefore} onChange={(event) => controller.updateParagraph({ ...paragraph.draft, spaceBefore: Number(event.target.value) })}>{paragraphSpacing.map((spacing) => <option key={spacing} value={spacing}>{spacing} pt</option>)}</select></label>
          <label>Space after<select value={paragraph.draft.spaceAfter} onChange={(event) => controller.updateParagraph({ ...paragraph.draft, spaceAfter: Number(event.target.value) })}>{paragraphSpacing.map((spacing) => <option key={spacing} value={spacing}>{spacing} pt</option>)}</select></label>
        </div>
        <div className="dialog-actions"><button type="button" onClick={closeParagraph}>Cancel</button><button className="primary-action" type="button" onClick={() => {
          controller.applyParagraph();
          requestAnimationFrame(() => paragraphReturnFocus.current?.focus());
        }}>Apply</button></div>
      </section></div> : null}

      {confirming ? <div className="modal-backdrop"><section ref={dialogRef} className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="unsaved-heading" aria-describedby="unsaved-description" onKeyDown={(event) => trapFocus(event, dialogRef.current, () => resolvePending("cancel"))}><h2 id="unsaved-heading">Save changes?</h2><p id="unsaved-description">Your latest writing has not been saved to the document.</p><div><button autoFocus type="button" onClick={() => resolvePending("cancel")}>Cancel</button><button type="button" onClick={() => resolvePending("discard")}>Discard</button><button className="primary-action" type="button" onClick={() => resolvePending("save")}>Save</button></div></section></div> : null}

      {view.printSnapshot ? <><style>{view.printSnapshot.printCss}</style><article className="print-document print-surface" aria-hidden="true"><main dangerouslySetInnerHTML={{ __html: view.printSnapshot.bodyHtml }} /><footer className="print-footer"><strong>Powered by DBS</strong>{view.printSnapshot.notices.map((item) => <p className="translation-notice" key={item}>{item}</p>)}</footer>{view.printSnapshot.pageNumbers ? <div className="preview-page-number">Page 1</div> : null}</article></> : null}
    </>
  );
}
