export interface MetricasDaSessao {
  entrada?: number; saida?: number; custoUSD?: number; contexto?: number;
  linhasAdicionadas?: number; linhasRemovidas?: number; em: string;
}
export function metricasDesatualizadas(metricas: MetricasDaSessao, agora = Date.now()): boolean {
  const em = Date.parse(metricas.em);
  return !Number.isFinite(em) || em > agora + 60_000 || agora - em >= 5 * 60_000;
}
const objeto = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const numero = (v: unknown, max = 1e12) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : undefined;
export function metricasInformadas(valor: unknown): MetricasDaSessao | undefined {
  const d = objeto(valor);
  if (typeof d.em !== "string" || !Number.isFinite(Date.parse(d.em))) return undefined;
  const m = { entrada: numero(d.entrada), saida: numero(d.saida), custoUSD: numero(d.custoUSD), contexto: numero(d.contexto, 100), linhasAdicionadas: numero(d.linhasAdicionadas), linhasRemovidas: numero(d.linhasRemovidas), em: d.em };
  return Object.values(m).some((v) => typeof v === "number") ? m : undefined;
}
export function metricasMaisRecentes(atual: MetricasDaSessao | undefined, valor: unknown): MetricasDaSessao | undefined {
  const informada = metricasInformadas(valor);
  return informada && (!atual || Date.parse(informada.em) >= Date.parse(atual.em)) ? informada : atual;
}
export function metricasDaStatus(corpo: Record<string, unknown>, em = new Date().toISOString()) {
  if (typeof corpo.session_id !== "string" || !corpo.session_id || corpo.session_id.length > 200) return undefined;
  const contexto = objeto(corpo.context_window); const custo = objeto(corpo.cost);
  const metricas = metricasInformadas({ entrada: contexto.total_input_tokens, saida: contexto.total_output_tokens, contexto: contexto.used_percentage, custoUSD: custo.total_cost_usd, linhasAdicionadas: custo.total_lines_added, linhasRemovidas: custo.total_lines_removed, em });
  return metricas ? { sessao: corpo.session_id, metricas } : undefined;
}
