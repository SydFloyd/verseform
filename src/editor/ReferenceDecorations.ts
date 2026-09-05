import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  isValidReference, scanReferences, type DetectedReference,
  type ReferenceCandidate, type TextRange,
} from "../core/reference";
import { WEB_CANON, type CanonMetadata } from "../core/canon";

export type PositionedReference = DetectedReference;
export type PositionedValidReference = ReferenceCandidate;

type ReferenceDecorationOptions = {
  onHover: (candidate: PositionedReference, rect: DOMRect) => void;
  onLeave: () => void;
  onClick: (candidate: PositionedValidReference) => void;
  getCanon: () => CanonMetadata;
};

const referenceDecorationKey = new PluginKey<DecorationSet>("verseformReferences");

function decorationsForBlock(
  node: ProseMirrorNode,
  position: number,
  canon: CanonMetadata,
  endOfBlockDelimited = false,
): Decoration[] {
  const excluded: TextRange[] = [];
  node.descendants((child, offset) => {
    if (child.isText && child.marks.some((mark) => mark.type.name === "citation")) {
      excluded.push({ from: offset, to: offset + child.nodeSize });
    }
    return true;
  });

  const contentStart = position + 1;
  const blockText = node.textBetween(0, node.content.size, "\n", "\n");
  const scanText = endOfBlockDelimited ? `${blockText}\n` : blockText;
  return scanReferences(scanText, excluded, canon).map((candidate) => {
    const positioned: PositionedReference = {
      ...candidate,
      from: contentStart + candidate.from,
      to: contentStart + candidate.to,
    };
    const valid = isValidReference(positioned);
    return Decoration.inline(
      positioned.from,
      positioned.to,
      {
        class: valid ? "scripture-reference" : "scripture-reference-invalid",
        role: valid ? "button" : "note",
        tabindex: "0",
        "aria-label": valid
          ? `Preview and insert ${positioned.display}. Press Enter or Space to insert; use arrow keys for other references.`
          : `Invalid reference: ${positioned.display}. ${positioned.issue.message} Use arrow keys for other references.`,
        "aria-keyshortcuts": valid
          ? "Enter Space ArrowUp ArrowDown ArrowLeft ArrowRight Escape F6 Shift+F6"
          : "ArrowUp ArrowDown ArrowLeft ArrowRight Escape F6 Shift+F6",
        "data-reference-kind": positioned.kind,
        "data-verseform-reference": encodeURIComponent(JSON.stringify(positioned)),
      },
      { inclusiveStart: false, inclusiveEnd: false },
    );
  });
}

function lastTextblockPosition(doc: ProseMirrorNode): number {
  let last = -1;
  doc.descendants((node, position) => {
    if (node.isTextblock) {
      last = position;
      return false;
    }
    return true;
  });
  return last;
}

function documentDecorations(doc: ProseMirrorNode, canon: CanonMetadata): DecorationSet {
  const decorations: Decoration[] = [];
  const lastBlock = lastTextblockPosition(doc);
  doc.descendants((node, position) => {
    if (node.isTextblock) {
      decorations.push(...decorationsForBlock(node, position, canon, position !== lastBlock));
      return false;
    }
    return true;
  });
  return DecorationSet.create(doc, decorations);
}

function changedBlocks(transaction: Transaction, doc: ProseMirrorNode): Map<number, ProseMirrorNode> {
  const blocks = new Map<number, ProseMirrorNode>();
  transaction.mapping.maps.forEach((stepMap, index) => {
    const remaining = transaction.mapping.slice(index + 1);
    stepMap.forEach((_oldFrom, _oldTo, newFrom, newTo) => {
      const mappedFrom = remaining.map(newFrom, -1);
      const mappedTo = remaining.map(newTo, 1);
      const from = Math.max(0, Math.min(mappedFrom, mappedTo) - 1);
      const to = Math.min(doc.content.size, Math.max(mappedFrom, mappedTo) + 1);
      doc.nodesBetween(from, to, (node, position) => {
        if (node.isTextblock) {
          blocks.set(position, node);
          return false;
        }
        return true;
      });
    });
  });
  return blocks;
}

