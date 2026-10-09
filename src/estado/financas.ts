import { create } from "zustand";
import { persist } from "zustand/middleware";
import { addMonths, setDate, getDaysInMonth } from "date-fns";
import { armazenamento, chave } from "../ponte/armazenamento";
import type {
  Acerto,
  Categoria,
  Conta,
  Divisao,
  ItemCompra,
  ListaCompras,
  MetaEconomia,
  Pessoa,
  PrecoHistorico,
  Recorrente,
  RegraCategoria,
  Transacao,
} from "../tipos";
import { gerarId, normalizarTexto } from "../utilitarios/basicos";
import { deISO, hojeISO, paraISO } from "../utilitarios/datas";
import { T } from "../textos/textos";
import { exigir, validarTransacao } from "../utilitarios/validacoes";
import { COTACOES_PADRAO, emReais, moedaValida, type Cotacoes } from "../utilitarios/dinheiro";
import type { Moeda } from "../tipos";

export const EU = "eu";

export const CATEGORIAS_PADRAO: Omit<Categoria, "id">[] = [
  { nome: "Alimentação", cor: "#e0803b", orcamento: 0, tipo: "despesa" },
  { nome: "Mercado", cor: "#2f9e6b", orcamento: 0, tipo: "despesa" },
  { nome: "Transporte", cor: "#3b6fe0", orcamento: 0, tipo: "despesa" },
  { nome: "Moradia", cor: "#8b5cf6", orcamento: 0, tipo: "despesa" },
  { nome: "Saúde", cor: "#e05a8a", orcamento: 0, tipo: "despesa" },
  { nome: "Lazer", cor: "#d9922b", orcamento: 0, tipo: "despesa" },
  { nome: "Educação", cor: "#0ea5a4", orcamento: 0, tipo: "despesa" },
  { nome: "Assinaturas", cor: "#64748b", orcamento: 0, tipo: "despesa" },
  { nome: "Salário", cor: "#2f9e6b", orcamento: 0, tipo: "receita" },
  { nome: "Outras receitas", cor: "#0ea5a4", orcamento: 0, tipo: "receita" },
];

export const CORES_CATEGORIA = ["#e0803b", "#2f9e6b", "#3b6fe0", "#8b5cf6", "#e05a8a", "#d9922b", "#0ea5a4", "#64748b", "#8a05be", "#c2410c"];

export interface DadosFinancas {
  contas: Conta[];
  categorias: Categoria[];
  transacoes: Transacao[];
  recorrentes: Recorrente[];
  assinaturasIgnoradas: string[];
  metasEconomia: MetaEconomia[];
  pessoas: Pessoa[];
  divisoes: Divisao[];
  acertos: Acerto[];
  listas: ListaCompras[];
  precos: Record<string, PrecoHistorico[]>;
  regras: RegraCategoria[];
  cotacoes: Cotacoes;
}

interface NovaTransacao extends Omit<Transacao, "id" | "criadaEm"> {
  parcelas?: number;
}

