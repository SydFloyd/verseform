/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { COMMANDS } from "../src/app/commands";

describe("application boundaries", () => {
  test("the React application shell is passive and does not reach concrete runtime or Tiptap APIs", () => {
    const app = readFileSync(new URL("../src/ui/App.tsx", import.meta.url), "utf8");
    expect(app).not.toMatch(/@tiptap|adapters\/|createRuntimeAdapters|runtime\.(documents|scripture|output|externalLinks|window)/);
    expect(app).not.toMatch(/setTimeout|localStorage|fetch\(/);
    const controller = readFileSync(new URL("../src/app/controller.ts", import.meta.url), "utf8");
    const workspace = readFileSync(new URL("../src/app/workspace.ts", import.meta.url), "utf8");
    const directBrowserApi = /\bwindow\.(addEventListener|removeEventListener|setTimeout|clearTimeout|requestAnimationFrame|prompt)|\blocalStorage\b/;
    expect(controller).not.toMatch(/@tiptap|\.\.\/adapters\//);
    expect(controller).not.toMatch(directBrowserApi);
    expect(workspace).not.toMatch(/@tiptap|\.\.\/adapters\//);
    expect(workspace).not.toMatch(directBrowserApi);
  });

  test("the VFM-140 acceptance journey reaches controls without programmatic focus or DOM injection", () => {
    const journey = readFileSync(new URL("./browser/keyboard-navigation.spec.ts", import.meta.url), "utf8");
    expect(journey).not.toMatch(/\.focus\(|\.evaluate\(|dispatchEvent\(/);
  });

  test("the command catalog is finite and has one definition per command", () => {
    const ids = COMMANDS.map((command) => command.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining([
      "file.new", "file.open", "file.save", "file.print", "edit.find", "edit.paragraph",
      "help.credits", "format.bold", "format.align", "format.link",
    ]));
  });
});
