import TextAlign from "@tiptap/extension-text-align";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { Extension, type Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef } from "react";
import type { CanonMetadata } from "../core/canon";
import { contentHash, type EditorNode } from "../core/document";
import { Citation } from "./Citation";
import { cleanPastedHtml } from "./cleanPaste";
import { DocumentLimits } from "./DocumentLimits";
import {
  FindReplace,
  findMatches,
  replaceAllMatches,
  replaceMatch,
  setFindState,
} from "./FindReplace";
import { insertPassage } from "./insertPassage";
import { ParagraphStyle } from "./ParagraphStyle";
import {
  ReferenceDecorations,
  refreshReferenceDecorations,
  type PositionedReference,
  type PositionedValidReference,
} from "./ReferenceDecorations";
import {
  DEFAULT_FORMATTING,
  DEFAULT_PARAGRAPH,
  type Alignment,
  type EditorFormatting,
  type EditorGateway,
  type EditorInstruction,
  type EditorInstructionResult,
  type EditorObservation,
} from "./gateway";

const EMPTY_DOCUMENT: EditorNode = { type: "doc", content: [{ type: "paragraph" }] };

const IndentationKeys = Extension.create({
  name: "verseformIndentationKeys",
  priority: 1_100,
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        dispatchInstruction(this.editor, { type: "format.indent", direction: 1 });
        return true;
      },
      "Shift-Tab": () => {
        dispatchInstruction(this.editor, { type: "format.indent", direction: -1 });
        return true;
      },
    };
  },
});

function formattingFor(editor: Editor): EditorFormatting {
  const textStyle = editor.getAttributes("textStyle");
  const blockType = editor.isActive("heading") ? "heading" : "paragraph";
  const block = editor.getAttributes(blockType);
  const alignment = (["left", "center", "right", "justify"] as Alignment[])
    .find((value) => editor.isActive({ textAlign: value })) ?? "left";
  return {
    ...DEFAULT_FORMATTING,
    fontFamily: String(textStyle.fontFamily || DEFAULT_FORMATTING.fontFamily),
    fontSize: String(textStyle.fontSize || DEFAULT_FORMATTING.fontSize),
    color: String(textStyle.color || DEFAULT_FORMATTING.color),
    backgroundColor: String(textStyle.backgroundColor || DEFAULT_FORMATTING.backgroundColor),
    lineHeight: String(block.lineHeight || DEFAULT_PARAGRAPH.lineHeight),
    spaceBefore: Number(block.spaceBefore ?? DEFAULT_PARAGRAPH.spaceBefore),
    spaceAfter: Number(block.spaceAfter ?? DEFAULT_PARAGRAPH.spaceAfter),
    alignment,
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    underline: editor.isActive("underline"),
    strike: editor.isActive("strike"),
    subscript: editor.isActive("subscript"),
    superscript: editor.isActive("superscript"),
    link: editor.isActive("link"),
    bulletList: editor.isActive("bulletList"),
    orderedList: editor.isActive("orderedList"),
    canUndo: editor.can().undo(),
    canRedo: editor.can().redo(),
  };
}

function updateBlock(editor: Editor, attributes: Record<string, unknown>): void {
  const type = editor.isActive("heading") ? "heading" : "paragraph";
  editor.chain().focus().updateAttributes(type, attributes).run();
}

function dispatchInstruction(editor: Editor, instruction: EditorInstruction): EditorInstructionResult {
  switch (instruction.type) {
    case "content.set":
      editor.commands.setContent(instruction.content, { emitUpdate: false });
      return;
    case "focus":
      editor.commands.focus(instruction.position);
      return;
    case "references.refresh":
      refreshReferenceDecorations(editor);
      return;
    case "history.undo": editor.chain().focus().undo().run(); return;
    case "history.redo": editor.chain().focus().redo().run(); return;
    case "format.toggle": {
      const chain = editor.chain().focus();
      if (instruction.mark === "bold") chain.toggleBold().run();
      else if (instruction.mark === "italic") chain.toggleItalic().run();
      else if (instruction.mark === "underline") chain.toggleUnderline().run();
      else if (instruction.mark === "strike") chain.toggleStrike().run();
      else if (instruction.mark === "subscript") chain.toggleSubscript().run();
      else chain.toggleSuperscript().run();
      return;
    }
    case "format.fontFamily": editor.chain().focus().setFontFamily(instruction.value).run(); return;
    case "format.fontSize": editor.chain().focus().setFontSize(instruction.value).run(); return;
    case "format.color": editor.chain().focus().setColor(instruction.value).run(); return;
    case "format.highlight": editor.chain().focus().setBackgroundColor(instruction.value).run(); return;
    case "format.link": editor.chain().focus().extendMarkRange("link").setLink({ href: instruction.href }).run(); return;
    case "format.link.remove": editor.chain().focus().extendMarkRange("link").unsetLink().run(); return;
    case "format.list": {
      const chain = editor.chain().focus();
      if (instruction.ordered) chain.toggleOrderedList().run();
      else chain.toggleBulletList().run();
      return;
    }
    case "format.align": editor.chain().focus().setTextAlign(instruction.alignment).run(); return;
    case "format.indent": {
      if (editor.isActive("listItem")) {
        if (instruction.direction > 0) editor.chain().focus().sinkListItem("listItem").run();
        else editor.chain().focus().liftListItem("listItem").run();
      } else {
        const type = editor.isActive("heading") ? "heading" : "paragraph";
        const current = Number(editor.getAttributes(type).indent ?? 0);
        updateBlock(editor, { indent: Math.max(0, Math.min(8, current + instruction.direction)) });
      }
      return;
    }
    case "format.paragraph": updateBlock(editor, instruction.settings); return;
    case "find.set": {
      const matches = setFindState(editor, instruction.query, instruction.index);
      return {
        count: matches.length,
        index: matches.length
          ? ((instruction.index % matches.length) + matches.length) % matches.length
          : 0,
      };
    }
    case "find.replace": {
      const match = findMatches(editor, instruction.query)[instruction.index];
      if (match) replaceMatch(editor, match, instruction.replacement);
      const matches = setFindState(editor, instruction.query, instruction.index);
      return {
        count: matches.length,
        index: matches.length
          ? ((instruction.index % matches.length) + matches.length) % matches.length
          : 0,
      };
    }
    case "find.replaceAll": {
      const replacements = replaceAllMatches(editor, instruction.query, instruction.replacement);
      setFindState(editor, instruction.query, 0);
      return { replacements };
    }
    case "scripture.insert": insertPassage(editor, instruction.request, instruction.passage); return;
  }
}

