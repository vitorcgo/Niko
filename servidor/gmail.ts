import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";

const ESCOPOS = ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose"];
const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface CredencialGmail {
  clienteId: string;
  segredo: string;
  refresh?: string;
}

function base64url(b: Buffer): string {
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function abrirNoNavegador(url: string, falhou: (e: Error) => void) {
  if (process.platform === "linux") {
    const filho = spawn("/usr/bin/gio", ["open", url], { detached: true, stdio: "ignore" });
    filho.on("error", () => falhou(new Error("navegador_indisponivel")));
    filho.on("exit", codigo => { if (codigo !== 0) falhou(new Error("navegador_indisponivel")); });
    filho.unref();
    return;
  }
  if (process.platform !== "win32") throw new Error("somente_windows");
  const filho = spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], { detached: true, stdio: "ignore", windowsHide: true });
  filho.on("error", () => undefined);
  filho.unref();
}

export function lerCredencialGmail(texto: string): CredencialGmail {
  const c = JSON.parse(texto) as CredencialGmail;
  if (!c.clienteId || !c.segredo) throw new Error("credencial_invalida");
  return c;
}

export async function autorizarGmail(clienteId: string, segredo: string, sinal?: AbortSignal): Promise<CredencialGmail> {
  if (!/\.apps\.googleusercontent\.com$/.test(clienteId)) throw new Error("cliente_id_invalido");
  sinal?.throwIfAborted();
  const verificador = base64url(randomBytes(48));
  const desafio = base64url(createHash("sha256").update(verificador).digest());
  const estado = base64url(randomBytes(16));
  const { codigo, redirecionamento } = await new Promise<{ codigo: string; redirecionamento: string }>((resolver, rejeitar) => {
    const servidor = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const codigoRecebido = url.searchParams.get("code");
      const estadoConfere = url.searchParams.get("state") === estado;
      if (url.pathname !== "/" || !estadoConfere || (!codigoRecebido && !url.searchParams.get("error"))) {
        res.writeHead(404);
        res.end();
        return;
      }
      const ok = Boolean(codigoRecebido);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><meta charset="utf-8"><title>Niko</title><body style="font-family:system-ui;padding:40px;background:#0e0e10;color:#f1f2f4"><h2>${ok ? "Gmail conectado." : "Não deu certo."}</h2><p>${ok ? "Pode fechar esta aba e voltar ao Niko." : "Volte ao Niko e tente de novo."}</p></body>`);
      sinal?.removeEventListener("abort", cancelar);
      clearTimeout(relogio);
      servidor.close();
      if (ok) resolver({ codigo: codigoRecebido!, redirecionamento: `http://127.0.0.1:${(servidor.address() as AddressInfo | null)?.port ?? porta}` });
      else rejeitar(new Error(url.searchParams.get("error") ?? "autorizacao_negada"));
    });
    let porta = 0;
    const cancelar = () => { clearTimeout(relogio); servidor.close(); sinal?.removeEventListener("abort", cancelar); rejeitar(new Error("autorizacao_cancelada")); };
    sinal?.addEventListener("abort", cancelar, {once: true});
    const relogio = setTimeout(() => {
      servidor.close();
      sinal?.removeEventListener("abort", cancelar);
      rejeitar(new Error("tempo_esgotado"));
    }, 180000);
    servidor.listen(0, "127.0.0.1", () => {
      porta = (servidor.address() as AddressInfo).port;
      const parametros = new URLSearchParams({
        client_id: clienteId,
        redirect_uri: `http://127.0.0.1:${porta}`,
        response_type: "code",
        scope: ESCOPOS.join(" "),
        code_challenge: desafio,
        code_challenge_method: "S256",
        access_type: "offline",
        prompt: "consent",
        state: estado,
      });
      try {
        abrirNoNavegador(`https://accounts.google.com/o/oauth2/v2/auth?${parametros}`, erro => {
          sinal?.removeEventListener("abort", cancelar); clearTimeout(relogio); servidor.close(); rejeitar(erro);
        });
      } catch (e) {
        sinal?.removeEventListener("abort", cancelar);
        clearTimeout(relogio);
        servidor.close();
        rejeitar(e as Error);
      }
    });
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code: codigo, client_id: clienteId, client_secret: segredo, redirect_uri: redirecionamento, grant_type: "authorization_code", code_verifier: verificador }),
    signal: AbortSignal.timeout(15000),
  });
  const json = (await r.json()) as { refresh_token?: string; access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!r.ok || !json.refresh_token) throw new Error(json.error_description ?? json.error ?? `http_${r.status}`);
  if (json.access_token) acessos.set(clienteId, { token: json.access_token, expira: Date.now() + (json.expires_in ?? 3000) * 1000 - 60000 });
  return { clienteId, segredo, refresh: json.refresh_token };
}

