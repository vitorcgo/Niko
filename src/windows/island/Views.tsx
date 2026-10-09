import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Check, Play, Pause, SkipBack, SkipForward, RotateCcw, FastForward, Plus, Minus, ArrowUpRight, CornerDownLeft,
  Bell, ChevronLeft, ChevronRight, Music,
} from "lucide-react";
import { useRoutine, tasksDay, habitCompleted } from "../../state/routine";
import { useMedia, positionCurrent, coverBanner, backgroundCover } from "../../state/media";
import { usePomodoro, remainingCurrent, formatClock } from "../../state/pomodoro";
import { useStudies } from "../../state/studies";
import { useOrganization } from "../../state/organization";
import { failuresNotViews, useCommunication } from "../../state/communication";
import { useAgents } from "../../state/agents";
import { useConfig, type SectionToday } from "../../state/settings";
import { useInterface } from "../../state/interface";
import { useIsland } from "../../state/island";
import { Brand, BRANDS, brandApp } from "../../brands/Brand";
import { Ring } from "../../components/Charts";
import { T } from "../../i18n/ptBR";
import { fromISO, formatDate, todayISO, toISO, scheduleRelative } from "../../utils/dates";
import { itemDone, itemsCalendar, canMarkDone, repeatsTodoDay, type ItemCalendar } from "../../utils/calendarItems";
import { markItemDone } from "../../utils/markDone";
import { useGoogleCalendar } from "../../features/calendar/useGoogleCalendar";
import { IslandConnection } from "./IslandConnection";
import { SpaceCharacter } from "./animations/ContinuousCharacter";
import { functionEnabled, sectionsTodayEnabled } from "../../utils/features";
import { useFinances } from "../../state/finances";
import { interpretWhen } from "../../utils/language";
import { capture, typesCaptureEnabled, type TypeCapture } from "../../utils/capture";
import { confirmCommand, missingCategory, typeCategoryCard } from "../../utils/commands";
import { CategoryPicker } from "../../components/CategoryPicker";
import { formatMoney } from "../../utils/money";
import { playSound } from "../../bridge/sounds";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import type { CardConfirmation, PomodoroStage } from "../../types";

function Card({ veu: veil, children }: { veu?: string; children: React.ReactNode }) {
  return (
    <div className="ilha-cartao" style={{ ["--veu" as string]: veil ? `${veil}55` : "transparent" }}>
      <div className="ilha-veu" />
      <div className="ilha-cartao-corpo">{children}</div>
    </div>
  );
}

function Marker({ marcado: marked, aoMudar: onChange, rotulo: label }: { marcado: boolean; aoMudar: () => void; rotulo: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={marked} aria-label={label} className="ilha-marca" onClick={onChange}>
      {marked && <Check size={11} strokeWidth={3} />}
    </button>
  );
}

export function ViewToday() {
  const disabled = useConfig((s) => s.funcoesDesligadas);
  const sections = sectionsTodayEnabled(disabled);
  const selected = useIsland((s) => s.secaoHoje);
  const setSection = useIsland((s) => s.setSectionToday);
  const section = sections.includes(selected) ? selected : sections[0];
  const tasks = useRoutine((s) => s.tarefas);
  const habits = useRoutine((s) => s.habitos);
  const records = useRoutine((s) => s.registros);
  const today = todayISO();
  const dailyItems = tasksDay(tasks, today).filter((t) => t.status !== "cancelada");
  const habitsActive = habits.filter((h) => !h.arquivado);
  const count: Record<SectionToday, { feitos: number; total: number } | null> = {
    agenda: null,
    tarefas: { feitos: dailyItems.filter((t) => t.status === "concluida").length, total: dailyItems.length },
    habitos: { feitos: habitsActive.filter((h) => habitCompleted(h, records[today]?.[h.id])).length, total: habitsActive.length },
  };
  const current = section ? count[section] : null;
  const allDone = Boolean(current && current.total > 0 && current.feitos === current.total);

  return (
    <Card veu={allDone ? "#34d399" : undefined}>
      <div className="ilha-chips" role="tablist" aria-label={T.ilha.abas.hoje}>
        {sections.map((s) => {
          const c = count[s];
          return (
            <button
              key={s}
              type="button"
              role="tab"
              className="ilha-chip"
              aria-pressed={s === section}
              aria-selected={s === section}
              onClick={() => {
                if (s !== section) void playSound("blip");
                setSection(s);
              }}
            >
              {T.ilha.secoesHoje[s]}
              {c && c.total > 0 && <span className="ilha-chip-numero numero">{T.ilha.feitosDoTotal(c.feitos, c.total)}</span>}
            </button>
          );
        })}
      </div>
      {section === "agenda" ? <SectionAgenda /> : section === "tarefas" ? <SectionTasks /> : section === "habitos" ? <SectionHabits /> : null}
    </Card>
  );
}

