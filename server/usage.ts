import { readFileSync, readdirSync, existsSync, type Dirent } from "node:fs";
import { open, readdir, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { usageFromStatus } from "./claudeStatus";

export interface WindowUsage {
  id: string;
  rotulo: string;
  usado: number;
  reiniciaEm?: string;
}

export interface UsageTool {
  id: "claude" | "codex";
  nome: string;
  situacao: "ok" | "sem_login" | "erro" | "ausente";
  plano?: string;
  nota?: string;
  janelas: WindowUsage[];
}

export interface SessionCurrent {
  projeto: string;
  arquivo: string;
  modelo?: string;
  inicio?: string;
  ultimaAtividade: string;
  mensagens: number;
  entrada: number;
  saida: number;
  cacheCriado: number;
  cacheLido: number;
}

export interface Usage {
  atualizadoEm: string;
  ferramentas: UsageTool[];
  sessao: SessionCurrent | null;
}

const TIME_LIMIT = 10000;
let cache: { valor: Usage; em: number } | null = null;

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function profilesClaude(): string[] {
  const home = homedir();
  const profiles = [join(home, ".claude")];
  try {
    for (const nameValue of readdirSync(home)) if (nameValue.startsWith(".claude-")) profiles.push(join(home, nameValue));
  } catch {
    return profiles;
  }
  return profiles.filter((p) => existsSync(p));
}

function percentage(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
}

async function readClaude(onlyOfficial: boolean): Promise<UsageTool> {
  const base: UsageTool = { id: "claude", nome: "Claude Code", situacao: "ausente", janelas: [] };
  const pelaStatus = usageFromStatus();
  if (pelaStatus) return { ...base, situacao: "ok", nota: "status_line", janelas: pelaStatus.map((j) => ({ id: j.id, rotulo: j.id, usado: j.usado, reiniciaEm: j.reiniciaEm })) };
  if (onlyOfficial) return base;
  const profiles = profilesClaude();
  if (profiles.length === 0) return base;
  for (const profile of profiles) {
    const credential = readJson(join(profile, ".credentials.json")) ?? readJson(join(profile, "credentials.json"));
    const oauth = (credential?.claudeAiOauth ?? credential) as Record<string, unknown> | null;
    const token = typeof oauth?.accessToken === "string" ? oauth.accessToken.trim() : "";
    if (!token) continue;
    try {
      const r = await fetch("https://api.anthropic.com/api/oauth/usage", {
        headers: { authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" },
        signal: AbortSignal.timeout(TIME_LIMIT),
      });
      if (r.status === 401 || r.status === 403) return { ...base, situacao: "sem_login", nota: "login_expirado" };
      if (!r.ok) return { ...base, situacao: "erro", nota: `http_${r.status}` };
      const json = (await r.json()) as Record<string, { utilization?: number; resets_at?: string } | null>;
      const labels: Record<string, string> = { five_hour: "sessao", seven_day: "semanal", seven_day_opus: "semanal_opus", seven_day_sonnet: "semanal_sonnet" };
      const windows: WindowUsage[] = [];
      for (const [field, id] of Object.entries(labels)) {
        const item = json[field];
        const used = percentage(item?.utilization);
        if (item && used != null) windows.push({ id, rotulo: id, usado: used, reiniciaEm: item.resets_at ?? undefined });
      }
      return { ...base, situacao: "ok", plano: typeof oauth?.subscriptionType === "string" ? oauth.subscriptionType : undefined, janelas: windows };
    } catch (e) {
      return { ...base, situacao: "erro", nota: (e as Error).message };
    }
  }
  return { ...base, situacao: "sem_login" };
}

async function readCodex(): Promise<UsageTool> {
  const base: UsageTool = { id: "codex", nome: "Codex", situacao: "ausente", janelas: [] };
  const root = join(homedir(), ".codex");
  if (!existsSync(root)) return base;
  const auth = readJson(join(root, "auth.json"));
  const tokens = auth?.tokens as { access_token?: string; account_id?: string } | undefined;
  if (!tokens?.access_token || !tokens.account_id) return { ...base, situacao: "sem_login" };
  try {
    const r = await fetch("https://chatgpt.com/backend-api/wham/usage", {
      headers: { authorization: `Bearer ${tokens.access_token}`, "chatgpt-account-id": tokens.account_id, accept: "application/json" },
      signal: AbortSignal.timeout(TIME_LIMIT),
    });
    if (r.status === 401 || r.status === 403) return { ...base, situacao: "sem_login", nota: "login_expirado" };
    if (!r.ok) return { ...base, situacao: "erro", nota: `http_${r.status}` };
    const json = (await r.json()) as { plan_type?: string; rate_limit?: Record<string, { used_percent?: number; reset_after_seconds?: number; reset_at?: number } | null> };
    const rootLimits = json.rate_limit ?? {};
    const windows: WindowUsage[] = [];
    for (const [field, id] of [["primary_window", "sessao"], ["secondary_window", "semanal"]] as const) {
      const item = rootLimits[field];
      const used = percentage(item?.used_percent);
      if (!item || used == null) continue;
      const restarts = item.reset_at ? new Date(item.reset_at * 1000) : item.reset_after_seconds ? new Date(Date.now() + item.reset_after_seconds * 1000) : undefined;
      windows.push({ id, rotulo: id, usado: used, reiniciaEm: restarts?.toISOString() });
    }
    return { ...base, situacao: "ok", plano: json.plan_type, janelas: windows };
  } catch (e) {
    return { ...base, situacao: "erro", nota: (e as Error).message };
  }
}

async function fileMaisRecent(directory: string, depth = 2): Promise<{ caminho: string; modificado: number } | null> {
  let best: { caminho: string; modificado: number } | null = null;
  const visit = async (dir: string, level: number): Promise<void> => {
    let items: Dirent[] = [];
    try {
      items = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      const path = join(dir, item.name);
      if (item.isDirectory()) {
        if (level < depth) await visit(path, level + 1);
        continue;
      }
      if (!item.name.endsWith(".jsonl")) continue;
      try {
        const info = await stat(path);
        if (!best || info.mtimeMs > best.modificado) best = { caminho: path, modificado: info.mtimeMs };
      } catch {
        continue;
      }
    }
  };
  await visit(directory, 0);
  return best;
}

async function readFinal(path: string, limit = 8 * 1024 * 1024): Promise<string> {
  const file = await open(path, "r");
  try {
    const { size } = await file.stat();
    const start = Math.max(0, size - limit);
    const buffer = Buffer.alloc(size - start);
    await file.read(buffer, 0, buffer.length, start);
    return buffer.toString("utf8");
  } finally {
    await file.close();
  }
}

async function readSessionCurrent(): Promise<SessionCurrent | null> {
  const recent = await fileMaisRecent(join(homedir(), ".claude", "projects"));
  if (!recent) return null;
  const session: SessionCurrent = {
    projeto: basename(join(recent.caminho, "..")).replace(/^[A-Za-z]--/, "").replace(/-/g, "\\"),
    arquivo: basename(recent.caminho),
    ultimaAtividade: new Date(recent.modificado).toISOString(),
    mensagens: 0,
    entrada: 0,
    saida: 0,
    cacheCriado: 0,
    cacheLido: 0,
  };
  const seen = new Set<string>();
  for (const line of (await readFinal(recent.caminho)).split("\n")) {
    if (!line.includes('"usage"')) {
      if (!session.inicio && line.includes('"timestamp"')) {
        const m = /"timestamp":"([^"]+)"/.exec(line);
        if (m) session.inicio = m[1];
      }
      continue;
    }
    let json: { timestamp?: string; message?: { id?: string; model?: string; usage?: Record<string, number> } };
    try {
      json = JSON.parse(line);
    } catch {
      continue;
    }
    const usage = json.message?.usage;
    if (!usage) continue;
    const id = json.message?.id;
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    session.inicio ??= json.timestamp;
    session.mensagens++;
    session.modelo = json.message?.model ?? session.modelo;
    session.entrada += usage.input_tokens ?? 0;
    session.saida += usage.output_tokens ?? 0;
    session.cacheCriado += usage.cache_creation_input_tokens ?? 0;
    session.cacheLido += usage.cache_read_input_tokens ?? 0;
  }
  return session;
}

