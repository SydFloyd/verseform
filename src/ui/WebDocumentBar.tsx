import type { WorkspaceViewModel } from "../app/selectors";

export function WebDocumentBar({ view }: {
  view: WorkspaceViewModel;
}) {
  return <div className="web-document-bar">
    <div className="web-brand"><span>Verseform</span><small>Web beta</small></div>
    <div className="web-document-name">
      <strong title={view.displayName}>{view.displayName.replace(/\.verseform$/u, "")}</strong>
      <span>{view.dirty ? "Unsaved changes" : view.hasDocumentPath ? "Saved in this browser" : "Local draft"}</span>
    </div>
    <div className="web-document-actions">
      <a href="https://github.com/SydFloyd/verseform/releases/download/v0.2.4/Verseform_0.2.4_x64-setup.exe" className="windows-download">Download for Windows</a>
    </div>
  </div>;
}
