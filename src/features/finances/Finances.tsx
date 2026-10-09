import { useEffect, useMemo, useRef, useState } from "react";
import { addMonths, format, setDate, getDaysInMonth } from "date-fns";
import {
  Plus, Trash2, Pencil, Upload, Download, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Wallet, CreditCard, PiggyBank, Banknote, Landmark, Repeat,
  Target, Users, ShoppingCart, BarChart3, LayoutDashboard, ScanSearch, X, Check, Scale, ListFilter, Tags,
} from "lucide-react";
import { TabHeader } from "../../components/TabHeader";
import { Card, Button, Field, Modal, Segmented, Empty, ConfirmModal, Progress, NoticeBanner, BoxMark, LineToggle } from "../../components/basics";
import { BarsHorizontal, BarsVertical } from "../../components/Charts";
import {
  useFinances, balanceAccount, expenseByCategory, incomeMonth, expensesMonth, partUser, balancesWithPeople, simplifyDebts, dataBox, EU, COLORS_CATEGORY, generatedUntilInitial,
} from "../../state/finances";
import { useInterface } from "../../state/interface";
import { useConfig } from "../../state/settings";
import { useAgents } from "../../state/agents";
import { T } from "../../i18n/ptBR";
import { formatMoney, readValueAtCents, centsToField } from "../../utils/money";
import { isValidDate, formatDateString, todayISO, toISO, fromISO, formatDate } from "../../utils/dates";
import { downloadFile, contains, readFileText, normalizeText, sumBy } from "../../utils/basics";
import { detectSubscriptions, subscriptionsWithValueNew, readCsv, readOfx } from "../../utils/subscriptions";
import { playSound } from "../../bridge/sounds";
import { EVENT_NEW } from "../../windows/desktop/useShortcuts";
import { CategoryPicker } from "../../components/CategoryPicker";
import { categoryPelaDescription } from "../../utils/commands";
import type { Account, TypeAccount, TypeTransaction, Transaction } from "../../types";

type Tab = keyof typeof T.financas.abas;
type Mode = "competencia" | "caixa";

const GROUPS_TAB: { nome: string; abas: Tab[] }[] = [
  { nome: T.financas.grupos.visao, abas: ["visao", "relatorios"] },
  { nome: T.financas.grupos.movimento, abas: ["transacoes", "contas", "cartoes"] },
  { nome: T.financas.grupos.planejamento, abas: ["orcamento", "recorrentes", "economia"] },
  { nome: T.financas.grupos.pessoas, abas: ["divisao", "compras"] },
];

const ICON_TAB: Record<Tab, React.ReactNode> = {
  visao: <LayoutDashboard size={14} />,
  transacoes: <ListFilter size={14} />,
  contas: <Landmark size={14} />,
  cartoes: <CreditCard size={14} />,
  orcamento: <Scale size={14} />,
  recorrentes: <Repeat size={14} />,
  economia: <PiggyBank size={14} />,
  divisao: <Users size={14} />,
  compras: <ShoppingCart size={14} />,
  relatorios: <BarChart3 size={14} />,
};

const ICON_ACCOUNT: Record<TypeAccount, React.ReactNode> = {
  corrente: <Landmark size={16} />,
  poupanca: <PiggyBank size={16} />,
  carteira: <Banknote size={16} />,
  cartao: <CreditCard size={16} />,
  investimento: <BarChart3 size={16} />,
};

const COLORS = ["#3b6fe0", "#2f9e6b", "#d9922b", "#8a05be", "#e05a8a", "#0ea5a4", "#64748b"];

function FieldMoney({ id, rotulo: label, valor: value, aoMudar: onChange, erro: error, obrigatorio: required, dica: hint }: { id: string; rotulo: string; valor: string; aoMudar: (v: string) => void; erro?: string; obrigatorio?: boolean; dica?: string }) {
  return (
    <Field id={id} rotulo={label} erro={error} obrigatorio={required} dica={hint}>
      <div className="campo-prefixo">
        <span>R$</span>
        <input id={id} className="campo" inputMode="decimal" value={value} placeholder="0,00" aria-invalid={!!error} onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))} />
      </div>
    </Field>
  );
}

function validateValue(text: string, allowZero = false): { valor: number | null; erro?: string } {
  const v = readValueAtCents(text);
  if (v == null) return { valor: null, erro: text.trim() ? T.validacao.valorInvalido : T.validacao.obrigatorio };
  if (v < 0 || (!allowZero && v === 0)) return { valor: null, erro: T.validacao.valorPositivo };
  if (v > 100000000000) return { valor: null, erro: T.validacao.valorInvalido };
  return { valor: v };
}

function FormTransaction({ aberto: isOpen, aoFechar: onClose, editando: editing }: { aberto: boolean; aoFechar: () => void; editando?: Transaction | null }) {
  const fin = useFinances();
  const accounts = fin.contas.filter((c) => !c.arquivada);
  const [type, setType] = useState<TypeTransaction>("despesa");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [accountId, setAccountId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [data, setData] = useState(todayISO());
  const [installments, setInstallments] = useState("1");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    setNewCategory("");
    if (editing) {
      setType(editing.tipo);
      setValue(centsToField(editing.valor));
      setDescription(editing.descricao);
      setCategoryId(editing.categoriaId ?? "");
      setAccountId(editing.contaId);
      setDestinationId(editing.contaDestinoId ?? "");
      setData(editing.data);
      setInstallments("1");
    } else {
      setType("despesa");
      setValue("");
      setDescription("");
      setCategoryId("");
      setAccountId(accounts[0]?.id ?? "");
      setDestinationId(accounts[1]?.id ?? "");
      setData(todayISO());
      setInstallments("1");
    }
  }, [isOpen, editing]);

  const typeCategory = type === "receita" ? "receita" : "despesa";
  const suggested = !categoryId && !newCategory && description ? fin.categorias.find((c) => c.id === fin.categorizar(description) && c.tipo === typeCategory)?.id : undefined;
  const needsCategory = type !== "transferencia" && !editing?.ajuste;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const newItems: Record<string, string> = {};
    const v = validateValue(value);
    if (v.erro) newItems.valor = v.erro;
    if (!description.trim()) newItems.descricao = T.validacao.obrigatorio;
    if (!accountId) newItems.conta = T.validacao.contaObrigatoria;
    if (type === "transferencia" && (!destinationId || destinationId === accountId)) newItems.destino = T.validacao.contasIguais;
    if (!isValidDate(data)) newItems.data = T.validacao.dataInvalida;
    const n = Number(installments);
    if (!Number.isInteger(n) || n < 1 || n > 48) newItems.parcelas = T.validacao.entre(1, 48);
    const categoryValid = fin.categorias.some((c) => c.id === (categoryId || suggested) && c.tipo === typeCategory);
    if (needsCategory && !categoryValid && !newCategory.trim()) newItems.categoria = T.financas.categoriaObrigatoria;
    setErrors(newItems);
    if (Object.keys(newItems).length || v.valor == null) return;
    const categoryFinal = !needsCategory ? undefined : categoryValid ? categoryId || suggested : fin.getOrCreateCategory(newCategory, typeCategory).id;
    const payload = {
      tipo: type,
      valor: v.valor,
      descricao: description.trim(),
      categoriaId: categoryFinal,
      contaId: accountId,
      contaDestinoId: type === "transferencia" ? destinationId : undefined,
      data,
    };
    if (editing) fin.updateTransaction(editing.id, payload);
    else {
      fin.recordTransaction({ ...payload, parcelas: type === "despesa" ? n : 1 });
      void useAgents.getState().trabalhar("operador", `${T.financas.tipos[type]}: ${payload.descricao}`, 400);
    }
    onClose();
  };

  if (accounts.length === 0)
    return (
      <Modal aberto={isOpen} titulo={T.financas.novaTransacao} aoFechar={onClose}>
        <Empty icone={<Landmark size={28} />} titulo={T.financas.semContas} texto={T.financas.crieContaAntes} />
      </Modal>
    );

  return (
    <Modal aberto={isOpen} titulo={editing ? T.geral.editar : T.financas.novaTransacao} aoFechar={onClose}>
      <form className="formulario" onSubmit={save} noValidate>
        <Segmented<TypeTransaction>
          rotulo={T.financas.tipoConta}
          valor={type}
          aoMudar={(t) => { setType(t); setCategoryId(""); setNewCategory(""); }}
          opcoes={[
            { valor: "despesa", rotulo: T.financas.tipos.despesa, icone: <ArrowUpRight size={13} /> },
            { valor: "receita", rotulo: T.financas.tipos.receita, icone: <ArrowDownLeft size={13} /> },
            { valor: "transferencia", rotulo: T.financas.tipos.transferencia, icone: <ArrowLeftRight size={13} /> },
          ]}
        />
        <div className="formulario-linha">
          <FieldMoney id="t-valor" rotulo={T.financas.valor} valor={value} aoMudar={setValue} erro={errors.valor} obrigatorio />
          <Field id="t-data" rotulo={T.financas.data} obrigatorio erro={errors.data}>
            <input id="t-data" type="date" className="campo" value={data} aria-invalid={!!errors.data} onChange={(e) => setData(e.target.value)} />
          </Field>
        </div>
        <Field id="t-desc" rotulo={T.financas.descricao} obrigatorio erro={errors.descricao}>
          <input id="t-desc" className="campo" value={description} maxLength={120} aria-invalid={!!errors.descricao} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="formulario-linha">
          <Field id="t-conta" rotulo={type === "transferencia" ? T.financas.contaOrigem : T.financas.conta} obrigatorio erro={errors.conta}>
            <select id="t-conta" className="seletor" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Field>
          {type === "transferencia" ? (
            <Field id="t-destino" rotulo={T.financas.contaDestino} obrigatorio erro={errors.destino}>
              <select id="t-destino" className="seletor" value={destinationId} aria-invalid={!!errors.destino} onChange={(e) => setDestinationId(e.target.value)}>
                {accounts.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Field>
          ) : (
            <Field id="t-cat" rotulo={T.financas.categoria} obrigatorio={needsCategory} erro={errors.categoria} dica={suggested ? T.financas.sugerida(fin.categorias.find((c) => c.id === suggested)?.nome ?? "") : undefined}>
              <CategoryPicker
                id="t-cat"
                tipo={typeCategory}
                categoriaId={categoryId || suggested || ""}
                novaCategoria={newCategory}
                invalido={!!errors.categoria}
                aoMudar={(id, newItem) => { setCategoryId(id); setNewCategory(newItem); setErrors((e) => ({ ...e, categoria: "" })); }}
              />
            </Field>
          )}
        </div>
        {type === "despesa" && !editing && (
          <Field id="t-parc" rotulo={T.financas.parcelas} erro={errors.parcelas} dica={T.financas.parcelasDica}>
            <input id="t-parc" className="campo" inputMode="numeric" value={installments} aria-invalid={!!errors.parcelas} onChange={(e) => setInstallments(e.target.value.replace(/\D/g, ""))} />
          </Field>
        )}
        {type === "transferencia" && <NoticeBanner>{T.financas.cartaoSemDobro}</NoticeBanner>}
        <div className="formulario-acoes">
          <Button onClick={onClose}>{T.geral.cancelar}</Button>
          <Button type="submit" variante="primario">{T.geral.salvar}</Button>
        </div>
      </form>
    </Modal>
  );
}

