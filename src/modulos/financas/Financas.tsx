import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { addDays, addMonths, differenceInCalendarDays, format, getDaysInMonth, setDate, startOfMonth } from "date-fns";
import {
  Plus, Trash2, Pencil, Upload, Download, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, ArrowRight, Wallet, CreditCard, PiggyBank, Banknote, Landmark, Repeat,
  ShoppingCart, BarChart3, X, Check, Scale, Tags, Search, ChevronLeft, ChevronRight, Split, Car, House, HeartPulse, Popcorn, Utensils, GraduationCap, Receipt, FileUp,
  type LucideIcon,
} from "lucide-react";
import { CabecalhoAba } from "../../componentes/CabecalhoAba";
import { Botao, Campo, Modal, Segmentado, Vazio, ConfirmarModal, AvisoFaixa, CaixaMarcar, Alternador } from "../../componentes/basicos";
import { Paginacao, usarPaginacao } from "../../componentes/Paginacao";
import {
  useFinancas, saldoDaConta, gastoPorCategoria, receitasDoMes, gastosDoMes, parteDoUsuario, saldosComPessoas, simplificarDividas, dataDeCaixa, EU, CORES_CATEGORIA, geradoAteInicial,
  moedaDaConta, cotacoesDe, valorEmReais, saldoDaContaEmReais, contasEmOutraMoeda,
} from "../../estado/financas";
import { useInterface } from "../../estado/interface";
import { useConfig } from "../../estado/configuracoes";
import { useAgentes } from "../../estado/agentes";
import { T } from "../../textos/textos";
import { formatarDinheiro, lerValorEmCentavos, centavosParaCampo, converter, emReais, formatarCotacao, temCotacao, MOEDAS, SIMBOLO_DA_MOEDA, type Cotacoes } from "../../utilitarios/dinheiro";
import { usarCotacoes } from "./usarCotacoes";
import { dataValida, formatar, hojeISO, paraISO, deISO, formatarData, horarioRelativo } from "../../utilitarios/datas";
import { baixarArquivo, contem, lerArquivoTexto, normalizarTexto, somar } from "../../utilitarios/basicos";
import { detectarAssinaturas, assinaturasComValorNovo, lerCsv, lerOfx } from "../../utilitarios/assinaturas";
import { tocarSom } from "../../ponte/sons";
import { EVENTO_NOVO } from "../../janelas/area-de-trabalho/usarAtalhos";
import { SeletorDeCategoria } from "../../componentes/SeletorDeCategoria";
import { categoriaPelaDescricao } from "../../utilitarios/comandos";
import type { Categoria, Conta, Moeda, Recorrente, TipoConta, TipoTransacao, Transacao } from "../../tipos";

type Aba = keyof typeof T.financas.abas;
type Modo = "competencia" | "caixa";
type EstiloComVariaveis = CSSProperties & Record<`--${string}`, string>;

const GRUPOS_ABA: { nome: string; abas: Aba[] }[] = [
  { nome: T.financas.grupos.visao, abas: ["visao", "relatorios"] },
  { nome: T.financas.grupos.movimento, abas: ["transacoes", "contas", "cartoes"] },
  { nome: T.financas.grupos.planejamento, abas: ["orcamento", "recorrentes", "economia"] },
  { nome: T.financas.grupos.pessoas, abas: ["divisao", "compras"] },
];

const ICONE_CONTA: Record<TipoConta, ReactNode> = {
  corrente: <Landmark size={16} />,
  poupanca: <PiggyBank size={16} />,
  carteira: <Banknote size={16} />,
  cartao: <CreditCard size={16} />,
  investimento: <BarChart3 size={16} />,
};

const ICONE_CATEGORIA: Record<string, LucideIcon> = {
  alimentacao: Utensils,
  mercado: ShoppingCart,
  transporte: Car,
  moradia: House,
  saude: HeartPulse,
  lazer: Popcorn,
  educacao: GraduationCap,
  assinaturas: Repeat,
  salario: Banknote,
};

const CORES = ["#3b6fe0", "#2f9e6b", "#d9922b", "#8a05be", "#e05a8a", "#0ea5a4", "#64748b"];
const CORES_DESTAQUE = ["var(--sucesso)", "var(--destaque)", "var(--info)", "var(--roxo)", "var(--alerta)"];
const COR_OUTRAS = "var(--texto-4)";

function variaveis(v: Record<`--${string}`, string>): EstiloComVariaveis {
  return v as EstiloComVariaveis;
}

