import type { WorkspaceHost, WorkspaceScheduler } from "../app/controller";

export const webScheduler: WorkspaceScheduler = {
  schedule: (delay, callback) => window.setTimeout(callback, delay),
  cancel: (handle) => window.clearTimeout(handle as number),
  afterPaint: (callback) => window.requestAnimationFrame(callback),
};

export const webHost: WorkspaceHost = {
  onBeforeUnload(shouldBlock) {
    const listener = (event: BeforeUnloadEvent) => {
      if (shouldBlock()) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  },
  onPageHidden(handler) {
    const listener = () => { if (document.visibilityState === "hidden") handler(); };
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  },
  onKeyStroke(handler) {
    const listener = (event: KeyboardEvent) => {
      if (handler({ key: event.key, ctrl: event.ctrlKey, meta: event.metaKey, shift: event.shiftKey, alt: event.altKey })) event.preventDefault();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  },
  promptForLink: (current) => window.prompt("Link address", current),
  publishDiagnostics() { /* Production web has no diagnostic or remote-control surface. */ },
};
