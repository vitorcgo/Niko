const OPENING_TAGS = ["<think>", "<thinking>"];
const CLOSING_TAGS = ["</think>", "</thinking>"];

function first(text: string, tags: string[]): { inicio: number; fim: number } | null {
  let best: { inicio: number; fim: number } | null = null;
  for (const tag of tags) {
    const i = text.toLowerCase().indexOf(tag);
    if (i >= 0 && (!best || i < best.inicio)) best = { inicio: i, fim: i + tag.length };
  }
  return best;
}

function incompleteTagStart(text: string, tags: string[]): number {
  const i = text.lastIndexOf("<");
  if (i < 0) return -1;
  const rest = text.slice(i).toLowerCase();
  return tags.some((t) => t.startsWith(rest) && t !== rest) ? i : -1;
}

/** Remove local-model thought blocks, including tags split across stream chunks. */
export function createThoughtFilter() {
  let inside = false;
  let stored = "";
  let showedSomething = false;
  let hasThought = false;

  const receive = (excerpt: string): string => {
    let text = stored + excerpt;
    stored = "";
    let output = "";
    while (text) {
      if (!inside) {
        const opens = first(text, OPENING_TAGS);
        if (opens) {
          output += text.slice(0, opens.inicio);
          text = text.slice(opens.fim);
          inside = true;
          hasThought = true;
          continue;
        }
        const partial = incompleteTagStart(text, OPENING_TAGS);
        if (partial >= 0) {
          stored = text.slice(partial);
          text = text.slice(0, partial);
        }
        output += text;
        break;
      }
      const closes = first(text, CLOSING_TAGS);
      if (closes) {
        text = text.slice(closes.fim);
        inside = false;
        if (!showedSomething && !output) text = text.replace(/^\s+/, "");
        continue;
      }
      const partial = incompleteTagStart(text, CLOSING_TAGS);
      stored = partial >= 0 ? text.slice(partial) : "";
      break;
    }
    if (output) showedSomething = true;
    return output;
  };

  const finish = (): string => {
    const rest = inside ? "" : stored;
    stored = "";
    return rest;
  };

  return { receive, finish, hasThought: () => hasThought };
}
