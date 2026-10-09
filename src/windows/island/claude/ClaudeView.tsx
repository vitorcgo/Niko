import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Bell, Bot, ChartNoAxesColumn, Check, Plug, ChevronRight, CircleCheck, CircleX, Code2, Copy, FilePen, FileText, FolderOpen, FolderSearch, Globe, ListChecks, LoaderCircle, MessageCircleQuestion, MessageSquare, Search, Settings, ShieldAlert, SquareTerminal, X, type LucideIcon,
} from "lucide-react";
import { useClaudeCode, type StepClaude, type SessionClaude, type RequestPermission, type PerguntaClaude } from "../../../state/claudeCode";
import { agentsCode, claudeCode, TOOLS_CODE, type RuleSuggested } from "../../../bridge/claudeCode";
import { countChanges } from "../../../utils/diff";
import { CompactDiff } from "./CompactDiff";
import { AiUsage } from "./AiUsage";
import { useIsland } from "../../../state/island";
import { playSound } from "../../../bridge/sounds";
import { Brand } from "../../../brands/Brand";
import { RichText } from "../../../components/RichText";
import { T } from "../../../i18n/ptBR";
import "./claude.css";
import { AnimatedStages } from "../animations/AnimatedStages";
import { closeSession } from "./useClaudeCodeLifecycle";
import { ToolSettings } from "./ToolSettings";
import { WeeklySummary } from "./WeeklySummary";
import { trazerTerminalSession } from "../../../desktop/useGlobalShortcuts";
import { BRAND_TOOL, nameTool } from "./tools";

const WAIT_MS = 110_000;
const C = T.ilha.claude;

const ICON_TOOL: Record<string, LucideIcon> = {
  Bash: SquareTerminal,
  PowerShell: SquareTerminal,
  Read: FileText,
  Write: FilePen,
  Edit: FilePen,
  MultiEdit: FilePen,
  NotebookEdit: FilePen,
  Glob: FolderSearch,
  LS: FolderSearch,
  Grep: Search,
  WebSearch: Globe,
  WebFetch: Globe,
  TodoWrite: ListChecks,
  Task: Bot,
  Agent: Bot,
};

function iconStep(p: StepClaude): LucideIcon {
  if (p.tipo === "pedido") return MessageSquare;
  if (p.tipo === "falha" || p.tipo === "erro") return CircleX;
  if (p.tipo === "fim") return CircleCheck;
  if (p.tipo === "aviso") return Bell;
  if (p.tipo === "subagente") return Bot;
  return (p.ferramenta && ICON_TOOL[p.ferramenta]) || SquareTerminal;
}

function time(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function whenFoi(iso: string, now: number) {
  const min = Math.floor((now - Date.parse(iso)) / 60000);
  return min < 1 ? C.agora : C.haMinutos(min);
}

function useNow(interval: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(t);
  }, [interval]);
  return now;
}

function openProject(cwd: string, how: "vscode" | "pasta") {
  claudeCode.abrir(cwd, how).catch((e: Error) => {
    useIsland.getState().revelar({ texto: C.abrirFalhou[e.message] ?? C.abrirFalhou.outro, tipo: "alerta", marca: "claudecode", aba: "claude" }, 4500);
  });
}