interface EstadoFinancas extends DadosFinancas {
  garantirCategorias: () => void;
  criarConta: (dados: Omit<Conta, "id" | "arquivada">) => Conta;
  atualizarConta: (id: string, parcial: Partial<Conta>) => void;
  excluirConta: (id: string) => void;
  criarCategoria: (dados: Omit<Categoria, "id">) => Categoria;
  obterOuCriarCategoria: (nome: string, tipo: Categoria["tipo"]) => Categoria;
  atualizarCategoria: (id: string, parcial: Partial<Categoria>) => void;
  excluirCategoria: (id: string, destinoId: string) => void;
  lancar: (dados: NovaTransacao) => Transacao[];
  atualizarTransacao: (id: string, parcial: Partial<Transacao>) => void;
  excluirTransacao: (id: string) => Transacao[];
  restaurarTransacoes: (itens: Transacao[]) => void;
  ajustarSaldo: (contaId: string, saldoReal: number) => void;
  criarRecorrente: (dados: Omit<Recorrente, "id">) => void;
  atualizarRecorrente: (id: string, parcial: Partial<Recorrente>) => void;
  excluirRecorrente: (id: string) => void;
  gerarRecorrentes: () => number;
  ignorarAssinatura: (chave: string) => void;
  criarMetaEconomia: (dados: Omit<MetaEconomia, "id">) => void;
  guardarNaMeta: (id: string, valor: number) => void;
  excluirMetaEconomia: (id: string) => void;
  criarPessoa: (nome: string) => Pessoa;
  excluirPessoa: (id: string) => void;
  dividir: (dados: Omit<Divisao, "id">) => void;
  excluirDivisao: (id: string) => void;
  registrarAcerto: (dados: Omit<Acerto, "id">, saldoComPessoa: number) => void;
  criarLista: (nome: string, categoriaId?: string) => ListaCompras;
  excluirLista: (id: string) => void;
  adicionarItens: (listaId: string, itens: Omit<ItemCompra, "id" | "marcado">[]) => void;
  atualizarItem: (listaId: string, itemId: string, parcial: Partial<ItemCompra>) => void;
  removerItem: (listaId: string, itemId: string) => void;
  finalizarCompra: (listaId: string, contaId: string, totalReal: number, categoriaId?: string) => void;
  criarRegra: (contem: string, categoriaId: string) => void;
  excluirRegra: (id: string) => void;
  categorizar: (descricao: string) => string | undefined;
  importar: (itens: Omit<Transacao, "id" | "criadaEm">[]) => { importados: number; duplicados: number };
  substituir: (dados: Partial<DadosFinancas>) => void;
  definirCotacoes: (parcial: Partial<Cotacoes>) => void;
}

function datasDeParcela(data: string, n: number): string {
  const base = deISO(data);
  const alvo = addMonths(base, n);
  return paraISO(alvo);
}

