import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as EventoDePonteiro } from "react";
import { addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Download, Upload, BellRing, CalendarDays, Trash2, Repeat, Check, X, RefreshCw } from "lucide-react";
import { CabecalhoAba } from "../../componentes/CabecalhoAba";
import { AvisoFaixa, Botao, Campo, Modal, Segmentado, Vazio } from "../../componentes/basicos";
import { abrirLink } from "../../desktop/desktop";
import { usarAgendaGoogle } from "./usarAgendaGoogle";
import { useComunicacao } from "../../estado/comunicacao";
import { Marca } from "../../marcas/Marca";
import { useOrganizacao } from "../../estado/organizacao";
import { useRotina } from "../../estado/rotina";
import { useEstudos } from "../../estado/estudos";
import { useFinancas } from "../../estado/financas";
import { useInterface } from "../../estado/interface";
import { T } from "../../textos/textos";
import { dataValida, deISO, formatar, formatarData, hojeISO, horaValida, paraISO } from "../../utilitarios/datas";
import { baixarArquivo, lerArquivoTexto } from "../../utilitarios/basicos";
import { EVENTO_NOVO } from "../../janelas/area-de-trabalho/usarAtalhos";
import type { Evento, Repeticao, Rota } from "../../tipos";
import { marcarItemFeito } from "../../utilitarios/marcarFeito";
import { editarEvento, excluirOcorrencia, itemFeito, itensDoCalendario, lerEventoRapido, podeMarcarFeito, repeteTodoDia, type DadosDoEvento, type EscopoDaEdicao, type FonteDoCalendario, type ItemDoCalendario } from "../../utilitarios/itensDoCalendario";
import { useConfig } from "../../estado/configuracoes";
import { funcaoLigada, type Funcao } from "../../utilitarios/funcoes";

type Fonte = FonteDoCalendario;
type Vista = "mes" | "semana" | "agenda";
type Item = ItemDoCalendario;
type Edicao = { evento: Evento; ocorrencia: string };
type PedidoDeEscopo = { texto: string; aoEscolher: (escopo: EscopoDaEdicao) => void };

const COR_FONTE: Record<Fonte, string> = {
  eventos: "var(--destaque)",
  tarefas: "var(--texto)",
  habitos: "var(--sucesso)",
  estudos: "var(--roxo)",
  financas: "var(--alerta)",
  metas: "var(--info)",
  google: "var(--texto-3)",
};

const FONTES = Object.keys(T.calendario.fontes) as Fonte[];
const FUNCAO_DA_FONTE: Record<Fonte, Funcao> = { eventos: "calendario", tarefas: "journal", habitos: "journal", estudos: "estudos", financas: "financas", metas: "metas", google: "calendario" };
const ROTA_DA_FONTE: Record<Exclude<Fonte, "eventos" | "google">, Rota> = { tarefas: "journal", habitos: "journal", estudos: "estudos", financas: "financas", metas: "metas" };
const DISTANCIA_PARA_ARRASTAR = 6;
const ALTURA_HORA = 48;
const PRIMEIRA_HORA = 7;
const ULTIMA_HORA = 22;
const LIMITE_NO_DIA = 3;

