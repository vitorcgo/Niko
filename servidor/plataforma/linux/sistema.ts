import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import os from "node:os";
import type { AparelhoBluetooth, Bateria, Computador, EstadoDoSistema, GrupoDeProcessos, Plataforma, Radio, WifiAtual } from "../tipos.ts";
import { esperar, lerArquivo, primeiraQueAbre, rodar, tentar } from "./comum.ts";
import { janelas } from "./janelas.ts";

const ENERGIA = "/sys/class/power_supply";
const LUZ_DA_TELA = "/sys/class/backlight";
const CHASSIS_PORTATEIS = [8, 9, 10, 11, 12, 14, 18, 21, 30, 31, 32];

function campos(linha: string): string[] {
  const saida: string[] = [];
  let atual = "";
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === "\\" && i + 1 < linha.length) {
      atual += linha[++i];
      continue;
    }
    if (c === ":") {
      saida.push(atual);
      atual = "";
      continue;
    }
    atual += c;
  }
  saida.push(atual);
  return saida;
}

const linhasDe = (texto: string) => texto.split("\n").filter((l) => l.trim() !== "");
const arredondar = (valor: number, casas = 1) => Math.round(valor * 10 ** casas) / 10 ** casas;

function baterias(): string[] {
  try {
    return readdirSync(ENERGIA)
      .map((nome) => join(ENERGIA, nome))
      .filter((pasta) => lerArquivo(join(pasta, "type")) === "Battery" && lerArquivo(join(pasta, "scope")) !== "Device");
  } catch {
    return [];
  }
}

function bateria(): Bateria | null {
  const pasta = baterias()[0];
  if (!pasta) return null;
  const nivel = Number(lerArquivo(join(pasta, "capacity")));
  if (!Number.isFinite(nivel)) return null;
  const status = lerArquivo(join(pasta, "status")) ?? "";
  let minutos: number | null = null;
  if (status === "Discharging") {
    const energia = Number(lerArquivo(join(pasta, "energy_now")));
    const potencia = Number(lerArquivo(join(pasta, "power_now")));
    const carga = Number(lerArquivo(join(pasta, "charge_now")));
    const corrente = Number(lerArquivo(join(pasta, "current_now")));
    const horas = energia > 0 && potencia > 0 ? energia / potencia : carga > 0 && corrente > 0 ? carga / corrente : 0;
    if (horas > 0 && horas < 100) minutos = Math.round(horas * 60);
  }
  return { nivel: Math.round(nivel), carregando: ["Charging", "Full", "Not charging"].includes(status), minutos };
}

function luzDaTela(): { nome: string; atual: number; max: number } | null {
  let nomes: string[];
  try {
    nomes = readdirSync(LUZ_DA_TELA);
  } catch {
    return null;
  }
  const prioridade = (nome: string) => {
    const i = ["raw", "platform", "firmware"].indexOf(lerArquivo(join(LUZ_DA_TELA, nome, "type")) ?? "");
    return i < 0 ? 9 : i;
  };
  for (const nome of [...nomes].sort((a, b) => prioridade(a) - prioridade(b))) {
    const atual = Number(lerArquivo(join(LUZ_DA_TELA, nome, "brightness")));
    const max = Number(lerArquivo(join(LUZ_DA_TELA, nome, "max_brightness")));
    if (max > 0 && Number.isFinite(atual)) return { nome, atual, max };
  }
  return null;
}

function brilhoAtual(): number | null {
  const luz = luzDaTela();
  return luz ? Math.round((luz.atual / luz.max) * 100) : null;
}

async function dispositivos(): Promise<{ nome: string; tipo: string; estado: string }[]> {
  const saida = await tentar(rodar("nmcli", ["-t", "-f", "DEVICE,TYPE,STATE", "device"]), "");
  return linhasDe(saida).map((linha) => {
    const [nome = "", tipo = "", estado = ""] = campos(linha);
    return { nome, tipo, estado };
  });
}

async function wifiAtual(lista?: { nome: string; tipo: string; estado: string }[]): Promise<WifiAtual> {
  const dispositivo = (lista ?? (await dispositivos())).find((d) => d.tipo === "wifi");
  const atual: WifiAtual = { ssid: null, sinal: null, conectado: dispositivo?.estado === "connected", existe: dispositivo !== undefined };
  if (!atual.conectado) return atual;
  const redes = await tentar(rodar("nmcli", ["-t", "-f", "ACTIVE,SSID,SIGNAL", "device", "wifi", "list", "--rescan", "no"]), "");
  const ativa = linhasDe(redes).map(campos).find((c) => c[0] === "yes");
  if (ativa) {
    atual.ssid = ativa[1] || null;
    atual.sinal = Number(ativa[2]) || 0;
  }
  return atual;
}

