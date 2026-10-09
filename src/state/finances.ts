import { create } from "zustand";
import { persist } from "zustand/middleware";
import { addMonths, setDate, getDaysInMonth } from "date-fns";
import { storage, key } from "../bridge/storage";
import type {
  Settlement,
  Category,
  Account,
  Split,
  ItemPurchase,
  ListPurchases,
  GoalSavings,
  Person,
  PriceHistory,
  Recurring,
  RuleCategory,
  Transaction,
} from "../types";
import { generateId, normalizeText } from "../utils/basics";
import { fromISO, todayISO, toISO } from "../utils/dates";
import { T } from "../i18n/ptBR";

export const EU = "eu";

export const CATEGORIES_DEFAULT: Omit<Category, "id">[] = [
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

export const COLORS_CATEGORY = ["#e0803b", "#2f9e6b", "#3b6fe0", "#8b5cf6", "#e05a8a", "#d9922b", "#0ea5a4", "#64748b", "#8a05be", "#c2410c"];

export interface DataFinances {
  contas: Account[];
  categorias: Category[];
  transacoes: Transaction[];
  recorrentes: Recurring[];
  assinaturasIgnoradas: string[];
  metasEconomia: GoalSavings[];
  pessoas: Person[];
  divisoes: Split[];
  acertos: Settlement[];
  listas: ListPurchases[];
  precos: Record<string, PriceHistory[]>;
  regras: RuleCategory[];
}

interface NewTransaction extends Omit<Transaction, "id" | "criadaEm"> {
  parcelas?: number;
}

interface StateFinances extends DataFinances {
  ensureCategories: () => void;
  createAccount: (payload: Omit<Account, "id" | "arquivada">) => Account;
  updateAccount: (id: string, partial: Partial<Account>) => void;
  deleteAccount: (id: string) => void;
  createCategory: (payload: Omit<Category, "id">) => Category;
  getOrCreateCategory: (nameValue: string, type: Category["tipo"]) => Category;
  updateCategory: (id: string, partial: Partial<Category>) => void;
  deleteCategory: (id: string, destinationId: string) => void;
  recordTransaction: (payload: NewTransaction) => Transaction[];
  updateTransaction: (id: string, partial: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => Transaction[];
  restoreTransactions: (items: Transaction[]) => void;
  adjustBalance: (accountId: string, balanceReal: number) => void;
  createRecurring: (payload: Omit<Recurring, "id">) => void;
  updateRecurring: (id: string, partial: Partial<Recurring>) => void;
  deleteRecurring: (id: string) => void;
  generateRecurring: () => number;
  ignoreSignature: (key: string) => void;
  createGoalSavings: (payload: Omit<GoalSavings, "id">) => void;
  storeGoal: (id: string, value: number) => void;
  deleteGoalSavings: (id: string) => void;
  createPerson: (nameValue: string) => Person;
  deletePerson: (id: string) => void;
  dividir: (payload: Omit<Split, "id">) => void;
  deleteSplit: (id: string) => void;
  registerSettlement: (payload: Omit<Settlement, "id">, balanceWithPerson: number) => void;
  createList: (nameValue: string, categoryId?: string) => ListPurchases;
  deleteList: (id: string) => void;
  addItems: (listId: string, items: Omit<ItemPurchase, "id" | "marcado">[]) => void;
  updateItem: (listId: string, itemId: string, partial: Partial<ItemPurchase>) => void;
  removeItem: (listId: string, itemId: string) => void;
  finishPurchase: (listId: string, accountId: string, totalReal: number, categoryId?: string) => void;
  createRule: (contains: string, categoryId: string) => void;
  deleteRule: (id: string) => void;
  categorizar: (description: string) => string | undefined;
  importData: (items: Omit<Transaction, "id" | "criadaEm">[]) => { importados: number; duplicados: number };
  replace: (payload: Partial<DataFinances>) => void;
}

function datesInstallment(data: string, n: number): string {
  const base = fromISO(data);
  const target = addMonths(base, n);
  return toISO(target);
}

export const useFinances = create<StateFinances>()(
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
      ensureCategories: () => {
        if (get().categorias.length > 0) return;
        set({ categorias: CATEGORIES_DEFAULT.map((c) => ({ ...c, id: generateId() })) });
      },
      createAccount: (payload) => {
        const account: Account = { ...payload, nome: payload.nome.trim().slice(0, 60), id: generateId(), arquivada: false };
        set((s) => ({ contas: [...s.contas, account] }));
        return account;
      },
      updateAccount: (id, partial) => set((s) => ({ contas: s.contas.map((c) => (c.id === id ? { ...c, ...partial } : c)) })),
      deleteAccount: (id) =>
        set((s) => ({
          contas: s.contas.filter((c) => c.id !== id),
          transacoes: s.transacoes.filter((t) => t.contaId !== id && t.contaDestinoId !== id),
        })),
      createCategory: (payload) => {
        const category = { ...payload, nome: payload.nome.trim().slice(0, 40), id: generateId() };
        set((s) => ({ categorias: [...s.categorias, category] }));
        return category;
      },
      getOrCreateCategory: (nameValue, type) => {
        const target = normalizeText(nameValue.trim());
        const existing = get().categorias.find((c) => c.tipo === type && normalizeText(c.nome) === target);
        if (existing) return existing;
        const color = COLORS_CATEGORY[get().categorias.length % COLORS_CATEGORY.length];
        return get().createCategory({ nome: nameValue, cor: color, orcamento: 0, tipo: type });
      },
      updateCategory: (id, partial) => set((s) => ({ categorias: s.categorias.map((c) => (c.id === id ? { ...c, ...partial } : c)) })),
      deleteCategory: (id, destinationId) =>
        set((s) => {
          if (id === destinationId || !s.categorias.some((c) => c.id === destinationId)) return s;
          const swap = <X extends { categoriaId?: string }>(x: X): X => (x.categoriaId === id ? { ...x, categoriaId: destinationId } : x);
          return {
            categorias: s.categorias.filter((c) => c.id !== id),
            transacoes: s.transacoes.map(swap),
            recorrentes: s.recorrentes.map(swap),
            divisoes: s.divisoes.map(swap),
            listas: s.listas.map(swap),
            regras: s.regras.map((r) => (r.categoriaId === id ? { ...r, categoriaId: destinationId } : r)),
          };
        }),
      recordTransaction: ({ parcelas: installments = 1, ...payload }) => {
        const total = Math.max(1, Math.min(48, Math.round(installments)));
        const group = total > 1 ? generateId() : undefined;
        const createdAt = new Date().toISOString();
        const base = Math.floor(payload.valor / total);
        const rest = payload.valor - base * total;
        const newItems: Transaction[] = Array.from({ length: total }, (_, i) => ({
          ...payload,
          descricao: payload.descricao.trim().slice(0, 120),
          id: generateId(),
          criadaEm: createdAt,
          valor: base + (i === 0 ? rest : 0),
          data: i === 0 ? payload.data : datesInstallment(payload.data, i),
          grupoParcelasId: group,
          parcela: group ? { numero: i + 1, total } : undefined,
        }));
        set((s) => ({ transacoes: [...s.transacoes, ...newItems] }));
        return newItems;
      },
      updateTransaction: (id, partial) => set((s) => ({ transacoes: s.transacoes.map((t) => (t.id === id ? { ...t, ...partial } : t)) })),
      deleteTransaction: (id) => {
        const target = get().transacoes.find((t) => t.id === id);
        if (!target) return [];
        const removed = target.grupoParcelasId
          ? get().transacoes.filter((t) => t.grupoParcelasId === target.grupoParcelasId && t.data >= target.data)
          : [target];
        const ids = new Set(removed.map((t) => t.id));
        set((s) => ({ transacoes: s.transacoes.filter((t) => !ids.has(t.id)) }));
        return removed;
      },
      restoreTransactions: (items) => set((s) => ({ transacoes: [...s.transacoes, ...items] })),
      adjustBalance: (accountId, balanceReal) => {
        const current = balanceAccount(get(), accountId);
        const difference = balanceReal - current;
        if (difference === 0) return;
        get().recordTransaction({
          tipo: difference > 0 ? "receita" : "despesa",
          valor: Math.abs(difference),
          descricao: T.financas.ajusteDescricao,
          contaId: accountId,
          data: todayISO(),
          ajuste: true,
        });
      },
      createRecurring: (payload) => set((s) => ({ recorrentes: [...s.recorrentes, { ...payload, id: generateId() }] })),
      updateRecurring: (id, partial) =>
        set((s) => ({
          recorrentes: s.recorrentes.map((r) => {
            if (r.id !== id) return r;
            const newItem = { ...r, ...partial };
            if (partial.ativa === true && !r.ativa) {
              const last = lastDueUntil(newItem, fromISO(todayISO()));
              if (!r.geradoAte || last > r.geradoAte) newItem.geradoAte = last;
            }
            return newItem;
          }),
        })),
      deleteRecurring: (id) => set((s) => ({ recorrentes: s.recorrentes.filter((r) => r.id !== id) })),
      generateRecurring: () => {
        const today = todayISO();
        let generated = 0;
        const s = get();
        const newItems: Transaction[] = [];
        const updated = s.recorrentes.map((r) => {
          if (!r.ativa || !s.contas.some((c) => c.id === r.contaId)) return r;
          const due = dueUntil(r, today);
          if (due.length === 0) return r;
          for (const data of due) {
            newItems.push({
              id: generateId(),
              tipo: "despesa",
              valor: r.valor,
              descricao: r.descricao,
              categoriaId: r.categoriaId,
              contaId: r.contaId,
              data,
              recorrenteId: r.id,
              criadaEm: new Date().toISOString(),
            });
            generated++;
          }
          return { ...r, geradoAte: due[due.length - 1] };
        });
        if (generated > 0) set({ recorrentes: updated, transacoes: [...s.transacoes, ...newItems] });
        return generated;
      },
      ignoreSignature: (c) => set((s) => ({ assinaturasIgnoradas: [...s.assinaturasIgnoradas, c] })),
      createGoalSavings: (payload) => set((s) => ({ metasEconomia: [...s.metasEconomia, { ...payload, id: generateId() }] })),
      storeGoal: (id, value) =>
        set((s) => ({ metasEconomia: s.metasEconomia.map((m) => (m.id === id ? { ...m, guardado: Math.max(0, m.guardado + value) } : m)) })),
      deleteGoalSavings: (id) => set((s) => ({ metasEconomia: s.metasEconomia.filter((m) => m.id !== id) })),
      createPerson: (nameValue) => {
        const person = { id: generateId(), nome: nameValue.trim().slice(0, 40) };
        set((s) => ({ pessoas: [...s.pessoas, person] }));
        return person;
      },
      deletePerson: (id) => set((s) => ({ pessoas: s.pessoas.filter((p) => p.id !== id) })),
      dividir: (payload) => {
        const split: Split = { ...payload, id: generateId() };
        set((s) => ({ divisoes: [...s.divisoes, split] }));
        if (payload.pagadorId === EU && payload.contaId) {
          get().recordTransaction({
            tipo: "despesa",
            valor: payload.total,
            descricao: payload.descricao,
            categoriaId: payload.categoriaId,
            contaId: payload.contaId,
            data: payload.data,
            divisaoId: split.id,
          });
        }
      },
      deleteSplit: (id) =>
        set((s) => ({ divisoes: s.divisoes.filter((d) => d.id !== id), transacoes: s.transacoes.filter((t) => t.divisaoId !== id) })),
      registerSettlement: (payload, balanceWithPerson) => {
        set((s) => ({ acertos: [...s.acertos, { ...payload, id: generateId() }] }));
        if (payload.contaId) {
          const person = get().pessoas.find((p) => p.id === payload.pessoaId);
          get().recordTransaction({
            tipo: balanceWithPerson > 0 ? "receita" : "despesa",
            valor: Math.abs(payload.valor),
            descricao: T.financas.acertoDescricao(person?.nome ?? ""),
            contaId: payload.contaId,
            data: payload.data,
            ajuste: true,
          });
        }
      },
      createList: (nameValue, categoryId) => {
        const list = { id: generateId(), nome: nameValue.trim().slice(0, 40), categoriaId: categoryId, itens: [] };
        set((s) => ({ listas: [...s.listas, list] }));
        return list;
      },
      deleteList: (id) => set((s) => ({ listas: s.listas.filter((l) => l.id !== id) })),
      addItems: (listId, items) =>
        set((s) => ({
          listas: s.listas.map((l) => {
            if (l.id !== listId) return l;
            const newItems = items
              .filter((i) => i.nome.trim() && !l.itens.some((x) => normalizeText(x.nome) === normalizeText(i.nome) && !x.marcado))
              .map((i) => {
                const historyValue = s.precos[normalizeText(i.nome)];
                const last = historyValue?.[historyValue.length - 1]?.preco ?? 0;
                return { ...i, nome: i.nome.trim().slice(0, 60), id: generateId(), marcado: false, precoEstimado: i.precoEstimado || last };
              });
            return { ...l, itens: [...l.itens, ...newItems] };
          }),
        })),
      updateItem: (listId, itemId, partial) =>
        set((s) => ({
          listas: s.listas.map((l) => (l.id === listId ? { ...l, itens: l.itens.map((i) => (i.id === itemId ? { ...i, ...partial } : i)) } : l)),
        })),
      removeItem: (listId, itemId) =>
        set((s) => ({ listas: s.listas.map((l) => (l.id === listId ? { ...l, itens: l.itens.filter((i) => i.id !== itemId) } : l)) })),
      finishPurchase: (listId, accountId, totalReal, categoryId) => {
        const list = get().listas.find((l) => l.id === listId);
        if (!list) return;
        const marked = list.itens.filter((i) => i.marcado);
        if (marked.length === 0) return;
        const today = todayISO();
        get().recordTransaction({
          tipo: "despesa",
          valor: totalReal,
          descricao: T.financas.compraDescricao(list.nome),
          categoriaId: categoryId ?? list.categoriaId,
          contaId: accountId,
          data: today,
        });
        set((s) => {
          const prices = { ...s.precos };
          for (const item of marked) {
            if (item.precoEstimado <= 0) continue;
            const k = normalizeText(item.nome);
            prices[k] = [...(prices[k] ?? []), { preco: item.precoEstimado, data: today }].slice(-20);
          }
          return { precos: prices, listas: s.listas.map((l) => (l.id === listId ? { ...l, itens: l.itens.filter((i) => !i.marcado) } : l)) };
        });
      },
      createRule: (contains, categoryId) => set((s) => ({ regras: [...s.regras, { id: generateId(), contem: contains.trim().slice(0, 40), categoriaId: categoryId }] })),
      deleteRule: (id) => set((s) => ({ regras: s.regras.filter((r) => r.id !== id) })),
      categorizar: (description) => {
        const target = normalizeText(description);
        return get().regras.find((r) => r.contem && target.includes(normalizeText(r.contem)))?.categoriaId;
      },
      importData: (items) => {
        const existing = new Set(get().transacoes.map((t) => `${t.data}|${t.valor}|${normalizeText(t.descricao)}`));
        const newItems: Transaction[] = [];
        let duplicates = 0;
        for (const item of items) {
          const k = `${item.data}|${item.valor}|${normalizeText(item.descricao)}`;
          if (existing.has(k)) {
            duplicates++;
            continue;
          }
          existing.add(k);
          newItems.push({ ...item, categoriaId: item.categoriaId ?? get().categorizar(item.descricao), id: generateId(), criadaEm: new Date().toISOString() });
        }
        set((s) => ({ transacoes: [...s.transacoes, ...newItems] }));
        return { importados: newItems.length, duplicados: duplicates };
      },
      replace: (payload) => set(payload),
    }),
    { name: key("financas"), storage: storage },
  ),
);

