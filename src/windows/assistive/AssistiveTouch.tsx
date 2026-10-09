import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useReducedMotion } from "motion/react";
import { ArrowLeft, Check, LoaderCircle, Plus, Search, Trash2, X } from "lucide-react";
import { useConfig } from "../../state/settings";
import { NATIVE, reportAreaInteractive, windowCurrent, useAreaInteractive } from "../../desktop/desktop";
import { control, type AppInstalled } from "../../bridge/localBridge";
import { T } from "../../i18n/ptBR";
import { attributesBackground, useAppearanceBorder, variablesBorder } from "../appearance";
import { loadIconsAssistive, listAppsAssistive } from "./catalog";
import { LIMIT_SHORTCUTS, SIZE_BUTTON, limitPosition, normalizePosition, positionScreen, positionMenu, type ShortcutAssistive, type PositionAssistive } from "./rules";
import "./assistive.css";

const C = T.assistive;
const SPRING = { type: "spring" as const, stiffness: 420, damping: 34, mass: 0.8 };
const readScreen = () => ({ largura: window.innerWidth, altura: window.innerHeight });

function useIcons(ids: string[], active = true) {
  const [icons, setIcons] = useState<Record<string, string | null>>({});
  const signature = JSON.stringify(ids);
  useEffect(() => {
    if (!active || !ids.length) return;
    let alive = true;
    void loadIconsAssistive(JSON.parse(signature) as string[]).then((r) => { if (alive) setIcons(r); }).catch(() => undefined);
    return () => { alive = false; };
  }, [signature, active]);
  return icons;
}

function IconApp({ app, icone: icon }: { app: ShortcutAssistive; icone?: string | null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [icon]);
  return <span className="assistive-icone-app">{icon && !failed ? <img src={icon} alt="" draggable={false} onError={() => setFailed(true)} /> : <span>{app.nome.trim().slice(0, 1).toUpperCase()}</span>}</span>;
}

