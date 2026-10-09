import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";

const SCOPES_GMAIL = ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose"];
const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface CredentialGmail {
  clienteId: string;
  segredo: string;
  refresh?: string;
}

function base64url(b: Buffer): string {
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function openBrowser(url: string) {
  if (process.platform !== "win32") throw new Error("somente_windows");
  const child = spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], { detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", () => undefined);
  child.unref();
}

export function readCredentialGmail(text: string): CredentialGmail {
  const c = JSON.parse(text) as CredentialGmail;
  if (!c.clienteId || !c.segredo) throw new Error("credencial_invalida");
  return c;
}

export function authorizeGmail(clientId: string, secret: string): Promise<CredentialGmail> {
  return authorizeGoogle(clientId, secret, SCOPES_GMAIL, "Gmail");
}

export async function authorizeGoogle(clientId: string, secret: string, scopes: string[], service: string): Promise<CredentialGmail> {
  if (!/\.apps\.googleusercontent\.com$/.test(clientId)) throw new Error("cliente_id_invalido");
  const validator = base64url(randomBytes(48));
  const challenge = base64url(createHash("sha256").update(validator).digest());
  const state = base64url(randomBytes(16));
  const { codigo: code, redirecionamento: redirect } = await new Promise<{ codigo: string; redirecionamento: string }>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const codeReceived = url.searchParams.get("code");
      const stateMatches = url.searchParams.get("state") === state;
      if (url.pathname !== "/" || !stateMatches || (!codeReceived && !url.searchParams.get("error"))) {
        res.writeHead(404);
        res.end();
        return;
      }
      const ok = Boolean(codeReceived);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><meta charset="utf-8"><title>Niko</title><body style="font-family:system-ui;padding:40px;background:#0e0e10;color:#f1f2f4"><h2>${ok ? `${service} conectado.` : "Não deu certo."}</h2><p>${ok ? "Pode fechar esta aba e voltar ao Niko." : "Volte ao Niko e tente de novo."}</p></body>`);
      clearTimeout(clock);
      server.close();
      if (ok) resolve({ codigo: codeReceived!, redirecionamento: `http://127.0.0.1:${(server.address() as AddressInfo | null)?.port ?? port}` });
      else reject(new Error(url.searchParams.get("error") ?? "autorizacao_negada"));
    });
    let port = 0;
    const clock = setTimeout(() => {
      server.close();
      reject(new Error("tempo_esgotado"));
    }, 180000);
    server.listen(0, "127.0.0.1", () => {
      port = (server.address() as AddressInfo).port;
      const parameters = new URLSearchParams({
        client_id: clientId,
        redirect_uri: `http://127.0.0.1:${port}`,
        response_type: "code",
        scope: scopes.join(" "),
        code_challenge: challenge,
        code_challenge_method: "S256",
        access_type: "offline",
        prompt: "consent",
        state: state,
      });
      try {
        openBrowser(`https://accounts.google.com/o/oauth2/v2/auth?${parameters}`);
      } catch (e) {
        clearTimeout(clock);
        server.close();
        reject(e as Error);
      }
    });
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code: code, client_id: clientId, client_secret: secret, redirect_uri: redirect, grant_type: "authorization_code", code_verifier: validator }),
    signal: AbortSignal.timeout(15000),
  });
  const json = (await r.json()) as { refresh_token?: string; access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!r.ok || !json.refresh_token) throw new Error(json.error_description ?? json.error ?? `http_${r.status}`);
  if (json.access_token) access.set(json.refresh_token, { token: json.access_token, expira: Date.now() + (json.expires_in ?? 3000) * 1000 - 60000 });
  return { clienteId: clientId, segredo: secret, refresh: json.refresh_token };
}

const access = new Map<string, { token: string; expira: number }>();
const renewalsAtProgress = new Map<string, Promise<string>>();

function tokenAccess(c: CredentialGmail): Promise<string> {
  const keyAccess = c.refresh ?? c.clienteId;
  const stored = access.get(keyAccess);
  if (stored && stored.expira > Date.now()) return Promise.resolve(stored.token);
  const atProgress = renewalsAtProgress.get(keyAccess);
  if (atProgress) return atProgress;
  const renewal = renewToken(c).finally(() => renewalsAtProgress.delete(keyAccess));
  renewalsAtProgress.set(keyAccess, renewal);
  return renewal;
}