function dueAnnual(year: number, monthAnnual: number, day: number): Date {
  const month = new Date(year, monthAnnual - 1, 1);
  return setDate(month, Math.min(day, getDaysInMonth(month)));
}

/** Mark past due dates in the current period as generated to avoid retroactive charges on creation. */
export function generatedUntilInitial(r: Pick<Recurring, "dia" | "frequencia" | "mesAnual">, today: Date): string | undefined {
  const due = r.frequencia === "anual" && r.mesAnual ? dueAnnual(today.getFullYear(), r.mesAnual, r.dia) : setDate(today, Math.min(r.dia, getDaysInMonth(today)));
  return toISO(due) <= toISO(today) ? toISO(due) : undefined;
}

export function lastDueUntil(r: Pick<Recurring, "dia" | "frequencia" | "mesAnual">, today: Date): string {
  const desteCycle = generatedUntilInitial(r, today);
  if (desteCycle) return desteCycle;
  const previous = r.frequencia === "anual" && r.mesAnual ? dueAnnual(today.getFullYear() - 1, r.mesAnual, r.dia) : (() => {
    const month = addMonths(today, -1);
    return setDate(month, Math.min(r.dia, getDaysInMonth(month)));
  })();
  return toISO(previous);
}

function nextDue(r: Recurring, generatedUntil: string): Date {
  if (r.frequencia !== "anual") return addMonths(fromISO(generatedUntil), 1);
  if (!r.mesAnual) return addMonths(fromISO(generatedUntil), 12);
  const last = fromISO(generatedUntil);
  const desteYear = dueAnnual(last.getFullYear(), r.mesAnual, r.dia);
  return desteYear > last ? desteYear : dueAnnual(last.getFullYear() + 1, r.mesAnual, r.dia);
}

