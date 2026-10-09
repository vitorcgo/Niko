import type { Moeda } from "../tipos";

export const MOEDAS: Moeda[] = ["BRL", "USD", "EUR"];

export const SIMBOLO_DA_MOEDA: Record<Moeda, string> = { BRL: "R$", USD: "US$", EUR: "€" };

export interface Cotacoes {
  USD: number;
  EUR: number;
  atualizadaEm?: string;
  manual?: boolean;
}

export const COTACOES_PADRAO: Cotacoes = { USD: 0, EUR: 0 };

const formatadores = new Map<Moeda, Intl.NumberFormat>();

function formatadorDa(moeda: Moeda) {
  let f = formatadores.get(moeda);
  if (!f) {
    f = new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda });
    formatadores.set(moeda, f);
  }
  return f;
}

export function moedaValida(m: unknown): m is Moeda {
  return m === "BRL" || m === "USD" || m === "EUR";
}

export function formatarDinheiro(centavos: number, moeda: Moeda = "BRL"): string {
  return formatadorDa(moeda).format(centavos / 100);
}

export function cotacaoDe(moeda: Moeda, cotacoes: Cotacoes): number {
  return moeda === "BRL" ? 1 : cotacoes[moeda] > 0 ? cotacoes[moeda] : 0;
}

export function temCotacao(moeda: Moeda, cotacoes: Cotacoes): boolean {
  return cotacaoDe(moeda, cotacoes) > 0;
}

/** Converte para centavos de real. Sem cotação conhecida, devolve 0 para não somar valor errado. */
export function emReais(centavos: number, moeda: Moeda, cotacoes: Cotacoes): number {
  return Math.round(centavos * cotacaoDe(moeda, cotacoes));
}

export function converter(centavos: number, de: Moeda, para: Moeda, cotacoes: Cotacoes): number {
  if (de === para) return centavos;
  const origem = cotacaoDe(de, cotacoes);
  const destino = cotacaoDe(para, cotacoes);
  if (!origem || !destino) return 0;
  return Math.round((centavos * origem) / destino);
}

export function lerValorEmCentavos(texto: string): number | null {
  const limpo = texto.trim().replace(/^(r\$|us\$|u\$s|\$|€|eur|usd|brl)\s*/i, "").replace(/\s/g, "");
  if (!limpo) return null;
  let normalizado = limpo;
  if (limpo.includes(",")) {
    if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(limpo)) return null;
    normalizado = limpo.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(limpo)) normalizado = limpo.replace(/\./g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalizado)) return null;
  const valor = Math.round(Number(normalizado) * 100);
  if (!Number.isSafeInteger(valor)) return null;
  return valor;
}

export function centavosParaCampo(centavos: number): string {
  return (centavos / 100).toFixed(2).replace(".", ",");
}

export function formatarCotacao(valor: number): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}
