import { Mark, mergeAttributes } from "@tiptap/core";

export const Citation = Mark.create({
  name: "citation",
  inclusive: false,

  addAttributes() {
    return {
      reference: { default: null },
      translationId: { default: null },
      citationLabel: { default: null },
      translationName: { default: null },
      attribution: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-verseform-citation]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const reference = HTMLAttributes.reference;
    const translationId = String(HTMLAttributes.translationId ?? "");
    const attribution = String(HTMLAttributes.attribution ?? "");
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "scripture-citation",
        "data-verseform-citation": "true",
        "data-reference": JSON.stringify(reference),
        "data-translation": translationId,
        "data-attribution": attribution,
      }),
      0,
    ];
  },
});