function dueUntil(r: Recurring, today: string): string[] {
  const result: string[] = [];
  const end = fromISO(today);
  let cursor = r.geradoAte ? nextDue(r, r.geradoAte) : fromISO(today);
  if (!r.geradoAte) {
    const day = Math.min(r.dia, getDaysInMonth(cursor));
    cursor = setDate(cursor, day);
    if (r.frequencia === "anual" && r.mesAnual) cursor = dueAnnual(cursor.getFullYear(), r.mesAnual, r.dia);
    if (cursor > end) return [];
  }
  let protection = 0;
  while (cursor <= end && protection < 36) {
    const day = Math.min(r.dia, getDaysInMonth(cursor));
    result.push(toISO(setDate(cursor, day)));
    cursor = addMonths(cursor, r.frequencia === "anual" ? 12 : 1);
    protection++;
  }
  return result;
}

export function balanceAccount(s: Pick<DataFinances, "contas" | "transacoes">, accountId: string, until?: string): number {
  const account = s.contas.find((c) => c.id === accountId);
  if (!account) return 0;
  let balance = account.saldoInicial;
  for (const t of s.transacoes) {
    if (until && t.data > until) continue;
    if (t.contaId === accountId) {
      if (t.tipo === "receita") balance += t.valor;
      else balance -= t.valor;
    }
    if (t.tipo === "transferencia" && t.contaDestinoId === accountId) balance += t.valor;
  }
  return balance;
}

