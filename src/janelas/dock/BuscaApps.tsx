import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  Activity, AppWindow, Bluetooth, Calculator, CircleDot, CornerDownLeft, FolderOpen, Globe, Monitor, Network, RefreshCw, Search, Settings, SlidersHorizontal, SquareTerminal, Volume2, Wifi, type LucideIcon,
} from "lucide-react";
import { NATIVO, abrirLink, agirNaJanela, devolverFoco, janelaAtual, usarAppsAbertos } from "../../desktop/desktop";
import { NO_LINUX } from "../../desktop/plataforma";
import { controle, type AppInstalado, type ComandoDoSistema } from "../../ponte/ponteLocal";
import { useBuscaApps } from "../../estado/buscaApps";
import { useConfig } from "../../estado/configuracoes";
import { bonusDeUso, calcular, enderecoDePesquisa, enderecoWeb, formatarNumero, numeroParaCopiar, pontuarNome } from "../../utilitarios/buscaApps";
import { tocarSom } from "../../ponte/sons";
import { T } from "../../textos/textos";

const B = T.dock.busca;
const LIMITE_APPS = 8;
const LIMITE_JANELAS = 3;
const LIMITE_COMANDOS = 4;
const LIMITE_RECENTES = 6;
const LOTE_DE_ICONES = 12;
const COMANDOS_INICIAIS: ComandoDoSistema[] = ["wifi", "bluetooth", "som", "configuracoes"];
const COMANDOS = Object.keys(B.comandos) as ComandoDoSistema[];
const ICONE_DO_COMANDO: Record<ComandoDoSistema, LucideIcon> = {
  rede: Network,
  wifi: Wifi,
  bluetooth: Bluetooth,
  som: Volume2,
  tela: Monitor,
  configuracoes: Settings,
  atualizacoes: RefreshCw,
  tarefas: Activity,
  adaptadores: Network,
  terminal: SquareTerminal,
  arquivos: FolderOpen,
  painel: SlidersHorizontal,
};
const GRUPOS_EM_BLOCOS = new Set<Grupo>(["recentes", "sistema"]);

type Grupo = keyof typeof B.grupos;
type Tipo = "app" | "janela" | "comando" | "calculo" | "web" | "acao";

interface Item {
  chave: string;
  grupo: Grupo;
  tipo: Tipo;
  titulo: string;
  detalhe?: string;
  icone?: string | null;
  appId?: string;
  comando?: ComandoDoSistema;
  admin?: boolean;
  executar: (admin: boolean) => Promise<void> | void;
}

const ORDEM: Grupo[] = ["calculo", "recentes", "apps", "janelas", "sistema", "web"];

let appsEmMemoria: AppInstalado[] | null = null;
const iconesEmMemoria: Record<string, string | null> = {};

function IconeDoItem({ item, tamanho = 22 }: { item: Item; tamanho?: number }) {
  if (item.icone) return <img src={item.icone} alt="" width={tamanho} height={tamanho} draggable={false} />;
  const traco = Math.round(tamanho * 0.78);
  if (item.chave === "assistive") return <CircleDot size={traco} />;
  if (item.tipo === "calculo") return <Calculator size={traco} />;
  if (item.tipo === "web") return <Globe size={traco} />;
  if (item.comando) {
    const Icone = ICONE_DO_COMANDO[item.comando];
    return <Icone size={traco} />;
  }
  if (item.tipo === "janela") return <AppWindow size={traco} />;
  return <span className="dock-busca-letra">{item.titulo.trim()[0]?.toUpperCase() ?? "?"}</span>;
}

function Tecla({ children }: { children: React.ReactNode }) {
  return <kbd className="dock-busca-tecla">{children}</kbd>;
}

