import { Previewer } from "pagedjs";
import { useEffect, useRef, useState } from "react";
import type { PrintSnapshot } from "../core/output";

export type PaginationResult = {
  pageCount: number;
  footerFits: boolean;
};

function decoratePages(host: HTMLElement, snapshot: PrintSnapshot): PaginationResult {
  const pages = Array.from(host.querySelectorAll<HTMLElement>(".pagedjs_page"));
  let footerFits = true;

  for (const [index, page] of pages.entries()) {
    const pageNumber = index + 1;
    page.dataset.pageNumber = String(pageNumber);
    page.setAttribute("role", "group");
    page.setAttribute("aria-label", `Page ${pageNumber} of ${pages.length}`);

    const margin = page.querySelector<HTMLElement>(".pagedjs_margin-bottom");
    if (!margin) {
      footerFits = false;
      continue;
    }
    margin.replaceChildren();
    const template = document.createElement("template");
    template.innerHTML = snapshot.footerHtml;
    const footer = template.content.firstElementChild?.cloneNode(true);
    if (!(footer instanceof HTMLElement)) {
      footerFits = false;
      continue;
    }
    const number = footer.querySelector<HTMLElement>(".print-page-number");
    if (number) number.textContent = `Page ${pageNumber}`;
    margin.appendChild(footer);
    footerFits = footerFits && footer.scrollHeight <= margin.clientHeight;
  }

  for (const link of host.querySelectorAll<HTMLAnchorElement>("a")) {
    link.tabIndex = -1;
  }

  return { pageCount: pages.length, footerFits };
}

export function PaginatedOutput({
  snapshot,
  mode,
  onReady,
  onError,
}: {
  snapshot: PrintSnapshot;
  mode: "preview" | "print";
  onReady?: (snapshot: PrintSnapshot, result: PaginationResult) => void;
  onError?: (snapshot: PrintSnapshot, message: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<{
    snapshot: PrintSnapshot;
    state: "ready" | "error";
    footerFits?: boolean;
  }>();
  const currentStatus = status?.snapshot === snapshot ? status : undefined;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let active = true;
    const previewer = new Previewer();
    host.replaceChildren();
    setStatus(undefined);

    void previewer.preview(
      snapshot.sourceHtml,
      [{ "verseform-output.css": snapshot.printCss }],
      host,
    ).then(() => {
      if (!active) return;
      const result = decoratePages(host, snapshot);
      setStatus({ snapshot, state: "ready", footerFits: result.footerFits });
      onReady?.(snapshot, result);
    }).catch((error: unknown) => {
      if (!active) return;
      setStatus({ snapshot, state: "error" });
      onError?.(snapshot, error instanceof Error ? error.message : String(error));
    });

    return () => {
      active = false;
      previewer.chunker.destroy();
      previewer.polisher.destroy();
      host.replaceChildren();
    };
  }, [snapshot]);

  return <div
    ref={hostRef}
    className={`paginated-output paginated-output-${mode}`}
    role={mode === "preview" ? "region" : undefined}
    aria-label={mode === "preview" ? "PDF page preview" : undefined}
    aria-live={mode === "preview" ? "polite" : undefined}
    aria-busy={!currentStatus}
    data-pagination-ready={currentStatus?.state === "ready" ? "true" : currentStatus?.state ?? "false"}
    data-footer-fits={currentStatus?.footerFits === undefined ? undefined : String(currentStatus.footerFits)}
    data-testid={mode === "preview" ? "pdf-export-preview" : "pdf-print-pages"}
  />;
}