export const useFinancas = create<EstadoFinancas>()(
  persist(
    (set, get) => ({
      contas: [],
      categorias: [],
      transacoes: [],
      recorrentes: [],
      assinaturasIgnoradas: [],
      metasEconomia: [],
      pessoas: [],
      divisoes: [],
      acertos: [],
      listas: [],
      precos: {},
      regras: [],
      cotacoes: COTACOES_PADRAO,
      definirCotacoes: (parcial) =>
        set((s) => {
          const atual = { ...COTACOES_PADRAO, ...s.cotacoes };
          const proxima = { ...atual, ...parcial };
          for (const m of ["USD", "EUR"] as const) if (!(Number.isFinite(proxima[m]) && proxima[m] >= 0 && proxima[m] < 1000)) proxima[m] = atual[m];
          return { cotacoes: proxima };
        }),
      garantirCategorias: () => {
        if (get().categorias.length > 0) return;
        set({ categorias: CATEGORIAS_PADRAO.map((c) => ({ ...c, id: gerarId() })) });
      },
      criarConta: (dados) => {
        const conta: Conta = { ...dados, nome: dados.nome.trim().slice(0, 60), id: gerarId(), arquivada: false };
        set((s) => ({ contas: [...s.contas, conta] }));
        return conta;
      },
      atualizarConta: (id, parcial) => set((s) => ({ contas: s.contas.map((c) => (c.id === id ? { ...c, ...parcial } : c)) })),
      excluirConta: (id) =>
        set((s) => ({
          contas: s.contas.filter((c) => c.id !== id),
          transacoes: s.transacoes.filter((t) => t.contaId !== id && t.contaDestinoId !== id),
        })),
      criarCategoria: (dados) => {
        const categoria = { ...dados, nome: dados.nome.trim().slice(0, 40), id: gerarId() };
        set((s) => ({ categorias: [...s.categorias, categoria] }));
        return categoria;
      },
      obterOuCriarCategoria: (nome, tipo) => {
        const alvo = normalizarTexto(nome.trim());
        const existente = get().categorias.find((c) => c.tipo === tipo && normalizarTexto(c.nome) === alvo);
        if (existente) return existente;
        const cor = CORES_CATEGORIA[get().categorias.length % CORES_CATEGORIA.length];
        return get().criarCategoria({ nome, cor, orcamento: 0, tipo });
      },
      atualizarCategoria: (id, parcial) => set((s) => ({ categorias: s.categorias.map((c) => (c.id === id ? { ...c, ...parcial } : c)) })),
      excluirCategoria: (id, destinoId) =>
        set((s) => {
          if (id === destinoId || !s.categorias.some((c) => c.id === destinoId)) return s;
          const trocar = <X extends { categoriaId?: string }>(x: X): X => (x.categoriaId === id ? { ...x, categoriaId: destinoId } : x);
          return {
            categorias: s.categorias.filter((c) => c.id !== id),
            transacoes: s.transacoes.map(trocar),
            recorrentes: s.recorrentes.map(trocar),
            divisoes: s.divisoes.map(trocar),
            listas: s.listas.map(trocar),
            regras: s.regras.map((r) => (r.categoriaId === id ? { ...r, categoriaId: destinoId } : r)),
          };
        }),
      lancar: ({ parcelas = 1, ...dados }) => {
        validarTransacao(dados, get().contas, get().categorias);
        exigir(Number.isInteger(parcelas) && parcelas >= 1 && parcelas <= 48, T.validacao.entre(1, 48));
        exigir(dados.valor >= parcelas, T.validacao.parcelasSemValor);
        const total = parcelas;
        const grupo = total > 1 ? gerarId() : undefined;
        const criadaEm = new Date().toISOString();
        const base = Math.floor(dados.valor / total);
        const resto = dados.valor - base * total;
        const novas: Transacao[] = Array.from({ length: total }, (_, i) => ({
          ...dados,
          descricao: dados.descricao.trim().slice(0, 120),
          id: gerarId(),
          criadaEm,
          valor: base + (i === 0 ? resto : 0),
          data: i === 0 ? dados.data : datasDeParcela(dados.data, i),
          grupoParcelasId: grupo,
          parcela: grupo ? { numero: i + 1, total } : undefined,
        }));
        set((s) => ({ transacoes: [...s.transacoes, ...novas] }));
        return novas;
      },
      atualizarTransacao: (id, parcial) => set((s) => ({ transacoes: s.transacoes.map((t) => {
        if (t.id !== id) return t;
        const nova = { ...t, ...parcial, id: t.id, criadaEm: t.criadaEm };
        validarTransacao(nova, s.contas, s.categorias);
        return nova;
      }) })),
      excluirTransacao: (id) => {
        const alvo = get().transacoes.find((t) => t.id === id);
        if (!alvo) return [];
        const removidas = alvo.grupoParcelasId
          ? get().transacoes.filter((t) => t.grupoParcelasId === alvo.grupoParcelasId && t.data >= alvo.data)
          : [alvo];
        const ids = new Set(removidas.map((t) => t.id));
        set((s) => ({ transacoes: s.transacoes.filter((t) => !ids.has(t.id)) }));
        return removidas;
      },
      restaurarTransacoes: (itens) => set((s) => {
        const ids = new Set(s.transacoes.map((t) => t.id));
        const novas: Transacao[] = [];
        for (const t of itens) {
          exigir(typeof t.id === "string" && t.id.length > 0);
          if (ids.has(t.id)) continue;
          validarTransacao(t, s.contas, s.categorias);
          ids.add(t.id);
          novas.push(t);
        }
        return { transacoes: [...s.transacoes, ...novas] };
      }),
      ajustarSaldo: (contaId, saldoReal) => {
        exigir(Number.isSafeInteger(saldoReal), T.validacao.valorInvalido);
        exigir(get().contas.some((c) => c.id === contaId), T.validacao.contaObrigatoria);
        const atual = saldoDaConta(get(), contaId);
        const diferenca = saldoReal - atual;
        if (diferenca === 0) return;
        get().lancar({
          tipo: diferenca > 0 ? "receita" : "despesa",
          valor: Math.abs(diferenca),
          descricao: T.financas.ajusteDescricao,
          contaId,
          data: hojeISO(),
          ajuste: true,
        });
      },
      criarRecorrente: (dados) => set((s) => ({ recorrentes: [...s.recorrentes, { ...dados, id: gerarId() }] })),
      atualizarRecorrente: (id, parcial) =>
        set((s) => ({
          recorrentes: s.recorrentes.map((r) => {
            if (r.id !== id) return r;
            const novo = { ...r, ...parcial };
            if (parcial.ativa === true && !r.ativa) {
              const ultimo = ultimoVencimentoAte(novo, deISO(hojeISO()));
              if (!r.geradoAte || ultimo > r.geradoAte) novo.geradoAte = ultimo;
            }
            return novo;
          }),
        })),
      excluirRecorrente: (id) => set((s) => ({ recorrentes: s.recorrentes.filter((r) => r.id !== id) })),
      gerarRecorrentes: () => {
        const hoje = hojeISO();
        let gerados = 0;
        const s = get();
        const novas: Transacao[] = [];
        const atualizadas = s.recorrentes.map((r) => {
          if (!r.ativa || !s.contas.some((c) => c.id === r.contaId)) return r;
          const vencimentos = vencimentosAte(r, hoje);
          if (vencimentos.length === 0) return r;
          for (const data of vencimentos) {
            novas.push({
              id: gerarId(),
              tipo: "despesa",
              valor: r.valor,
              descricao: r.descricao,
              categoriaId: r.categoriaId,
              contaId: r.contaId,
              data,
              recorrenteId: r.id,
              criadaEm: new Date().toISOString(),
            });
            gerados++;
          }
          return { ...r, geradoAte: vencimentos[vencimentos.length - 1] };
        });
        if (gerados > 0) set({ recorrentes: atualizadas, transacoes: [...s.transacoes, ...novas] });
        return gerados;
      },
      ignorarAssinatura: (c) => set((s) => ({ assinaturasIgnoradas: [...s.assinaturasIgnoradas, c] })),
      criarMetaEconomia: (dados) => set((s) => ({ metasEconomia: [...s.metasEconomia, { ...dados, id: gerarId() }] })),
      guardarNaMeta: (id, valor) =>
        set((s) => ({ metasEconomia: s.metasEconomia.map((m) => (m.id === id ? { ...m, guardado: Math.max(0, m.guardado + valor) } : m)) })),
      excluirMetaEconomia: (id) => set((s) => ({ metasEconomia: s.metasEconomia.filter((m) => m.id !== id) })),
      criarPessoa: (nome) => {
        const pessoa = { id: gerarId(), nome: nome.trim().slice(0, 40) };
        set((s) => ({ pessoas: [...s.pessoas, pessoa] }));
        return pessoa;
      },
      excluirPessoa: (id) => set((s) => ({ pessoas: s.pessoas.filter((p) => p.id !== id) })),
      dividir: (dados) => {
        const divisao: Divisao = { ...dados, id: gerarId() };
        set((s) => ({ divisoes: [...s.divisoes, divisao] }));
        if (dados.pagadorId === EU && dados.contaId) {
          get().lancar({
            tipo: "despesa",
            valor: dados.total,
            descricao: dados.descricao,
            categoriaId: dados.categoriaId,
            contaId: dados.contaId,
            data: dados.data,
            divisaoId: divisao.id,
          });
        }
      },
      excluirDivisao: (id) =>
        set((s) => ({ divisoes: s.divisoes.filter((d) => d.id !== id), transacoes: s.transacoes.filter((t) => t.divisaoId !== id) })),
      registrarAcerto: (dados, saldoComPessoa) => {
        set((s) => ({ acertos: [...s.acertos, { ...dados, id: gerarId() }] }));
        if (dados.contaId) {
          const pessoa = get().pessoas.find((p) => p.id === dados.pessoaId);
          get().lancar({
            tipo: saldoComPessoa > 0 ? "receita" : "despesa",
            valor: Math.abs(dados.valor),
            descricao: T.financas.acertoDescricao(pessoa?.nome ?? ""),
            contaId: dados.contaId,
            data: dados.data,
            ajuste: true,
          });
        }
      },
      criarLista: (nome, categoriaId) => {
        const lista = { id: gerarId(), nome: nome.trim().slice(0, 40), categoriaId, itens: [] };
        set((s) => ({ listas: [...s.listas, lista] }));
        return lista;
      },
      excluirLista: (id) => set((s) => ({ listas: s.listas.filter((l) => l.id !== id) })),
      adicionarItens: (listaId, itens) =>
        set((s) => ({
          listas: s.listas.map((l) => {
            if (l.id !== listaId) return l;
            const novos = itens
              .filter((i) => i.nome.trim() && !l.itens.some((x) => normalizarTexto(x.nome) === normalizarTexto(i.nome) && !x.marcado))
              .map((i) => {
                const historico = s.precos[normalizarTexto(i.nome)];
                const ultimo = historico?.[historico.length - 1]?.preco ?? 0;
                return { ...i, nome: i.nome.trim().slice(0, 60), id: gerarId(), marcado: false, precoEstimado: i.precoEstimado || ultimo };
              });
            return { ...l, itens: [...l.itens, ...novos] };
          }),
        })),
      atualizarItem: (listaId, itemId, parcial) =>
        set((s) => ({
          listas: s.listas.map((l) => (l.id === listaId ? { ...l, itens: l.itens.map((i) => (i.id === itemId ? { ...i, ...parcial } : i)) } : l)),
        })),
      removerItem: (listaId, itemId) =>
        set((s) => ({ listas: s.listas.map((l) => (l.id === listaId ? { ...l, itens: l.itens.filter((i) => i.id !== itemId) } : l)) })),
      finalizarCompra: (listaId, contaId, totalReal, categoriaId) => {
        const lista = get().listas.find((l) => l.id === listaId);
        if (!lista) return;
        const marcados = lista.itens.filter((i) => i.marcado);
        if (marcados.length === 0) return;
        const hoje = hojeISO();
        get().lancar({
          tipo: "despesa",
          valor: totalReal,
          descricao: T.financas.compraDescricao(lista.nome),
          categoriaId: categoriaId ?? lista.categoriaId,
          contaId,
          data: hoje,
        });
        set((s) => {
          const precos = { ...s.precos };
          for (const item of marcados) {
            if (item.precoEstimado <= 0) continue;
            const k = normalizarTexto(item.nome);
            precos[k] = [...(precos[k] ?? []), { preco: item.precoEstimado, data: hoje }].slice(-20);
          }
          return { precos, listas: s.listas.map((l) => (l.id === listaId ? { ...l, itens: l.itens.filter((i) => !i.marcado) } : l)) };
        });
      },
      criarRegra: (contem, categoriaId) => set((s) => ({ regras: [...s.regras, { id: gerarId(), contem: contem.trim().slice(0, 40), categoriaId }] })),
      excluirRegra: (id) => set((s) => ({ regras: s.regras.filter((r) => r.id !== id) })),
      categorizar: (descricao) => {
        const alvo = normalizarTexto(descricao);
        return get().regras.find((r) => r.contem && alvo.includes(normalizarTexto(r.contem)))?.categoriaId;
      },
      importar: (itens) => {
        itens.forEach((item) => validarTransacao(item, get().contas, get().categorias));
        const existentes = new Set(get().transacoes.map((t) => `${t.data}|${t.valor}|${normalizarTexto(t.descricao)}`));
        const novas: Transacao[] = [];
        let duplicados = 0;
        for (const item of itens) {
          const k = `${item.data}|${item.valor}|${normalizarTexto(item.descricao)}`;
          if (existentes.has(k)) {
            duplicados++;
            continue;
          }
          existentes.add(k);
          novas.push({ ...item, categoriaId: item.categoriaId ?? get().categorizar(item.descricao), id: gerarId(), criadaEm: new Date().toISOString() });
        }
        set((s) => ({ transacoes: [...s.transacoes, ...novas] }));
        return { importados: novas.length, duplicados };
      },
      substituir: (dados) => set(dados),
    }),
    { name: chave("financas"), storage: armazenamento },
  ),
);

