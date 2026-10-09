import * as arte from "./motor/client/src/art";
import { Sim } from "./motor/client/src/world/sim/sim";
import { Camera } from "./motor/client/src/world/camera";
import { Renderer } from "./motor/client/src/world/render/renderer";
import { Overlay } from "./motor/client/src/world/render/overlay";
import { attachInput, type Hit } from "./motor/client/src/world/input";
import { TILE } from "./motor/client/src/world/constants";
import { inRect } from "./motor/client/src/world/layout/geometry";
import { DEFAULT_WORLD_OPTIONS, type WorldOptions } from "./motor/client/src/world/api";
import type { OfficeSnapshot } from "./motor/shared/types";
import type { EstiloDoPersonagem } from "./aparenciaDoEscritorio";
import { COR_DA_FERRAMENTA } from "../../janelas/ilha/claude/ferramentas";
import type { FerramentaDeCodigo } from "../../ponte/claudeCode";
import { enquadramentoDoEscritorio } from "./enquadramentoDoEscritorio";

export function criarMundoDoEscritorio(canvas: HTMLCanvasElement, aoSelecionar: (id: string) => void, aoFalhar: () => void, aoInteragir = () => {}) {
  let opcoes: WorldOptions = { ...DEFAULT_WORLD_OPTIONS, bubbles: "all", passearOcioso: true, liveliness: "lively", sociabilidade: 0.35 };
  // Carteiras da vida visual ficam apenas em memória, inclusive ao vivo.
  const sim = new Sim(arte, () => opcoes, null);
  const camera = new Camera();
  const render = new Renderer(canvas, arte, sim, camera);
  const overlay = new Overlay(render.ctx, sim, render, camera);
  let selecionada: string | null = null;
  let estilo: EstiloDoPersonagem = "niko";
  let raf = 0; let anterior = 0; let ultimoDesenho = 0; let ultimaColuna = -1;
  let movida = false; let noCampo = true; let destruido = false; let ativo = true;
  let visaoGeral = false;
  const movimento = window.matchMedia("(prefers-reduced-motion: reduce)");
  const rotulos = new Map<string, string>();
  // A arte usa texto de atividades sociais. No Niko, não renderizar emoji ou travessão.
  const escrever = render.ctx.fillText.bind(render.ctx);
  render.ctx.fillText = (texto, x, y, largura) => {
    let limpo = rotulos.get(texto);
    if (limpo === undefined) {
      limpo = texto.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, "").replace(/[\u2013\u2014]/g, ",");
      if (rotulos.size > 500) rotulos.clear();
      rotulos.set(texto, limpo);
    }
    if (largura === undefined) escrever(limpo, x, y); else escrever(limpo, x, y, largura);
  };
  const atualizarLimites = () => {
    const f = enquadramentoDoEscritorio(sim.building.cols, camera.viewW, camera.viewH, visaoGeral);
    camera.bounds = f.bounds; camera.minZoom = f.minZoom;
    return f;
  };
  const enquadrar = () => {
    const f = atualizarLimites();
    camera.stop(); camera.zoom = f.zoom;
    const c = camera.centerFor(f.cx, f.cy, camera.zoom);
    camera.x = c.x; camera.y = c.y - f.dy / camera.zoom; camera.clamp();
  };
  const tamanho = () => {
    const r = canvas.getBoundingClientRect(); const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    if (r.width <= 0 || r.height <= 0) return;
    const largura = Math.max(1, Math.round(r.width * dpr)); const altura = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== largura) canvas.width = largura;
    if (canvas.height !== altura) canvas.height = altura;
    camera.setView(r.width, r.height, dpr);
    atualizarLimites();
    if (!movida) enquadrar(); else camera.clamp();
    if (!destruido && ativo && !document.hidden && noCampo) pintar(Date.now(), 0);
    retomar();
  };
  const foco = (id: string) => {
    const ch = sim.chars.get(id); if (!ch) return;
    selecionada = id; movida = true;
    const z = camera.zoom; const c = camera.centerFor(ch.x, ch.y - 12, z);
    if (movimento.matches) { camera.stop(); camera.x = c.x; camera.y = c.y; camera.zoom = z; camera.clamp(); }
    else camera.animateTo(c.x, c.y, z, Date.now(), 350);
  };
  const escolher = (x: number, y: number): Hit => {
    const p = camera.screenToWorld(x, y);
    let melhor: string | null = null; let profundidade = -Infinity;
    for (const [id, h] of render.heads) if (h.visible && p.x >= h.bx - 3 && p.x <= h.bx + h.bw + 3 && p.y >= h.by - 3 && p.y <= h.by + h.bh + 3 && h.depth > profundidade) { melhor = id; profundidade = h.depth; }
    if (melhor) return { type: "agent", id: melhor };
    for (const r of sim.rooms.values()) if (r.present && inRect(r.layout.rect, Math.floor(p.x / TILE), Math.floor(p.y / TILE))) return { type: "room", id: r.id };
    return null;
  };
  const aproximar = (passos: number, x = camera.viewW / 2, y = camera.viewH / 2) => {
    opcoes = { ...opcoes, followSelected: false }; aoInteragir();
    movida = true; camera.zoomAt(camera.stepZoom(passos), x, y, Date.now(), !movimento.matches);
  };
  const desligarEntrada = attachInput(canvas, camera, {
    pick: escolher, click: (hit) => { if (hit?.type === "agent") { selecionada = hit.id; aoSelecionar(hit.id); } },
    doubleClick: (hit) => { if (hit?.type === "agent") foco(hit.id); },
    hover: () => {}, interact: () => { movida = true; camera.follow = null; opcoes = { ...opcoes, followSelected: false }; aoInteragir(); },
    overview: () => { movida = false; visaoGeral = false; opcoes = { ...opcoes, followSelected: false }; aoInteragir(); enquadrar(); }, zoomStep: aproximar,
  });
  const alterarAparencia = () => {
    for (const ch of sim.chars.values()) {
      const base = arte.appearanceFromSeed(ch.info.seed, { look: ch.info.look, sub: ch.info.kind === "sub" });
      ch.appearance = estilo === "original" ? base : { ...base, topStyle: "hoodie", top: COR_DA_FERRAMENTA[ch.info.account as FerramentaDeCodigo] || "#78b7a1", topAccent: "#d8ede6", bottom: "#2c3546", accessory: "headphones", accessoryColor: "#323e4c" };
    }
  };
  const pintar = (now: number, dt: number) => {
    try {
      render.sync();
      if (ultimaColuna !== sim.building.cols) { ultimaColuna = sim.building.cols; atualizarLimites(); if (!movida) enquadrar(); else camera.clamp(); }
      const ch = opcoes.followSelected && selecionada ? sim.chars.get(selecionada) : undefined;
      camera.update(now, ch ? camera.centerFor(ch.x, ch.y - 12, camera.zoom) : null, dt);
      const estado = { agent: selecionada, room: null, hover: null };
      render.frame(now, dt, opcoes, estado); overlay.draw(now, opcoes, estado); render.pruneHeads();
    } catch (erro) { console.error("[escritório] erro na cena", erro); destruido = true; aoFalhar(); }
  };
  const desenhar = (ts: number) => {
    raf = 0;
    if (destruido || !ativo || document.hidden || !noCampo) return;
    const reduzido = movimento.matches;
    // 30 fps no máximo; modo de movimento reduzido desenha só a cada segundo e congela poses.
    if (ts - ultimoDesenho >= (reduzido ? 1000 : 1000 / 30)) {
      const now = Date.now(); const dt = anterior ? Math.min(.1, (ts - anterior) / 1000) : 1 / 30;
      anterior = ts; ultimoDesenho = ts;
      try { if (!reduzido) sim.update(dt, now); }
      catch (erro) { console.error("[escritório] erro na simulação", erro); destruido = true; aoFalhar(); return; }
      sim.social.events.length = 0;
      pintar(now, reduzido ? 0 : dt);
    }
    if (!destruido) raf = requestAnimationFrame(desenhar);
  };
  const retomar = () => { cancelAnimationFrame(raf); raf = 0; anterior = 0; ultimoDesenho = 0; if (!destruido && ativo && !document.hidden && noCampo) raf = requestAnimationFrame(desenhar); };
  const observador = new ResizeObserver(tamanho); observador.observe(canvas); tamanho();
  const intersecao = new IntersectionObserver(([e]) => { noCampo = e.isIntersecting; retomar(); }); intersecao.observe(canvas);
  document.addEventListener("visibilitychange", retomar); movimento.addEventListener("change", retomar); retomar();
  return {
    visibilidade: (visivel: boolean) => { ativo = visivel; retomar(); },
    aplicar: (snapshot: OfficeSnapshot) => { sim.applySnapshot(snapshot, Date.now()); alterarAparencia(); ultimoDesenho = 0; },
    opcoes: (novas: Partial<WorldOptions>, novoEstilo: EstiloDoPersonagem) => { opcoes = { ...opcoes, ...novas }; estilo = novoEstilo; alterarAparencia(); ultimoDesenho = 0; },
    selecionar: (id?: string) => { selecionada = id ?? null; },
    foco, aproximar, enquadrar: (geral = false) => { movida = false; visaoGeral = geral; opcoes = { ...opcoes, followSelected: false }; aoInteragir(); enquadrar(); ultimoDesenho = 0; },
    passear: () => { for (const ch of sim.chars.values()) if (ch.mode === "idle") ch.nextOutingAt = 1; },
    destruir: () => { destruido = true; cancelAnimationFrame(raf); desligarEntrada(); observador.disconnect(); intersecao.disconnect(); document.removeEventListener("visibilitychange", retomar); movimento.removeEventListener("change", retomar); rotulos.clear(); },
  };
}