function escaparIcs(t: string) {
  return t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function corDa(fonte: Fonte): CSSProperties {
  return { "--cor": COR_FONTE[fonte] } as CSSProperties;
}

function mudouAlgo(e: Evento, ocorrencia: string, novos: DadosDoEvento) {
  return e.titulo !== novos.titulo || ocorrencia !== novos.data || (e.hora ?? "") !== (novos.hora ?? "") || e.tipo !== novos.tipo || e.repeticao !== novos.repeticao;
}

function horasDecimais(hora: string) {
  return Number(hora.slice(0, 2)) + Number(hora.slice(3, 5)) / 60;
}

function emFaixas(lista: Item[]) {
  const comHora = lista.filter((i) => i.hora).sort((a, b) => (a.hora ?? "").localeCompare(b.hora ?? ""));
  const resultado: { item: Item; faixa: number; faixas: number }[] = [];
  let grupo: { item: Item; faixa: number; faixas: number }[] = [];
  let fins: number[] = [];
  let fimDoGrupo = -1;
  const fecharGrupo = () => {
    for (const g of grupo) g.faixas = fins.length;
    resultado.push(...grupo);
    grupo = [];
    fins = [];
  };
  for (const item of comHora) {
    const inicio = horasDecimais(item.hora as string);
    if (inicio >= fimDoGrupo && grupo.length) fecharGrupo();
    let faixa = fins.findIndex((f) => f <= inicio);
    if (faixa === -1) {
      faixa = fins.length;
      fins.push(inicio + 1);
    } else fins[faixa] = inicio + 1;
    fimDoGrupo = Math.max(fimDoGrupo, inicio + 1);
    grupo.push({ item, faixa, faixas: 0 });
  }
  if (grupo.length) fecharGrupo();
  return resultado;
}

function FormEvento({ aberto, dataInicial, edicao, aoSalvar, aoFechar }: { aberto: boolean; dataInicial: string; edicao: Edicao | null; aoSalvar: (dados: DadosDoEvento) => void; aoFechar: () => void }) {
  const [titulo, setTitulo] = useState("");
  const [data, setData] = useState(dataInicial);
  const [hora, setHora] = useState("");
  const [tipo, setTipo] = useState<"evento" | "lembrete">("evento");
  const [repeticao, setRepeticao] = useState<Repeticao>("nenhuma");
  const [erros, setErros] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!aberto) return;
    setTitulo(edicao?.evento.titulo ?? "");
    setData(edicao?.ocorrencia ?? dataInicial);
    setHora(edicao?.evento.hora ?? "");
    setTipo(edicao?.evento.tipo ?? "evento");
    setRepeticao(edicao?.evento.repeticao ?? "nenhuma");
    setErros({});
  }, [aberto, dataInicial, edicao]);

  return (
    <Modal aberto={aberto} titulo={edicao ? T.calendario.editarEvento : T.calendario.novoEvento} aoFechar={aoFechar}>
      <form
        className="formulario"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const novos: Record<string, string> = {};
          if (!titulo.trim()) novos.titulo = T.validacao.obrigatorio;
          if (!dataValida(data)) novos.data = T.validacao.dataInvalida;
          if (hora && !horaValida(hora)) novos.hora = T.validacao.horaInvalida;
          if (tipo === "lembrete" && !hora) novos.hora = T.calendario.lembreteHora;
          setErros(novos);
          if (Object.keys(novos).length) return;
          aoSalvar({ titulo: titulo.trim().slice(0, 120), data, hora: hora || undefined, tipo, repeticao });
          if (tipo === "lembrete" && typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
        }}
      >
        <Segmentado rotulo={T.calendario.tipo} valor={tipo} aoMudar={setTipo} opcoes={[{ valor: "evento", rotulo: T.calendario.evento, icone: <CalendarDays size={13} /> }, { valor: "lembrete", rotulo: T.calendario.lembrete, icone: <BellRing size={13} /> }]} />
        <Campo id="ev-titulo" rotulo={T.estudos.tituloCartao} obrigatorio erro={erros.titulo}>
          <input id="ev-titulo" className="campo" value={titulo} maxLength={120} onChange={(e) => setTitulo(e.target.value)} />
        </Campo>
        <div className="formulario-linha">
          <Campo id="ev-data" rotulo={T.financas.data} obrigatorio erro={erros.data}>
            <input id="ev-data" type="date" className="campo" value={data} onChange={(e) => setData(e.target.value)} />
          </Campo>
          <Campo id="ev-hora" rotulo={T.calendario.hora} obrigatorio={tipo === "lembrete"} erro={erros.hora}>
            <input id="ev-hora" type="time" className="campo" value={hora} onChange={(e) => setHora(e.target.value)} />
          </Campo>
          <Campo id="ev-rep" rotulo={T.calendario.repeticao}>
            <select id="ev-rep" className="seletor" value={repeticao} onChange={(e) => setRepeticao(e.target.value as Repeticao)}>
              {(Object.keys(T.calendario.repeticoes) as Repeticao[]).map((r) => <option key={r} value={r}>{T.calendario.repeticoes[r]}</option>)}
            </select>
          </Campo>
        </div>
        {tipo === "lembrete" && <p className="campo-dica">{T.calendario.lembreteDica}</p>}
        <div className="formulario-acoes">
          <Botao onClick={aoFechar}>{T.geral.cancelar}</Botao>
          <Botao type="submit" variante="primario">{edicao ? T.geral.salvar : T.geral.criar}</Botao>
        </div>
      </form>
    </Modal>
  );
}

function EscolhaDeEscopo({ pedido, aoFechar }: { pedido: PedidoDeEscopo | null; aoFechar: () => void }) {
  const escolher = (escopo: EscopoDaEdicao) => {
    pedido?.aoEscolher(escopo);
    aoFechar();
  };
  return (
    <Modal aberto={Boolean(pedido)} titulo={T.calendario.escopoTitulo} aoFechar={aoFechar}>
      <div className="cl-escopo">
        <p className="cl-escopo-texto">{pedido?.texto}</p>
        <div className="cl-escopo-botoes">
          <Botao onClick={() => escolher("este")}>{T.calendario.soNesteDia}</Botao>
          <Botao variante="primario" onClick={() => escolher("todos")}>{T.calendario.emTodos}</Botao>
        </div>
      </div>
    </Modal>
  );
}

function Chip({ i, feito, aoAbrir, aoIniciarArraste }: { i: Item; feito?: boolean; aoAbrir?: () => void; aoIniciarArraste?: (e: EventoDePonteiro<HTMLSpanElement>) => void }) {
  return (
    <span
      className="cl-chip"
      data-feito={feito ? "sim" : undefined}
      style={corDa(i.fonte)}
      title={i.hora ? `${i.hora} ${i.titulo}` : i.titulo}
      data-editavel={aoAbrir ? "sim" : undefined}
      onPointerDown={aoIniciarArraste}
      onClick={aoAbrir ? (e) => { e.stopPropagation(); aoAbrir(); } : undefined}
    >
      <span className="cl-ponto" />
      {i.hora && <span className="cl-chip-hora">{i.hora}</span>}
      <span className="cortar privado">{i.titulo}</span>
    </span>
  );
}

function LinhaDoDia({ i, compacta, aoAbrir, rotuloAbrir, aoExcluir, feito, aoMarcar }: { i: Item; compacta?: boolean; aoAbrir?: () => void; rotuloAbrir?: string; aoExcluir?: () => void; feito?: boolean; aoMarcar?: () => void }) {
  const fonte = [T.calendario.fontes[i.fonte], i.evento && i.evento.repeticao !== "nenhuma" ? T.calendario.repeticoes[i.evento.repeticao] : ""].filter(Boolean).join(" · ");
  const texto = (
    <>
      <span className="cl-linha-titulo cortar privado">{i.titulo}</span>
      <span className="cl-linha-fonte">{fonte}</span>
    </>
  );
  return (
    <div className="cl-linha" style={corDa(i.fonte)} data-feito={feito ? "sim" : undefined} data-compacta={compacta ? "sim" : "nao"}>
      <span className="cl-linha-hora">{i.hora ?? (compacta ? "" : T.calendario.diaTodo)}</span>
      <span className="cl-barra" />
      {aoAbrir ? (
        <button type="button" className="cl-linha-texto cl-linha-abrir" title={rotuloAbrir} aria-label={rotuloAbrir ? `${rotuloAbrir}: ${i.titulo}` : undefined} onClick={aoAbrir}>{texto}</button>
      ) : (
        <div className="cl-linha-texto">{texto}</div>
      )}
      <span className="cl-linha-acoes">
        {aoMarcar && (
          <button type="button" className="cl-linha-check" aria-pressed={Boolean(feito)} aria-label={feito ? T.calendario.desmarcarFeito(i.titulo) : T.calendario.marcarFeito(i.titulo)} title={feito ? T.calendario.desmarcarFeito(i.titulo) : T.calendario.marcarFeito(i.titulo)} onClick={aoMarcar}>
            {feito && <Check size={11} />}
          </button>
        )}
        {aoExcluir && (
          <button type="button" className="cl-linha-excluir" aria-label={T.geral.excluir} title={T.geral.excluir} onClick={aoExcluir}>
            <Trash2 size={13} />
          </button>
        )}
      </span>
    </div>
  );
}

