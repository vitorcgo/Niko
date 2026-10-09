import { useEffect, useRef, useState } from "react";
import { Search, Sun, Moon, PanelLeftClose, PanelLeftOpen, Circle, CheckCircle2, Settings, ChevronDown } from "lucide-react";
import { useConfig, GROUP_ROUTE } from "../../state/settings";
import { useInterface } from "../../state/interface";
import { useRoutine, tasksDay } from "../../state/routine";
import { useStudies, reviewsToToday } from "../../state/studies";
import { useAgents } from "../../state/agents";
import { useOrganization } from "../../state/organization";
import { T } from "../../i18n/ptBR";
import { ICON_ROUTE } from "./routes";
import { LogoNiko } from "../../components/LogoNiko";
import { Avatar } from "../../components/ProfilePhoto";
import { todayISO } from "../../utils/dates";
import { Key } from "../../components/basics";
import type { Route } from "../../types";
import { functionEnabled, routeEnabled } from "../../utils/features";

function useCounters(): Partial<Record<Route, { n: number; alerta?: boolean }>> {
  const today = todayISO();
  const tasks = useRoutine((s) => tasksDay(s.tarefas, today).filter((t) => t.status !== "concluida" && t.status !== "cancelada").length);
  const reviews = useStudies((s) => reviewsToToday(s));
  const failures = useAgents((s) => s.alertas.filter((a) => a.servico).length);
  const events = useOrganization((s) => s.eventos.filter((e) => e.data === today).length);
  return {
    journal: { n: tasks },
    estudos: { n: reviews },
    conexoes: { n: failures, alerta: true },
    calendario: { n: events },
  };
}