export function usageOfficial(): Usage {
  const claude = usageFromStatus();
  const tools: UsageTool[] = claude ? [{ id: "claude", nome: "Claude Code", situacao: "ok", nota: "status_line", janelas: claude.map((j) => ({ id: j.id, rotulo: j.id, usado: j.usado, reiniciaEm: j.reiniciaEm })) }] : [];
  return { atualizadoEm: new Date().toISOString(), ferramentas: tools, sessao: null };
}

let readAtProgress: Promise<Usage> | null = null;

export function readUsage(force = false): Promise<Usage> {
  if (!force && cache && Date.now() - cache.em < 60000) return Promise.resolve(cache.valor);
  if (readAtProgress) return readAtProgress;
  const readResult = calculateUsage().finally(() => {
    if (readAtProgress === readResult) readAtProgress = null;
  });
  readAtProgress = readResult;
  return readResult;
}

async function calculateUsage(): Promise<Usage> {
  const [claude, codex] = await Promise.all([readClaude(false), readCodex()]);
  let session: SessionCurrent | null = null;
  try {
    session = await readSessionCurrent();
  } catch {
    session = null;
  }
  const value: Usage = { atualizadoEm: new Date().toISOString(), ferramentas: [claude, codex], sessao: session };
  cache = { valor: value, em: Date.now() };
  return value;
}
