export type CodingTool = "claude" | "codex" | "copilot" | "opencode" | "antigravity" | "kimi" | "gemini" | "amp";

export const TOOLS_CODE: CodingTool[] = ["claude", "codex", "copilot", "opencode", "antigravity", "kimi", "gemini", "amp"];

export const TOOLS_THAT_APPROVE: CodingTool[] = ["claude", "codex", "copilot"];

export interface StateTool {
  id: CodingTool;
  caminho: string;
  detectado: boolean;
  instalado: boolean;
  desatualizado: boolean;
  invalido: boolean;
}

export interface EventClaude {
  id: string;
  recebidoEm: string;
  ferramenta?: CodingTool;
  evento: string;
  sessao: string;
  cwd: string;
  dados: Record<string, unknown>;
  pedidoId?: string;
}

export interface StateInstallation {
  caminho: string;
  existe: boolean;
  claudeInstalado: boolean;
  invalido: boolean;
  instalado: boolean;
  parcial: boolean;
  eventos: string[];
  desatualizado: boolean;
  conectado: boolean;
}

export interface RuleSuggested {
  toolName: string;
  ruleContent: string;
}

export interface PreviewInstallation {
  caminho: string;
  atual: string | null;
  proposto: string;
}

const HEADERS = { "x-niko": "1", "content-type": "application/json" };

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const r = await fetch(`/ponte/claude/${path}`, { ...options, headers: HEADERS });
  const json = (await r.json().catch(() => ({}))) as T & { erro?: string };
  if (!r.ok) throw new Error(json.erro ?? `http_${r.status}`);
  return json;
}

export const claudeCode = {
  instalacao: () => request<StateInstallation>("instalacao"),
  previa: (action: "instalar" | "remover") => request<PreviewInstallation>(`previa?acao=${action}`),
  instalar: () => request<{ caminho: string; copia: string | null }>("instalar", { method: "POST", body: JSON.stringify({ confirmacao: "INSTALAR" }) }),
  remover: () => request<{ caminho: string; copia: string | null }>("remover", { method: "POST", body: JSON.stringify({ confirmacao: "REMOVER" }) }),
  decidir: (requestId: string, decision: "allow" | "deny" | "terminal", rule?: RuleSuggested) => request<{ ok: boolean }>("decisao", { method: "POST", body: JSON.stringify({ pedidoId: requestId, decisao: decision, regra: rule }) }),
  responder: (requestId: string, responses: number[][]) => request<{ ok: boolean }>("decisao", { method: "POST", body: JSON.stringify({ pedidoId: requestId, decisao: "allow", respostas: responses }) }),
  abrir: (cwd: string, how: "vscode" | "pasta") => request<{ ok: boolean }>("abrir", { method: "POST", body: JSON.stringify({ cwd, como: how }) }),
  terminal: (session: string) => request<{ ok: boolean }>("terminal", { method: "POST", body: JSON.stringify({ sessao: session }) }),
  abrirArquivo: (cwd: string, file: string) => request<{ ok: boolean }>("abrir", { method: "POST", body: JSON.stringify({ cwd, como: "arquivo", arquivo: file }) }),
};

async function requestAgents<T>(path: string, options: RequestInit = {}): Promise<T> {
  const r = await fetch(`/ponte/agentes${path}`, { ...options, headers: HEADERS });
  const json = (await r.json().catch(() => ({}))) as T & { erro?: string };
  if (!r.ok) throw new Error(json.erro ?? `http_${r.status}`);
  return json;
}

export const agentsCode = {
  estado: () => requestAgents<{ ferramentas: StateTool[] }>(""),
  instalar: (id: CodingTool) => requestAgents<{ caminho: string; copia: string | null }>(`/${id}/instalar`, { method: "POST", body: JSON.stringify({ confirmacao: "INSTALAR" }) }),
  remover: (id: CodingTool) => requestAgents<{ caminho: string; copia: string | null }>(`/${id}/remover`, { method: "POST", body: JSON.stringify({ confirmacao: "REMOVER" }) }),
};

export function listenClaudeCode(onReceive: (e: EventClaude) => void, onChangeConnection: (enabled: boolean) => void): () => void {
  let alive = true;
  let control: AbortController | null = null;
  let wait = 1000;
  let timer = 0;

  const connect = async () => {
    if (!alive) return;
    control = new AbortController();
    try {
      const r = await fetch("/ponte/claude/eventos", { headers: { "x-niko": "1" }, signal: control.signal });
      if (!r.ok || !r.body) throw new Error(`http_${r.status}`);
      onChangeConnection(true);
      wait = 1000;
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let rest = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        rest += decoder.decode(value, { stream: true });
        const lines = rest.split("\n");
        rest = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            onReceive(JSON.parse(line) as EventClaude);
          } catch {
            continue;
          }
        }
      }
    } catch {
      if (!alive) return;
    }
    onChangeConnection(false);
    if (!alive) return;
    timer = window.setTimeout(() => void connect(), wait);
    wait = Math.min(wait * 2, 30000);
  };

  void connect();
  return () => {
    alive = false;
    window.clearTimeout(timer);
    control?.abort();
  };
}
