import { useEffect, useState } from "react";
import { Coffee, CloudSun, Sofa, MessagesSquare, PersonStanding, Laptop, Zap, Keyboard, PartyPopper, Bug, Moon, Ear, BellRing } from "lucide-react";
import { useAgents } from "../../state/agents";
import { useInterface } from "../../state/interface";
import { T } from "../../i18n/ptBR";
import type { AgentId } from "../../types";
import type { Behavior } from "./behavior";

const ICON_ACTION: Record<string, React.ReactNode> = {
  mesa: <Laptop size={12} />,
  cafe: <Coffee size={12} />,
  janela: <CloudSun size={12} />,
  sofa: <Sofa size={12} />,
  conversar: <MessagesSquare size={12} />,
  esticar: <PersonStanding size={12} />,
};

const ICON_STATE: Record<string, React.ReactNode> = {
  pensando: <Zap size={12} />,
  escrevendo: <Keyboard size={12} />,
  sucesso: <PartyPopper size={12} />,
  erro: <Bug size={12} />,
  dormindo: <Moon size={12} />,
  ouvindo: <Ear size={12} />,
};

function randomize(list: string[], previous: string) {
  if (list.length <= 1) return list[0] ?? "";
  let newItem = previous;
  while (newItem === previous) newItem = list[Math.floor(Math.random() * list.length)];
  return newItem;
}

export function Thought({ agente: agent, c, tarefa: task }: { agente: AgentId; c: Behavior; tarefa?: string }) {
  const alertValue = useAgents((s) => s.alertas.find((a) => a.agenteId === agent));
  const navigateTo = useInterface((s) => s.navigateTo);
  const action = ICON_ACTION[c.acao] ? c.acao : "mesa";
  const list = c.estado !== "ocioso" && T.escritorio.pensamentosEstado[c.estado] ? T.escritorio.pensamentosEstado[c.estado] : T.escritorio.pensamentos[agent][action] ?? [];
  const [text, setText] = useState(() => randomize(list, ""));
  const key = `${c.estado}-${action}`;

  useEffect(() => {
    setText((t) => randomize(list, t));
    const interval = window.setInterval(() => {
      if (!document.hidden) setText((t) => randomize(list, t));
    }, 9000 + Math.random() * 4000);
    return () => window.clearInterval(interval);
  }, [key]);

  if (c.estado === "alerta" && alertValue)
    return (
      <button type="button" className="balao-cena balao-fala" onClick={() => alertValue.rota && navigateTo(alertValue.rota)}>
        <BellRing size={12} />
        <span className="cortar privado">{alertValue.texto}</span>
      </button>
    );

  const displayed = task || text;
  if (!displayed) return null;
  return (
    <div key={displayed} className="balao-cena balao-pensamento" aria-live="polite">
      {task ? <Keyboard size={12} /> : ICON_STATE[c.estado] ?? ICON_ACTION[action]}
      <span className="privado">{displayed}</span>
    </div>
  );
}
