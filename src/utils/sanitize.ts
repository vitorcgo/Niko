const LABELS_ALLOWED = new Set([
  "P", "BR", "STRONG", "B", "EM", "I", "U", "S", "CODE", "PRE", "BLOCKQUOTE",
  "H1", "H2", "H3", "UL", "OL", "LI", "HR", "MARK", "A", "SPAN",
]);

export function sanitizeHtml(html: string): string {
  if (!html) return "";
  const documentValue = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = documentValue.body.firstElementChild;
  if (!root) return "";

  const clear = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (!LABELS_ALLOWED.has(child.tagName)) {
        if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META"].includes(child.tagName)) {
          child.remove();
          continue;
        }
        const fragment = documentValue.createDocumentFragment();
        while (child.firstChild) fragment.appendChild(child.firstChild);
        child.replaceWith(fragment);
        clear(node);
        return;
      }
      for (const attribute of Array.from(child.attributes)) {
        const nameValue = attribute.name.toLowerCase();
        const keep = child.tagName === "A" && nameValue === "href" && /^https?:\/\//i.test(attribute.value);
        if (!keep) child.removeAttribute(attribute.name);
      }
      if (child.tagName === "A") {
        child.setAttribute("rel", "noopener noreferrer");
        child.setAttribute("target", "_blank");
      }
      clear(child);
    }
  };

  clear(root);
  return root.innerHTML;
}

export function htmlToText(html: string): string {
  if (!html) return "";
  const documentValue = new DOMParser().parseFromString(html, "text/html");
  return (documentValue.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