async function conexao(lista: { tipo: string; estado: string }[]): Promise<EstadoDoSistema["conexao"]> {
  const cabo = lista.some((d) => d.tipo === "ethernet" && d.estado === "connected");
  const estado = (await tentar(rodar("nmcli", ["networking", "connectivity"]), "")).trim();
  return { cabo, internet: estado === "full" ? true : estado === "none" || estado === "limited" || estado === "portal" ? false : null };
}

async function perfisSalvos(): Promise<Set<string>> {
  const saida = await tentar(rodar("nmcli", ["-t", "-f", "NAME,TYPE", "connection", "show"]), "");
  return new Set(
    linhasDe(saida)
      .map(campos)
      .filter((c) => c[1] === "802-11-wireless")
      .map((c) => c[0] ?? ""),
  );
}

async function radios(): Promise<Partial<Record<Radio, boolean>>> {
  const saida: Partial<Record<Radio, boolean>> = {};
  const [wifi, bluetooth] = await Promise.all([tentar(rodar("nmcli", ["radio", "wifi"]), ""), tentar(rodar("bluetoothctl", ["show"]), "")]);
  if (wifi.trim()) saida.WiFi = wifi.trim() === "enabled";
  if (/Powered:/.test(bluetooth)) saida.Bluetooth = /Powered:\s*yes/.test(bluetooth);
  return saida;
}

async function aparelhosBluetooth(): Promise<AparelhoBluetooth[]> {
  let saida = await tentar(rodar("bluetoothctl", ["devices", "Paired"]), "");
  if (!/^Device\s/m.test(saida)) saida = await tentar(rodar("bluetoothctl", ["paired-devices"]), "");
  const itens = linhasDe(saida)
    .map((linha) => /^Device\s+([0-9A-Fa-f:]{17})\s+(.*)$/.exec(linha.trim()))
    .filter((m): m is RegExpExecArray => m !== null);
  const lista = await Promise.all(
    itens.map(async (m) => {
      const conectado = /Connected:\s*yes/.test(await tentar(rodar("bluetoothctl", ["info", m[1] ?? ""]), ""));
      return { id: m[1] ?? "", nome: m[2] ?? "", ativo: conectado, conectado };
    }),
  );
  return lista.sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome));
}

let estadoEmCache: { quando: number; dados: Promise<EstadoDoSistema> } | null = null;

function estado(): Promise<EstadoDoSistema> {
  if (!estadoEmCache || Date.now() - estadoEmCache.quando > 2000) {
    const dados = dispositivos().then(async (lista) => {
      const [wifi, radiosAtuais, rede] = await Promise.all([wifiAtual(lista), radios(), conexao(lista)]);
      return { bateria: bateria(), brilho: brilhoAtual(), wifi, radios: radiosAtuais, conexao: rede };
    });
    estadoEmCache = { quando: Date.now(), dados };
    dados.catch(() => (estadoEmCache = null));
  }
  return estadoEmCache.dados;
}

async function usoDaCpu(): Promise<number> {
  const ler = () =>
    os.cpus().reduce(
      (soma, cpu) => {
        const t = cpu.times;
        soma.total += t.user + t.nice + t.sys + t.idle + t.irq;
        soma.ocioso += t.idle;
        return soma;
      },
      { total: 0, ocioso: 0 },
    );
  const antes = ler();
  await esperar(300);
  const depois = ler();
  const total = depois.total - antes.total;
  return total > 0 ? Math.round((1 - (depois.ocioso - antes.ocioso) / total) * 100) : 0;
}

function memoria(): { total: number; livre: number } {
  const texto = lerArquivo("/proc/meminfo") ?? "";
  const kb = (chave: string) => Number(new RegExp(`^${chave}:\\s+(\\d+)`, "m").exec(texto)?.[1] ?? 0);
  return { total: kb("MemTotal"), livre: kb("MemAvailable") };
}

function nomeDoSistema(): string {
  const bonito = /^PRETTY_NAME="?([^"\n]*)"?/m.exec(lerArquivo("/etc/os-release") ?? "")?.[1] ?? "Linux";
  return `${bonito} (kernel ${os.release()})`;
}

function modeloDoComputador(fabricante: string): string {
  const nome = lerArquivo("/sys/class/dmi/id/product_name") ?? "";
  const versao = lerArquivo("/sys/class/dmi/id/product_version") ?? "";
  if (/lenovo/i.test(fabricante) && versao && !/^(none|n\/a|not |default|to be)/i.test(versao)) return versao;
  return nome;
}

