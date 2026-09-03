import { Extension } from "@tiptap/core";

const numericAttribute = (name: string, minimum: number, maximum: number) => ({
  default: 0,
  parseHTML: (element: HTMLElement) => {
    const dataName = name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    const value = Number(element.getAttribute(`data-${dataName}`));
    return Number.isFinite(value) && value >= minimum && value <= maximum ? value : 0;
  },
  renderHTML: (attributes: Record<string, unknown>) => {
    const value = Number(attributes[name]);
    return Number.isFinite(value) && value > 0 && value <= maximum
      ? { [`data-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`]: String(value) }
      : {};
  },
});

export const ParagraphStyle = Extension.create({
  name: "paragraphStyle",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          indent: numericAttribute("indent", 0, 8),
          spaceBefore: numericAttribute("spaceBefore", 0, 72),
          spaceAfter: numericAttribute("spaceAfter", 0, 72),
          lineHeight: {
            default: "1.5",
            parseHTML: (element: HTMLElement) =>
              element.getAttribute("data-line-height") ?? "1.5",
            renderHTML: (attributes: Record<string, unknown>) =>
              ["1", "1.15", "1.5", "2"].includes(String(attributes.lineHeight))
                ? { "data-line-height": String(attributes.lineHeight) }
                : {},
          },
        },
      },
    ];
  },
});
