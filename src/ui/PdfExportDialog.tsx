import type { KeyboardEvent, RefObject } from "react";
import type { PrintSnapshot } from "../core/output";

export function PdfExportDialog({
  snapshot,
  pageNumbers,
  dialogRef,
  onTogglePageNumbers,
  onCancel,
  onExport,
  onKeyDown,
}: {
  snapshot: PrintSnapshot;
  pageNumbers: boolean;
  dialogRef: RefObject<HTMLElement | null>;
  onTogglePageNumbers: () => void;
  onCancel: () => void;
  onExport: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}) {
  return <div className="modal-backdrop pdf-export-backdrop">
    <section
      ref={dialogRef}
      className="pdf-export-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-export-heading"
      aria-describedby="pdf-export-description"
      onKeyDown={onKeyDown}
    >
      <div className="pdf-export-heading">
        <div>
          <p className="eyebrow">Immutable output snapshot</p>
          <h2 id="pdf-export-heading">Export PDF</h2>
          <p id="pdf-export-description">Review the frozen document that will be saved. Your writing remains unchanged.</p>
        </div>
        <label className="pdf-page-numbers">
          <input type="checkbox" checked={pageNumbers} onChange={onTogglePageNumbers} />
          Page numbers
        </label>
      </div>
      <iframe
        className="pdf-preview-frame"
        title="PDF export preview"
        srcDoc={snapshot.html}
        sandbox=""
        tabIndex={-1}
        data-testid="pdf-export-preview"
      />
      <div className="pdf-export-footer">
        <p>Required scripture attribution is included automatically.</p>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button autoFocus className="primary-action" type="button" onClick={onExport}>Export PDF…</button>
        </div>
      </div>
    </section>
  </div>;
}
