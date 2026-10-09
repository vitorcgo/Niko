export interface ExcerptChanged {
  antes: string;
  depois: string;
}

export interface ChangeFile {
  arquivo: string;
  trechos: ExcerptChanged[];
  novo: boolean;
}

export interface LineDiff {
  tipo: "mais" | "menos" | "igual";
  texto: string;
}

const MAXIMUM_LINES = 400;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function changeTool(tool: string, input: Record<string, unknown>): ChangeFile | undefined {
  const file = text(input.file_path) || text(input.notebook_path);
  if (!file) return undefined;
  if (tool === "Edit") return { arquivo: file, novo: false, trechos: [{ antes: text(input.old_string), depois: text(input.new_string) }] };
  if (tool === "MultiEdit" && Array.isArray(input.edits)) {
    const excerpts = input.edits.flatMap((e) => (e && typeof e === "object" ? [{ antes: text((e as Record<string, unknown>).old_string), depois: text((e as Record<string, unknown>).new_string) }] : []));
    return excerpts.length ? { arquivo: file, novo: false, trechos: excerpts } : undefined;
  }
  if (tool === "Write") return { arquivo: file, novo: true, trechos: [{ antes: "", depois: text(input.content) }] };
  if (tool === "NotebookEdit" && text(input.new_source)) return { arquivo: file, novo: false, trechos: [{ antes: "", depois: text(input.new_source) }] };
  return undefined;
}

export function linesDiff(before: string, after: string): LineDiff[] {
  const a = before ? before.split("\n").slice(0, MAXIMUM_LINES) : [];
  const b = after ? after.split("\n").slice(0, MAXIMUM_LINES) : [];
  const n = a.length;
  const m = b.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const output: LineDiff[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      output.push({ tipo: "igual", texto: a[i] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) output.push({ tipo: "menos", texto: a[i++] });
    else output.push({ tipo: "mais", texto: b[j++] });
  }
  while (i < n) output.push({ tipo: "menos", texto: a[i++] });
  while (j < m) output.push({ tipo: "mais", texto: b[j++] });
  return output;
}

const countsCalculated = new WeakMap<ChangeFile, { mais: number; menos: number }>();

export function countChanges(change: ChangeFile): { mais: number; menos: number } {
  const ready = countsCalculated.get(change);
  if (ready) return ready;
  let more = 0;
  let less = 0;
  for (const t of change.trechos) for (const l of linesDiff(t.antes, t.depois)) {
    if (l.tipo === "mais") more++;
    else if (l.tipo === "menos") less++;
  }
  const count = { mais: more, menos: less };
  countsCalculated.set(change, count);
  return count;
}