export function partUser(t: Transaction, splits: Split[]): number {
  if (!t.divisaoId) return t.valor;
  const d = splits.find((x) => x.id === t.divisaoId);
  if (!d) return t.valor;
  return d.partes.find((p) => p.pessoaId === EU)?.valor ?? 0;
}

export function dataBox(t: Transaction, accounts: Account[]): string {
  const account = accounts.find((c) => c.id === t.contaId);
  if (!account || account.tipo !== "cartao" || !account.fechamentoDia || !account.vencimentoDia) return t.data;
  const purchase = fromISO(t.data);
  let month = purchase.getDate() > account.fechamentoDia ? addMonths(purchase, 1) : purchase;
  if (account.vencimentoDia <= account.fechamentoDia) month = addMonths(month, 1);
  return toISO(setDate(month, Math.min(account.vencimentoDia, getDaysInMonth(month))));
}

export function expensesMonth(
  s: Pick<DataFinances, "transacoes" | "contas" | "divisoes">,
  month: string,
  mode: "competencia" | "caixa" = "competencia",
): Transaction[] {
  return s.transacoes.filter((t) => {
    if (t.tipo !== "despesa" || t.ajuste) return false;
    const data = mode === "caixa" ? dataBox(t, s.contas) : t.data;
    return data.startsWith(month);
  });
}

