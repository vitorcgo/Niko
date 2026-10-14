import { readlinkSync } from "node:fs";
import type { JanelaAberta, Plataforma } from "../tipos.ts";
import { acharAppDaJanela } from "./apps.ts";
import { funcionou, iconeDoApp, lerArquivo, rodar } from "./comum.ts";

const DESTINO_DA_EXTENSAO = "org.gnome.Shell";
const CAMINHO_DA_EXTENSAO = "/org/gnome/Shell/Extensions/Windows";
const INTERFACE_DA_EXTENSAO = "org.gnome.Shell.Extensions.Windows";
const ESPERA_SEM_EXTENSAO_MS = 15_000;
const VALIDADE_DA_LISTA_MS = 700;
const LIMITE_MS = 5000;

interface JanelaBruta {
  id: number;
  pid: number;
  classe: string;
  titulo: string;
  ativa: boolean;
  minimizada: boolean;
}

interface ItemDaExtensao {
  id?: number;
  pid?: number;
  wm_class?: string;
  wm_class_instance?: string;
  title?: string;
  window_type?: number;
  focus?: boolean;
  minimized?: boolean;
}

type Fonte = "extensao" | "x11";

let fonte: Fonte = "x11";
let extensaoIndisponivelAte = 0;
let ultimaFrente: { fonte: Fonte; id: number } | null = null;
let emCache: { quando: number; dados: Promise<{ janelas: JanelaAberta[] }> } | null = null;
const titulosEmCache = new Map<number, { titulo: string; quando: number }>();

function chamarExtensao(metodo: string, id?: number): Promise<string> {
  const argumentos = ["--user", "--json=short", "call", DESTINO_DA_EXTENSAO, CAMINHO_DA_EXTENSAO, INTERFACE_DA_EXTENSAO, metodo];
  if (id !== undefined) argumentos.push("u", String(id));
  return rodar("busctl", argumentos, LIMITE_MS);
}

async function textoDaExtensao(metodo: string, id?: number): Promise<string> {
  const resposta = JSON.parse(await chamarExtensao(metodo, id)) as { data?: unknown[] };
  const texto = resposta.data?.[0];
  if (typeof texto !== "string") throw new Error("resposta_invalida");
  return texto;
}

async function tituloDaJanela(id: number): Promise<string> {
  const agora = Date.now();
  const guardado = titulosEmCache.get(id);
  if (guardado && agora - guardado.quando < 3000) return guardado.titulo;
  const titulo = await textoDaExtensao("GetTitle", id).catch(() => "");
  titulosEmCache.set(id, { titulo, quando: agora });
  if (titulosEmCache.size > 200) for (const [chave, v] of titulosEmCache) if (agora - v.quando > 30_000) titulosEmCache.delete(chave);
  return titulo;
}

async function janelasDaExtensao(): Promise<JanelaBruta[]> {
  const itens = JSON.parse(await textoDaExtensao("List")) as ItemDaExtensao[];
  const normais = itens.filter((i) => typeof i.id === "number" && (i.window_type === undefined || i.window_type === 0));
  return Promise.all(
    normais.map(async (i) => ({
      id: i.id as number,
      pid: Number(i.pid) || 0,
      classe: i.wm_class || i.wm_class_instance || "",
      titulo: (typeof i.title === "string" && i.title) || (await tituloDaJanela(i.id as number)) || i.wm_class || "",
      ativa: i.focus === true,
      minimizada: i.minimized === true,
    })),
  );
}

