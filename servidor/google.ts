import { apiGoogle, autorizarGoogle, lerCredencialGmail, lerGmail, type CredencialGmail } from "./gmail.ts";
import { resumoDaAgenda } from "./agendaGoogle.ts";

export const ESCOPOS_WORKSPACE = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/tasks.readonly",
];

const BASE_DRIVE = "https://www.googleapis.com/drive/v3";
const BASE_TAREFAS = "https://tasks.googleapis.com/tasks/v1";

function clienteDoNiko() {
  const id = (process.env.NIKO_GOOGLE_CLIENTE_ID ?? "").trim();
  const segredo = (process.env.NIKO_GOOGLE_SEGREDO ?? "").trim();
  return /\.apps\.googleusercontent\.com$/.test(id) && segredo ? { id, segredo } : null;
}

export function temClienteDoNiko() {
  return clienteDoNiko() !== null;
}

export function autorizarWorkspace(clienteId: string, segredo: string): Promise<CredencialGmail> {
  const proprio = clienteDoNiko();
  if (!clienteId && proprio) return autorizarGoogle(proprio.id, proprio.segredo, ESCOPOS_WORKSPACE, "Google Workspace");
  return autorizarGoogle(clienteId, segredo, ESCOPOS_WORKSPACE, "Google Workspace");
}

export interface ArquivoDrive {
  id: string;
  nome: string;
  tipo: string;
  alterado: string;
  link?: string;
}

export interface TarefaGoogle {
  id: string;
  titulo: string;
  lista: string;
  prazo?: string;
  link?: string;
}

const TIPOS_DO_DRIVE: Record<string, string> = {
  "application/vnd.google-apps.document": "documento",
  "application/vnd.google-apps.spreadsheet": "planilha",
  "application/vnd.google-apps.presentation": "apresentacao",
  "application/vnd.google-apps.form": "formulario",
  "application/vnd.google-apps.folder": "pasta",
  "application/pdf": "pdf",
};

function tipoDoArquivo(mime: string): string {
  if (TIPOS_DO_DRIVE[mime]) return TIPOS_DO_DRIVE[mime];
  if (mime.startsWith("image/")) return "imagem";
  if (mime.startsWith("video/")) return "video";
  return "arquivo";
}

function linkSeguro(link: string | undefined, prefixos: string[]): string | undefined {
  return link && prefixos.some((p) => link.startsWith(p)) ? link : undefined;
}

async function arquivosRecentes(c: CredencialGmail): Promise<ArquivoDrive[]> {
  const parametros = new URLSearchParams({
    orderBy: "modifiedTime desc",
    pageSize: "20",
    q: "trashed = false",
    fields: "files(id,name,mimeType,modifiedTime,webViewLink)",
  });
  const r = await apiGoogle<{ files?: { id: string; name: string; mimeType: string; modifiedTime: string; webViewLink?: string }[] }>(c, `/files?${parametros}`, undefined, BASE_DRIVE);
  return (r.files ?? []).map((f) => ({
    id: f.id,
    nome: f.name.slice(0, 160),
    tipo: tipoDoArquivo(f.mimeType),
    alterado: f.modifiedTime,
    link: linkSeguro(f.webViewLink, ["https://docs.google.com/", "https://drive.google.com/"]),
  }));
}

async function tarefasAbertas(c: CredencialGmail): Promise<TarefaGoogle[]> {
  const listas = await apiGoogle<{ items?: { id: string; title: string }[] }>(c, "/users/@me/lists?maxResults=20", undefined, BASE_TAREFAS);
  const porLista = await Promise.all(
    (listas.items ?? []).slice(0, 10).map(async (l) => {
      const r = await apiGoogle<{ items?: { id: string; title?: string; due?: string; status?: string; webViewLink?: string }[] }>(c, `/lists/${encodeURIComponent(l.id)}/tasks?showCompleted=false&maxResults=50`, undefined, BASE_TAREFAS);
      return (r.items ?? [])
        .filter((t) => t.status !== "completed" && (t.title ?? "").trim())
        .map((t) => ({ id: t.id, titulo: (t.title ?? "").trim().slice(0, 160), lista: l.title, prazo: t.due?.slice(0, 10), link: linkSeguro(t.webViewLink, ["https://tasks.google.com/", "https://mail.google.com/"]) }));
    }),
  );
  return porLista.flat().sort((a, b) => (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999")).slice(0, 60);
}

function motivo(r: PromiseSettledResult<unknown>): string | undefined {
  if (r.status === "fulfilled") return undefined;
  const m = (r.reason as Error)?.message ?? "";
  if (/SERVICE_DISABLED|accessNotConfigured|has not been used|_api_desativada/i.test(m)) return "api_desativada";
  if (/insufficient|ACCESS_TOKEN_SCOPE_INSUFFICIENT|_sem_permissao/i.test(m)) return "sem_permissao";
  return "falhou";
}

export async function lerGoogle(texto: string) {
  const c = lerCredencialGmail(texto);
  const [gmail, agenda, drive, tarefas] = await Promise.allSettled([lerGmail(texto), resumoDaAgenda(texto), arquivosRecentes(c), tarefasAbertas(c)]);
  if ([gmail, agenda, drive, tarefas].every((r) => r.status === "rejected")) throw (gmail as PromiseRejectedResult).reason;
  return {
    email: gmail.status === "fulfilled" ? gmail.value.email : "",
    gmail: gmail.status === "fulfilled" ? gmail.value : null,
    agenda: agenda.status === "fulfilled" ? agenda.value : null,
    drive: drive.status === "fulfilled" ? drive.value : null,
    tarefas: tarefas.status === "fulfilled" ? tarefas.value : null,
    falhas: { gmail: motivo(gmail), agenda: motivo(agenda), drive: motivo(drive), tarefas: motivo(tarefas) },
  };
}