function vencimentoAnual(ano: number, mesAnual: number, dia: number): Date {
  const mes = new Date(ano, mesAnual - 1, 1);
  return setDate(mes, Math.min(dia, getDaysInMonth(mes)));
}

/** Marca como já gerado o vencimento do período atual que já passou, para não lançar cobrança retroativa ao criar. */
export function geradoAteInicial(r: Pick<Recorrente, "dia" | "frequencia" | "mesAnual">, hoje: Date): string | undefined {
  const vencimento = r.frequencia === "anual" && r.mesAnual ? vencimentoAnual(hoje.getFullYear(), r.mesAnual, r.dia) : setDate(hoje, Math.min(r.dia, getDaysInMonth(hoje)));
  return paraISO(vencimento) <= paraISO(hoje) ? paraISO(vencimento) : undefined;
}

export function ultimoVencimentoAte(r: Pick<Recorrente, "dia" | "frequencia" | "mesAnual">, hoje: Date): string {
  const desteCiclo = geradoAteInicial(r, hoje);
  if (desteCiclo) return desteCiclo;
  const anterior = r.frequencia === "anual" && r.mesAnual ? vencimentoAnual(hoje.getFullYear() - 1, r.mesAnual, r.dia) : (() => {
    const mes = addMonths(hoje, -1);
    return setDate(mes, Math.min(r.dia, getDaysInMonth(mes)));
  })();
  return paraISO(anterior);
}

