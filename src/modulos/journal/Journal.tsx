import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, getDaysInMonth, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Undo2, Redo2, Printer, Check, Minus, Pencil, Archive, Flame, Timer, CircleCheck, Circle, CalendarClock, CalendarArrowDown, X, Pause, Trash2 } from "lucide-react";
import { CabecalhoAba } from "../../componentes/CabecalhoAba";
import { Cartao, Botao, Campo, Modal, Segmentado, Vazio } from "../../componentes/basicos";
import { ICONE_STATUS, ORDEM_STATUS } from "../../componentes/ItemTarefa";
import { Editor } from "../../componentes/Editor";
import { BarrasVerticais } from "../../componentes/Graficos";
import { useRotina, tarefasDoDia, habitoCumprido, pendentesAntesDe, tarefaPendente, DIA_VAZIO } from "../../estado/rotina";
import { usePomodoro } from "../../estado/pomodoro";
import { useInterface } from "../../estado/interface";
import { useConfig } from "../../estado/configuracoes";
import { useAgentes } from "../../estado/agentes";
import { tocarSom } from "../../ponte/sons";
import { T } from "../../textos/textos";
import { deISO, formatar, formatarData, hojeISO, paraISO, diaDoMomento, horaValida } from "../../utilitarios/datas";
import { interpretarQuando } from "../../utilitarios/linguagem";
import { sequenciaHabito } from "../../utilitarios/estatisticas";
import { EVENTO_NOVO } from "../../janelas/area-de-trabalho/usarAtalhos";
import type { Habito, Humor, StatusTarefa, Tarefa, TipoHabito } from "../../tipos";
import { somar } from "../../utilitarios/basicos";
import { CopoAgua, litros } from "./CopoAgua";
import { imprimirMes } from "./impressao";

type Periodo = "manha" | "tarde" | "noite";
type Vista = "dia" | "semana";

const PERIODOS: Periodo[] = ["manha", "tarde", "noite"];
const HUMORES = Object.keys(T.humor) as Humor[];

function periodoDaHora(hora: string): Periodo {
  const h = Number(hora.slice(0, 2));
  if (h >= 18 || h < 4) return "noite";
  if (h >= 12) return "tarde";
  return "manha";
}

function decimal(n: number) {
  return n.toFixed(1).replace(".", ",");
}

function percentualFeito(lista: Tarefa[]) {
  if (lista.length === 0) return 0;
  return Math.round((lista.filter((t) => t.status === "concluida").length / lista.length) * 100);
}

function useFecharAoClicarFora(aberto: boolean, fechar: () => void) {
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const aoApertar = (e: PointerEvent) => {
      if (!caixa.current?.contains(e.target as Node)) fechar();
    };
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    window.addEventListener("pointerdown", aoApertar);
    window.addEventListener("keydown", aoTeclar);
    return () => {
      window.removeEventListener("pointerdown", aoApertar);
      window.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto, fechar]);
  return caixa;
}

