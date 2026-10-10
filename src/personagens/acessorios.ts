import type { AgenteId } from "../tipos";

export const ACESSORIOS = [
  { id: "lacinho", posicao: "cabeca", categoria: "dia" },
  { id: "fone", posicao: "cabeca", categoria: "dia" },
  { id: "pintor", posicao: "cabeca", categoria: "dia" },
  { id: "boina", posicao: "cabeca", categoria: "dia" },
  { id: "bone", posicao: "cabeca", categoria: "dia" },
  { id: "coroa", posicao: "cabeca", categoria: "dia" },
  { id: "oculos", posicao: "rosto", categoria: "dia" },
  { id: "oculos-sol", posicao: "rosto", categoria: "dia" },
  { id: "colar", posicao: "detalhe", categoria: "dia" },
  { id: "gravata", posicao: "detalhe", categoria: "dia" },
  { id: "capa", posicao: "costas", categoria: "dia" },
  { id: "bruxa", posicao: "cabeca", categoria: "halloween" },
  { id: "abobora", posicao: "detalhe", categoria: "halloween" },
  { id: "vampiro", posicao: "costas", categoria: "halloween" },
  { id: "natal", posicao: "cabeca", categoria: "natal" },
  { id: "rena", posicao: "cabeca", categoria: "natal" },
  { id: "cachecol", posicao: "detalhe", categoria: "natal" },
] as const;
export type AcessorioId = typeof ACESSORIOS[number]["id"];
export type PosicaoAcessorio = typeof ACESSORIOS[number]["posicao"];
export type CategoriaAcessorio = typeof ACESSORIOS[number]["categoria"];
export type AcessoriosAgente = Record<PosicaoAcessorio, AcessorioId | null>;
export const SEM_ACESSORIOS: AcessoriosAgente = { cabeca: null, rosto: null, detalhe: null, costas: null };
export const POSICOES_ACESSORIOS: PosicaoAcessorio[] = ["cabeca", "rosto", "detalhe", "costas"];

export function acessoriosValidos(valor: unknown): AcessoriosAgente {
  const fonte = valor && typeof valor === "object" ? valor as Record<string, unknown> : {};
  const validos = { ...SEM_ACESSORIOS };
  const item = ACESSORIOS.find((a) => fonte[a.posicao] === a.id);
  if (item) validos[item.posicao] = item.id;
  return validos;
}

export function corAcessorioValida(valor: unknown): string | null {
  return typeof valor === "string" && /^#[\da-f]{6}$/i.test(valor) ? valor.toLowerCase() : null;
}

export function vestirAcessorio(atual: AcessoriosAgente, id: AcessorioId): AcessoriosAgente {
  const item = ACESSORIOS.find((a) => a.id === id);
  const validos = acessoriosValidos(atual);
  return item ? { ...SEM_ACESSORIOS, [item.posicao]: validos[item.posicao] === id ? null : id } : validos;
}

export function temAcessorios(acessorios: AcessoriosAgente): boolean {
  return POSICOES_ACESSORIOS.some((p) => acessorios[p] !== null);
}

export const ENCAIXES_ACESSORIOS: Record<AgenteId, { topo: number; largura: number; olhos: number; separacao: number }> = {
  organizador: { topo: -.53, largura: .88, olhos: .20, separacao: .51 },
  tutor: { topo: -.70, largura: 1.18, olhos: .02, separacao: .54 },
  java: { topo: -.52, largura: .9, olhos: .30, separacao: .49 },
  operador: { topo: -.51, largura: .86, olhos: .08, separacao: .44 },
};