function updateDecorations(
  transaction: Transaction,
  current: DecorationSet,
  doc: ProseMirrorNode,
  canon: CanonMetadata,
): DecorationSet {
  let updated = current.map(transaction.mapping, doc);
  const blocks = changedBlocks(transaction, doc);
  const lastBlock = lastTextblockPosition(doc);
  if (!blocks.size) return documentDecorations(doc, canon);
  for (const [position, node] of blocks) {
    updated = updated.remove(updated.find(position, position + node.nodeSize));
    updated = updated.add(doc, decorationsForBlock(node, position, canon, position !== lastBlock));
  }
  return updated;
}

function referenceElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>("[data-verseform-reference]");
}

function candidateFrom(element: HTMLElement): PositionedReference | null {
  const encoded = element.dataset.verseformReference;
  if (!encoded) return null;
  try { return JSON.parse(decodeURIComponent(encoded)) as PositionedReference; }
  catch { return null; }
}

function moveReferenceFocus(root: HTMLElement, current: HTMLElement, direction: 1 | -1): void {
  const references = Array.from(root.querySelectorAll<HTMLElement>("[data-verseform-reference]"));
  const currentIndex = references.indexOf(current);
  if (currentIndex < 0 || references.length < 2) return;
  references[(currentIndex + direction + references.length) % references.length].focus();
}

export const ReferenceDecorations = Extension.create<ReferenceDecorationOptions>({
  name: "referenceDecorations",

  addOptions() {
    return {
      onHover: () => undefined,
      onLeave: () => undefined,
      onClick: () => undefined,
      getCanon: () => WEB_CANON,
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    const showPreview = (target: EventTarget | null) => {
      const element = referenceElement(target);
      const candidate = element && candidateFrom(element);
      if (element && candidate) options.onHover(candidate, element.getBoundingClientRect());
      return { element, candidate };
    };
    return [
      new Plugin<DecorationSet>({
        key: referenceDecorationKey,
        state: {
          init: (_, state) => documentDecorations(state.doc, options.getCanon()),
          apply: (transaction, current, _oldState, newState) =>
            transaction.getMeta(referenceDecorationKey) === "refresh"
              ? documentDecorations(newState.doc, options.getCanon())
              : transaction.docChanged
              ? updateDecorations(transaction, current, newState.doc, options.getCanon())
              : current.map(transaction.mapping, transaction.doc),
        },
        props: {
          decorations: (state) => referenceDecorationKey.getState(state),
          handleDOMEvents: {
            click: (_view, event) => {
              const element = referenceElement(event.target);
              const candidate = element && candidateFrom(element);
              if (!element || !candidate) return false;
              if (isValidReference(candidate)) options.onClick(candidate);
              else options.onHover(candidate, element.getBoundingClientRect());
              return true;
            },
            mouseover: (_view, event) => { showPreview(event.target); return false; },
            mouseout: (_view, event) => {
              const element = referenceElement(event.target);
              const next = referenceElement(event.relatedTarget);
              if (element && next !== element) options.onLeave();
              return false;
            },
            focusin: (_view, event) => { showPreview(event.target); return false; },
            focusout: (_view, event) => {
              if (referenceElement(event.target) && !referenceElement(event.relatedTarget)) options.onLeave();
              return false;
            },
            keydown: (view, event) => {
              const activeReference = referenceElement(document.activeElement);
              if (event.key === "Escape" && activeReference) {
                event.preventDefault();
                options.onLeave();
                view.focus();
                return true;
              }
              if (activeReference && ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)) {
                event.preventDefault();
                moveReferenceFocus(
                  view.dom,
                  activeReference,
                  event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1,
                );
                return true;
              }
              if (event.key !== "Enter" && event.key !== " ") return false;
              const { candidate } = showPreview(document.activeElement);
              if (!candidate) return false;
              event.preventDefault();
              if (isValidReference(candidate)) {
                options.onClick(candidate);
                view.focus();
              }
              return true;
            },
          },
        },
      }),
    ];
  },
});

export function refreshReferenceDecorations(editor: Editor): void {
  editor.view.dispatch(editor.state.tr.setMeta(referenceDecorationKey, "refresh"));
}
