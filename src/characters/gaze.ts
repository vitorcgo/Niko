import type { AgentId } from "../types";
import { pathCharacter } from "./colors";

export interface Ellipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  transform: string;
  fill: string;
}

export interface Face {
  corpo: { d: string; transform: string; fill: string };
  olhos: { branco: Ellipse; pupila: Ellipse }[];
}

const cache = new Map<AgentId, Promise<Face | null>>();

function ellipse(el: Element): Ellipse {
  return {
    cx: Number(el.getAttribute("cx") ?? 0),
    cy: Number(el.getAttribute("cy") ?? 0),
    rx: Number(el.getAttribute("rx") ?? 0),
    ry: Number(el.getAttribute("ry") ?? 0),
    transform: el.getAttribute("transform") ?? "",
    fill: el.getAttribute("fill") ?? "#141416",
  };
}

async function extract(agent: AgentId): Promise<Face | null> {
  try {
    const r = await fetch(pathCharacter(agent, "ocioso"));
    if (!r.ok) return null;
    const doc = new DOMParser().parseFromString(await r.text(), "image/svg+xml");
    const path = doc.querySelector("defs path#s0");
    const board = doc.querySelector("svg > g");
    const usage = board?.querySelector(":scope > use");
    if (!path || !board || !usage) return null;
    const children = Array.from(board.children);
    const eyes: Face["olhos"] = [];
    for (let i = 0; i < children.length; i++) {
      const el = children[i];
      if (el.tagName !== "ellipse") continue;
      const next = children[i + 1];
      const pupil = next?.tagName === "g" ? next.querySelector("ellipse") : null;
      if (pupil) eyes.push({ branco: ellipse(el), pupila: ellipse(pupil) });
    }
    if (eyes.length === 0) return null;
    return {
      corpo: { d: path.getAttribute("d") ?? "", transform: usage.getAttribute("transform") ?? "", fill: usage.getAttribute("fill") ?? "#000" },
      olhos: eyes,
    };
  } catch {
    return null;
  }
}

export function loadFace(agent: AgentId): Promise<Face | null> {
  let p = cache.get(agent);
  if (!p) {
    p = extract(agent).then((r) => {
      if (!r) cache.delete(agent);
      return r;
    });
    cache.set(agent, p);
  }
  return p;
}

type Listener = (x: number, y: number) => void;
const listeners = new Set<Listener>();
let boardPending = 0;
let last = { x: -9999, y: -9999 };

function onMove(e: PointerEvent) {
  last = { x: e.clientX, y: e.clientY };
  if (boardPending) return;
  boardPending = requestAnimationFrame(() => {
    boardPending = 0;
    listeners.forEach((o) => o(last.x, last.y));
  });
}

export function listenMouse(o: Listener): () => void {
  if (listeners.size === 0) window.addEventListener("pointermove", onMove, { passive: true });
  listeners.add(o);
  return () => {
    listeners.delete(o);
    if (listeners.size === 0) window.removeEventListener("pointermove", onMove);
  };
}