const acessos = new Map<string, { token: string; expira: number }>();
const renovacoesEmAndamento = new Map<string, Promise<string>>();

function tokenDeAcesso(c: CredencialGmail): Promise<string> {
  const guardado = acessos.get(c.clienteId);
  if (guardado && guardado.expira > Date.now()) return Promise.resolve(guardado.token);
  const emAndamento = renovacoesEmAndamento.get(c.clienteId);
  if (emAndamento) return emAndamento;
  const renovacao = renovarToken(c).finally(() => renovacoesEmAndamento.delete(c.clienteId));
  renovacoesEmAndamento.set(c.clienteId, renovacao);
  return renovacao;
}

async function renovarToken(c: CredencialGmail): Promise<string> {
  if (!c.refresh) throw new Error("sem_autorizacao");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.clienteId, client_secret: c.segredo, refresh_token: c.refresh, grant_type: "refresh_token" }),
    signal: AbortSignal.timeout(15000),
  });
  const json = (await r.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!r.ok || !json.access_token) throw new Error(json.error === "invalid_grant" ? "autorizacao_expirada" : json.error ?? `http_${r.status}`);
  acessos.set(c.clienteId, { token: json.access_token, expira: Date.now() + (json.expires_in ?? 3000) * 1000 - 60000 });
  return json.access_token;
}

async function api<T>(c: CredencialGmail, caminho: string, corpo?: unknown): Promise<T> {
  const token = await tokenDeAcesso(c);
  const r = await fetch(`${BASE}${caminho}`, {
    method: corpo === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${token}`, ...(corpo === undefined ? {} : { "content-type": "application/json" }) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`http_${r.status} ${(await r.text().catch(() => "")).slice(0, 160)}`);
  return (await r.json()) as T;
}

interface Cabecalho {
  name: string;
  value: string;
}

export interface EmailResumo {
  id: string;
  de: string;
  assunto: string;
  trecho: string;
  data: string;
  naoLido: boolean;
  importante: boolean;
}

async function listar(c: CredencialGmail, q: string, maximo: number): Promise<EmailResumo[]> {
  const lista = await api<{ messages?: { id: string }[] }>(c, `/messages?maxResults=${maximo}&q=${encodeURIComponent(q)}`);
  const itens = await Promise.all(
    (lista.messages ?? []).map((m) =>
      api<{ id: string; snippet: string; labelIds?: string[]; internalDate: string; payload?: { headers?: Cabecalho[] } }>(c, `/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`).catch(() => null),
    ),
  );
  return itens
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

export async function lerGmail(texto: string) {
  const c = lerCredencialGmail(texto);
  const [perfil, caixa, importantes, recentes] = await Promise.all([
    api<{ emailAddress: string; messagesTotal: number }>(c, "/profile"),
    api<{ messagesUnread?: number; messagesTotal?: number }>(c, "/labels/INBOX"),
    listar(c, "in:inbox is:important is:unread", 10),
    listar(c, "in:inbox", 15),
  ]);
  return { email: perfil.emailAddress, naoLidos: caixa.messagesUnread ?? 0, total: perfil.messagesTotal, importantes, recentes };
}

export async function buscarGmail(texto: string, q: string) {
  return listar(lerCredencialGmail(texto), q.slice(0, 300), 15);
}

function codificarCabecalho(v: string): string {
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`;
}

function montarMensagem(para: string, assunto: string, corpo: string): string {
  if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(para)) throw new Error("destinatario_invalido");
  const linhas = [`To: ${para}`, `Subject: ${codificarCabecalho(assunto.replace(/[\r\n]+/g, " ").slice(0, 300))}`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", Buffer.from(corpo.slice(0, 20000), "utf8").toString("base64")];
  return base64url(Buffer.from(linhas.join("\r\n"), "utf8"));
}

export async function criarRascunhoGmail(texto: string, dados: { para?: unknown; assunto?: unknown; corpo?: unknown }) {
  const c = lerCredencialGmail(texto);
  const raw = montarMensagem(String(dados.para ?? ""), String(dados.assunto ?? ""), String(dados.corpo ?? ""));
  const r = await api<{ id: string }>(c, "/drafts", { message: { raw } });
  return { ok: true, id: r.id };
}

export async function enviarGmail(texto: string, dados: { para?: unknown; assunto?: unknown; corpo?: unknown }) {
  const c = lerCredencialGmail(texto);
  const raw = montarMensagem(String(dados.para ?? ""), String(dados.assunto ?? ""), String(dados.corpo ?? ""));
  const r = await api<{ id: string }>(c, "/messages/send", { raw });
  return { ok: true, id: r.id };
}
