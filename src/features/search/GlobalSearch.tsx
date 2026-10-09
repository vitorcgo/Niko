import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Search, ListTodo, FileText, Wallet, Link2, CalendarDays, MessageSquare, Zap, Timer, SunMoon, EyeOff, Plus, CornerDownLeft, ArrowUp, ArrowDown } from "lucide-react";
import { useInterface } from "../../state/interface";
import { useRoutine } from "../../state/routine";
import { useStudies } from "../../state/studies";
import { useFinances } from "../../state/finances";
import { useOrganization } from "../../state/organization";
import { useCommunication } from "../../state/communication";
import { useConfig } from "../../state/settings";
import { usePomodoro } from "../../state/pomodoro";
import { T } from "../../i18n/ptBR";
import { contains } from "../../utils/basics";
import { htmlToText } from "../../utils/sanitize";
import { formatMoney } from "../../utils/money";
import { formatDateString } from "../../utils/dates";
import { ICON_ROUTE } from "../../windows/system/routes";
import { Key } from "../../components/basics";
import type { Route } from "../../types";
import { functionEnabled, routeEnabled } from "../../utils/features";

interface Result {
  id: string;
  grupo: keyof typeof T.busca.grupos;
  titulo: string;
  sub?: string;
  icone: React.ReactNode;
  executar: () => void;
}

const KEY_RECENT = "niko:busca-recentes";

function readRecent(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY_RECENT) ?? "[]") as unknown;
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string").slice(0, 12) : [];
  } catch {
    return [];
  }
}

function storeRecent(id: string) {
  try {
    localStorage.setItem(KEY_RECENT, JSON.stringify([id, ...readRecent().filter((x) => x !== id)].slice(0, 12)));
  } catch {
    return;
  }
}