function nameCategory(id: string | undefined, categories: { id: string; nome: string }[]) {
  return categories.find((c) => c.id === id)?.nome ?? T.financas.semCategoria;
}

function LineTransaction({ t, aoEditar: onEdit }: { t: Transaction; aoEditar: () => void }) {
  const fin = useFinances();
  const notify = useInterface((s) => s.notify);
  const category = fin.categorias.find((c) => c.id === t.categoriaId);
  const account = fin.contas.find((c) => c.id === t.contaId);
  const signal = t.tipo === "receita" ? "+" : t.tipo === "despesa" ? "-" : "";
  return (
    <div className="lista-item">
      <span className="ponto-cor" style={{ background: t.tipo === "transferencia" ? "var(--texto-3)" : category?.cor ?? "var(--borda-forte)", width: 10, height: 10 }} />
      <div className="lista-item-principal">
        <span className="lista-item-titulo">
          {t.descricao}
          {t.parcela && <span className="texto-3"> ({t.parcela.numero}/{t.parcela.total})</span>}
        </span>
        <span className="lista-item-sub">
          {t.tipo === "transferencia" ? `${account?.nome} > ${fin.contas.find((c) => c.id === t.contaDestinoId)?.nome}` : `${nameCategory(t.categoriaId, fin.categorias)} . ${account?.nome ?? ""}`}
          {t.divisaoId && ` . ${T.financas.dividida}`}
        </span>
      </div>
      <span className="numero privado" style={{ color: t.tipo === "receita" ? "var(--sucesso)" : undefined, fontWeight: 500 }}>
        {signal}
        {formatMoney(t.valor)}
      </span>
      <div className="lista-item-acoes">
        <Button pequeno soIcone variante="fantasma" icone={<Pencil size={13} />} aria-label={T.geral.editar} onClick={onEdit} />
        <Button
          pequeno
          soIcone
          variante="fantasma"
          icone={<Trash2 size={13} />}
          aria-label={T.geral.excluir}
          onClick={() => {
            const removed = fin.deleteTransaction(t.id);
            if (removed.length) notify(removed.length > 1 ? T.financas.parcelasExcluidas(removed.length) : T.geral.excluido, () => fin.restoreTransactions(removed));
          }}
        />
      </div>
    </div>
  );
}

