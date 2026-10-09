import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import { Box, LayoutGrid, MessageSquare, X } from "lucide-react";
import { TabHeader } from "../../components/TabHeader";
import { Card, Button, Segmented, NoticeBanner } from "../../components/basics";
import { Character } from "../../characters/Character";
import { useAgents, AGENTS } from "../../state/agents";
import { useConfig } from "../../state/settings";
import { useInterface } from "../../state/interface";
import { T } from "../../i18n/ptBR";
import { scheduleRelative } from "../../utils/dates";
import { useBehavior, DESKS, PLACES, type Action } from "./behavior";
import { Thought } from "./Thought";
import type { AgentId } from "../../types";

const Scene3D = lazy(() => import("./Scene3D"));

class LimitError extends Component<{ reserva: ReactNode; children: ReactNode }, { falhou: boolean }> {
  state = { falhou: false };
  static getDerivedStateFromError() {
    return { falhou: true };
  }
  render() {
    return this.state.falhou ? this.props.reserva : this.props.children;
  }
}

const NAME_ACTION: Partial<Record<Action, number>> = { cafe: 0, janela: 1, conversar: 2, esticar: 3, sofa: 4 };

function para2D([x, z]: [number, number]) {
  return { left: `${((x + 6) / 12) * 100}%`, top: `${((z + 4) / 8) * 100}%` };
}

function Sala2D({ comportamento: behavior, tarefas: tasks, aoEscolher: onSelect }: { comportamento: ReturnType<typeof useBehavior>; tarefas: Record<AgentId, string>; aoEscolher: (a: AgentId) => void }) {
  return (
    <div className="sala-2d" role="img" aria-label={T.escritorio.titulo}>
      {AGENTS.map((a) => (
        <div key={a} className="sala-mesa" style={para2D(DESKS[a])}>
          <span className="sala-monitor" data-erro={behavior[a].estado === "erro" ? "sim" : "nao"}>{tasks[a] || T.escritorio.livre}</span>
        </div>
      ))}
      <div className="sala-objeto" style={para2D(PLACES.sofa)}>{T.escritorio.objetos.sofa}</div>
      <div className="sala-objeto" style={para2D(PLACES.cafe)}>{T.escritorio.objetos.cafe}</div>
      <div className="sala-objeto" style={para2D(PLACES.janela)}>{T.escritorio.objetos.janela}</div>
      {AGENTS.map((a) => (
        <div key={a} className={`sala-agente agente-cena acao-${behavior[a].acao}`} style={para2D(behavior[a].alvo)}>
          <Thought agente={a} c={behavior[a]} tarefa={tasks[a]} />
          <Character agente={a} tamanho={52} estado={behavior[a].estado} />
          <button type="button" className="sala-rotulo" onClick={() => onSelect(a)}>{useConfig.getState().agentes.nomes[a]}</button>
        </div>
      ))}
    </div>
  );
}

export default function Office() {
  const modeLightweight = useConfig((s) => s.modoLeveEscritorio);
  const set = useConfig((s) => s.set);
  const names = useConfig((s) => s.agentes.nomes);
  const roles = useConfig((s) => s.agentes.cargos);
  const tasks = useAgents((s) => s.tarefaAtual);
  const activities = useAgents((s) => s.atividades);
  const navigateTo = useInterface((s) => s.navigateTo);
  const behavior = useBehavior();
  const [selected, setSelected] = useState<AgentId | null>(null);
  const dark = document.documentElement.dataset.tema === "escuro";

  const caption = (a: AgentId) => {
    const c = behavior[a];
    if (tasks[a]) return tasks[a];
    const i = NAME_ACTION[c.acao];
    return c.estado === "ocioso" && i !== undefined ? T.escritorio.acoesLivres[i] : T.agentes.estados[c.estado];
  };

  const fallback = <><NoticeBanner tipo="alerta">{T.escritorio.falhou3d}</NoticeBanner><Sala2D comportamento={behavior} tarefas={tasks} aoEscolher={setSelected} /></>;

  return (
    <>
      <TabHeader
        titulo={T.escritorio.titulo}
        subtitulo={T.escritorio.subtitulo}
        acoes={
          <Segmented
            rotulo={T.escritorio.titulo}
            valor={modeLightweight ? "2d" : "3d"}
            aoMudar={(v) => set({ modoLeveEscritorio: v === "2d" })}
            opcoes={[{ valor: "3d", rotulo: T.escritorio.modo3d, icone: <Box size={13} /> }, { valor: "2d", rotulo: T.escritorio.modoLeve, icone: <LayoutGrid size={13} /> }]}
          />
        }
      />
      <div className="escritorio">
        <div className="escritorio-cena">
          {modeLightweight ? (
            <Sala2D comportamento={behavior} tarefas={tasks} aoEscolher={setSelected} />
          ) : (
            <LimitError reserva={fallback}>
              <Suspense fallback={<div className="vazio" aria-busy="true">{T.escritorio.carregando3d}</div>}>
                <Scene3D comportamento={behavior} tarefas={tasks} aoEscolher={setSelected} escuro={dark} />
              </Suspense>
            </LimitError>
          )}
          {selected && (
            <div className="escritorio-cartao cartao">
              <div className="linha">
                <Character agente={selected} tamanho={44} />
                <div className="coluna" style={{ gap: 0, flex: 1 }}>
                  <b>{names[selected]}</b>
                  <span className="texto-3" style={{ fontSize: 11 }}>{roles[selected]}: {T.agentes.areas[selected]}</span>
                </div>
                <Button pequeno soIcone variante="fantasma" icone={<X size={14} />} aria-label={T.geral.fechar} onClick={() => setSelected(null)} />
              </div>
              <div className="coluna" style={{ gap: 2 }}>
                <span className="rotulo-secao">{T.escritorio.tarefaAtual}</span>
                <span>{caption(selected)}</span>
              </div>
              <div className="coluna" style={{ gap: 2 }}>
                <span className="rotulo-secao">{T.escritorio.ultimasAcoes}</span>
                {activities.filter((x) => x.agenteId === selected).slice(0, 5).map((x) => (
                  <span key={x.id} className="texto-2 cortar" style={{ fontSize: 12 }}>{x.texto} . {scheduleRelative(x.data)}</span>
                ))}
                {!activities.some((x) => x.agenteId === selected) && <span className="texto-3">{T.agentes.semAtividade}</span>}
              </div>
              <Button variante="primario" icone={<MessageSquare size={14} />} onClick={() => navigateTo("chat", { agente: selected })}>{T.escritorio.conversar}</Button>
            </div>
          )}
        </div>
        <div className="lista-time">
          {AGENTS.map((a) => (
            <Card key={a} className="cartao-clicavel">
              <button type="button" className="linha" style={{ width: "100%", textAlign: "left" }} onClick={() => setSelected(a)}>
                <Character agente={a} tamanho={36} interativo={false} halo={false} estado={behavior[a].estado} />
                <div className="coluna" style={{ gap: 0, minWidth: 0 }}>
                  <b>{names[a]}</b>
                  <span className="texto-2 cortar" style={{ fontSize: 12 }}>{caption(a)}</span>
                </div>
              </button>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
