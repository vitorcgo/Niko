import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { LINUX, janelaAtual, NATIVO, usarAreaInterativa, usarCursorFora, usarAppsAbertos, agirNaJanela, alternarSistemaNativo, mostrarMiniaturas, ocultarBarraDoWindows, reservarEspacoDoDock, usarEstadoDaFrente, type AppAberto } from "../../desktop/desktop";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, type MotionValue } from "motion/react";
import { useConfig } from "../../estado/configuracoes";
import { useInterface } from "../../estado/interface";
import { useAgentes } from "../../estado/agentes";
import { LogoNiko } from "../../componentes/LogoNiko";
import { Marca } from "../../marcas/Marca";
import { T } from "../../textos/textos";
import { tocarSom, definirPreferenciasSom } from "../../ponte/sons";
import { ALTURA_DOCK, alguemCobre } from "../geometria";
import { ICONE_ROTA } from "../sistema/rotas";
import { COR_AGENTE } from "../../personagens/cores";
import { usarAparenciaDeBorda, variaveisDaBorda } from "../aparencia";
import "./dock.css";

interface PropsItemDock {
  mouseX: MotionValue<number>;
  ampliar: boolean;
  rotulo: string;
  estado?: "frente" | "aberto" | "minimizado";
  aoClicar: () => void;
  children: React.ReactNode;
  alerta?: string;
  semDica?: boolean;
  aoEntrar?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  aoSair?: () => void;
}

function ItemDock({ mouseX, ampliar, rotulo, estado, aoClicar, children, alerta, semDica, aoEntrar, aoSair }: PropsItemDock) {
  const ref = useRef<HTMLButtonElement>(null);
  const distancia = useTransform(mouseX, (x) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !Number.isFinite(x)) return 999;
    return x - (r.left + r.width / 2);
  });
  const tamanhoAlvo = useTransform(distancia, [-120, 0, 120], ampliar ? [42, 54, 42] : [42, 42, 42]);
  const tamanho = useSpring(tamanhoAlvo, { mass: 0.12, stiffness: 200, damping: 15 });
  return (
    <motion.button
      ref={ref}
      type="button"
      className="dock-item"
      data-estado={estado}
      style={{ width: tamanho, height: tamanho }}
      aria-label={rotulo}
      title={semDica ? undefined : rotulo}
      onClick={aoClicar}
      onPointerEnter={aoEntrar}
      onPointerLeave={aoSair}
      whileTap={{ scale: 0.9 }}
      layout
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.6 }}
    >
      {children}
      {estado && <span className="dock-ponto" aria-hidden="true" />}
      {alerta && <span className="dock-alerta" style={{ background: alerta }} aria-hidden="true" />}
    </motion.button>
  );
}

const LARGURA_CARTAO_PREVIA = 196;
const ESPACO_PREVIA = 8;

