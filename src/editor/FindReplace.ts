import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export type FindMatch = { from: number; to: number };

type FindState = { query: string; active: number };
const findKey = new PluginKey<FindState>("verseformFindReplace");

function findMatchesInDocument(document: ProseMirrorNode, query: string): FindMatch[] {
  if (!query) return [];
  const needle = query.toLocaleLowerCase();
  const matches: FindMatch[] = [];
  document.descendants((node, position) => {
    if (!node.isText || !node.text) return;
    const haystack = node.text.toLocaleLowerCase();
    let offset = 0;
    while ((offset = haystack.indexOf(needle, offset)) >= 0) {
      matches.push({ from: position + offset, to: position + offset + query.length });
      offset += Math.max(query.length, 1);
    }
  });
  return matches;
}

export function findMatches(editor: Editor, query: string): FindMatch[] {
  return findMatchesInDocument(editor.state.doc, query);
}

export function setFindState(editor: Editor, query: string, active = 0): FindMatch[] {
  const matches = findMatches(editor, query);
  const selected = matches.length ? ((active % matches.length) + matches.length) % matches.length : 0;
  editor.view.dispatch(editor.state.tr.setMeta(findKey, { query, active: selected }));
  if (matches[selected]) {
    editor.view.dispatch(
      editor.state.tr
        .setSelection(TextSelection.create(editor.state.doc, matches[selected].from, matches[selected].to))
        .scrollIntoView(),
    );
  }
  return matches;
}

export function replaceMatch(editor: Editor, match: FindMatch, replacement: string): void {
  editor.view.dispatch(editor.state.tr.insertText(replacement, match.from, match.to));
}

export function replaceAllMatches(editor: Editor, query: string, replacement: string): number {
  const matches = findMatches(editor, query);
  let transaction = editor.state.tr;
  for (const match of [...matches].reverse()) {
    transaction = transaction.insertText(replacement, match.from, match.to);
  }
  if (matches.length) editor.view.dispatch(transaction);
  return matches.length;
}

export const FindReplace = Extension.create({
  name: "findReplace",
  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: findKey,
        state: {
          init: () => ({ query: "", active: 0 }),
          apply(transaction, previous) {
            return (transaction.getMeta(findKey) as FindState | undefined) ?? previous;
          },
        },
        props: {
          decorations(state) {
            const search = findKey.getState(state);
            if (!search?.query) return DecorationSet.empty;
            return DecorationSet.create(
              state.doc,
              findMatchesInDocument(state.doc, search.query).map((match, index) =>
                Decoration.inline(match.from, match.to, {
                  class: index === search.active ? "find-match active" : "find-match",
                }),
              ),
            );
          },
        },
      }),
    ];
  },
});
