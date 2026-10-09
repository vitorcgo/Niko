import type { PassoClaude, SessaoClaude } from "../../estado/claudeCode";

export function mascararSegredos(texto: string): string {
  return texto.replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|AIza[A-Za-z0-9_-]{20,}|GOCSPX-[A-Za-z0-9_-]+)/g, "[oculto]")
    .replace(/(\b(?:authorization\s*[:=]\s*bearer|api[_-]?key|access[_-]?token|password|senha|secret|client_secret)\s*[:=]?\s*["']?)[^\s"',;]+/gi, "$1[oculto]");
}
export function detalhesDoPasso(p: PassoClaude) {
  return { ...p, detalhe: p.detalhe ? mascararSegredos(p.detalhe) : undefined };
}
export function tarefasDaEntrada(nome: string, bruto: unknown): SessaoClaude["tarefas"] | undefined {
  if (nome !== "TodoWrite" || !bruto || typeof bruto !== "object" || Array.isArray(bruto)) return undefined;
  const todos = (bruto as { todos?: unknown }).todos;
  if (!Array.isArray(todos)) return undefined;
  return todos.slice(0, 40).flatMap((t, i) => {
    if (!t || typeof t !== "object" || typeof t.content !== "string" || !["pending", "in_progress", "completed"].includes(t.status)) return [];
    return [{ id: String(i), titulo: mascararSegredos(t.content.slice(0, 200)), estado: t.status as "pending" | "in_progress" | "completed" }];
  });
}