export function incomeMonth(s: Pick<DataFinances, "transacoes">, month: string): Transaction[] {
  return s.transacoes.filter((t) => t.tipo === "receita" && !t.ajuste && t.data.startsWith(month));
}

export function expenseByCategory(s: Pick<DataFinances, "transacoes" | "contas" | "divisoes">, month: string, mode: "competencia" | "caixa" = "competencia") {
  const map = new Map<string, number>();
  for (const t of expensesMonth(s, month, mode)) {
    const k = t.categoriaId ?? "";
    map.set(k, (map.get(k) ?? 0) + partUser(t, s.divisoes));
  }
  return map;
}

export function balancesWithPeople(s: Pick<DataFinances, "pessoas" | "divisoes" | "acertos">): Map<string, number> {
  const balances = new Map<string, number>();
  for (const p of s.pessoas) balances.set(p.id, 0);
  for (const d of s.divisoes) {
    if (d.pagadorId === EU) {
      for (const part of d.partes) if (part.pessoaId !== EU) balances.set(part.pessoaId, (balances.get(part.pessoaId) ?? 0) + part.valor);
    } else {
      const mine = d.partes.find((p) => p.pessoaId === EU)?.valor ?? 0;
      balances.set(d.pagadorId, (balances.get(d.pagadorId) ?? 0) - mine);
    }
  }
  for (const a of s.acertos) balances.set(a.pessoaId, (balances.get(a.pessoaId) ?? 0) - a.valor);
  return balances;
}