async function janelasDoX11(): Promise<JanelaBruta[]> {
  const [saida, raiz] = await Promise.all([rodar("wmctrl", ["-lpx"], LIMITE_MS), rodar("xprop", ["-root", "_NET_ACTIVE_WINDOW"], LIMITE_MS).catch(() => "")]);
  const ativa = /0x([0-9a-f]+)/i.exec(raiz);
  const idAtiva = ativa ? parseInt(ativa[1] ?? "0", 16) : 0;
  const brutas: Omit<JanelaBruta, "ativa" | "minimizada">[] = [];
  for (const linha of saida.split("\n")) {
    const m = /^(0x[0-9a-f]+)\s+(-?\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s*(.*)$/i.exec(linha);
    if (!m || m[2] === "-1") continue;
    const titulo = (m[6] ?? "").trim();
    if (!titulo) continue;
    brutas.push({ id: parseInt(m[1] ?? "0", 16), pid: Number(m[3]), classe: m[4] ?? "", titulo });
  }
  const minimizadas = await Promise.all(brutas.map((j) => rodar("xprop", ["-id", `0x${j.id.toString(16)}`, "_NET_WM_STATE"], LIMITE_MS).then((s) => s.includes("_NET_WM_STATE_HIDDEN"), () => false)));
  return brutas.map((j, i) => ({ ...j, ativa: j.id === idAtiva, minimizada: minimizadas[i] ?? false }));
}

async function coletar(): Promise<JanelaBruta[]> {
  if (Date.now() >= extensaoIndisponivelAte) {
    try {
      const lista = await janelasDaExtensao();
      fonte = "extensao";
      return lista;
    } catch {
      extensaoIndisponivelAte = Date.now() + ESPERA_SEM_EXTENSAO_MS;
    }
  }
  fonte = "x11";
  return janelasDoX11();
}

function executavel(pid: number): string | null {
  if (pid <= 0) return null;
  try {
    return readlinkSync(`/proc/${pid}/exe`);
  } catch {
    return null;
  }
}

async function montarLista(): Promise<{ janelas: JanelaAberta[] }> {
  const brutas = await coletar();
  const programas = new Map(brutas.map((j) => [j.id, j.pid > 0 ? (lerArquivo(`/proc/${j.pid}/comm`) ?? "") : ""]));
  const emFoco = brutas.find((j) => j.ativa && !j.minimizada);
  const focoNoNiko = emFoco !== undefined && programas.get(emFoco.id) === "niko";
  if (emFoco && !focoNoNiko) ultimaFrente = { fonte, id: emFoco.id };
  const idFrente = focoNoNiko ? (ultimaFrente?.fonte === fonte ? ultimaFrente.id : 0) : (emFoco?.id ?? 0);
  const janelas = brutas.flatMap((j): JanelaAberta[] => {
    const programa = programas.get(j.id) ?? "";
    if (programa === "niko") return [];
    const app = acharAppDaJanela(j.classe, programa);
    return [{ id: String(j.id), pid: j.pid, titulo: j.titulo, minimizada: j.minimizada, ativa: j.id === idFrente && !j.minimizada, app: programa || j.classe, nome: app?.nome ?? (programa || j.classe), caminho: executavel(j.pid), icone: app ? iconeDoApp(app.icone) : null }];
  });
  return { janelas };
}

function listar(): Promise<{ janelas: JanelaAberta[] }> {
  if (!emCache || Date.now() - emCache.quando > VALIDADE_DA_LISTA_MS) {
    const dados = montarLista();
    emCache = { quando: Date.now(), dados };
    dados.catch(() => (emCache = null));
  }
  return emCache.dados.catch(() => ({ janelas: [] }));
}

async function agir(acao: "focar" | "minimizar" | "fechar", janela: string): Promise<{ ok: boolean }> {
  const id = Number(janela);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("janela_invalida");
  emCache = null;
  if (fonte === "extensao") {
    const metodo = { focar: "Activate", minimizar: "Minimize", fechar: "Close" }[acao];
    return { ok: await funcionou(chamarExtensao(metodo, id)) };
  }
  const hex = `0x${id.toString(16)}`;
  if (acao === "focar") return { ok: await funcionou(rodar("wmctrl", ["-i", "-a", hex], LIMITE_MS)) };
  if (acao === "fechar") return { ok: await funcionou(rodar("wmctrl", ["-i", "-c", hex], LIMITE_MS)) };
  const ok = (await funcionou(rodar("xdotool", ["windowminimize", String(id)], LIMITE_MS))) || (await funcionou(rodar("wmctrl", ["-i", "-r", hex, "-b", "add,hidden"], LIMITE_MS)));
  return { ok };
}

export const janelas: Plataforma["janelas"] = {
  listar,
  agir,
  encerrar: () => {
    emCache = null;
  },
};