type Arraste = { item: Item; inicioX: number; inicioY: number; x: number; y: number; ativo: boolean; alvo: string | null };

function minutosDeAgora() {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

export default function Calendario() {
  const parametros = useInterface((s) => s.parametros);
  const avisar = useInterface((s) => s.avisar);
  const irPara = useInterface((s) => s.irPara);
  const eventos = useOrganizacao((s) => s.eventos);
  const metas = useOrganizacao((s) => s.metas);
  const criarEvento = useOrganizacao((s) => s.criarEvento);
  const atualizarEvento = useOrganizacao((s) => s.atualizarEvento);
  const excluirEvento = useOrganizacao((s) => s.excluirEvento);
  const restaurarEvento = useOrganizacao((s) => s.restaurarEvento);
  const tarefas = useRotina((s) => s.tarefas);
  const habitos = useRotina((s) => s.habitos);
  const registros = useRotina((s) => s.registros);
  const datas = useEstudos((s) => s.datas);
  const revisoes = useEstudos((s) => s.revisoesConteudo);
  const recorrentes = useFinancas((s) => s.recorrentes);
  const [vista, setVista] = useState<Vista>("mes");
  const [foco, setFoco] = useState(parametros.data && dataValida(parametros.data) ? parametros.data : hojeISO());
  const [fontes, setFontes] = useState<Record<Fonte, boolean>>({ eventos: true, tarefas: true, habitos: true, estudos: true, financas: true, metas: true, google: true });
  const [novo, setNovo] = useState(false);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [escopo, setEscopo] = useState<PedidoDeEscopo | null>(null);
  const [diaSelecionado, setDiaSelecionado] = useState(foco);
  const [rapido, setRapido] = useState("");
  const [arraste, setArraste] = useState<Arraste | null>(null);
  const [agora, setAgora] = useState(minutosDeAgora);
  const acabouDeArrastar = useRef(false);
  const arrasteAtual = useRef<Arraste | null>(null);

  useEffect(() => {
    if (parametros.data && dataValida(parametros.data)) {
      setFoco(parametros.data);
      setDiaSelecionado(parametros.data);
    }
  }, [parametros.data]);

  useEffect(() => {
    const aoNovo = (e: Event) => {
      if ((e as CustomEvent).detail === "calendario") setNovo(true);
    };
    window.addEventListener(EVENTO_NOVO, aoNovo);
    return () => window.removeEventListener(EVENTO_NOVO, aoNovo);
  }, []);

  const base = deISO(foco);
  const hoje = hojeISO();
  const intervalo = vista === "mes"
    ? { inicio: startOfWeek(startOfMonth(base), { weekStartsOn: 1 }), fim: endOfWeek(endOfMonth(base), { weekStartsOn: 1 }) }
    : vista === "semana"
      ? { inicio: startOfWeek(base, { weekStartsOn: 1 }), fim: endOfWeek(base, { weekStartsOn: 1 }) }
      : { inicio: base, fim: addDays(base, 30) };
  const inicioISO = paraISO(intervalo.inicio);
  const fimISO = paraISO(intervalo.fim);
  const hojeNaSemana = vista === "semana" && hoje >= inicioISO && hoje <= fimISO;

  useEffect(() => {
    if (!hojeNaSemana) return;
    setAgora(minutosDeAgora());
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setAgora(minutosDeAgora());
    }, 60000);
    return () => window.clearInterval(id);
  }, [hojeNaSemana]);

  const desligadas = useConfig((s) => s.funcoesDesligadas);
  const fimProximos = paraISO(addDays(deISO(hoje), 6));
  const sugestaoGoogle = useConfig((s) => s.sugestaoAgendaGoogle);
  const definirConfig = useConfig((s) => s.definir);
  const agendaConectada = useComunicacao((s) => Boolean(s.conexoes.find((c) => c.id === "google")?.chaveSalva));
  const sugerirGoogle = sugestaoGoogle && !agendaConectada && funcaoLigada("calendario", desligadas);
  const agendaGoogle = usarAgendaGoogle(funcaoLigada("calendario", desligadas) ? [[inicioISO, fimISO], [hoje, fimProximos]] : []);
  const gerar = useMemo(() => (de: string, ate: string) => {
    const locais = itensDoCalendario({ eventos, tarefas, habitos, datas, revisoes, metas, recorrentes }, de, ate);
    const google: Item[] = agendaGoogle.eventos.filter((e) => e.data >= de && e.data <= ate).map((e) => ({ id: `google-${e.id}`, titulo: e.titulo, data: e.data, hora: e.hora, fonte: "google", link: e.link }));
    return [...locais, ...google].filter((i) => fontes[i.fonte]).sort((a, b) => `${a.data}${a.hora ?? "99"}`.localeCompare(`${b.data}${b.hora ?? "99"}`));
  }, [eventos, tarefas, habitos, datas, revisoes, metas, recorrentes, fontes, desligadas, agendaGoogle.eventos]);
  const itens = useMemo(() => gerar(inicioISO, fimISO), [gerar, inicioISO, fimISO]);
  const proximosTodos = useMemo(() => gerar(hoje, fimProximos), [gerar, hoje, fimProximos]);
  const proximos = proximosTodos.filter((i) => !repeteTodoDia(i));
  const diariosProximos = [...new Map(proximosTodos.filter(repeteTodoDia).map((i) => [i.evento?.id ?? i.habito?.id, i])).values()];
  const doDiaSelecionado = useMemo(() => gerar(diaSelecionado, diaSelecionado), [gerar, diaSelecionado]);

  const esconderDiarios = vista !== "semana";
  const porDia: Record<string, Item[]> = {};
  const diariosPorDia: Record<string, number> = {};
  for (const i of itens) {
    if (esconderDiarios && repeteTodoDia(i)) diariosPorDia[i.data] = (diariosPorDia[i.data] ?? 0) + 1;
    else (porDia[i.data] ??= []).push(i);
  }
  const diariosDoDia = doDiaSelecionado.filter(repeteTodoDia);
  const doDia = doDiaSelecionado.filter((i) => !repeteTodoDia(i));
  const diaTodo = doDia.filter((i) => !i.hora);
  const comHora = doDia.filter((i) => i.hora);

  const mover = (n: number) => {
    const d = vista === "mes" ? addMonths(base, n) : vista === "semana" ? addWeeks(base, n) : addDays(base, n * 30);
    setFoco(paraISO(d));
  };

  const irParaHoje = () => {
    setFoco(hoje);
    setDiaSelecionado(hoje);
  };

  const exportarIcs = () => {
    const agoraIcs = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const regra: Record<Repeticao, string> = { nenhuma: "", diaria: "RRULE:FREQ=DAILY", semanal: "RRULE:FREQ=WEEKLY", mensal: "RRULE:FREQ=MONTHLY" };
    const corpo = eventos.map((e) => {
      const data = e.data.replace(/-/g, "");
      const inicio = e.hora ? `DTSTART:${data}T${e.hora.replace(":", "")}00` : `DTSTART;VALUE=DATE:${data}`;
      const excecoes = e.repeticao !== "nenhuma" ? (e.excecoes ?? []).map((x) => (e.hora ? `EXDATE:${x.replace(/-/g, "")}T${e.hora.replace(":", "")}00` : `EXDATE;VALUE=DATE:${x.replace(/-/g, "")}`)) : [];
      return ["BEGIN:VEVENT", `UID:${e.id}@niko`, `DTSTAMP:${agoraIcs}`, inicio, `SUMMARY:${escaparIcs(e.titulo)}`, regra[e.repeticao], ...excecoes, "END:VEVENT"].filter(Boolean).join("\r\n");
    });
    baixarArquivo("niko-calendario.ics", ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Niko//PT-BR", ...corpo, "END:VCALENDAR"].join("\r\n"), "text/calendar");
  };

  const importarIcs = async (arquivo: File) => {
    try {
      const texto = await lerArquivoTexto(arquivo, 2 * 1024 * 1024);
      const blocos = texto.replace(/\r\n[ \t]/g, "").split("BEGIN:VEVENT").slice(1, 500);
      let n = 0;
      for (const b of blocos) {
        const resumo = /SUMMARY[^:]*:(.*)/.exec(b)?.[1]?.trim().replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/g, " ");
        const inicio = /DTSTART[^:]*:(\d{8})(T(\d{4}))?/.exec(b);
        if (!resumo || !inicio) continue;
        const data = `${inicio[1].slice(0, 4)}-${inicio[1].slice(4, 6)}-${inicio[1].slice(6, 8)}`;
        if (!dataValida(data)) continue;
        const rr = /RRULE:FREQ=(DAILY|WEEKLY|MONTHLY)/.exec(b)?.[1];
        const excecoes = [...b.matchAll(/EXDATE[^:]*:([\d,TZ]+)/g)].flatMap((m) => m[1].split(",")).map((x) => `${x.slice(0, 4)}-${x.slice(4, 6)}-${x.slice(6, 8)}`).filter(dataValida);
        const criado = criarEvento({ titulo: resumo.slice(0, 120), data, hora: inicio[3] ? `${inicio[3].slice(0, 2)}:${inicio[3].slice(2)}` : undefined, tipo: "evento", repeticao: rr === "DAILY" ? "diaria" : rr === "WEEKLY" ? "semanal" : rr === "MONTHLY" ? "mensal" : "nenhuma" });
        if (rr && excecoes.length) atualizarEvento(criado.id, { excecoes: excecoes.slice(0, 400) });
        n++;
      }
      avisar(n ? T.calendario.importadosIcs(n) : T.validacao.arquivoInvalido);
    } catch {
      avisar(T.validacao.arquivoInvalido);
    }
  };

  const criarRapido = () => {
    const { titulo, hora, repeticao } = lerEventoRapido(rapido);
    if (!titulo) return;
    criarEvento({ titulo: titulo.slice(0, 120), data: diaSelecionado, hora, tipo: "evento", repeticao });
    setRapido("");
    avisar(T.calendario.criado(titulo));
  };

  const aplicarEdicao = (alvo: Edicao, novos: DadosDoEvento, escolha: EscopoDaEdicao, aviso: string) => {
    const atual = useOrganizacao.getState().eventos.find((e) => e.id === alvo.evento.id);
    if (!atual) return;
    const r = editarEvento(atual, alvo.ocorrencia, novos, escolha);
    atualizarEvento(atual.id, r.atualizar);
    if (r.criar) criarEvento(r.criar);
    avisar(aviso);
  };

  const pedirOuAplicar = (alvo: Edicao, novos: DadosDoEvento, texto: string, aviso: string) => {
    if (alvo.evento.repeticao === "nenhuma") aplicarEdicao(alvo, novos, "todos", aviso);
    else setEscopo({ texto, aoEscolher: (escolha) => aplicarEdicao(alvo, novos, escolha, aviso) });
  };

  const fecharForm = () => {
    setNovo(false);
    setEdicao(null);
  };

  const salvarForm = (novos: DadosDoEvento) => {
    const alvo = edicao;
    fecharForm();
    if (!alvo) {
      criarEvento(novos);
      return;
    }
    if (!mudouAlgo(alvo.evento, alvo.ocorrencia, novos)) return;
    pedirOuAplicar(alvo, novos, T.calendario.escopoEditar(alvo.evento.titulo), T.calendario.atualizado(novos.titulo));
  };

  const abrirEdicao = (i: Item) => {
    if (!i.evento) return;
    setDiaSelecionado(i.data);
    setEdicao({ evento: i.evento, ocorrencia: i.data });
  };

  const moverPara = (i: Item, destino: string) => {
    if (!i.evento || destino === i.data) return;
    const e = i.evento;
    pedirOuAplicar({ evento: e, ocorrencia: i.data }, { titulo: e.titulo, data: destino, hora: e.hora, tipo: e.tipo, repeticao: e.repeticao }, T.calendario.escopoMover(e.titulo), T.calendario.movido(e.titulo));
    setDiaSelecionado(destino);
  };

  const excluir = (i: Item) => {
    if (!i.evento) return undefined;
    const e = i.evento;
    const executar = (escolha: EscopoDaEdicao) => {
      const atual = useOrganizacao.getState().eventos.find((x) => x.id === e.id);
      if (!atual) return;
      const r = excluirOcorrencia(atual, i.data, escolha);
      if (r === "excluir") {
        const removido = excluirEvento(atual.id);
        if (removido) avisar(T.geral.excluido, () => restaurarEvento(removido));
        return;
      }
      const anteriores = atual.excecoes;
      atualizarEvento(atual.id, r);
      avisar(T.geral.excluido, () => atualizarEvento(atual.id, { excecoes: anteriores }));
    };
    return () => {
      if (e.repeticao === "nenhuma") executar("todos");
      else setEscopo({ texto: T.calendario.escopoExcluir(e.titulo), aoEscolher: executar });
    };
  };

  const abrirNoModulo = (i: Item) => {
    if (i.fonte === "google") return i.link ? { rotulo: T.calendario.abrirNoGoogle, abrir: () => abrirLink(i.link!) } : undefined;
    if (i.fonte === "eventos") return undefined;
    const rota = ROTA_DA_FONTE[i.fonte];
    return { rotulo: T.calendario.abrirEm(T.rotas[rota]), abrir: () => irPara(rota, rota === "journal" ? { data: i.data } : undefined) };
  };

  const propsDaLinha = (i: Item) => {
    const modulo = i.evento ? { abrir: () => abrirEdicao(i), rotulo: T.geral.editar } : abrirNoModulo(i);
    const props: Parameters<typeof LinhaDoDia>[0] = { i, aoAbrir: modulo?.abrir, rotuloAbrir: modulo?.rotulo, aoExcluir: i.evento ? excluir(i) : undefined };
    if (podeMarcarFeito(i)) {
      const feito = itemFeito(i, registros);
      props.feito = feito;
      props.aoMarcar = i.habito && i.data > hoje ? undefined : () => marcarItemFeito(i, !feito);
    }
    return props;
  };

  const iniciarArraste = (i: Item) => (e: EventoDePonteiro<HTMLElement>) => {
    if (!i.evento || e.button !== 0) return;
    setArraste({ item: i, inicioX: e.clientX, inicioY: e.clientY, x: e.clientX, y: e.clientY, ativo: false, alvo: null });
  };

  arrasteAtual.current = arraste;
  const moverParaAtual = useRef(moverPara);
  moverParaAtual.current = moverPara;

  useEffect(() => {
    if (!arraste) return;
    const aoMover = (e: PointerEvent) => {
      const a = arrasteAtual.current;
      if (!a) return;
      const ativo = a.ativo || Math.hypot(e.clientX - a.inicioX, e.clientY - a.inicioY) > DISTANCIA_PARA_ARRASTAR;
      if (!ativo) return;
      const sob = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-dia]") as HTMLElement | null;
      setArraste({ ...a, x: e.clientX, y: e.clientY, ativo, alvo: sob?.dataset.dia ?? null });
    };
    const aoSoltar = () => {
      const a = arrasteAtual.current;
      if (a?.ativo) {
        acabouDeArrastar.current = true;
        window.setTimeout(() => (acabouDeArrastar.current = false), 0);
        if (a.alvo) moverParaAtual.current(a.item, a.alvo);
      }
      setArraste(null);
    };
    const aoCancelar = () => setArraste(null);
    window.addEventListener("pointermove", aoMover);
    window.addEventListener("pointerup", aoSoltar);
    window.addEventListener("pointercancel", aoCancelar);
    window.addEventListener("blur", aoCancelar);
    return () => {
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("pointerup", aoSoltar);
      window.removeEventListener("pointercancel", aoCancelar);
      window.removeEventListener("blur", aoCancelar);
    };
  }, [Boolean(arraste)]);

  const abrirChip = (i: Item) => (i.evento ? () => { if (!acabouDeArrastar.current) abrirEdicao(i); } : undefined);

  const escolherDia = (iso: string) => {
    if (acabouDeArrastar.current) return;
    setDiaSelecionado(iso);
    if (vista === "mes" && !isSameMonth(deISO(iso), base)) setFoco(iso);
  };

  const criarNoDia = (iso: string) => {
    setDiaSelecionado(iso);
    setNovo(true);
  };

  const titulo = vista === "mes"
    ? <><span className="cl-titulo-mes">{formatarData(base, "MMMM")}</span> <em className="cl-titulo-ano">{formatarData(base, "yyyy")}</em></>
    : <>{`${formatar(inicioISO, "d MMM")} · ${formatar(fimISO, "d MMM")}`} <em className="cl-titulo-ano">{formatarData(intervalo.fim, "yyyy")}</em></>;

  const dias = eachDayOfInterval({ start: intervalo.inicio, end: intervalo.fim });
  const agrupadoAgenda = Object.entries(porDia);
  const diariosNoPeriodo = [...new Map(itens.filter(repeteTodoDia).map((i) => [i.evento?.id ?? i.habito?.id, i])).values()];
  const alvoDoArraste = arraste?.ativo ? arraste.alvo : null;

  const horasDaSemana = vista === "semana" ? itens.filter((i) => i.hora).map((i) => horasDecimais(i.hora as string)) : [];
  const primeiraHora = Math.min(PRIMEIRA_HORA, ...horasDaSemana.map(Math.floor));
  const ultimaHora = Math.max(ULTIMA_HORA, ...horasDaSemana.map(Math.floor));
  const horasGrade = Array.from({ length: ultimaHora - primeiraHora + 1 }, (_, n) => primeiraHora + n);
  const semDiaTodoNaSemana = vista === "semana" && !dias.some((d) => (porDia[paraISO(d)] ?? []).some((i) => !i.hora));
  const qtdDoDia = doDia.length + diariosDoDia.length;

  return (
    <>
      <CabecalhoAba
        titulo={titulo}
        subtitulo={T.calendario.subtitulo}
        acoes={
          <div className="cl-acoes">
            <div className="cl-acoes-linha">
              <label className="cl-botao-ics">
                <Upload size={12} />
                {T.calendario.importarIcs}
                <input type="file" accept=".ics,text/calendar" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importarIcs(f); e.target.value = ""; }} />
              </label>
              <button type="button" className="cl-botao-ics" onClick={exportarIcs} disabled={eventos.length === 0}>
                <Download size={12} />
                {T.calendario.exportarIcs}
              </button>
            </div>
            <div className="cl-acoes-linha">
              <Segmentado<Vista> rotulo={T.calendario.titulo} valor={vista} aoMudar={setVista} opcoes={(Object.keys(T.calendario.vistas) as Vista[]).map((v) => ({ valor: v, rotulo: T.calendario.vistas[v] }))} />
              <div className="cl-navegar">
                <button type="button" className="cl-navegar-seta" aria-label={T.geral.anterior} title={T.geral.anterior} onClick={() => mover(-1)}><ChevronLeft size={14} /></button>
                <button type="button" className="cl-navegar-hoje" onClick={irParaHoje}>{T.geral.hoje}</button>
                <button type="button" className="cl-navegar-seta" aria-label={T.geral.proximo} title={T.geral.proximo} onClick={() => mover(1)}><ChevronRight size={14} /></button>
              </div>
              <Botao variante="primario" className="cl-novo" icone={<Plus size={13} />} onClick={() => setNovo(true)}>{T.calendario.novoEvento}</Botao>
            </div>
          </div>
        }
      />

      <section className="cl-fontes" role="group" aria-label={T.calendario.mostrar}>
        <span className="cl-fontes-rotulo">{T.calendario.mostrar}</span>
        {FONTES.filter((f) => funcaoLigada(FUNCAO_DA_FONTE[f], desligadas)).filter((f) => f !== "habitos" || habitos.some((h) => !h.arquivado && h.hora)).filter((f) => f !== "google" || agendaGoogle.situacao !== "desligada").map((f) => (
          <button key={f} type="button" className="cl-fonte" style={corDa(f)} aria-pressed={fontes[f]} onClick={() => setFontes({ ...fontes, [f]: !fontes[f] })}>
            <span className="cl-ponto" />
            {T.calendario.fontes[f]}
          </button>
        ))}
        {agendaGoogle.situacao !== "desligada" && (
          <Botao
            pequeno
            soIcone
            variante="fantasma"
            icone={<RefreshCw size={14} className={agendaGoogle.situacao === "carregando" ? "atualizacao-girando" : undefined} />}
            aria-label={T.calendario.atualizarGoogle}
            title={T.calendario.atualizarGoogle}
            disabled={agendaGoogle.situacao === "carregando"}
            onClick={agendaGoogle.atualizar}
          />
        )}
      </section>

      {(agendaGoogle.situacao === "semPermissao" || agendaGoogle.situacao === "apiDesativada" || agendaGoogle.situacao === "erro") && (
        <AvisoFaixa>{agendaGoogle.situacao === "semPermissao" ? T.calendario.googleSemPermissao : agendaGoogle.situacao === "apiDesativada" ? T.calendario.googleApiDesativada : T.calendario.googleErro}</AvisoFaixa>
      )}

      <section className="cl-layout" data-arrastando={arraste?.ativo ? "sim" : undefined}>
        {vista === "mes" && (
          <div className="cl-quadro cl-principal">
            <div className="cl-mes-cabecalho">
              {T.calendario.diasSemana.map((d) => <span key={d}>{d}</span>)}
            </div>
            <div className="cl-mes">
              {dias.map((d, n) => {
                const iso = paraISO(d);
                const lista = porDia[iso] ?? [];
                const diarios = diariosPorDia[iso] ?? 0;
                return (
                  <button
                    key={iso}
                    type="button"
                    className="cl-dia"
                    data-dia={iso}
                    data-alvo={alvoDoArraste === iso ? "sim" : undefined}
                    data-fora={!isSameMonth(d, base) ? "sim" : "nao"}
                    data-hoje={iso === hoje ? "sim" : "nao"}
                    data-fds={n % 7 >= 5 ? "sim" : "nao"}
                    data-passado={iso < hoje ? "sim" : "nao"}
                    aria-pressed={iso === diaSelecionado}
                    aria-label={`${formatar(iso, "d 'de' MMMM")}, ${T.calendario.itensNoDia(lista.length + diarios)}`}
                    onClick={() => escolherDia(iso)}
                    onDoubleClick={() => criarNoDia(iso)}
                  >
                    <span className="cl-dia-topo">
                      <span className="cl-dia-numero">{d.getDate()}</span>
                      {diarios > 0 && <span className="cl-dia-diarios" title={T.calendario.diariosNoDia(diarios)}><Repeat size={10} />{diarios}</span>}
                    </span>
                    <span className="cl-dia-pontos" aria-hidden="true">
                      {lista.slice(0, 6).map((i) => <span key={i.id} className="cl-ponto" style={corDa(i.fonte)} />)}
                    </span>
                    <span className="cl-dia-chips">
                      {lista.slice(0, LIMITE_NO_DIA).map((i) => <Chip key={i.id} i={i} feito={itemFeito(i, registros)} aoAbrir={abrirChip(i)} aoIniciarArraste={i.evento ? iniciarArraste(i) : undefined} />)}
                      {lista.length > LIMITE_NO_DIA && <span className="cl-dia-mais">{T.calendario.mais(lista.length - LIMITE_NO_DIA)}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {vista === "semana" && (
          <div className="cl-quadro cl-principal cl-semana-quadro">
            <div className="cl-semana">
              <div className="cl-semana-cabecalho">
                <span />
                {dias.map((d, n) => {
                  const iso = paraISO(d);
                  return (
                    <button
                      key={iso}
                      type="button"
                      className="cl-semana-dia"
                      data-dia={iso}
                      data-hoje={iso === hoje ? "sim" : "nao"}
                      data-alvo={alvoDoArraste === iso ? "sim" : undefined}
                      aria-pressed={iso === diaSelecionado}
                      aria-label={`${formatar(iso, "d 'de' MMMM")}, ${T.calendario.itensNoDia((porDia[iso] ?? []).length)}`}
                      onClick={() => escolherDia(iso)}
                      onDoubleClick={() => criarNoDia(iso)}
                    >
                      <span className="cl-semana-rotulo">{T.calendario.diasSemana[n]}</span>
                      <span className="cl-semana-numero">{d.getDate()}</span>
                    </button>
                  );
                })}
              </div>
              {!semDiaTodoNaSemana && (
                <div className="cl-semana-dia-todo">
                  <span className="cl-semana-dia-todo-rotulo">{T.calendario.diaTodo}</span>
                  {dias.map((d) => {
                    const iso = paraISO(d);
                    return (
                      <div key={iso} className="cl-semana-dia-todo-celula" data-dia={iso} data-alvo={alvoDoArraste === iso ? "sim" : undefined} onDoubleClick={() => criarNoDia(iso)}>
                        {(porDia[iso] ?? []).filter((i) => !i.hora).map((i) => <Chip key={i.id} i={i} feito={itemFeito(i, registros)} aoAbrir={abrirChip(i)} aoIniciarArraste={i.evento ? iniciarArraste(i) : undefined} />)}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="cl-semana-grade" style={{ "--altura-hora": `${ALTURA_HORA}px` } as CSSProperties}>
                <div className="cl-semana-horas">
                  {horasGrade.map((h) => <span key={h}>{`${String(h).padStart(2, "0")}:00`}</span>)}
                </div>
                {dias.map((d) => {
                  const iso = paraISO(d);
                  return (
                    <div
                      key={iso}
                      className="cl-semana-coluna"
                      data-dia={iso}
                      data-hoje={iso === hoje ? "sim" : "nao"}
                      data-alvo={alvoDoArraste === iso ? "sim" : undefined}
                      data-selecionado={iso === diaSelecionado ? "sim" : "nao"}
                      onClick={() => escolherDia(iso)}
                      onDoubleClick={() => criarNoDia(iso)}
                    >
                      {emFaixas(porDia[iso] ?? []).map(({ item: i, faixa, faixas }) => {
                        const inicio = horasDecimais(i.hora as string);
                        const abrir = abrirChip(i);
                        return (
                          <div
                            key={i.id}
                            className="cl-bloco"
                            style={{ ...corDa(i.fonte), top: (inicio - primeiraHora) * ALTURA_HORA, height: ALTURA_HORA - 3, left: `calc(${(faixa / faixas) * 100}% + 3px)`, width: `calc(${100 / faixas}% - 6px)` }}
                            data-feito={itemFeito(i, registros) ? "sim" : undefined}
                            data-editavel={abrir ? "sim" : undefined}
                            title={`${i.hora} ${i.titulo}`}
                            onPointerDown={i.evento ? iniciarArraste(i) : undefined}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (abrir) abrir();
                              else escolherDia(iso);
                            }}
                          >
                            <span className="cl-bloco-titulo privado">{i.titulo}</span>
                            <span className="cl-bloco-hora">{i.hora}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                {hojeNaSemana && agora >= primeiraHora && agora <= ultimaHora + 1 && (
                  <div className="cl-agora" style={{ top: (agora - primeiraHora) * ALTURA_HORA }} aria-hidden="true" />
                )}
              </div>
            </div>
          </div>
        )}

        {vista === "agenda" && (
          <div className="cl-principal cl-agenda">
            {diariosNoPeriodo.length > 0 && (
              <div className="cl-agenda-diarios">
                <span className="cl-agenda-diarios-rotulo"><Repeat size={13} />{T.calendario.todoDia}</span>
                <div className="cl-agenda-chips">{diariosNoPeriodo.map((i) => <Chip key={i.id} i={i} feito={itemFeito(i, registros)} aoAbrir={abrirChip(i)} />)}</div>
              </div>
            )}
            {agrupadoAgenda.length === 0 ? (
              <div className="cl-quadro"><Vazio icone={<CalendarDays size={28} />} titulo={T.calendario.semItens} /></div>
            ) : agrupadoAgenda.map(([dia, lista]) => (
              <div key={dia} className="cl-agenda-dia" data-hoje={dia === hoje ? "sim" : "nao"} data-selecionado={dia === diaSelecionado ? "sim" : "nao"}>
                <button type="button" className="cl-agenda-data" onClick={() => setDiaSelecionado(dia)}>
                  <span className="cl-agenda-numero">{formatar(dia, "d")}</span>
                  <span className="cl-agenda-semana">{[formatar(dia, "EEE"), dia === hoje ? T.datas.hoje : formatar(dia, "MMM")].join(" · ")}</span>
                </button>
                <div className="cl-agenda-itens">
                  {lista.map((i) => <LinhaDoDia key={i.id} {...propsDaLinha(i)} i={i} />)}
                </div>
              </div>
            ))}
          </div>
        )}

        <aside className="cl-lateral">
          <article className="cl-painel" data-hoje={diaSelecionado === hoje ? "sim" : "nao"}>
            <div className="cl-painel-topo">
              <span className="cl-painel-numero">{formatar(diaSelecionado, "d")}</span>
              <span className="cl-painel-data">
                <b>{formatar(diaSelecionado, "EEEE")}</b>
                <span>{[formatar(diaSelecionado, "MMMM yyyy"), T.calendario.itensNoDia(qtdDoDia)].join(" · ")}</span>
              </span>
              <Botao pequeno soIcone variante="fantasma" icone={<Plus size={14} />} aria-label={T.calendario.novoEvento} title={T.calendario.novoEvento} onClick={() => setNovo(true)} />
            </div>

            <form className="cl-rapido" onSubmit={(e) => { e.preventDefault(); criarRapido(); }}>
              <button type="submit" className="cl-rapido-mais" aria-label={T.geral.criar} title={T.geral.criar} disabled={!rapido.trim()}><Plus size={12} /></button>
              <input className="cl-rapido-campo" value={rapido} maxLength={140} placeholder={T.calendario.rapido} aria-label={T.calendario.rapidoRotulo} onChange={(e) => setRapido(e.target.value)} />
            </form>

            {doDia.length === 0 && diariosDoDia.length === 0 ? (
              <p className="cl-painel-vazio">{T.calendario.diaLivre}</p>
            ) : (
              <div className="cl-painel-grupos">
                {diaTodo.length > 0 && (
                  <div className="cl-painel-grupo">
                    <span className="rotulo-secao">{T.calendario.diaTodo}</span>
                    {diaTodo.map((i) => <LinhaDoDia key={i.id} {...propsDaLinha(i)} i={i} compacta />)}
                  </div>
                )}
                {comHora.length > 0 && (
                  <div className="cl-painel-grupo">
                    <span className="rotulo-secao">{T.calendario.comHorario}</span>
                    {comHora.map((i) => <LinhaDoDia key={i.id} {...propsDaLinha(i)} i={i} compacta />)}
                  </div>
                )}
                {diariosDoDia.length > 0 && (
                  <div className="cl-painel-grupo">
                    <span className="rotulo-secao cl-rotulo-icone"><Repeat size={11} />{T.calendario.todoDia}</span>
                    {diariosDoDia.map((i) => <LinhaDoDia key={i.id} {...propsDaLinha(i)} i={i} compacta />)}
                  </div>
                )}
              </div>
            )}
          </article>

          <article className="cl-proximos">
            <header className="secao-cabecalho">
              <span className="secao-titulo">{T.calendario.proximos}</span>
              <span className="tracejado" />
            </header>
            {proximos.length === 0 && diariosProximos.length === 0 ? <p className="cl-painel-vazio">{T.calendario.semProximos}</p> : (
              <div className="cl-proximos-lista">
                {diariosProximos.length > 0 && (
                  <div className="cl-proximos-diarios">
                    <Repeat size={12} />
                    <span className="cortar privado">{diariosProximos.map((i) => (i.hora ? `${i.hora} ${i.titulo}` : i.titulo)).join(", ")}</span>
                  </div>
                )}
                {proximos.slice(0, 8).map((i) => (
                  <button key={i.id} type="button" className="cl-proximo" data-feito={itemFeito(i, registros) ? "sim" : undefined} style={corDa(i.fonte)} title={T.calendario.fontes[i.fonte]} onClick={() => { setFoco(i.data); setDiaSelecionado(i.data); }}>
                    <span className="cl-ponto" />
                    <span className="cl-proximo-titulo cortar privado">{i.titulo}</span>
                    <span className="cl-proximo-quando">{[i.data === hoje ? T.datas.hoje : formatar(i.data, "EEE d"), i.hora].filter(Boolean).join(" · ")}</span>
                  </button>
                ))}
              </div>
            )}
          </article>

          {sugerirGoogle && (
            <div className="cl-integracao">
              <span className="cl-integracao-icone"><Marca marca="agenda" tamanho={15} /></span>
              <span className="cl-integracao-texto">{T.calendario.integracaoTexto}</span>
              <Botao pequeno onClick={() => irPara("conexoes", { servico: "google" })}>{T.calendario.integracaoConectar}</Botao>
              <Botao pequeno soIcone variante="fantasma" icone={<X size={13} />} aria-label={T.calendario.integracaoEsconder} title={T.calendario.integracaoEsconder} onClick={() => definirConfig({ sugestaoAgendaGoogle: false })} />
            </div>
          )}
        </aside>
      </section>
      <p className="cl-dica">{T.calendario.dicaDuplo}</p>
      {arraste?.ativo && (
        <div className="cl-chip cl-chip-fantasma" style={{ ...corDa(arraste.item.fonte), left: arraste.x + 10, top: arraste.y + 10 }} aria-hidden="true">
          <span className="cl-ponto" />
          {arraste.item.hora && <span className="cl-chip-hora">{arraste.item.hora}</span>}
          <span className="cortar privado">{arraste.item.titulo}</span>
        </div>
      )}
      <FormEvento aberto={novo || Boolean(edicao)} dataInicial={diaSelecionado} edicao={edicao} aoSalvar={salvarForm} aoFechar={fecharForm} />
      <EscolhaDeEscopo pedido={escopo} aoFechar={() => setEscopo(null)} />
    </>
  );
}