export function simplifyDebts(s: Pick<DataFinances, "pessoas" | "divisoes" | "acertos">): { de: string; para: string; valor: number }[] {
  const liquid = new Map<string, number>();
  const sumBy = (id: string, v: number) => liquid.set(id, (liquid.get(id) ?? 0) + v);
  for (const d of s.divisoes) {
    for (const part of d.partes) {
      if (part.pessoaId === d.pagadorId) continue;
      sumBy(d.pagadorId, part.valor);
      sumBy(part.pessoaId, -part.valor);
    }
  }
  // Acerto positivo: a pessoa pagou o usuário; negativo: o usuário pagou a pessoa.
  for (const a of s.acertos) {
    sumBy(a.pessoaId, a.valor);
    sumBy(EU, -a.valor);
  }
  const creditors = [...liquid].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const debtors = [...liquid].filter(([, v]) => v < 0).map(([k, v]) => [k, -v] as [string, number]).sort((a, b) => b[1] - a[1]);
  const result: { de: string; para: string; valor: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const value = Math.min(debtors[i][1], creditors[j][1]);
    if (value > 0) result.push({ de: debtors[i][0], para: creditors[j][0], valor: value });
    debtors[i][1] -= value;
    creditors[j][1] -= value;
    if (debtors[i][1] === 0) i++;
    if (creditors[j][1] === 0) j++;
  }
  return result;
}