function SectionTasks() {
  const tasks = useRoutine((s) => s.tarefas);
  const create = useRoutine((s) => s.createTask);
  const changeStatus = useRoutine((s) => s.changeStatus);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const today = todayISO();
  const list = tasksDay(tasks, today).filter((t) => t.status !== "cancelada");

  const add = () => {
    const clean = text.trim();
    if (!clean) {
      setError(T.validacao.obrigatorio);
      return;
    }
    const when = interpretWhen(clean);
    create({ titulo: when.resto || clean, data: when.data ?? today, hora: when.hora });
    void playSound("pop");
    setText("");
    setError("");
  };

  return (
    <div className="ilha-hoje-secao">
      <div className="ilha-rolagem">
        {list.length === 0 ? (
          <span className="ilha-sub">{T.ilha.semTarefasHoje}</span>
        ) : (
          list.map((t) => (
            <div key={t.id} className="ilha-linha">
              <Marker
                marcado={t.status === "concluida"}
                rotulo={t.titulo}
                aoMudar={() => {
                  const complete = t.status !== "concluida";
                  changeStatus(t.id, complete ? "concluida" : "a_fazer");
                  if (complete) void playSound("finish", "personagens");
                }}
              />
              <span className={`cortar privado ${t.status === "concluida" ? "ilha-riscado" : ""}`}>{t.titulo}</span>
              {t.hora && <span className="ilha-mini numero">{t.hora}</span>}
            </div>
          ))
        )}
      </div>
      <div className="ilha-campo" data-erro={error ? "sim" : "nao"}>
        <Plus size={14} color="#8e939c" />
        <input
          value={text}
          maxLength={200}
          aria-label={T.ilha.novaTarefaHoje}
          placeholder={T.ilha.novaTarefaHoje}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
        />
        <button type="button" className="ilha-botao ilha-botao-icone" aria-label={T.geral.adicionar} onClick={add}>
          <CornerDownLeft size={13} />
        </button>
      </div>
    </div>
  );
}