export function GlobalSearch() {
  const isOpen = useInterface((s) => s.buscaAberta);
  const openValue = useInterface((s) => s.openSearch);
  const navigateTo = useInterface((s) => s.navigateTo);
  const openCapture = useInterface((s) => s.openCapture);
  const [term, setTerm] = useState("");
  const [active, setActive] = useState(0);
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTerm("");
      setActive(0);
      window.setTimeout(() => field.current?.focus(), 20);
    }
  }, [isOpen]);

  const disabled = useConfig((s) => s.funcoesDesligadas);
  const results = useMemo<Result[]>(() => {
    if (!isOpen) return [];
    const t = term.trim();
    const closeValue = () => openValue(false);
    const actions: Result[] = [
      { id: "a-tarefa", grupo: "acoes", titulo: T.busca.acoes.novaTarefa, icone: <Plus size={15} />, executar: () => { closeValue(); openCapture(true); } },
      { id: "a-pomodoro", grupo: "acoes", titulo: T.busca.acoes.iniciarPomodoro, icone: <Timer size={15} />, executar: () => { usePomodoro.getState().toggle(); closeValue(); } },
      {
        id: "a-tema",
        grupo: "acoes",
        titulo: T.busca.acoes.alternarTema,
        icone: <SunMoon size={15} />,
        executar: () => {
          const c = useConfig.getState();
          c.set({ tema: document.documentElement.dataset.tema === "escuro" ? "claro" : "escuro" });
          closeValue();
        },
      },
      { id: "a-priv", grupo: "acoes", titulo: T.busca.acoes.privacidade, icone: <EyeOff size={15} />, executar: () => { const c = useConfig.getState(); c.set({ privacidade: !c.privacidade }); closeValue(); } },
      { id: "a-captura", grupo: "acoes", titulo: T.busca.acoes.captura, icone: <Zap size={15} />, executar: () => { closeValue(); openCapture(true); } },
    ];
    const tabs: Result[] = (Object.keys(T.rotas) as Route[]).filter((r) => routeEnabled(r, disabled)).map((r) => {
      const Icon = ICON_ROUTE[r];
      return { id: `r-${r}`, grupo: "abas", titulo: T.rotas[r], icone: <Icon size={15} />, executar: () => { navigateTo(r); closeValue(); } };
    });
    const recentItems = readRecent();
    const ok = (id: string, ...fields: (string | undefined)[]) => (!t ? recentItems.includes(id) : fields.some((c) => c !== undefined && contains(c, t)));
    const r: Result[] = [];
    if (t) r.push(...actions.filter((a) => contains(a.titulo, t)), ...tabs.filter((a) => contains(a.titulo, t)));
    const hasTasks = functionEnabled("journal", disabled);
    const hasStudies = functionEnabled("estudos", disabled);
    for (const x of hasTasks ? useRoutine.getState().tarefas : []) {
      if (ok(x.id, x.titulo, x.descricao))
        r.push({ id: x.id, grupo: "tarefas", titulo: x.titulo, sub: x.data ? formatDateString(x.data, "d 'de' MMM") : T.geral.semData, icone: <ListTodo size={15} />, executar: () => { navigateTo("journal", x.data ? { data: x.data } : {}); closeValue(); } });
    }
    const est = useStudies.getState();
    for (const p of hasStudies ? est.paginas : []) {
      if (ok(p.id, p.titulo, t ? htmlToText(p.conteudo) : ""))
        r.push({ id: p.id, grupo: "paginas", titulo: p.titulo || T.estudos.semTitulo, sub: est.materias.find((m) => m.id === p.materiaId)?.nome, icone: <FileText size={15} />, executar: () => { navigateTo("estudos", { materia: p.materiaId, pagina: p.id, aba: "anotacoes" }); closeValue(); } });
    }
    for (const l of hasStudies ? est.links : []) {
      if (ok(l.id, l.titulo, l.url, ...l.tags))
        r.push({ id: l.id, grupo: "links", titulo: l.titulo, sub: l.url, icone: <Link2 size={15} />, executar: () => { navigateTo("estudos", { aba: "links", materia: l.materiaId ?? "" }); closeValue(); } });
    }
    for (const x of functionEnabled("financas", disabled) ? useFinances.getState().transacoes : []) {
      if (ok(x.id, x.descricao))
        r.push({ id: x.id, grupo: "transacoes", titulo: x.descricao, sub: `${formatMoney(x.valor)} . ${formatDateString(x.data, "d 'de' MMM")}`, icone: <Wallet size={15} />, executar: () => { navigateTo("financas", { aba: "transacoes", busca: x.descricao }); closeValue(); } });
    }
    for (const e of functionEnabled("calendario", disabled) ? useOrganization.getState().eventos : []) {
      if (ok(e.id, e.titulo))
        r.push({ id: e.id, grupo: "eventos", titulo: e.titulo, sub: formatDateString(e.data, "d 'de' MMM"), icone: <CalendarDays size={15} />, executar: () => { navigateTo("calendario", { data: e.data }); closeValue(); } });
    }
    for (const c of useCommunication.getState().conversas) {
      if (ok(c.id, c.titulo, ...(t ? c.mensagens.map((m) => m.texto) : [])))
        r.push({ id: c.id, grupo: "conversas", titulo: c.titulo || T.chat.novaConversa, icone: <MessageSquare size={15} />, executar: () => { navigateTo("chat", { conversa: c.id }); closeValue(); } });
    }
    const hasRecent = r.map((x) => {
      const execute = x.executar;
      return { ...x, executar: () => { storeRecent(x.id); execute(); } };
    });
    if (!t) {
      const seen = recentItems.map((id) => hasRecent.find((x) => x.id === id)).filter((x): x is Result => !!x).slice(0, 6).map((x) => ({ ...x, grupo: "recentes" as const }));
      return [...seen, ...actions, ...tabs.slice(0, 6)];
    }
    return hasRecent.slice(0, 60);
  }, [isOpen, term, openValue, navigateTo, openCapture, disabled]);

  useEffect(() => {
    setActive(0);
  }, [term]);

  useEffect(() => {
    list.current?.querySelector(`[data-indice="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const groups = results.reduce<{ grupo: Result["grupo"]; itens: { r: Result; i: number }[] }[]>((acc, r, i) => {
    const g = acc.find((x) => x.grupo === r.grupo);
    if (g) g.itens.push({ r, i });
    else acc.push({ grupo: r.grupo, itens: [{ r, i }] });
    return acc;
  }, []);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="sobreposicao"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          onPointerDown={(e) => e.target === e.currentTarget && openValue(false)}
        >
          <motion.div
            className="paleta"
            role="dialog"
            aria-modal="true"
            aria-label={T.busca.placeholder}
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.3, 0.9, 0.3, 1] }}
          >
            <div className="paleta-campo">
              <Search size={16} />
              <input
                ref={field}
                value={term}
                maxLength={120}
                placeholder={T.busca.placeholder}
                aria-label={T.busca.placeholder}
                role="combobox"
                aria-expanded="true"
                aria-controls="paleta-lista"
                aria-activedescendant={results[active] ? `paleta-${results[active].id}` : undefined}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") openValue(false);
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((a) => Math.min(results.length - 1, a + 1));
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((a) => Math.max(0, a - 1));
                  }
                  if (e.key === "Enter") results[active]?.executar();
                }}
              />
              <Key>Esc</Key>
            </div>
            <div className="paleta-lista" id="paleta-lista" role="listbox" ref={list}>
              {results.length === 0 ? (
                <div className="vazio">{term ? T.busca.vazio : T.busca.dica}</div>
              ) : (
                groups.map((g) => (
                  <div key={g.grupo} role="group" aria-label={T.busca.grupos[g.grupo]}>
                    <div className="rotulo-secao paleta-grupo">{T.busca.grupos[g.grupo]}</div>
                    {g.itens.map(({ r, i }) => (
                      <button
                        key={r.id}
                        id={`paleta-${r.id}`}
                        type="button"
                        role="option"
                        aria-selected={i === active}
                        data-indice={i}
                        className="paleta-item"
                        onPointerMove={() => setActive(i)}
                        onClick={r.executar}
                      >
                        <span className="paleta-icone">{r.icone}</span>
                        <span className="cortar">{r.titulo}</span>
                        {r.sub && <span className="texto-3 cortar paleta-sub privado">{r.sub}</span>}
                        {i === active && <CornerDownLeft size={13} className="empurrar texto-3" />}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
            <div className="paleta-rodape texto-3">
              <span className="linha"><Key><ArrowUp size={11} /></Key><Key><ArrowDown size={11} /></Key>{T.busca.navegar}</span>
              <span><Key>Enter</Key> {T.busca.abrir}</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
