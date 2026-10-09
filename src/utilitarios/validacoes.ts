import { T } from "../textos/textos";
import { dataValida, horaValida } from "./datas";
import type { Evento, Transacao, Conta, Categoria, Pagina } from "../tipos";

export function objeto(valor: unknown): valor is Record<string, unknown> {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor);
}

export function exigir(condicao: unknown, mensagem: string = T.validacao.arquivoInvalido): asserts condicao {
  if (!condicao) throw new Error(mensagem);
}

export function textoObrigatorio(valor: unknown, limite: number): string {
  exigir(typeof valor === "string" && valor.trim(), T.validacao.obrigatorio);
  exigir(valor.trim().length <= limite, T.validacao.tamanhoMaximo(limite));
  return valor.trim();
}

export function validarTransacao(dados: Omit<Transacao, "id" | "criadaEm">, contas: Conta[], categorias: Categoria[]) {
  exigir(Number.isSafeInteger(dados.valor) && dados.valor > 0, T.validacao.valorPositivo);
  textoObrigatorio(dados.descricao, 120);
  exigir(typeof dados.data === "string" && dataValida(dados.data), T.validacao.dataInvalida);
  exigir(["receita", "despesa", "transferencia"].includes(dados.tipo));
  exigir(contas.some((c) => c.id === dados.contaId), T.validacao.contaObrigatoria);
  exigir(dados.categoriaId === undefined || typeof dados.categoriaId === "string");
  exigir(dados.contaDestinoId === undefined || typeof dados.contaDestinoId === "string");
  if (dados.tipo === "transferencia") {
    exigir(contas.some((c) => c.id === dados.contaDestinoId), T.validacao.contaObrigatoria);
    exigir(dados.contaId !== dados.contaDestinoId, T.validacao.contasIguais);
    exigir(dados.valorDestino === undefined || (Number.isSafeInteger(dados.valorDestino) && dados.valorDestino > 0), T.validacao.valorPositivo);
  } else exigir(!dados.contaDestinoId && dados.valorDestino === undefined);
  if (dados.categoriaId) exigir(categorias.some((c) => c.id === dados.categoriaId && (dados.tipo === "transferencia" || c.tipo === dados.tipo)));
}

export function validarEvento(dados: Omit<Evento, "id">) {
  textoObrigatorio(dados.titulo, 120);
  exigir(typeof dados.data === "string" && dataValida(dados.data), T.validacao.dataInvalida);
  exigir(dados.hora === undefined || dados.hora === "" || (typeof dados.hora === "string" && horaValida(dados.hora)), T.validacao.horaInvalida);
  exigir(["evento", "lembrete"].includes(dados.tipo) && ["nenhuma", "diaria", "semanal", "mensal"].includes(dados.repeticao));
  for (const lista of [dados.excecoes, dados.feitos]) {
    exigir(lista === undefined || (Array.isArray(lista) && lista.every((d) => typeof d === "string" && dataValida(d))));
  }
}

export function validarPaiPagina(pagina: Pick<Pagina, "id" | "materiaId" | "paiId">, paginas: Pagina[]) {
  exigir(pagina.paiId === undefined || (typeof pagina.paiId === "string" && pagina.paiId.length > 0));
  const visitados = new Set([pagina.id]);
  let paiId = pagina.paiId;
  while (paiId) {
    exigir(!visitados.has(paiId));
    visitados.add(paiId);
    const pai = paginas.find((p) => p.id === paiId);
    exigir(pai && pai.materiaId === pagina.materiaId);
    paiId = pai.paiId;
  }
}