function proximoVencimento(r: Recorrente, geradoAte: string): Date {
  if (r.frequencia !== "anual") return addMonths(deISO(geradoAte), 1);
  if (!r.mesAnual) return addMonths(deISO(geradoAte), 12);
  const ultimo = deISO(geradoAte);
  const desteAno = vencimentoAnual(ultimo.getFullYear(), r.mesAnual, r.dia);
  return desteAno > ultimo ? desteAno : vencimentoAnual(ultimo.getFullYear() + 1, r.mesAnual, r.dia);
}

function vencimentosAte(r: Recorrente, hoje: string): string[] {
  const resultado: string[] = [];
  const fim = deISO(hoje);
  let cursor = r.geradoAte ? proximoVencimento(r, r.geradoAte) : deISO(hoje);
  if (!r.geradoAte) {
    const dia = Math.min(r.dia, getDaysInMonth(cursor));
    cursor = setDate(cursor, dia);
    if (r.frequencia === "anual" && r.mesAnual) cursor = vencimentoAnual(cursor.getFullYear(), r.mesAnual, r.dia);
    if (cursor > fim) return [];
  }
  let protecao = 0;
  while (cursor <= fim && protecao < 36) {
    const dia = Math.min(r.dia, getDaysInMonth(cursor));
    resultado.push(paraISO(setDate(cursor, dia)));
    cursor = addMonths(cursor, r.frequencia === "anual" ? 12 : 1);
    protecao++;
  }
  return resultado;
}

