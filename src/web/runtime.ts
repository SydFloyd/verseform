import type { RuntimeAdapters } from "../app/ports";
import { CREDIT_LINK_URLS } from "../app/credits";
import { DbsScriptureProvider } from "../adapters/dbsScriptureProvider";
import { CompositeScriptureProvider } from "../adapters/scriptureProvider";
import { WebScriptureProvider } from "../adapters/webScriptureProvider";
import { WebDatabase } from "./database";
import { WebDocumentStore } from "./documents";
import { WebDbsTransport } from "./scripture";

export function createWebAdapters(): RuntimeAdapters {
  const db = new WebDatabase();
  const print = async () => { window.print(); };
  return {
    kind: "web",
    documents: new WebDocumentStore(db),
    preferences: {
      getPreferredTranslation: () => db.read<string>("preferences", "translation").catch(() => undefined),
      setPreferredTranslation: (translationId) => db.put("preferences", translationId, "translation"),
    },
    scripture: new CompositeScriptureProvider(new WebScriptureProvider(), new DbsScriptureProvider(new WebDbsTransport(db))),
    output: { print, savePdf: async () => { await print(); return null; } },
    externalLinks: { open: async (target) => {
      const link = document.createElement("a");
      link.href = CREDIT_LINK_URLS[target];
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
    } },
    window: {
      onCloseRequested: async () => () => undefined,
      setTitle: async (title) => { document.title = title; },
      close: async () => { /* Browser tabs are closed by the user. */ },
    },
  };
}
