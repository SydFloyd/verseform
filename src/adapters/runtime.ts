import type { RuntimeAdapters } from "../app/ports";
import { createBrowserAdapters } from "./browserAdapters";
import { createTauriAdapters } from "./tauriAdapters";

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