function usarMiniaturasDaPrevia(aberta: boolean, chave: string | null) {
  useEffect(() => {
    if (LINUX || !aberta) return;
    let anterior = "";
    const medir = () => {
      const itens = [...document.querySelectorAll<HTMLElement>(".dock-previa-miniatura")].map((el) => {
        const r = el.getBoundingClientRect();
        return { janela: el.dataset.janela ?? "", x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
      });
      const atual = JSON.stringify(itens);
      if (atual === anterior) return;
      anterior = atual;
      void mostrarMiniaturas(itens);
    };
    medir();
    const t = window.setInterval(medir, 150);
    return () => {
      window.clearInterval(t);
      void mostrarMiniaturas([]);
    };
  }, [aberta, chave]);
}

function MiniaturaLinux({ janela }: { janela: AppAberto }) {
  const [imagem, setImagem] = useState<string | null>(null);
  useEffect(() => {
    setImagem(null);
    if (janela.minimizada) return;
    const controller = new AbortController();
    let timer = 0;
    const ler = async () => {
      try {
        const resposta = await fetch("/ponte/janelas/miniatura", { method: "POST", headers: { "x-niko": "1", "content-type": "application/json" }, body: JSON.stringify({ janela: janela.id }), signal: controller.signal });
        const dados = resposta.ok ? await resposta.json() as { imagem?: string | null } : null;
        if (!controller.signal.aborted) setImagem(dados?.imagem ?? null);
      } catch { if (!controller.signal.aborted) setImagem(null); }
      if (!controller.signal.aborted) timer = window.setTimeout(ler, 500);
    };
    void ler();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [janela.id, janela.minimizada]);
  return imagem ? <img className="dock-previa-miniatura" src={imagem} alt={`Prévia de ${janela.titulo}`} draggable={false} style={{ objectFit: "contain" }} /> :
    <span className="dock-previa-miniatura" style={{ display: "grid", placeItems: "center", fontSize: 11 }}>Prévia indisponível</span>;
}

function PreviaJanelas({ lista, esquerda, aoEntrar, aoSair, aoFocar, aoFechar }: { lista: AppAberto[]; esquerda: number; aoEntrar: () => void; aoSair: () => void; aoFocar: (j: AppAberto) => void; aoFechar: (j: AppAberto) => void }) {
  return (
    <div className="dock-previa" style={{ left: esquerda }} onPointerEnter={aoEntrar} onPointerLeave={aoSair} onPointerMove={(e) => e.stopPropagation()}>
      <div className="dock-previa-lista">
      {lista.map((j) => (
        <div key={j.id} className="dock-previa-cartao" data-ativa={j.ativa || undefined} role="button" tabIndex={0} onClick={() => aoFocar(j)} onKeyDown={(e) => e.key === "Enter" && aoFocar(j)}>
          <div className="dock-previa-topo">
            {j.icone && <img src={j.icone} alt="" width={16} height={16} draggable={false} />}
            <span className="dock-previa-titulo">{j.titulo}</span>
            <button
              type="button"
              className="dock-previa-fechar"
              aria-label={T.dock.fecharJanela}
              title={T.dock.fecharJanela}
              onClick={(e) => {
                e.stopPropagation();
                aoFechar(j);
              }}
            >
              <X size={14} />
            </button>
          </div>
          {LINUX ? <MiniaturaLinux janela={j} /> : <div className="dock-previa-miniatura" data-janela={j.id} />}
        </div>
      ))}
      </div>
    </div>
  );
}

function AppsDoWindows({ mouseX, ampliar, ativo }: { mouseX: MotionValue<number>; ampliar: boolean; ativo: boolean }) {
  const [apps, atualizar] = usarAppsAbertos(ativo);
  const [previa, setPrevia] = useState<{ chave: string; centro: number; esquerdaDock: number } | null>(null);
  const relogioAbrir = useRef<number | undefined>(undefined);
  const relogioFechar = useRef<number | undefined>(undefined);
  const grupos = new Map<string, AppAberto[]>();
  for (const a of apps) {
    const chave = a.app === "ApplicationFrameHost" ? `uwp-${a.titulo}` : (a.caminho ?? a.app);
    grupos.set(chave, [...(grupos.get(chave) ?? []), a]);
  }
  const listaDaPrevia = previa && ativo ? grupos.get(previa.chave) : undefined;
  usarMiniaturasDaPrevia(Boolean(listaDaPrevia?.length), previa?.chave ?? null);

  useEffect(
    () => () => {
      window.clearTimeout(relogioAbrir.current);
      window.clearTimeout(relogioFechar.current);
    },
    [],
  );

  const cancelarFechamento = () => window.clearTimeout(relogioFechar.current);
  const agendarFechamento = () => {
    window.clearTimeout(relogioAbrir.current);
    window.clearTimeout(relogioFechar.current);
    relogioFechar.current = window.setTimeout(() => setPrevia(null), 250);
  };
  const fecharPrevia = () => {
    window.clearTimeout(relogioAbrir.current);
    window.clearTimeout(relogioFechar.current);
    setPrevia(null);
  };
  const entrarNoItem = (chave: string, e: React.PointerEvent<HTMLButtonElement>) => {
    cancelarFechamento();
    window.clearTimeout(relogioAbrir.current);
    const r = e.currentTarget.getBoundingClientRect();
    const dock = e.currentTarget.closest(".dock")?.getBoundingClientRect();
    const alvo = { chave, centro: r.left + r.width / 2, esquerdaDock: dock?.left ?? 0 };
    if (previa) setPrevia(alvo);
    else relogioAbrir.current = window.setTimeout(() => setPrevia(alvo), 350);
  };

  if (grupos.size === 0) return null;

  let esquerdaPrevia = 0;
  if (previa && listaDaPrevia) {
    const largura = listaDaPrevia.length * (LARGURA_CARTAO_PREVIA + ESPACO_PREVIA) + ESPACO_PREVIA;
    const esquerdaNaTela = Math.min(Math.max(previa.centro - largura / 2, 8), window.innerWidth - largura - 8);
    esquerdaPrevia = esquerdaNaTela - previa.esquerdaDock;
  }

  return (
    <>
      <span className="dock-separador" />
      {previa && listaDaPrevia && listaDaPrevia.length > 0 && (
        <PreviaJanelas
          lista={listaDaPrevia}
          esquerda={esquerdaPrevia}
          aoEntrar={cancelarFechamento}
          aoSair={agendarFechamento}
          aoFocar={(j) => {
            void tocarSom("blip");
            fecharPrevia();
            void agirNaJanela("focar", j.id).then(atualizar);
          }}
          aoFechar={(j) => {
            void tocarSom("blip");
            void agirNaJanela("fechar", j.id).then(() => window.setTimeout(atualizar, 400));
          }}
        />
      )}
      <AnimatePresence initial={false}>
        {[...grupos.entries()].map(([chave, lista]) => {
          const ativa = lista.find((j) => j.ativa);
          const principal = lista[0];
          const nome = principal.app === "ApplicationFrameHost" ? principal.titulo : principal.nome || principal.app;
          return (
            <ItemDock
              key={chave}
              mouseX={mouseX}
              ampliar={ampliar}
              rotulo={lista.length > 1 ? `${nome} (${lista.length})` : `${nome}: ${principal.titulo}`}
              estado={ativa ? "frente" : lista.every((j) => j.minimizada) ? "minimizado" : "aberto"}
              semDica
              aoEntrar={(e) => entrarNoItem(chave, e)}
              aoSair={agendarFechamento}
              aoClicar={() => {
                void tocarSom("blip");
                fecharPrevia();
                if (ativa && lista.length === 1) void agirNaJanela("minimizar", ativa.id).then(atualizar);
                else {
                  const proxima = ativa ? lista[(lista.indexOf(ativa) + 1) % lista.length] : principal;
                  void agirNaJanela("focar", proxima.id).then(atualizar);
                }
              }}
            >
              <span className="dock-icone">{principal.icone ? <img src={principal.icone} alt="" width={26} height={26} draggable={false} /> : nome.slice(0, 1).toUpperCase()}</span>
            </ItemDock>
          );
        })}
      </AnimatePresence>
    </>
  );
}

export function Dock() {
  const cfg = useConfig((s) => s.dock);
  const sons = useConfig((s) => s.sons);
  const silencioFoco = useConfig((s) => s.naoPerturbe);
  useEffect(() => { if (LINUX) definirPreferenciasSom({ ...sons, silencioFoco }); }, [sons, silencioFoco]);
  const aparencia = usarAparenciaDeBorda(cfg.fundo, cfg.opacidade);
  const nomesBarra = useConfig((s) => s.barraLateral);
  const aberto = useInterface((s) => s.sistemaAberto);
  const minimizado = useInterface((s) => s.sistemaMinimizado);
  const rota = useInterface((s) => s.rota);
  const zSistema = useInterface((s) => s.zSistema);
  const proximoZ = useInterface((s) => s.proximoZ);
  const janelas = useInterface((s) => s.janelasConexao);
  const definirSistema = useInterface((s) => s.definirSistema);
  const focar = useInterface((s) => s.focarSistema);
  const atualizarJanela = useInterface((s) => s.atualizarJanelaConexao);
  const focarConexao = useInterface((s) => s.focarConexao);
  useInterface((s) => s.geometria);
  useInterface((s) => s.sistemaMaximizado);
  const alerta = useAgentes((s) => s.alertas[0]);
  const mouseX = useMotionValue(Infinity);
  const [perto, setPerto] = useState(false);
  usarAreaInterativa([".dock", ".dock-gatilho", ".dock-previa"]);
  usarCursorFora(useCallback(() => setPerto(false), []));
  const caixa = useRef<HTMLDivElement>(null);

  const frente = usarEstadoDaFrente(cfg.ativo);

  useEffect(() => {
    if (NATIVO && !LINUX) void ocultarBarraDoWindows(cfg.ativo);
  }, [cfg.ativo]);

  useEffect(() => {
    if (NATIVO && (!LINUX || frente.geracao)) void reservarEspacoDoDock(cfg.ativo && cfg.modo === "fixo");
  }, [cfg.ativo, cfg.modo, frente.geracao]);

  useEffect(() => {
    if (LINUX && cfg.modo !== "fixo") setPerto(Boolean(frente.cursorNoDock));
  }, [cfg.modo, frente.cursorNoDock]);

  useEffect(() => {
    if (LINUX || cfg.modo === "fixo") return;
    const aoMover = (e: PointerEvent) => {
      const dentro = caixa.current?.contains(e.target as Node);
      const limite = window.innerHeight;
      setPerto((p) => (dentro ? true : p ? e.clientY > limite - ALTURA_DOCK - 24 : e.clientY > limite - 6));
    };
    window.addEventListener("pointermove", aoMover, { passive: true });
    return () => window.removeEventListener("pointermove", aoMover);
  }, [cfg.modo]);

  useEffect(() => {
    if (frente.telaCheia) setPerto(false);
  }, [frente.telaCheia]);

  useEffect(() => {
    if (!LINUX) return;
    let vivo = true;
    let fila = Promise.resolve();
    let agendado = false;
    let tamanhoAnterior = "";
    let proximaVerificacao = 0;
    const medir = () => {
      if (!vivo || agendado) return;
      agendado = true;
      fila = fila.then(async () => {
        agendado = false;
        if (!vivo) return;
        const janela = await janelaAtual();
        if (!cfg.ativo) { await janela.hide(); return; }
        const dock = caixa.current;
        if (!dock) return;
        // Janela justa ao conteúdo; não intercepta toda a borda da tela Wayland.
        const previa = dock.querySelector<HTMLElement>(".dock-previa");
        const largura = Math.max(60, Math.ceil(Math.max(dock.scrollWidth, previa?.scrollWidth ?? 0) + 32));
        const altura = Math.max(60, Math.ceil(dock.offsetHeight + (previa?.offsetHeight ?? 0) + 16));
        const tamanho = `${largura}/${altura}`;
        if (tamanho !== tamanhoAnterior) {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("dimensionar_dock", { largura, altura });
          tamanhoAnterior = tamanho;
        }
        if (Date.now() < proximaVerificacao) return;
        proximaVerificacao = Date.now() + 2000;
        // Medições frequentes só precisam do estado leve, não da lista com ícones.
        const resposta = await fetch("/ponte/janelas/estado", { headers: { "x-niko": "1" } });
        if (!vivo) return;
        const visivel = await janela.isVisible();
        if (!vivo) return;
        if (resposta.ok && !visivel) await janela.show();
        else if (!resposta.ok && visivel) await janela.hide();
      }).catch((erro) => console.error("Falha ao preparar dock Linux", erro));
    };
    medir();
    const observer = new ResizeObserver(medir);
    const children = new MutationObserver(medir);
    if (caixa.current) children.observe(caixa.current, { childList: true, subtree: true });
    if (caixa.current) observer.observe(caixa.current);
    const timer = window.setInterval(medir, 2000);
    return () => { vivo = false; observer.disconnect(); children.disconnect(); window.clearInterval(timer); };
  }, [cfg.ativo]);

  if (!cfg.ativo || frente.telaCheia) return null;

  const largura = 90 + (janelas.length + (aberto ? 1 : 0)) * 50;
  const area = { x: (window.innerWidth - largura) / 2, y: window.innerHeight - ALTURA_DOCK, w: largura, h: ALTURA_DOCK };
  const coberto = cfg.modo === "inteligente" && (NATIVO ? frente.cobre : alguemCobre(area));
  const escondido = (cfg.modo === "esconder" || coberto) && !perto;
  const sistemaNaFrente = aberto && !minimizado && zSistema === proximoZ - 1;
  const fundo = aparencia.fundo;
  const IconeAba = ICONE_ROTA[rota];
  const nomeAba = nomesBarra.find((b) => b.rota === rota)?.nome || T.rotas[rota];

  const alternarSistema = () => {
    void tocarSom("open");
    if (!aberto || minimizado) {
      definirSistema({ sistemaAberto: true, sistemaMinimizado: false });
      focar();
      return;
    }
    if (sistemaNaFrente) {
      definirSistema({ sistemaMinimizado: true });
      return;
    }
    focar();
  };

  const abrirNiko = () => {
    if (NATIVO) {
      void tocarSom("open");
      void alternarSistemaNativo();
      return;
    }
    if (aberto) {
      void tocarSom("blip");
      if (minimizado) definirSistema({ sistemaMinimizado: false });
      focar();
      return;
    }
    alternarSistema();
  };

  return (
    <>
      {escondido && <div className="dock-gatilho" onPointerEnter={() => setPerto(true)} />}
      <motion.div
        ref={caixa}
        className="dock"
        data-fundo-claro={aparencia.claro || undefined}
        style={{ ...variaveisDaBorda(aparencia), height: ALTURA_DOCK, background: fundo }}
        initial={false}
        animate={{ y: escondido ? ALTURA_DOCK + 8 : 0 }}
        transition={{ type: "spring", visualDuration: 0.35, bounce: 0.15 }}
        onPointerMove={(e) => mouseX.set(e.clientX)}
        onPointerLeave={() => {
          mouseX.set(Infinity);
          if (cfg.modo !== "fixo") window.setTimeout(() => !caixa.current?.matches(":hover") && setPerto(false), 500);
        }}
      >
        <span className="dock-orelha dock-orelha-esquerda" style={{ ["--fundo-dock" as string]: fundo }} aria-hidden="true" />
        <span className="dock-orelha dock-orelha-direita" style={{ ["--fundo-dock" as string]: fundo }} aria-hidden="true" />
        <ItemDock mouseX={mouseX} ampliar={cfg.ampliar} rotulo={T.dock.abrir} aoClicar={abrirNiko} alerta={alerta ? COR_AGENTE[alerta.agenteId] : undefined}>
          <span className="dock-logo"><LogoNiko tamanho={28} /></span>
        </ItemDock>
        {NATIVO ? (
          <AppsDoWindows mouseX={mouseX} ampliar={cfg.ampliar} ativo={!escondido} />
        ) : (
        <>
        {(aberto || janelas.length > 0) && <span className="dock-separador" />}
        <AnimatePresence initial={false}>
          {aberto && (
            <ItemDock key="sistema" mouseX={mouseX} ampliar={cfg.ampliar} rotulo={`${T.app.nome}: ${nomeAba}`} estado={minimizado ? "minimizado" : sistemaNaFrente ? "frente" : "aberto"} aoClicar={alternarSistema}>
              <span className="dock-icone"><IconeAba size={19} /></span>
            </ItemDock>
          )}
          {janelas.map((j) => (
            <ItemDock
              key={j.id}
              mouseX={mouseX}
              ampliar={cfg.ampliar}
              rotulo={T.conexoes.servicos[j.id].nome}
              estado={j.minimizada ? "minimizado" : "aberto"}
              aoClicar={() => {
                void tocarSom("blip");
                if (j.minimizada) {
                  atualizarJanela(j.id, { minimizada: false });
                  focarConexao(j.id);
                } else focarConexao(j.id);
              }}
            >
              <span className="dock-icone"><Marca marca={j.id} tamanho={19} /></span>
            </ItemDock>
          ))}
        </AnimatePresence>
        </>
        )}
      </motion.div>
    </>
  );
}
