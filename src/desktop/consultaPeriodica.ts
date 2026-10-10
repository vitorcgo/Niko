export function iniciarConsultaPeriodica(consultar: (sinal: AbortSignal) => Promise<void>, intervaloMs: number, limiteMs = 15000): () => void {
  let ativo = true;
  let proxima: ReturnType<typeof setTimeout> | undefined;
  let limite: ReturnType<typeof setTimeout> | undefined;
  let controlador: AbortController | undefined;

  const ler = async () => {
    if (!ativo) return;
    const atual = new AbortController();
    controlador = atual;
    limite = setTimeout(() => atual.abort(), limiteMs);
    try {
      await consultar(atual.signal);
    } catch {
      return;
    } finally {
      clearTimeout(limite);
      if (ativo) proxima = setTimeout(() => void ler(), intervaloMs);
    }
  };

  void ler();
  return () => {
    ativo = false;
    clearTimeout(proxima);
    clearTimeout(limite);
    controlador?.abort();
  };
}
