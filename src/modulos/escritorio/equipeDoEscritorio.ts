export const TAMANHO_DA_EQUIPE = 6;
export const SALA_DA_EQUIPE = "niko-equipe";

export const IDS_DA_EQUIPE = Array.from({ length: TAMANHO_DA_EQUIPE }, (_, i) => `equipe-${i}`);

export function ehDaEquipe(id: string): boolean {
  return IDS_DA_EQUIPE.includes(id);
}

/** Cada sessão nova recebe um boneco livre da equipe e o mantém enquanto existir. Sem boneco livre, a sessão ganha um próprio. */
export function atribuirEquipe(anterior: ReadonlyMap<string, string>, sessoes: readonly string[]): Map<string, string> {
  const vivas = new Set(sessoes);
  const atual = new Map([...anterior].filter(([sessao]) => vivas.has(sessao)));
  const ocupados = new Set(atual.values());
  for (const sessao of sessoes) {
    if (atual.has(sessao)) continue;
    const livre = IDS_DA_EQUIPE.find((id) => !ocupados.has(id));
    if (!livre) break;
    atual.set(sessao, livre);
    ocupados.add(livre);
  }
  return atual;
}
