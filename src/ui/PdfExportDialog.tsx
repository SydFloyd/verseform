import type { KeyboardEvent, RefObject } from "react";
import type { PrintSnapshot } from "../core/output";
import { PaginatedOutput, type PaginationResult } from "./PaginatedOutput";

export function PdfExportDialog({
  browserOutput = false,
  snapshot,
  pageNumbers,
  dialogRef,
  onTogglePageNumbers,
  onCancel,
  onExport,
  onKeyDown,
  ready,
  pageCount,
  paginationError,
  onPreviewReady,
  onPreviewError,
}: {
  browserOutput?: boolean;
  snapshot: PrintSnapshot;
  pageNumbers: boolean;
  dialogRef: RefObject<HTMLElement | null>;
  onTogglePageNumbers: () => void;
  onCancel: () => void;
  onExport: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  ready: boolean;
  pageCount?: number;
  paginationError?: string;
  onPreviewReady: (snapshot: PrintSnapshot, result: PaginationResult) => void;
  onPreviewError: (snapshot: PrintSnapshot, error: string) => void;
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
          <p className="eyebrow">PDF preview</p>
          <h2 id="pdf-export-heading">{browserOutput ? "Save as PDF" : "Export PDF"}</h2>
          <p id="pdf-export-description">{browserOutput ? "Review these pages, then choose Save as PDF in your browser's print dialog. Use Letter paper, 100% scale, and turn off browser headers and footers." : "Review the frozen pages exactly as they will be saved. Your writing remains unchanged."}</p>
        </div>
        <label className="pdf-page-numbers">
          <input type="checkbox" checked={pageNumbers} onChange={onTogglePageNumbers} />
          Page numbers
        </label>
      </div>
      <div className="pdf-preview-frame" role="region" aria-label="Scrollable PDF pages" tabIndex={0}>
        <PaginatedOutput
          snapshot={snapshot}
          mode="preview"
          onReady={onPreviewReady}
          onError={onPreviewError}
        />
      </div>
      <div className="pdf-export-footer">
        <p role={paginationError ? "alert" : "status"}>{paginationError
          ? `Page preview failed: ${paginationError}`
          : ready && pageCount
            ? `${pageCount} ${pageCount === 1 ? "page" : "pages"}. Required scripture attribution repeats on every page.`
            : "Preparing page boundaries and required scripture attribution…"}</p>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button
            autoFocus
            className="primary-action"
            type="button"
            aria-disabled={!ready}
            onClick={() => { if (ready) onExport(); }}
          >{browserOutput ? "Open print dialog…" : "Export PDF…"}</button>
        </div>
      </div>
    </section>
  </div>;
}