function MiniCalendario({ data, aoEscolher }: { data: string; aoEscolher: (d: string) => void }) {
  const [mes, setMes] = useState(() => startOfMonth(deISO(data)));
  const tarefas = useRotina((s) => s.tarefas);
  const dias = useRotina((s) => s.dias);
  useEffect(() => setMes(startOfMonth(deISO(data))), [data]);
  const grade = eachDayOfInterval({ start: startOfWeek(mes, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(mes), { weekStartsOn: 1 }) });
  const hoje = hojeISO();
  const comConteudo = new Set([...tarefas.filter((t) => t.data).map((t) => t.data as string), ...Object.entries(dias).filter(([, d]) => d.diario || d.nota || d.humor).map(([k]) => k)]);

  return (
    <div className="jn-mini">
      <div className="jn-mini-topo">
        <Botao pequeno soIcone variante="fantasma" icone={<ChevronLeft size={14} />} aria-label={T.geral.anterior} onClick={() => setMes(addMonths(mes, -1))} />
        <span className="jn-mini-mes">{formatarData(mes, "MMMM yyyy")}</span>
        <Botao pequeno soIcone variante="fantasma" icone={<ChevronRight size={14} />} aria-label={T.geral.proximo} onClick={() => setMes(addMonths(mes, 1))} />
      </div>
      <div className="jn-mini-grade" role="grid">
        {T.calendario.diasSemana.map((d) => (
          <span key={d} className="jn-mini-cabecalho">{d.slice(0, 1)}</span>
        ))}
        {grade.map((d) => {
          const iso = paraISO(d);
          return (
            <button
              key={iso}
              type="button"
              className="jn-mini-dia"
              data-fora={isSameMonth(d, mes) ? "nao" : "sim"}
              data-hoje={iso === hoje ? "sim" : "nao"}
              aria-pressed={iso === data}
              aria-label={formatar(iso, "d 'de' MMMM")}
              onClick={() => aoEscolher(iso)}
            >
              {d.getDate()}
              {comConteudo.has(iso) && <span className="jn-mini-ponto" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function IconeDoMarcador({ status }: { status: StatusTarefa }) {
  if (status === "reagendada") return <CalendarClock />;
  if (status === "cancelada") return <X />;
  if (status === "em_aguardo") return <Pause />;
  return <Check />;
}

function trazerParaHoje(ids: string[]) {
  const alvo = new Set(ids);
  const datasOriginais = new Map<string, string[]>();
  for (const t of useRotina.getState().tarefas) {
    if (!alvo.has(t.id) || !t.data) continue;
    datasOriginais.set(t.data, [...(datasOriginais.get(t.data) ?? []), t.id]);
  }
  const movidas = useRotina.getState().moverTarefas(ids, hojeISO());
  if (movidas === 0) return;
  useInterface.getState().avisar(T.journal.trazidas(movidas), () => {
    for (const [data, deVolta] of datasOriginais) useRotina.getState().moverTarefas(deVolta, data);
  });
}

function PendentesAnteriores({ hoje }: { hoje: string }) {
  const tarefas = useRotina((s) => s.tarefas);
  const pendentes = useMemo(() => pendentesAntesDe(tarefas, hoje), [tarefas, hoje]);
  const [aberto, setAberto] = useState(false);
  if (pendentes.length === 0) return null;
  return (
    <div className="jn-pendentes">
      <div className="jn-pendentes-topo">
        <CalendarClock size={14} className="jn-pendentes-icone" />
        <span className="jn-pendentes-titulo">{T.journal.pendentes(pendentes.length)}</span>
        <Botao pequeno variante="fantasma" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>{aberto ? T.journal.ocultarPendentes : T.journal.verPendentes}</Botao>
        <Botao pequeno onClick={() => trazerParaHoje(pendentes.map((t) => t.id))}>{T.journal.trazerTodas}</Botao>
      </div>
      {aberto && (
        <ul className="jn-pendentes-lista" aria-label={T.journal.pendentesLista}>
          {pendentes.map((t) => (
            <li key={t.id} className="jn-pendentes-item">
              <span className="jn-pendentes-data" title={formatar(t.data as string, "EEEE, d 'de' MMMM")}>{formatar(t.data as string, "dd/MM")}</span>
              <span className="jn-pendentes-nome cortar privado">{t.titulo}</span>
              {t.hora && <span className="jn-tarefa-hora">{t.hora}</span>}
              <Botao pequeno variante="fantasma" aria-label={T.journal.trazerTarefa(t.titulo)} onClick={() => trazerParaHoje([t.id])}>{T.journal.trazer}</Botao>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TarefaDoDia({ tarefa }: { tarefa: Tarefa }) {
  const mudarStatus = useRotina((s) => s.mudarStatus);
  const atualizar = useRotina((s) => s.atualizarTarefa);
  const excluir = useRotina((s) => s.excluirTarefa);
  const restaurar = useRotina((s) => s.restaurarTarefa);
  const avisar = useInterface((s) => s.avisar);
  const [editando, setEditando] = useState(false);
  const [titulo, setTitulo] = useState(tarefa.titulo);
  const [menu, setMenu] = useState(false);
  const fecharMenu = useMemo(() => () => setMenu(false), []);
  const caixaMenu = useFecharAoClicarFora(menu, fecharMenu);
  const feita = tarefa.status === "concluida";
  const encerrada = feita || tarefa.status === "cancelada";
  const checklistFeito = tarefa.checklist.filter((c) => c.feito).length;

  const mudar = (s: StatusTarefa) => {
    mudarStatus(tarefa.id, s);
    if (s === "concluida") {
      void tocarSom("finish", "personagens");
      useAgentes.getState().registrar("organizador", `${T.geral.concluir}: ${tarefa.titulo}`);
    }
  };

  const salvarTitulo = () => {
    const limpo = titulo.trim();
    if (limpo && limpo !== tarefa.titulo) atualizar(tarefa.id, { titulo: limpo.slice(0, 200) });
    else setTitulo(tarefa.titulo);
    setEditando(false);
  };

  return (
    <div className="jn-tarefa" data-encerrada={encerrada ? "sim" : "nao"}>
      <div className="jn-tarefa-status" ref={caixaMenu}>
        <button
          type="button"
          className="marcador jn-marcador"
          role="checkbox"
          aria-checked={feita}
          data-status={tarefa.status}
          aria-label={T.status[tarefa.status]}
          title={T.geral.dicaStatus(T.status[tarefa.status])}
          aria-haspopup="menu"
          onClick={() => mudar(feita ? "a_fazer" : "concluida")}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setMenu(true);
            }
          }}
        >
          <IconeDoMarcador status={tarefa.status} />
        </button>
        {menu && (
          <div className="menu-flutuante" role="menu" style={{ top: 24, left: 0 }}>
            {ORDEM_STATUS.map((s) => {
              const I = ICONE_STATUS[s];
              return (
                <button
                  key={s}
                  type="button"
                  role="menuitemradio"
                  aria-checked={s === tarefa.status}
                  className="menu-item"
                  onClick={() => {
                    mudar(s);
                    setMenu(false);
                  }}
                >
                  <I size={14} className={`status-${s}`} />
                  {T.status[s]}
                </button>
              );
            })}
            {tarefa.data !== hojeISO() && tarefaPendente(tarefa) && (
              <>
                <div className="menu-separador" role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  onClick={() => {
                    setMenu(false);
                    trazerParaHoje([tarefa.id]);
                  }}
                >
                  <CalendarArrowDown size={14} />
                  {T.journal.trazerParaHoje}
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {editando ? (
        <input
          className="campo jn-tarefa-campo"
          value={titulo}
          autoFocus
          maxLength={200}
          aria-label={T.geral.editar}
          onChange={(e) => setTitulo(e.target.value)}
          onBlur={salvarTitulo}
          onKeyDown={(e) => {
            if (e.key === "Enter") salvarTitulo();
            if (e.key === "Escape") {
              setTitulo(tarefa.titulo);
              setEditando(false);
            }
          }}
        />
      ) : (
        <button type="button" className="jn-tarefa-titulo privado" title={T.geral.editar} onDoubleClick={() => setEditando(true)} onKeyDown={(e) => e.key === "F2" && setEditando(true)}>
          {tarefa.titulo}
        </button>
      )}
      {tarefa.checklist.length > 0 && <span className="jn-tarefa-extra">{`${checklistFeito}/${tarefa.checklist.length}`}</span>}
      <span className="jn-tarefa-prioridade" data-prioridade={tarefa.prioridade} role="img" aria-label={T.journal.prioridade(T.prioridade[tarefa.prioridade])} title={T.journal.prioridade(T.prioridade[tarefa.prioridade])} />
      <span className="jn-tarefa-hora">{tarefa.hora ?? ""}</span>
      <button
        type="button"
        className="jn-tarefa-excluir"
        aria-label={T.geral.excluir}
        title={T.geral.excluir}
        onClick={() => {
          const removida = excluir(tarefa.id);
          if (removida) avisar(T.geral.excluido, () => restaurar(removida));
        }}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function GradeHabitos({ data }: { data: string }) {
  const habitos = useRotina((s) => s.habitos).filter((h) => !h.arquivado);
  const registros = useRotina((s) => s.registros);
  const registrar = useRotina((s) => s.registrarHabito);
  const atualizar = useRotina((s) => s.atualizarHabito);
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<Habito | null>(null);
  const mes = startOfMonth(deISO(data));
  const dias = Array.from({ length: getDaysInMonth(mes) }, (_, i) => paraISO(addDays(mes, i)));
  const hoje = hojeISO();

  return (
    <section className="cartao jn-habitos">
      <header className="secao-cabecalho">
        <span className="secao-titulo">{T.journal.habitos}</span>
        <span className="secao-extra jn-habitos-mes">{formatarData(mes, "MMMM")}</span>
        <span className="tracejado" />
        <Botao pequeno icone={<Plus size={12} />} onClick={() => setCriando(true)}>{T.journal.novoHabito}</Botao>
      </header>
      {habitos.length === 0 ? (
        <Vazio titulo={T.journal.semHabitos} texto={T.journal.semHabitosDica} acao={<Botao variante="primario" onClick={() => setCriando(true)}>{T.journal.novoHabito}</Botao>} />
      ) : (
        <div className="jn-habitos-lista">
          {habitos.map((h) => {
            const cumpridos = dias.filter((d) => d <= hoje && habitoCumprido(h, registros[d]?.[h.id])).length;
            const passados = dias.filter((d) => d <= hoje).length;
            const meta = [h.hora, h.tipo === "quantidade" ? T.journal.metaPorDia(h.meta, h.unidade) : T.journal.simNao].filter(Boolean).join(" · ");
            return (
              <div key={h.id} className="jn-habito">
                <span className="jn-habito-nome">
                  <span className="cortar">{h.nome}</span>
                  <span className="jn-habito-meta cortar">{meta}</span>
                </span>
                <div className="jn-habito-dias" style={{ gridTemplateColumns: `repeat(${dias.length}, minmax(0, 1fr))` }}>
                  {dias.map((d) => {
                    const valor = registros[d]?.[h.id] ?? 0;
                    const feito = habitoCumprido(h, valor);
                    const futuro = d > hoje;
                    const rotulo = `${h.nome} ${formatar(d, "d MMM")}${h.tipo === "quantidade" ? `: ${valor}/${h.meta} ${h.unidade}` : ""}`;
                    return (
                      <button
                        key={d}
                        type="button"
                        className="jn-habito-dia"
                        data-estado={feito ? "feito" : valor > 0 ? "parcial" : "nao"}
                        data-hoje={d === hoje ? "sim" : "nao"}
                        data-selecionado={d === data ? "sim" : "nao"}
                        disabled={futuro}
                        aria-label={rotulo}
                        title={rotulo}
                        onClick={() => registrar(d, h.id, h.tipo === "sim_nao" ? (feito ? 0 : 1) : valor >= h.meta ? 0 : valor + 1)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          if (h.tipo === "quantidade") registrar(d, h.id, valor - 1);
                        }}
                      >
                        {h.tipo === "quantidade" && valor > 0 && !feito ? valor : ""}
                      </button>
                    );
                  })}
                </div>
                <span className="jn-habito-resumo">
                  <span className="jn-habito-sequencia"><Flame size={12} />{T.journal.sequencia(sequenciaHabito(h, registros))}</span>
                  <span className="jn-habito-mes">{T.journal.doMes(passados ? Math.round((cumpridos / passados) * 100) : 0)}</span>
                </span>
                <span className="jn-habito-acoes">
                  <Botao pequeno soIcone variante="fantasma" icone={<Pencil size={12} />} aria-label={T.journal.editarHabito} title={T.journal.editarHabito} onClick={() => setEditando(h)} />
                  <Botao pequeno soIcone variante="fantasma" icone={<Archive size={12} />} aria-label={T.journal.arquivar} title={T.journal.arquivar} onClick={() => atualizar(h.id, { arquivado: true })} />
                </span>
              </div>
            );
          })}
        </div>
      )}
      <NovoHabito aberto={criando || Boolean(editando)} habito={editando} aoFechar={() => { setCriando(false); setEditando(null); }} />
    </section>
  );
}

function NovoHabito({ aberto, habito, aoFechar }: { aberto: boolean; habito?: Habito | null; aoFechar: () => void }) {
  const criar = useRotina((s) => s.criarHabito);
  const atualizar = useRotina((s) => s.atualizarHabito);
  const habitos = useRotina((s) => s.habitos);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoHabito>("sim_nao");
  const [meta, setMeta] = useState("8");
  const [unidade, setUnidade] = useState("");
  const [hora, setHora] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});

  useEffect(() => {
    if (aberto) {
      setNome(habito?.nome ?? "");
      setTipo(habito?.tipo ?? "sim_nao");
      setMeta(habito && habito.tipo === "quantidade" ? String(habito.meta) : "8");
      setUnidade(habito?.unidade ?? "");
      setHora(habito?.hora ?? "");
      setErros({});
    }
  }, [aberto, habito]);

  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    const novos: Record<string, string> = {};
    const limpo = nome.trim();
    if (!limpo) novos.nome = T.validacao.obrigatorio;
    else if (habitos.some((h) => !h.arquivado && h.id !== habito?.id && h.nome.toLowerCase() === limpo.toLowerCase())) novos.nome = T.validacao.duplicado;
    const n = Number(meta);
    if (tipo === "quantidade" && (!Number.isInteger(n) || n < 1 || n > 1000)) novos.meta = T.validacao.entre(1, 1000);
    if (hora && !horaValida(hora)) novos.hora = T.validacao.horaInvalida;
    setErros(novos);
    if (Object.keys(novos).length) return;
    const dados = { nome: limpo.slice(0, 60), tipo, meta: tipo === "quantidade" ? n : 1, unidade: unidade.trim().slice(0, 20), hora: hora || undefined };
    if (habito) atualizar(habito.id, dados);
    else criar(dados);
    aoFechar();
  };

  return (
    <Modal aberto={aberto} titulo={habito ? T.journal.editarHabito : T.journal.novoHabito} aoFechar={aoFechar}>
      <form className="formulario" onSubmit={salvar} noValidate>
        <Campo id="h-nome" rotulo={T.journal.nomeHabito} obrigatorio erro={erros.nome}>
          <input id="h-nome" className="campo" value={nome} maxLength={60} aria-invalid={!!erros.nome} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        <Campo id="h-hora" rotulo={T.journal.horaHabito} dica={T.journal.horaHabitoDica} erro={erros.hora}>
          <input id="h-hora" type="time" className="campo" value={hora} aria-invalid={!!erros.hora} onChange={(e) => setHora(e.target.value)} />
        </Campo>
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.journal.tipoHabito}</span>
          <Segmentado<TipoHabito> rotulo={T.journal.tipoHabito} valor={tipo} aoMudar={setTipo} opcoes={[{ valor: "sim_nao", rotulo: T.journal.simNao }, { valor: "quantidade", rotulo: T.journal.quantidade }]} />
        </div>
        {tipo === "quantidade" && (
          <div className="formulario-linha">
            <Campo id="h-meta" rotulo={T.journal.meta} obrigatorio erro={erros.meta}>
              <input id="h-meta" className="campo" inputMode="numeric" value={meta} aria-invalid={!!erros.meta} onChange={(e) => setMeta(e.target.value.replace(/\D/g, ""))} />
            </Campo>
            <Campo id="h-unidade" rotulo={T.journal.unidade} dica={T.journal.unidadeExemplo}>
              <input id="h-unidade" className="campo" value={unidade} maxLength={20} onChange={(e) => setUnidade(e.target.value)} />
            </Campo>
          </div>
        )}
        <div className="formulario-acoes">
          <Botao onClick={aoFechar}>{T.geral.cancelar}</Botao>
          <Botao type="submit" variante="primario">{habito ? T.geral.salvar : T.geral.criar}</Botao>
        </div>
      </form>
    </Modal>
  );
}

function rotuloDoDia(iso: string) {
  return formatar(iso, "EEEE, d MMM").replace("-feira", "");
}

export default function Journal() {
  const parametros = useInterface((s) => s.parametros);
  const avisar = useInterface((s) => s.avisar);
  const [data, setData] = useState(parametros.data && /^\d{4}-\d{2}-\d{2}$/.test(parametros.data) ? parametros.data : hojeISO());
  const tarefas = useRotina((s) => s.tarefas);
  const dias = useRotina((s) => s.dias);
  const criarTarefa = useRotina((s) => s.criarTarefa);
  const atualizarDia = useRotina((s) => s.atualizarDia);
  const desfazer = useRotina((s) => s.desfazer);
  const refazer = useRotina((s) => s.refazer);
  const podeDesfazer = useRotina((s) => s.passado.length > 0);
  const podeRefazer = useRotina((s) => s.futuro.length > 0);
  const sessoes = usePomodoro((s) => s.sessoes);
  const virada = useConfig((s) => s.viradaAs4h);
  const [novaTarefa, setNovaTarefa] = useState("");
  const [erroTarefa, setErroTarefa] = useState("");
  const [salvo, setSalvo] = useState(false);
  const [vista, setVista] = useState<Vista>("dia");
  const [escolhendoData, setEscolhendoData] = useState(false);
  const fecharEscolha = useMemo(() => () => setEscolhendoData(false), []);
  const caixaData = useFecharAoClicarFora(escolhendoData, fecharEscolha);
  const hoje = hojeISO();
  const dia = dias[data] ?? DIA_VAZIO;
  const doDia = tarefasDoDia(tarefas, data);
  const focoDoDia = (d: string) => sessoes.filter((s) => s.etapa === "foco" && s.situacao === "concluida" && diaDoMomento(s.inicio) === d);
  const pomodoros = focoDoDia(data);

  useEffect(() => {
    if (parametros.data && /^\d{4}-\d{2}-\d{2}$/.test(parametros.data)) setData(parametros.data);
  }, [parametros.data]);

  useEffect(() => {
    const aoNovo = (e: Event) => {
      if ((e as CustomEvent).detail !== "journal") return;
      setVista("dia");
      window.setTimeout(() => document.getElementById("j-nova")?.focus(), 0);
    };
    window.addEventListener(EVENTO_NOVO, aoNovo);
    return () => window.removeEventListener(EVENTO_NOVO, aoNovo);
  }, []);

  const marcarSalvo = () => {
    setSalvo(true);
    window.setTimeout(() => setSalvo(false), 1400);
  };

  const mudarDia = (parcial: Partial<typeof dia>) => {
    atualizarDia(data, parcial);
    marcarSalvo();
  };

  const adicionar = (e: React.FormEvent) => {
    e.preventDefault();
    const limpo = novaTarefa.trim();
    if (!limpo) {
      setErroTarefa(T.validacao.obrigatorio);
      return;
    }
    const q = interpretarQuando(limpo);
    criarTarefa({ titulo: q.resto || limpo, data: q.data ?? data, hora: q.hora });
    setNovaTarefa("");
    setErroTarefa("");
  };

  const mes = startOfMonth(deISO(data));
  const sonoDoMes = useMemo(() => {
    const lista = Array.from({ length: getDaysInMonth(mes) }, (_, i) => paraISO(addDays(mes, i)));
    return lista.map((d) => ({ rotulo: d.slice(8), valor: dias[d]?.sono ?? 0, detalhe: `${formatar(d, "d/MM")}: ${dias[d]?.sono ?? 0} h` }));
  }, [dias, mes]);
  const comSono = sonoDoMes.filter((s) => s.valor > 0);
  const media = comSono.length ? decimal(somar(comSono, (s) => s.valor) / comSono.length) : "0";
  const semana = eachDayOfInterval({ start: startOfWeek(deISO(data), { weekStartsOn: 1 }), end: endOfWeek(deISO(data), { weekStartsOn: 1 }) }).map(paraISO);
  const passo = vista === "semana" ? 7 : 1;
  const feitasDoDia = doDia.filter((t) => t.status === "concluida").length;
  const semHora = doDia.filter((t) => !t.hora);
  const porPeriodo = (p: Periodo) => doDia.filter((t) => t.hora && periodoDaHora(t.hora) === p);

  return (
    <>
      <CabecalhoAba
        titulo={T.journal.titulo}
        subtitulo={T.journal.subtitulo}
        acoes={
          <div className="jn-acoes">
            <div className="jn-acoes-linha">
              <span className="etiqueta etiqueta-sucesso jn-salvo" data-visivel={salvo ? "sim" : "nao"} aria-live="polite">{T.geral.salvo}</span>
              {virada && <span className="jn-virada">{T.journal.viradaAtiva}</span>}
              <Botao soIcone variante="fantasma" icone={<Undo2 size={14} />} aria-label={T.geral.desfazer} title={`${T.geral.desfazer} (Ctrl + Z)`} disabled={!podeDesfazer} onClick={desfazer} />
              <Botao soIcone variante="fantasma" icone={<Redo2 size={14} />} aria-label={T.geral.refazer} title={`${T.geral.refazer} (Ctrl + Shift + Z)`} disabled={!podeRefazer} onClick={refazer} />
              <Botao icone={<Printer size={13} />} onClick={() => imprimirMes(mes, () => avisar(T.journal.impressao.falhou))}>{T.journal.imprimirMes}</Botao>
            </div>
            <div className="jn-acoes-linha">
              <Segmentado<Vista> rotulo={T.journal.vistas} valor={vista} aoMudar={setVista} opcoes={[{ valor: "dia", rotulo: T.journal.vistaDia }, { valor: "semana", rotulo: T.calendario.vistas.semana }]} />
              <div className="jn-navegar">
                <button type="button" className="jn-navegar-seta" aria-label={T.geral.anterior} title={T.geral.anterior} onClick={() => setData(paraISO(addDays(deISO(data), -passo)))}>
                  <ChevronLeft size={14} />
                </button>
                <div className="jn-navegar-caixa" ref={caixaData}>
                  <button type="button" className="jn-navegar-data" aria-haspopup="dialog" aria-expanded={escolhendoData} title={T.journal.irParaData} onClick={() => setEscolhendoData((v) => !v)}>
                    {rotuloDoDia(data)}
                  </button>
                  {escolhendoData && (
                    <div className="jn-popover" role="dialog" aria-label={T.journal.irParaData}>
                      <MiniCalendario data={data} aoEscolher={(d) => { setData(d); setEscolhendoData(false); }} />
                    </div>
                  )}
                </div>
                <button type="button" className="jn-navegar-seta" aria-label={T.geral.proximo} title={T.geral.proximo} onClick={() => setData(paraISO(addDays(deISO(data), passo)))}>
                  <ChevronRight size={14} />
                </button>
              </div>
              <Botao onClick={() => setData(paraISO(addDays(deISO(hoje), -1)))}>{T.geral.ontem}</Botao>
              <Botao variante="primario" onClick={() => setData(hoje)} disabled={data === hoje}>{T.journal.hoje}</Botao>
            </div>
          </div>
        }
      />

      <section className="jn-faixa" aria-label={T.journal.semana}>
        {semana.map((d, n) => {
          const registro = dias[d];
          const lista = tarefasDoDia(tarefas, d);
          const p = percentualFeito(lista);
          return (
            <button
              key={d}
              type="button"
              className="jn-faixa-dia"
              data-hoje={d === hoje ? "sim" : "nao"}
              data-futuro={d > hoje ? "sim" : "nao"}
              aria-pressed={d === data}
              aria-label={T.journal.progressoDoDia(formatar(d, "EEEE, d 'de' MMMM"), p)}
              onClick={() => setData(d)}
            >
              <span className="jn-faixa-topo">
                <span className="jn-faixa-rotulo">{T.calendario.diasSemana[n]}</span>
                <span className="jn-humor-ponto" data-humor={registro?.humor ?? "nenhum"} />
              </span>
              <span className="jn-faixa-numero">{Number(d.slice(8))}</span>
              <span className="jn-faixa-trilho"><span style={{ width: `${p}%` }} /></span>
            </button>
          );
        })}
      </section>

      {vista === "dia" ? (
        <>
          <section className="jn-colunas">
            <div className="jn-coluna">
              <Cartao className="jn-tarefas" titulo={T.journal.tarefas} acoes={doDia.length > 0 ? <span className="secao-extra mono">{T.journal.tarefasFeitas(feitasDoDia, doDia.length)}</span> : undefined}>
                <form onSubmit={adicionar} className="jn-nova" noValidate>
                  <div className="jn-nova-caixa" data-erro={erroTarefa ? "sim" : "nao"}>
                    <button type="submit" className="jn-nova-mais" aria-label={T.geral.adicionar} title={T.geral.adicionar}>
                      <Plus size={14} />
                    </button>
                    <input
                      id="j-nova"
                      className="jn-nova-campo"
                      value={novaTarefa}
                      maxLength={200}
                      placeholder={T.journal.novaTarefa}
                      aria-label={T.journal.novaTarefa}
                      aria-invalid={!!erroTarefa}
                      onChange={(e) => {
                        setNovaTarefa(e.target.value);
                        setErroTarefa("");
                      }}
                    />
                    {!novaTarefa && <span className="jn-nova-exemplo" aria-hidden="true">{T.journal.novaTarefaExemplo}</span>}
                  </div>
                  {erroTarefa && <span className="campo-erro">{erroTarefa}</span>}
                </form>
                {data === hoje && <PendentesAnteriores hoje={hoje} />}
                {doDia.length === 0 && <p className="jn-sem-tarefas">{T.journal.semTarefas}</p>}
                {semHora.length > 0 && (
                  <div className="jn-periodo">
                    <span className="jn-periodo-nome">{T.journal.semHora}</span>
                    <div className="jn-periodo-lista">
                      {semHora.map((t) => <TarefaDoDia key={t.id} tarefa={t} />)}
                    </div>
                  </div>
                )}
                {PERIODOS.map((p) => (
                  <div key={p} className="jn-periodo">
                    <span className="jn-periodo-nome">{T.journal[p]}</span>
                    <div className="jn-periodo-lista">
                      <input
                        className="jn-periodo-plano"
                        maxLength={120}
                        placeholder={T.journal.planoDoPeriodo(T.journal[p])}
                        aria-label={`${T.journal[p]} ${format(deISO(data), "dd/MM")}`}
                        value={dia[p]}
                        onChange={(e) => mudarDia({ [p]: e.target.value })}
                      />
                      {porPeriodo(p).map((t) => <TarefaDoDia key={t.id} tarefa={t} />)}
                    </div>
                  </div>
                ))}
              </Cartao>

              <Cartao className="jn-diario" titulo={T.journal.diario}>
                <Editor chave={`diario-${data}`} conteudo={dia.diario} placeholder={T.journal.diarioVazio} aoMudar={(html) => mudarDia({ diario: html })} />
              </Cartao>
            </div>

            <div className="jn-coluna">
              <Cartao titulo={T.journal.humor}>
                <div className="jn-humores" role="radiogroup" aria-label={T.journal.humor}>
                  {HUMORES.map((h) => (
                    <button key={h} type="button" role="radio" className="jn-humor" aria-checked={dia.humor === h} onClick={() => mudarDia({ humor: dia.humor === h ? undefined : h })}>
                      <span className="jn-humor-ponto" data-humor={h} />
                      {T.humor[h]}
                    </button>
                  ))}
                </div>
              </Cartao>

              <Cartao titulo={T.journal.sono} acoes={<span className="secao-extra">{T.journal.mediaSono(media)}</span>}>
                <div className="jn-sono">
                  <label className="jn-sono-campo">
                    <span>{T.journal.dormiu}</span>
                    <input type="time" className="campo" value={dia.dormiu ?? ""} onChange={(e) => mudarDia({ dormiu: e.target.value || undefined })} />
                  </label>
                  <label className="jn-sono-campo">
                    <span>{T.journal.acordou}</span>
                    <input type="time" className="campo" value={dia.acordou ?? ""} onChange={(e) => mudarDia({ acordou: e.target.value || undefined })} />
                  </label>
                  <div className="jn-sono-total">
                    <span className="jn-sono-numero">{decimal(dia.sono ?? 0)}</span>
                    <span className="jn-sono-unidade">{T.journal.horasSono}</span>
                    <span className="jn-sono-ajuste">
                      <button type="button" aria-label={T.journal.sonoMais} title={T.journal.sonoMais} onClick={() => mudarDia({ sono: Math.min(16, (dia.sono ?? 0) + 0.5) })}><Plus size={11} /></button>
                      <button type="button" aria-label={T.journal.sonoMenos} title={T.journal.sonoMenos} disabled={!dia.sono} onClick={() => mudarDia({ sono: Math.max(0, (dia.sono ?? 0) - 0.5) })}><Minus size={11} /></button>
                    </span>
                  </div>
                </div>
                <div className="jn-sono-grafico">
                  <BarrasVerticais barras={sonoDoMes} formatar={(v) => `${v} h`} altura={56} aoEscolher={(i) => setData(paraISO(addDays(mes, i)))} selecionada={Number(data.slice(8)) - 1} />
                </div>
              </Cartao>

              <CopoAgua data={data} />

              <Cartao className="jn-nota" titulo={T.journal.nota}>
                <textarea className="jn-nota-texto" value={dia.nota} maxLength={1000} placeholder={T.journal.notaVazia} aria-label={T.journal.nota} onChange={(e) => mudarDia({ nota: e.target.value })} />
                {pomodoros.length > 0 && (
                  <span className="jn-nota-foco"><Timer size={12} />{T.journal.pomodorosDoDia(pomodoros.length, somar(pomodoros, (p) => p.minutos))}</span>
                )}
              </Cartao>
            </div>
          </section>

          <GradeHabitos data={data} />
        </>
      ) : (
        <>
          <section className="jn-semana">
            {semana.map((d, n) => {
              const registro = dias[d];
              const lista = tarefasDoDia(tarefas, d);
              const foco = somar(focoDoDia(d), (s) => s.minutos);
              return (
                <button
                  key={d}
                  type="button"
                  className="jn-semana-dia"
                  data-hoje={d === hoje ? "sim" : "nao"}
                  data-futuro={d > hoje ? "sim" : "nao"}
                  aria-label={T.journal.abrirDia(formatar(d, "EEEE, d 'de' MMMM"))}
                  onClick={() => {
                    setData(d);
                    setVista("dia");
                  }}
                >
                  <span className="jn-faixa-topo">
                    <span className="jn-faixa-rotulo">{`${T.calendario.diasSemana[n]} ${Number(d.slice(8))}`}</span>
                    <span className="jn-humor-ponto jn-humor-ponto-grande" data-humor={registro?.humor ?? "nenhum"} />
                  </span>
                  <span className="jn-semana-tarefas">
                    {lista.map((t) => (
                      <span key={t.id} className="jn-semana-tarefa privado" data-feita={t.status === "concluida" ? "sim" : "nao"}>
                        {t.status === "concluida" ? <CircleCheck size={12} /> : <Circle size={12} />}
                        <span className="cortar">{t.titulo}</span>
                      </span>
                    ))}
                  </span>
                  <span className="jn-semana-resumo">
                    <span><b>{registro?.sono ? T.journal.horas(decimal(registro.sono)) : T.journal.semValor}</b>{T.journal.resumoSono}</span>
                    <span><b>{registro?.agua ? T.journal.litros(litros(registro.agua)) : T.journal.semValor}</b>{T.journal.resumoAgua}</span>
                    <span><b>{foco ? T.journal.minutos(foco) : T.journal.semValor}</b>{T.journal.resumoFoco}</span>
                  </span>
                </button>
              );
            })}
          </section>

          <Cartao titulo={T.journal.periodosSemana}>
            <div className="tabela-rolagem">
              <table className="tabela jn-periodos-tabela">
                <thead>
                  <tr>
                    <th />
                    {semana.map((d) => (
                      <th key={d} data-hoje={d === hoje ? "sim" : "nao"}>{formatar(d, "EEE d")}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERIODOS.map((p) => (
                    <tr key={p}>
                      <th>{T.journal[p]}</th>
                      {semana.map((d) => (
                        <td key={d}>
                          <input
                            className="campo"
                            maxLength={120}
                            aria-label={`${T.journal[p]} ${format(deISO(d), "dd/MM")}`}
                            value={(dias[d] ?? DIA_VAZIO)[p]}
                            onChange={(e) => {
                              atualizarDia(d, { [p]: e.target.value });
                              marcarSalvo();
                            }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Cartao>
        </>
      )}
    </>
  );
}