export function ViewCapture() {
  const disabled = useConfig((s) => s.funcoesDesligadas);
  const types = typesCaptureEnabled(disabled);
  const [typeSelected, setType] = useState<TypeCapture>("tarefa");
  const type = types.includes(typeSelected) ? typeSelected : types[0];
  const [text, setText] = useState("");
  const [returnValue, setReturn] = useState<{ ok: boolean; texto: string } | null>(null);
  const [confirmation, setConfirmation] = useState<CardConfirmation | null>(null);

  if (!type) {
    return (
      <Card>
        <span className="ilha-sub">{T.funcoes.semCaptura}</span>
      </Card>
    );
  }

  const send = () => {
    const r = capture(type, text);
    if (r.confirmacao) {
      setConfirmation(r.confirmacao);
      setReturn(null);
      return;
    }
    setReturn({ ok: r.ok, texto: r.resposta });
    if (r.ok) {
      setText("");
      void playSound("pop");
    }
  };

  return (
    <Card>
      <div className="ilha-chips" role="tablist" aria-label={T.ilha.abas.captura}>
        {types.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            className="ilha-chip"
            aria-pressed={type === t}
            aria-selected={type === t}
            onClick={() => {
              setType(t);
              setReturn(null);
              setConfirmation(null);
            }}
          >
            {T.ilha.tiposCaptura[t]}
          </button>
        ))}
      </div>
      {confirmation ? (
        <ConfirmationIsland
          confirmacao={confirmation}
          aoMudar={(payload) => setConfirmation({ ...confirmation, dados: { ...confirmation.dados, ...payload } })}
          aoFim={(text) => {
            setConfirmation(null);
            if (text) {
              setReturn({ ok: true, texto: text });
              setText("");
            }
          }}
        />
      ) : (
        <>
          <div className="ilha-campo" data-erro={returnValue && !returnValue.ok ? "sim" : "nao"}>
            <input
              value={text}
              maxLength={300}
              autoFocus
              aria-label={T.ilha.tiposCaptura[type]}
              placeholder={T.ilha.exemplosCaptura[type]}
              onChange={(e) => {
                setText(e.target.value);
                setReturn(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
            />
            <button type="button" className="ilha-botao ilha-botao-primario" onClick={send}>
              {T.geral.salvar}
            </button>
          </div>
          {returnValue && <span className={returnValue.ok ? "ilha-ok" : "ilha-erro"} role="status">{returnValue.texto}</span>}
        </>
      )}
    </Card>
  );
}

function ConfirmationIsland({ confirmacao: confirmation, aoMudar: onChange, aoFim: onEnd }: { confirmacao: CardConfirmation; aoMudar: (payload: CardConfirmation["dados"]) => void; aoFim: (text?: string) => void }) {
  const d = confirmation.dados;
  const typeCategory = typeCategoryCard(confirmation);
  const withoutCategory = missingCategory(confirmation);
  return (
    <div className="coluna" style={{ gap: 8 }}>
      <div className="ilha-confirmacao">
        <span>{T.chat.rotulos.valor}: <b className="privado">{formatMoney(Number(d.valor))}</b></span>
        <span>{T.chat.rotulos.descricao}: <b>{String(d.descricao)}</b></span>
        {Array.isArray(d.pessoas) && <span>{T.chat.rotulos.pessoas}: <b>{d.pessoas.join(", ")}</b></span>}
      </div>
      {typeCategory && (
        <div className="permissao-categoria" data-falta={withoutCategory || undefined}>
          {withoutCategory && T.financas.categoriaObrigatoria}
          <CategoryPicker
            tipo={typeCategory}
            categoriaId={String(d.categoriaId ?? "")}
            novaCategoria={String(d.novaCategoria ?? "")}
            invalido={withoutCategory}
            aoMudar={(categoryId, newCategory) => onChange({ categoriaId: categoryId, novaCategoria: newCategory })}
          />
        </div>
      )}
      <div className="linha">
        <button type="button" className="ilha-botao ilha-botao-primario" disabled={withoutCategory} onClick={() => void Promise.resolve(confirmCommand(confirmation)).then((text) => onEnd(text))}>
          {T.chat.confirmar}
        </button>
        <button type="button" className="ilha-botao" onClick={() => onEnd()}>
          {T.chat.cancelar}
        </button>
      </div>
    </div>
  );
}

export function ViewMedia() {
  const media = useMedia();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!media.tocando) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [media.tocando, media.lidoEm]);
  const banner = media.faixa;
  const [c1] = coverBanner(media.faixa);
  const pos = positionCurrent(media, now);
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  if (!banner) {
    return (
      <Card>
        <div className="linha" style={{ gap: 12, flex: 1 }}>
          <Music size={18} color="#8e939c" />
          <div className="coluna" style={{ gap: 2 }}>
            <span className="ilha-titulo">{T.ilha.semMidia}</span>
            <span className="ilha-sub">{media.disponivel ? T.ilha.semMidiaDica : T.ilha.midiaSemPonte}</span>
          </div>
        </div>
      </Card>
    );
  }

  const getAppBrand = brandApp(banner.app);

  return (
    <Card veu={c1}>
      <div className="linha" style={{ gap: 26, flex: 1 }}>
        <div className="ilha-capa-com-personagem">
          <div className="ilha-capa" style={{ width: 96, height: 96, borderRadius: 10, background: backgroundCover(banner), boxShadow: `0 8px 24px ${c1}55` }} />
          <SpaceCharacter tamanho={38} posicao="expandida" flutuar className="ilha-capa-personagem" />
        </div>
        <div className="coluna" style={{ gap: 6, flex: 1, minWidth: 0 }}>
          <div className="coluna" style={{ gap: 0 }}>
            <span className="ilha-titulo cortar privado">{banner.titulo}</span>
            <span className="linha ilha-midia-origem">
              {getAppBrand && (
                <span className="ilha-midia-app" title={banner.app} aria-label={banner.app}>
                  <Brand marca={getAppBrand} tamanho={12} />
                </span>
              )}
              <span className="ilha-sub cortar privado">{banner.artista}</span>
              {!getAppBrand && banner.app && <span className="ilha-mini cortar">{banner.app}</span>}
            </span>
          </div>
          <div
            className="ilha-trilho"
            role="slider"
            tabIndex={0}
            aria-label={T.ilha.midia}
            aria-valuemin={0}
            aria-valuemax={banner.duracao}
            aria-valuenow={Math.round(pos)}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              if (media.podeBuscar && banner.duracao > 0) media.seek(((e.clientX - r.left) / r.width) * banner.duracao);
            }}
            onKeyDown={(e) => {
              if (!media.podeBuscar || banner.duracao <= 0) return;
              if (e.key === "ArrowRight") media.seek(Math.min(banner.duracao, pos + 5));
              if (e.key === "ArrowLeft") media.seek(Math.max(0, pos - 5));
            }}
          >
            <span style={{ width: `${banner.duracao > 0 ? (pos / banner.duracao) * 100 : 0}%` }} />
          </div>
          <div className="linha-entre ilha-mini numero">
            <span>{fmt(pos)}</span>
            <span>{fmt(banner.duracao)}</span>
          </div>
        </div>
        <div className="linha" style={{ gap: 4 }}>
          <button type="button" className="ilha-botao ilha-botao-redondo" aria-label={T.ilha.anterior} disabled={!media.podeVoltar} onClick={media.previous}>
            <SkipBack size={15} />
          </button>
          <button type="button" className="ilha-botao ilha-botao-primario ilha-botao-grande" aria-label={media.tocando ? T.ilha.pausar : T.ilha.tocar} onClick={media.toggle}>
            {media.tocando ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button type="button" className="ilha-botao ilha-botao-redondo" aria-label={T.ilha.proxima} disabled={!media.podeAvancar} onClick={media.next}>
            <SkipForward size={15} />
          </button>
        </div>
      </div>
    </Card>
  );
}