function semMoeda(centavos: number) {
  return (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function comSinal(centavos: number, moeda: Moeda = "BRL") {
  return centavos > 0 ? `+${formatarDinheiro(centavos, moeda)}` : formatarDinheiro(centavos, moeda);
}

/** "≈ R$ 64,90" para valores em outra moeda; vazio em reais. */
function textoEquivalente(centavos: number, moeda: Moeda, cotacoes: Cotacoes): string {
  if (moeda === "BRL") return "";
  return temCotacao(moeda, cotacoes) ? T.financas.moedas.equivalente(formatarDinheiro(emReais(centavos, moeda, cotacoes))) : T.financas.moedas.semCotacao;
}

function SeloMoeda({ moeda }: { moeda: Moeda }) {
  if (moeda === "BRL") return null;
  return <span className="fin-selo-moeda" title={T.financas.moedas.nomes[moeda]}>{moeda}</span>;
}

function ValorNaMoeda({ centavos, moeda, sinal = "" }: { centavos: number; moeda: Moeda; sinal?: string }) {
  const cotacoes = useFinancas((s) => s.cotacoes);
  const equivalente = textoEquivalente(centavos, moeda, cotacoesDe({ cotacoes }));
  return (
    <span className="fin-valor-moeda" title={equivalente || undefined}>
      <span>{sinal}{formatarDinheiro(centavos, moeda)}</span>
      {equivalente && <small className="fin-valor-equivalente">{equivalente}</small>}
    </span>
  );
}

function CampoDinheiro({ id, rotulo, valor, aoMudar, erro, obrigatorio, dica, negativo, moeda = "BRL", placeholder = "0,00" }: { id: string; rotulo: string; valor: string; aoMudar: (v: string) => void; erro?: string; obrigatorio?: boolean; dica?: string; negativo?: boolean; moeda?: Moeda; placeholder?: string }) {
  return (
    <Campo id={id} rotulo={rotulo} erro={erro} obrigatorio={obrigatorio} dica={dica}>
      <div className="fin-dinheiro" data-erro={erro ? "sim" : undefined} data-moeda={moeda}>
        <span className="fin-dinheiro-moeda" aria-hidden="true">{SIMBOLO_DA_MOEDA[moeda]}</span>
        <input
          id={id}
          className="fin-dinheiro-campo"
          inputMode="decimal"
          value={valor}
          placeholder={placeholder}
          aria-invalid={!!erro}
          onChange={(e) => aoMudar(e.target.value.replace(negativo ? /[^\d.,-]/g : /[^\d.,]/g, ""))}
        />
      </div>
    </Campo>
  );
}

function ValorDestacado({ rotulo, valor, moeda = "BRL" }: { rotulo: string; valor: number; moeda?: Moeda }) {
  return (
    <div className="campo-grupo">
      <span className="campo-rotulo">{rotulo}</span>
      <div className="fin-dinheiro">
        <span className="fin-dinheiro-moeda" aria-hidden="true">{SIMBOLO_DA_MOEDA[moeda]}</span>
        <span className="fin-dinheiro-campo privado">{semMoeda(valor)}</span>
      </div>
    </div>
  );
}

function SubtituloModal({ children }: { children: ReactNode }) {
  return <p className="fin-modal-sub">{children}</p>;
}

function CabecalhoPainel({ titulo, children }: { titulo: ReactNode; children?: ReactNode }) {
  return (
    <div className="fin-painel-topo">
      <span className="fin-painel-titulo">{titulo}</span>
      {children && <div className="fin-painel-acoes">{children}</div>}
    </div>
  );
}

function CabecalhoBloco({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <header className="secao-cabecalho">
      <span className="secao-titulo">{titulo}</span>
      <span className="tracejado" />
      {children}
    </header>
  );
}

function validarValor(texto: string, permitirZero = false): { valor: number | null; erro?: string } {
  const v = lerValorEmCentavos(texto);
  if (v == null) return { valor: null, erro: texto.trim() ? T.validacao.valorInvalido : T.validacao.obrigatorio };
  if (v < 0 || (!permitirZero && v === 0)) return { valor: null, erro: T.validacao.valorPositivo };
  if (v > 100000000000) return { valor: null, erro: T.validacao.valorInvalido };
  return { valor: v };
}

function nomeCategoria(id: string | undefined, categorias: { id: string; nome: string }[]) {
  return categorias.find((c) => c.id === id)?.nome ?? T.financas.semCategoria;
}

function exportarTransacoes(fin: ReturnType<typeof useFinancas.getState>) {
  const cabecalho = [T.financas.data, T.financas.tipoConta, T.financas.descricao, T.financas.categoria, T.financas.conta, T.financas.valor].join(";");
  const linhas = fin.transacoes
    .slice()
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((t) => [t.data, T.financas.tipos[t.tipo], `"${t.descricao.replace(/"/g, "'")}"`, nomeCategoria(t.categoriaId, fin.categorias), fin.contas.find((c) => c.id === t.contaId)?.nome ?? "", centavosParaCampo(t.tipo === "despesa" ? -t.valor : t.valor)].join(";"));
  baixarArquivo(`niko-transacoes-${hojeISO()}.csv`, [cabecalho, ...linhas].join("\n"), "text/csv");
}

function proximaOcorrencia(r: Pick<Recorrente, "dia" | "frequencia" | "mesAnual">, hoje: Date) {
  const naData = (base: Date) => setDate(base, Math.min(r.dia, getDaysInMonth(base)));
  if (r.frequencia === "anual" && r.mesAnual) {
    const desteAno = naData(new Date(hoje.getFullYear(), r.mesAnual - 1, 1));
    return desteAno < hoje ? naData(new Date(hoje.getFullYear() + 1, r.mesAnual - 1, 1)) : desteAno;
  }
  const desteMes = naData(startOfMonth(hoje));
  return desteMes < hoje ? naData(addMonths(startOfMonth(hoje), 1)) : desteMes;
}

function quandoFalta(dias: number) {
  return dias === 0 ? T.datas.hoje : dias === 1 ? T.datas.amanha : T.datas.emDias(dias);
}

function IconeTransacao({ t, categoria }: { t: Transacao; categoria?: Categoria }) {
  const Icone = t.tipo === "transferencia" ? ArrowLeftRight : (categoria && ICONE_CATEGORIA[normalizarTexto(categoria.nome)]) || (t.tipo === "receita" ? ArrowDownLeft : Receipt);
  const cor = t.tipo === "transferencia" ? "var(--texto-2)" : categoria?.cor ?? "var(--texto-3)";
  return (
    <span className="fin-icone-cat" style={variaveis({ "--cor-cat": cor })} aria-hidden="true">
      <Icone size={15} />
    </span>
  );
}

function FormTransacao({ aberto, aoFechar, editando }: { aberto: boolean; aoFechar: () => void; editando?: Transacao | null }) {
  const fin = useFinancas();
  const contas = fin.contas.filter((c) => !c.arquivada);
  const [tipo, setTipo] = useState<TipoTransacao>("despesa");
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [novaCategoria, setNovaCategoria] = useState("");
  const [contaId, setContaId] = useState("");
  const [destinoId, setDestinoId] = useState("");
  const [data, setData] = useState(hojeISO());
  const [parcelas, setParcelas] = useState("1");
  const [valorDestino, setValorDestino] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!aberto) return;
    setErros({});
    setNovaCategoria("");
    setValorDestino(editando?.valorDestino ? centavosParaCampo(editando.valorDestino) : "");
    if (editando) {
      setTipo(editando.tipo);
      setValor(centavosParaCampo(editando.valor));
      setDescricao(editando.descricao);
      setCategoriaId(editando.categoriaId ?? "");
      setContaId(editando.contaId);
      setDestinoId(editando.contaDestinoId ?? "");
      setData(editando.data);
      setParcelas("1");
    } else {
      setTipo("despesa");
      setValor("");
      setDescricao("");
      setCategoriaId("");
      setContaId(contas[0]?.id ?? "");
      setDestinoId(contas[1]?.id ?? "");
      setData(hojeISO());
      setParcelas("1");
    }
  }, [aberto, editando]);

  const tipoCategoria = tipo === "receita" ? "receita" : "despesa";
  const sugerida = !categoriaId && !novaCategoria && descricao ? fin.categorias.find((c) => c.id === fin.categorizar(descricao) && c.tipo === tipoCategoria)?.id : undefined;
  const precisaCategoria = tipo !== "transferencia" && !editando?.ajuste;
  const cotacoes = cotacoesDe(fin);
  const moeda = moedaDaConta(contas, contaId);
  const moedaDestino = moedaDaConta(contas, destinoId);
  const entreMoedas = tipo === "transferencia" && !!destinoId && moeda !== moedaDestino;
  const valorDigitado = lerValorEmCentavos(valor) ?? 0;
  const destinoSugerido = entreMoedas && valorDigitado > 0 ? converter(valorDigitado, moeda, moedaDestino, cotacoes) : 0;
  const equivalente = valorDigitado > 0 ? textoEquivalente(valorDigitado, moeda, cotacoes) : "";

  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    const novos: Record<string, string> = {};
    const v = validarValor(valor);
    if (v.erro) novos.valor = v.erro;
    let destinoFinal: number | undefined;
    if (entreMoedas) {
      if (valorDestino.trim()) {
        const d = validarValor(valorDestino);
        if (d.erro) novos.valorDestino = d.erro;
        else destinoFinal = d.valor ?? undefined;
      } else if (destinoSugerido > 0) destinoFinal = destinoSugerido;
      else novos.valorDestino = T.financas.moedas.informeRecebido;
    }
    if (!descricao.trim()) novos.descricao = T.validacao.obrigatorio;
    if (!contaId) novos.conta = T.validacao.contaObrigatoria;
    if (tipo === "transferencia" && (!destinoId || destinoId === contaId)) novos.destino = T.validacao.contasIguais;
    if (!dataValida(data)) novos.data = T.validacao.dataInvalida;
    const n = Number(parcelas);
    if (!Number.isInteger(n) || n < 1 || n > 48) novos.parcelas = T.validacao.entre(1, 48);
    if (!editando && tipo === "despesa" && v.valor != null && v.valor < n) novos.parcelas = T.validacao.parcelasSemValor;
    const categoriaValida = fin.categorias.some((c) => c.id === (categoriaId || sugerida) && c.tipo === tipoCategoria);
    if (precisaCategoria && !categoriaValida && !novaCategoria.trim()) novos.categoria = T.financas.categoriaObrigatoria;
    setErros(novos);
    if (Object.keys(novos).length || v.valor == null) return;
    const categoriaFinal = !precisaCategoria ? undefined : categoriaValida ? categoriaId || sugerida : fin.obterOuCriarCategoria(novaCategoria, tipoCategoria).id;
    const dados = {
      tipo,
      valor: v.valor,
      descricao: descricao.trim(),
      categoriaId: categoriaFinal,
      contaId,
      contaDestinoId: tipo === "transferencia" ? destinoId : undefined,
      valorDestino: destinoFinal,
      data,
    };
    if (editando) fin.atualizarTransacao(editando.id, dados);
    else {
      fin.lancar({ ...dados, parcelas: tipo === "despesa" ? n : 1 });
      void useAgentes.getState().trabalhar("operador", `${T.financas.tipos[tipo]}: ${dados.descricao}`, 400);
    }
    aoFechar();
  };

  if (contas.length === 0)
    return (
      <Modal aberto={aberto} titulo={T.financas.novaTransacao} aoFechar={aoFechar}>
        <Vazio icone={<Landmark size={28} />} titulo={T.financas.semContas} texto={T.financas.crieContaAntes} />
      </Modal>
    );

  return (
    <Modal aberto={aberto} titulo={editando ? T.geral.editar : T.financas.novaTransacao} aoFechar={aoFechar}>
      <form className="formulario fin-form" onSubmit={salvar} noValidate>
        <Segmentado<TipoTransacao>
          rotulo={T.financas.tipoConta}
          valor={tipo}
          aoMudar={(t) => { setTipo(t); setCategoriaId(""); setNovaCategoria(""); }}
          opcoes={[
            { valor: "despesa", rotulo: T.financas.tipos.despesa, icone: <ArrowUpRight size={13} /> },
            { valor: "receita", rotulo: T.financas.tipos.receita, icone: <ArrowDownLeft size={13} /> },
            { valor: "transferencia", rotulo: T.financas.tipos.transferencia, icone: <ArrowLeftRight size={13} /> },
          ]}
        />
        <CampoDinheiro id="t-valor" rotulo={T.financas.valor} valor={valor} aoMudar={setValor} erro={erros.valor} obrigatorio moeda={moeda} dica={equivalente || undefined} />
        <Campo id="t-desc" rotulo={T.financas.descricao} obrigatorio erro={erros.descricao}>
          <input id="t-desc" className="campo" value={descricao} maxLength={120} aria-invalid={!!erros.descricao} onChange={(e) => setDescricao(e.target.value)} />
        </Campo>
        <div className="formulario-linha fin-duas">
          {tipo === "transferencia" ? (
            <>
              <Campo id="t-conta" rotulo={T.financas.contaOrigem} obrigatorio erro={erros.conta}>
                <select id="t-conta" className="seletor" value={contaId} onChange={(e) => setContaId(e.target.value)}>
                  {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </Campo>
              <Campo id="t-destino" rotulo={T.financas.contaDestino} obrigatorio erro={erros.destino}>
                <select id="t-destino" className="seletor" value={destinoId} aria-invalid={!!erros.destino} onChange={(e) => setDestinoId(e.target.value)}>
                  {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </Campo>
            </>
          ) : (
            <>
              <Campo id="t-cat" rotulo={T.financas.categoria} obrigatorio={precisaCategoria} erro={erros.categoria} dica={sugerida ? T.financas.sugerida(fin.categorias.find((c) => c.id === sugerida)?.nome ?? "") : undefined}>
                <SeletorDeCategoria
                  id="t-cat"
                  tipo={tipoCategoria}
                  categoriaId={categoriaId || sugerida || ""}
                  novaCategoria={novaCategoria}
                  invalido={!!erros.categoria}
                  aoMudar={(id, nova) => { setCategoriaId(id); setNovaCategoria(nova); setErros((e) => ({ ...e, categoria: "" })); }}
                />
              </Campo>
              <Campo id="t-conta" rotulo={T.financas.conta} obrigatorio erro={erros.conta}>
                <select id="t-conta" className="seletor" value={contaId} onChange={(e) => setContaId(e.target.value)}>
                  {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </Campo>
            </>
          )}
        </div>
        <div className="formulario-linha fin-duas">
          <Campo id="t-data" rotulo={T.financas.data} obrigatorio erro={erros.data}>
            <input id="t-data" type="date" className="campo" value={data} aria-invalid={!!erros.data} onChange={(e) => setData(e.target.value)} />
          </Campo>
          {tipo === "despesa" && !editando && (
            <Campo id="t-parc" rotulo={T.financas.parcelas} erro={erros.parcelas} dica={T.financas.parcelasDica}>
              <input id="t-parc" className="campo" inputMode="numeric" value={parcelas} aria-invalid={!!erros.parcelas} onChange={(e) => setParcelas(e.target.value.replace(/\D/g, ""))} />
            </Campo>
          )}
        </div>
        {entreMoedas && (
          <CampoDinheiro
            id="t-valor-destino"
            rotulo={T.financas.moedas.valorRecebido(T.financas.moedas.nomes[moedaDestino])}
            valor={valorDestino}
            aoMudar={setValorDestino}
            erro={erros.valorDestino}
            moeda={moedaDestino}
            placeholder={destinoSugerido > 0 ? semMoeda(destinoSugerido) : "0,00"}
            dica={destinoSugerido > 0 ? T.financas.moedas.recebidoDica(formatarCotacao(converter(10000, moeda, moedaDestino, cotacoes) / 10000), SIMBOLO_DA_MOEDA[moeda], SIMBOLO_DA_MOEDA[moedaDestino]) : T.financas.moedas.semCotacao}
          />
        )}
        {tipo === "transferencia" && <AvisoFaixa>{T.financas.cartaoSemDobro}</AvisoFaixa>}
        <div className="formulario-acoes">
          <Botao onClick={aoFechar}>{T.geral.cancelar}</Botao>
          <Botao type="submit" variante="primario">{T.geral.salvar}</Botao>
        </div>
      </form>
    </Modal>
  );
}

function LinhaTransacao({ t, aoEditar, comData }: { t: Transacao; aoEditar: () => void; comData?: boolean }) {
  const fin = useFinancas();
  const avisar = useInterface((s) => s.avisar);
  const categoria = fin.categorias.find((c) => c.id === t.categoriaId);
  const conta = fin.contas.find((c) => c.id === t.contaId);
  const sinal = t.tipo === "receita" ? "+" : t.tipo === "despesa" ? "-" : "";
  const parcela = t.parcela && <span className="fin-chip">{t.parcela.numero}/{t.parcela.total}</span>;
  return (
    <div className="fin-transacao" data-com-data={comData ? "sim" : undefined}>
      {comData ? <span className="fin-transacao-data">{formatar(t.data, "dd/MM")}</span> : <IconeTransacao t={t} categoria={categoria} />}
      <span className="fin-transacao-textos">
        <span className="fin-transacao-desc">
          <span className="cortar">{t.descricao}</span>
          {comData && parcela}
        </span>
        {!comData && (
          <span className="fin-transacao-sub">
            {t.tipo === "transferencia" ? (
              <span className="fin-transacao-rota">
                {conta?.nome}
                <ArrowRight size={11} aria-hidden="true" />
                {fin.contas.find((c) => c.id === t.contaDestinoId)?.nome}
              </span>
            ) : (
              <>
                <span>{conta?.nome ?? ""}</span>
                <span className="fin-separador" aria-hidden="true" />
                <span>{nomeCategoria(t.categoriaId, fin.categorias)}</span>
              </>
            )}
            {parcela}
            {t.divisaoId && <span className="fin-chip">{T.financas.dividida}</span>}
          </span>
        )}
      </span>
      <span className="fin-transacao-valor numero privado" data-tipo={t.tipo}>
        <ValorNaMoeda centavos={t.valor} moeda={moedaDaConta(fin.contas, t.contaId)} sinal={sinal} />
      </span>
      <span className="fin-acoes-ocultas">
        <Botao pequeno soIcone variante="fantasma" icone={<Pencil size={13} />} aria-label={T.geral.editar} onClick={aoEditar} />
        <Botao
          pequeno
          soIcone
          variante="fantasma"
          icone={<Trash2 size={13} />}
          aria-label={T.geral.excluir}
          onClick={() => {
            const removidas = fin.excluirTransacao(t.id);
            if (removidas.length) avisar(removidas.length > 1 ? T.financas.parcelasExcluidas(removidas.length) : T.geral.excluido, () => fin.restaurarTransacoes(removidas));
          }}
        />
      </span>
    </div>
  );
}

function Importar({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const fin = useFinancas();
  const avisar = useInterface((s) => s.avisar);
  const [contaId, setContaId] = useState("");
  const [previa, setPrevia] = useState<{ linhas: { data: string; descricao: string; valor: number }[]; invalidas: number } | null>(null);
  const [erro, setErro] = useState("");
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [escolhas, setEscolhas] = useState<Record<number, string>>({});
  const [padrao, setPadrao] = useState<Record<"despesa" | "receita", { id: string; nova: string }>>({ despesa: { id: "", nova: "" }, receita: { id: "", nova: "" } });
  const arquivo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (aberto) {
      fin.garantirCategorias();
      setPrevia(null);
      setErro("");
      setNomeArquivo("");
      setEscolhas({});
      setPadrao({ despesa: { id: "", nova: "" }, receita: { id: "", nova: "" } });
      setContaId(fin.contas[0]?.id ?? "");
    }
  }, [aberto]);

  const tipoDaLinha = (valor: number) => (valor < 0 ? "despesa" : "receita") as "despesa" | "receita";
  const sugestoes = useMemo(
    () =>
      (previa?.linhas ?? []).map((l) => {
        const tipo = tipoDaLinha(l.valor);
        const doTipo = fin.categorias.filter((c) => c.tipo === tipo);
        const pelaRegra = doTipo.find((c) => c.id === fin.categorizar(l.descricao));
        return (pelaRegra ?? categoriaPelaDescricao(doTipo, l.descricao))?.id ?? "";
      }),
    [previa, fin.categorias, fin.regras],
  );
  const categoriaDaLinha = (i: number) => (fin.categorias.some((c) => c.id === escolhas[i]) ? escolhas[i] : sugestoes[i]) ?? "";
  const tiposSemCategoria = (["despesa", "receita"] as const).filter((tipo) => previa?.linhas.some((l, i) => tipoDaLinha(l.valor) === tipo && !categoriaDaLinha(i)));
  const padraoValido = (tipo: "despesa" | "receita") => fin.categorias.some((c) => c.id === padrao[tipo].id && c.tipo === tipo) || !!padrao[tipo].nova.trim();
  const faltaPadrao = tiposSemCategoria.some((tipo) => !padraoValido(tipo));

  const lerArquivo = async (f: File) => {
    setNomeArquivo(f.name);
    try {
      const texto = await lerArquivoTexto(f, 3 * 1024 * 1024);
      const resultado = /<OFX>|<STMTTRN>/i.test(texto) ? lerOfx(texto) : lerCsv(texto);
      if (resultado.linhas.length === 0) {
        setErro(T.validacao.arquivoInvalido);
        setPrevia(null);
        return;
      }
      setErro("");
      setPrevia(resultado);
    } catch (x) {
      setErro((x as Error).message === "arquivo_grande" ? T.validacao.arquivoGrande : T.validacao.arquivoInvalido);
    }
  };

  return (
    <Modal aberto={aberto} titulo={T.financas.importarExtrato} aoFechar={aoFechar} largo>
      <div className="formulario fin-form">
        <Campo id="i-arquivo" rotulo={T.financas.arquivo} erro={erro}>
          <label className="fin-arquivo" data-escolhido={nomeArquivo ? "sim" : undefined}>
            <FileUp size={18} aria-hidden="true" />
            <span className="cortar">{nomeArquivo || T.financas.escolherArquivo}</span>
            <input
              id="i-arquivo"
              ref={arquivo}
              type="file"
              accept=".ofx,.csv,.txt"
              className="fin-arquivo-campo"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void lerArquivo(f);
              }}
            />
          </label>
        </Campo>
        <Campo id="i-conta" rotulo={T.financas.contaDestino} obrigatorio dica={T.financas.importarDica}>
          <select id="i-conta" className="seletor" value={contaId} onChange={(e) => setContaId(e.target.value)}>
            {fin.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Campo>
        {previa && (
          <>
            <span className="fin-dica">{T.financas.previaImportacao(previa.linhas.length, previa.invalidas)}</span>
            <div className="fin-previa">
              <table className="fin-tabela">
                <tbody>
                  {previa.linhas.slice(0, 50).map((l, i) => (
                    <tr key={i}>
                      <td className="fin-tabela-data">{formatar(l.data, "dd/MM/yyyy")}</td>
                      <td>{l.descricao}</td>
                      <td>
                        <select className="seletor fin-seletor-pequeno" aria-label={T.financas.categoria} value={categoriaDaLinha(i)} onChange={(e) => setEscolhas((x) => ({ ...x, [i]: e.target.value }))}>
                          <option value="">{T.financas.categoriaPadraoOpcao}</option>
                          {fin.categorias.filter((c) => c.tipo === tipoDaLinha(l.valor)).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
                      </td>
                      <td className="fin-tabela-valor numero">{formatarDinheiro(l.valor, moedaDaConta(fin.contas, contaId))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {tiposSemCategoria.length > 0 && (
              <div className="formulario-linha fin-duas">
                {tiposSemCategoria.map((tipo) => (
                  <Campo key={tipo} id={`i-padrao-${tipo}`} rotulo={T.financas.categoriaPadrao(tipo === "despesa" ? T.financas.tipos.despesa : T.financas.tipos.receita)} obrigatorio dica={T.financas.categoriaPadraoDica}>
                    <SeletorDeCategoria
                      id={`i-padrao-${tipo}`}
                      tipo={tipo}
                      categoriaId={padrao[tipo].id}
                      novaCategoria={padrao[tipo].nova}
                      invalido={!padraoValido(tipo)}
                      aoMudar={(id, nova) => setPadrao((p) => ({ ...p, [tipo]: { id, nova } }))}
                    />
                  </Campo>
                ))}
              </div>
            )}
          </>
        )}
        <div className="formulario-acoes">
          <Botao onClick={aoFechar}>{T.geral.cancelar}</Botao>
          <Botao
            variante="primario"
            disabled={!previa || !contaId || faltaPadrao}
            title={faltaPadrao ? T.financas.categoriaObrigatoria : undefined}
            onClick={() => {
              if (!previa || faltaPadrao) return;
              const padraoFinal = (tipo: "despesa" | "receita") =>
                fin.categorias.some((c) => c.id === padrao[tipo].id && c.tipo === tipo) ? padrao[tipo].id : fin.obterOuCriarCategoria(padrao[tipo].nova, tipo).id;
              const finais = Object.fromEntries(tiposSemCategoria.map((tipo) => [tipo, padraoFinal(tipo)]));
              const r = fin.importar(
                previa.linhas.map((l, i) => {
                  const tipo = tipoDaLinha(l.valor);
                  return { tipo, valor: Math.abs(l.valor), descricao: l.descricao, contaId, data: l.data, categoriaId: categoriaDaLinha(i) || finais[tipo] };
                }),
              );
              avisar(T.financas.importados(r.importados, r.duplicados));
              aoFechar();
            }}
          >
            {T.geral.importar}
          </Botao>
        </div>
      </div>
    </Modal>
  );
}

function SeletorMes({ mes, aoMudar }: { mes: string; aoMudar: (m: string) => void }) {
  const campo = useRef<HTMLInputElement>(null);
  const mover = (n: number) => aoMudar(format(addMonths(deISO(`${mes}-01`), n), "yyyy-MM"));
  return (
    <div className="fin-mes">
      <button type="button" className="fin-mes-seta" aria-label={T.financas.mesAnterior} title={T.financas.mesAnterior} onClick={() => mover(-1)}>
        <ChevronLeft size={14} />
      </button>
      <button
        type="button"
        className="fin-mes-rotulo"
        aria-label={T.financas.periodo}
        onClick={() => {
          try {
            campo.current?.showPicker();
          } catch {
            campo.current?.focus();
          }
        }}
      >
        {formatar(`${mes}-01`, "MMMM yyyy")}
      </button>
      <input ref={campo} type="month" className="fin-mes-campo" tabIndex={-1} aria-hidden="true" value={mes} onChange={(e) => e.target.value && aoMudar(e.target.value)} />
      <button type="button" className="fin-mes-seta" aria-label={T.financas.proximoMes} title={T.financas.proximoMes} onClick={() => mover(1)}>
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

function BarraDeCotacao() {
  const { precisa, falhou, buscando, atualizar } = usarCotacoes();
  const cotacoesSalvas = useFinancas((s) => s.cotacoes);
  const definirCotacoes = useFinancas((s) => s.definirCotacoes);
  const contas = useFinancas((s) => s.contas);
  const moedas = useMemo(() => contasEmOutraMoeda(contas), [contas]);
  const [editando, setEditando] = useState(false);
  const [campos, setCampos] = useState<Record<"USD" | "EUR", string>>({ USD: "", EUR: "" });
  const [erro, setErro] = useState("");
  if (!precisa) return null;
  const cotacoes = cotacoesDe({ cotacoes: cotacoesSalvas });
  const M = T.financas.moedas;
  const abrir = () => {
    setCampos({ USD: cotacoes.USD ? formatarCotacao(cotacoes.USD) : "", EUR: cotacoes.EUR ? formatarCotacao(cotacoes.EUR) : "" });
    setErro("");
    setEditando(true);
  };
  const salvar = () => {
    const lidas: Partial<Record<"USD" | "EUR", number>> = {};
    for (const m of moedas) {
      if (m === "BRL") continue;
      const n = Number(campos[m].replace(/\./g, "").replace(",", "."));
      if (!Number.isFinite(n) || n <= 0 || n >= 1000) {
        setErro(M.cotacaoInvalida);
        return;
      }
      lidas[m] = n;
    }
    definirCotacoes({ ...lidas, manual: true, atualizadaEm: new Date().toISOString() });
    setEditando(false);
  };
  return (
    <section className="fin-cotacao" data-falhou={falhou && !cotacoes.manual ? "sim" : undefined} aria-label={M.cotacao}>
      <span className="fin-cotacao-rotulo"><Repeat size={13} />{M.cotacao}</span>
      {editando ? (
        <form className="fin-cotacao-form" onSubmit={(e) => { e.preventDefault(); salvar(); }}>
          {moedas.filter((m): m is "USD" | "EUR" => m !== "BRL").map((m) => (
            <label key={m} className="fin-cotacao-campo">
              <span>{SIMBOLO_DA_MOEDA[m]} 1 = R$</span>
              <input inputMode="decimal" value={campos[m]} aria-label={M.cotacaoDe(M.nomes[m])} onChange={(e) => setCampos({ ...campos, [m]: e.target.value.replace(/[^\d.,]/g, "") })} />
            </label>
          ))}
          <Botao pequeno type="submit" variante="primario">{T.geral.salvar}</Botao>
          <Botao pequeno variante="fantasma" onClick={() => setEditando(false)}>{T.geral.cancelar}</Botao>
          {erro && <span className="campo-erro">{erro}</span>}
        </form>
      ) : (
        <>
          <span className="fin-cotacao-valores">
            {moedas.filter((m): m is "USD" | "EUR" => m !== "BRL").map((m) => (
              <span key={m} className="fin-cotacao-valor">
                <b>{SIMBOLO_DA_MOEDA[m]} 1</b>
                <span>{temCotacao(m, cotacoes) ? `R$ ${formatarCotacao(cotacoes[m])}` : M.semCotacaoCurta}</span>
              </span>
            ))}
          </span>
          <span className="fin-cotacao-estado">
            {buscando ? M.buscando : falhou && !cotacoes.manual ? M.falhou : cotacoes.manual ? M.manual : cotacoes.atualizadaEm ? M.atualizada(horarioRelativo(cotacoes.atualizadaEm)) : ""}
          </span>
          <span className="fin-cotacao-acoes">
            <Botao pequeno variante="fantasma" icone={<Pencil size={12} />} onClick={abrir}>{M.editar}</Botao>
            <Botao pequeno variante="fantasma" disabled={buscando} onClick={() => { if (cotacoes.manual) definirCotacoes({ manual: false }); atualizar(); }}>{cotacoes.manual ? M.voltarAutomatico : M.atualizar}</Botao>
          </span>
        </>
      )}
    </section>
  );
}

function VisaoGeral({ modo, mes }: { modo: Modo; mes: string }) {
  const fin = useFinancas();
  const gastos = gastoPorCategoria(fin, mes, modo);
  const entradas = somar(receitasDoMes(fin, mes), (t) => valorEmReais(t, fin));
  const saidas = somar([...gastos.values()], (v) => v);
  const contasAtivas = fin.contas.filter((c) => !c.arquivada);
  const saldoTotal = somar(contasAtivas, (c) => saldoDaContaEmReais(fin, c.id));
  const aReceber = somar([...saldosComPessoas(fin).values()].filter((v) => v > 0), (v) => v);
  const liquido = entradas - saidas;
  const textoSaldo = formatarDinheiro(saldoTotal);
  const virgula = textoSaldo.lastIndexOf(",");

  const serie = Array.from({ length: 6 }, (_, i) => format(addMonths(deISO(`${mes}-01`), i - 5), "yyyy-MM")).map((m) => ({
    mes: m,
    entradas: somar(receitasDoMes(fin, m), (t) => valorEmReais(t, fin)),
    saidas: somar([...gastoPorCategoria(fin, m, modo).values()], (v) => v),
  }));
  const maximo = Math.max(1, ...serie.flatMap((s) => [s.entradas, s.saidas]));

  const fatias = [...gastos]
    .map(([id, valor]) => {
      const c = fin.categorias.find((x) => x.id === id);
      return { id, nome: c?.nome ?? T.financas.semCategoria, cor: c?.cor ?? COR_OUTRAS, valor };
    })
    .sort((a, b) => b.valor - a.valor);
  const principais = fatias.length > 5 ? [...fatias.slice(0, 4), { id: "outras", nome: T.financas.outrasCategorias, cor: COR_OUTRAS, valor: somar(fatias.slice(4), (f) => f.valor) }] : fatias;
  let acumulado = 0;
  const rosca = principais
    .map((f) => {
      const inicio = acumulado;
      acumulado += saidas ? (f.valor / saidas) * 100 : 0;
      return `${f.cor} ${inicio}% ${acumulado}%`;
    })
    .join(", ");

  const hoje = deISO(hojeISO());
  const proximas = fin.recorrentes
    .filter((r) => r.ativa)
    .map((r) => {
      const data = proximaOcorrencia(r, hoje);
      return { ...r, data, falta: differenceInCalendarDays(data, hoje) };
    })
    .sort((a, b) => a.falta - b.falta)
    .slice(0, 5);

  return (
    <>
      <BarraDeCotacao />
      <section className="fin-hero">
        <div className="fin-hero-celula fin-hero-saldo">
          <span className="rotulo-secao">{T.financas.saldoTotal}</span>
          <span className="fin-hero-numero numero privado">
            {virgula > 0 ? textoSaldo.slice(0, virgula) : textoSaldo}
            {virgula > 0 && <span className="fin-hero-centavos">{textoSaldo.slice(virgula)}</span>}
          </span>
          <span className="fin-hero-variacao privado" data-sinal={liquido < 0 ? "negativo" : "positivo"}>{T.financas.nesteMes(comSinal(liquido))}</span>
        </div>
        <div className="fin-hero-celula">
          <span className="rotulo-secao">{T.financas.entradas}</span>
          <span className="fin-hero-valor numero privado" data-tom="sucesso">{formatarDinheiro(entradas)}</span>
        </div>
        <div className="fin-hero-celula">
          <span className="rotulo-secao">{T.financas.saidas}</span>
          <span className="fin-hero-valor numero privado">{formatarDinheiro(saidas)}</span>
        </div>
        <div className="fin-hero-celula">
          <span className="rotulo-secao">{T.financas.aReceber}</span>
          <span className="fin-hero-valor numero privado">{formatarDinheiro(aReceber)}</span>
        </div>
      </section>

      <section className="bento fin-bento">
        <article className="fin-bloco">
          <CabecalhoBloco titulo={T.financas.porCategoria} />
          {fatias.length === 0 ? (
            <p className="fin-dica">{T.financas.semTransacoes}</p>
          ) : (
            <div className="fin-rosca-area">
              <div className="fin-rosca" style={{ background: `conic-gradient(${rosca})` }} role="img" aria-label={T.financas.porCategoria}>
                <div className="fin-rosca-miolo">
                  <span className="fin-rosca-total numero privado">{formatarDinheiro(saidas)}</span>
                  <span className="fin-rosca-sub">{T.financas.emCategorias(fatias.length)}</span>
                </div>
              </div>
              <ul className="fin-legenda">
                {principais.map((f) => (
                  <li key={f.id} className="fin-legenda-item">
                    <span className="fin-quadrado" style={{ background: f.cor }} />
                    <span className="fin-legenda-nome cortar">{f.nome}</span>
                    <span className="fin-legenda-valor numero privado">{formatarDinheiro(f.valor)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </article>

        <article className="fin-bloco">
          <CabecalhoBloco titulo={T.financas.evolucao}>
            <span className="fin-legenda-barras">
              <span><span className="fin-quadrado-pequeno" data-tom="entradas" />{T.financas.entradas}</span>
              <span><span className="fin-quadrado-pequeno" data-tom="saidas" />{T.financas.saidas}</span>
            </span>
          </CabecalhoBloco>
          <div className="fin-barras">
            {serie.map((s) => (
              <div
                key={s.mes}
                className="fin-barras-coluna privado"
                title={T.financas.detalheMes(formatar(`${s.mes}-01`, "MMM yyyy"), formatarDinheiro(s.entradas), formatarDinheiro(s.saidas))}
              >
                <span className="fin-barra-entrada" style={{ height: `${(s.entradas / maximo) * 100}%` }} />
                <span className="fin-barra-saida" data-acima={s.saidas > s.entradas ? "sim" : undefined} style={{ height: `${(s.saidas / maximo) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="fin-barras-rotulos">
            {serie.map((s) => <span key={s.mes}>{formatar(`${s.mes}-01`, "MMM")}</span>)}
          </div>
        </article>

        <article className="fin-bloco">
          <CabecalhoBloco titulo={T.financas.proximasContas} />
          {proximas.length === 0 ? (
            <p className="fin-dica">{T.financas.semRecorrentes}</p>
          ) : (
            <div className="fin-proximas">
              {proximas.map((r) => (
                <div key={r.id} className="fin-proxima" data-urgente={r.falta <= 3 ? "sim" : undefined}>
                  <span className="fin-proxima-dia">
                    <span className="fin-proxima-numero">{formatarData(r.data, "d")}</span>
                    <span className="fin-proxima-mes">{formatarData(r.data, "MMM")}</span>
                  </span>
                  <span className="fin-proxima-textos">
                    <span className="cortar">{r.descricao}</span>
                    <span className="fin-proxima-quando">{quandoFalta(r.falta)}</span>
                  </span>
                  <span className="fin-proxima-valor numero privado"><ValorNaMoeda centavos={r.valor} moeda={moedaDaConta(fin.contas, r.contaId)} /></span>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>

      {contasAtivas.length > 0 && (
        <section className="fin-contas-faixa">
          {contasAtivas.map((c) => {
            const saldo = saldoDaConta(fin, c.id);
            const uso = c.tipo === "cartao" && c.limite ? Math.max(0, -saldo) / c.limite : 0;
            return (
              <div key={c.id} className="fin-conta-mini" data-cartao={c.tipo === "cartao" ? "sim" : undefined} style={variaveis({ "--cor-conta": c.cor })}>
                <span className="fin-conta-mini-topo">
                  <span className="fin-conta-mini-nome">
                    <span className="fin-ponto" />
                    <span className="cortar">{c.nome}</span>
                  </span>
                  <span className="fin-conta-mini-tipo"><SeloMoeda moeda={moedaDaConta(fin.contas, c.id)} />{T.financas.tiposConta[c.tipo]}</span>
                </span>
                <span className="fin-conta-mini-saldo numero privado" data-negativo={saldo < 0 ? "sim" : undefined}><ValorNaMoeda centavos={saldo} moeda={moedaDaConta(fin.contas, c.id)} /></span>
                {c.tipo === "cartao" && (c.limite || c.vencimentoDia) ? (
                  <div className="fin-conta-mini-cartao">
                    {c.limite ? (
                      <div className="fin-trilho fin-trilho-fino">
                        <span style={{ width: `${Math.min(1, uso) * 100}%` }} />
                      </div>
                    ) : null}
                    <span className="fin-conta-mini-rodape">
                      <span>{c.limite ? T.financas.limiteUsadoPct(Math.round(uso * 100)) : ""}</span>
                      {c.vencimentoDia ? <span>{T.financas.venceDia(c.vencimentoDia)}</span> : null}
                    </span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}

function Transacoes({ mes, buscaInicial, aoImportar }: { mes: string; buscaInicial?: string; aoImportar: () => void }) {
  const fin = useFinancas();
  const [busca, setBusca] = useState(buscaInicial ?? "");
  const [conta, setConta] = useState("");
  const [categoria, setCategoria] = useState("");
  const [tipo, setTipo] = useState<TipoTransacao | "">("");
  const [editando, setEditando] = useState<Transacao | null>(null);
  const lista = fin.transacoes
    .filter((t) => (busca ? contem(t.descricao, busca) : t.data.startsWith(mes)))
    .filter((t) => !conta || t.contaId === conta || t.contaDestinoId === conta)
    .filter((t) => !categoria || t.categoriaId === categoria)
    .filter((t) => !tipo || t.tipo === tipo)
    .sort((a, b) => b.data.localeCompare(a.data) || b.criadaEm.localeCompare(a.criadaEm));
  const paginas = usarPaginacao(lista, 40, `${mes}|${busca}|${conta}|${categoria}|${tipo}`);
  const porDia = paginas.visiveis.reduce<Record<string, Transacao[]>>((acc, t) => ((acc[t.data] ??= []).push(t), acc), {});
  const totalDoDia = (dia: string) => somar(lista.filter((t) => t.data === dia), (t) => (t.tipo === "receita" ? valorEmReais(t, fin) : t.tipo === "despesa" ? -valorEmReais(t, fin) : 0));
  const hoje = hojeISO();
  const ontem = paraISO(addDays(deISO(hoje), -1));
  const rotuloDia = (dia: string) => {
    const base = formatar(dia, "EEEE, d MMM");
    return dia === hoje ? T.financas.diaComPrefixo(T.geral.hoje, base) : dia === ontem ? T.financas.diaComPrefixo(T.geral.ontem, base) : base;
  };

  return (
    <section className="fin-secao">
      <div className="fin-filtros">
        <label className="fin-busca">
          <Search size={13} aria-hidden="true" />
          <input value={busca} maxLength={80} placeholder={T.financas.buscarTransacao} aria-label={T.financas.buscarTransacao} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <select className="seletor fin-filtro" value={conta} aria-label={T.financas.conta} onChange={(e) => setConta(e.target.value)}>
          <option value="">{T.financas.todasContas}</option>
          {fin.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select className="seletor fin-filtro" value={categoria} aria-label={T.financas.categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">{T.financas.todasCategorias}</option>
          {fin.categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select className="seletor fin-filtro" value={tipo} aria-label={T.financas.tipoConta} onChange={(e) => setTipo(e.target.value as TipoTransacao | "")}>
          <option value="">{T.geral.todos}</option>
          {(["despesa", "receita", "transferencia"] as const).map((t) => <option key={t} value={t}>{T.financas.tipos[t]}</option>)}
        </select>
        {(busca || conta || categoria || tipo) && <Botao variante="fantasma" icone={<X size={13} />} onClick={() => { setBusca(""); setConta(""); setCategoria(""); setTipo(""); }}>{T.geral.limpar}</Botao>}
        <span className="fin-espaco" />
        <Botao className="fin-botao-contorno fin-botao-alto" icone={<Upload size={13} />} onClick={aoImportar}>{T.financas.importarExtrato}</Botao>
        <Botao className="fin-botao-contorno fin-botao-alto" icone={<Download size={13} />} onClick={() => exportarTransacoes(useFinancas.getState())}>{T.financas.exportarCsv}</Botao>
      </div>
      <div className="fin-painel">
        {lista.length === 0 ? (
          <Vazio icone={<Wallet size={28} />} titulo={T.financas.semTransacoes} />
        ) : (
          <>
            {Object.entries(porDia).map(([dia, itens]) => {
              const total = totalDoDia(dia);
              return (
                <div key={dia} role="group" aria-label={rotuloDia(dia)}>
                  <div className="fin-dia">
                    <span className="fin-dia-nome">{rotuloDia(dia)}</span>
                    <span className="fin-dia-total numero privado">{comSinal(total)}</span>
                  </div>
                  {itens.map((t) => <LinhaTransacao key={t.id} t={t} aoEditar={() => setEditando(t)} />)}
                </div>
              );
            })}
            <Paginacao {...paginas} />
          </>
        )}
      </div>
      <FormTransacao aberto={!!editando} editando={editando} aoFechar={() => setEditando(null)} />
    </section>
  );
}

function FormConta({ aberto, aoFechar, aoCriar, aviso }: { aberto: boolean; aoFechar: () => void; aoCriar?: (conta: Conta) => void; aviso?: string }) {
  const fin = useFinancas();
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoConta>("corrente");
  const [saldo, setSaldo] = useState("0,00");
  const [fechamento, setFechamento] = useState("3");
  const [vencimento, setVencimento] = useState("10");
  const [limite, setLimite] = useState("");
  const [moeda, setMoeda] = useState<Moeda>("BRL");
  const [erros, setErros] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!aberto) return;
    setNome("");
    setTipo("corrente");
    setSaldo("0,00");
    setLimite("");
    setMoeda("BRL");
    setErros({});
  }, [aberto]);

  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    const novos: Record<string, string> = {};
    if (!nome.trim()) novos.nome = T.validacao.obrigatorio;
    else if (fin.contas.some((c) => normalizarTexto(c.nome) === normalizarTexto(nome))) novos.nome = T.validacao.duplicado;
    const s = lerValorEmCentavos(saldo || "0");
    if (s == null) novos.saldo = T.validacao.valorInvalido;
    const f = Number(fechamento);
    const v = Number(vencimento);
    if (tipo === "cartao") {
      if (!Number.isInteger(f) || f < 1 || f > 28) novos.fechamento = T.validacao.entre(1, 28);
      if (!Number.isInteger(v) || v < 1 || v > 28) novos.vencimento = T.validacao.entre(1, 28);
    }
    const l = limite ? lerValorEmCentavos(limite) : 0;
    if (l == null) novos.limite = T.validacao.valorInvalido;
    setErros(novos);
    if (Object.keys(novos).length) return;
    const conta = fin.criarConta({ nome, tipo, moeda, saldoInicial: tipo === "cartao" ? 0 : s ?? 0, cor: CORES[fin.contas.length % CORES.length], fechamentoDia: tipo === "cartao" ? f : undefined, vencimentoDia: tipo === "cartao" ? v : undefined, limite: tipo === "cartao" ? l ?? 0 : undefined });
    void tocarSom("pop");
    aoFechar();
    aoCriar?.(conta);
  };

  return (
    <Modal aberto={aberto} titulo={T.financas.novaConta} aoFechar={aoFechar}>
      <SubtituloModal>{T.financas.novaContaSub}</SubtituloModal>
      <form className="formulario fin-form" onSubmit={salvar} noValidate>
        {aviso && <AvisoFaixa>{aviso}</AvisoFaixa>}
        <Campo id="c-nome" rotulo={T.financas.nomeConta} obrigatorio erro={erros.nome} dica={T.financas.nomeContaDica}>
          <input id="c-nome" className="campo" autoFocus value={nome} maxLength={60} aria-invalid={!!erros.nome} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        <div className="campo-grupo">
          <span className="campo-rotulo" id="c-tipo">{T.financas.tipoConta}</span>
          <div className="pilulas" role="group" aria-labelledby="c-tipo">
            {(Object.keys(T.financas.tiposConta) as TipoConta[]).map((t) => (
              <button key={t} type="button" className="pilula" aria-pressed={tipo === t} onClick={() => setTipo(t)}>
                {T.financas.tiposConta[t]}
              </button>
            ))}
          </div>
        </div>
        <div className="campo-grupo">
          <span className="campo-rotulo" id="c-moeda">{T.financas.moedas.moeda}</span>
          <div className="fin-moedas" role="radiogroup" aria-labelledby="c-moeda">
            {MOEDAS.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={moeda === m} className="fin-moeda-opcao" onClick={() => setMoeda(m)}>
                <span className="fin-moeda-simbolo">{SIMBOLO_DA_MOEDA[m]}</span>
                <span className="fin-moeda-textos">
                  <b>{T.financas.moedas.nomes[m]}</b>
                  <small>{m}</small>
                </span>
              </button>
            ))}
          </div>
          <span className="campo-dica">{T.financas.moedas.moedaDica}</span>
        </div>
        {tipo === "cartao" ? (
          <>
            <div className="formulario-linha fin-duas">
              <Campo id="c-fech" rotulo={T.financas.fechamento} obrigatorio erro={erros.fechamento}>
                <input id="c-fech" className="campo" inputMode="numeric" value={fechamento} onChange={(e) => setFechamento(e.target.value.replace(/\D/g, ""))} />
              </Campo>
              <Campo id="c-venc" rotulo={T.financas.vencimento} obrigatorio erro={erros.vencimento}>
                <input id="c-venc" className="campo" inputMode="numeric" value={vencimento} onChange={(e) => setVencimento(e.target.value.replace(/\D/g, ""))} />
              </Campo>
            </div>
            <CampoDinheiro id="c-lim" rotulo={T.financas.limite} valor={limite} aoMudar={setLimite} erro={erros.limite} moeda={moeda} />
          </>
        ) : (
          <CampoDinheiro id="c-saldo" rotulo={T.financas.saldoInicial} valor={saldo} aoMudar={setSaldo} erro={erros.saldo} dica={T.financas.saldoInicialDica} moeda={moeda} />
        )}
        <div className="formulario-acoes">
          <Botao onClick={aoFechar}>{T.geral.cancelar}</Botao>
          <Botao type="submit" variante="primario">{T.geral.criar}</Botao>
        </div>
      </form>
    </Modal>
  );
}

function Contas() {
  const fin = useFinancas();
  const [nova, setNova] = useState(false);
  const [ajuste, setAjuste] = useState<Conta | null>(null);
  const [excluir, setExcluir] = useState<Conta | null>(null);
  const [saldoReal, setSaldoReal] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const abrirNova = () => setNova(true);

  return (
    <section className="fin-secao">
      <div className="fin-topo">
        <span className="fin-dica">{T.financas.contasDica}</span>
        <Botao className="fin-botao-suave" icone={<Plus size={13} />} onClick={abrirNova}>{T.financas.novaConta}</Botao>
      </div>
      {fin.contas.length === 0 ? (
        <div className="fin-painel">
          <Vazio icone={<Landmark size={28} />} titulo={T.financas.semContas} acao={<Botao variante="primario" onClick={abrirNova}>{T.financas.novaConta}</Botao>} />
        </div>
      ) : (
        <div className="fin-grade-cartoes">
          {fin.contas.map((c) => {
            const s = saldoDaConta(fin, c.id);
            return (
              <article key={c.id} className="fin-conta" data-cartao={c.tipo === "cartao" ? "sim" : undefined} style={variaveis({ "--cor-conta": c.cor })}>
                <div className="fin-conta-topo">
                  <span className="fin-conta-icone" aria-hidden="true">{ICONE_CONTA[c.tipo]}</span>
                  <span className="fin-conta-nome">
                    <b className="cortar">{c.nome}</b>
                    <span>{T.financas.tiposConta[c.tipo]}<SeloMoeda moeda={moedaDaConta(fin.contas, c.id)} /></span>
                  </span>
                  <Botao pequeno soIcone variante="fantasma" className="fin-botao-discreto" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={() => setExcluir(c)} />
                </div>
                <div className="fin-conta-saldo">
                  <span className="rotulo-secao">{T.financas.saldo}</span>
                  <span className="fin-conta-valor numero privado" data-negativo={s < 0 ? "sim" : undefined}><ValorNaMoeda centavos={s} moeda={moedaDaConta(fin.contas, c.id)} /></span>
                </div>
                <div className="fin-conta-rodape">
                  <Botao pequeno className="fin-botao-contorno" icone={<Scale size={12} />} onClick={() => { setAjuste(c); setSaldoReal(centavosParaCampo(s)); setErros({}); }}>{T.financas.ajustarSaldo}</Botao>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <FormConta aberto={nova} aoFechar={() => setNova(false)} />
      <Modal aberto={!!ajuste} titulo={T.financas.ajustarSaldo} aoFechar={() => setAjuste(null)}>
        {ajuste && <SubtituloModal><span className="privado">{T.financas.ajusteSub(ajuste.nome, formatarDinheiro(saldoDaConta(fin, ajuste.id), moedaDaConta(fin.contas, ajuste.id)))}</span></SubtituloModal>}
        <form
          className="formulario fin-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const v = lerValorEmCentavos(saldoReal.replace(/^-/, ""));
            if (v == null || !ajuste) return setErros({ real: T.validacao.valorInvalido });
            fin.ajustarSaldo(ajuste.id, saldoReal.trim().startsWith("-") ? -v : v);
            setAjuste(null);
          }}
        >
          <CampoDinheiro id="c-real" rotulo={T.financas.saldoReal} valor={saldoReal} aoMudar={setSaldoReal} erro={erros.real} dica={T.financas.ajusteDica} negativo moeda={moedaDaConta(fin.contas, ajuste?.id)} />
          <div className="formulario-acoes">
            <Botao onClick={() => setAjuste(null)}>{T.geral.cancelar}</Botao>
            <Botao type="submit" variante="primario">{T.geral.salvar}</Botao>
          </div>
        </form>
      </Modal>
      <ConfirmarModal aberto={!!excluir} titulo={T.geral.confirmarExclusao} texto={T.financas.excluirConta} aoFechar={() => setExcluir(null)} aoConfirmar={() => excluir && fin.excluirConta(excluir.id)} />
    </section>
  );
}

function Cartoes() {
  const fin = useFinancas();
  const cartoes = fin.contas.filter((c) => c.tipo === "cartao");
  const [pagando, setPagando] = useState<{ cartao: Conta; valor: number; fatura: string } | null>(null);
  const [contaPagamento, setContaPagamento] = useState("");
  const [deslocamento, setDeslocamento] = useState(0);
  const [editando, setEditando] = useState<Transacao | null>(null);
  if (cartoes.length === 0)
    return (
      <div className="fin-painel">
        <Vazio icone={<CreditCard size={28} />} titulo={T.financas.semCartoes} />
      </div>
    );

  const inicio = startOfMonth(deISO(hojeISO()));
  const faturaDo = (c: Conta, desloc: number) => {
    const base = addMonths(inicio, desloc);
    const venc = setDate(base, Math.min(c.vencimentoDia ?? 10, getDaysInMonth(base)));
    const vencISO = paraISO(venc);
    const compras = fin.transacoes.filter((t) => t.contaId === c.id && t.tipo === "despesa" && dataDeCaixa(t, fin.contas) === vencISO);
    return { venc, vencISO, compras, total: somar(compras, (t) => t.valor) };
  };
  const vizinhos = [-3, -2, -1, 0, 1].map((n) => deslocamento + n);

  return (
    <section className="fin-secao">
      <div className="fin-topo fin-topo-esquerda">
        <Botao pequeno icone={<ChevronLeft size={12} />} onClick={() => setDeslocamento((d) => d - 1)}>{T.geral.anterior}</Botao>
        <Botao pequeno onClick={() => setDeslocamento(0)} disabled={deslocamento === 0}>{T.financas.faturaAtual}</Botao>
        <Botao pequeno onClick={() => setDeslocamento((d) => d + 1)}>{T.geral.proximo}<ChevronRight size={12} /></Botao>
      </div>
      {cartoes.map((c) => {
        const atual = faturaDo(c, deslocamento);
        const usado = Math.max(0, -saldoDaConta(fin, c.id));
        const uso = c.limite ? usado / c.limite : 0;
        const nomeFatura = T.financas.faturaDe(formatarData(atual.venc, "MMMM"));
        return (
          <div key={c.id} className="fin-cartao-linha">
            <div className="fin-cartao-lado">
              <div className="fin-cartao-visual" style={variaveis({ "--cor-conta": c.cor })}>
                <span className="fin-cartao-brilho" aria-hidden="true" />
                <span className="fin-cartao-visual-topo">
                  <b className="cortar">{c.nome}</b>
                  <span className="fin-cartao-visual-tipo">{T.financas.credito}</span>
                </span>
                <span className="fin-cartao-visual-rodape">
                  {c.fechamentoDia ? <span>{T.financas.fechaDia(c.fechamentoDia)}</span> : <span />}
                  {c.vencimentoDia ? <span>{T.financas.venceDia(c.vencimentoDia)}</span> : null}
                </span>
              </div>
              {c.limite ? (
                <div className="fin-cartao-limite">
                  <span className="fin-cartao-limite-linha">
                    <span className="texto-3">{T.financas.limiteUsado}</span>
                    <span className="numero privado">{T.financas.deTotal(formatarDinheiro(usado, moedaDaConta(fin.contas, c.id)), formatarDinheiro(c.limite, moedaDaConta(fin.contas, c.id)))}</span>
                  </span>
                  <div className="fin-trilho" data-nivel={uso > 0.9 ? "erro" : uso > 0.7 ? "alerta" : undefined} style={variaveis({ "--cor-conta": c.cor })} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, uso) * 100)} aria-label={T.financas.limiteUsado}>
                    <span style={{ width: `${Math.min(1, uso) * 100}%` }} />
                  </div>
                </div>
              ) : null}
            </div>
            <div className="fin-painel fin-cartao-fatura">
              <div className="fin-fatura-topo">
                <span className="fin-fatura-resumo">
                  <span className="rotulo-secao">{T.financas.faturaRotulo(deslocamento === 0, nomeFatura)}</span>
                  <span className="fin-fatura-total numero privado"><ValorNaMoeda centavos={atual.total} moeda={moedaDaConta(fin.contas, c.id)} /></span>
                  <span className="fin-dica">{T.financas.venceEm(formatar(atual.vencISO, "d 'de' MMM"))}</span>
                  <span className="fin-dica">{T.financas.cartaoSemDobro}</span>
                </span>
                <Botao
                  variante="primario"
                  className="fin-botao-alto"
                  disabled={atual.total === 0}
                  onClick={() => { setPagando({ cartao: c, valor: atual.total, fatura: nomeFatura }); setContaPagamento(fin.contas.find((x) => x.tipo !== "cartao")?.id ?? ""); }}
                >
                  {T.financas.pagarFatura}
                </Botao>
              </div>
              <div className="fin-faturas" role="group" aria-label={T.financas.fatura}>
                {vizinhos.map((d) => {
                  const f = faturaDo(c, d);
                  return (
                    <button key={d} type="button" className="fin-fatura-chip" aria-pressed={d === deslocamento} onClick={() => setDeslocamento(d)}>
                      <span>{formatarData(f.venc, "MMM")}</span>
                      <span className="numero privado">{formatarDinheiro(f.total, moedaDaConta(fin.contas, c.id))}</span>
                    </button>
                  );
                })}
              </div>
              {atual.compras.length === 0 ? <p className="fin-vazio-linha">{T.financas.semTransacoes}</p> : atual.compras.map((t) => <LinhaTransacao key={t.id} t={t} comData aoEditar={() => setEditando(t)} />)}
            </div>
          </div>
        );
      })}
      <FormTransacao aberto={!!editando} editando={editando} aoFechar={() => setEditando(null)} />
      <Modal aberto={!!pagando} titulo={T.financas.pagarFatura} aoFechar={() => setPagando(null)}>
        {pagando && (() => {
          const moedaCartao = moedaDaConta(fin.contas, pagando.cartao.id);
          const moedaPagamento = moedaDaConta(fin.contas, contaPagamento);
          const cotacoes = cotacoesDe(fin);
          const debito = converter(pagando.valor, moedaCartao, moedaPagamento, cotacoes);
          const semCotacao = moedaCartao !== moedaPagamento && debito === 0;
          return (
          <>
            <SubtituloModal>{T.financas.faturaSub(pagando.fatura, pagando.cartao.nome)}</SubtituloModal>
            <div className="formulario fin-form">
              <ValorDestacado rotulo={T.financas.valor} valor={pagando.valor} moeda={moedaCartao} />
              <Campo
                id="pf-conta"
                rotulo={T.financas.pagarCom}
                erro={semCotacao ? T.financas.moedas.semCotacao : undefined}
                dica={moedaCartao !== moedaPagamento && !semCotacao ? T.financas.moedas.pagarConvertido(formatarDinheiro(debito, moedaPagamento), formatarDinheiro(pagando.valor, moedaCartao)) : T.financas.pagarResumo(formatarDinheiro(pagando.valor, moedaCartao), pagando.cartao.nome)}
              >
                <select id="pf-conta" className="seletor" value={contaPagamento} onChange={(e) => setContaPagamento(e.target.value)}>
                  {fin.contas.filter((x) => x.tipo !== "cartao").map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                </select>
              </Campo>
              <div className="formulario-acoes">
                <Botao onClick={() => setPagando(null)}>{T.geral.cancelar}</Botao>
                <Botao
                  variante="primario"
                  disabled={!contaPagamento || semCotacao}
                  onClick={() => {
                    const entreMoedas = moedaCartao !== moedaPagamento;
                    fin.lancar({ tipo: "transferencia", valor: entreMoedas ? debito : pagando.valor, valorDestino: entreMoedas ? pagando.valor : undefined, descricao: T.financas.pagamentoFatura(pagando.cartao.nome), contaId: contaPagamento, contaDestinoId: pagando.cartao.id, data: hojeISO() });
                    setPagando(null);
                    void tocarSom("approve");
                  }}
                >
                  {T.financas.pagarFatura}
                </Botao>
              </div>
            </div>
          </>
          );
        })()}
      </Modal>
    </section>
  );
}

function Orcamento({ mes, modo }: { mes: string; modo: Modo }) {
  const fin = useFinancas();
  const [editando, setEditando] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState("");
  const gastos = gastoPorCategoria(fin, mes, modo);
  const despesas = fin.categorias.filter((c) => c.tipo === "despesa");
  const comLimite = despesas.filter((c) => c.orcamento > 0);
  const gastoComLimite = somar(comLimite, (c) => gastos.get(c.id) ?? 0);
  const limiteTotal = somar(comLimite, (c) => c.orcamento);

  return (
    <section className="fin-painel">
      <CabecalhoPainel titulo={T.financas.limitePorCategoria}>
        {limiteTotal > 0 && <span className="fin-painel-extra numero privado">{T.financas.deTotal(formatarDinheiro(gastoComLimite), formatarDinheiro(limiteTotal))}</span>}
      </CabecalhoPainel>
      {despesas.length === 0 ? <p className="fin-vazio-linha">{T.financas.semOrcamento}</p> : despesas.map((c) => {
        const gasto = gastos.get(c.id) ?? 0;
        const p = c.orcamento > 0 ? gasto / c.orcamento : 0;
        const nivel = c.orcamento <= 0 ? "vazio" : p >= 1 ? "erro" : p >= 0.8 ? "alerta" : "sucesso";
        const aviso = c.orcamento <= 0 ? T.financas.semOrcamento : p >= 1 ? T.financas.estourou(c.nome) : p >= 0.8 ? T.financas.perto(c.nome) : T.financas.pctUsado(Math.round(p * 100));
        return (
          <div key={c.id} className="fin-orc-linha">
            <span className="fin-orc-nome">
              <span className="fin-quadrado" style={{ background: c.cor }} />
              <span className="cortar">{c.nome}</span>
            </span>
            <span className="fin-orc-barra">
              <span className="fin-trilho" data-nivel={nivel} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, p) * 100)} aria-label={c.nome}>
                <span style={{ width: `${Math.min(1, p) * 100}%` }} />
              </span>
              <span className="fin-orc-aviso" data-nivel={nivel}>{aviso}</span>
            </span>
            <span className="fin-orc-valores">
              <span className="numero privado">{c.orcamento > 0 ? T.financas.gastoDeLimite(formatarDinheiro(gasto), formatarDinheiro(c.orcamento)) : T.financas.gastoSemLimite(formatarDinheiro(gasto))}</span>
              {editando !== c.id && (
                <Botao pequeno soIcone className="fin-botao-contorno fin-botao-quadrado" icone={<Pencil size={12} />} aria-label={T.financas.orcamentoDe} title={T.financas.orcamentoDe} onClick={() => { setEditando(c.id); setValor(c.orcamento ? centavosParaCampo(c.orcamento) : ""); setErro(""); }} />
              )}
            </span>
            {editando === c.id && (
              <form
                className="fin-orc-form"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = validarValor(valor || "0", true);
                  if (v.erro || v.valor == null) return setErro(v.erro ?? T.validacao.valorInvalido);
                  fin.atualizarCategoria(c.id, { orcamento: v.valor });
                  setEditando(null);
                }}
              >
                <div className="campo-prefixo fin-prefixo-curto">
                  <span>R$</span>
                  <input className="campo" autoFocus inputMode="decimal" value={valor} aria-label={T.financas.orcamentoDe} aria-invalid={!!erro} onChange={(e) => { setValor(e.target.value.replace(/[^\d.,]/g, "")); setErro(""); }} />
                </div>
                <Botao pequeno type="submit" variante="primario" icone={<Check size={13} />}>{T.geral.salvar}</Botao>
                <Botao pequeno onClick={() => setEditando(null)}>{T.geral.cancelar}</Botao>
                {erro && <span className="campo-erro">{erro}</span>}
              </form>
            )}
          </div>
        );
      })}
    </section>
  );
}

function GerenciarCategorias() {
  const fin = useFinancas();
  const [editando, setEditando] = useState<{ id: string | null; tipo: "despesa" | "receita"; nome: string; cor: string } | null>(null);
  const [erro, setErro] = useState("");
  const [excluindo, setExcluindo] = useState<{ id: string; destinoId: string } | null>(null);
  const alvoExclusao = fin.categorias.find((c) => c.id === excluindo?.id);
  const usos = (id: string) => fin.transacoes.filter((t) => t.categoriaId === id).length + fin.recorrentes.filter((r) => r.categoriaId === id).length;

  useEffect(() => fin.garantirCategorias(), []);

  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    const nome = editando.nome.trim().slice(0, 40);
    if (!nome) return setErro(T.validacao.obrigatorio);
    const repetida = fin.categorias.some((c) => c.id !== editando.id && c.tipo === editando.tipo && normalizarTexto(c.nome) === normalizarTexto(nome));
    if (repetida) return setErro(T.validacao.duplicado);
    if (editando.id) fin.atualizarCategoria(editando.id, { nome, cor: editando.cor });
    else fin.criarCategoria({ nome, cor: editando.cor, orcamento: 0, tipo: editando.tipo });
    setEditando(null);
  };

  const formulario = (
    <form className="fin-cat-form" noValidate onSubmit={salvar}>
      {editando && !editando.id && (
        <Segmentado<"despesa" | "receita">
          rotulo={T.financas.tipoConta}
          valor={editando.tipo}
          aoMudar={(tipo) => setEditando({ ...editando, tipo })}
          opcoes={[{ valor: "despesa", rotulo: T.financas.tipos.despesa }, { valor: "receita", rotulo: T.financas.tipos.receita }]}
        />
      )}
      <input className="campo fin-cat-nome" autoFocus maxLength={40} value={editando?.nome ?? ""} placeholder={T.financas.nomeCategoria} aria-label={T.financas.nomeCategoria} aria-invalid={!!erro} onChange={(e) => { setEditando((x) => x && { ...x, nome: e.target.value }); setErro(""); }} />
      <span className="fin-cores">
        {CORES_CATEGORIA.map((cor) => (
          <button key={cor} type="button" className="fin-cor" aria-label={cor} aria-pressed={editando?.cor === cor} style={{ background: cor }} onClick={() => setEditando((x) => x && { ...x, cor })} />
        ))}
      </span>
      <Botao pequeno type="submit" variante="primario" icone={<Check size={13} />}>{T.geral.salvar}</Botao>
      <Botao pequeno onClick={() => setEditando(null)}>{T.geral.cancelar}</Botao>
      {erro && <span className="campo-erro">{erro}</span>}
    </form>
  );

  return (
    <section className="fin-painel">
      <CabecalhoPainel titulo={<><Tags size={13} aria-hidden="true" />{T.financas.categorias}</>}>
        {(!editando || editando.id) && (
          <Botao pequeno className="fin-botao-suave" icone={<Plus size={12} />} onClick={() => { setEditando({ id: null, tipo: "despesa", nome: "", cor: CORES_CATEGORIA[fin.categorias.length % CORES_CATEGORIA.length] }); setErro(""); }}>
            {T.financas.novaCategoria}
          </Botao>
        )}
      </CabecalhoPainel>
      <p className="fin-painel-dica">{T.financas.categoriasDica}</p>
      {editando && !editando.id && <div className="fin-linha">{formulario}</div>}
      {(["despesa", "receita"] as const).map((tipo) => (
        <div key={tipo} className="fin-cat-grupo">
          <span className="fin-cat-grupo-nome rotulo-secao">{tipo === "despesa" ? T.financas.tipos.despesa : T.financas.tipos.receita}</span>
          {fin.categorias.filter((c) => c.tipo === tipo).map((c) => (
            <div key={c.id} className="fin-linha fin-cat-linha">
              <span className="fin-quadrado" style={{ background: editando?.id === c.id ? editando.cor : c.cor }} />
              {editando?.id === c.id ? formulario : (
                <>
                  <span className="fin-cat-linha-nome cortar">{c.nome}</span>
                  <span className="fin-acoes-ocultas">
                    <Botao pequeno soIcone variante="fantasma" icone={<Pencil size={13} />} aria-label={T.geral.editar} onClick={() => { setEditando({ id: c.id, tipo: c.tipo, nome: c.nome, cor: c.cor }); setErro(""); }} />
                    <Botao
                      pequeno
                      soIcone
                      variante="fantasma"
                      icone={<Trash2 size={13} />}
                      aria-label={T.financas.excluirCategoria(c.nome)}
                      title={fin.categorias.filter((x) => x.tipo === tipo).length <= 1 ? T.financas.ultimaCategoria : undefined}
                      disabled={fin.categorias.filter((x) => x.tipo === tipo).length <= 1}
                      onClick={() => setExcluindo({ id: c.id, destinoId: fin.categorias.find((x) => x.tipo === tipo && x.id !== c.id)?.id ?? "" })}
                    />
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      ))}
      <Modal aberto={!!alvoExclusao} titulo={alvoExclusao ? T.financas.excluirCategoria(alvoExclusao.nome) : ""} aoFechar={() => setExcluindo(null)}>
        {alvoExclusao && excluindo && (
          <div className="formulario fin-form">
            <Campo id="cat-destino" rotulo={T.financas.moverPara} dica={T.financas.excluirCategoriaDica(usos(alvoExclusao.id))}>
              <select id="cat-destino" className="seletor" value={excluindo.destinoId} onChange={(e) => setExcluindo({ ...excluindo, destinoId: e.target.value })}>
                {fin.categorias.filter((c) => c.tipo === alvoExclusao.tipo && c.id !== alvoExclusao.id).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Campo>
            <div className="formulario-acoes">
              <Botao onClick={() => setExcluindo(null)}>{T.geral.cancelar}</Botao>
              <Botao variante="perigo" disabled={!excluindo.destinoId} onClick={() => { fin.excluirCategoria(excluindo.id, excluindo.destinoId); setExcluindo(null); }}>{T.geral.excluir}</Botao>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}

function Recorrentes() {
  const fin = useFinancas();
  const [aberto, setAberto] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [dia, setDia] = useState("5");
  const [frequencia, setFrequencia] = useState<"mensal" | "anual">("mensal");
  const [mesAnual, setMesAnual] = useState(String(new Date().getMonth() + 1));
  const [contaId, setContaId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [novaCategoria, setNovaCategoria] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const candidatas = useMemo(() => detectarAssinaturas(fin.transacoes, fin.recorrentes, fin.assinaturasIgnoradas), [fin.transacoes, fin.recorrentes, fin.assinaturasIgnoradas]);
  const mudaram = useMemo(() => assinaturasComValorNovo(fin.transacoes, fin.recorrentes), [fin.transacoes, fin.recorrentes]);

  const abrir = (pre?: { descricao: string; valor: number; dia: number; frequencia: "mensal" | "anual"; contaId: string; categoriaId?: string }) => {
    setDescricao(pre?.descricao ?? "");
    setValor(pre ? centavosParaCampo(pre.valor) : "");
    setDia(String(pre?.dia ?? 5));
    setFrequencia(pre?.frequencia ?? "mensal");
    setContaId(pre?.contaId ?? fin.contas[0]?.id ?? "");
    setCategoriaId(pre?.categoriaId ?? (pre ? fin.categorizar(pre.descricao) ?? "" : ""));
    setNovaCategoria("");
    setErros({});
    setAberto(true);
  };

  return (
    <section className="fin-secao">
      <div className="fin-detector">
        <span className="fin-detector-topo">
          <b>{T.financas.detector}</b>
          <span>{T.financas.detectorDica}</span>
        </span>
        {mudaram.map((r) => <AvisoFaixa key={r.id} tipo="alerta">{T.financas.mudouValor(r.descricao)}</AvisoFaixa>)}
        {candidatas.length === 0 ? <span className="fin-dica">{T.financas.semCandidatas}</span> : candidatas.map((c) => (
          <div key={c.chave} className="fin-candidata">
            <span className="fin-candidata-textos">
              <span className="privado">{T.financas.candidataTitulo(c.descricao, formatarDinheiro(c.valor, moedaDaConta(fin.contas, c.contaId)))}</span>
              <span className="fin-candidata-sub">{T.financas.candidataSub(T.financas.ocorrencias(c.ocorrencias.length), c.frequencia === "mensal" ? T.financas.mensal : T.financas.anual, T.financas.proximaPrevista(formatar(c.proxima, "d 'de' MMM")))}</span>
            </span>
            <Botao pequeno variante="primario" className="fin-botao-medio" onClick={() => abrir(c)}>{T.financas.cadastrarRecorrente}</Botao>
            <Botao pequeno className="fin-botao-contorno fin-botao-medio" onClick={() => fin.ignorarAssinatura(c.chave)}>{T.financas.ignorarSempre}</Botao>
          </div>
        ))}
      </div>
      <div className="fin-painel">
        <CabecalhoPainel titulo={T.financas.abas.recorrentes}>
          <Botao pequeno className="fin-botao-suave fin-botao-medio" icone={<Plus size={12} />} disabled={fin.contas.length === 0} onClick={() => abrir()}>{T.financas.novaRecorrente}</Botao>
        </CabecalhoPainel>
        {fin.recorrentes.length === 0 ? <Vazio titulo={T.financas.semRecorrentes} /> : fin.recorrentes.map((r) => (
          <div key={r.id} className="fin-recorrente" data-pausada={r.ativa ? undefined : "sim"}>
            <span className="fin-recorrente-dia">
              <span className="numero">{String(r.dia).padStart(2, "0")}</span>
              <span>{T.financas.diaCurto}</span>
            </span>
            <span className="fin-recorrente-textos">
              <span className="cortar">{r.descricao}</span>
              <span className="fin-recorrente-sub">{T.financas.recorrenteSub(r.frequencia === "mensal" ? T.financas.mensal : T.financas.anual, nomeCategoria(r.categoriaId, fin.categorias))}</span>
            </span>
            <span className="fin-recorrente-valor numero privado"><ValorNaMoeda centavos={r.valor} moeda={moedaDaConta(fin.contas, r.contaId)} /></span>
            <span title={r.ativa ? T.financas.ativa : T.financas.pausada}>
              <Alternador ligado={r.ativa} rotulo={r.ativa ? T.financas.ativa : T.financas.pausada} aoMudar={(v) => fin.atualizarRecorrente(r.id, { ativa: v })} />
            </span>
            <span className="fin-acoes-ocultas">
              <Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={() => fin.excluirRecorrente(r.id)} />
            </span>
          </div>
        ))}
      </div>
      <Modal aberto={aberto} titulo={T.financas.novaRecorrente} aoFechar={() => setAberto(false)}>
        <form
          className="formulario fin-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const novos: Record<string, string> = {};
            if (!descricao.trim()) novos.descricao = T.validacao.obrigatorio;
            const v = validarValor(valor);
            if (v.erro) novos.valor = v.erro;
            const d = Number(dia);
            if (!Number.isInteger(d) || d < 1 || d > 31) novos.dia = T.validacao.entre(1, 31);
            if (!contaId) novos.conta = T.validacao.contaObrigatoria;
            const categoriaValida = fin.categorias.some((c) => c.id === categoriaId && c.tipo === "despesa");
            if (!categoriaValida && !novaCategoria.trim()) novos.categoria = T.financas.categoriaObrigatoria;
            setErros(novos);
            if (Object.keys(novos).length || v.valor == null) return;
            const categoriaFinal = categoriaValida ? categoriaId : fin.obterOuCriarCategoria(novaCategoria, "despesa").id;
            const hoje = new Date();
            fin.criarRecorrente({
              descricao: descricao.trim(),
              valor: v.valor,
              dia: d,
              frequencia,
              mesAnual: frequencia === "anual" ? Number(mesAnual) : undefined,
              contaId,
              categoriaId: categoriaFinal,
              ativa: true,
              geradoAte: geradoAteInicial({ dia: d, frequencia, mesAnual: frequencia === "anual" ? Number(mesAnual) : undefined }, hoje),
            });
            setAberto(false);
          }}
        >
          <Campo id="r-desc" rotulo={T.financas.descricao} obrigatorio erro={erros.descricao}>
            <input id="r-desc" className="campo" value={descricao} maxLength={120} onChange={(e) => setDescricao(e.target.value)} />
          </Campo>
          <CampoDinheiro id="r-valor" rotulo={T.financas.valor} valor={valor} aoMudar={setValor} erro={erros.valor} obrigatorio moeda={moedaDaConta(fin.contas, contaId)} />
          <div className="formulario-linha fin-duas">
            <Campo id="r-dia" rotulo={T.financas.dia} obrigatorio erro={erros.dia}>
              <input id="r-dia" className="campo" inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value.replace(/\D/g, ""))} />
            </Campo>
            <div className="campo-grupo">
              <span className="campo-rotulo">{T.financas.frequencia}</span>
              <Segmentado<"mensal" | "anual"> rotulo={T.financas.frequencia} valor={frequencia} aoMudar={setFrequencia} opcoes={[{ valor: "mensal", rotulo: T.financas.mensal }, { valor: "anual", rotulo: T.financas.anual }]} />
            </div>
          </div>
          {frequencia === "anual" && (
            <Campo id="r-mes" rotulo={T.financas.mesAnual}>
              <select id="r-mes" className="seletor" value={mesAnual} onChange={(e) => setMesAnual(e.target.value)}>
                {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{formatarData(new Date(2026, i, 1), "MMMM")}</option>)}
              </select>
            </Campo>
          )}
          <div className="formulario-linha fin-duas">
            <Campo id="r-cat" rotulo={T.financas.categoria} obrigatorio erro={erros.categoria}>
              <SeletorDeCategoria
                id="r-cat"
                tipo="despesa"
                categoriaId={categoriaId}
                novaCategoria={novaCategoria}
                invalido={!!erros.categoria}
                aoMudar={(id, nova) => { setCategoriaId(id); setNovaCategoria(nova); setErros((e) => ({ ...e, categoria: "" })); }}
              />
            </Campo>
            <Campo id="r-conta" rotulo={T.financas.conta} obrigatorio erro={erros.conta}>
              <select id="r-conta" className="seletor" value={contaId} onChange={(e) => setContaId(e.target.value)}>
                {fin.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Campo>
          </div>
          <div className="formulario-acoes">
            <Botao onClick={() => setAberto(false)}>{T.geral.cancelar}</Botao>
            <Botao type="submit" variante="primario">{T.geral.criar}</Botao>
          </div>
        </form>
      </Modal>
    </section>
  );
}

function Economia() {
  const fin = useFinancas();
  const [nova, setNova] = useState(false);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [alvo, setAlvo] = useState("");
  const [prazo, setPrazo] = useState("");
  const [valor, setValor] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const metaGuardando = fin.metasEconomia.find((m) => m.id === guardando);

  return (
    <section className="fin-secao">
      <div className="fin-topo fin-topo-direita">
        <Botao className="fin-botao-suave" icone={<Plus size={13} />} onClick={() => { setNome(""); setAlvo(""); setPrazo(""); setErros({}); setNova(true); }}>{T.financas.novaMetaEconomia}</Botao>
      </div>
      {fin.metasEconomia.length === 0 ? (
        <div className="fin-painel"><Vazio icone={<PiggyBank size={28} />} titulo={T.financas.semMetasEconomia} /></div>
      ) : (
        <div className="fin-grade-cartoes">
          {fin.metasEconomia.map((m, i) => {
            const p = m.alvo ? m.guardado / m.alvo : 0;
            const pct = Math.round(Math.min(1, p) * 100);
            const meses = m.prazo ? Math.max(1, Math.ceil((deISO(m.prazo).getTime() - Date.now()) / (30 * 86400000))) : 0;
            const cor = p >= 1 ? "var(--sucesso)" : CORES_DESTAQUE[i % CORES_DESTAQUE.length];
            return (
              <article key={m.id} className="fin-meta">
                <span className="fin-meta-topo">
                  <b className="cortar">{m.nome}</b>
                  {m.prazo && <span className="fin-meta-prazo">{T.financas.prazoEm(formatar(m.prazo, "MMM yyyy"))}</span>}
                  <Botao pequeno soIcone variante="fantasma" className="fin-botao-discreto" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={() => fin.excluirMetaEconomia(m.id)} />
                </span>
                <span className="fin-meta-corpo">
                  <span className="fin-anel" style={{ background: `conic-gradient(${cor} ${pct}%, var(--borda) 0)` }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={m.nome}>
                    <span className="fin-anel-miolo numero">{pct}%</span>
                  </span>
                  <span className="fin-meta-valores">
                    <span className="fin-meta-guardado numero privado">{formatarDinheiro(m.guardado)}</span>
                    <span className="fin-meta-alvo privado">{T.financas.deAlvo(formatarDinheiro(m.alvo))}</span>
                  </span>
                </span>
                {m.prazo && p < 1 && <span className="fin-meta-por-mes privado">{T.financas.porMes(formatarDinheiro(Math.ceil((m.alvo - m.guardado) / meses)))}</span>}
                <Botao className="fin-botao-suave fin-botao-cheio" icone={<Plus size={13} />} onClick={() => { setGuardando(m.id); setValor(""); setErros({}); }}>{T.financas.guardar}</Botao>
              </article>
            );
          })}
        </div>
      )}
      <Modal aberto={nova} titulo={T.financas.novaMetaEconomia} aoFechar={() => setNova(false)}>
        <form
          className="formulario fin-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const novos: Record<string, string> = {};
            if (!nome.trim()) novos.nome = T.validacao.obrigatorio;
            const v = validarValor(alvo);
            if (v.erro) novos.alvo = v.erro;
            if (prazo && (!dataValida(prazo) || prazo <= hojeISO())) novos.prazo = T.validacao.dataFutura;
            setErros(novos);
            if (Object.keys(novos).length || v.valor == null) return;
            fin.criarMetaEconomia({ nome: nome.trim().slice(0, 60), alvo: v.valor, guardado: 0, prazo: prazo || undefined });
            setNova(false);
          }}
        >
          <Campo id="e-nome" rotulo={T.metas.nome} obrigatorio erro={erros.nome}>
            <input id="e-nome" className="campo" value={nome} maxLength={60} onChange={(e) => setNome(e.target.value)} />
          </Campo>
          <CampoDinheiro id="e-alvo" rotulo={T.financas.alvo} valor={alvo} aoMudar={setAlvo} erro={erros.alvo} obrigatorio />
          <Campo id="e-prazo" rotulo={T.financas.prazo} erro={erros.prazo}>
            <input id="e-prazo" type="date" className="campo" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
          </Campo>
          <div className="formulario-acoes">
            <Botao onClick={() => setNova(false)}>{T.geral.cancelar}</Botao>
            <Botao type="submit" variante="primario">{T.geral.criar}</Botao>
          </div>
        </form>
      </Modal>
      <Modal aberto={!!guardando} titulo={T.financas.guardar} aoFechar={() => setGuardando(null)}>
        {metaGuardando && metaGuardando.alvo > metaGuardando.guardado && (
          <SubtituloModal><span className="privado">{T.financas.guardarSub(metaGuardando.nome, formatarDinheiro(metaGuardando.alvo - metaGuardando.guardado))}</span></SubtituloModal>
        )}
        <form
          className="formulario fin-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const v = validarValor(valor);
            if (v.erro || v.valor == null || !guardando) return setErros({ valor: v.erro ?? T.validacao.valorInvalido });
            fin.guardarNaMeta(guardando, v.valor);
            setGuardando(null);
            void tocarSom("pop");
          }}
        >
          <CampoDinheiro id="e-valor" rotulo={T.financas.valor} valor={valor} aoMudar={setValor} erro={erros.valor} obrigatorio />
          <div className="formulario-acoes">
            <Botao onClick={() => setGuardando(null)}>{T.geral.cancelar}</Botao>
            <Botao type="submit" variante="primario">{T.geral.salvar}</Botao>
          </div>
        </form>
      </Modal>
    </section>
  );
}

function Divisao() {
  const fin = useFinancas();
  const avisar = useInterface((s) => s.avisar);
  const [novaPessoa, setNovaPessoa] = useState(false);
  const [nomePessoa, setNomePessoa] = useState("");
  const [erroPessoa, setErroPessoa] = useState("");
  const [nova, setNova] = useState(false);
  const [acerto, setAcerto] = useState<{ pessoaId: string; saldo: number } | null>(null);
  const [descricao, setDescricao] = useState("");
  const [total, setTotal] = useState("");
  const [pagador, setPagador] = useState(EU);
  const [participantes, setParticipantes] = useState<string[]>([EU]);
  const [modoDiv, setModoDiv] = useState<"iguais" | "valor" | "porcentagem">("iguais");
  const [partes, setPartes] = useState<Record<string, string>>({});
  const [contaId, setContaId] = useState("");
  const [contaAcerto, setContaAcerto] = useState("");
  const [valorAcerto, setValorAcerto] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [categoriaDiv, setCategoriaDiv] = useState({ id: "", nova: "" });
  const sugeridaDiv = !categoriaDiv.id && !categoriaDiv.nova && descricao ? fin.categorias.find((c) => c.id === fin.categorizar(descricao) && c.tipo === "despesa")?.id : undefined;
  const saldos = saldosComPessoas(fin);
  const simplificacao = simplificarDividas(fin);
  const nomeDe = (id: string) => (id === EU ? T.financas.eu : fin.pessoas.find((p) => p.id === id)?.nome ?? "");
  const todos = [EU, ...fin.pessoas.map((p) => p.id)];
  const corDe = (id: string) => (id === EU ? "var(--destaque)" : CORES_DESTAQUE[todos.indexOf(id) % CORES_DESTAQUE.length]);
  const statusAcerto = (pessoaId: string, s: number) => {
    const nome = fin.pessoas.find((p) => p.id === pessoaId)?.nome ?? "";
    return s > 0 ? T.financas.teDeve(nome, formatarDinheiro(s)) : s < 0 ? T.financas.voceDeve(nome, formatarDinheiro(-s)) : T.financas.quites(nome);
  };

  const salvarDivisao = (e: React.FormEvent) => {
    e.preventDefault();
    const novos: Record<string, string> = {};
    if (!descricao.trim()) novos.descricao = T.validacao.obrigatorio;
    const v = validarValor(total);
    if (v.erro) novos.total = v.erro;
    if (participantes.length < 2) novos.participantes = T.financas.minimoParticipantes;
    if (pagador === EU && !contaId) novos.conta = T.validacao.contaObrigatoria;
    let valores: { pessoaId: string; valor: number }[] = [];
    if (v.valor != null && participantes.length >= 2) {
      if (modoDiv === "iguais") {
        const base = Math.floor(v.valor / participantes.length);
        const resto = v.valor - base * participantes.length;
        valores = participantes.map((p, i) => ({ pessoaId: p, valor: base + (i === 0 ? resto : 0) }));
      } else if (modoDiv === "valor") {
        valores = participantes.map((p) => ({ pessoaId: p, valor: lerValorEmCentavos(partes[p] || "0") ?? -1 }));
        if (valores.some((x) => x.valor < 0)) novos.partes = T.validacao.valorInvalido;
        const soma = somar(valores, (x) => x.valor);
        if (soma !== v.valor) novos.partes = T.validacao.partesNaoFecham(formatarDinheiro(v.valor - soma));
      } else {
        const pct = participantes.map((p) => Number((partes[p] || "0").replace(",", ".")));
        if (pct.some((x) => !Number.isFinite(x) || x < 0)) novos.partes = T.validacao.valorInvalido;
        const soma = pct.reduce((a, b) => a + b, 0);
        if (Math.abs(soma - 100) > 0.01) novos.partes = T.financas.porcentagemFecha(soma.toFixed(1).replace(".", ","));
        valores = participantes.map((p, i) => ({ pessoaId: p, valor: Math.round((v.valor! * pct[i]) / 100) }));
        const diferenca = v.valor - somar(valores, (x) => x.valor);
        if (valores[0]) valores[0].valor += diferenca;
      }
    }
    const escolhida = categoriaDiv.id || sugeridaDiv;
    const categoriaValida = fin.categorias.some((c) => c.id === escolhida && c.tipo === "despesa");
    if (!categoriaValida && !categoriaDiv.nova.trim()) novos.categoria = T.financas.categoriaObrigatoria;
    setErros(novos);
    if (Object.keys(novos).length || v.valor == null) return;
    const categoriaId = categoriaValida ? escolhida : fin.obterOuCriarCategoria(categoriaDiv.nova, "despesa").id;
    fin.dividir({ descricao: descricao.trim(), total: v.valor, pagadorId: pagador, partes: valores, data: hojeISO(), contaId: pagador === EU ? contaId : undefined, categoriaId });
    setNova(false);
    void tocarSom("pop");
  };

  return (
    <section className="fin-dupla">
      <div className="fin-painel fin-dupla-estreita">
        <CabecalhoPainel titulo={T.financas.pessoas}>
          <Botao pequeno className="fin-botao-contorno fin-botao-medio" icone={<Plus size={12} />} onClick={() => { setNomePessoa(""); setErroPessoa(""); setNovaPessoa(true); }}>{T.financas.novaPessoa}</Botao>
        </CabecalhoPainel>
        {fin.pessoas.length === 0 ? <p className="fin-vazio-linha">{T.financas.semPessoas}</p> : fin.pessoas.map((p) => {
          const s = saldos.get(p.id) ?? 0;
          const tom = s > 0 ? "sucesso" : s < 0 ? "alerta" : "neutro";
          return (
            <div key={p.id} className="fin-pessoa" data-tom={tom}>
              <span className="fin-pessoa-avatar" aria-hidden="true">{p.nome.slice(0, 1).toUpperCase()}</span>
              <span className="fin-pessoa-textos">
                <span className="cortar">{p.nome}</span>
                <span className="fin-pessoa-status privado">{statusAcerto(p.id, s)}</span>
              </span>
              {s !== 0 && (
                <Botao pequeno className="fin-botao-contorno fin-botao-medio" onClick={() => { setAcerto({ pessoaId: p.id, saldo: s }); setValorAcerto(centavosParaCampo(Math.abs(s))); setContaAcerto(fin.contas[0]?.id ?? ""); setErros({}); }}>
                  {T.financas.registrarAcerto}
                </Botao>
              )}
            </div>
          );
        })}
        {simplificacao.length > 0 && (
          <div className="fin-simplificacao">
            <span className="rotulo-secao">{T.financas.simplificacao}</span>
            {simplificacao.map((s, i) => <span key={i} className="privado">{T.financas.simplificar(nomeDe(s.de), nomeDe(s.para), formatarDinheiro(s.valor))}</span>)}
          </div>
        )}
      </div>
      <div className="fin-painel fin-dupla-larga">
        <CabecalhoPainel titulo={T.financas.despesasDivididas}>
          <Botao
            pequeno
            variante="primario"
            className="fin-botao-medio"
            icone={<Split size={12} />}
            disabled={fin.pessoas.length === 0}
            title={fin.pessoas.length === 0 ? T.financas.crieAPessoa : undefined}
            onClick={() => { setDescricao(""); setTotal(""); setPagador(EU); setParticipantes([EU, ...fin.pessoas.map((p) => p.id)]); setModoDiv("iguais"); setPartes({}); setContaId(fin.contas[0]?.id ?? ""); setCategoriaDiv({ id: "", nova: "" }); setErros({}); setNova(true); }}
          >
            {T.financas.novaDivisao}
          </Botao>
        </CabecalhoPainel>
        {fin.divisoes.length === 0 ? <Vazio titulo={T.financas.semDivisoes} /> : [...fin.divisoes].sort((a, b) => b.data.localeCompare(a.data)).map((d) => {
          const minha = d.partes.find((p) => p.pessoaId === EU)?.valor;
          return (
            <div key={d.id} className="fin-divisao">
              <span className="fin-divisao-desc cortar">{d.descricao}</span>
              <span className="fin-divisao-total numero privado">{formatarDinheiro(d.total)}</span>
              <span className="fin-divisao-sub privado">{T.financas.divisaoSub(T.financas.pagoPor(nomeDe(d.pagadorId)), d.partes.map((p) => `${nomeDe(p.pessoaId)} ${formatarDinheiro(p.valor)}`).join(", "))}</span>
              <span className="fin-divisao-parte numero privado">{minha != null ? T.financas.suaParte(formatarDinheiro(minha)) : ""}</span>
              <span className="fin-acoes-ocultas fin-divisao-acoes">
                <Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={() => { fin.excluirDivisao(d.id); avisar(T.geral.excluido); }} />
              </span>
            </div>
          );
        })}
        <span className="fin-painel-rodape">{T.financas.divisaoOrcamento}</span>
      </div>
      <Modal aberto={novaPessoa} titulo={T.financas.novaPessoa} aoFechar={() => setNovaPessoa(false)}>
        <SubtituloModal>{T.financas.semPessoas}</SubtituloModal>
        <form
          className="formulario fin-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const limpo = nomePessoa.trim();
            if (!limpo) return setErroPessoa(T.validacao.obrigatorio);
            if (fin.pessoas.some((p) => normalizarTexto(p.nome) === normalizarTexto(limpo))) return setErroPessoa(T.validacao.duplicado);
            fin.criarPessoa(limpo);
            setNomePessoa("");
            setErroPessoa("");
            setNovaPessoa(false);
          }}
        >
          <Campo id="dv-pessoa" rotulo={T.financas.nomePessoa} obrigatorio erro={erroPessoa}>
            <input id="dv-pessoa" className="campo" value={nomePessoa} maxLength={40} aria-invalid={!!erroPessoa} onChange={(e) => { setNomePessoa(e.target.value); setErroPessoa(""); }} />
          </Campo>
          <div className="formulario-acoes">
            <Botao onClick={() => setNovaPessoa(false)}>{T.geral.cancelar}</Botao>
            <Botao type="submit" variante="primario">{T.geral.salvar}</Botao>
          </div>
        </form>
      </Modal>
      <Modal aberto={nova} titulo={T.financas.novaDivisao} aoFechar={() => setNova(false)} largo>
        <form className="formulario fin-form" onSubmit={salvarDivisao} noValidate>
          <Campo id="dv-desc" rotulo={T.financas.descricao} obrigatorio erro={erros.descricao}>
            <input id="dv-desc" className="campo" value={descricao} maxLength={120} onChange={(e) => setDescricao(e.target.value)} />
          </Campo>
          <CampoDinheiro id="dv-total" rotulo={T.financas.valor} valor={total} aoMudar={setTotal} erro={erros.total} obrigatorio />
          <div className="formulario-linha fin-duas">
            <Campo id="dv-pag" rotulo={T.financas.quemPagou}>
              <select id="dv-pag" className="seletor" value={pagador} onChange={(e) => setPagador(e.target.value)}>
                <option value={EU}>{T.financas.eu}</option>
                {fin.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </Campo>
            {pagador === EU && (
              <Campo id="dv-conta" rotulo={T.financas.conta} erro={erros.conta}>
                <select id="dv-conta" className="seletor" value={contaId} onChange={(e) => setContaId(e.target.value)}>
                  {fin.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </Campo>
            )}
          </div>
          <Campo id="dv-cat" rotulo={T.financas.categoria} obrigatorio erro={erros.categoria}>
            <SeletorDeCategoria
              id="dv-cat"
              tipo="despesa"
              categoriaId={categoriaDiv.id || sugeridaDiv || ""}
              novaCategoria={categoriaDiv.nova}
              invalido={!!erros.categoria}
              aoMudar={(id, nova) => { setCategoriaDiv({ id, nova }); setErros((e) => ({ ...e, categoria: "" })); }}
            />
          </Campo>
          <div className="campo-grupo">
            <span className="campo-rotulo" id="dv-participantes">{T.financas.participantes}</span>
            <div className="pilulas" role="group" aria-labelledby="dv-participantes">
              {todos.map((id) => (
                <button key={id} type="button" className="pilula" aria-pressed={participantes.includes(id)} onClick={() => setParticipantes((ps) => (ps.includes(id) ? ps.filter((x) => x !== id) : [...ps, id]))}>
                  <span className="fin-ponto-pessoa" style={{ background: corDe(id) }} />
                  {nomeDe(id)}
                </button>
              ))}
            </div>
            {modoDiv !== "iguais" && participantes.length > 0 && (
              <div className="fin-partes">
                {todos.filter((id) => participantes.includes(id)).map((id) => (
                  <div key={id} className="fin-parte">
                    <span className="cortar">{nomeDe(id)}</span>
                    <div className="campo-prefixo fin-prefixo-curto">
                      <span>{modoDiv === "valor" ? "R$" : "%"}</span>
                      <input className="campo" inputMode="decimal" value={partes[id] ?? ""} aria-label={nomeDe(id)} onChange={(e) => setPartes({ ...partes, [id]: e.target.value.replace(/[^\d.,]/g, "") })} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {(erros.participantes || erros.partes) && <span className="campo-erro">{erros.participantes || erros.partes}</span>}
          </div>
          <div className="campo-grupo">
            <span className="campo-rotulo">{T.financas.modoDivisao}</span>
            <Segmentado rotulo={T.financas.modoDivisao} valor={modoDiv} aoMudar={setModoDiv} opcoes={[{ valor: "iguais", rotulo: T.financas.iguais }, { valor: "valor", rotulo: T.financas.porValor }, { valor: "porcentagem", rotulo: T.financas.porPorcentagem }]} />
            <span className="campo-dica">{T.financas.divisaoOrcamento}</span>
          </div>
          <div className="formulario-acoes">
            <Botao onClick={() => setNova(false)}>{T.geral.cancelar}</Botao>
            <Botao type="submit" variante="primario">{T.geral.salvar}</Botao>
          </div>
        </form>
      </Modal>
      <Modal aberto={!!acerto} titulo={T.financas.registrarAcerto} aoFechar={() => setAcerto(null)}>
        {acerto && (
          <>
            <SubtituloModal><span className="privado">{statusAcerto(acerto.pessoaId, acerto.saldo)}</span></SubtituloModal>
            <form
              className="formulario fin-form"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                const v = validarValor(valorAcerto);
                if (v.erro || v.valor == null) return setErros({ acerto: v.erro ?? T.validacao.valorInvalido });
                if (v.valor > Math.abs(acerto.saldo)) return setErros({ acerto: T.financas.acertoMaior });
                fin.registrarAcerto({ pessoaId: acerto.pessoaId, valor: acerto.saldo > 0 ? v.valor : -v.valor, data: hojeISO(), contaId: contaAcerto || undefined }, acerto.saldo);
                setAcerto(null);
                void tocarSom("approve");
              }}
            >
              <CampoDinheiro id="ac-valor" rotulo={T.financas.valor} valor={valorAcerto} aoMudar={setValorAcerto} erro={erros.acerto} obrigatorio dica={T.financas.acertoMaior} />
              <Campo id="ac-conta" rotulo={T.financas.contaAcerto}>
                <select id="ac-conta" className="seletor" value={contaAcerto} onChange={(e) => setContaAcerto(e.target.value)}>
                  <option value="">{T.financas.semLancamento}</option>
                  {fin.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </Campo>
              <div className="formulario-acoes">
                <Botao onClick={() => setAcerto(null)}>{T.geral.cancelar}</Botao>
                <Botao type="submit" variante="primario">{T.geral.confirmar}</Botao>
              </div>
            </form>
          </>
        )}
      </Modal>
    </section>
  );
}

function Compras({ mes }: { mes: string }) {
  const fin = useFinancas();
  const [listaId, setListaId] = useState(fin.listas[0]?.id ?? "");
  const [criandoLista, setCriandoLista] = useState(false);
  const [novaLista, setNovaLista] = useState("");
  const [item, setItem] = useState("");
  const [qtd, setQtd] = useState("1");
  const [preco, setPreco] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [finalizando, setFinalizando] = useState(false);
  const [totalReal, setTotalReal] = useState("");
  const [contaId, setContaId] = useState("");
  const [categoriaCompra, setCategoriaCompra] = useState({ id: "", nova: "" });
  const lista = fin.listas.find((l) => l.id === listaId) ?? fin.listas[0];
  const estimado = lista ? somar(lista.itens, (i) => i.precoEstimado * i.quantidade) : 0;
  const marcados = lista ? lista.itens.filter((i) => i.marcado) : [];
  const categoria = fin.categorias.find((c) => c.id === lista?.categoriaId);
  const gastoCategoria = categoria ? gastoPorCategoria(fin, mes).get(categoria.id) ?? 0 : 0;
  const sobra = categoria ? categoria.orcamento - gastoCategoria : 0;
  const frequentes = Object.entries(fin.precos).filter(([k]) => !lista?.itens.some((i) => normalizarTexto(i.nome) === k)).slice(0, 8);

  return (
    <section className="fin-dupla">
      <div className="fin-painel fin-dupla-larga">
        <div className="fin-listas">
          {fin.listas.map((l) => (
            <button key={l.id} type="button" className="fin-lista-aba" aria-pressed={l.id === lista?.id} onClick={() => setListaId(l.id)}>
              <span className="cortar">{l.nome}</span>
              <span className="fin-lista-aba-n numero">{l.itens.length}</span>
            </button>
          ))}
          <span className="fin-espaco" />
          {lista && <Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} title={T.geral.excluir} onClick={() => fin.excluirLista(lista.id)} />}
          <Botao pequeno className="fin-botao-contorno fin-botao-medio" icone={<Plus size={12} />} onClick={() => { setNovaLista(""); setErros({}); setCriandoLista(true); }}>{T.financas.novaLista}</Botao>
        </div>
        {!lista ? (
          <Vazio icone={<ShoppingCart size={28} />} titulo={T.financas.semListas} />
        ) : (
          <>
            <form
              className="fin-item-form"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                const novos: Record<string, string> = {};
                if (!item.trim()) novos.item = T.validacao.obrigatorio;
                const q = Number(qtd);
                if (!Number.isInteger(q) || q < 1 || q > 999) novos.qtd = T.validacao.entre(1, 999);
                const p = preco ? lerValorEmCentavos(preco) : 0;
                if (p == null) novos.preco = T.validacao.valorInvalido;
                setErros(novos);
                if (Object.keys(novos).length) return;
                fin.adicionarItens(lista.id, [{ nome: item, quantidade: q, precoEstimado: p ?? 0 }]);
                setItem("");
                setQtd("1");
                setPreco("");
              }}
            >
              <input className="campo fin-item-nome" value={item} maxLength={60} placeholder={T.financas.novoItem} aria-label={T.financas.novoItem} aria-invalid={!!erros.item} onChange={(e) => setItem(e.target.value)} />
              <input className="campo fin-item-qtd" inputMode="numeric" value={qtd} placeholder={T.financas.quantidade} aria-label={T.financas.quantidade} aria-invalid={!!erros.qtd} onChange={(e) => setQtd(e.target.value.replace(/\D/g, ""))} />
              <div className="campo-prefixo fin-item-preco">
                <span>R$</span>
                <input className="campo" inputMode="decimal" value={preco} placeholder="0,00" aria-label={T.financas.preco} title={T.financas.preco} aria-invalid={!!erros.preco} onChange={(e) => setPreco(e.target.value.replace(/[^\d.,]/g, ""))} />
              </div>
              <Botao type="submit" soIcone className="fin-botao-alto fin-botao-suave" icone={<Plus size={14} />} aria-label={T.geral.adicionar} title={T.geral.adicionar} />
              {(erros.item || erros.qtd || erros.preco) && <span className="campo-erro fin-item-erro">{erros.item || erros.qtd || erros.preco}</span>}
            </form>
            {lista.itens.length === 0 ? <p className="fin-vazio-linha">{T.financas.semItens}</p> : lista.itens.map((i) => {
              const historico = fin.precos[normalizarTexto(i.nome)];
              return (
                <div key={i.id} className="fin-item" data-marcado={i.marcado ? "sim" : undefined}>
                  <CaixaMarcar marcada={i.marcado} rotulo={i.nome} aoMudar={(v) => fin.atualizarItem(lista.id, i.id, { marcado: v })} />
                  <span className="fin-item-textos">
                    <span className="fin-item-titulo cortar">{i.nome}</span>
                    {historico && <span className="fin-item-sub privado">{T.financas.ultimoPreco(formatarDinheiro(historico[historico.length - 1].preco))}</span>}
                  </span>
                  <span className="fin-item-quantidade numero">{i.quantidade}</span>
                  <span className="fin-item-valor numero privado">{i.precoEstimado ? formatarDinheiro(i.precoEstimado * i.quantidade) : ""}</span>
                  <span className="fin-acoes-ocultas">
                    <Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={() => fin.removerItem(lista.id, i.id)} />
                  </span>
                </div>
              );
            })}
          </>
        )}
      </div>
      {lista && (
        <div className="fin-dupla-estreita fin-coluna">
          <div className="fin-resumo-compra">
            <span className="rotulo-secao">{T.financas.totalEstimado}</span>
            <span className="fin-resumo-total numero privado">{formatarDinheiro(estimado)}</span>
            <select className="seletor fin-seletor-pequeno" aria-label={T.financas.categoria} value={lista.categoriaId ?? ""} onChange={(e) => useFinancas.setState((s) => ({ listas: s.listas.map((x) => (x.id === lista.id ? { ...x, categoriaId: e.target.value || undefined } : x)) }))}>
              <option value="">{T.financas.semCategoria}</option>
              {fin.categorias.filter((c) => c.tipo === "despesa").map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            {categoria && categoria.orcamento > 0 && <span className="fin-resumo-sobra privado" data-negativo={sobra < 0 ? "sim" : undefined}>{T.financas.sobraOrcamento(formatarDinheiro(sobra))}</span>}
            <Botao
              variante="primario"
              className="fin-botao-alto fin-botao-cheio"
              disabled={marcados.length === 0 || fin.contas.length === 0}
              onClick={() => { setTotalReal(centavosParaCampo(somar(marcados, (i) => i.precoEstimado * i.quantidade))); setContaId(fin.contas[0]?.id ?? ""); setCategoriaCompra({ id: lista.categoriaId ?? "", nova: "" }); setErros({}); setFinalizando(true); }}
            >
              {T.financas.finalizarCompra} ({marcados.length})
            </Botao>
          </div>
          {frequentes.length > 0 && (
            <div className="fin-frequentes">
              <span className="rotulo-secao">{T.financas.sugestoes}</span>
              <div className="fin-frequentes-lista">
                {frequentes.map(([k, h]) => (
                  <button
                    key={k}
                    type="button"
                    className="fin-frequente"
                    title={T.financas.ultimoPreco(formatarDinheiro(h[h.length - 1].preco))}
                    onClick={() => fin.adicionarItens(lista.id, [{ nome: k[0].toUpperCase() + k.slice(1), quantidade: 1, precoEstimado: h[h.length - 1].preco }])}
                  >
                    <Plus size={11} aria-hidden="true" />
                    {k}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <Modal aberto={criandoLista} titulo={T.financas.novaLista} aoFechar={() => setCriandoLista(false)}>
        <form
          className="formulario fin-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!novaLista.trim()) return setErros({ lista: T.validacao.obrigatorio });
            const l = fin.criarLista(novaLista, fin.categorias.find((c) => normalizarTexto(c.nome) === "mercado")?.id);
            setListaId(l.id);
            setNovaLista("");
            setErros({});
            setCriandoLista(false);
          }}
        >
          <Campo id="lc-lista" rotulo={T.financas.nomeLista} obrigatorio erro={erros.lista}>
            <input id="lc-lista" className="campo" value={novaLista} maxLength={40} aria-invalid={!!erros.lista} onChange={(e) => setNovaLista(e.target.value)} />
          </Campo>
          <div className="formulario-acoes">
            <Botao onClick={() => setCriandoLista(false)}>{T.geral.cancelar}</Botao>
            <Botao type="submit" variante="primario">{T.geral.criar}</Botao>
          </div>
        </form>
      </Modal>
      <Modal aberto={finalizando} titulo={T.financas.finalizarCompra} aoFechar={() => setFinalizando(false)}>
        {lista && <SubtituloModal><span className="privado">{T.financas.finalizarSub(lista.nome, formatarDinheiro(estimado))}</span></SubtituloModal>}
        <form
          className="formulario fin-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const v = validarValor(totalReal);
            const categoriaValida = fin.categorias.some((c) => c.id === categoriaCompra.id && c.tipo === "despesa");
            const novos: Record<string, string> = {};
            if (v.erro || v.valor == null) novos.total = v.erro ?? T.validacao.valorInvalido;
            if (!categoriaValida && !categoriaCompra.nova.trim()) novos.categoria = T.financas.categoriaObrigatoria;
            setErros(novos);
            if (Object.keys(novos).length || v.valor == null || !lista) return;
            const categoriaId = categoriaValida ? categoriaCompra.id : fin.obterOuCriarCategoria(categoriaCompra.nova, "despesa").id;
            if (!lista.categoriaId) useFinancas.setState((s) => ({ listas: s.listas.map((x) => (x.id === lista.id ? { ...x, categoriaId } : x)) }));
            fin.finalizarCompra(lista.id, contaId, v.valor, categoriaId);
            setFinalizando(false);
            void useAgentes.getState().trabalhar("operador", T.financas.compraDescricao(lista.nome), 400);
          }}
        >
          <CampoDinheiro id="fc-total" rotulo={T.financas.totalReal} valor={totalReal} aoMudar={setTotalReal} erro={erros.total} obrigatorio />
          <div className="formulario-linha fin-duas">
            <Campo id="fc-conta" rotulo={T.financas.conta}>
              <select id="fc-conta" className="seletor" value={contaId} onChange={(e) => setContaId(e.target.value)}>
                {fin.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Campo>
            <Campo id="fc-cat" rotulo={T.financas.categoria} obrigatorio erro={erros.categoria}>
              <SeletorDeCategoria
                id="fc-cat"
                tipo="despesa"
                categoriaId={categoriaCompra.id}
                novaCategoria={categoriaCompra.nova}
                invalido={!!erros.categoria}
                aoMudar={(id, nova) => { setCategoriaCompra({ id, nova }); setErros((e) => ({ ...e, categoria: "" })); }}
              />
            </Campo>
          </div>
          <div className="formulario-acoes">
            <Botao onClick={() => setFinalizando(false)}>{T.geral.cancelar}</Botao>
            <Botao type="submit" variante="primario">{T.geral.confirmar}</Botao>
          </div>
        </form>
      </Modal>
    </section>
  );
}

function Relatorios({ mes, modo }: { mes: string; modo: Modo }) {
  const fin = useFinancas();
  const receberStripe = useConfig((s) => s.receberStripe);
  const [criandoRegra, setCriandoRegra] = useState(false);
  const [contem_, setContem] = useState("");
  const [categoriaRegra, setCategoriaRegra] = useState("");
  const [erro, setErro] = useState("");
  const meses = Array.from({ length: 6 }, (_, i) => format(addMonths(deISO(`${mes}-01`), i - 5), "yyyy-MM"));
  const dados = meses.map((m) => gastoPorCategoria(fin, m, modo));
  const despesas = fin.categorias.filter((c) => c.tipo === "despesa");

  return (
    <section className="fin-secao">
      <div className="fin-painel">
        <CabecalhoPainel titulo={T.financas.relatorioMensal}>
          <Botao pequeno className="fin-botao-contorno fin-botao-medio" icone={<Download size={12} />} onClick={() => exportarTransacoes(useFinancas.getState())}>{T.financas.exportarCsv}</Botao>
        </CabecalhoPainel>
        <div className="fin-rolagem">
          <table className="fin-tabela fin-comparativo">
            <thead>
              <tr>
                <th>{T.financas.categoria}</th>
                {meses.map((m) => <th key={m} className="fin-tabela-valor">{formatar(`${m}-01`, "MMM yy")}</th>)}
              </tr>
            </thead>
            <tbody>
              {despesas.map((c) => (
                <tr key={c.id}>
                  <td><span className="fin-comparativo-nome"><span className="fin-quadrado" style={{ background: c.cor }} />{c.nome}</span></td>
                  {dados.map((d, i) => {
                    const v = d.get(c.id) ?? 0;
                    const anterior = i > 0 ? dados[i - 1].get(c.id) ?? 0 : 0;
                    return <td key={i} className="fin-tabela-valor numero privado" data-subiu={i > 0 && anterior > 0 && v > anterior * 1.1 ? "sim" : undefined}>{v ? formatarDinheiro(v) : ""}</td>;
                  })}
                </tr>
              ))}
              <tr className="fin-tabela-total">
                <td>{T.financas.total}</td>
                {dados.map((d, i) => <td key={i} className="fin-tabela-valor numero privado">{formatarDinheiro(somar([...d.values()], (v) => v))}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="fin-painel">
        <CabecalhoPainel titulo={T.financas.regras}>
          <Botao pequeno className="fin-botao-suave fin-botao-medio" icone={<Plus size={12} />} onClick={() => { setContem(""); setCategoriaRegra(""); setErro(""); setCriandoRegra(true); }}>{T.financas.novaRegra}</Botao>
        </CabecalhoPainel>
        {fin.regras.map((r) => {
          const cat = fin.categorias.find((c) => c.id === r.categoriaId);
          return (
            <div key={r.id} className="fin-regra">
              <span className="texto-3">{T.financas.regraContem}</span>
              <code>{r.contem}</code>
              <ArrowRight size={12} className="fin-regra-seta" aria-hidden="true" />
              <span className="fin-regra-cat">
                <span className="fin-quadrado" style={{ background: cat?.cor ?? COR_OUTRAS }} />
                {nomeCategoria(r.categoriaId, fin.categorias)}
              </span>
              <span className="fin-acoes-ocultas fin-regra-acoes">
                <Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={() => fin.excluirRegra(r.id)} />
              </span>
            </div>
          );
        })}
        <div className="fin-alternar">
          <Alternador ligado={receberStripe} rotulo={T.financas.receberStripe} aoMudar={(v) => useConfig.getState().definir({ receberStripe: v })} />
          <span>{T.financas.receberStripe}</span>
        </div>
      </div>
      <Modal aberto={criandoRegra} titulo={T.financas.novaRegra} aoFechar={() => setCriandoRegra(false)}>
        <SubtituloModal>{T.financas.regras}</SubtituloModal>
        <form
          className="formulario fin-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!contem_.trim() || !categoriaRegra) return setErro(T.validacao.obrigatorio);
            fin.criarRegra(contem_, categoriaRegra);
            setContem("");
            setErro("");
            setCriandoRegra(false);
          }}
        >
          <Campo id="rg-contem" rotulo={T.financas.regraContem} obrigatorio erro={erro}>
            <input id="rg-contem" className="campo" value={contem_} maxLength={40} placeholder="IFOOD" onChange={(e) => setContem(e.target.value)} />
          </Campo>
          <Campo id="rg-cat" rotulo={T.financas.categoria} obrigatorio>
            <select id="rg-cat" className="seletor" value={categoriaRegra} onChange={(e) => setCategoriaRegra(e.target.value)}>
              <option value="">{T.financas.escolha}</option>
              {fin.categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Campo>
          <div className="formulario-acoes">
            <Botao onClick={() => setCriandoRegra(false)}>{T.geral.cancelar}</Botao>
            <Botao type="submit" variante="primario">{T.geral.salvar}</Botao>
          </div>
        </form>
      </Modal>
    </section>
  );
}

function PrimeirosPassos({ aoCriarConta, aoLancar }: { aoCriarConta: () => void; aoLancar: () => void }) {
  const temConta = useFinancas((s) => s.contas.some((c) => !c.arquivada));
  const temLancamento = useFinancas((s) => s.transacoes.some((t) => !t.ajuste));
  if (temConta && temLancamento) return null;
  const passos = [
    { feito: temConta, titulo: T.financas.passos.conta, texto: T.financas.passos.contaTexto, botao: T.financas.criarConta, acao: aoCriarConta, liberado: true },
    { feito: temLancamento, titulo: T.financas.passos.lancar, texto: T.financas.passos.lancarTexto, botao: T.financas.novaTransacao, acao: aoLancar, liberado: temConta },
  ];
  return (
    <section className="fin-passos" aria-label={T.financas.passos.titulo}>
      <div className="fin-passos-topo">
        <b>{T.financas.passos.titulo}</b>
        <span>{T.financas.passos.subtitulo}</span>
      </div>
      <ol className="fin-passos-lista">
        {passos.map((p, i) => (
          <li key={p.titulo} className="fin-passo" data-feito={p.feito || undefined} data-liberado={p.liberado || undefined}>
            <span className="fin-passo-numero" aria-hidden="true">{p.feito ? <Check size={13} /> : i + 1}</span>
            <div className="fin-passo-textos">
              <span className="fin-passo-titulo">{p.titulo}</span>
              <span className="fin-passo-texto">{p.texto}</span>
            </div>
            {!p.feito && (
              <Botao pequeno variante={p.liberado ? "primario" : "secundario"} disabled={!p.liberado} title={!p.liberado ? T.financas.passos.depoisDaConta : undefined} onClick={p.acao}>
                {p.botao}
              </Botao>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function Financas() {
  const parametros = useInterface((s) => s.parametros);
  const [aba, setAba] = useState<Aba>((parametros.aba as Aba) || "visao");
  const [mes, setMes] = useState(hojeISO().slice(0, 7));
  const [modo, setModo] = useState<Modo>("competencia");
  const [nova, setNova] = useState(false);
  const [importar, setImportar] = useState(false);
  const [contaAntes, setContaAntes] = useState<"transacao" | "importar" | "conta" | null>(null);
  const fin = useFinancas();
  const temConta = fin.contas.some((c) => !c.arquivada);

  const novaTransacao = () => (useFinancas.getState().contas.some((c) => !c.arquivada) ? setNova(true) : setContaAntes("transacao"));
  const importarExtrato = () => (useFinancas.getState().contas.some((c) => !c.arquivada) ? setImportar(true) : setContaAntes("importar"));

  useEffect(() => {
    if (parametros.aba) setAba(parametros.aba as Aba);
  }, [parametros.aba]);

  useEffect(() => {
    const aoNovo = (e: Event) => {
      if ((e as CustomEvent).detail === "financas") novaTransacao();
    };
    window.addEventListener(EVENTO_NOVO, aoNovo);
    return () => window.removeEventListener(EVENTO_NOVO, aoNovo);
  }, []);

  const mostraMes = ["visao", "transacoes", "orcamento", "relatorios", "compras"].includes(aba);
  const totalMes = somar(gastosDoMes(fin, mes, modo), (t) => valorEmReais(t, fin, parteDoUsuario(t, fin.divisoes)));

  return (
    <>
      <CabecalhoAba
        titulo={T.financas.titulo}
        subtitulo={T.financas.subtitulo}
        acoes={
          <>
            {mostraMes && (
              <>
                <span className="fin-regime" title={T.financas.competenciaDica}>
                  <Segmentado<Modo> rotulo={T.financas.competencia} valor={modo} aoMudar={setModo} opcoes={[{ valor: "competencia", rotulo: T.financas.competencia }, { valor: "caixa", rotulo: T.financas.caixa }]} />
                </span>
                <SeletorMes mes={mes} aoMudar={setMes} />
              </>
            )}
            {!temConta && <Botao className="fin-botao-alto" icone={<Landmark size={13} />} onClick={() => setContaAntes("conta")}>{T.financas.criarConta}</Botao>}
            <Botao variante="primario" className="fin-botao-alto" icone={<Plus size={13} />} onClick={novaTransacao}>{T.financas.novaTransacao}</Botao>
          </>
        }
      />
      <nav className="fin-abas" aria-label={T.financas.titulo}>
        {GRUPOS_ABA.map((g) => (
          <div key={g.nome} className="fin-abas-grupo">
            <span className="fin-abas-rotulo">{g.nome}</span>
            <div className="fin-abas-botoes">
              {g.abas.map((a) => (
                <button key={a} type="button" className="fin-aba" aria-current={aba === a ? "page" : undefined} onClick={() => setAba(a)}>
                  {T.financas.abas[a]}
                </button>
              ))}
            </div>
          </div>
        ))}
        {mostraMes && <span className="fin-abas-resumo numero privado">{T.financas.gastoNoMes(formatarDinheiro(totalMes))}</span>}
      </nav>
      <PrimeirosPassos aoCriarConta={() => setContaAntes("conta")} aoLancar={novaTransacao} />
      {aba === "visao" && <VisaoGeral modo={modo} mes={mes} />}
      {aba === "transacoes" && <Transacoes mes={mes} buscaInicial={parametros.busca} aoImportar={importarExtrato} />}
      {aba === "contas" && <Contas />}
      {aba === "cartoes" && <Cartoes />}
      {aba === "orcamento" && (
        <>
          <Orcamento mes={mes} modo={modo} />
          <GerenciarCategorias />
        </>
      )}
      {aba === "recorrentes" && <Recorrentes />}
      {aba === "economia" && <Economia />}
      {aba === "divisao" && <Divisao />}
      {aba === "compras" && <Compras mes={mes} />}
      {aba === "relatorios" && <Relatorios mes={mes} modo={modo} />}
      <FormTransacao aberto={nova} aoFechar={() => setNova(false)} />
      <Importar aberto={importar} aoFechar={() => setImportar(false)} />
      <FormConta
        aberto={contaAntes !== null}
        aviso={contaAntes === "transacao" ? T.financas.contaAntesTransacao : contaAntes === "importar" ? T.financas.contaAntesImportar : undefined}
        aoFechar={() => setContaAntes(null)}
        aoCriar={() => {
          if (contaAntes === "transacao") setNova(true);
          if (contaAntes === "importar") setImportar(true);
        }}
      />
    </>
  );
}