function Import({ aberto: isOpen, aoFechar: onClose }: { aberto: boolean; aoFechar: () => void }) {
  const fin = useFinances();
  const notify = useInterface((s) => s.notify);
  const [accountId, setAccountId] = useState("");
  const [preview, setPreview] = useState<{ linhas: { data: string; descricao: string; valor: number }[]; invalidas: number } | null>(null);
  const [error, setError] = useState("");
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [defaultValue, setDefault] = useState<Record<"despesa" | "receita", { id: string; nova: string }>>({ despesa: { id: "", nova: "" }, receita: { id: "", nova: "" } });
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (isOpen) {
      fin.ensureCategories();
      setPreview(null);
      setError("");
      setChoices({});
      setDefault({ despesa: { id: "", nova: "" }, receita: { id: "", nova: "" } });
      setAccountId(fin.contas[0]?.id ?? "");
    }
  }, [isOpen]);

  const typeLine = (value: number) => (value < 0 ? "despesa" : "receita") as "despesa" | "receita";
  const suggestions = useMemo(
    () =>
      (preview?.linhas ?? []).map((l) => {
        const type = typeLine(l.valor);
        const fromType = fin.categorias.filter((c) => c.tipo === type);
        const pelaRule = fromType.find((c) => c.id === fin.categorizar(l.descricao));
        return (pelaRule ?? categoryPelaDescription(fromType, l.descricao))?.id ?? "";
      }),
    [preview, fin.categorias, fin.regras],
  );
  const categoryLine = (i: number) => (fin.categorias.some((c) => c.id === choices[i]) ? choices[i] : suggestions[i]) ?? "";
  const typesWithoutCategory = (["despesa", "receita"] as const).filter((type) => preview?.linhas.some((l, i) => typeLine(l.valor) === type && !categoryLine(i)));
  const defaultValid = (type: "despesa" | "receita") => fin.categorias.some((c) => c.id === defaultValue[type].id && c.tipo === type) || !!defaultValue[type].nova.trim();
  const missingDefault = typesWithoutCategory.some((type) => !defaultValid(type));

  return (
    <Modal aberto={isOpen} titulo={T.financas.importarExtrato} aoFechar={onClose} largo>
      <div className="formulario">
        <p className="campo-dica">{T.financas.importarDica}</p>
        <div className="formulario-linha">
          <Field id="i-conta" rotulo={T.financas.conta} obrigatorio>
            <select id="i-conta" className="seletor" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {fin.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Field>
          <Field id="i-arquivo" rotulo={T.financas.arquivo} erro={error}>
            <input
              id="i-arquivo"
              ref={file}
              type="file"
              accept=".ofx,.csv,.txt"
              className="campo"
              style={{ paddingTop: 6 }}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const text = await readFileText(f, 3 * 1024 * 1024);
                  const result = /<OFX>|<STMTTRN>/i.test(text) ? readOfx(text) : readCsv(text);
                  if (result.linhas.length === 0) {
                    setError(T.validacao.arquivoInvalido);
                    setPreview(null);
                    return;
                  }
                  setError("");
                  setPreview(result);
                } catch (x) {
                  setError((x as Error).message === "arquivo_grande" ? T.validacao.arquivoGrande : T.validacao.arquivoInvalido);
                }
              }}
            />
          </Field>
        </div>
        {preview && (
          <>
            <span className="texto-2">{T.financas.previaImportacao(preview.linhas.length, preview.invalidas)}</span>
            <div className="tabela-rolagem" style={{ maxHeight: 220 }}>
              <table className="tabela">
                <tbody>
                  {preview.linhas.slice(0, 50).map((l, i) => (
                    <tr key={i}>
                      <td>{formatDateString(l.data, "dd/MM/yyyy")}</td>
                      <td>{l.descricao}</td>
                      <td>
                        <select className="seletor" style={{ height: 28, minWidth: 140 }} aria-label={T.financas.categoria} value={categoryLine(i)} onChange={(e) => setChoices((x) => ({ ...x, [i]: e.target.value }))}>
                          <option value="">{T.financas.categoriaPadraoOpcao}</option>
                          {fin.categorias.filter((c) => c.tipo === typeLine(l.valor)).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
                      </td>
                      <td className="direita numero">{formatMoney(l.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {typesWithoutCategory.length > 0 && (
              <div className="formulario-linha">
                {typesWithoutCategory.map((type) => (
                  <Field key={type} id={`i-padrao-${type}`} rotulo={T.financas.categoriaPadrao(type === "despesa" ? T.financas.tipos.despesa : T.financas.tipos.receita)} obrigatorio dica={T.financas.categoriaPadraoDica}>
                    <CategoryPicker
                      id={`i-padrao-${type}`}
                      tipo={type}
                      categoriaId={defaultValue[type].id}
                      novaCategoria={defaultValue[type].nova}
                      invalido={!defaultValid(type)}
                      aoMudar={(id, newItem) => setDefault((p) => ({ ...p, [type]: { id, nova: newItem } }))}
                    />
                  </Field>
                ))}
              </div>
            )}
          </>
        )}
        <div className="formulario-acoes">
          <Button onClick={onClose}>{T.geral.cancelar}</Button>
          <Button
            variante="primario"
            disabled={!preview || !accountId || missingDefault}
            title={missingDefault ? T.financas.categoriaObrigatoria : undefined}
            onClick={() => {
              if (!preview || missingDefault) return;
              const defaultFinal = (type: "despesa" | "receita") =>
                fin.categorias.some((c) => c.id === defaultValue[type].id && c.tipo === type) ? defaultValue[type].id : fin.getOrCreateCategory(defaultValue[type].nova, type).id;
              const finalValue = Object.fromEntries(typesWithoutCategory.map((type) => [type, defaultFinal(type)]));
              const r = fin.importData(
                preview.linhas.map((l, i) => {
                  const type = typeLine(l.valor);
                  return { tipo: type, valor: Math.abs(l.valor), descricao: l.descricao, contaId: accountId, data: l.data, categoriaId: categoryLine(i) || finalValue[type] };
                }),
              );
              notify(T.financas.importados(r.importados, r.duplicados));
              onClose();
            }}
          >
            {T.geral.importar}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ViewGeneral({ modo: mode, mes: month }: { modo: Mode; mes: string }) {
  const fin = useFinances();
  const expenses = expenseByCategory(fin, month, mode);
  const inputs = sumBy(incomeMonth(fin, month), (t) => t.valor);
  const outputs = sumBy([...expenses.values()], (v) => v);
  const balanceTotal = sumBy(fin.contas.filter((c) => !c.arquivada), (c) => balanceAccount(fin, c.id));
  const aReceive = sumBy([...balancesWithPeople(fin).values()].filter((v) => v > 0), (v) => v);
  const months = Array.from({ length: 6 }, (_, i) => format(addMonths(fromISO(`${month}-01`), i - 5), "yyyy-MM"));
  const todayDay = new Date().getDate();
  const next = fin.recorrentes.filter((r) => r.ativa).map((r) => ({ ...r, falta: (r.dia - todayDay + 31) % 31 })).sort((a, b) => a.falta - b.falta).slice(0, 5);

  return (
    <div className="grade">
      <Card className="col-3"><span className="rotulo-secao">{T.financas.saldoTotal}</span><div className="numero-grande privado">{formatMoney(balanceTotal)}</div></Card>
      <Card className="col-3"><span className="rotulo-secao">{T.financas.entradas}</span><div className="numero-grande privado" style={{ color: "var(--sucesso)" }}>{formatMoney(inputs)}</div></Card>
      <Card className="col-3"><span className="rotulo-secao">{T.financas.saidas}</span><div className="numero-grande privado">{formatMoney(outputs)}</div></Card>
      <Card className="col-3"><span className="rotulo-secao">{T.financas.aReceber}</span><div className="numero-grande privado">{formatMoney(aReceive)}</div></Card>
      <Card className="col-6" titulo={T.financas.porCategoria}>
        {expenses.size === 0 ? <p className="texto-3">{T.financas.semTransacoes}</p> : (
          <BarsHorizontal formatar={formatMoney} barras={[...expenses].map(([id, v]) => { const c = fin.categorias.find((x) => x.id === id); return { rotulo: c?.nome ?? T.financas.semCategoria, valor: v, cor: c?.cor }; }).sort((a, b) => b.valor - a.valor)} />
        )}
      </Card>
      <Card className="col-6" titulo={T.financas.evolucao}>
        <BarsVertical
          formatar={formatMoney}
          barras={months.map((m) => ({ rotulo: formatDateString(`${m}-01`, "MMM"), valor: sumBy([...expenseByCategory(fin, m, mode).values()], (v) => v), detalhe: `${formatDateString(`${m}-01`, "MMM yyyy")}: ${formatMoney(sumBy([...expenseByCategory(fin, m, mode).values()], (v) => v))}` }))}
        />
      </Card>
      <Card className="col-12" titulo={T.financas.proximasContas}>
        {next.length === 0 ? <p className="texto-3">{T.financas.semRecorrentes}</p> : (
          <div className="lista">
            {next.map((r) => (
              <div key={r.id} className="lista-item">
                <Repeat size={14} />
                <span className="lista-item-principal">{r.descricao}</span>
                <span className="etiqueta">{r.falta === 0 ? T.datas.hoje : T.datas.emDias(r.falta)}</span>
                <span className="numero privado">{formatMoney(r.valor)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Transactions({ mes: month, buscaInicial: searchInitial }: { mes: string; buscaInicial?: string }) {
  const fin = useFinances();
  const [search, setSearch] = useState(searchInitial ?? "");
  const [account, setAccount] = useState("");
  const [category, setCategory] = useState("");
  const [type, setType] = useState<TypeTransaction | "">("");
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [limit, setLimit] = useState(80);

  const list = fin.transacoes
    .filter((t) => (search ? contains(t.descricao, search) : t.data.startsWith(month)))
    .filter((t) => !account || t.contaId === account || t.contaDestinoId === account)
    .filter((t) => !category || t.categoriaId === category)
    .filter((t) => !type || t.tipo === type)
    .sort((a, b) => b.data.localeCompare(a.data) || b.criadaEm.localeCompare(a.criadaEm));
  const visible = list.slice(0, limit);
  const byDay = visible.reduce<Record<string, Transaction[]>>((acc, t) => ((acc[t.data] ??= []).push(t), acc), {});

  return (
    <div className="coluna">
      <div className="barra-acoes">
        <label className="campo-busca">
          <ListFilter size={14} />
          <input className="campo" value={search} maxLength={80} placeholder={T.financas.buscarTransacao} aria-label={T.financas.buscarTransacao} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <select className="seletor" style={{ width: 160, height: 32 }} value={account} aria-label={T.financas.conta} onChange={(e) => setAccount(e.target.value)}>
          <option value="">{T.financas.todasContas}</option>
          {fin.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select className="seletor" style={{ width: 170, height: 32 }} value={category} aria-label={T.financas.categoria} onChange={(e) => setCategory(e.target.value)}>
          <option value="">{T.financas.todasCategorias}</option>
          {fin.categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select className="seletor" style={{ width: 150, height: 32 }} value={type} aria-label={T.financas.tipoConta} onChange={(e) => setType(e.target.value as TypeTransaction | "")}>
          <option value="">{T.geral.todos}</option>
          {(["despesa", "receita", "transferencia"] as const).map((t) => <option key={t} value={t}>{T.financas.tipos[t]}</option>)}
        </select>
        {(search || account || category || type) && <Button pequeno variante="fantasma" icone={<X size={13} />} onClick={() => { setSearch(""); setAccount(""); setCategory(""); setType(""); }}>{T.geral.limpar}</Button>}
      </div>
      {list.length === 0 ? (
        <Empty icone={<Wallet size={28} />} titulo={T.financas.semTransacoes} />
      ) : (
        <>
          {Object.entries(byDay).map(([day, items]) => (
            <div key={day}>
              <div className="linha-entre rotulo-secao" style={{ padding: "8px 0 0" }}>
                <span style={{ textTransform: "capitalize" }}>{formatDateString(day, "EEEE, d 'de' MMM")}</span>
              </div>
              <div className="lista">{items.map((t) => <LineTransaction key={t.id} t={t} aoEditar={() => setEditing(t)} />)}</div>
            </div>
          ))}
          {list.length > limit && <Button onClick={() => setLimit((l) => l + 80)}>{T.financas.carregarMais(list.length - limit)}</Button>}
        </>
      )}
      <FormTransaction aberto={!!editing} editando={editing} aoFechar={() => setEditing(null)} />
    </div>
  );
}

function FormAccount({ aberto: isOpen, aoFechar: onClose, aoCriar: onCreate, aviso: notice }: { aberto: boolean; aoFechar: () => void; aoCriar?: (account: Account) => void; aviso?: string }) {
  const fin = useFinances();
  const [nameValue, setName] = useState("");
  const [type, setType] = useState<TypeAccount>("corrente");
  const [balance, setBalance] = useState("0,00");
  const [closing, setClosing] = useState("3");
  const [due, setDue] = useState("10");
  const [limit, setLimit] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    setName("");
    setType("corrente");
    setBalance("0,00");
    setLimit("");
    setErrors({});
  }, [isOpen]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const newItems: Record<string, string> = {};
    if (!nameValue.trim()) newItems.nome = T.validacao.obrigatorio;
    else if (fin.contas.some((c) => normalizeText(c.nome) === normalizeText(nameValue))) newItems.nome = T.validacao.duplicado;
    const s = readValueAtCents(balance || "0");
    if (s == null) newItems.saldo = T.validacao.valorInvalido;
    const f = Number(closing);
    const v = Number(due);
    if (type === "cartao") {
      if (!Number.isInteger(f) || f < 1 || f > 28) newItems.fechamento = T.validacao.entre(1, 28);
      if (!Number.isInteger(v) || v < 1 || v > 28) newItems.vencimento = T.validacao.entre(1, 28);
    }
    const l = limit ? readValueAtCents(limit) : 0;
    if (l == null) newItems.limite = T.validacao.valorInvalido;
    setErrors(newItems);
    if (Object.keys(newItems).length) return;
    const account = fin.createAccount({ nome: nameValue, tipo: type, saldoInicial: type === "cartao" ? 0 : s ?? 0, cor: COLORS[fin.contas.length % COLORS.length], fechamentoDia: type === "cartao" ? f : undefined, vencimentoDia: type === "cartao" ? v : undefined, limite: type === "cartao" ? l ?? 0 : undefined });
    void playSound("pop");
    onClose();
    onCreate?.(account);
  };

  return (
    <Modal aberto={isOpen} titulo={T.financas.novaConta} aoFechar={onClose}>
      <form className="formulario" onSubmit={save} noValidate>
        {notice && <NoticeBanner>{notice}</NoticeBanner>}
        <Field id="c-nome" rotulo={T.financas.nomeConta} obrigatorio erro={errors.nome} dica={T.financas.nomeContaDica}>
          <input id="c-nome" className="campo" autoFocus value={nameValue} maxLength={60} aria-invalid={!!errors.nome} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field id="c-tipo" rotulo={T.financas.tipoConta}>
          <select id="c-tipo" className="seletor" value={type} onChange={(e) => setType(e.target.value as TypeAccount)}>
            {(Object.keys(T.financas.tiposConta) as TypeAccount[]).map((t) => <option key={t} value={t}>{T.financas.tiposConta[t]}</option>)}
          </select>
        </Field>
        {type === "cartao" ? (
          <div className="formulario-linha">
            <Field id="c-fech" rotulo={T.financas.fechamento} obrigatorio erro={errors.fechamento}>
              <input id="c-fech" className="campo" inputMode="numeric" value={closing} onChange={(e) => setClosing(e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field id="c-venc" rotulo={T.financas.vencimento} obrigatorio erro={errors.vencimento}>
              <input id="c-venc" className="campo" inputMode="numeric" value={due} onChange={(e) => setDue(e.target.value.replace(/\D/g, ""))} />
            </Field>
            <FieldMoney id="c-lim" rotulo={T.financas.limite} valor={limit} aoMudar={setLimit} erro={errors.limite} />
          </div>
        ) : (
          <FieldMoney id="c-saldo" rotulo={T.financas.saldoInicial} valor={balance} aoMudar={setBalance} erro={errors.saldo} dica={T.financas.saldoInicialDica} />
        )}
        <div className="formulario-acoes">
          <Button onClick={onClose}>{T.geral.cancelar}</Button>
          <Button type="submit" variante="primario">{T.geral.criar}</Button>
        </div>
      </form>
    </Modal>
  );
}

function Accounts() {
  const fin = useFinances();
  const [newItem, setNew] = useState(false);
  const [adjustment, setAdjustment] = useState<Account | null>(null);
  const [remove, setDelete] = useState<Account | null>(null);
  const [balanceReal, setBalanceReal] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const openNew = () => setNew(true);

  return (
    <>
      <div className="linha-entre">
        <span className="texto-2">{T.financas.contasDica}</span>
        <Button variante="primario" pequeno icone={<Plus size={13} />} onClick={openNew}>{T.financas.novaConta}</Button>
      </div>
      {fin.contas.length === 0 ? (
        <Empty icone={<Landmark size={28} />} titulo={T.financas.semContas} acao={<Button variante="primario" onClick={openNew}>{T.financas.novaConta}</Button>} />
      ) : (
        <div className="grade">
          {fin.contas.map((c) => {
            const s = balanceAccount(fin, c.id);
            return (
              <Card key={c.id} className="col-4">
                <div className="linha" style={{ marginBottom: 8 }}>
                  <span style={{ color: c.cor, display: "grid" }}>{ICON_ACCOUNT[c.tipo]}</span>
                  <b className="cortar">{c.nome}</b>
                  <span className="etiqueta empurrar">{T.financas.tiposConta[c.tipo]}</span>
                </div>
                <div className="numero-grande privado" style={{ color: s < 0 ? "var(--erro)" : undefined }}>{formatMoney(s)}</div>
                <div className="linha" style={{ marginTop: 12 }}>
                  <Button pequeno icone={<Scale size={13} />} onClick={() => { setAdjustment(c); setBalanceReal(centsToField(s)); setErrors({}); }}>{T.financas.ajustarSaldo}</Button>
                  <Button pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={() => setDelete(c)} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <FormAccount aberto={newItem} aoFechar={() => setNew(false)} />
      <Modal aberto={!!adjustment} titulo={T.financas.ajustarSaldo} aoFechar={() => setAdjustment(null)}>
        <form
          className="formulario"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const v = readValueAtCents(balanceReal.replace(/^-/, ""));
            if (v == null || !adjustment) return setErrors({ real: T.validacao.valorInvalido });
            fin.adjustBalance(adjustment.id, balanceReal.trim().startsWith("-") ? -v : v);
            setAdjustment(null);
          }}
        >
          <p className="campo-dica">{T.financas.ajusteDica}</p>
          <FieldMoney id="c-real" rotulo={T.financas.saldoReal} valor={balanceReal} aoMudar={setBalanceReal} erro={errors.real} />
          <div className="formulario-acoes">
            <Button onClick={() => setAdjustment(null)}>{T.geral.cancelar}</Button>
            <Button type="submit" variante="primario">{T.geral.salvar}</Button>
          </div>
        </form>
      </Modal>
      <ConfirmModal aberto={!!remove} titulo={T.geral.confirmarExclusao} texto={T.financas.excluirConta} aoFechar={() => setDelete(null)} aoConfirmar={() => remove && fin.deleteAccount(remove.id)} />
    </>
  );
}

function Cards() {
  const fin = useFinances();
  const cards = fin.contas.filter((c) => c.tipo === "cartao");
  const [paying, setPaying] = useState<{ cartao: Account; valor: number } | null>(null);
  const [accountPayment, setAccountPayment] = useState("");
  const [offset, setOffset] = useState(0);
  if (cards.length === 0) return <Empty icone={<CreditCard size={28} />} titulo={T.financas.semCartoes} />;

  return (
    <div className="coluna">
      <div className="linha">
        <Button pequeno onClick={() => setOffset((d) => d - 1)}>{T.geral.anterior}</Button>
        <Button pequeno onClick={() => setOffset(0)} disabled={offset === 0}>{T.financas.faturaAtual}</Button>
        <Button pequeno onClick={() => setOffset((d) => d + 1)}>{T.geral.proximo}</Button>
      </div>
      {cards.map((c) => {
        const base = addMonths(new Date(), offset);
        const due = setDate(base, Math.min(c.vencimentoDia ?? 10, getDaysInMonth(base)));
        const dueISO = toISO(due);
        const purchases = fin.transacoes.filter((t) => t.contaId === c.id && t.tipo === "despesa" && dataBox(t, fin.contas) === dueISO);
        const total = sumBy(purchases, (t) => t.valor);
        const used = Math.max(0, -balanceAccount(fin, c.id));
        return (
          <Card key={c.id} titulo={`${c.nome} . ${T.financas.faturaDe(formatDate(due, "MMMM"))}`} icone={<CreditCard size={16} />} acoes={<Button pequeno variante="primario" disabled={total === 0} onClick={() => { setPaying({ cartao: c, valor: total }); setAccountPayment(fin.contas.find((x) => x.tipo !== "cartao")?.id ?? ""); }}>{T.financas.pagarFatura}</Button>}>
            <div className="linha" style={{ gap: 24, flexWrap: "wrap", marginBottom: 12 }}>
              <div><span className="rotulo-secao">{T.financas.fatura}</span><div className="numero-grande privado">{formatMoney(total)}</div></div>
              <div><span className="rotulo-secao">{T.financas.vencimento}</span><div>{formatDateString(dueISO, "d 'de' MMM")}</div></div>
              {c.limite ? (
                <div style={{ flex: 1, minWidth: 180 }}>
                  <span className="rotulo-secao">{T.financas.limiteUsado}</span>
                  <Progress valor={used / c.limite} nivel={used / c.limite > 0.9 ? "erro" : used / c.limite > 0.7 ? "alerta" : undefined} />
                  <span className="texto-3 numero privado" style={{ fontSize: 11 }}>{formatMoney(used)} / {formatMoney(c.limite)}</span>
                </div>
              ) : null}
            </div>
            {purchases.length === 0 ? <p className="texto-3">{T.financas.semTransacoes}</p> : <div className="lista">{purchases.map((t) => <LineTransaction key={t.id} t={t} aoEditar={() => undefined} />)}</div>}
          </Card>
        );
      })}
      <NoticeBanner>{T.financas.cartaoSemDobro}</NoticeBanner>
      <Modal aberto={!!paying} titulo={T.financas.pagarFatura} aoFechar={() => setPaying(null)}>
        {paying && (
          <div className="formulario">
            <p>{T.financas.pagarResumo(formatMoney(paying.valor), paying.cartao.nome)}</p>
            <Field id="pf-conta" rotulo={T.financas.pagarCom}>
              <select id="pf-conta" className="seletor" value={accountPayment} onChange={(e) => setAccountPayment(e.target.value)}>
                {fin.contas.filter((x) => x.tipo !== "cartao").map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select>
            </Field>
            <div className="formulario-acoes">
              <Button onClick={() => setPaying(null)}>{T.geral.cancelar}</Button>
              <Button
                variante="primario"
                disabled={!accountPayment}
                onClick={() => {
                  fin.recordTransaction({ tipo: "transferencia", valor: paying.valor, descricao: T.financas.pagamentoFatura(paying.cartao.nome), contaId: accountPayment, contaDestinoId: paying.cartao.id, data: todayISO() });
                  setPaying(null);
                  void playSound("approve");
                }}
              >
                {T.geral.confirmar}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Budget({ mes: month, modo: mode }: { mes: string; modo: Mode }) {
  const fin = useFinances();
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const expenses = expenseByCategory(fin, month, mode);
  const expenseItems = fin.categorias.filter((c) => c.tipo === "despesa");

  return (
    <div className="lista">
      {expenseItems.map((c) => {
        const expense = expenses.get(c.id) ?? 0;
        const p = c.orcamento > 0 ? expense / c.orcamento : 0;
        return (
          <div key={c.id} className="lista-item" style={{ alignItems: "flex-start", paddingTop: 12, paddingBottom: 12 }}>
            <span className="ponto-cor" style={{ background: c.cor, marginTop: 5 }} />
            <div className="lista-item-principal" style={{ gap: 6 }}>
              <div className="linha-entre">
                <span>{c.nome}</span>
                <span className="numero privado texto-2" style={{ fontSize: 12 }}>{formatMoney(expense)} {c.orcamento > 0 && `/ ${formatMoney(c.orcamento)}`}</span>
              </div>
              {c.orcamento > 0 ? <Progress valor={p} nivel={p >= 1 ? "erro" : p >= 0.8 ? "alerta" : "sucesso"} rotulo={c.nome} /> : <span className="texto-3" style={{ fontSize: 12 }}>{T.financas.semOrcamento}</span>}
              {editing === c.id && (
                <form
                  className="linha"
                  noValidate
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = validateValue(value || "0", true);
                    if (v.erro || v.valor == null) return setError(v.erro ?? T.validacao.valorInvalido);
                    fin.updateCategory(c.id, { orcamento: v.valor });
                    setEditing(null);
                  }}
                >
                  <div className="campo-prefixo" style={{ maxWidth: 180 }}>
                    <span>R$</span>
                    <input className="campo" autoFocus inputMode="decimal" value={value} aria-label={T.financas.orcamentoDe} aria-invalid={!!error} onChange={(e) => { setValue(e.target.value.replace(/[^\d.,]/g, "")); setError(""); }} />
                  </div>
                  <Button pequeno type="submit" variante="primario" icone={<Check size={13} />}>{T.geral.salvar}</Button>
                  <Button pequeno onClick={() => setEditing(null)}>{T.geral.cancelar}</Button>
                  {error && <span className="campo-erro">{error}</span>}
                </form>
              )}
            </div>
            {editing !== c.id && <Button pequeno icone={<Pencil size={12} />} onClick={() => { setEditing(c.id); setValue(c.orcamento ? centsToField(c.orcamento) : ""); setError(""); }}>{T.financas.orcamentoDe}</Button>}
          </div>
        );
      })}
    </div>
  );
}

function ManageCategories() {
  const fin = useFinances();
  const [editing, setEditing] = useState<{ id: string | null; tipo: "despesa" | "receita"; nome: string; cor: string } | null>(null);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<{ id: string; destinoId: string } | null>(null);
  const targetDeletion = fin.categorias.find((c) => c.id === deleting?.id);
  const usage = (id: string) => fin.transacoes.filter((t) => t.categoriaId === id).length + fin.recorrentes.filter((r) => r.categoriaId === id).length;

  useEffect(() => fin.ensureCategories(), []);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const nameValue = editing.nome.trim().slice(0, 40);
    if (!nameValue) return setError(T.validacao.obrigatorio);
    const repeated = fin.categorias.some((c) => c.id !== editing.id && c.tipo === editing.tipo && normalizeText(c.nome) === normalizeText(nameValue));
    if (repeated) return setError(T.validacao.duplicado);
    if (editing.id) fin.updateCategory(editing.id, { nome: nameValue, cor: editing.cor });
    else fin.createCategory({ nome: nameValue, cor: editing.cor, orcamento: 0, tipo: editing.tipo });
    setEditing(null);
  };

  const form = (
    <form className="linha" style={{ flexWrap: "wrap" }} noValidate onSubmit={save}>
      {editing && !editing.id && (
        <Segmented<"despesa" | "receita">
          rotulo={T.financas.tipoConta}
          valor={editing.tipo}
          aoMudar={(type) => setEditing({ ...editing, tipo: type })}
          opcoes={[{ valor: "despesa", rotulo: T.financas.tipos.despesa }, { valor: "receita", rotulo: T.financas.tipos.receita }]}
        />
      )}
      <input className="campo" style={{ maxWidth: 220 }} autoFocus maxLength={40} value={editing?.nome ?? ""} placeholder={T.financas.nomeCategoria} aria-label={T.financas.nomeCategoria} aria-invalid={!!error} onChange={(e) => { setEditing((x) => x && { ...x, nome: e.target.value }); setError(""); }} />
      <span className="linha" style={{ gap: 4 }}>
        {COLORS_CATEGORY.map((color) => (
          <button key={color} type="button" className="ponto-cor" aria-label={color} aria-pressed={editing?.cor === color} style={{ background: color, width: 18, height: 18, outline: editing?.cor === color ? "2px solid var(--texto)" : undefined, outlineOffset: 2 }} onClick={() => setEditing((x) => x && { ...x, cor: color })} />
        ))}
      </span>
      <Button pequeno type="submit" variante="primario" icone={<Check size={13} />}>{T.geral.salvar}</Button>
      <Button pequeno onClick={() => setEditing(null)}>{T.geral.cancelar}</Button>
      {error && <span className="campo-erro">{error}</span>}
    </form>
  );

  return (
    <Card
      titulo={T.financas.categorias}
      icone={<Tags size={16} />}
      acoes={!editing || editing.id ? <Button pequeno variante="primario" icone={<Plus size={13} />} onClick={() => { setEditing({ id: null, tipo: "despesa", nome: "", cor: COLORS_CATEGORY[fin.categorias.length % COLORS_CATEGORY.length] }); setError(""); }}>{T.financas.novaCategoria}</Button> : undefined}
    >
      <p className="campo-dica" style={{ marginBottom: 8 }}>{T.financas.categoriasDica}</p>
      {editing && !editing.id && form}
      {(["despesa", "receita"] as const).map((type) => (
        <div key={type} className="lista" style={{ marginTop: 8 }}>
          <span className="texto-3" style={{ fontSize: 12 }}>{type === "despesa" ? T.financas.tipos.despesa : T.financas.tipos.receita}</span>
          {fin.categorias.filter((c) => c.tipo === type).map((c) => (
            <div key={c.id} className="lista-item">
              <span className="ponto-cor" style={{ background: c.cor }} />
              {editing?.id === c.id ? form : (
                <>
                  <span className="lista-item-principal">{c.nome}</span>
                  <div className="lista-item-acoes">
                    <Button pequeno soIcone variante="fantasma" icone={<Pencil size={13} />} aria-label={T.geral.editar} onClick={() => { setEditing({ id: c.id, tipo: c.tipo, nome: c.nome, cor: c.cor }); setError(""); }} />
                    <Button
                      pequeno
                      soIcone
                      variante="fantasma"
                      icone={<Trash2 size={13} />}
                      aria-label={T.financas.excluirCategoria(c.nome)}
                      title={fin.categorias.filter((x) => x.tipo === type).length <= 1 ? T.financas.ultimaCategoria : undefined}
                      disabled={fin.categorias.filter((x) => x.tipo === type).length <= 1}
                      onClick={() => setDeleting({ id: c.id, destinoId: fin.categorias.find((x) => x.tipo === type && x.id !== c.id)?.id ?? "" })}
                    />
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      ))}
      <Modal aberto={!!targetDeletion} titulo={targetDeletion ? T.financas.excluirCategoria(targetDeletion.nome) : ""} aoFechar={() => setDeleting(null)}>
        {targetDeletion && deleting && (
          <div className="formulario">
            <Field id="cat-destino" rotulo={T.financas.moverPara} dica={T.financas.excluirCategoriaDica(usage(targetDeletion.id))}>
              <select id="cat-destino" className="seletor" value={deleting.destinoId} onChange={(e) => setDeleting({ ...deleting, destinoId: e.target.value })}>
                {fin.categorias.filter((c) => c.tipo === targetDeletion.tipo && c.id !== targetDeletion.id).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Field>
            <div className="formulario-acoes">
              <Button onClick={() => setDeleting(null)}>{T.geral.cancelar}</Button>
              <Button variante="perigo" disabled={!deleting.destinoId} onClick={() => { fin.deleteCategory(deleting.id, deleting.destinoId); setDeleting(null); }}>{T.geral.excluir}</Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}

function Recurring() {
  const fin = useFinances();
  const [isOpen, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const [day, setDay] = useState("5");
  const [frequency, setFrequency] = useState<"mensal" | "anual">("mensal");
  const [monthAnnual, setMonthAnnual] = useState(String(new Date().getMonth() + 1));
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const candidates = useMemo(() => detectSubscriptions(fin.transacoes, fin.recorrentes, fin.assinaturasIgnoradas), [fin.transacoes, fin.recorrentes, fin.assinaturasIgnoradas]);
  const changed = useMemo(() => subscriptionsWithValueNew(fin.transacoes, fin.recorrentes), [fin.transacoes, fin.recorrentes]);

  const openValue = (pre?: { descricao: string; valor: number; dia: number; frequencia: "mensal" | "anual"; contaId: string; categoriaId?: string }) => {
    setDescription(pre?.descricao ?? "");
    setValue(pre ? centsToField(pre.valor) : "");
    setDay(String(pre?.dia ?? 5));
    setFrequency(pre?.frequencia ?? "mensal");
    setAccountId(pre?.contaId ?? fin.contas[0]?.id ?? "");
    setCategoryId(pre?.categoriaId ?? (pre ? fin.categorizar(pre.descricao) ?? "" : ""));
    setNewCategory("");
    setErrors({});
    setOpen(true);
  };

  return (
    <div className="coluna" style={{ gap: 20 }}>
      <Card titulo={T.financas.detector} icone={<ScanSearch size={16} />}>
        <p className="campo-dica" style={{ marginBottom: 8 }}>{T.financas.detectorDica}</p>
        {changed.map((r) => <NoticeBanner key={r.id} tipo="alerta">{T.financas.mudouValor(r.descricao)}</NoticeBanner>)}
        {candidates.length === 0 ? <p className="texto-3">{T.financas.semCandidatas}</p> : (
          <div className="lista">
            {candidates.map((c) => (
              <div key={c.chave} className="lista-item">
                <Repeat size={14} />
                <div className="lista-item-principal">
                  <span className="lista-item-titulo">{c.descricao}</span>
                  <span className="lista-item-sub">{T.financas.ocorrencias(c.ocorrencias.length)} . {c.frequencia === "mensal" ? T.financas.mensal : T.financas.anual} . {T.financas.proximaPrevista(formatDateString(c.proxima, "d 'de' MMM"))}</span>
                </div>
                <span className="numero privado">{formatMoney(c.valor)}</span>
                <Button pequeno variante="primario" onClick={() => openValue(c)}>{T.financas.cadastrarRecorrente}</Button>
                <Button pequeno variante="fantasma" onClick={() => fin.ignoreSignature(c.chave)}>{T.financas.ignorarSempre}</Button>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card titulo={T.financas.abas.recorrentes} icone={<Repeat size={16} />} acoes={<Button pequeno variante="primario" icone={<Plus size={13} />} disabled={fin.contas.length === 0} onClick={() => openValue()}>{T.financas.novaRecorrente}</Button>}>
        {fin.recorrentes.length === 0 ? <Empty titulo={T.financas.semRecorrentes} /> : (
          <div className="lista">
            {fin.recorrentes.map((r) => (
              <div key={r.id} className="lista-item">
                <BoxMark marcada={r.ativa} rotulo={r.ativa ? T.financas.ativa : T.financas.pausada} aoMudar={(v) => fin.updateRecurring(r.id, { ativa: v })} />
                <div className="lista-item-principal">
                  <span className={`lista-item-titulo ${r.ativa ? "" : "texto-3"}`}>{r.descricao}</span>
                  <span className="lista-item-sub">{r.frequencia === "mensal" ? T.financas.mensal : T.financas.anual} . {T.financas.dia} {r.dia} . {nameCategory(r.categoriaId, fin.categorias)}</span>
                </div>
                <span className="numero privado">{formatMoney(r.valor)}</span>
                <div className="lista-item-acoes"><Button pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={() => fin.deleteRecurring(r.id)} /></div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Modal aberto={isOpen} titulo={T.financas.novaRecorrente} aoFechar={() => setOpen(false)}>
        <form
          className="formulario"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const newItems: Record<string, string> = {};
            if (!description.trim()) newItems.descricao = T.validacao.obrigatorio;
            const v = validateValue(value);
            if (v.erro) newItems.valor = v.erro;
            const d = Number(day);
            if (!Number.isInteger(d) || d < 1 || d > 31) newItems.dia = T.validacao.entre(1, 31);
            if (!accountId) newItems.conta = T.validacao.contaObrigatoria;
            const categoryValid = fin.categorias.some((c) => c.id === categoryId && c.tipo === "despesa");
            if (!categoryValid && !newCategory.trim()) newItems.categoria = T.financas.categoriaObrigatoria;
            setErrors(newItems);
            if (Object.keys(newItems).length || v.valor == null) return;
            const categoryFinal = categoryValid ? categoryId : fin.getOrCreateCategory(newCategory, "despesa").id;
            const today = new Date();
            fin.createRecurring({
              descricao: description.trim(),
              valor: v.valor,
              dia: d,
              frequencia: frequency,
              mesAnual: frequency === "anual" ? Number(monthAnnual) : undefined,
              contaId: accountId,
              categoriaId: categoryFinal,
              ativa: true,
              geradoAte: generatedUntilInitial({ dia: d, frequencia: frequency, mesAnual: frequency === "anual" ? Number(monthAnnual) : undefined }, today),
            });
            setOpen(false);
          }}
        >
          <Field id="r-desc" rotulo={T.financas.descricao} obrigatorio erro={errors.descricao}>
            <input id="r-desc" className="campo" value={description} maxLength={120} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="formulario-linha">
            <FieldMoney id="r-valor" rotulo={T.financas.valor} valor={value} aoMudar={setValue} erro={errors.valor} obrigatorio />
            <Field id="r-dia" rotulo={T.financas.dia} obrigatorio erro={errors.dia}>
              <input id="r-dia" className="campo" inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, ""))} />
            </Field>
          </div>
          <div className="formulario-linha">
            <Field id="r-freq" rotulo={T.financas.frequencia}>
              <select id="r-freq" className="seletor" value={frequency} onChange={(e) => setFrequency(e.target.value as "mensal" | "anual")}>
                <option value="mensal">{T.financas.mensal}</option>
                <option value="anual">{T.financas.anual}</option>
              </select>
            </Field>
            {frequency === "anual" && (
              <Field id="r-mes" rotulo={T.financas.mesAnual}>
                <select id="r-mes" className="seletor" value={monthAnnual} onChange={(e) => setMonthAnnual(e.target.value)}>
                  {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{formatDate(new Date(2026, i, 1), "MMMM")}</option>)}
                </select>
              </Field>
            )}
          </div>
          <div className="formulario-linha">
            <Field id="r-conta" rotulo={T.financas.conta} obrigatorio erro={errors.conta}>
              <select id="r-conta" className="seletor" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {fin.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Field>
            <Field id="r-cat" rotulo={T.financas.categoria} obrigatorio erro={errors.categoria}>
              <CategoryPicker
                id="r-cat"
                tipo="despesa"
                categoriaId={categoryId}
                novaCategoria={newCategory}
                invalido={!!errors.categoria}
                aoMudar={(id, newItem) => { setCategoryId(id); setNewCategory(newItem); setErrors((e) => ({ ...e, categoria: "" })); }}
              />
            </Field>
          </div>
          <div className="formulario-acoes">
            <Button onClick={() => setOpen(false)}>{T.geral.cancelar}</Button>
            <Button type="submit" variante="primario">{T.geral.criar}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Savings() {
  const fin = useFinances();
  const [newItem, setNew] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [nameValue, setName] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [value, setValue] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  return (
    <>
      <div className="linha-entre">
        <span />
        <Button pequeno variante="primario" icone={<Plus size={13} />} onClick={() => { setName(""); setTarget(""); setDeadline(""); setErrors({}); setNew(true); }}>{T.financas.novaMetaEconomia}</Button>
      </div>
      {fin.metasEconomia.length === 0 ? <Empty icone={<PiggyBank size={28} />} titulo={T.financas.semMetasEconomia} /> : (
        <div className="grade">
          {fin.metasEconomia.map((m) => {
            const p = m.alvo ? m.guardado / m.alvo : 0;
            const months = m.prazo ? Math.max(1, Math.ceil((fromISO(m.prazo).getTime() - Date.now()) / (30 * 86400000))) : 0;
            return (
              <Card key={m.id} className="col-6" titulo={m.nome} icone={<Target size={16} />} acoes={<Button pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={() => fin.deleteGoalSavings(m.id)} />}>
                <div className="linha-entre"><span className="numero-grande privado">{formatMoney(m.guardado)}</span><span className="texto-2 privado">{formatMoney(m.alvo)}</span></div>
                <Progress valor={p} nivel={p >= 1 ? "sucesso" : undefined} rotulo={m.nome} />
                <div className="linha-entre" style={{ marginTop: 8 }}>
                  <span className="texto-3" style={{ fontSize: 12 }}>{m.prazo && p < 1 ? T.financas.porMes(formatMoney(Math.ceil((m.alvo - m.guardado) / months))) : `${Math.round(p * 100)}%`}</span>
                  <Button pequeno icone={<Plus size={13} />} onClick={() => { setSaving(m.id); setValue(""); setErrors({}); }}>{T.financas.guardar}</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <Modal aberto={newItem} titulo={T.financas.novaMetaEconomia} aoFechar={() => setNew(false)}>
        <form
          className="formulario"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const newItems: Record<string, string> = {};
            if (!nameValue.trim()) newItems.nome = T.validacao.obrigatorio;
            const v = validateValue(target);
            if (v.erro) newItems.alvo = v.erro;
            if (deadline && (!isValidDate(deadline) || deadline <= todayISO())) newItems.prazo = T.validacao.dataFutura;
            setErrors(newItems);
            if (Object.keys(newItems).length || v.valor == null) return;
            fin.createGoalSavings({ nome: nameValue.trim().slice(0, 60), alvo: v.valor, guardado: 0, prazo: deadline || undefined });
            setNew(false);
          }}
        >
          <Field id="e-nome" rotulo={T.metas.nome} obrigatorio erro={errors.nome}>
            <input id="e-nome" className="campo" value={nameValue} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="formulario-linha">
            <FieldMoney id="e-alvo" rotulo={T.financas.alvo} valor={target} aoMudar={setTarget} erro={errors.alvo} obrigatorio />
            <Field id="e-prazo" rotulo={T.financas.prazo} erro={errors.prazo}>
              <input id="e-prazo" type="date" className="campo" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </Field>
          </div>
          <div className="formulario-acoes">
            <Button onClick={() => setNew(false)}>{T.geral.cancelar}</Button>
            <Button type="submit" variante="primario">{T.geral.criar}</Button>
          </div>
        </form>
      </Modal>
      <Modal aberto={!!saving} titulo={T.financas.guardar} aoFechar={() => setSaving(null)}>
        <form
          className="formulario"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const v = validateValue(value);
            if (v.erro || v.valor == null || !saving) return setErrors({ valor: v.erro ?? T.validacao.valorInvalido });
            fin.storeGoal(saving, v.valor);
            setSaving(null);
            void playSound("pop");
          }}
        >
          <FieldMoney id="e-valor" rotulo={T.financas.valor} valor={value} aoMudar={setValue} erro={errors.valor} obrigatorio />
          <div className="formulario-acoes">
            <Button onClick={() => setSaving(null)}>{T.geral.cancelar}</Button>
            <Button type="submit" variante="primario">{T.geral.salvar}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function Split() {
  const fin = useFinances();
  const notify = useInterface((s) => s.notify);
  const [namePerson, setNamePerson] = useState("");
  const [errorPerson, setErrorPerson] = useState("");
  const [newItem, setNew] = useState(false);
  const [settlement, setSettlement] = useState<{ pessoaId: string; saldo: number } | null>(null);
  const [description, setDescription] = useState("");
  const [total, setTotal] = useState("");
  const [payer, setPayer] = useState(EU);
  const [participants, setParticipants] = useState<string[]>([EU]);
  const [modeDiv, setModeDiv] = useState<"iguais" | "valor" | "porcentagem">("iguais");
  const [parts, setParts] = useState<Record<string, string>>({});
  const [accountId, setAccountId] = useState("");
  const [accountSettlement, setAccountSettlement] = useState("");
  const [valueSettlement, setValueSettlement] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [categoryDiv, setCategoryDiv] = useState({ id: "", nova: "" });
  const suggestedDiv = !categoryDiv.id && !categoryDiv.nova && description ? fin.categorias.find((c) => c.id === fin.categorizar(description) && c.tipo === "despesa")?.id : undefined;
  const balances = balancesWithPeople(fin);
  const simplification = simplifyDebts(fin);
  const nameValue = (id: string) => (id === EU ? T.financas.eu : fin.pessoas.find((p) => p.id === id)?.nome ?? "");

  const saveSplit = (e: React.FormEvent) => {
    e.preventDefault();
    const newItems: Record<string, string> = {};
    if (!description.trim()) newItems.descricao = T.validacao.obrigatorio;
    const v = validateValue(total);
    if (v.erro) newItems.total = v.erro;
    if (participants.length < 2) newItems.participantes = T.financas.minimoParticipantes;
    if (payer === EU && !accountId) newItems.conta = T.validacao.contaObrigatoria;
    let values: { pessoaId: string; valor: number }[] = [];
    if (v.valor != null && participants.length >= 2) {
      if (modeDiv === "iguais") {
        const base = Math.floor(v.valor / participants.length);
        const rest = v.valor - base * participants.length;
        values = participants.map((p, i) => ({ pessoaId: p, valor: base + (i === 0 ? rest : 0) }));
      } else if (modeDiv === "valor") {
        values = participants.map((p) => ({ pessoaId: p, valor: readValueAtCents(parts[p] || "0") ?? -1 }));
        if (values.some((x) => x.valor < 0)) newItems.partes = T.validacao.valorInvalido;
        const sum = sumBy(values, (x) => x.valor);
        if (sum !== v.valor) newItems.partes = T.validacao.partesNaoFecham(formatMoney(v.valor - sum));
      } else {
        const pct = participants.map((p) => Number((parts[p] || "0").replace(",", ".")));
        if (pct.some((x) => !Number.isFinite(x) || x < 0)) newItems.partes = T.validacao.valorInvalido;
        const sum = pct.reduce((a, b) => a + b, 0);
        if (Math.abs(sum - 100) > 0.01) newItems.partes = T.financas.porcentagemFecha(sum.toFixed(1).replace(".", ","));
        values = participants.map((p, i) => ({ pessoaId: p, valor: Math.round((v.valor! * pct[i]) / 100) }));
        const difference = v.valor - sumBy(values, (x) => x.valor);
        if (values[0]) values[0].valor += difference;
      }
    }
    const selected = categoryDiv.id || suggestedDiv;
    const categoryValid = fin.categorias.some((c) => c.id === selected && c.tipo === "despesa");
    if (!categoryValid && !categoryDiv.nova.trim()) newItems.categoria = T.financas.categoriaObrigatoria;
    setErrors(newItems);
    if (Object.keys(newItems).length || v.valor == null) return;
    const categoryId = categoryValid ? selected : fin.getOrCreateCategory(categoryDiv.nova, "despesa").id;
    fin.dividir({ descricao: description.trim(), total: v.valor, pagadorId: payer, partes: values, data: todayISO(), contaId: payer === EU ? accountId : undefined, categoriaId: categoryId });
    setNew(false);
    void playSound("pop");
  };

  return (
    <div className="grade">
      <Card className="col-4" titulo={T.financas.pessoas} icone={<Users size={16} />}>
        <form
          className="linha"
          style={{ alignItems: "flex-start", marginBottom: 12 }}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const clean = namePerson.trim();
            if (!clean) return setErrorPerson(T.validacao.obrigatorio);
            if (fin.pessoas.some((p) => normalizeText(p.nome) === normalizeText(clean))) return setErrorPerson(T.validacao.duplicado);
            fin.createPerson(clean);
            setNamePerson("");
            setErrorPerson("");
          }}
        >
          <div className="campo-grupo" style={{ flex: 1 }}>
            <input className="campo" value={namePerson} maxLength={40} placeholder={T.financas.novaPessoa} aria-label={T.financas.novaPessoa} aria-invalid={!!errorPerson} onChange={(e) => { setNamePerson(e.target.value); setErrorPerson(""); }} />
            {errorPerson && <span className="campo-erro">{errorPerson}</span>}
          </div>
          <Button type="submit" soIcone icone={<Plus size={14} />} aria-label={T.financas.novaPessoa} />
        </form>
        {fin.pessoas.length === 0 ? <p className="texto-3">{T.financas.semPessoas}</p> : (
          <div className="lista">
            {fin.pessoas.map((p) => {
              const s = balances.get(p.id) ?? 0;
              return (
                <div key={p.id} className="lista-item">
                  <span className="barra-avatar">{p.nome.slice(0, 1).toUpperCase()}</span>
                  <div className="lista-item-principal">
                    <span className="lista-item-titulo">{p.nome}</span>
                    <span className="lista-item-sub privado" style={{ color: s > 0 ? "var(--sucesso)" : s < 0 ? "var(--erro)" : undefined }}>
                      {s > 0 ? T.financas.teDeve(p.nome, formatMoney(s)) : s < 0 ? T.financas.voceDeve(p.nome, formatMoney(-s)) : T.financas.quites(p.nome)}
                    </span>
                  </div>
                  {s !== 0 && <Button pequeno onClick={() => { setSettlement({ pessoaId: p.id, saldo: s }); setValueSettlement(centsToField(Math.abs(s))); setAccountSettlement(fin.contas[0]?.id ?? ""); setErrors({}); }}>{T.financas.registrarAcerto}</Button>}
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <Card className="col-8" titulo={T.financas.abas.divisao} icone={<Scale size={16} />} acoes={<Button pequeno variante="primario" icone={<Plus size={13} />} disabled={fin.pessoas.length === 0} title={fin.pessoas.length === 0 ? T.financas.crieAPessoa : undefined} onClick={() => { setDescription(""); setTotal(""); setPayer(EU); setParticipants([EU, ...fin.pessoas.map((p) => p.id)]); setModeDiv("iguais"); setParts({}); setAccountId(fin.contas[0]?.id ?? ""); setCategoryDiv({ id: "", nova: "" }); setErrors({}); setNew(true); }}>{T.financas.novaDivisao}</Button>}>
        {simplification.length > 0 && (
          <div className="coluna" style={{ gap: 4, marginBottom: 12 }}>
            <span className="rotulo-secao">{T.financas.simplificacao}</span>
            {simplification.map((s, i) => <span key={i} className="texto-2 privado">{T.financas.simplificar(nameValue(s.de), nameValue(s.para), formatMoney(s.valor))}</span>)}
          </div>
        )}
        {fin.divisoes.length === 0 ? <Empty titulo={T.financas.semDivisoes} /> : (
          <div className="lista">
            {[...fin.divisoes].sort((a, b) => b.data.localeCompare(a.data)).map((d) => (
              <div key={d.id} className="lista-item">
                <div className="lista-item-principal">
                  <span className="lista-item-titulo">{d.descricao}</span>
                  <span className="lista-item-sub">{T.financas.pagoPor(nameValue(d.pagadorId))} . {d.partes.map((p) => `${nameValue(p.pessoaId)} ${formatMoney(p.valor)}`).join(", ")}</span>
                </div>
                <span className="numero privado">{formatMoney(d.total)}</span>
                <div className="lista-item-acoes">
                  <Button pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={() => { fin.deleteSplit(d.id); notify(T.geral.excluido); }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Modal aberto={newItem} titulo={T.financas.novaDivisao} aoFechar={() => setNew(false)} largo>
        <form className="formulario" onSubmit={saveSplit} noValidate>
          <div className="formulario-linha">
            <Field id="dv-desc" rotulo={T.financas.descricao} obrigatorio erro={errors.descricao}>
              <input id="dv-desc" className="campo" value={description} maxLength={120} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <FieldMoney id="dv-total" rotulo={T.financas.valor} valor={total} aoMudar={setTotal} erro={errors.total} obrigatorio />
          </div>
          <div className="formulario-linha">
            <Field id="dv-pag" rotulo={T.financas.quemPagou}>
              <select id="dv-pag" className="seletor" value={payer} onChange={(e) => setPayer(e.target.value)}>
                <option value={EU}>{T.financas.eu}</option>
                {fin.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </Field>
            {payer === EU && (
              <Field id="dv-conta" rotulo={T.financas.conta} erro={errors.conta}>
                <select id="dv-conta" className="seletor" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {fin.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </Field>
            )}
            <Field id="dv-cat" rotulo={T.financas.categoria} obrigatorio erro={errors.categoria}>
              <CategoryPicker
                id="dv-cat"
                tipo="despesa"
                categoriaId={categoryDiv.id || suggestedDiv || ""}
                novaCategoria={categoryDiv.nova}
                invalido={!!errors.categoria}
                aoMudar={(id, newItem) => { setCategoryDiv({ id, nova: newItem }); setErrors((e) => ({ ...e, categoria: "" })); }}
              />
            </Field>
          </div>
          <div className="campo-grupo">
            <span className="campo-rotulo">{T.financas.modoDivisao}</span>
            <Segmented rotulo={T.financas.modoDivisao} valor={modeDiv} aoMudar={setModeDiv} opcoes={[{ valor: "iguais", rotulo: T.financas.iguais }, { valor: "valor", rotulo: T.financas.porValor }, { valor: "porcentagem", rotulo: T.financas.porPorcentagem }]} />
          </div>
          <div className="campo-grupo">
            <span className="campo-rotulo">{T.financas.participantes}</span>
            {[EU, ...fin.pessoas.map((p) => p.id)].map((id) => (
              <div key={id} className="linha" style={{ minHeight: 36 }}>
                <BoxMark marcada={participants.includes(id)} rotulo={nameValue(id)} aoMudar={(v) => setParticipants((ps) => (v ? [...ps, id] : ps.filter((x) => x !== id)))} />
                <span style={{ flex: 1 }}>{nameValue(id)}</span>
                {modeDiv !== "iguais" && participants.includes(id) && (
                  <div className="campo-prefixo" style={{ width: 140 }}>
                    <span>{modeDiv === "valor" ? "R$" : "%"}</span>
                    <input className="campo" inputMode="decimal" value={parts[id] ?? ""} aria-label={nameValue(id)} onChange={(e) => setParts({ ...parts, [id]: e.target.value.replace(/[^\d.,]/g, "") })} />
                  </div>
                )}
              </div>
            ))}
            {(errors.participantes || errors.partes) && <span className="campo-erro">{errors.participantes || errors.partes}</span>}
          </div>
          <NoticeBanner>{T.financas.divisaoOrcamento}</NoticeBanner>
          <div className="formulario-acoes">
            <Button onClick={() => setNew(false)}>{T.geral.cancelar}</Button>
            <Button type="submit" variante="primario">{T.geral.salvar}</Button>
          </div>
        </form>
      </Modal>
      <Modal aberto={!!settlement} titulo={T.financas.registrarAcerto} aoFechar={() => setSettlement(null)}>
        {settlement && (
          <form
            className="formulario"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const v = validateValue(valueSettlement);
              if (v.erro || v.valor == null) return setErrors({ acerto: v.erro ?? T.validacao.valorInvalido });
              if (v.valor > Math.abs(settlement.saldo)) return setErrors({ acerto: T.financas.acertoMaior });
              fin.registerSettlement({ pessoaId: settlement.pessoaId, valor: settlement.saldo > 0 ? v.valor : -v.valor, data: todayISO(), contaId: accountSettlement || undefined }, settlement.saldo);
              setSettlement(null);
              void playSound("approve");
            }}
          >
            <FieldMoney id="ac-valor" rotulo={T.financas.valor} valor={valueSettlement} aoMudar={setValueSettlement} erro={errors.acerto} obrigatorio />
            <Field id="ac-conta" rotulo={T.financas.contaAcerto}>
              <select id="ac-conta" className="seletor" value={accountSettlement} onChange={(e) => setAccountSettlement(e.target.value)}>
                <option value="">{T.financas.semLancamento}</option>
                {fin.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Field>
            <div className="formulario-acoes">
              <Button onClick={() => setSettlement(null)}>{T.geral.cancelar}</Button>
              <Button type="submit" variante="primario">{T.geral.confirmar}</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function Purchases({ mes: month }: { mes: string }) {
  const fin = useFinances();
  const [listId, setListId] = useState(fin.listas[0]?.id ?? "");
  const [newList, setNewList] = useState("");
  const [item, setItem] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [finishing, setFinishing] = useState(false);
  const [totalReal, setTotalReal] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryPurchase, setCategoryPurchase] = useState({ id: "", nova: "" });
  const list = fin.listas.find((l) => l.id === listId) ?? fin.listas[0];
  const estimated = list ? sumBy(list.itens, (i) => i.precoEstimado * i.quantidade) : 0;
  const marked = list ? list.itens.filter((i) => i.marcado) : [];
  const category = fin.categorias.find((c) => c.id === list?.categoriaId);
  const expenseCategory = category ? expenseByCategory(fin, month).get(category.id) ?? 0 : 0;
  const frequent = Object.entries(fin.precos).filter(([k]) => !list?.itens.some((i) => normalizeText(i.nome) === k)).slice(0, 8);

  return (
    <div className="duas-colunas">
      <Card>
        <form
          className="linha"
          style={{ marginBottom: 12, alignItems: "flex-start" }}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!newList.trim()) return setErrors({ lista: T.validacao.obrigatorio });
            const l = fin.createList(newList, fin.categorias.find((c) => normalizeText(c.nome) === "mercado")?.id);
            setListId(l.id);
            setNewList("");
            setErrors({});
          }}
        >
          <div className="campo-grupo" style={{ flex: 1 }}>
            <input className="campo" value={newList} maxLength={40} placeholder={T.financas.nomeLista} aria-label={T.financas.nomeLista} aria-invalid={!!errors.lista} onChange={(e) => setNewList(e.target.value)} />
            {errors.lista && <span className="campo-erro">{errors.lista}</span>}
          </div>
          <Button type="submit" soIcone icone={<Plus size={14} />} aria-label={T.financas.novaLista} />
        </form>
        <div className="lista-lateral">
          {fin.listas.map((l) => (
            <button key={l.id} type="button" className="lista-lateral-item" aria-current={l.id === list?.id} onClick={() => setListId(l.id)}>
              <ShoppingCart size={13} />
              <span className="cortar">{l.nome}</span>
              <span className="texto-3 empurrar numero">{l.itens.length}</span>
            </button>
          ))}
        </div>
      </Card>
      {!list ? <Card><Empty icone={<ShoppingCart size={28} />} titulo={T.financas.semListas} /></Card> : (
        <Card
          titulo={list.nome}
          icone={<ShoppingCart size={16} />}
          acoes={
            <>
              <select className="seletor" style={{ width: 160, height: 28 }} aria-label={T.financas.categoria} value={list.categoriaId ?? ""} onChange={(e) => useFinances.setState((s) => ({ listas: s.listas.map((x) => (x.id === list.id ? { ...x, categoriaId: e.target.value || undefined } : x)) }))}>
                <option value="">{T.financas.semCategoria}</option>
                {fin.categorias.filter((c) => c.tipo === "despesa").map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <Button pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={() => fin.deleteList(list.id)} />
            </>
          }
        >
          <form
            className="formulario-linha"
            style={{ alignItems: "end", marginBottom: 12, gridTemplateColumns: "2fr 80px 1fr auto" }}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const newItems: Record<string, string> = {};
              if (!item.trim()) newItems.item = T.validacao.obrigatorio;
              const q = Number(quantity);
              if (!Number.isInteger(q) || q < 1 || q > 999) newItems.qtd = T.validacao.entre(1, 999);
              const p = price ? readValueAtCents(price) : 0;
              if (p == null) newItems.preco = T.validacao.valorInvalido;
              setErrors(newItems);
              if (Object.keys(newItems).length) return;
              fin.addItems(list.id, [{ nome: item, quantidade: q, precoEstimado: p ?? 0 }]);
              setItem("");
              setQuantity("1");
              setPrice("");
            }}
          >
            <Field id="lc-item" rotulo={T.financas.novoItem} erro={errors.item}>
              <input id="lc-item" className="campo" value={item} maxLength={60} onChange={(e) => setItem(e.target.value)} />
            </Field>
            <Field id="lc-qtd" rotulo={T.financas.quantidade} erro={errors.qtd}>
              <input id="lc-qtd" className="campo" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))} />
            </Field>
            <FieldMoney id="lc-preco" rotulo={T.financas.preco} valor={price} aoMudar={setPrice} erro={errors.preco} />
            <Button type="submit" icone={<Plus size={14} />}>{T.geral.adicionar}</Button>
          </form>
          {frequent.length > 0 && (
            <div className="coluna" style={{ gap: 4, marginBottom: 12 }}>
              <span className="rotulo-secao">{T.financas.sugestoes}</span>
              <div className="pilulas">
                {frequent.map(([k, h]) => (
                  <button key={k} type="button" className="pilula" onClick={() => fin.addItems(list.id, [{ nome: k[0].toUpperCase() + k.slice(1), quantidade: 1, precoEstimado: h[h.length - 1].preco }])}>
                    <Plus size={11} />{k} . {T.financas.ultimoPreco(formatMoney(h[h.length - 1].preco))}
                  </button>
                ))}
              </div>
            </div>
          )}
          {list.itens.length === 0 ? <p className="texto-3">{T.financas.semItens}</p> : (
            <div className="lista">
              {list.itens.map((i) => {
                const historyValue = fin.precos[normalizeText(i.nome)];
                return (
                  <div key={i.id} className="lista-item">
                    <BoxMark marcada={i.marcado} rotulo={i.nome} aoMudar={(v) => fin.updateItem(list.id, i.id, { marcado: v })} />
                    <div className="lista-item-principal">
                      <span className={`lista-item-titulo ${i.marcado ? "riscado" : ""}`}>{i.quantidade} x {i.nome}</span>
                      {historyValue && <span className="lista-item-sub">{T.financas.ultimoPreco(formatMoney(historyValue[historyValue.length - 1].preco))}</span>}
                    </div>
                    <span className="numero privado texto-2">{i.precoEstimado ? formatMoney(i.precoEstimado * i.quantidade) : ""}</span>
                    <div className="lista-item-acoes"><Button pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={() => fin.removeItem(list.id, i.id)} /></div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="linha-entre" style={{ marginTop: 16, flexWrap: "wrap" }}>
            <div className="coluna" style={{ gap: 0 }}>
              <span className="texto-2">{T.financas.totalEstimado}: <b className="privado">{formatMoney(estimated)}</b></span>
              {category && category.orcamento > 0 && <span className="texto-3" style={{ fontSize: 12 }}>{T.financas.sobraOrcamento(formatMoney(category.orcamento - expenseCategory))}</span>}
            </div>
            <Button variante="primario" disabled={marked.length === 0 || fin.contas.length === 0} onClick={() => { setTotalReal(centsToField(sumBy(marked, (i) => i.precoEstimado * i.quantidade))); setAccountId(fin.contas[0]?.id ?? ""); setCategoryPurchase({ id: list.categoriaId ?? "", nova: "" }); setErrors({}); setFinishing(true); }}>
              {T.financas.finalizarCompra} ({marked.length})
            </Button>
          </div>
        </Card>
      )}
      <Modal aberto={finishing} titulo={T.financas.finalizarCompra} aoFechar={() => setFinishing(false)}>
        <form
          className="formulario"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const v = validateValue(totalReal);
            const categoryValid = fin.categorias.some((c) => c.id === categoryPurchase.id && c.tipo === "despesa");
            const newItems: Record<string, string> = {};
            if (v.erro || v.valor == null) newItems.total = v.erro ?? T.validacao.valorInvalido;
            if (!categoryValid && !categoryPurchase.nova.trim()) newItems.categoria = T.financas.categoriaObrigatoria;
            setErrors(newItems);
            if (Object.keys(newItems).length || v.valor == null || !list) return;
            const categoryId = categoryValid ? categoryPurchase.id : fin.getOrCreateCategory(categoryPurchase.nova, "despesa").id;
            if (!list.categoriaId) useFinances.setState((s) => ({ listas: s.listas.map((x) => (x.id === list.id ? { ...x, categoriaId: categoryId } : x)) }));
            fin.finishPurchase(list.id, accountId, v.valor, categoryId);
            setFinishing(false);
            void useAgents.getState().trabalhar("operador", T.financas.compraDescricao(list.nome), 400);
          }}
        >
          <FieldMoney id="fc-total" rotulo={T.financas.totalReal} valor={totalReal} aoMudar={setTotalReal} erro={errors.total} obrigatorio />
          <Field id="fc-conta" rotulo={T.financas.conta}>
            <select id="fc-conta" className="seletor" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {fin.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Field>
          <Field id="fc-cat" rotulo={T.financas.categoria} obrigatorio erro={errors.categoria}>
            <CategoryPicker
              id="fc-cat"
              tipo="despesa"
              categoriaId={categoryPurchase.id}
              novaCategoria={categoryPurchase.nova}
              invalido={!!errors.categoria}
              aoMudar={(id, newItem) => { setCategoryPurchase({ id, nova: newItem }); setErrors((e) => ({ ...e, categoria: "" })); }}
            />
          </Field>
          <div className="formulario-acoes">
            <Button onClick={() => setFinishing(false)}>{T.geral.cancelar}</Button>
            <Button type="submit" variante="primario">{T.geral.confirmar}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Reports({ mes: month, modo: mode }: { mes: string; modo: Mode }) {
  const fin = useFinances();
  const [containsValue, setContains] = useState("");
  const [categoryRule, setCategoryRule] = useState("");
  const [error, setError] = useState("");
  const months = Array.from({ length: 6 }, (_, i) => format(addMonths(fromISO(`${month}-01`), i - 5), "yyyy-MM"));
  const payload = months.map((m) => expenseByCategory(fin, m, mode));
  const expenseItems = fin.categorias.filter((c) => c.tipo === "despesa");

  const exportData = () => {
    const header = [T.financas.data, T.financas.tipoConta, T.financas.descricao, T.financas.categoria, T.financas.conta, T.financas.valor].join(";");
    const lines = fin.transacoes
      .slice()
      .sort((a, b) => a.data.localeCompare(b.data))
      .map((t) => [t.data, T.financas.tipos[t.tipo], `"${t.descricao.replace(/"/g, "'")}"`, nameCategory(t.categoriaId, fin.categorias), fin.contas.find((c) => c.id === t.contaId)?.nome ?? "", centsToField(t.tipo === "despesa" ? -t.valor : t.valor)].join(";"));
    downloadFile(`niko-transacoes-${todayISO()}.csv`, [header, ...lines].join("\n"), "text/csv");
  };

  return (
    <div className="coluna" style={{ gap: 20 }}>
      <Card titulo={T.financas.relatorioMensal} icone={<BarChart3 size={16} />} acoes={<Button pequeno icone={<Download size={13} />} onClick={exportData}>{T.financas.exportarCsv}</Button>}>
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>{T.financas.categoria}</th>
                {months.map((m) => <th key={m} className="direita" style={{ textTransform: "capitalize" }}>{formatDateString(`${m}-01`, "MMM yy")}</th>)}
              </tr>
            </thead>
            <tbody>
              {expenseItems.map((c) => (
                <tr key={c.id}>
                  <td><span className="linha"><span className="ponto-cor" style={{ background: c.cor }} />{c.nome}</span></td>
                  {payload.map((d, i) => <td key={i} className="direita numero privado">{d.get(c.id) ? formatMoney(d.get(c.id)!) : ""}</td>)}
                </tr>
              ))}
              <tr>
                <td><b>{T.financas.total}</b></td>
                {payload.map((d, i) => <td key={i} className="direita numero privado"><b>{formatMoney(sumBy([...d.values()], (v) => v))}</b></td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
      <Card titulo={T.financas.regras} icone={<ListFilter size={16} />}>
        <form
          className="formulario-linha"
          style={{ alignItems: "end", marginBottom: 12 }}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!containsValue.trim() || !categoryRule) return setError(T.validacao.obrigatorio);
            fin.createRule(containsValue, categoryRule);
            setContains("");
            setError("");
          }}
        >
          <Field id="rg-contem" rotulo={T.financas.regraContem} erro={error}>
            <input id="rg-contem" className="campo" value={containsValue} maxLength={40} placeholder="IFOOD" onChange={(e) => setContains(e.target.value)} />
          </Field>
          <Field id="rg-cat" rotulo={T.financas.categoria}>
            <select id="rg-cat" className="seletor" value={categoryRule} onChange={(e) => setCategoryRule(e.target.value)}>
              <option value="">{T.financas.escolha}</option>
              {fin.categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Field>
          <Button type="submit" icone={<Plus size={14} />}>{T.financas.novaRegra}</Button>
        </form>
        <div className="lista">
          {fin.regras.map((r) => (
            <div key={r.id} className="lista-item">
              <code>{r.contem}</code>
              <span className="lista-item-principal">{nameCategory(r.categoriaId, fin.categorias)}</span>
              <Button pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={() => fin.deleteRule(r.id)} />
            </div>
          ))}
        </div>
        <LineToggle rotulo={T.financas.receberStripe} ligado={useConfig.getState().receberStripe} aoMudar={(v) => useConfig.getState().set({ receberStripe: v })} />
      </Card>
    </div>
  );
}

function FirstSteps({ aoCriarConta: onCreateAccount, aoLancar: onRelease }: { aoCriarConta: () => void; aoLancar: () => void }) {
  const hasAccount = useFinances((s) => s.contas.some((c) => !c.arquivada));
  const hasEntry = useFinances((s) => s.transacoes.some((t) => !t.ajuste));
  if (hasAccount && hasEntry) return null;
  const steps = [
    { feito: hasAccount, titulo: T.financas.passos.conta, texto: T.financas.passos.contaTexto, botao: T.financas.criarConta, acao: onCreateAccount, liberado: true },
    { feito: hasEntry, titulo: T.financas.passos.lancar, texto: T.financas.passos.lancarTexto, botao: T.financas.novaTransacao, acao: onRelease, liberado: hasAccount },
  ];
  return (
    <section className="cartao primeiros-passos" aria-label={T.financas.passos.titulo}>
      <div className="primeiros-passos-topo">
        <b>{T.financas.passos.titulo}</b>
        <span className="texto-2">{T.financas.passos.subtitulo}</span>
      </div>
      <ol className="primeiros-passos-lista">
        {steps.map((p, i) => (
          <li key={p.titulo} className="primeiros-passos-item" data-feito={p.feito || undefined} data-liberado={p.liberado || undefined}>
            <span className="primeiros-passos-numero" aria-hidden="true">{p.feito ? <Check size={13} /> : i + 1}</span>
            <div className="primeiros-passos-textos">
              <span className="primeiros-passos-titulo">{p.titulo}</span>
              <span className="texto-2">{p.texto}</span>
            </div>
            {!p.feito && (
              <Button pequeno variante={p.liberado ? "primario" : "secundario"} disabled={!p.liberado} title={!p.liberado ? T.financas.passos.depoisDaConta : undefined} onClick={p.acao}>
                {p.botao}
              </Button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function Finances() {
  const parameters = useInterface((s) => s.parametros);
  const [tab, setTab] = useState<Tab>((parameters.aba as Tab) || "visao");
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [mode, setMode] = useState<Mode>("competencia");
  const [newItem, setNew] = useState(false);
  const [importData, setImport] = useState(false);
  // Create an account before recording the requested transaction.
  const [accountBefore, setAccountBefore] = useState<"transacao" | "importar" | "conta" | null>(null);
  const fin = useFinances();
  const hasAccount = fin.contas.some((c) => !c.arquivada);

  const newTransaction = () => (useFinances.getState().contas.some((c) => !c.arquivada) ? setNew(true) : setAccountBefore("transacao"));
  const importStatement = () => (useFinances.getState().contas.some((c) => !c.arquivada) ? setImport(true) : setAccountBefore("importar"));

  useEffect(() => {
    if (parameters.aba) setTab(parameters.aba as Tab);
  }, [parameters.aba]);

  useEffect(() => {
    const onNew = (e: Event) => {
      if ((e as CustomEvent).detail === "financas") newTransaction();
    };
    window.addEventListener(EVENT_NEW, onNew);
    return () => window.removeEventListener(EVENT_NEW, onNew);
  }, []);

  const showsMonth = ["visao", "transacoes", "orcamento", "relatorios", "compras"].includes(tab);
  const totalMonth = sumBy(expensesMonth(fin, month, mode), (t) => partUser(t, fin.divisoes));

  return (
    <>
      <TabHeader
        titulo={T.financas.titulo}
        subtitulo={T.financas.subtitulo}
        agente="operador"
        acoes={
          <>
            {!hasAccount && <Button pequeno icone={<Landmark size={13} />} onClick={() => setAccountBefore("conta")}>{T.financas.criarConta}</Button>}
            <Button variante="primario" pequeno icone={<Plus size={13} />} onClick={newTransaction}>{T.financas.novaTransacao}</Button>
            <Button pequeno icone={<Upload size={13} />} onClick={importStatement}>{T.financas.importarExtrato}</Button>
          </>
        }
      />
      <div className="financas-layout">
      <nav className="financas-nav" aria-label={T.financas.titulo}>
        {GROUPS_TAB.map((g) => (
          <div key={g.nome} className="financas-nav-grupo">
            <span className="rotulo-secao">{g.nome}</span>
            {g.abas.map((a) => (
              <button key={a} type="button" className="lista-lateral-item" aria-current={tab === a} onClick={() => setTab(a)}>
                {ICON_TAB[a]}
                <span className="cortar">{T.financas.abas[a]}</span>
              </button>
            ))}
          </div>
        ))}
        <select className="seletor financas-nav-select" value={tab} aria-label={T.financas.titulo} onChange={(e) => setTab(e.target.value as Tab)}>
          {(Object.keys(T.financas.abas) as Tab[]).map((a) => <option key={a} value={a}>{T.financas.abas[a]}</option>)}
        </select>
      </nav>
      <div className="financas-conteudo">
      {showsMonth && (
        <div className="barra-acoes">
          <input type="month" className="campo" style={{ width: 170, height: 32 }} value={month} aria-label={T.financas.periodo} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          <Segmented<Mode> rotulo={T.financas.competencia} valor={mode} aoMudar={setMode} opcoes={[{ valor: "competencia", rotulo: T.financas.competencia }, { valor: "caixa", rotulo: T.financas.caixa }]} />
          <span className="campo-dica">{T.financas.competenciaDica}</span>
          <span className="empurrar texto-2 privado">{T.financas.gastoNoMes(formatMoney(totalMonth))}</span>
        </div>
      )}
      <FirstSteps aoCriarConta={() => setAccountBefore("conta")} aoLancar={newTransaction} />
      {tab === "visao" && <ViewGeneral modo={mode} mes={month} />}
      {tab === "transacoes" && <Card><Transactions mes={month} buscaInicial={parameters.busca} /></Card>}
      {tab === "contas" && <Accounts />}
      {tab === "cartoes" && <Cards />}
      {tab === "orcamento" && (
        <div className="coluna" style={{ gap: 20 }}>
          <Card><Budget mes={month} modo={mode} /></Card>
          <ManageCategories />
        </div>
      )}
      {tab === "recorrentes" && <Recurring />}
      {tab === "economia" && <Savings />}
      {tab === "divisao" && <Split />}
      {tab === "compras" && <Purchases mes={month} />}
      {tab === "relatorios" && <Reports mes={month} modo={mode} />}
      </div>
      </div>
      <FormTransaction aberto={newItem} aoFechar={() => setNew(false)} />
      <Import aberto={importData} aoFechar={() => setImport(false)} />
      <FormAccount
        aberto={accountBefore !== null}
        aviso={accountBefore === "transacao" ? T.financas.contaAntesTransacao : accountBefore === "importar" ? T.financas.contaAntesImportar : undefined}
        aoFechar={() => setAccountBefore(null)}
        aoCriar={() => {
          if (accountBefore === "transacao") setNew(true);
          if (accountBefore === "importar") setImport(true);
        }}
      />
    </>
  );
}