export function saldoDaConta(s: Pick<DadosFinancas, "contas" | "transacoes">, contaId: string, ate?: string): number {
  const conta = s.contas.find((c) => c.id === contaId);
  if (!conta) return 0;
  let saldo = conta.saldoInicial;
  for (const t of s.transacoes) {
    if (ate && t.data > ate) continue;
    if (t.contaId === contaId) {
      if (t.tipo === "receita") saldo += t.valor;
      else saldo -= t.valor;
    }
    if (t.tipo === "transferencia" && t.contaDestinoId === contaId) saldo += t.valorDestino ?? t.valor;
  }
  return saldo;
}

export function moedaDaConta(contas: Pick<Conta, "id" | "moeda">[], contaId: string | undefined): Moeda {
  const m = contas.find((c) => c.id === contaId)?.moeda;
  return moedaValida(m) ? m : "BRL";
}

export function cotacoesDe(s: { cotacoes?: Cotacoes }): Cotacoes {
  return { ...COTACOES_PADRAO, ...s.cotacoes };
}

/** Valor do lançamento em centavos de real, pela cotação guardada. */
export function valorEmReais(t: Pick<Transacao, "valor" | "contaId">, s: { contas: Conta[]; cotacoes?: Cotacoes }, valor = t.valor): number {
  return emReais(valor, moedaDaConta(s.contas, t.contaId), cotacoesDe(s));
}

export function saldoDaContaEmReais(s: Pick<DadosFinancas, "contas" | "transacoes"> & { cotacoes?: Cotacoes }, contaId: string, ate?: string): number {
  return emReais(saldoDaConta(s, contaId, ate), moedaDaConta(s.contas, contaId), cotacoesDe(s));
}

export function contasEmOutraMoeda(contas: Pick<Conta, "moeda" | "arquivada">[]): Moeda[] {
  return [...new Set(contas.filter((c) => !c.arquivada && c.moeda && c.moeda !== "BRL").map((c) => c.moeda as Moeda))];
}

export function parteDoUsuario(t: Transacao, divisoes: Divisao[]): number {
  if (!t.divisaoId) return t.valor;
  const d = divisoes.find((x) => x.id === t.divisaoId);
  if (!d) return t.valor;
  return d.partes.find((p) => p.pessoaId === EU)?.valor ?? 0;
}

