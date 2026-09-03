import type { EditorMark, EditorNode, VerseformDocument } from "./document";

export type PrintOptions = { pageNumbers: boolean };

export type PrintSnapshot = {
  html: string;
  bodyHtml: string;
  notices: string[];
};

const attributionByTranslation: Record<string, string> = {
  WEB: "Scripture quotations are from the World English Bible (Public Domain).",
};

const allowedFonts = new Set([
  "Garamond",
  "Georgia",
  "Arial",
  "Calibri",
  "Times New Roman",
  "Verdana",
]);
const allowedAlignments = new Set(["left", "center", "right", "justify"]);
const allowedLineHeights = new Set(["1", "1.15", "1.5", "2"]);

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeNumber(value: unknown, minimum: number, maximum: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : undefined;
}

function safeColor(value: unknown): string | undefined {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : undefined;
}

function safeHref(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value, "https://verseform.local/");
    if (!["http:", "https:", "mailto:"].includes(url.protocol)) return undefined;
    return value;
  } catch {
    return undefined;
  }
}

function renderTextStyle(mark: EditorMark, text: string): string {
  const styles: string[] = [];
  const font = mark.attrs?.fontFamily;
  if (typeof font === "string" && allowedFonts.has(font)) {
    styles.push(`font-family: '${font.replaceAll("'", "")}';`);
  }
  const fontSize = mark.attrs?.fontSize;
  if (typeof fontSize === "string" && /^(10|11|12|14|18|24)pt$/.test(fontSize)) {
    styles.push(`font-size: ${fontSize};`);
  }
  const color = safeColor(mark.attrs?.color);
  if (color) styles.push(`color: ${color};`);
  const background = safeColor(mark.attrs?.backgroundColor);
  if (background) styles.push(`background-color: ${background};`);
  return styles.length ? `<span style="${styles.join(" ")}">${text}</span>` : text;
}

function renderMarkedText(
  node: EditorNode,
  translations: Map<string, string | undefined>,
): string {
  let rendered = escapeHtml(node.text ?? "");
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case "bold": rendered = `<strong>${rendered}</strong>`; break;
      case "italic": rendered = `<em>${rendered}</em>`; break;
      case "underline": rendered = `<u>${rendered}</u>`; break;
      case "strike": rendered = `<s>${rendered}</s>`; break;
      case "subscript": rendered = `<sub>${rendered}</sub>`; break;
      case "superscript": rendered = `<sup>${rendered}</sup>`; break;
      case "code": rendered = `<code>${rendered}</code>`; break;
      case "textStyle": rendered = renderTextStyle(mark, rendered); break;
      case "link": {
        const href = safeHref(mark.attrs?.href);
        if (href) rendered = `<a href="${escapeHtml(href)}">${rendered}</a>`;
        break;
      }
      case "citation": {
        const translation = String(mark.attrs?.translationId ?? "");
        const notice = typeof mark.attrs?.attribution === "string" && mark.attrs.attribution.trim()
          ? mark.attrs.attribution.trim()
          : undefined;
        if (translation && (!translations.has(translation) || notice)) translations.set(translation, notice);
        rendered = `<cite data-translation="${escapeHtml(translation)}">${rendered}</cite>`;
        break;
      }
    }
  }
  return rendered;
}

function blockStyle(node: EditorNode): string {
  const styles: string[] = [];
  const alignment = node.attrs?.textAlign;
  if (typeof alignment === "string" && allowedAlignments.has(alignment)) {
    styles.push(`text-align: ${alignment};`);
  }
  const indent = safeNumber(node.attrs?.indent, 0, 8);
  if (indent) styles.push(`margin-left: ${indent * 1.5}rem;`);
  const lineHeight = node.attrs?.lineHeight;
  if (typeof lineHeight === "string" && allowedLineHeights.has(lineHeight)) {
    styles.push(`line-height: ${lineHeight};`);
  }
  const before = safeNumber(node.attrs?.spaceBefore, 0, 72);
  if (before !== undefined) styles.push(`margin-top: ${before}pt;`);
  const after = safeNumber(node.attrs?.spaceAfter, 0, 72);
  if (after !== undefined) styles.push(`margin-bottom: ${after}pt;`);
  return styles.length ? ` style="${styles.join(" ")}"` : "";
}

function renderNode(node: EditorNode, translations: Map<string, string | undefined>): string {
  if (node.type === "text") return renderMarkedText(node, translations);
  const children = (node.content ?? []).map((child) => renderNode(child, translations)).join("");
  const style = blockStyle(node);
  switch (node.type) {
    case "doc": return children;
    case "paragraph": return `<p${style}>${children || "<br>"}</p>`;
    case "heading": {
      const level = safeNumber(node.attrs?.level, 1, 6) ?? 2;
      return `<h${level}${style}>${children}</h${level}>`;
    }
    case "bulletList": return `<ul>${children}</ul>`;
    case "orderedList": return `<ol>${children}</ol>`;
    case "listItem": return `<li>${children}</li>`;
    case "blockquote": return `<blockquote>${children}</blockquote>`;
    case "codeBlock": return `<pre><code>${children}</code></pre>`;
    case "hardBreak": return "<br>";
    case "horizontalRule": return "<hr>";
    default: return children;
  }
}

export function buildPrintSnapshot(
  document: VerseformDocument,
  options: PrintOptions,
): PrintSnapshot {
  const translations = new Map<string, string | undefined>();
  const bodyHtml = renderNode(document.content, translations);
  const notices = [...translations].sort(([left], [right]) => left.localeCompare(right)).map(
    ([translation, notice]) => notice ?? attributionByTranslation[translation]
      ?? `Translation attribution required for ${translation}.`,
  );
  const pageNumber = options.pageNumbers
    ? '<div class="sample-page-number" aria-label="Page 1">Page 1</div>'
    : "";
  const noticesHtml = notices.map(
    (notice) => `<p class="translation-notice">${escapeHtml(notice)}</p>`,
  ).join("");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(document.title)} — Verseform</title>
  <style>
    @page { size: letter; margin: 0.75in 0.75in 0.9in; ${options.pageNumbers ? '@bottom-center { content: "Page " counter(page); }' : ""} }
    html { font-family: Garamond, Georgia, serif; color: #191711; }
    body { display: flex; flex-direction: column; min-height: 9.2in; max-width: 7in; margin: 0 auto; font-size: 12pt; line-height: 1.5; }
    p { margin: 0 0 0.75em; }
    cite { font-style: normal; }
    a { color: inherit; text-decoration: underline; }
    .print-footer { border-top: 1px solid #b8ae9c; margin-top: auto; padding-top: 0.6rem; font: 9pt system-ui, sans-serif; color: #514b40; }
    .translation-notice { margin: 0.25rem 0; }
    .sample-page-number { margin-top: 1rem; text-align: center; font: 9pt system-ui, sans-serif; }
    @media print { .sample-page-number { display: none; } }
  </style>
</head>
<body>
  <main>${bodyHtml}</main>
  <footer class="print-footer"><strong>Powered by DBS</strong>${noticesHtml}</footer>
  ${pageNumber}
</body>
</html>`;

  return { html, bodyHtml, notices };
}
