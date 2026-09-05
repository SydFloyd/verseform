import type { CanonMetadata } from "../core/canon";
import type { EditorNode } from "../core/document";
import type { LookupRequest } from "../core/lookup";
import type { Passage } from "../app/ports";

export type Alignment = "left" | "center" | "right" | "justify";

export type ParagraphSettings = {
  lineHeight: string;
  spaceBefore: number;
  spaceAfter: number;
};

export type EditorFormatting = ParagraphSettings & {
  fontFamily: string;
  fontSize: string;
  color: string;
  backgroundColor: string;
  alignment: Alignment;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  subscript: boolean;
  superscript: boolean;
  link: boolean;
  bulletList: boolean;
  orderedList: boolean;
  canUndo: boolean;
  canRedo: boolean;
};

export const DEFAULT_PARAGRAPH: ParagraphSettings = {
  lineHeight: "1.5",
  spaceBefore: 0,
  spaceAfter: 0,
};

export const DEFAULT_FORMATTING: EditorFormatting = {
  fontFamily: "Garamond",
  fontSize: "12pt",
  color: "#252018",
  backgroundColor: "#fff0a8",
  ...DEFAULT_PARAGRAPH,
  alignment: "left",
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  subscript: false,
  superscript: false,
  link: false,
  bulletList: false,
  orderedList: false,
  canUndo: false,
  canRedo: false,
};

export type EditorObservation = {
  contentHash: string;
  formatting: EditorFormatting;
  documentChanged: boolean;
};

export type FindResult = { count: number; index: number };

export type EditorFocusPosition = "start" | "firstReference" | "lastReference";

export type EditorInstruction =
  | { type: "content.set"; content: EditorNode }
  | { type: "focus"; position?: EditorFocusPosition }
  | { type: "references.refresh" }
  | { type: "history.undo" }
  | { type: "history.redo" }
  | { type: "format.toggle"; mark: "bold" | "italic" | "underline" | "strike" | "subscript" | "superscript" }
  | { type: "format.fontFamily"; value: string }
  | { type: "format.fontSize"; value: string }
  | { type: "format.color"; value: string }
  | { type: "format.highlight"; value: string }
  | { type: "format.link"; href: string }
  | { type: "format.link.remove" }
  | { type: "format.list"; ordered: boolean }
  | { type: "format.align"; alignment: Alignment }
  | { type: "format.indent"; direction: 1 | -1 }
  | { type: "format.paragraph"; settings: ParagraphSettings }
  | { type: "find.set"; query: string; index: number }
  | { type: "find.replace"; query: string; replacement: string; index: number }
  | { type: "find.replaceAll"; query: string; replacement: string }
  | { type: "scripture.insert"; request: LookupRequest; passage: Passage };

export type EditorInstructionResult = FindResult | { replacements: number } | undefined;

export interface EditorGateway {
  subscribe(listener: (observation: EditorObservation) => void): () => void;
  freeze(): EditorNode;
  readRange(from: number, to: number): string;
  linkHref(): string;
  dispatch(instruction: EditorInstruction): EditorInstructionResult;
  setCanon(canon: CanonMetadata): void;
}
