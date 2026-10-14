import { readlinkSync } from "node:fs";
import type { ComandoDoSistema, EstadoDoAudio, Fluxo, Plataforma, PontaDeAudio } from "../tipos.ts";
import { abrirApp, appDaJanela, iconesDeApps, listarApps } from "./apps.ts";
import { esperar, funcionou, iconeDoApp, lerArquivo, primeiraQueAbre, rodar, tentar } from "./comum.ts";
import { janelas } from "./janelas.ts";

const PONTAS: Record<Fluxo, string> = { 0: "@DEFAULT_AUDIO_SINK@", 1: "@DEFAULT_AUDIO_SOURCE@" };
const ID_SEM_PROCESSO = 4_000_000_000;
const INTERFACE_GNOME = "org.gnome.desktop.interface";
const SHELL_DO_GNOME = ["call", "--session", "--dest", "org.gnome.Shell", "--object-path", "/org/gnome/Shell"];

const COMANDOS: Record<ComandoDoSistema, [string, string[]][]> = {
  rede: [["gnome-control-center", ["network"]], ["systemsettings", ["kcm_networkmanagement"]]],
  wifi: [["gnome-control-center", ["wifi"]], ["systemsettings", ["kcm_networkmanagement"]]],
  bluetooth: [["gnome-control-center", ["bluetooth"]], ["systemsettings", ["kcm_bluetooth"]]],
  som: [["gnome-control-center", ["sound"]], ["systemsettings", ["kcm_pulseaudio"]]],
  tela: [["gnome-control-center", ["display"]], ["systemsettings", ["kcm_kscreen"]]],
  configuracoes: [["gnome-control-center", []], ["systemsettings", []]],
  atualizacoes: [["gnome-software", ["--mode=updates"]], ["plasma-discover", ["--mode", "update"]], ["gnome-control-center", []]],
  tarefas: [["gnome-system-monitor", []], ["plasma-systemmonitor", []], ["ksysguard", []]],
  adaptadores: [["gnome-control-center", ["network"]], ["nm-connection-editor", []]],
  terminal: [["kgx", []], ["ptyxis", []], ["gnome-terminal", []], ["konsole", []], ["x-terminal-emulator", []]],
  arquivos: [["nautilus", []], ["dolphin", []], ["xdg-open", [process.env.HOME ?? "/"]]],
  painel: [["gnome-control-center", []], ["systemsettings", []]],
};

interface EntradaDeAudio {
  index: number;
  mute?: boolean;
  corked?: boolean;
  volume?: Record<string, { value_percent?: string }>;
  properties?: Record<string, string>;
}

async function pontaDeAudio(fluxo: Fluxo): Promise<PontaDeAudio | null> {
  const saida = await tentar(rodar("wpctl", ["get-volume", PONTAS[fluxo]]), "");
  const m = /Volume:\s*([\d.]+)/.exec(saida);
  if (!m) return null;
  return { volume: Math.max(0, Math.min(100, Math.round(Number(m[1]) * 100))), mudo: /\[MUTED\]/.test(saida) };
}

async function entradasDeAudio(): Promise<EntradaDeAudio[]> {
  const saida = await tentar(rodar("pactl", ["--format=json", "list", "sink-inputs"]), "[]");
  try {
    const lista = JSON.parse(saida) as unknown;
    return Array.isArray(lista) ? (lista as EntradaDeAudio[]) : [];
  } catch {
    return [];
  }
}

function idDaSessao(e: EntradaDeAudio): number {
  const pid = Number(e.properties?.["application.process.id"]);
  return Number.isInteger(pid) && pid > 0 ? pid : ID_SEM_PROCESSO + e.index;
}

