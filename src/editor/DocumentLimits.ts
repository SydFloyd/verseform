import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  MAX_DOCUMENT_NODES,
  MAX_DOCUMENT_TEXT_CHARACTERS,
} from "../core/document";

function withinEditorLimits(document: ProseMirrorNode): boolean {
  if (document.textContent.length > MAX_DOCUMENT_TEXT_CHARACTERS) return false;
  let nodes = 1;
  document.descendants(() => {
    nodes += 1;
    return nodes <= MAX_DOCUMENT_NODES;
  });
  return nodes <= MAX_DOCUMENT_NODES;
}

export const DocumentLimits = Extension.create<{ onLimit: () => void }>({
  name: "documentLimits",
  addOptions() {
    return { onLimit: () => undefined };
  },
  addProseMirrorPlugins() {
    return [new Plugin({
      filterTransaction: (transaction) => {
        if (!transaction.docChanged || withinEditorLimits(transaction.doc)) return true;
        this.options.onLimit();
        return false;
      },
    })];
  },
});
