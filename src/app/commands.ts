import type { Alignment } from "../editor/gateway";
import { selectCommandEnabled } from "./selectors";
import type { WorkspaceEvent, WorkspaceState } from "./workspace";

export type WorkspaceCommandId =
  | "file.new" | "file.open" | "file.openRecent" | "file.save" | "file.saveAs"
  | "file.pageNumbers" | "file.print" | "file.savePdf"
  | "edit.undo" | "edit.redo" | "edit.find" | "edit.paragraph"
  | "help.credits"
  | "format.bold" | "format.italic" | "format.underline" | "format.strike"
  | "format.subscript" | "format.superscript" | "format.fontFamily" | "format.fontSize"
  | "format.color" | "format.highlight" | "format.link" | "format.bulletList"
  | "format.orderedList" | "format.align" | "format.outdent" | "format.indent";

export type CommandDefinition = {
  id: WorkspaceCommandId;
  label: string;
  shortcut?: string;
  globalShortcut?: boolean;
};

export const COMMANDS: readonly CommandDefinition[] = [
  { id: "file.new", label: "New", shortcut: "Ctrl+N", globalShortcut: true },
  { id: "file.open", label: "Open", shortcut: "Ctrl+O", globalShortcut: true },
  { id: "file.openRecent", label: "Open recent" },
  { id: "file.save", label: "Save", shortcut: "Ctrl+S", globalShortcut: true },
  { id: "file.saveAs", label: "Save As", shortcut: "Ctrl+Shift+S", globalShortcut: true },
  { id: "file.pageNumbers", label: "Page numbers" },
  { id: "file.print", label: "Print", shortcut: "Ctrl+P", globalShortcut: true },
  { id: "file.savePdf", label: "Save PDF" },
  { id: "edit.undo", label: "Undo", shortcut: "Ctrl+Z" },
  { id: "edit.redo", label: "Redo", shortcut: "Ctrl+Shift+Z" },
  { id: "edit.find", label: "Find / Replace", shortcut: "Ctrl+F", globalShortcut: true },
  { id: "edit.paragraph", label: "Paragraph" },
  { id: "help.credits", label: "Credits & Licenses", shortcut: "F1", globalShortcut: true },
  { id: "format.bold", label: "Bold", shortcut: "Ctrl+B" },
  { id: "format.italic", label: "Italic", shortcut: "Ctrl+I" },
  { id: "format.underline", label: "Underline", shortcut: "Ctrl+U" },
  { id: "format.strike", label: "Strikethrough" },
  { id: "format.subscript", label: "Subscript" },
  { id: "format.superscript", label: "Superscript" },
  { id: "format.fontFamily", label: "Font family" },
  { id: "format.fontSize", label: "Font size" },
  { id: "format.color", label: "Text color" },
  { id: "format.highlight", label: "Highlight color" },
  { id: "format.link", label: "Add or edit link" },
  { id: "format.bulletList", label: "Bullet list" },
  { id: "format.orderedList", label: "Numbered list" },
  { id: "format.align", label: "Alignment" },
  { id: "format.outdent", label: "Outdent" },
  { id: "format.indent", label: "Indent" },
] as const;

export const COMMAND_IDS = COMMANDS.map((command) => command.id);

export function commandDefinition(id: WorkspaceCommandId): CommandDefinition {
  return COMMANDS.find((command) => command.id === id)!;
}

export type CommandPayload = string | Alignment | undefined;

export function eventForCommand(
  state: WorkspaceState,
  id: WorkspaceCommandId,
  payload?: CommandPayload,
): WorkspaceEvent | undefined {
  if (!selectCommandEnabled(state, id)) return;
  switch (id) {
    case "file.new": return { type: "document.request", action: { type: "new" } };
    case "file.open": return { type: "document.request", action: { type: "open" } };
    case "file.openRecent": return typeof payload === "string"
      ? { type: "document.request", action: { type: "recent", path: payload } }
      : undefined;
    case "file.save": return { type: "persistence.saveRequest", forceSaveAs: false };
    case "file.saveAs": return { type: "persistence.saveRequest", forceSaveAs: true };
    case "file.pageNumbers": return { type: "output.togglePageNumbers" };
    case "file.print": return { type: "output.request", mode: "print" };
    case "file.savePdf": return { type: "output.request", mode: "pdf" };
    case "edit.undo": return { type: "editor.command", instruction: { type: "history.undo" } };
    case "edit.redo": return { type: "editor.command", instruction: { type: "history.redo" } };
    case "edit.find": return { type: "overlay.openFind" };
    case "edit.paragraph": return { type: "overlay.openParagraph" };
    case "help.credits": return { type: "overlay.openCredits" };
    case "format.bold": return { type: "editor.command", instruction: { type: "format.toggle", mark: "bold" } };
    case "format.italic": return { type: "editor.command", instruction: { type: "format.toggle", mark: "italic" } };
    case "format.underline": return { type: "editor.command", instruction: { type: "format.toggle", mark: "underline" } };
    case "format.strike": return { type: "editor.command", instruction: { type: "format.toggle", mark: "strike" } };
    case "format.subscript": return { type: "editor.command", instruction: { type: "format.toggle", mark: "subscript" } };
    case "format.superscript": return { type: "editor.command", instruction: { type: "format.toggle", mark: "superscript" } };
    case "format.fontFamily": return typeof payload === "string" ? { type: "editor.command", instruction: { type: "format.fontFamily", value: payload } } : undefined;
    case "format.fontSize": return typeof payload === "string" ? { type: "editor.command", instruction: { type: "format.fontSize", value: payload } } : undefined;
    case "format.color": return typeof payload === "string" ? { type: "editor.command", instruction: { type: "format.color", value: payload } } : undefined;
    case "format.highlight": return typeof payload === "string" ? { type: "editor.command", instruction: { type: "format.highlight", value: payload } } : undefined;
    case "format.link": return { type: "editor.promptLink" };
    case "format.bulletList": return { type: "editor.command", instruction: { type: "format.list", ordered: false } };
    case "format.orderedList": return { type: "editor.command", instruction: { type: "format.list", ordered: true } };
    case "format.align": return typeof payload === "string" ? { type: "editor.command", instruction: { type: "format.align", alignment: payload as Alignment } } : undefined;
    case "format.outdent": return { type: "editor.command", instruction: { type: "format.indent", direction: -1 } };
    case "format.indent": return { type: "editor.command", instruction: { type: "format.indent", direction: 1 } };
  }
}

export type KeyStroke = { key: string; ctrl: boolean; meta: boolean; shift: boolean; alt: boolean };

export function commandForKeyStroke(stroke: KeyStroke): WorkspaceCommandId | undefined {
  if (stroke.key === "F1" && !stroke.ctrl && !stroke.meta && !stroke.shift && !stroke.alt) {
    return "help.credits";
  }
  if (!(stroke.ctrl || stroke.meta) || stroke.alt) return;
  const key = stroke.key.toLowerCase();
  if (key === "s") return stroke.shift ? "file.saveAs" : "file.save";
  if (key === "o") return "file.open";
  if (key === "n") return "file.new";
  if (key === "p") return "file.print";
  if (key === "f" || key === "h") return "edit.find";
  return;
}