function volumeDaEntrada(e: EntradaDeAudio): number {
  const primeiro = Object.values(e.volume ?? {})[0];
  const n = parseInt(primeiro?.value_percent ?? "0", 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
}

function executavel(pid: number): string | null {
  try {
    return readlinkSync(`/proc/${pid}/exe`);
  } catch {
    return null;
  }
}

async function audio(): Promise<EstadoDoAudio> {
  const [saida, entrada, entradas] = await Promise.all([pontaDeAudio(0), pontaDeAudio(1), entradasDeAudio()]);
  const sessoes = entradas.map((e) => {
    const propriedades = e.properties ?? {};
    const pid = idDaSessao(e);
    return {
      pid,
      sistema: false,
      ativa: e.corked !== true,
      volume: volumeDaEntrada(e),
      mudo: e.mute === true,
      nome: propriedades["application.name"] ?? propriedades["application.process.binary"] ?? propriedades["media.name"] ?? "",
      caminho: pid < ID_SEM_PROCESSO ? executavel(pid) : null,
      icone: iconeDoApp(propriedades["application.icon_name"] ?? propriedades["application.process.binary"]),
    };
  });
  return { saida, entrada, sessoes };
}

async function tema(): Promise<{ escuro: boolean }> {
  const esquema = await tentar(rodar("gsettings", ["get", INTERFACE_GNOME, "color-scheme"]), "");
  return { escuro: esquema.includes("prefer-dark") };
}

async function definirTema(escuro: boolean) {
  await rodar("gsettings", ["set", INTERFACE_GNOME, "color-scheme", escuro ? "'prefer-dark'" : "'default'"]).catch(() => {
    throw new Error("tema_indisponivel");
  });
  const atual = (await tentar(rodar("gsettings", ["get", INTERFACE_GNOME, "gtk-theme"]), "")).trim().replace(/'/g, "");
  if (atual === "Adwaita" || atual === "Adwaita-dark") await tentar(rodar("gsettings", ["set", INTERFACE_GNOME, "gtk-theme", escuro ? "'Adwaita-dark'" : "'Adwaita'"]), "");
  return tema();
}

async function visaoGeralAberta(): Promise<boolean> {
  const saida = await tentar(rodar("gdbus", [...SHELL_DO_GNOME, "--method", "org.freedesktop.DBus.Properties.Get", "org.gnome.Shell", "OverviewActive"]), "");
  return /<true>/.test(saida);
}

function definirVisaoGeral(aberta: boolean): Promise<boolean> {
  return funcionou(rodar("gdbus", [...SHELL_DO_GNOME, "--method", "org.freedesktop.DBus.Properties.Set", "org.gnome.Shell", "OverviewActive", aberta ? "<true>" : "<false>"]));
}

async function alternarIniciar(abertoAntes?: boolean) {
  const aberta = abertoAntes === true || (await visaoGeralAberta());
  const ok = aberta ? await definirVisaoGeral(false) : (await definirVisaoGeral(true)) || (await funcionou(rodar("gdbus", ["call", "--session", "--dest", "org.kde.plasmashell", "--object-path", "/PlasmaShell", "--method", "org.kde.PlasmaShell.activateLauncherMenu"])));
  if (!ok) throw new Error("ferramenta_indisponivel");
  await esperar(150);
  return { ok: true, aberto: await visaoGeralAberta() };
}

const ferramenta: Plataforma["controle"]["ferramenta"] = async (nome, abertoAntes) => {
  if (nome === "iniciar") return alternarIniciar(abertoAntes);
  if (nome === "captura") {
    const abriu = await primeiraQueAbre([
      ["gnome-screenshot", ["-i"]],
      ["spectacle", ["-r"]],
      ["flameshot", ["gui"]],
    ]);
    if (!abriu) {
      await rodar("gdbus", ["call", "--session", "--dest", "org.freedesktop.portal.Desktop", "--object-path", "/org/freedesktop/portal/desktop", "--method", "org.freedesktop.portal.Screenshot.Screenshot", "", "{'interactive': <true>}"]).catch(() => {
        throw new Error("ferramenta_indisponivel");
      });
    }
    return { ok: true };
  }
  if (nome === "teclado") {
    if (!(await primeiraQueAbre([["onboard", []]]))) {
      await rodar("gsettings", ["set", "org.gnome.desktop.a11y.applications", "screen-keyboard-enabled", "true"]).catch(() => {
        throw new Error("ferramenta_indisponivel");
      });
    }
    return { ok: true };
  }
  if (!(await primeiraQueAbre([["gnome-control-center", ["background"]], ["systemsettings", ["kcm_wallpaper"]]]))) throw new Error("ferramenta_indisponivel");
  return { ok: true };
};

const energia: Plataforma["controle"]["energia"] = async (tipo) => {
  const comandos: Record<typeof tipo, [string, string[]]> = {
    bloquear: ["loginctl", ["lock-session"]],
    suspender: ["systemctl", ["suspend"]],
    reiniciar: ["systemctl", ["reboot"]],
    desligar: ["systemctl", ["poweroff"]],
  };
  const [programa, argumentos] = comandos[tipo];
  try {
    await rodar(programa, argumentos, 15000);
  } catch {
    if (tipo !== "bloquear") throw new Error("falha_energia");
    await rodar("xdg-screensaver", ["lock"]).catch(() => {
      throw new Error("falha_energia");
    });
  }
  return { ok: true };
};

const donoDaConexao: Plataforma["controle"]["donoDaConexao"] = async (portaLocal, portaRemota) => {
  const saida = await tentar(rodar("ss", ["-Htnp", "state", "established", "(", "sport", "=", `:${portaLocal}`, "and", "dport", "=", `:${portaRemota}`, ")"], 5000), "");
  const pid = Number(/pid=(\d+)/.exec(saida)?.[1]);
  return Number.isInteger(pid) && pid > 0 ? pid : 0;
};

function processoPai(pid: number): number {
  const estado = lerArquivo(`/proc/${pid}/stat`) ?? "";
  const fim = estado.lastIndexOf(")");
  return fim < 0 ? 0 : Number(estado.slice(fim + 2).split(" ")[1]) || 0;
}

const focarProcesso: Plataforma["controle"]["focarProcesso"] = async (pid) => {
  const { janelas: lista } = await janelas.listar();
  let atual = pid;
  for (let nivel = 0; nivel < 10 && atual > 1; nivel++) {
    const janela = lista.find((j) => j.pid === atual);
    if (janela && (await janelas.agir("focar", janela.id)).ok) return { ok: true, janela: janela.app };
    atual = processoPai(atual);
  }
  throw new Error("sem_janela");
};

const semBandeja = () => Promise.reject(new Error("app_desconhecido"));

export const controle: Plataforma["controle"] = {
  audio,
  volume: async (fluxo, valor) => ({ ok: await funcionou(rodar("wpctl", ["set-volume", PONTAS[fluxo], `${valor}%`])) }),
  mudo: async (fluxo, mudo) => ({ ok: await funcionou(rodar("wpctl", ["set-mute", PONTAS[fluxo], mudo ? "1" : "0"])) }),
  async sessao(pids, volume, mudo) {
    const alvos = new Set(pids);
    let ajustadas = 0;
    for (const e of await entradasDeAudio()) {
      if (!alvos.has(idDaSessao(e))) continue;
      if (volume >= 0) await tentar(rodar("pactl", ["set-sink-input-volume", String(e.index), `${volume}%`]), "");
      if (mudo >= 0) await tentar(rodar("pactl", ["set-sink-input-mute", String(e.index), String(mudo)]), "");
      ajustadas++;
    }
    return { ajustadas };
  },
  tema,
  definirTema,
  iniciarAberto: async () => ({ aberto: await visaoGeralAberta() }),
  ferramenta,
  energia,
  bandeja: async () => ({ itens: [] }),
  abrirDaBandeja: semBandeja,
  pastaDaBandeja: semBandeja,
  encerrarDaBandeja: semBandeja,
  apps: listarApps,
  iconesDeApps,
  abrirApp,
  appDaJanela,
  async comandoDoSistema(comando) {
    if (!(await primeiraQueAbre(COMANDOS[comando]))) throw new Error("ferramenta_indisponivel");
    return { ok: true };
  },
  donoDaConexao,
  focarProcesso,
  encerrar: () => undefined,
};
