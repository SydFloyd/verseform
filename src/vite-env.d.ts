/// <reference types="vite/client" />

import type { DiagnosticSnapshot } from "./app/selectors";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    __VERSEFORM_DIAGNOSTICS__?: DiagnosticSnapshot;
  }
}

export {};