function SelectorApps({ aoAdicionar: onAdd }: { aoAdicionar: (app: AppInstalled, originValue: DOMRect, icon: string | null) => void }) {
  const shortcuts = useConfig((s) => s.assistive.apps);
  const [apps, setApps] = useState<AppInstalled[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [quantity, setQuantity] = useState(24);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let alive = true;
    field.current?.focus();
    setLoading(true); setError(false);
    void listAppsAssistive(attempt > 0).then((r) => { if (alive) setApps(r); }).catch(() => { if (alive) setError(true); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [attempt]);
  const normalize = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR");
  const filtered = apps.filter((a) => normalize(a.nome).includes(normalize(query)));
  const visible = filtered.slice(0, quantity);
  const icons = useIcons(visible.map((a) => a.id));
  return <div className="assistive-seletor">
    <label className="assistive-busca"><Search size={17} /><input ref={field} value={query} onChange={(e) => { setQuery(e.target.value); setQuantity(24); }} placeholder={C.buscar} aria-label={C.buscar} />{query && <button type="button" aria-label={T.geral.limpar} onClick={() => { setQuery(""); field.current?.focus(); }}><X size={15} /></button>}</label>
    <div className="assistive-catalogo">
      {loading ? <div className="assistive-mensagem"><LoaderCircle size={22} className="girando" /><p>{C.carregando}</p></div> : error ? <div className="assistive-mensagem"><p>{C.falhaLista}</p><button className="assistive-acao" onClick={() => setAttempt((n) => n + 1)}>{C.tentar}</button></div> : !filtered.length ? <p className="assistive-mensagem">{C.semApps}</p> : visible.map((app) => {
        const adicionado = shortcuts.some((a) => a.id === app.id);
        return <button type="button" key={app.id} className="assistive-app-lista" aria-label={adicionado ? C.adicionado(app.nome) : `${C.adicionar}: ${app.nome}`} disabled={adicionado || shortcuts.length >= LIMIT_SHORTCUTS} onClick={(e) => onAdd(app, e.currentTarget.querySelector(".assistive-icone-app")!.getBoundingClientRect(), icons[app.id] ?? null)}>
          <IconApp app={app} icone={icons[app.id]} /><span>{app.nome}</span>{adicionado ? <Check size={17} /> : <Plus size={17} />}
        </button>;
      })}
      {!error && filtered.length > quantity && <button type="button" className="assistive-mais" onClick={() => setQuantity((n) => n + 24)}>{C.mais}</button>}
    </div>
    <span className="assistive-contagem">{shortcuts.length >= LIMIT_SHORTCUTS ? C.limite : C.contagem(shortcuts.length)}</span>
  </div>;
}

function AssistiveActive() {
  const cfg = useConfig((s) => s.assistive);
  const set = useConfig((s) => s.setAssistive);
  const reduced = useConfig((s) => s.reduzirAnimacoes);
  const withoutMovement = useReducedMotion() || reduced;
  const background = useConfig((s) => cfg.origemCor === "dock" ? s.dock.fundo : s.ilha.fundo);
  const opacity = useConfig((s) => cfg.origemCor === "dock" ? s.dock.opacidade : s.ilha.opacidade);
  const appearance = useAppearanceBorder(background, opacity);
  const [isOpen, setOpen] = useState(cfg.fixado);
  const [page, setPage] = useState<"atalhos" | "adicionar">("atalhos");
  const [dragging, setDragging] = useState(false);
  const [screenValue, setScreen] = useState(readScreen);
  const [position, setPosition] = useState(() => positionScreen(cfg.posicao, readScreen()));
  const [height, setHeight] = useState(360);
  const [notice, setNotice] = useState("");
  const [failureOnOpen, setFailureOnOpen] = useState(false);
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [voo, setVoo] = useState<{ app: ShortcutAssistive; icone: string | null; origem: PositionAssistive; destino: PositionAssistive | null } | null>(null);
  const busy = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const gesto = useRef<{ id: number; x: number; y: number; origem: PositionAssistive; moveu: boolean } | null>(null);
  const suprimirClique = useRef(false);
  const [remocao, setRemocao] = useState<{ id: string; x: number; y: number } | null>(null);
  const removeButton = useRef<HTMLButtonElement>(null);
  const remocaoCurrent = useRef(remocao);
  remocaoCurrent.current = remocao;
  const suprimirOpening = useRef(false);
  const pressao = useRef<{ x: number; y: number; temporizador: number } | null>(null);
  const cancelPressao = useCallback(() => {
    if (pressao.current) window.clearTimeout(pressao.current.temporizador);
    pressao.current = null;
  }, []);
  const requestRemocao = (app: ShortcutAssistive, element: HTMLElement) => {
    const r = element.getBoundingClientRect();
    setRemocao({ id: app.id, x: Math.max(12, Math.min(screenValue.largura - 172, r.right + 168 < screenValue.largura ? r.right + 8 : r.left - 168)), y: Math.max(12, Math.min(screenValue.altura - 52, r.top)) });
  };
  const x = useMotionValue(position.x), y = useMotionValue(position.y);
  const icons = useIcons(cfg.apps.map((a) => a.id), isOpen);
  const menu = positionMenu(position, screenValue, height, page === "adicionar" ? 280 : 44);
  const integrado = isOpen && page === "atalhos";
  const startGaveta = Math.min(position.y, menu.y);
  const heightGaveta = Math.max(position.y + SIZE_BUTTON, menu.y + menu.altura) - startGaveta;
  useAreaInteractive([".assistive-botao", ".assistive-painel", ".assistive-capsula", ".assistive-remover", ".assistive-raiz[data-arrastando='true']"]);

  const closeValue = useCallback(() => { setOpen(false); setPage("atalhos"); setRemocao(null); cancelPressao(); }, [cancelPressao]);
  useEffect(() => {
    document.addEventListener("pointerup", cancelPressao);
    document.addEventListener("pointercancel", cancelPressao);
    return () => {
      cancelPressao();
      document.removeEventListener("pointerup", cancelPressao);
      document.removeEventListener("pointercancel", cancelPressao);
    };
  }, [cancelPressao]);
  useEffect(() => { if (remocao) removeButton.current?.focus(); }, [remocao]);
  useEffect(() => {
    if (!isOpen || page !== "atalhos" || (remocao && !cfg.apps.some((a) => a.id === remocao.id))) setRemocao(null);
  }, [isOpen, page, cfg.apps, remocao]);
  useEffect(() => {
    const resize = () => setScreen(readScreen());
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    const p = positionScreen(cfg.posicao, screenValue);
    setPosition(p); x.set(p.x); y.set(p.y);
  }, [cfg.posicao.x, cfg.posicao.y, screenValue, x, y]);
  useEffect(() => { if (cfg.fixado) setOpen(true); }, [cfg.fixado]);
  useEffect(() => {
    if (!isOpen) return;
    const outside = (e: PointerEvent) => {
      if (e.target instanceof Element && !e.target.closest(".assistive-remover")) setRemocao(null);
      if (!cfg.fixado && e.target instanceof Node && !root.current?.contains(e.target)) closeValue();
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); if (remocaoCurrent.current) setRemocao(null); else closeValue(); button.current?.focus(); } };
    const desfocar = () => { cancelPressao(); setRemocao(null); if (!cfg.fixado) closeValue(); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    window.addEventListener("blur", desfocar);
    if (NATIVE) void windowCurrent().then((j) => j.setFocus()).catch(() => undefined);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key); window.removeEventListener("blur", desfocar); };
  }, [isOpen, cfg.fixado, closeValue, cancelPressao]);
  useEffect(() => {
    if (!isOpen || !panel.current) return;
    const element = panel.current;
    const measure = () => setHeight(element.scrollHeight + 2);
    const observer = new ResizeObserver(measure);
    observer.observe(element); measure();
    return () => observer.disconnect();
  }, [isOpen, page]);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (!voo || voo.destino) return;
    if (!isOpen || withoutMovement) { setVoo(null); return; }
    const observer = new MutationObserver(encontrarDestination);
    function encontrarDestination() {
      const target = [...(root.current?.querySelectorAll<HTMLElement>("[data-atalho-id]") ?? [])].find((el) => el.dataset.atalhoId === voo?.app.id)?.querySelector(".assistive-icone-app");
      if (!target) return;
      const r = target.getBoundingClientRect();
      observer.disconnect();
      setVoo((current) => current && { ...current, destino: { x: r.left + r.width / 2 - 16, y: r.top + r.height / 2 - 16 } });
    }
    if (root.current) observer.observe(root.current, { childList: true, subtree: true });
    encontrarDestination();
    const limit = window.setTimeout(() => setVoo(null), 1200);
    return () => { observer.disconnect(); window.clearTimeout(limit); };
  }, [voo?.app.id, isOpen, withoutMovement]);
  useEffect(() => {
    const hide = () => { if (document.hidden) setVoo(null); };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  useEffect(() => { if (!isOpen || withoutMovement) setVoo(null); }, [isOpen, withoutMovement]);

  const savePosition = (p: PositionAssistive) => { setPosition(p); x.set(p.x); y.set(p.y); set({ posicao: normalizePosition(p, screenValue) }); };
  const finishGesto = (e: React.PointerEvent<HTMLButtonElement>, cancel = false) => {
    const g = gesto.current;
    if (!g || g.id !== e.pointerId) return;
    gesto.current = null; setDragging(false);
    if (NATIVE) void reportAreaInteractive([...document.querySelectorAll(".assistive-botao, .assistive-painel, .assistive-capsula, .assistive-remover")].map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    }));
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (g.moveu) { suprimirClique.current = true; savePosition(cancel ? g.origem : limitPosition({ x: x.get(), y: y.get() }, screenValue)); }
  };
  const openApp = async (app: ShortcutAssistive) => {
    if (!useConfig.getState().assistive.apps.some((a) => a.id === app.id)) return;
    if (busy.current) return;
    busy.current = true; setAbrindo(app.id); setNotice(""); setFailureOnOpen(false);
    try { await control.abrirApp(app.id); if (!useConfig.getState().assistive.fixado) closeValue(); }
    catch { setFailureOnOpen(true); setNotice(C.falhaAbrir(app.nome)); }
    finally { busy.current = false; setAbrindo(null); }
  };
  const add = (app: AppInstalled, originValue: DOMRect, icon: string | null) => {
    const current = useConfig.getState().assistive.apps;
    if (current.some((a) => a.id === app.id) || current.length >= LIMIT_SHORTCUTS) return;
    set({ apps: [...current, { id: app.id, nome: app.nome }] });
    if (!withoutMovement) setVoo({ app, icone: icon, origem: { x: originValue.left + originValue.width / 2 - 16, y: originValue.top + originValue.height / 2 - 16 }, destino: null });
    setPage("atalhos"); setFailureOnOpen(false); setNotice(C.adicionado(app.nome));
  };

  return <div ref={root} className="assistive-raiz" data-arrastando={dragging || undefined} {...attributesBackground(appearance)} style={variablesBorder(appearance)}>
    <motion.button ref={button} type="button" className="assistive-botao" data-integrado={integrado || undefined} style={{ x, y, opacity: isOpen || dragging ? 1 : cfg.opacidade }} aria-label={isOpen ? C.fechar : C.abrir} aria-expanded={isOpen} aria-controls="assistive-painel" title={C.arrastar}
      whileHover={withoutMovement ? { opacity: 1 } : { opacity: 1, scale: 1.045 }} whileTap={withoutMovement ? undefined : { scale: 0.95 }}
      onPointerDown={(e) => {
        if (e.button !== 0 || !e.isPrimary) return;
        suprimirClique.current = false;
        gesto.current = { id: e.pointerId, x: e.clientX, y: e.clientY, origem: { x: x.get(), y: y.get() }, moveu: false };
        e.currentTarget.setPointerCapture(e.pointerId);
        if (NATIVE) void reportAreaInteractive([{ x: 0, y: 0, w: screenValue.largura, h: screenValue.altura }]);
      }}
      onPointerMove={(e) => {
        const g = gesto.current;
        if (!g || g.id !== e.pointerId) return;
        const dx = e.clientX - g.x, dy = e.clientY - g.y;
        if (!g.moveu && Math.hypot(dx, dy) < 6) return;
        if (!g.moveu) { g.moveu = true; setDragging(true); closeValue(); }
        const p = limitPosition({ x: g.origem.x + dx, y: g.origem.y + dy }, screenValue);
        x.set(p.x); y.set(p.y);
      }}
      onPointerUp={(e) => finishGesto(e)} onPointerCancel={(e) => finishGesto(e, true)} onLostPointerCapture={(e) => finishGesto(e, true)}
      onClick={(e) => { if (suprimirClique.current && e.detail !== 0) { suprimirClique.current = false; return; } if (isOpen) closeValue(); else { setOpen(true); setPage("atalhos"); } }}
      onKeyDown={(e) => {
        const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (!delta) return;
        e.preventDefault(); const step = e.shiftKey ? 32 : 12;
        savePosition(limitPosition({ x: x.get() + delta[0] * step, y: y.get() + delta[1] * step }, screenValue));
      }}><span className="assistive-anel"><span /></span></motion.button>
    <AnimatePresence>
      {integrado && <motion.div className="assistive-capsula" style={{ left: menu.x, width: menu.largura }} initial={{ top: position.y, height: SIZE_BUTTON, opacity: 0.8 }} animate={{ top: startGaveta, height: heightGaveta, opacity: 1 }} exit={{ top: position.y, height: SIZE_BUTTON, opacity: 0 }} transition={withoutMovement ? { duration: 0.08 } : SPRING} />}
    </AnimatePresence>
    <AnimatePresence>
      {isOpen && <motion.section ref={panel} id="assistive-painel" className="assistive-painel" role="dialog" aria-label={C.titulo} data-pagina={page} data-direcao={menu.acima ? "cima" : "baixo"} style={{ left: menu.x, top: menu.y, width: menu.largura, maxHeight: menu.altura, transformOrigin: `50% ${menu.acima ? "100%" : "0%"}` }}
        initial={withoutMovement ? { opacity: 0 } : { opacity: 0, scaleY: 0.7, scaleX: 0.96, y: menu.acima ? 10 : -10 }} animate={{ opacity: 1, scaleY: 1, scaleX: 1, y: 0 }} exit={withoutMovement ? { opacity: 0 } : { opacity: 0, scaleY: 0.8, scaleX: 0.98, y: menu.acima ? 6 : -6 }} transition={withoutMovement ? { duration: 0.08 } : SPRING}>
        {page === "adicionar" && <header className="assistive-cabecalho"><button className="assistive-ferramenta" aria-label={C.voltar} onClick={() => setPage("atalhos")}><ArrowLeft size={16} /></button><b>{C.escolher}</b><button className="assistive-ferramenta" aria-label={C.fechar} onClick={closeValue}><X size={16} /></button></header>}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={page} initial={withoutMovement ? { opacity: 1 } : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: withoutMovement ? 0 : -5 }} transition={{ duration: withoutMovement ? 0 : 0.14 }}>
            {page === "adicionar" ? <SelectorApps aoAdicionar={add} /> : <>
              <div className="assistive-grade">
                <AnimatePresence initial={false}>
                  {cfg.apps.map((app) => <motion.div key={app.id} data-atalho-id={app.id} className={`assistive-celula${voo?.app.id === app.id ? " assistive-em-voo" : ""}`} layout={!withoutMovement} initial={withoutMovement ? false : { opacity: 0, scale: 0.75 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: withoutMovement ? 1 : 0.8 }} transition={withoutMovement ? { duration: 0 } : SPRING}>
                    <motion.button type="button" className="assistive-atalho" aria-label={C.abrirApp(app.nome)} title={app.nome} disabled={abrindo !== null}
                      onContextMenu={(e) => { e.preventDefault(); cancelPressao(); requestRemocao(app, e.currentTarget); }}
                      onPointerDown={(e) => {
                        if (e.button !== 0 || !e.isPrimary) return;
                        cancelPressao(); suprimirOpening.current = false;
                        if (e.pointerType === "mouse") return;
                        const target = e.currentTarget;
                        pressao.current = { x: e.clientX, y: e.clientY, temporizador: window.setTimeout(() => {
                          suprimirOpening.current = true; requestRemocao(app, target); pressao.current = null;
                        }, 450) };
                      }}
                      onPointerMove={(e) => { if (pressao.current && Math.hypot(e.clientX - pressao.current.x, e.clientY - pressao.current.y) > 8) cancelPressao(); }}
                      onPointerCancel={cancelPressao}
                      onKeyDown={(e) => { if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) { e.preventDefault(); requestRemocao(app, e.currentTarget); } }}
                      onClick={() => { if (suprimirOpening.current) { suprimirOpening.current = false; return; } setRemocao(null); void openApp(app); }} whileHover={withoutMovement ? undefined : { scale: 1.08 }} whileTap={withoutMovement ? undefined : { scale: 0.93 }}>
                      {abrindo === app.id ? <span className="assistive-icone-app"><LoaderCircle className="girando" size={19} /></span> : <IconApp app={app} icone={icons[app.id]} />}
                    </motion.button>
                  </motion.div>)}
                </AnimatePresence>
                <motion.button type="button" className="assistive-adicionar" aria-label={C.adicionar} title={C.adicionar} disabled={cfg.apps.length >= LIMIT_SHORTCUTS} onClick={() => setPage("adicionar")} whileTap={withoutMovement ? undefined : { scale: 0.94 }}><Plus size={20} strokeWidth={1.5} /></motion.button>
              </div>
            </>}
          </motion.div>
        </AnimatePresence>
      </motion.section>}
    </AnimatePresence>
    {notice && <div className={failureOnOpen ? "assistive-aviso" : "assistive-status"} role={failureOnOpen ? "alert" : "status"} style={failureOnOpen ? { right: 16, bottom: 24 } : undefined}>{notice}</div>}
    {voo && !withoutMovement && <motion.span key={voo.app.id} className="assistive-app-voando" aria-hidden="true" initial={{ x: voo.origem.x, y: voo.origem.y, opacity: 1, scale: 0.8 }} animate={voo.destino ? { x: [voo.origem.x, (voo.origem.x + voo.destino.x) / 2, voo.destino.x], y: [voo.origem.y, Math.min(voo.origem.y, voo.destino.y) - 28, voo.destino.y], scale: [0.8, 1.1, 1], rotate: [0, -6, 0] } : { x: voo.origem.x, y: voo.origem.y }} transition={{ duration: 0.48, ease: [0.22, 0.7, 0.3, 1], times: [0, 0.5, 1] }} onAnimationComplete={() => { if (voo.destino) setVoo(null); }}><IconApp app={voo.app} icone={voo.icone} /></motion.span>}
    {remocao && <div className="assistive-remover" role="menu" style={{ left: remocao.x, top: remocao.y }}>
      <button ref={removeButton} type="button" role="menuitem" onClick={() => {
        set({ apps: useConfig.getState().assistive.apps.filter((a) => a.id !== remocao.id) });
        setRemocao(null); setFailureOnOpen(false); setNotice(C.removido); button.current?.focus();
      }}><Trash2 size={15} />{C.removerAtalho}</button>
    </div>}
  </div>;
}

export function AssistiveTouch() {
  const active = useConfig((s) => s.assistive.ativo);
  useEffect(() => { if (!active && NATIVE) void reportAreaInteractive([]); }, [active]);
  return active ? <AssistiveActive /> : null;
}
