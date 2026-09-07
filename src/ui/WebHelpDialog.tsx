import type { KeyboardEvent, RefObject } from "react";
import type { WorkspaceViewModel } from "../app/selectors";

export function WebHelpDialog({
  view,
  dialogRef,
  onClose,
  onKeyDown,
}: {
  view: WorkspaceViewModel;
  dialogRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}) {
  return <div className="modal-backdrop">
    <section
      ref={dialogRef}
      className="web-help-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="web-help-heading"
      onKeyDown={onKeyDown}
    >
      <header className="dialog-heading">
        <div>
          <p className="eyebrow">Verseform web</p>
          <h2 id="web-help-heading">Using Verseform</h2>
        </div>
        <button autoFocus type="button" className="dialog-close" aria-label="Close Using Verseform" onClick={onClose}>×</button>
      </header>

      <div className="web-help-content">
        <h3>Write. Find a verse. Keep going.</h3>
        <p>Type <strong>John 3:16</strong> followed by a space or Enter. Hover to preview; click to insert. Ctrl+Z undoes an insertion. F6 reaches references with a keyboard.</p>
        <p>Whole chapters, verse lists, and ranges across chapters are supported. Insert one chapter or up to 50 selected verses across chapters at a time.</p>
        <h3>Your writing stays here</h3>
        <p>Drafts save automatically in this browser. File → Save a copy names a separate draft. Use Drafts to reopen local writing, and File → Import to open a downloaded .verseform file.</p>
        <p>There is no account or cloud document storage. Clearing site data, private browsing, or browser storage cleanup can remove drafts. Use File → Download .verseform for writing you want to keep or move to another device.</p>
        <h3>Print and PDF</h3>
        <p>File → Save PDF reviews attributed pages, then opens your browser's print dialog. Choose Save as PDF, Letter paper, 100% scale, and turn off browser headers and footers. Your browser handles the destination and saving.</p>
        <p>Use current desktop Chrome or Edge. {view.offlineState === "ready" ? "The editor and bundled WEB are ready to reopen offline." : view.offlineState === "preparing" ? "Preparing the editor for offline use…" : "Offline reopening is unavailable here; your local drafts can still be saved and downloaded."}</p>
        <p>Online scripture comes from Digital Bible Society; offline scripture uses bundled WEB. Help → Credits & Licenses lists translation and software notices.</p>
        <p><a href="https://github.com/SydFloyd/verseform/blob/main/PRIVACY.md" target="_blank" rel="noreferrer">Privacy</a> · <a href="https://github.com/SydFloyd/verseform/releases/tag/v0.2.3" target="_blank" rel="noreferrer">Windows 0.2.3 release notes</a> (unsigned Beta)</p>
      </div>

      <div className="dialog-actions">
        <button type="button" className="primary-action" onClick={onClose}>Done</button>
      </div>
    </section>
  </div>;
}