export function BuscaApps({ aoFechar }: { aoFechar: () => void }) {
  const [consulta, setConsulta] = useState("");
  const [apps, setApps] = useState<AppInstalado[] | null>(appsEmMemoria);
  const [erro, setErro] = useState(!NATIVO);
  const [icones, setIcones] = useState<Record<string, string | null>>(iconesEmMemoria);
  const [ativo, setAtivo] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const [janelas] = usarAppsAbertos(true);
  const usos = useBuscaApps((s) => s.usos);
  const usar = useBuscaApps((s) => s.usar);
  const buscador = useConfig((s) => s.dock.buscador);
  const assistiveAtivo = useConfig((s) => s.assistive.ativo);
  const reduzirAnimacoes = useConfig((s) => s.reduzirAnimacoes);
  const reduzido = (useReducedMotion() ?? false) || reduzirAnimacoes;
  const campo = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const pedidosDeIcone = useRef(new Set<string>(Object.keys(iconesEmMemoria)));

  useEffect(() => {
    campo.current?.focus();
    if (!NATIVO) return;
    void janelaAtual()
      .then((j) => j.setFocus())
      .then(() => campo.current?.focus())
      .catch(() => undefined);
    let vivo = true;
    controle
      .apps()
      .then((lidos) => {
        appsEmMemoria = lidos;
        if (vivo) setApps(lidos);
      })
      .catch(() => vivo && !appsEmMemoria && setErro(true));
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    let relogio = 0;
    const aoPerderFoco = () => {
      relogio = window.setTimeout(() => !document.hasFocus() && aoFechar(), 180);
    };
    const aoVoltar = () => window.clearTimeout(relogio);
    window.addEventListener("blur", aoPerderFoco);
    window.addEventListener("focus", aoVoltar);
    return () => {
      window.clearTimeout(relogio);
      window.removeEventListener("blur", aoPerderFoco);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [aoFechar]);

  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(null), 2600);
    return () => window.clearTimeout(t);
  }, [aviso]);

  const itens = useMemo<Item[]>(() => {
    const q = consulta.trim();
    const saida: Item[] = [];
    if (!q || pontuarNome(q, T.assistive.palavrasBusca) > 0) saida.push({
      chave: "assistive", grupo: "sistema", tipo: "acao", titulo: T.assistive.titulo,
      detalhe: assistiveAtivo ? T.assistive.ligadoNaLupa : T.assistive.desligadoNaLupa,
      executar: () => {
        const s = useConfig.getState();
        s.definirAssistive({ ativo: !s.assistive.ativo });
        aoFechar();
      },
    });
    const abrirDepois = (acao: () => Promise<unknown>, falha: string) => async () => {
      void tocarSom("blip");
      try {
        await acao();
        aoFechar();
      } catch {
        setAviso(falha);
      }
    };
    const doApp = (app: AppInstalado, grupo: Grupo): Item => ({
      chave: `app:${app.id}`,
      grupo,
      tipo: "app",
      titulo: app.nome,
      icone: icones[app.id],
      appId: app.id,
      admin: app.admin,
      executar: async (admin) => {
        usar(app.id);
        await abrirDepois(() => controle.abrirApp(app.id, admin && app.admin), admin && app.admin ? B.semAdmin(app.nome) : B.falhouAbrir(app.nome))();
      },
    });
    const doComando = (c: ComandoDoSistema): Item => ({
      chave: `cmd:${c}`,
      grupo: "sistema",
      tipo: "comando",
      comando: c,
      titulo: B.comandos[c],
      executar: abrirDepois(() => controle.comandoDoSistema(c), B.falhouAbrir(B.comandos[c])),
    });

    if (!q) {
      const recentes = (apps ?? [])
        .filter((a) => usos[a.id])
        .sort((a, b) => usos[b.id].ultimo - usos[a.id].ultimo)
        .slice(0, LIMITE_RECENTES);
      for (const a of recentes) saida.push(doApp(a, "recentes"));
      for (const c of COMANDOS_INICIAIS) saida.push(doComando(c));
      return saida.sort((x, y) => ORDEM.indexOf(x.grupo) - ORDEM.indexOf(y.grupo));
    }

    const conta = calcular(q);
    if (conta !== null) {
      saida.push({
        chave: "calculo",
        grupo: "calculo",
        tipo: "calculo",
        titulo: `= ${formatarNumero(conta)}`,
        detalhe: `${q} · ${B.copiar}`,
        executar: async () => {
          void tocarSom("blip");
          try {
            await navigator.clipboard.writeText(numeroParaCopiar(conta));
            setAviso(B.copiado);
          } catch {
            setAviso(null);
          }
        },
      });
    }

    const agora = Date.now();
    const pontuados = (apps ?? [])
      .map((a) => ({ a, nota: pontuarNome(q, a.nome) }))
      .filter((x) => x.nota > 0)
      .map((x) => ({ ...x, nota: x.nota + bonusDeUso(usos[x.a.id], agora) }))
      .sort((x, y) => y.nota - x.nota || x.a.nome.localeCompare(y.a.nome))
      .slice(0, LIMITE_APPS);
    for (const { a } of pontuados) saida.push(doApp(a, "apps"));

    const abertas = janelas
      .map((j) => ({ j, nota: Math.max(pontuarNome(q, j.titulo), pontuarNome(q, j.nome || j.app)) }))
      .filter((x) => x.nota > 0)
      .sort((x, y) => y.nota - x.nota)
      .slice(0, LIMITE_JANELAS);
    for (const { j } of abertas) {
      saida.push({
        chave: `janela:${j.id}`,
        grupo: "janelas",
        tipo: "janela",
        titulo: j.titulo || j.nome || j.app,
        detalhe: j.nome || j.app,
        icone: j.icone,
        executar: abrirDepois(() => agirNaJanela("focar", j.id), B.falhouAbrir(j.titulo || j.nome || j.app)),
      });
    }

    const comandos = COMANDOS.map((c) => ({ c, nota: Math.max(pontuarNome(q, B.comandos[c]), pontuarNome(q, B.palavras[c])) }))
      .filter((x) => x.nota > 0)
      .sort((x, y) => y.nota - x.nota)
      .slice(0, LIMITE_COMANDOS);
    for (const { c } of comandos) saida.push(doComando(c));

    const endereco = enderecoWeb(q);
    saida.push({
      chave: "web",
      grupo: "web",
      tipo: "web",
      titulo: endereco ? B.abrirEndereco(q) : B.pesquisar(q, T.ilha.barra.personalizacao.buscadores[buscador] ?? buscador),
      executar: () => {
        void tocarSom("blip");
        abrirLink(endereco ?? enderecoDePesquisa(q, buscador));
        aoFechar();
      },
    });
    return saida.sort((x, y) => ORDEM.indexOf(x.grupo) - ORDEM.indexOf(y.grupo));
  }, [consulta, apps, janelas, usos, icones, buscador, assistiveAtivo, usar, aoFechar]);

  useEffect(() => setAtivo(0), [consulta]);

  useEffect(() => {
    const faltando = itens
      .map((i) => i.appId)
      .filter((id): id is string => Boolean(id) && !pedidosDeIcone.current.has(id as string))
      .slice(0, LOTE_DE_ICONES);
    if (!NATIVO || faltando.length === 0) return;
    const t = window.setTimeout(() => {
      for (const id of faltando) pedidosDeIcone.current.add(id);
      controle
        .iconesDeApps(faltando)
        .then((lidos) => {
          for (const id of faltando) iconesEmMemoria[id] = null;
          for (const l of lidos) iconesEmMemoria[l.id] = l.icone;
          setIcones({ ...iconesEmMemoria });
        })
        .catch(() => {
          for (const id of faltando) pedidosDeIcone.current.delete(id);
        });
    }, 120);
    return () => window.clearTimeout(t);
  }, [itens]);

  useEffect(() => {
    lista.current?.querySelector<HTMLElement>("[data-ativo]")?.scrollIntoView({ block: "nearest" });
  }, [ativo, itens]);

  const executar = (item: Item | undefined, comoAdmin: boolean) => {
    if (item) void item.executar(comoAdmin && Boolean(item.admin));
  };

  const vazia = consulta.trim() === "";
  const aoTeclar = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      void devolverFoco();
      aoFechar();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp" || (vazia && (e.key === "ArrowLeft" || e.key === "ArrowRight"))) {
      e.preventDefault();
      const passo = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
      setAtivo((a) => (itens.length ? (a + passo + itens.length) % itens.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      executar(itens[ativo], e.ctrlKey && e.shiftKey);
    }
  };

  const grupos = ORDEM.map((g) => ({ grupo: g, itens: itens.filter((i) => i.grupo === g) })).filter((g) => g.itens.length > 0);
  const carregando = apps === null && !erro;
  const semApps = !carregando && !erro && !vazia && !itens.some((i) => i.tipo === "app");
  let indice = -1;

  const opcao = (item: Item, emBloco: boolean) => {
    indice++;
    const meu = indice;
    const selecionado = meu === ativo;
    const comum = {
      type: "button" as const,
      role: "option",
      "aria-selected": selecionado,
      "data-ativo": selecionado || undefined,
      onPointerMove: () => setAtivo(meu),
      onClick: (e: React.MouseEvent) => executar(item, e.ctrlKey && e.shiftKey),
    };
    if (emBloco) {
      return (
        <button key={item.chave} {...comum} className="dock-busca-bloco" data-assistive={item.chave === "assistive" || undefined} data-ligado={item.chave === "assistive" && assistiveAtivo || undefined} title={item.chave === "assistive" ? `${item.titulo}: ${item.detalhe}` : item.titulo} aria-label={item.chave === "assistive" ? (assistiveAtivo ? T.assistive.desativarNaLupa : T.assistive.ativarNaLupa) : undefined}>
          <span className="dock-busca-icone dock-busca-icone-grande">
            <IconeDoItem item={item} tamanho={28} />
          </span>
          <span className="dock-busca-bloco-nome">{item.titulo}</span>
        </button>
      );
    }
    if (item.tipo === "calculo") {
      return (
        <button key={item.chave} {...comum} className="dock-busca-item dock-busca-conta">
          <span className="dock-busca-conta-valor numero">{item.titulo}</span>
          <span className="dock-busca-detalhe">{item.detalhe}</span>
        </button>
      );
    }
    return (
      <button key={item.chave} {...comum} className="dock-busca-item">
        <span className="dock-busca-icone">
          <IconeDoItem item={item} />
        </span>
        <span className="dock-busca-texto">
          <span className="dock-busca-nome">{item.titulo}</span>
          {item.detalhe && <span className="dock-busca-detalhe">{item.detalhe}</span>}
        </span>
        {selecionado && (
          <span className="dock-busca-acao">
            {item.admin && <span className="dock-busca-dica-admin">{B.comoAdmin}</span>}
            <Tecla>
              <CornerDownLeft size={11} />
            </Tecla>
          </span>
        )}
      </button>
    );
  };

  return (
    <motion.div
      className="dock-busca"
      role="dialog"
      aria-label={B.botao}
      onPointerMove={(e) => e.stopPropagation()}
      initial={reduzido ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reduzido ? { duration: 0.12 } : { type: "spring", visualDuration: 0.26, bounce: 0.18 }}
    >
      <div className="dock-busca-campo">
        <Search size={18} aria-hidden="true" className="dock-busca-lupa" />
        <input
          ref={campo}
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          onKeyDown={aoTeclar}
          placeholder={B.campo}
          aria-label={B.campo}
          spellCheck={false}
          autoComplete="off"
        />
        <Tecla>Esc</Tecla>
      </div>
      <div className="dock-busca-lista" ref={lista} role="listbox" aria-label={B.campo}>
        {grupos.map((g) => {
          const emBlocos = vazia && GRUPOS_EM_BLOCOS.has(g.grupo);
          return (
            <div key={g.grupo} className="dock-busca-grupo" role="group" aria-label={B.grupos[g.grupo]}>
              <div className="dock-busca-titulo">{B.grupos[g.grupo]}</div>
              <div className={emBlocos ? "dock-busca-blocos" : "dock-busca-linhas"}>{g.itens.map((item) => opcao(item, emBlocos))}</div>
            </div>
          );
        })}
        {carregando && <p className="dock-busca-vazio">{B.lendo}</p>}
        {erro && <p className="dock-busca-vazio">{NATIVO ? B.falhou : B.soNoWindows}</p>}
        {semApps && <p className="dock-busca-vazio">{B.nada}</p>}
      </div>
      <div className="dock-busca-rodape" aria-live="polite">
        {aviso ? (
          <span className="dock-busca-aviso">{aviso}</span>
        ) : (
          <>
            <span><Tecla>↑</Tecla><Tecla>↓</Tecla> {B.atalhos.navegar}</span>
            <span><Tecla><CornerDownLeft size={11} /></Tecla> {B.atalhos.abrir}</span>
            {!NO_LINUX && <span><Tecla>Ctrl</Tecla><Tecla>Shift</Tecla><Tecla><CornerDownLeft size={11} /></Tecla> {B.atalhos.admin}</span>}
          </>
        )}
      </div>
    </motion.div>
  );
}
