import type { RuntimeAdapters } from "../app/ports";
import {
  WorkspaceController,
  type WorkspaceHost,
  type WorkspaceScheduler,
} from "../app/controller";
import { createBrowserAdapters } from "./browserAdapters";
import { createTauriAdapters } from "./tauriAdapters";
import { WEB_TRANSLATION } from "./webScriptureProvider";

function lookupDelay(): number {
  const requested = Number(
    new URLSearchParams(window.location.search).get("lookupDelay"),
  );
  return Number.isFinite(requested) && requested >= 0 ? requested : 35;
}

export function createRuntimeAdapters(): RuntimeAdapters {
  const delay = lookupDelay();
  return window.__TAURI_INTERNALS__
    ? createTauriAdapters(delay)
    : createBrowserAdapters(delay);
}

function createScheduler(): WorkspaceScheduler {
  return {
    schedule: (delayMs, callback) => window.setTimeout(callback, delayMs),
    cancel: (handle) => window.clearTimeout(handle as number),
    afterPaint: (callback) => window.requestAnimationFrame(callback),
  };
}

function createHost(kind: RuntimeAdapters["kind"]): WorkspaceHost {
  return {
    onBeforeUnload(shouldBlock) {
      const listener = (event: BeforeUnloadEvent) => {
        if (!shouldBlock()) return;
        event.preventDefault();
        event.returnValue = "";
      };
      window.addEventListener("beforeunload", listener);
      return () => window.removeEventListener("beforeunload", listener);
    },
    onKeyStroke(handler) {
      const listener = (event: KeyboardEvent) => {
        const handled = handler({
          key: event.key,
          ctrl: event.ctrlKey,
          meta: event.metaKey,
          shift: event.shiftKey,
          alt: event.altKey,
        });
        if (handled) event.preventDefault();
      };
      window.addEventListener("keydown", listener);
      return () => window.removeEventListener("keydown", listener);
    },
    promptForLink: (current) => window.prompt("Link address", current),
    publishDiagnostics(snapshot) {
      if (kind === "browser") {
        Object.freeze(snapshot.document);
        Object.freeze(snapshot.phases);
        Object.freeze(snapshot.enabledCommands);
        Object.freeze(snapshot.pendingOperationIds);
        Object.defineProperty(window, "__VERSEFORM_DIAGNOSTICS__", {
          configurable: true,
          enumerable: false,
          writable: false,
          value: Object.freeze(snapshot),
        });
      }
    },
  };
}

export function createRuntimeWorkspaceController(): WorkspaceController {
  const runtime = createRuntimeAdapters();
  return new WorkspaceController({
    runtime,
    fallback: WEB_TRANSLATION,
    scheduler: createScheduler(),
    host: createHost(runtime.kind),
  });
}
