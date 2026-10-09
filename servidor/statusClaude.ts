import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pastaDados } from "./ia";

export const CAMINHO_DA_STATUS = "/ponte/claude/status";
const NOME_DO_SCRIPT = "status-claude-niko.mjs";
const VALIDADE_MS = 6 * 60 * 60_000;

export interface JanelaDaStatus {
  id: "sessao" | "semanal";
  usado: number;
  reiniciaEm?: string;
}

let ultimaStatus: { em: number; janelas: JanelaDaStatus[] } | null = null;

/** O script que o Claude Code chama como status line: manda os dados para o Niko e depois roda a status line que a pessoa já tinha, com a mesma entrada. */
export const SCRIPT_DA_STATUS = `// Gerado pelo Niko. Remova pelo Niko (aba Código > Claude Code).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const [, , porta, segredo, marcado] = process.argv;
const anterior = marcado?.startsWith("a=") ? marcado.slice(2) : "";
let entrada = "";
for await (const parte of process.stdin) entrada += parte;

const envio = fetch(\`http://127.0.0.1:\${porta}${CAMINHO_DA_STATUS}\`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-niko-gancho": segredo },
  body: entrada,
  signal: AbortSignal.timeout(400),
}).catch(() => undefined);

function shellDoClaude() {
  const candidatos = [process.env.CLAUDE_CODE_GIT_BASH_PATH, "C:\\\\Program Files\\\\Git\\\\bin\\\\bash.exe", "C:\\\\Program Files (x86)\\\\Git\\\\bin\\\\bash.exe"];
  return candidatos.find((c) => c && existsSync(c));
}

if (anterior) {
  let comando = "";
  try {
    comando = JSON.parse(Buffer.from(anterior, "base64").toString("utf8")).command ?? "";
  } catch {
    comando = "";
  }
  if (comando) {
    const bash = shellDoClaude();
    const filho = bash ? spawn(bash, ["-c", comando], { stdio: ["pipe", "inherit", "ignore"] }) : spawn(comando, { shell: true, stdio: ["pipe", "inherit", "ignore"] });
    const limite = setTimeout(() => filho.kill(), 5000);
    filho.on("error", () => undefined);
    filho.stdin.on("error", () => undefined);
    filho.stdin.end(entrada);
    await new Promise((r) => filho.on("close", r));
    clearTimeout(limite);
  }
}
await envio;
`;

export function caminhoDoScript() {
  return join(pastaDados(), NOME_DO_SCRIPT);
}

export function garantirScript() {
  const caminho = caminhoDoScript();
  if (existsSync(caminho) && readFileSync(caminho, "utf8") === SCRIPT_DA_STATUS) return;
  mkdirSync(pastaDados(), { recursive: true });
  writeFileSync(caminho, SCRIPT_DA_STATUS, "utf8");
}

function comBarras(caminho: string) {
  return caminho.replace(/\\/g, "/");
}

export function ehStatusDoNiko(valor: unknown): boolean {
  const s = valor as { command?: unknown } | null;
  return Boolean(s && typeof s === "object" && typeof s.command === "string" && s.command.includes(NOME_DO_SCRIPT));
}

export function anteriorDaStatus(valor: unknown): Record<string, unknown> | undefined {
  if (!ehStatusDoNiko(valor)) return valor && typeof valor === "object" ? (valor as Record<string, unknown>) : undefined;
  const codigo = /\sa=([A-Za-z0-9+/=]+)\s*$/.exec(String((valor as { command: string }).command))?.[1];
  if (!codigo) return undefined;
  try {
    const anterior = JSON.parse(Buffer.from(codigo, "base64").toString("utf8")) as unknown;
    return anterior && typeof anterior === "object" && !Array.isArray(anterior) ? (anterior as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

export function statusDoNiko(anterior: Record<string, unknown> | undefined, porta: number, segredo: string, node = process.execPath) {
  const guardada = anterior && typeof anterior.command === "string" && anterior.command.trim() ? Buffer.from(JSON.stringify(anterior), "utf8").toString("base64") : "";
  const comando = `"${comBarras(node)}" "${comBarras(caminhoDoScript())}" ${porta} ${segredo}${guardada ? ` a=${guardada}` : ""}`;
  return { ...(anterior ?? {}), type: "command", command: comando };
}

function porcentagem(v: unknown): number | null {
  const n = typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
}

export function lerDadosDaStatus(corpo: Record<string, unknown>): JanelaDaStatus[] {
  const limites = (corpo.rate_limits ?? {}) as Record<string, { used_percentage?: unknown; resets_at?: unknown } | undefined>;
  const janelas: JanelaDaStatus[] = [];
  for (const [campo, id] of [["five_hour", "sessao"], ["seven_day", "semanal"]] as const) {
    const item = limites[campo];
    const usado = porcentagem(item?.used_percentage);
    if (!item || usado === null) continue;
    const data = typeof item.resets_at === "number" ? new Date(item.resets_at * 1000) : undefined;
    const reinicia = data && Number.isFinite(data.getTime()) ? data.toISOString() : undefined;
    janelas.push({ id, usado, reiniciaEm: reinicia });
  }
  return janelas;
}

export function receberStatus(corpo: Record<string, unknown>) {
  const janelas = lerDadosDaStatus(corpo);
  if (janelas.length) ultimaStatus = { em: Date.now(), janelas };
}

export function usoPelaStatus(agora = Date.now()): JanelaDaStatus[] | null {
  if (!ultimaStatus || agora - ultimaStatus.em > VALIDADE_MS) return null;
  const vivas = ultimaStatus.janelas.filter((j) => !j.reiniciaEm || Date.parse(j.reiniciaEm) > agora);
  return vivas.length ? vivas : null;
}