export function dataDeCaixa(t: Transacao, contas: Conta[]): string {
  const conta = contas.find((c) => c.id === t.contaId);
  if (!conta || conta.tipo !== "cartao" || !conta.fechamentoDia || !conta.vencimentoDia) return t.data;
  const compra = deISO(t.data);
  let mes = compra.getDate() > conta.fechamentoDia ? addMonths(compra, 1) : compra;
  if (conta.vencimentoDia <= conta.fechamentoDia) mes = addMonths(mes, 1);
  return paraISO(setDate(mes, Math.min(conta.vencimentoDia, getDaysInMonth(mes))));
}

export function gastosDoMes(
  s: Pick<DadosFinancas, "transacoes" | "contas" | "divisoes">,
  mes: string,
  modo: "competencia" | "caixa" = "competencia",
): Transacao[] {
  return s.transacoes.filter((t) => {
    if (t.tipo !== "despesa" || t.ajuste) return false;
    const data = modo === "caixa" ? dataDeCaixa(t, s.contas) : t.data;
    return data.startsWith(mes);
  });
}

export function receitasDoMes(s: Pick<DadosFinancas, "transacoes">, mes: string): Transacao[] {
  return s.transacoes.filter((t) => t.tipo === "receita" && !t.ajuste && t.data.startsWith(mes));
}

export function gastoPorCategoria(s: Pick<DadosFinancas, "transacoes" | "contas" | "divisoes"> & { cotacoes?: Cotacoes }, mes: string, modo: "competencia" | "caixa" = "competencia") {
  const mapa = new Map<string, number>();
  for (const t of gastosDoMes(s, mes, modo)) {
    const k = t.categoriaId ?? "";
    mapa.set(k, (mapa.get(k) ?? 0) + valorEmReais(t, s, parteDoUsuario(t, s.divisoes)));
  }
  return mapa;
}

export function saldosComPessoas(s: Pick<DadosFinancas, "pessoas" | "divisoes" | "acertos">): Map<string, number> {
  const saldos = new Map<string, number>();
  for (const p of s.pessoas) saldos.set(p.id, 0);
  for (const d of s.divisoes) {
    if (d.pagadorId === EU) {
      for (const parte of d.partes) if (parte.pessoaId !== EU) saldos.set(parte.pessoaId, (saldos.get(parte.pessoaId) ?? 0) + parte.valor);
    } else {
      const minha = d.partes.find((p) => p.pessoaId === EU)?.valor ?? 0;
      saldos.set(d.pagadorId, (saldos.get(d.pagadorId) ?? 0) - minha);
    }
  }
  for (const a of s.acertos) saldos.set(a.pessoaId, (saldos.get(a.pessoaId) ?? 0) - a.valor);
  return saldos;
}

export function simplificarDividas(s: Pick<DadosFinancas, "pessoas" | "divisoes" | "acertos">): { de: string; para: string; valor: number }[] {
  const liquido = new Map<string, number>();
  const somar = (id: string, v: number) => liquido.set(id, (liquido.get(id) ?? 0) + v);
  for (const d of s.divisoes) {
    for (const parte of d.partes) {
      if (parte.pessoaId === d.pagadorId) continue;
      somar(d.pagadorId, parte.valor);
      somar(parte.pessoaId, -parte.valor);
    }
  }
  // Acerto positivo: a pessoa pagou o usuário; negativo: o usuário pagou a pessoa.
  for (const a of s.acertos) {
    somar(a.pessoaId, a.valor);
    somar(EU, -a.valor);
  }
  const credores = [...liquido].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const devedores = [...liquido].filter(([, v]) => v < 0).map(([k, v]) => [k, -v] as [string, number]).sort((a, b) => b[1] - a[1]);
  const resultado: { de: string; para: string; valor: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < devedores.length && j < credores.length) {
    const valor = Math.min(devedores[i][1], credores[j][1]);
    if (valor > 0) resultado.push({ de: devedores[i][0], para: credores[j][0], valor });
    devedores[i][1] -= valor;
    credores[j][1] -= valor;
    if (devedores[i][1] === 0) i++;
    if (credores[j][1] === 0) j++;
  }
  return resultado;
}
