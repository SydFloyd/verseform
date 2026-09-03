import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { Fragment } from "@tiptap/pm/model";
import type { Passage } from "../app/ports";
import type { LookupRequest } from "../core/lookup";

export function insertPassage(
  editor: Editor,
  request: LookupRequest,
  passage: Passage,
): void {
  const citationType = editor.schema.marks.citation;
  if (!citationType) throw new Error("The citation mark is unavailable.");

  const citation = `(${request.display}, ${passage.citationLabel})`;
  const citationMark = citationType.create({
    reference: request.reference,
    translationId: passage.translationId,
    citationLabel: passage.citationLabel,
    translationName: passage.translationName,
    attribution: passage.attribution,
  });
  const replacement = Fragment.fromArray([
    editor.schema.text(`${passage.text} `),
    editor.schema.text(citation, [citationMark]),
  ]);
  const transaction = closeHistory(editor.state.tr)
    .replaceWith(request.from, request.to, replacement)
    .scrollIntoView();
  editor.view.dispatch(transaction);
}
