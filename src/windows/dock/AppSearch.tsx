import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  Activity, AppWindow, Bluetooth, Calculator, CircleDot, CornerDownLeft, FolderOpen, Globe, Monitor, Network, RefreshCw, Search, Settings, SlidersHorizontal, SquareTerminal, Volume2, Wifi, type LucideIcon,
} from "lucide-react";
import { NATIVE, openLink, actWindow, returnFocus, windowCurrent, useAppsOpen } from "../../desktop/desktop";
import { control, type AppInstalled, type CommandSystem } from "../../bridge/localBridge";
import { useAppSearch } from "../../state/appSearch";
import { useConfig } from "../../state/settings";
import { bonusUsage, calculate, addressSearch, addressWeb, formatNumber, numberToCopy, scoreName } from "../../utils/appSearch";
import { playSound } from "../../bridge/sounds";
import { T } from "../../i18n/ptBR";

const B = T.dock.busca;
const LIMIT_APPS = 8;
const LIMIT_WINDOWS = 3;
const LIMIT_COMMANDS = 4;
const LIMIT_RECENT = 6;
const LOTE_ICONS = 12;
const COMMANDS_INITIAL: CommandSystem[] = ["wifi", "bluetooth", "som", "configuracoes"];
const COMMANDS = Object.keys(B.comandos) as CommandSystem[];
const ICON_COMMAND: Record<CommandSystem, LucideIcon> = {
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
const GROUPS_AT_BLOCKS = new Set<Group>(["recentes", "sistema"]);

type Group = keyof typeof B.grupos;
type Type = "app" | "janela" | "comando" | "calculo" | "web" | "acao";

interface Item {
  chave: string;
  grupo: Group;
  tipo: Type;
  titulo: string;
  detalhe?: string;
  icone?: string | null;
  appId?: string;
  comando?: CommandSystem;
  admin?: boolean;
  executar: (admin: boolean) => Promise<void> | void;
}

const ORDER: Group[] = ["calculo", "recentes", "apps", "janelas", "sistema", "web"];

let appsAtMemory: AppInstalled[] | null = null;
const iconsAtMemory: Record<string, string | null> = {};

function IconItem({ item, tamanho: size = 22 }: { item: Item; tamanho?: number }) {
  if (item.icone) return <img src={item.icone} alt="" width={size} height={size} draggable={false} />;
  const traco = Math.round(size * 0.78);
  if (item.chave === "assistive") return <CircleDot size={traco} />;
  if (item.tipo === "calculo") return <Calculator size={traco} />;
  if (item.tipo === "web") return <Globe size={traco} />;
  if (item.comando) {
    const Icon = ICON_COMMAND[item.comando];
    return <Icon size={traco} />;
  }
  if (item.tipo === "janela") return <AppWindow size={traco} />;
  return <span className="dock-busca-letra">{item.titulo.trim()[0]?.toUpperCase() ?? "?"}</span>;
}

function Key({ children }: { children: React.ReactNode }) {
  return <kbd className="dock-busca-tecla">{children}</kbd>;
}

export function AppSearch({ aoFechar: onClose }: { aoFechar: () => void }) {
  const [query, setQuery] = useState("");
  const [apps, setApps] = useState<AppInstalled[] | null>(appsAtMemory);
  const [error, setError] = useState(!NATIVE);
  const [icons, setIcons] = useState<Record<string, string | null>>(iconsAtMemory);
  const [active, setActive] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [windows] = useAppsOpen(true);
  const usage = useAppSearch((s) => s.usos);
  const use = useAppSearch((s) => s.use);
  const searchEngine = useConfig((s) => s.dock.buscador);
  const assistiveActive = useConfig((s) => s.assistive.ativo);
  const reduceAnimacoes = useConfig((s) => s.reduzirAnimacoes);
  const reduced = (useReducedMotion() ?? false) || reduceAnimacoes;
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const requestsIcon = useRef(new Set<string>(Object.keys(iconsAtMemory)));

  useEffect(() => {
    field.current?.focus();
    if (!NATIVE) return;
    void windowCurrent()
      .then((j) => j.setFocus())
      .then(() => field.current?.focus())
      .catch(() => undefined);
    let alive = true;
    control
      .apps()
      .then((lidos) => {
        appsAtMemory = lidos;
        if (alive) setApps(lidos);
      })
      .catch(() => alive && !appsAtMemory && setError(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let clock = 0;
    const onPerderFocus = () => {
      clock = window.setTimeout(() => !document.hasFocus() && onClose(), 180);
    };
    const onBack = () => window.clearTimeout(clock);
    window.addEventListener("blur", onPerderFocus);
    window.addEventListener("focus", onBack);
    return () => {
      window.clearTimeout(clock);
      window.removeEventListener("blur", onPerderFocus);
      window.removeEventListener("focus", onBack);
    };
  }, [onClose]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 2600);
    return () => window.clearTimeout(t);
  }, [notice]);

  const items = useMemo<Item[]>(() => {
    const q = query.trim();
    const output: Item[] = [];
    if (!q || scoreName(q, T.assistive.palavrasBusca) > 0) output.push({
      chave: "assistive", grupo: "sistema", tipo: "acao", titulo: T.assistive.titulo,
      detalhe: assistiveActive ? T.assistive.ligadoNaLupa : T.assistive.desligadoNaLupa,
      executar: () => {
        const s = useConfig.getState();
        s.setAssistive({ ativo: !s.assistive.ativo });
        onClose();
      },
    });
    const openAfter = (action: () => Promise<unknown>, failure: string) => async () => {
      void playSound("blip");
      try {
        await action();
        onClose();
      } catch {
        setNotice(failure);
      }
    };
    const fromApp = (app: AppInstalled, group: Group): Item => ({
      chave: `app:${app.id}`,
      grupo: group,
      tipo: "app",
      titulo: app.nome,
      icone: icons[app.id],
      appId: app.id,
      admin: app.admin,
      executar: async (admin) => {
        use(app.id);
        await openAfter(() => control.abrirApp(app.id, admin && app.admin), admin && app.admin ? B.semAdmin(app.nome) : B.falhouAbrir(app.nome))();
      },
    });
    const fromCommand = (c: CommandSystem): Item => ({
      chave: `cmd:${c}`,
      grupo: "sistema",
      tipo: "comando",
      comando: c,
      titulo: B.comandos[c],
      executar: openAfter(() => control.comandoDoSistema(c), B.falhouAbrir(B.comandos[c])),
    });

    if (!q) {
      const recentItems = (apps ?? [])
        .filter((a) => usage[a.id])
        .sort((a, b) => usage[b.id].ultimo - usage[a.id].ultimo)
        .slice(0, LIMIT_RECENT);
      for (const a of recentItems) output.push(fromApp(a, "recentes"));
      for (const c of COMMANDS_INITIAL) output.push(fromCommand(c));
      return output.sort((x, y) => ORDER.indexOf(x.grupo) - ORDER.indexOf(y.grupo));
    }

    const account = calculate(q);
    if (account !== null) {
      output.push({
        chave: "calculo",
        grupo: "calculo",
        tipo: "calculo",
        titulo: `= ${formatNumber(account)}`,
        detalhe: `${q} · ${B.copiar}`,
        executar: async () => {
          void playSound("blip");
          try {
            await navigator.clipboard.writeText(numberToCopy(account));
            setNotice(B.copiado);
          } catch {
            setNotice(null);
          }
        },
      });
    }

    const now = Date.now();
    const pontuados = (apps ?? [])
      .map((a) => ({ a, nota: scoreName(q, a.nome) }))
      .filter((x) => x.nota > 0)
      .map((x) => ({ ...x, nota: x.nota + bonusUsage(usage[x.a.id], now) }))
      .sort((x, y) => y.nota - x.nota || x.a.nome.localeCompare(y.a.nome))
      .slice(0, LIMIT_APPS);
    for (const { a } of pontuados) output.push(fromApp(a, "apps"));

    const openItems = windows
      .map((j) => ({ j, nota: Math.max(scoreName(q, j.titulo), scoreName(q, j.nome || j.app)) }))
      .filter((x) => x.nota > 0)
      .sort((x, y) => y.nota - x.nota)
      .slice(0, LIMIT_WINDOWS);
    for (const { j } of openItems) {
      output.push({
        chave: `janela:${j.id}`,
        grupo: "janelas",
        tipo: "janela",
        titulo: j.titulo || j.nome || j.app,
        detalhe: j.nome || j.app,
        icone: j.icone,
        executar: openAfter(() => actWindow("focar", j.id), B.falhouAbrir(j.titulo || j.nome || j.app)),
      });
    }

    const commands = COMMANDS.map((c) => ({ c, nota: Math.max(scoreName(q, B.comandos[c]), scoreName(q, B.palavras[c])) }))
      .filter((x) => x.nota > 0)
      .sort((x, y) => y.nota - x.nota)
      .slice(0, LIMIT_COMMANDS);
    for (const { c } of commands) output.push(fromCommand(c));

    const address = addressWeb(q);
    output.push({
      chave: "web",
      grupo: "web",
      tipo: "web",
      titulo: address ? B.abrirEndereco(q) : B.pesquisar(q, T.ilha.barra.personalizacao.buscadores[searchEngine] ?? searchEngine),
      executar: () => {
        void playSound("blip");
        openLink(address ?? addressSearch(q, searchEngine));
        onClose();
      },
    });
    return output.sort((x, y) => ORDER.indexOf(x.grupo) - ORDER.indexOf(y.grupo));
  }, [query, apps, windows, usage, icons, searchEngine, assistiveActive, use, onClose]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    const missing = items
      .map((i) => i.appId)
      .filter((id): id is string => Boolean(id) && !requestsIcon.current.has(id as string))
      .slice(0, LOTE_ICONS);
    if (!NATIVE || missing.length === 0) return;
    const t = window.setTimeout(() => {
      for (const id of missing) requestsIcon.current.add(id);
      control
        .iconesDeApps(missing)
        .then((lidos) => {
          for (const id of missing) iconsAtMemory[id] = null;
          for (const l of lidos) iconsAtMemory[l.id] = l.icone;
          setIcons({ ...iconsAtMemory });
        })
        .catch(() => {
          for (const id of missing) requestsIcon.current.delete(id);
        });
    }, 120);
    return () => window.clearTimeout(t);
  }, [items]);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>("[data-ativo]")?.scrollIntoView({ block: "nearest" });
  }, [active, items]);

  const execute = (item: Item | undefined, asAdmin: boolean) => {
    if (item) void item.executar(asAdmin && Boolean(item.admin));
  };

  const empty = query.trim() === "";
  const onPress = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      void returnFocus();
      onClose();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp" || (empty && (e.key === "ArrowLeft" || e.key === "ArrowRight"))) {
      e.preventDefault();
      const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
      setActive((a) => (items.length ? (a + step + items.length) % items.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      execute(items[active], e.ctrlKey && e.shiftKey);
    }
  };

  const groups = ORDER.map((g) => ({ grupo: g, itens: items.filter((i) => i.grupo === g) })).filter((g) => g.itens.length > 0);
  const loading = apps === null && !error;
  const withoutApps = !loading && !error && !empty && !items.some((i) => i.tipo === "app");
  let index = -1;

  const opcao = (item: Item, atBlock: boolean) => {
    index++;
    const mine = index;
    const selected = mine === active;
    const comum = {
      type: "button" as const,
      role: "option",
      "aria-selected": selected,
      "data-ativo": selected || undefined,
      onPointerMove: () => setActive(mine),
      onClick: (e: React.MouseEvent) => execute(item, e.ctrlKey && e.shiftKey),
    };
    if (atBlock) {
      return (
        <button key={item.chave} {...comum} className="dock-busca-bloco" data-assistive={item.chave === "assistive" || undefined} data-ligado={item.chave === "assistive" && assistiveActive || undefined} title={item.chave === "assistive" ? `${item.titulo}: ${item.detalhe}` : item.titulo} aria-label={item.chave === "assistive" ? (assistiveActive ? T.assistive.desativarNaLupa : T.assistive.ativarNaLupa) : undefined}>
          <span className="dock-busca-icone dock-busca-icone-grande">
            <IconItem item={item} tamanho={28} />
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
          <IconItem item={item} />
        </span>
        <span className="dock-busca-texto">
          <span className="dock-busca-nome">{item.titulo}</span>
          {item.detalhe && <span className="dock-busca-detalhe">{item.detalhe}</span>}
        </span>
        {selected && (
          <span className="dock-busca-acao">
            {item.admin && <span className="dock-busca-dica-admin">{B.comoAdmin}</span>}
            <Key>
              <CornerDownLeft size={11} />
            </Key>
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
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reduced ? { duration: 0.12 } : { type: "spring", visualDuration: 0.26, bounce: 0.18 }}
    >
      <div className="dock-busca-campo">
        <Search size={18} aria-hidden="true" className="dock-busca-lupa" />
        <input
          ref={field}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onPress}
          placeholder={B.campo}
          aria-label={B.campo}
          spellCheck={false}
          autoComplete="off"
        />
        <Key>Esc</Key>
      </div>
      <div className="dock-busca-lista" ref={list} role="listbox" aria-label={B.campo}>
        {groups.map((g) => {
          const atBlocks = empty && GROUPS_AT_BLOCKS.has(g.grupo);
          return (
            <div key={g.grupo} className="dock-busca-grupo" role="group" aria-label={B.grupos[g.grupo]}>
              <div className="dock-busca-titulo">{B.grupos[g.grupo]}</div>
              <div className={atBlocks ? "dock-busca-blocos" : "dock-busca-linhas"}>{g.itens.map((item) => opcao(item, atBlocks))}</div>
            </div>
          );
        })}
        {loading && <p className="dock-busca-vazio">{B.lendo}</p>}
        {error && <p className="dock-busca-vazio">{NATIVE ? B.falhou : B.soNoWindows}</p>}
        {withoutApps && <p className="dock-busca-vazio">{B.nada}</p>}
      </div>
      <div className="dock-busca-rodape" aria-live="polite">
        {notice ? (
          <span className="dock-busca-aviso">{notice}</span>
        ) : (
          <>
            <span><Key>↑</Key><Key>↓</Key> {B.atalhos.navegar}</span>
            <span><Key><CornerDownLeft size={11} /></Key> {B.atalhos.abrir}</span>
            <span><Key>Ctrl</Key><Key>Shift</Key><Key><CornerDownLeft size={11} /></Key> {B.atalhos.admin}</span>
          </>
        )}
      </div>
    </motion.div>
  );
}