async function placasDeVideo(): Promise<string[]> {
  const saida = await tentar(rodar("lspci", ["-mm"]), "");
  const placas: string[] = [];
  for (const linha of linhasDe(saida)) {
    const partes = [...linha.matchAll(/"([^"]*)"/g)].map((m) => m[1] ?? "");
    if (partes.length >= 3 && /VGA|3D|Display/i.test(partes[0] ?? "")) placas.push(`${partes[1]} ${partes[2]}`.trim());
  }
  return placas;
}

async function discos(): Promise<Computador["discos"]> {
  const saida = await tentar(rodar("df", ["-B1", "--output=source,target,size,avail", "-x", "tmpfs", "-x", "devtmpfs", "-x", "squashfs", "-x", "overlay", "-x", "efivarfs"]), "");
  const vistos = new Set<string>();
  const lista: Computador["discos"] = [];
  for (const linha of linhasDe(saida).slice(1)) {
    const m = /^(\S+)\s+(.+?)\s+(\d+)\s+(\d+)$/.exec(linha.trim());
    const origem = m?.[1] ?? "";
    if (!m || !origem.startsWith("/dev/") || vistos.has(origem)) continue;
    vistos.add(origem);
    lista.push({ unidade: m[2] ?? "", nome: basename(origem), total_gb: arredondar(Number(m[3]) / 2 ** 30), livre_gb: arredondar(Number(m[4]) / 2 ** 30) });
  }
  return lista;
}

async function processos(): Promise<{ total: number; porMemoria: GrupoDeProcessos[]; porCpu: GrupoDeProcessos[] }> {
  const saida = await tentar(rodar("ps", ["-eo", "comm=,rss=,cputimes="]), "");
  const grupos = new Map<string, GrupoDeProcessos>();
  let total = 0;
  for (const linha of linhasDe(saida)) {
    const partes = linha.trim().split(/\s+/);
    const cpu = Number(partes.pop());
    const rss = Number(partes.pop());
    const nome = partes.join(" ");
    if (!nome || !Number.isFinite(rss) || rss <= 0) continue;
    total++;
    const grupo = grupos.get(nome) ?? { nome, processos: 0, memoria_mb: 0, cpu_segundos: 0 };
    grupo.processos++;
    grupo.memoria_mb += rss / 1024;
    grupo.cpu_segundos += Number.isFinite(cpu) ? cpu : 0;
    grupos.set(nome, grupo);
  }
  const todos = [...grupos.values()].map((g) => ({ ...g, memoria_mb: Math.round(g.memoria_mb), cpu_segundos: Math.round(g.cpu_segundos) }));
  return {
    total,
    porMemoria: [...todos].sort((a, b) => b.memoria_mb - a.memoria_mb).slice(0, 12),
    porCpu: [...todos].sort((a, b) => b.cpu_segundos - a.cpu_segundos).slice(0, 8),
  };
}

function enderecos(): Computador["ips"] {
  const lista: Computador["ips"] = [];
  for (const [nome, itens] of Object.entries(os.networkInterfaces())) {
    for (const item of itens ?? []) {
      if (item.family === "IPv4" && !item.internal && !item.address.startsWith("169.254.")) lista.push({ interface: nome, ip: item.address });
    }
  }
  return lista;
}

async function computador(): Promise<Computador> {
  const fabricante = lerArquivo("/sys/class/dmi/id/sys_vendor") ?? "";
  const mem = memoria();
  const cpus = os.cpus();
  const [uso, placas, listaDeDiscos, procs, abertas, wifi, aparelhos] = await Promise.all([usoDaCpu(), placasDeVideo(), discos(), processos(), janelas.listar(), wifiAtual(), aparelhosBluetooth()]);
  return {
    nome: os.hostname(),
    sistema: nomeDoSistema(),
    fabricante,
    modelo: modeloDoComputador(fabricante),
    processador: cpus[0]?.model ?? "",
    nucleos: cpus.length,
    uso_cpu_pct: uso,
    memoria_total_gb: arredondar(mem.total / 1048576),
    memoria_livre_gb: arredondar(mem.livre / 1048576),
    placa_de_video: placas,
    ligado_ha_horas: arredondar(os.uptime() / 3600),
    discos: listaDeDiscos,
    bateria: bateria(),
    wifi,
    ips: enderecos(),
    bluetooth: aparelhos.map((a) => ({ nome: a.nome, conectado: a.conectado })),
    programas_mais_memoria: procs.porMemoria,
    programas_mais_cpu_acumulada: procs.porCpu,
    janelas_abertas: abertas.janelas.slice(0, 30).map((j) => ({ programa: j.app, titulo: j.titulo })),
    total_processos: procs.total,
  };
}

