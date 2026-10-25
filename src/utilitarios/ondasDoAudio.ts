export function ondasDoAudio(amostras: ArrayLike<number>, barras: number): number[] {
  if (barras <= 0) return [];
  if (amostras.length === 0) return Array.from({ length: barras }, () => 0);
  const passo = amostras.length / barras;
  const picos = Array.from({ length: barras }, (_, i) => {
    const inicio = Math.floor(i * passo);
    const fim = Math.max(inicio + 1, Math.floor((i + 1) * passo));
    let soma = 0;
    for (let j = inicio; j < fim && j < amostras.length; j++) soma += amostras[j] * amostras[j];
    return Math.sqrt(soma / (fim - inicio));
  });
  const maior = Math.max(...picos);
  return maior > 0 ? picos.map((p) => Math.round((p / maior) * 100) / 100) : picos;
}

export function formatarDuracao(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos < 0) return "0:00";
  const total = Math.floor(segundos);
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const resto = String(total % 60).padStart(2, "0");
  return horas > 0 ? `${horas}:${String(minutos).padStart(2, "0")}:${resto}` : `${minutos}:${resto}`;
}
