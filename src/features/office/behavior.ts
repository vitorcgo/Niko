import { useEffect, useRef, useState } from "react";
import { useAgents, AGENTS, stateAgent } from "../../state/agents";
import type { AgentId, AgentState } from "../../types";

export type Point = [number, number];

export const DESKS: Record<AgentId, Point> = {
  organizador: [-3, -1.2],
  tutor: [0, -1.6],
  operador: [3, -1.2],
  java: [1.1, 1.2],
};

export const PLACES = {
  cafe: [4.2, 2.4] as Point,
  janela: [-4.3, 1.6] as Point,
  sofa: [-2.4, 3] as Point,
  quadro: [0.6, 1.4] as Point,
};

export type Action = "mesa" | "cafe" | "janela" | "sofa" | "conversar" | "girar" | "pular" | "esticar";

export interface Behavior {
  alvo: Point;
  acao: Action;
  estado: AgentState;
}

const WEIGHTS: [Action, number][] = [
  ["cafe", 3],
  ["janela", 2],
  ["conversar", 2],
  ["sofa", 2],
  ["esticar", 1],
  ["mesa", 3],
];

function randomize(): Action {
  const total = WEIGHTS.reduce((a, [, p]) => a + p, 0);
  let r = Math.random() * total;
  for (const [action, p] of WEIGHTS) {
    r -= p;
    if (r <= 0) return action;
  }
  return "mesa";
}

function offset([x, z]: Point, i: number): Point {
  return [x + (i - 1) * 0.7, z + (i % 2) * 0.4];
}

export function useBehavior(): Record<AgentId, Behavior> {
  const s = useAgents();
  const [free, setFree] = useState<Record<AgentId, Action>>({ organizador: "mesa", tutor: "cafe", operador: "janela", java: "mesa" });
  const states = Object.fromEntries(AGENTS.map((a) => [a, stateAgent(s, a)])) as Record<AgentId, AgentState>;
  const ref = useRef(states);
  ref.current = states;

  useEffect(() => {
    const timers: number[] = [];
    const schedule = (a: AgentId) => {
      timers.push(
        window.setTimeout(() => {
          if (!document.hidden && ref.current[a] === "ocioso") setFree((l) => ({ ...l, [a]: randomize() }));
          schedule(a);
        }, 8000 + Math.random() * 12000),
      );
    };
    AGENTS.forEach(schedule);
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  const result = {} as Record<AgentId, Behavior>;
  AGENTS.forEach((a, i) => {
    const state = states[a];
    let action: Action = free[a];
    if (["pensando", "escrevendo", "erro", "alerta"].includes(state)) action = "mesa";
    if (state === "dormindo") action = "sofa";
    if (state === "sucesso") action = "pular";
    const other = AGENTS[(i + 1) % AGENTS.length];
    const target: Point =
      action === "mesa" || action === "girar" || action === "pular" || action === "esticar"
        ? [DESKS[a][0], DESKS[a][1] + 0.9]
        : action === "conversar"
          ? [DESKS[other][0] + 0.8, DESKS[other][1] + 1.2]
          : offset(PLACES[action], i);
    result[a] = { alvo: target, acao: action, estado: state };
  });
  return result;
}
