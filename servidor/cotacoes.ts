const ENDERECO = "https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL";
const VALIDADE_MS = 30 * 60_000;

let guardada: { quando: number; dados: { USD: number; EUR: number; atualizadaEm: string } } | null = null;

function numero(valor: unknown): number {
  const n = typeof valor === "string" ? Number(valor) : NaN;
  return Number.isFinite(n) && n > 0 && n < 1000 ? n : 0;
}

export async function lerCotacoes() {
  if (guardada && Date.now() - guardada.quando < VALIDADE_MS) return guardada.dados;
  const r = await fetch(ENDERECO, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`cotacao_http_${r.status}`);
  const json = (await r.json()) as Record<string, { bid?: unknown; timestamp?: unknown }>;
  const dados = { USD: numero(json.USDBRL?.bid), EUR: numero(json.EURBRL?.bid), atualizadaEm: new Date().toISOString() };
  if (!dados.USD || !dados.EUR) throw new Error("cotacao_invalida");
  guardada = { quando: Date.now(), dados };
  return dados;
}