export function ViewFocus() {
  const p = usePomodoro();
  const subjects = useStudies((s) => s.materias);
  const hasStudies = useConfig((s) => functionEnabled("estudos", s.funcoesDesligadas));
  const cycles = useConfig((s) => s.pomodoro.ciclos);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!p.rodando) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [p.rodando]);
  const remaining = remainingCurrent(p, now);
  const progress = 1 - remaining / p.duracaoMs;
  const color = p.etapa === "foco" ? undefined : "#34d399";
  const started = p.rodando || p.restanteMs != null;

  return (
    <Card veu={p.rodando ? (p.etapa === "foco" ? "#f4505e" : "#34d399") : undefined}>
      <div className="linha" style={{ gap: 16, flex: 1 }}>
        <div style={{ position: "relative", display: "grid", placeItems: "center" }}>
          <Ring progresso={progress} tamanho={96} espessura={5} cor={color} />
          <span className="ilha-tempo" style={{ position: "absolute", fontSize: 20 }}>{formatClock(remaining)}</span>
        </div>
        <div className="coluna" style={{ gap: 8, flex: 1, minWidth: 0 }}>
          <div className="ilha-chips" role="tablist" aria-label={T.ilha.foco}>
            {(["foco", "pausa_curta", "pausa_longa"] as PomodoroStage[]).map((e) => (
              <button key={e} type="button" role="tab" className="ilha-chip" aria-pressed={p.etapa === e} aria-selected={p.etapa === e} disabled={started} onClick={() => p.selectStage(e)}>
                {T.pomodoro.etapas[e]}
              </button>
            ))}
          </div>
          <div className="linha">
            {hasStudies && (
              <select
                className="ilha-select"
                aria-label={T.pomodoro.materia}
                value={p.materiaId ?? ""}
                onChange={(e) => p.setLink(e.target.value || undefined, p.tarefaId)}
              >
                <option value="">{T.pomodoro.semMateria}</option>
                {subjects.map((m) => (
                  <option key={m.id} value={m.id}>{m.nome}</option>
                ))}
              </select>
            )}
            <span className="ilha-mini numero">{T.pomodoro.ciclo(p.ciclo, cycles)}</span>
          </div>
          <div className="linha">
            <button type="button" className="ilha-botao ilha-botao-primario" onClick={p.toggle}>
              {p.rodando ? <Pause size={13} /> : <Play size={13} />}
              {p.rodando ? T.pomodoro.pausar : started ? T.pomodoro.continuar : T.pomodoro.iniciar}
            </button>
            <button type="button" className="ilha-botao ilha-botao-icone" aria-label={T.pomodoro.reiniciar} title={T.pomodoro.reiniciar} onClick={p.restart}>
              <RotateCcw size={13} />
            </button>
            <button type="button" className="ilha-botao ilha-botao-icone" aria-label={T.pomodoro.pular} title={T.pomodoro.pular} onClick={p.skip}>
              <FastForward size={13} />
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function SectionHabits() {
  const habits = useRoutine((s) => s.habitos).filter((h) => !h.arquivado);
  const records = useRoutine((s) => s.registros);
  const register = useRoutine((s) => s.registerHabit);
  const today = todayISO();

  return (
    <div className="ilha-hoje-secao">
      <div className="ilha-rolagem">
        {habits.length === 0 ? (
          <span className="ilha-sub">{T.ilha.semHabitos}</span>
        ) : (
          habits.map((h) => {
            const value = records[today]?.[h.id] ?? 0;
            const completed = habitCompleted(h, value);
            return (
              <div key={h.id} className="ilha-linha">
                {h.tipo === "sim_nao" ? (
                  <Marker
                    marcado={completed}
                    rotulo={h.nome}
                    aoMudar={() => {
                      register(today, h.id, completed ? 0 : 1);
                      if (!completed) void playSound("pop");
                    }}
                  />
                ) : (
                  <span className="ilha-ponto" style={{ background: completed ? "#34d399" : "#4b5059" }} />
                )}
                <span className={`cortar ${completed ? "ilha-riscado" : ""}`}>{h.nome}</span>
                {h.tipo === "quantidade" && (
                  <div className="linha" style={{ gap: 4 }}>
                    <button type="button" className="ilha-botao ilha-botao-icone" aria-label={`${T.geral.limpar} 1`} onClick={() => register(today, h.id, value - 1)} disabled={value <= 0}>
                      <Minus size={12} />
                    </button>
                    <span className="ilha-mini numero" style={{ minWidth: 48, textAlign: "center" }}>
                      {value}/{h.meta} {h.unidade}
                    </span>
                    <button
                      type="button"
                      className="ilha-botao ilha-botao-icone"
                      aria-label={`${T.geral.adicionar} 1`}
                      onClick={() => {
                        register(today, h.id, value + 1);
                        if (value + 1 === h.meta) void playSound("proud", "personagens");
                      }}
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function ViewConnections() {
  const connections = useCommunication((s) => s.conexoes);
  const events = useCommunication((s) => s.eventosConexao);
  const markFailuresViews = useCommunication((s) => s.markFailuresViews);
  const openWindow = useInterface((s) => s.openWindowConnection);
  const navigateTo = useInterface((s) => s.navigateTo);
  const [isOpen, setOpen] = useState<string | null>(null);
  const list = [...connections].sort((a, b) => Number(b.ligada) - Number(a.ligada) || Number(b.fixadaNaIlha) - Number(a.fixadaNaIlha));
  const enabled = connections.filter((c) => c.ligada).length;
  const current = connections.find((c) => c.id === isOpen);

  return (
    <Card veu={current ? `#${BRANDS[current.id].hex}` : undefined}>
      <AnimatePresence mode="wait" initial={false}>
        {!current ? (
          <motion.div key="grade" className="coluna" style={{ gap: 8, minHeight: 0, flex: 1 }} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }}>
            <div className="linha-entre">
              <span className="ilha-titulo">{T.ilha.abas.conexoes}</span>
              <span className="ilha-mini numero">{T.ilha.conexoesLigadas(enabled, connections.length)}</span>
            </div>
            <div className="ilha-rolagem">
              <div className="ilha-conexoes-grade">
                {list.map((c, i) => {
                  const color = `#${BRANDS[c.id].hex}`;
                  const failures = failuresNotViews(c, events);
                  return (
                    <motion.button
                      key={c.id}
                      type="button"
                      className="ilha-conexao-bloco"
                      data-ligada={c.ligada ? "sim" : "nao"}
                      style={{ ["--marca" as string]: color }}
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1, transition: { delay: i * 0.03, type: "spring", visualDuration: 0.3, bounce: 0.3 } }}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => {
                        void playSound("blip");
                        if (failures > 0) markFailuresViews(c.id);
                        setOpen(c.id);
                      }}
                    >
                      <span className="ilha-conexao-logo"><Brand marca={c.id} tamanho={17} /></span>
                      <span className="ilha-conexao-textos">
                        <span className="ilha-conexao-nome" title={T.conexoes.servicos[c.id].nome}>
                          <span className="ilha-conexao-nome-texto">{T.conexoes.servicos[c.id].nome}</span>
                          <span className="ilha-conexao-estado" data-status={c.ligada ? c.status : "desligada"} />
                        </span>
                        <span className="ilha-conexao-resumo cortar privado">{c.ligada ? c.resumo || T.conexoes.status[c.status] : T.ilha.conexaoDesligada}</span>
                      </span>
                      {c.ligada && failures > 0 && <span className="ilha-conexao-selo">{failures}</span>}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div key={current.id} className="coluna" style={{ gap: 8, minHeight: 0, flex: 1 }} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0, transition: { type: "spring", visualDuration: 0.28, bounce: 0.2 } }} exit={{ opacity: 0, x: 18, transition: { duration: 0.15 } }}>
            <div className="linha" style={{ gap: 8 }}>
              <button type="button" className="ilha-botao ilha-botao-icone" aria-label={T.geral.voltar} title={T.geral.voltar} onClick={() => setOpen(null)}>
                <ChevronLeft size={14} />
              </button>
              <span className="ilha-conexao-logo" style={{ ["--marca" as string]: `#${BRANDS[current.id].hex}` }}><Brand marca={current.id} tamanho={17} /></span>
              <span className="coluna" style={{ gap: 0, minWidth: 0, flex: 1 }}>
                <span className="ilha-titulo">{T.conexoes.servicos[current.id].nome}</span>
                <span className="ilha-mini cortar">{current.ligada ? `${T.conexoes.status[current.status]} . ${current.ultimaAtualizacao ? T.conexoes.atualizado(scheduleRelative(current.ultimaAtualizacao)) : T.conexoes.nunca}` : T.ilha.conexaoDesligada}</span>
              </span>
              {current.ligada ? (
                <button type="button" className="ilha-botao" onClick={() => openWindow(current.id)}>
                  <ArrowUpRight size={13} />
                  {T.ilha.abrirConexao}
                </button>
              ) : (
                <button type="button" className="ilha-botao ilha-botao-primario" onClick={() => navigateTo("conexoes", { servico: current.id, aberto: String(Date.now()) })}>
                  {T.ilha.ligarConexao}
                </button>
              )}
            </div>
            {current.ligada && <IslandConnection servico={current.id} />}
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
function SectionAgenda() {
  const events = useOrganization((s) => s.eventos);
  const goals = useOrganization((s) => s.metas);
  const tasks = useRoutine((s) => s.tarefas);
  const habits = useRoutine((s) => s.habitos);
  const dates = useStudies((s) => s.datas);
  const reviews = useStudies((s) => s.revisoesConteudo);
  const recurring = useFinances((s) => s.recorrentes);
  const navigateTo = useInterface((i) => i.navigateTo);
  const collapse = useIsland((i) => i.collapse);
  const today = todayISO();
  const [now, setNow] = useState(() => new Date());
  const [month, setMonth] = useState(() => startOfMonth(fromISO(today)));
  const days = useMemo(() => eachDayOfInterval({ start: startOfWeek(month, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) }), [month]);
  const start = toISO(days[0]);
  const end = toISO(days[days.length - 1]);
  const disabled = useConfig((s) => s.funcoesDesligadas);
  const payload = useMemo(() => ({ eventos: events, metas: goals, tarefas: tasks, habitos: habits, datas: dates, revisoes: reviews, recorrentes: recurring }), [events, goals, tasks, habits, dates, reviews, recurring, disabled]);
  const google = useGoogleCalendar(functionEnabled("calendario", disabled) ? [[start, end], [today, today]] : []);
  const hasAppointment = useMemo(
    () => new Set([...itemsCalendar(payload, start, end).filter((i) => !repeatsTodoDay(i)).map((i) => i.data), ...google.eventos.map((e) => e.data)]),
    [payload, start, end, google.eventos],
  );
  const fromToday = useMemo(() => {
    const fromGoogle: ItemCalendar[] = google.eventos.filter((e) => e.data === today).map((e) => ({ id: `google-${e.id}`, titulo: e.titulo, data: e.data, hora: e.hora, fonte: "google", link: e.link }));
    return [...itemsCalendar(payload, today, today), ...fromGoogle].sort((a, b) => (a.hora ?? "99").localeCompare(b.hora ?? "99"));
  }, [payload, today, google.eventos]);
  const C = T.ilha.calendario;
  const records = useRoutine((s) => s.registros);
  const fromTodaySorted = [...fromToday].sort((a, b) => Number(itemDone(a, records)) - Number(itemDone(b, records)));

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(t);
  }, []);

  const openDay = (iso: string) => {
    void playSound("open");
    navigateTo("calendario", { data: iso });
    collapse();
  };

  return (
    <div className="ilha-calendario-corpo">
      <div className="ilha-calendario-relogio">
        <span className="ilha-calendario-hora numero">{formatDate(now, "HH:mm")}</span>
        <span className="ilha-calendario-data">{formatDate(now, "EEEE, d 'de' MMMM")}</span>
        <div className="ilha-calendario-hoje">
          {fromToday.length === 0 ? (
            <span className="ilha-sub">{C.semNadaHoje}</span>
          ) : (
            <>
              {fromTodaySorted.slice(0, 3).map((item) => {
                const done = itemDone(item, records);
                return (
                  <div key={item.id} className="ilha-calendario-item" data-feito={done || undefined}>
                    {canMarkDone(item) && (
                      <button
                        type="button"
                        className="ilha-calendario-check"
                        aria-pressed={done}
                        aria-label={done ? T.calendario.desmarcarFeito(item.titulo) : T.calendario.marcarFeito(item.titulo)}
                        title={done ? T.calendario.desmarcarFeito(item.titulo) : T.calendario.marcarFeito(item.titulo)}
                        onClick={() => {
                          void playSound(done ? "blip" : "approve");
                          markItemDone(item, !done);
                        }}
                      >
                        {done && <Check size={10} strokeWidth={3} />}
                      </button>
                    )}
                    <button type="button" className="ilha-calendario-item-abrir" onClick={() => openDay(today)}>
                      <span className="ilha-calendario-item-hora numero">{item.hora ?? C.diaTodo}</span>
                      <span className="cortar privado">{item.titulo}</span>
                    </button>
                  </div>
                );
              })}
              {fromToday.length > 3 && <span className="ilha-mini">{C.maisHoje(fromToday.length - 3)}</span>}
            </>
          )}
        </div>
      </div>
      <div className="ilha-calendario-mes-bloco">
        <div className="linha-entre">
          <span className="ilha-titulo ilha-calendario-mes">{formatDate(month, "MMMM 'de' yyyy")}</span>
          <div className="linha" style={{ gap: 2 }}>
            {!isSameMonth(month, fromISO(today)) && (
              <button type="button" className="ilha-botao-texto" onClick={() => setMonth(startOfMonth(fromISO(today)))}>{C.hoje}</button>
            )}
            <button type="button" className="ilha-acao" aria-label={C.anterior} title={C.anterior} onClick={() => setMonth((m) => addMonths(m, -1))}><ChevronLeft size={14} /></button>
            <button type="button" className="ilha-acao" aria-label={C.proximo} title={C.proximo} onClick={() => setMonth((m) => addMonths(m, 1))}><ChevronRight size={14} /></button>
          </div>
        </div>
        <div className="ilha-calendario" role="grid" aria-label={formatDate(month, "MMMM 'de' yyyy")}>
          {days.slice(0, 7).map((d) => (
            <span key={`s-${d.getDay()}`} className="ilha-calendario-semana" aria-hidden="true">{formatDate(d, "EEEEE")}</span>
          ))}
          {days.map((d) => {
            const iso = toISO(d);
            const marked = hasAppointment.has(iso);
            const label = formatDate(d, "d 'de' MMMM");
            return (
              <button
                key={iso}
                type="button"
                role="gridcell"
                className="ilha-calendario-dia numero"
                data-hoje={iso === today || undefined}
                data-fora={!isSameMonth(d, month) || undefined}
                aria-label={marked ? C.diaComCompromisso(label) : C.abrirDia(label)}
                title={marked ? C.diaComCompromisso(label) : C.abrirDia(label)}
                onClick={() => openDay(iso)}
              >
                {d.getDate()}
                {marked && <span className="ilha-calendario-ponto" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ViewNotices() {
  const alerts = useAgents((s) => s.alertas);
  const resolve = useAgents((s) => s.resolveAlert);
  const names = useConfig((c) => c.agentes.nomes);
  const navigateTo = useInterface((i) => i.navigateTo);
  const openWindow = useInterface((i) => i.openWindowConnection);
  const collapse = useIsland((i) => i.collapse);
  const current = alerts[0];

  if (!current) {
    return (
      <Card>
        <div className="linha" style={{ gap: 10 }}>
          <Bell size={16} color="#8e939c" />
          <span className="ilha-sub">{T.ilha.semAvisos}</span>
        </div>
      </Card>
    );
  }

  return (
    <Card veu="#f5a524">
      <div className="linha" style={{ gap: 12, flex: 1 }}>
        <div className="coluna" style={{ gap: 4, flex: 1, minWidth: 0 }}>
          <span className="ilha-mini">{names[current.agenteId]}</span>
          <span className="ilha-titulo privado" style={{ fontWeight: 500 }}>{current.texto}</span>
          {alerts.length > 1 && <span className="ilha-mini numero">{T.ilha.fila(alerts.length - 1)}</span>}
        </div>
      </div>
      <div className="linha">
        {(current.rota || current.servico) && (
          <button
            type="button"
            className="ilha-botao ilha-botao-primario"
            onClick={() => {
              if (current.servico) openWindow(current.servico);
              else if (current.rota) navigateTo(current.rota);
              resolve(current.id);
              collapse();
            }}
          >
            <ArrowUpRight size={13} />
            {T.ilha.verAviso}
          </button>
        )}
        <button
          type="button"
          className="ilha-botao"
          onClick={() => {
            resolve(current.id);
            void playSound("approve");
          }}
        >
          {T.ilha.dispensar}
        </button>
      </div>
    </Card>
  );
}