function createGateway(editor: Editor, canon: { current: CanonMetadata }): EditorGateway {
  let suppressDocumentChanges = false;
  return {
    subscribe(listener) {
      let active = true;
      const observe = (documentChanged: boolean): EditorObservation => ({
        contentHash: contentHash(editor.getJSON() as EditorNode),
        formatting: formattingFor(editor),
        documentChanged,
      });
      const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
        const documentChanged = transaction.docChanged && !suppressDocumentChanges;
        queueMicrotask(() => {
          if (active) listener(observe(documentChanged));
        });
      };
      editor.on("transaction", onTransaction);
      listener(observe(false));
      return () => {
        active = false;
        editor.off("transaction", onTransaction);
      };
    },
    freeze: () => editor.getJSON() as EditorNode,
    readRange(from, to) {
      try { return editor.state.doc.textBetween(from, to, "\n", "\n"); }
      catch { return ""; }
    },
    linkHref: () => String(editor.getAttributes("link").href ?? "https://"),
    dispatch(instruction) {
      if (instruction.type !== "content.set") return dispatchInstruction(editor, instruction);
      suppressDocumentChanges = true;
      try { return dispatchInstruction(editor, instruction); }
      finally { suppressDocumentChanges = false; }
    },
    setCanon(nextCanon) {
      canon.current = nextCanon;
      refreshReferenceDecorations(editor);
    },
  };
}

export type EditorSurfaceProps = {
  onGateway(gateway: EditorGateway | undefined): void;
  onLimit(): void;
  onReferenceHover(candidate: PositionedReference, position: { top: number; left: number }): void;
  onReferenceLeave(): void;
  onReferenceClick(candidate: PositionedValidReference): void;
  initialCanon: CanonMetadata;
};

export function EditorSurface(props: EditorSurfaceProps) {
  const callbacks = useRef(props);
  callbacks.current = props;
  const canon = useRef(props.initialCanon);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, HTMLAttributes: { rel: "noopener noreferrer" } } }),
      TextStyleKit.configure({ lineHeight: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Subscript,
      Superscript,
      ParagraphStyle,
      FindReplace,
      Citation,
      IndentationKeys,
      DocumentLimits.configure({ onLimit: () => callbacks.current.onLimit() }),
      ReferenceDecorations.configure({
        onHover: (candidate, rect) => callbacks.current.onReferenceHover(candidate, {
          top: Math.max(12, Math.min(rect.bottom + 10, window.innerHeight - 210)),
          left: Math.max(12, Math.min(rect.left, window.innerWidth - 390)),
        }),
        onLeave: () => callbacks.current.onReferenceLeave(),
        onClick: (candidate) => callbacks.current.onReferenceClick(candidate),
        getCanon: () => canon.current,
      }),
    ],
    content: EMPTY_DOCUMENT,
    editorProps: {
      attributes: {
        id: "document-editor",
        class: "writing-surface",
        role: "textbox",
        "aria-label": "Document editor",
        "aria-multiline": "true",
        spellcheck: "true",
      },
      transformPastedHTML: cleanPastedHtml,
    },
  });

  useEffect(() => {
    if (!editor) return;
    const gateway = createGateway(editor, canon);
    callbacks.current.onGateway(gateway);
    return () => callbacks.current.onGateway(undefined);
  }, [editor]);

  return <EditorContent editor={editor} />;
}

export type { PositionedReference, PositionedValidReference };
