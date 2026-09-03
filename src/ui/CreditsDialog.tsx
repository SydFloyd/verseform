import type { RefObject } from "react";
import type { CreditLinkId, CreditsModel } from "../app/credits";

export function CreditsDialog({
  model,
  linkBusy,
  error,
  dialogRef,
  onClose,
  onOpenLink,
  onKeyDown,
}: {
  model: CreditsModel;
  linkBusy: boolean;
  error?: string;
  dialogRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onOpenLink: (target: CreditLinkId) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
}) {
  const translationSource = model.translation.source === "bundled"
    ? "Bundled offline translation"
    : "Digital Bible Society catalog";

  return <div className="modal-backdrop">
    <section
      ref={dialogRef}
      className="credits-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="credits-heading"
      aria-describedby="credits-introduction"
      onKeyDown={onKeyDown}
    >
      <header className="dialog-heading">
        <div>
          <p className="eyebrow">Verseform {model.version}</p>
          <h2 id="credits-heading">Credits &amp; Licenses</h2>
        </div>
        <button autoFocus type="button" className="dialog-close" aria-label="Close Credits and Licenses" onClick={onClose}>×</button>
      </header>

      <p id="credits-introduction" className="credits-introduction">
        We gratefully thank Digital Bible Society for making authorized scripture access available to this writing tool.
      </p>
      {error ? <p className="dialog-error" role="alert">{error}</p> : null}

      <div className="credits-sections">
        <section aria-labelledby="dbs-credit-heading">
          <h3 id="dbs-credit-heading">Scripture service</h3>
          <p>Online translation catalogs and passages are supplied through Digital Bible Society services.</p>
          <p className="independence-note">Verseform is an independent application and is not presented as endorsed by Digital Bible Society.</p>
          <button type="button" className="external-link-action" disabled={linkBusy} onClick={() => onOpenLink("digital-bible-society")}>
            Visit Digital Bible Society <span aria-hidden="true">↗</span>
          </button>
        </section>

        <section aria-labelledby="translation-credit-heading">
          <h3 id="translation-credit-heading">Effective translation</h3>
          <dl className="translation-credit">
            <div><dt>Translation</dt><dd>{model.translation.name} ({model.translation.citationLabel})</dd></div>
            <div><dt>Source</dt><dd>{translationSource}</dd></div>
            <div><dt>Notice</dt><dd>{model.translation.notice}</dd></div>
          </dl>
        </section>

        <section aria-labelledby="web-credit-heading">
          <h3 id="web-credit-heading">Bundled World English Bible</h3>
          <p>{model.webProvenance}</p>
          <button type="button" className="external-link-action" disabled={linkBusy} onClick={() => onOpenLink("world-english-bible")}>
            View WEB provenance <span aria-hidden="true">↗</span>
          </button>
        </section>

        <section aria-labelledby="software-credit-heading">
          <h3 id="software-credit-heading">Open-source software</h3>
          <p>Verseform includes open-source software under the notices recorded below.</p>
          <details className="software-notices">
            <summary>View {model.softwarePackageCount} dependency license records</summary>
            <pre tabIndex={0} aria-label="Third-party dependency license inventory">{model.softwareNotices}</pre>
          </details>
        </section>
      </div>

      <div className="dialog-actions">
        <button type="button" className="primary-action" onClick={onClose}>Done</button>
      </div>
    </section>
  </div>;
}