async function conectar(ssid: string, senha: string) {
  if (ssid.startsWith("-")) throw new Error("valor_invalido");
  const jaSalva = (await perfisSalvos()).has(ssid);
  const entrada = senha ? `${senha}\n` : "";
  try {
    if (jaSalva) await rodar("nmcli", ["--ask", "--wait", "20", "connection", "up", "id", ssid], 30000, entrada);
    else await rodar("nmcli", ["--ask", "--wait", "20", "device", "wifi", "connect", ssid], 30000, entrada);
  } catch {
    if (!jaSalva) await tentar(rodar("nmcli", ["connection", "delete", "id", ssid]), "");
  }
  estadoEmCache = null;
  return { ok: true, wifi: await wifiAtual() };
}

async function radio(tipo: Radio, ligado: boolean) {
  if (!(tipo in (await radios()))) throw new Error("radio_ausente");
  if (tipo === "WiFi") await rodar("nmcli", ["radio", "wifi", ligado ? "on" : "off"]);
  else if (ligado) {
    await tentar(rodar("rfkill", ["unblock", "bluetooth"]), "");
    await rodar("bluetoothctl", ["power", "on"]);
  } else await rodar("bluetoothctl", ["power", "off"]);
  await esperar(800);
  estadoEmCache = null;
  return { ok: true, radios: await radios() };
}

async function brilho(nivel: number) {
  const luz = luzDaTela();
  if (!luz) throw new Error("brilho_indisponivel");
  const alvo = Math.max(1, Math.round((luz.max * nivel) / 100));
  await rodar("busctl", ["call", "org.freedesktop.login1", "/org/freedesktop/login1/session/auto", "org.freedesktop.login1.Session", "SetBrightness", "ssu", "backlight", luz.nome, String(alvo)]);
  estadoEmCache = null;
  return { ok: true, brilho: nivel };
}

export const sistema: Plataforma["sistema"] = {
  async tipo() {
    const temBateria = baterias().length > 0;
    return { notebook: temBateria || CHASSIS_PORTATEIS.includes(Number(lerArquivo("/sys/class/dmi/id/chassis_type"))), bateria: temBateria };
  },
  estado,
  async redes() {
    const [lista, conhecidas] = await Promise.all([rodar("nmcli", ["-t", "-f", "SSID,SIGNAL,SECURITY", "device", "wifi", "list", "--rescan", "auto"], 25000), perfisSalvos()]);
    const mapa = new Map<string, { ssid: string; sinal: number; segura: boolean; salva: boolean }>();
    for (const linha of linhasDe(lista)) {
      const [ssid = "", sinalTexto = "0", seguranca = ""] = campos(linha);
      if (!ssid) continue;
      const sinal = Number(sinalTexto) || 0;
      const anterior = mapa.get(ssid);
      if (!anterior || sinal > anterior.sinal) mapa.set(ssid, { ssid, sinal, segura: seguranca !== "" && seguranca !== "--", salva: conhecidas.has(ssid) });
    }
    return { redes: [...mapa.values()].sort((a, b) => b.sinal - a.sinal) };
  },
  conectar,
  async esquecer(ssid) {
    if (ssid.startsWith("-")) throw new Error("valor_invalido");
    await tentar(rodar("nmcli", ["connection", "delete", "id", ssid]), "");
    return { ok: true };
  },
  async desconectar() {
    const dispositivo = (await dispositivos()).find((d) => d.tipo === "wifi");
    if (dispositivo) await tentar(rodar("nmcli", ["device", "disconnect", dispositivo.nome]), "");
    estadoEmCache = null;
    return { ok: true };
  },
  brilho,
  radio,
  bluetooth: async () => ({ aparelhos: await aparelhosBluetooth() }),
  computador,
  async configuracoes(pagina) {
    const gnome = { bluetooth: "bluetooth", wifi: "wifi", rede: "network", bateria: "power" }[pagina];
    const kde = { bluetooth: "kcm_bluetooth", wifi: "kcm_networkmanagement", rede: "kcm_networkmanagement", bateria: "kcm_powerdevilprofilesconfig" }[pagina];
    if (!(await primeiraQueAbre([["gnome-control-center", [gnome]], ["systemsettings", [kde]]]))) throw new Error("configuracoes_indisponiveis");
    return { ok: true };
  },
  encerrar: () => {
    estadoEmCache = null;
  },
};
