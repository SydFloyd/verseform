const allowedElements = new Set([
  "A", "B", "BR", "EM", "I", "LI", "OL", "P", "S", "STRONG", "SUB", "SUP", "U", "UL",
]);

function safeHref(value: string): boolean {
  try {
    return ["http:", "https:", "mailto:"].includes(
      new URL(value, "https://verseform.local/").protocol,
    );
  } catch {
    return false;
  }
}

export function cleanPastedHtml(html: string): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  parsed.querySelectorAll("script, style, iframe, object, embed, meta, link").forEach((node) => node.remove());

  const elements = [...parsed.body.querySelectorAll("*")].reverse();
  for (const element of elements) {
    if (!allowedElements.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      continue;
    }
    const href = element.tagName === "A" ? element.getAttribute("href") : null;
    for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);
    if (href && safeHref(href)) element.setAttribute("href", href);
  }
  return parsed.body.innerHTML;
}