async function renewToken(c: CredentialGmail): Promise<string> {
  if (!c.refresh) throw new Error("sem_autorizacao");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.clienteId, client_secret: c.segredo, refresh_token: c.refresh, grant_type: "refresh_token" }),
    signal: AbortSignal.timeout(15000),
  });
  const json = (await r.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!r.ok || !json.access_token) throw new Error(json.error === "invalid_grant" ? "autorizacao_expirada" : json.error ?? `http_${r.status}`);
  access.set(c.refresh, { token: json.access_token, expira: Date.now() + (json.expires_in ?? 3000) * 1000 - 60000 });
  return json.access_token;
}

export async function apiGoogle<T>(c: CredentialGmail, path: string, body?: unknown, base = BASE): Promise<T> {
  const token = await tokenAccess(c);
  const r = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`http_${r.status} ${(await r.text().catch(() => "")).slice(0, 160)}`);
  return (await r.json()) as T;
}

interface Header {
  name: string;
  value: string;
}

export interface EmailSummary {
  id: string;
  de: string;
  assunto: string;
  trecho: string;
  data: string;
  naoLido: boolean;
  importante: boolean;
}

async function listValue(c: CredentialGmail, q: string, maximum: number): Promise<EmailSummary[]> {
  const listValue = await apiGoogle<{ messages?: { id: string }[] }>(c, `/messages?maxResults=${maximum}&q=${encodeURIComponent(q)}`);
  const items = await Promise.all(
    (listValue.messages ?? []).map((m) =>
      apiGoogle<{ id: string; snippet: string; labelIds?: string[]; internalDate: string; payload?: { headers?: Header[] } }>(c, `/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`).catch(() => null),
    ),
  );
  return items
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .map((m) => {
      const h = (n: string) => m.payload?.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? "";
      return {
        id: m.id,
        de: h("from").replace(/<[^>]+>/, "").replace(/"/g, "").trim() || h("from"),
        assunto: h("subject") || "(sem assunto)",
        trecho: m.snippet,
        data: new Date(Number(m.internalDate)).toISOString(),
        naoLido: m.labelIds?.includes("UNREAD") ?? false,
        importante: m.labelIds?.includes("IMPORTANT") ?? false,
      };
    });
}

export async function readGmail(text: string) {
  const c = readCredentialGmail(text);
  const [profile, box, important, recentItems] = await Promise.all([
    apiGoogle<{ emailAddress: string; messagesTotal: number }>(c, "/profile"),
    apiGoogle<{ messagesUnread?: number; messagesTotal?: number }>(c, "/labels/INBOX"),
    listValue(c, "in:inbox is:important is:unread", 10),
    listValue(c, "in:inbox", 15),
  ]);
  return { email: profile.emailAddress, naoLidos: box.messagesUnread ?? 0, total: profile.messagesTotal, importantes: important, recentes: recentItems };
}

export async function searchGmail(text: string, q: string) {
  return listValue(readCredentialGmail(text), q.slice(0, 300), 15);
}

function encodeHeader(v: string): string {
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`;
}

function mountMessage(to: string, subject: string, body: string): string {
  if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(to)) throw new Error("destinatario_invalido");
  const lines = [`To: ${to}`, `Subject: ${encodeHeader(subject.replace(/[\r\n]+/g, " ").slice(0, 300))}`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", Buffer.from(body.slice(0, 20000), "utf8").toString("base64")];
  return base64url(Buffer.from(lines.join("\r\n"), "utf8"));
}

export async function createDraftGmail(text: string, payload: { para?: unknown; assunto?: unknown; corpo?: unknown }) {
  const c = readCredentialGmail(text);
  const raw = mountMessage(String(payload.para ?? ""), String(payload.assunto ?? ""), String(payload.corpo ?? ""));
  const r = await apiGoogle<{ id: string }>(c, "/drafts", { message: { raw } });
  return { ok: true, id: r.id };
}

export async function sendGmail(text: string, payload: { para?: unknown; assunto?: unknown; corpo?: unknown }) {
  const c = readCredentialGmail(text);
  const raw = mountMessage(String(payload.para ?? ""), String(payload.assunto ?? ""), String(payload.corpo ?? ""));
  const r = await apiGoogle<{ id: string }>(c, "/messages/send", { raw });
  return { ok: true, id: r.id };
}