export function Sidebar({ recolhida: collapsed }: { recolhida: boolean }) {
  const bar = useConfig((s) => s.barraLateral);
  const theme = useConfig((s) => s.tema);
  const nameValue = useConfig((s) => s.nome);
  const closedValue = useConfig((s) => s.gruposFechados);
  const set = useConfig((s) => s.set);
  const collapsedManual = useConfig((s) => s.barraRecolhida);
  const route = useInterface((s) => s.rota);
  const navigateTo = useInterface((s) => s.navigateTo);
  const openSearch = useInterface((s) => s.openSearch);
  const tasks = useRoutine((s) => s.tarefas);
  const changeStatus = useRoutine((s) => s.changeStatus);
  const counters = useCounters();
  const scrollValue = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ topo: false, base: false });
  const disabled = useConfig((s) => s.funcoesDesligadas);
  const today = tasksDay(tasks, todayISO()).filter((t) => t.status !== "cancelada").slice(0, 5);
  const visible = bar.filter((i) => i.visivel && routeEnabled(i.rota, disabled));
  const showToday = functionEnabled("journal", disabled);

  useEffect(() => {
    const el = scrollValue.current;
    if (!el) return;
    const measure = () => setFade({ topo: el.scrollTop > 4, base: el.scrollTop + el.clientHeight < el.scrollHeight - 4 });
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      obs.disconnect();
    };
  }, [collapsed, closedValue.length]);

  const groups = (["principal", "organizacao", "ferramentas"] as const).map((g) => ({
    grupo: g,
    itens: visible.filter((i) => GROUP_ROUTE[i.rota] === g && i.rota !== "configuracoes"),
  }));

  const toggleGroup = (g: string) => set({ gruposFechados: closedValue.includes(g) ? closedValue.filter((x) => x !== g) : [...closedValue, g] });

  const item = (r: Route, nameItem?: string) => {
    const Icon = ICON_ROUTE[r];
    const active = route === r;
    const label = nameItem || T.rotas[r];
    const position = visible.findIndex((v) => v.rota === r) + 1;
    const counter = counters[r];
    const shortcut = position > 0 && position <= 9 ? ` (Ctrl + ${position})` : "";
    return (
      <button key={r} type="button" className="barra-item" aria-current={active ? "page" : undefined} title={`${label}${shortcut}`} onClick={() => navigateTo(r)}>
        <Icon size={16} />
        {!collapsed && <span className="cortar">{label}</span>}
        {counter && counter.n > 0 && <span className={`barra-contador ${counter.alerta ? "barra-contador-alerta" : ""}`} aria-label={String(counter.n)}>{collapsed ? "" : counter.n}</span>}
      </button>
    );
  };

  const systemDark = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const darkNow = theme === "escuro" || (theme === "sistema" && systemDark);
  const todayClosed = closedValue.includes("hoje");

  return (
    <nav className={`barra-lateral ${collapsed ? "barra-recolhida" : ""}`} aria-label={T.barraLateral.navegacao}>
      <div className="barra-topo">
        <LogoNiko tamanho={26} />
        {!collapsed && <span className="barra-marca">{T.app.nome}</span>}
        {!collapsed && (
          <button type="button" className="botao botao-fantasma botao-pequeno botao-icone empurrar" aria-label={T.barraLateral.recolher} title={`${T.barraLateral.recolher} (Ctrl + B)`} onClick={() => set({ barraRecolhida: !collapsedManual })}>
            <PanelLeftClose size={15} />
          </button>
        )}
      </div>
      {collapsed && (
        <button type="button" className="barra-item" aria-label={T.barraLateral.expandir} title={`${T.barraLateral.expandir} (Ctrl + B)`} onClick={() => set({ barraRecolhida: false })}>
          <PanelLeftOpen size={16} />
        </button>
      )}
      <button type="button" className="barra-busca" onClick={() => openSearch(true)} aria-label={T.barraLateral.buscar}>
        <Search size={14} />
        {!collapsed && (
          <>
            <span>{T.barraLateral.buscar}</span>
            <Key>Ctrl K</Key>
          </>
        )}
      </button>
      <div ref={scrollValue} className="barra-rolagem" data-fade-topo={fade.topo ? "sim" : "nao"} data-fade-base={fade.base ? "sim" : "nao"}>
        {groups.map(({ grupo: group, itens: items }) => {
          if (items.length === 0) return null;
          const isClosed = !collapsed && closedValue.includes(group) && !items.some((i) => i.rota === route);
          return (
            <div key={group} className="barra-grupo">
              {!collapsed && (
                <button type="button" className="barra-rotulo" aria-expanded={!isClosed} onClick={() => toggleGroup(group)}>
                  <span className="rotulo-secao">{T.gruposBarra[group]}</span>
                  <ChevronDown size={12} className="barra-rotulo-seta" />
                </button>
              )}
              {!isClosed && items.map((i) => item(i.rota, i.nome))}
            </div>
          );
        })}
        {!collapsed && showToday && (
          <div className="barra-grupo">
            <button type="button" className="barra-rotulo" aria-expanded={!todayClosed} onClick={() => toggleGroup("hoje")}>
              <span className="rotulo-secao">{T.gruposBarra.hoje}</span>
              <ChevronDown size={12} className="barra-rotulo-seta" />
            </button>
            {!todayClosed &&
              (today.length === 0 ? (
                <span className="barra-hoje-vazio">{T.barraLateral.semTarefasHoje}</span>
              ) : (
                today.map((t) => (
                  <div key={t.id} className="barra-hoje">
                    <button type="button" aria-label={t.status === "concluida" ? T.geral.reabrir : T.geral.concluir} onClick={() => changeStatus(t.id, t.status === "concluida" ? "a_fazer" : "concluida")} className="barra-hoje-marca">
                      {t.status === "concluida" ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                    </button>
                    <span className={`cortar ${t.status === "concluida" ? "riscado" : ""}`}>{t.titulo}</span>
                    {t.hora && <span className="texto-3 numero">{t.hora}</span>}
                  </div>
                ))
              ))}
          </div>
        )}
      </div>
      <div className="barra-base">
        <div className="barra-base-linha">
          <button type="button" className="barra-perfil" title={T.perfil.abrirPerfil} onClick={() => navigateTo("configuracoes", { secao: "geral" })}>
            <Avatar tamanho={28} />
            {!collapsed && <span className="cortar">{nameValue || T.barraLateral.perfil}</span>}
          </button>
          {!collapsed && (
            <>
              <button type="button" className="barra-icone" role="switch" aria-checked={darkNow} aria-label={darkNow ? T.barraLateral.temaClaro : T.barraLateral.temaEscuro} title={darkNow ? T.barraLateral.temaClaro : T.barraLateral.temaEscuro} onClick={() => set({ tema: darkNow ? "claro" : "escuro" })}>
                {darkNow ? <Moon size={15} /> : <Sun size={15} />}
              </button>
              <button type="button" className="barra-icone" aria-current={route === "configuracoes" ? "page" : undefined} aria-label={T.rotas.configuracoes} title={T.rotas.configuracoes} onClick={() => navigateTo("configuracoes")}>
                <Settings size={15} />
              </button>
            </>
          )}
        </div>
        {collapsed && (
          <>
            <button type="button" className="barra-item" aria-label={darkNow ? T.barraLateral.temaClaro : T.barraLateral.temaEscuro} title={darkNow ? T.barraLateral.temaClaro : T.barraLateral.temaEscuro} onClick={() => set({ tema: darkNow ? "claro" : "escuro" })}>
              {darkNow ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            {item("configuracoes")}
          </>
        )}
      </div>
    </nav>
  );
}
