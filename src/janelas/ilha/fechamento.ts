export function atrasoDeFechamento(segundos: number, aba: string): number | null {
  if (!Number.isFinite(segundos) || segundos === 0) return null;
  if (segundos === -1) return 0;
  if (segundos < 0 || aba === "claude" || aba === "time") return null;
  return segundos * 1000;
}

export function editandoNaIlha(raiz: HTMLElement | null, foco: Element | null): boolean {
  return !!(raiz && foco && raiz.contains(foco) && foco.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"));
}