function Pergunta({ pedido: request, perguntas, fila: queue }: { pedido: RequestPermission; perguntas: PerguntaClaude[]; fila: number }) {
  const now = useNow(1000);
  const [sending, setSending] = useState(false);
  const [choices, setChoices] = useState<number[][]>(() => perguntas.map(() => []));
  const remaining = Math.max(0, Math.ceil((Date.parse(request.recebidoEm) + WAIT_MS - now) / 1000));
  const complete = perguntas.every((_, i) => (choices[i]?.length ?? 0) > 0);
  const nameValue = nameTool(request.ferramentaDeCodigo);

  const send = (action: () => Promise<unknown>, sound: "approve" | "close") => {
    if (sending) return;
    setSending(true);
    action()
      .then(() => {
        useClaudeCode.getState().removeRequest(request.pedidoId);
        void playSound(sound, "avisos");
      })
      .catch(() => {
        void claudeCode.decidir(request.pedidoId, "terminal").catch(() => undefined);
        useClaudeCode.getState().removeRequest(request.pedidoId);
        useIsland.getState().revelar({ texto: C.decisaoFalhou, tipo: "alerta", marca: "claudecode", aba: "claude" }, 5000);
      })
      .finally(() => setSending(false));
  };
  const respond = (responses: number[][]) => send(() => claudeCode.responder(request.pedidoId, responses), "approve");
  const select = (indexPergunta: number, indexOpcao: number) => {
    const p = perguntas[indexPergunta];
    const current = choices[indexPergunta] ?? [];
    const next = p.varias ? (current.includes(indexOpcao) ? current.filter((x) => x !== indexOpcao) : [...current, indexOpcao]) : [indexOpcao];
    const all = choices.map((e, i) => (i === indexPergunta ? next : e));
    setChoices(all);
    if (perguntas.length === 1 && !p.varias) respond(all);
  };

  return (
    <div className="vsc-permissao vsc-pergunta" role="alertdialog" aria-label={C.pergunta.titulo(nameValue)}>
      <div className="vsc-permissao-topo">
        <MessageCircleQuestion size={15} />
        <Brand marca={BRAND_TOOL[request.ferramentaDeCodigo]} tamanho={14} />
        <span>{C.pergunta.titulo(nameValue)}</span>
        <span className="vsc-chip">{request.projeto}</span>
      </div>
      {perguntas.map((p, ip) => (
        <div key={`${ip}-${p.pergunta}`} className="vsc-pergunta-bloco" role="group" aria-label={p.pergunta}>
          {p.titulo && <span className="vsc-pergunta-cabecalho">{p.titulo}</span>}
          <p className="vsc-pergunta-texto">{p.pergunta}</p>
          {p.varias && <span className="vsc-dim">{C.pergunta.varias}</span>}
          <div className="vsc-pergunta-opcoes">
            {p.opcoes.map((o, io) => {
              const marked = choices[ip]?.includes(io) ?? false;
              return (
                <button
                  key={`${io}-${o.rotulo}`}
                  type="button"
                  role={p.varias ? "checkbox" : "radio"}
                  aria-checked={marked}
                  className="vsc-pergunta-opcao"
                  data-marcada={marked || undefined}
                  disabled={sending}
                  onClick={() => select(ip, io)}
                >
                  <span className="vsc-pergunta-rotulo">{o.rotulo}</span>
                  {o.descricao && <span className="vsc-pergunta-descricao">{o.descricao}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div className="vsc-permissao-rodape">
        <span className="vsc-dim">
          {C.expiraEm(remaining)}
          {queue > 1 ? ` . ${C.maisPedidos(queue - 1)}` : ""}
        </span>
        <span className="vsc-barra-tempo" style={{ ["--resto" as string]: `${(remaining / (WAIT_MS / 1000)) * 100}%` }} />
        <button type="button" className="vsc-botao vsc-botao-link" disabled={sending} title={C.pergunta.terminalDica} onClick={() => send(() => claudeCode.decidir(request.pedidoId, "terminal"), "close")}>
          {C.pergunta.noTerminal}
        </button>
        {(perguntas.length > 1 || perguntas.some((p) => p.varias)) && (
          <button type="button" className="vsc-botao vsc-botao-primario" disabled={sending || !complete} onClick={() => respond(choices)}>
            {sending ? <LoaderCircle size={13} className="girando" /> : <Check size={13} />}
            {C.pergunta.enviar}
          </button>
        )}
      </div>
    </div>
  );
}

function Permission({ pedido: request, fila: queue }: { pedido: RequestPermission; fila: number }) {
  const now = useNow(1000);
  const [sending, setSending] = useState(false);
  const remaining = Math.max(0, Math.ceil((Date.parse(request.recebidoEm) + WAIT_MS - now) / 1000));
  const rule = request.sugestoes[0];
  const cwdSession = useClaudeCode((s) => s.sessoes[request.sessao]?.cwd);
  const textRule = rule ? `${rule.toolName}(${rule.ruleContent})` : "";
  const decide = (decision: "allow" | "deny" | "terminal", hasRule?: RuleSuggested) => {
    if (sending) return;
    setSending(true);
    claudeCode
      .decidir(request.pedidoId, decision, hasRule)
      .then(() => {
        useClaudeCode.getState().removeRequest(request.pedidoId);
        void playSound(decision === "allow" ? "approve" : decision === "deny" ? "slap" : "close", "avisos");
      })
      .catch(() => {
        useClaudeCode.getState().removeRequest(request.pedidoId);
        useIsland.getState().revelar({ texto: C.decisaoFalhou, tipo: "alerta", marca: "claudecode", aba: "claude" }, 5000);
      })
      .finally(() => setSending(false));
  };
  return (
    <div className="vsc-permissao" role="alertdialog" aria-label={C.querPermissao(nameTool(request.ferramentaDeCodigo), request.ferramenta)}>
      <div className="vsc-permissao-topo">
        <ShieldAlert size={15} />
        <Brand marca={BRAND_TOOL[request.ferramentaDeCodigo]} tamanho={14} />
        <span>{C.querPermissao(nameTool(request.ferramentaDeCodigo), request.ferramenta)}</span>
        <span className="vsc-chip">{request.projeto}</span>
      </div>
      {request.alteracao ? <CompactDiff alteracao={request.alteracao} maximo={80} cwd={cwdSession || undefined} /> : <pre className="vsc-codigo">{request.entrada}</pre>}
      <div className="vsc-permissao-rodape">
        <span className="vsc-dim">
          {C.expiraEm(remaining)}
          {queue > 1 ? ` . ${C.maisPedidos(queue - 1)}` : ""}
        </span>
        <span className="vsc-barra-tempo" style={{ ["--resto" as string]: `${(remaining / (WAIT_MS / 1000)) * 100}%` }} />
        <button type="button" className="vsc-botao vsc-botao-link" disabled={sending} onClick={() => decide("terminal")}>
          {C.noTerminal}
        </button>
        <button type="button" className="vsc-botao" disabled={sending} onClick={() => decide("deny")}>
          {C.negar}
        </button>
        {rule && (
          <button type="button" className="vsc-botao vsc-botao-regra" disabled={sending} title={C.sempreDica(textRule)} onClick={() => decide("allow", rule)}>
            {C.sempre}
            <code>{textRule}</code>
          </button>
        )}
        <button type="button" className="vsc-botao vsc-botao-primario" disabled={sending} onClick={() => decide("allow")}>
          {sending ? <LoaderCircle size={13} className="girando" /> : <Check size={13} />}
          {C.permitir}
        </button>
      </div>
    </div>
  );
}

function Activity({ sessao: session }: { sessao: SessionClaude }) {
  const list = useRef<HTMLDivElement>(null);
  const noEnd = useRef(true);
  const [openValue, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((current) => {
      const newItem = new Set(current);
      if (newItem.has(id)) newItem.delete(id);
      else newItem.add(id);
      return newItem;
    });
  useEffect(() => {
    const el = list.current;
    if (el && noEnd.current) el.scrollTop = el.scrollHeight;
  }, [session.passos.length, session.id]);
  return (
    <div
      ref={list}
      className="vsc-atividade"
      role="log"
      onScroll={(e) => {
        const el = e.currentTarget;
        noEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      }}
    >
      {session.passos.map((p) => {
        const Icon = iconStep(p);
        const count = p.alteracao ? countChanges(p.alteracao) : null;
        const isOpen = openValue.has(p.id);
        const content = (
          <>
            <span className="vsc-hora">{time(p.hora)}</span>
            <Icon size={13} className="vsc-icone" />
            <span className="vsc-rotulo">{p.rotulo}</span>
            {p.detalhe && <span className="vsc-detalhe">{p.detalhe}</span>}
            {count && (
              <span className="vsc-contagem">
                <span className="vsc-diff-mais">+{count.mais}</span>
                <span className="vsc-diff-menos">-{count.menos}</span>
                <ChevronRight size={12} className="vsc-seta" data-aberto={isOpen || undefined} />
              </span>
            )}
          </>
        );
        return (
          <div key={p.id}>
            {p.alteracao ? (
              <button type="button" className="vsc-linha vsc-linha-botao" data-tipo={p.tipo} aria-expanded={isOpen} title={C.verAlteracao} onClick={() => toggle(p.id)}>
                {content}
              </button>
            ) : (
              <div className="vsc-linha" data-tipo={p.tipo}>
                {content}
              </div>
            )}
            {isOpen && p.alteracao && (
              <div className="vsc-linha-diff">
                <CompactDiff alteracao={p.alteracao} cwd={session.cwd || undefined} />
              </div>
            )}
          </div>
        );
      })}
      {(session.estado === "trabalhando" || session.estado === "pensando") && (
        <div className="vsc-linha vsc-cursor">
          <span className="vsc-hora" />
          <LoaderCircle size={13} className="vsc-icone girando" />
          <span className="vsc-rotulo">{C.estados[session.estado]}</span>
        </div>
      )}
    </div>
  );
}

function ResponseValue({ sessao: session }: { sessao: SessionClaude }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="vsc-editor">
      <div className="vsc-migalhas">
        <span>{session.projeto}</span>
        <span className="vsc-dim">›</span>
        <span>{C.resposta}</span>
        <button
          type="button"
          className="vsc-icone-botao"
          aria-label={C.copiarResposta}
          title={C.copiarResposta}
          onClick={() => {
            void navigator.clipboard.writeText(session.resposta ?? "").then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1400);
            });
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
      {session.pedido && (
        <div className="vsc-pedido">
          <span className="vsc-dim">{C.pedido}</span>
          <span>{session.pedido}</span>
        </div>
      )}
      <div className="vsc-markdown privado">
        <RichText texto={session.resposta ?? ""} />
      </div>
    </div>
  );
}

function WithoutSessions({ conectado: connected, aoConfigurar: onConfigure }: { conectado: boolean; aoConfigurar: () => void }) {
  return (
    <div className="vsc-vazio">
      <span className="vsc-vazio-logos" aria-hidden="true">
        {TOOLS_CODE.map((f, i) => (
          <motion.span
            key={f}
            className="vsc-vazio-logo"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: [0, -3, 0] }}
            transition={{ opacity: { delay: i * 0.06 }, y: { delay: 0.4 + i * 0.18, duration: 2.4, repeat: Infinity, ease: "easeInOut" } }}
          >
            <Brand marca={BRAND_TOOL[f]} tamanho={18} />
          </motion.span>
        ))}
      </span>
      <b>{connected ? C.semSessoes : C.naoConectado}</b>
      <span className="vsc-dim">{connected ? C.semSessoesDica : C.naoConectadoDica}</span>
      <button type="button" className="vsc-botao vsc-botao-primario" onClick={onConfigure}>
        {connected ? <Plug size={13} /> : <Settings size={13} />}
        {C.abrirConfiguracoes}
      </button>
    </div>
  );
}

export function ClaudeView() {
  const sessions = useClaudeCode((s) => s.sessoes);
  const order = useClaudeCode((s) => s.ordem);
  const requests = useClaudeCode((s) => s.pedidos);
  const focused = useClaudeCode((s) => s.focada);
  const focusValue = useClaudeCode((s) => s.focus);
  const now = useNow(30000);
  const [connected, setConnected] = useState(true);
  const [configOpen, setConfigOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const session = sessions[focused ?? ""] ?? sessions[order[0]];
  const request = requests.find((p) => p.sessao === session?.id) ?? requests[0];
  const [panel, setPanel] = useState<"resposta" | "atividade">("atividade");

  useEffect(() => {
    if (configOpen) return;
    void agentsCode
      .estado()
      .then((r) => setConnected(r.ferramentas.some((f) => f.instalado)))
      .catch(() => setConnected(false));
  }, [configOpen]);

  useEffect(() => {
    setPanel(session?.estado === "terminou" && session.resposta ? "resposta" : "atividade");
  }, [session?.id, session?.estado, session?.resposta]);

  return (
    <div className="ias">
    <div className="vsc">
      <div className="vsc-topo">
      <div className="vsc-abas" role="tablist">
        {order.map((id) => {
          const s = sessions[id];
          if (!s) return null;
          const hasRequest = requests.some((p) => p.sessao === id);
          return (
            <div key={id} className="vsc-aba" data-ativa={s.id === session?.id || undefined} data-estado={hasRequest ? "aprovacao" : s.estado}>
              <button type="button" role="tab" aria-selected={s.id === session?.id} className="vsc-aba-botao" onClick={() => focusValue(id)} title={s.cwd}>
                <Brand marca={BRAND_TOOL[s.ferramenta ?? "claude"]} tamanho={12} />
                <span className="vsc-aba-nome">{s.projeto}</span>
                <span className="vsc-ponto" />
              </button>
              <button type="button" className="vsc-aba-fechar" aria-label={C.fechar} title={C.fechar} onClick={() => closeSession(id)}>
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>
        <span className="vsc-acoes-abas">
          {session?.modo && <span className="vsc-dim vsc-acoes-texto">{C.modos[session.modo] ?? session.modo}</span>}
          {session && <span className="vsc-dim vsc-acoes-texto">{whenFoi(session.atualizadaEm, now)}</span>}
          {session && (
            <button type="button" className="vsc-icone-botao" aria-label={C.terminal.trazer} title={C.terminal.trazer} onClick={() => trazerTerminalSession(session.id)}>
              <SquareTerminal size={13} />
            </button>
          )}
          {session?.cwd && (
            <>
              <button type="button" className="vsc-icone-botao" aria-label={C.abrirVsCode} title={C.abrirVsCode} onClick={() => openProject(session.cwd, "vscode")}>
                <Code2 size={13} />
              </button>
              <button type="button" className="vsc-icone-botao" aria-label={C.abrirPasta} title={C.abrirPasta} onClick={() => openProject(session.cwd, "pasta")}>
                <FolderOpen size={13} />
              </button>
            </>
          )}
          <AiUsage />
          <button type="button" className="vsc-icone-botao" aria-label={C.resumo.abrir} title={C.resumo.abrir} aria-pressed={summaryOpen} onClick={() => setSummaryOpen((v) => !v)}>
            <ChartNoAxesColumn size={13} />
          </button>
          <button type="button" className="vsc-icone-botao vsc-engrenagem" aria-label={C.configurar} title={C.configurar} aria-pressed={configOpen} onClick={() => setConfigOpen((v) => !v)}>
            <Settings size={13} />
          </button>
        </span>
      </div>

      <div className="vsc-corpo">
        {!session ? (
          <WithoutSessions conectado={connected} aoConfigurar={() => setConfigOpen(true)} />
        ) : request ? (
          request.perguntas ? <Pergunta key={request.pedidoId} pedido={request} perguntas={request.perguntas} fila={requests.length} /> : <Permission pedido={request} fila={requests.length} />
        ) : (
          <>
            <div className="vsc-paineis" role="tablist">
              {session.resposta && (
                <button type="button" role="tab" aria-selected={panel === "resposta"} className="vsc-painel" onClick={() => setPanel("resposta")}>
                  {C.resposta}
                </button>
              )}
              <button type="button" role="tab" aria-selected={panel === "atividade"} className="vsc-painel" onClick={() => setPanel("atividade")}>
                {C.atividade}
              </button>
            </div>
            {panel === "atividade" && <AnimatedStages contexto={session.id} etapas={session.passos.filter((p) => p.tipo === "ferramenta" || p.tipo === "fim" || p.tipo === "erro").map((p) => ({ id: p.id, texto: `${p.rotulo} ${p.detalhe ?? ""}`.trim() }))} />}
            {panel === "resposta" && session.resposta ? <ResponseValue sessao={session} /> : <Activity sessao={session} />}
          </>
        )}
      </div>
      <AnimatePresence>{configOpen && <ToolSettings key="config" aoFechar={() => setConfigOpen(false)} />}</AnimatePresence>
      <AnimatePresence>{summaryOpen && !configOpen && <WeeklySummary key="resumo" aoFechar={() => setSummaryOpen(false)} />}</AnimatePresence>
    </div>
    </div>
  );
}
