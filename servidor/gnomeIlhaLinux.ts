import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, lstat, mkdir, mkdtemp, writeFile, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, dirname } from "node:path";

import { integrarIlhaRuntimeLinux } from "./gnomeIlhaRuntimeLinux";

const UUID = "niko-ilha@local";
const executar = promisify(execFile);
const SCRIPT = String.raw`
const {Gio, GLib} = imports.gi;
const destino = 'org.gnome.Shell.Extensions';
const path = '/org/gnome/Shell/Extensions';
try {
    const bus = Gio.bus_get_sync(Gio.BusType.SESSION, null);
    const shell = bus.call_sync('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus',
        'NameHasOwner', new GLib.Variant('(s)', ['org.gnome.Shell']), new GLib.VariantType('(b)'),
        Gio.DBusCallFlags.NO_AUTO_START, 1000, null).deep_unpack()[0];
    if (!shell) throw new Error('sem_gnome');
    const local = (method, params, type) => bus.call_sync('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus',
        method, params, new GLib.VariantType(type), Gio.DBusCallFlags.NO_AUTO_START, 1000, null).deep_unpack()[0];
    const shellId = local('GetId', null, '(s)') + '/' + local('GetNameOwner', new GLib.Variant('(s)', ['org.gnome.Shell']), '(s)');
    const call = (iface, method, params, type) => bus.call_sync(destino, path, iface,
        method, params, new GLib.VariantType(type), Gio.DBusCallFlags.NONE, 1500, null).deep_unpack()[0];
    const unpack = dict => Object.fromEntries(Object.entries(dict).map(([k,v]) => [k, v instanceof GLib.Variant ? v.deep_unpack() : v]));
    const props = unpack(call('org.freedesktop.DBus.Properties', 'GetAll', new GLib.Variant('(s)', [destino]), '(a{sv})'));
    if (typeof props.ShellVersion !== 'string' || !props.ShellVersion) print(JSON.stringify({estado: 'aguardando'}));
    else if (props.ShellVersion.split('.')[0] !== '46') print(JSON.stringify({estado: 'incompativel'}));
    else if (props.UserExtensionsEnabled !== true) print(JSON.stringify({estado: 'bloqueada'}));
    else {
        const habilitou = ARGV[0] !== 'ativar' || call(destino, 'EnableExtension', new GLib.Variant('(s)', ['niko-ilha@local']), '(b)');
        const info = unpack(call(destino, 'GetExtensionInfo', new GLib.Variant('(s)', ['niko-ilha@local']), '(a{sv})'));
        print(JSON.stringify({estado: 'gnome', habilitou, info, shellId}));
    }
} catch (e) {
    const negado = e instanceof GLib.Error && e.matches(Gio.dbus_error_quark(), Gio.DBusError.ACCESS_DENIED);
    const ausente = /sem_gnome|Could not connect|No such file/.test(String(e));
    print(JSON.stringify({estado: ausente ? 'sem_gnome' : 'erro', motivo: negado ? 'acesso_negado' : 'falha_gnome'}));
}
`;

export type EstadoIntegracaoIlha = "sem_gnome" | "nao_instalada" | "instalar" | "habilitar" | "ativa" | "nova_sessao" | "incompativel" | "erro" | "bloqueada" | "aguardando" | "canal_gnome" | "recuperar" | "recuperada";
export interface IntegracaoIlha { estado: EstadoIntegracaoIlha; motivo?: string }
interface Caminhos { origem: string; destino: string; runtime?: boolean }
function caminhosPadrao(): Caminhos {
  const dados = process.env.XDG_DATA_HOME && isAbsolute(process.env.XDG_DATA_HOME) ? process.env.XDG_DATA_HOME : join(homedir(), ".local/share");
  return { origem: "/usr/share/niko/gnome/niko-ilha-runtime@local", destino: join(dados, "gnome-shell/extensions", "niko-ilha-runtime@local"), runtime: true };
}
async function consultar(ativar = false) {
  try {
    const { stdout } = await executar("/usr/bin/gjs", ["-c", SCRIPT, ativar ? "ativar" : "estado"], { timeout: 10000, maxBuffer: 100_000 });
    return JSON.parse(stdout) as { estado: string; motivo?: string; habilitou?: boolean; shellId?: string; info?: { state?: number; version?: number } };
  } catch { return { estado: "erro", motivo: "dependencias_ausentes" }; }
}
async function arquivos(pasta: string) {
  const info = await lstat(pasta);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("caminho_inseguro");
  const arquivos = await Promise.all(["metadata.json", "extension.js"].map(async nome => {
    const caminho = join(pasta, nome);
    const info = await lstat(caminho);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("caminho_inseguro");
    return readFile(caminho, "utf8");
  }));
  return { metadata: arquivos[0], codigo: arquivos[1] };
}
async function estado(acao: "estado" | "instalar", caminhos: Caminhos): Promise<IntegracaoIlha> {
  let gnome = await consultar();
  if (gnome.estado !== "gnome") return gnome as IntegracaoIlha;
  let fonte;
  try { fonte = await arquivos(caminhos.origem); }
  catch { return { estado: "nao_instalada" }; }
  const metadata = JSON.parse(fonte.metadata);
  if (metadata.uuid !== UUID || !metadata["shell-version"]?.includes("46") || !Number.isInteger(metadata.version) || metadata.version < 1) return { estado: "incompativel" };
  const base = dirname(dirname(caminhos.destino));
  const parent = dirname(caminhos.destino);
  for (const pasta of [base, parent, join(base, "niko-backups-extensao")]) {
    try {
      const info = await lstat(pasta);
      if (!info.isDirectory() || info.isSymbolicLink()) return { estado: "erro", motivo: "caminho_inseguro" };
    } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  }
  let instalada;
  try { instalada = await arquivos(caminhos.destino); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") return { estado: "erro", motivo: "caminho_inseguro" };
  }
  const igual = instalada?.metadata === fonte.metadata && instalada?.codigo === fonte.codigo;
  const codigoEmCache = instalada && instalada.codigo !== fonte.codigo && [1, 2].includes(gnome.info?.state ?? 0);
  const shellAnterior = gnome.shellId;
  if (!igual && acao === "estado") return { estado: "instalar" };
  if (!igual) {
    await mkdir(base, { recursive: true, mode: 0o700 });
    await mkdir(dirname(caminhos.destino), { recursive: true, mode: 0o700 });
    const temporaria = await mkdtemp(join(base, ".niko-instalar-"));
    let backup: string | undefined;
    try {
      await writeFile(join(temporaria, "metadata.json"), fonte.metadata, { mode: 0o600 });
      await writeFile(join(temporaria, "extension.js"), fonte.codigo, { mode: 0o600 });
      if (codigoEmCache) await writeFile(join(temporaria, "niko-pendente.json"), JSON.stringify({ shellId: shellAnterior }), { mode: 0o600 });
      try {
        await lstat(caminhos.destino);
        const backups = join(base, "niko-backups-extensao");
        await mkdir(backups, { recursive: true, mode: 0o700 });
        backup = join(backups, `niko-${Date.now()}-${process.pid}`);
        await rename(caminhos.destino, backup);
      } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
      try { await rename(temporaria, caminhos.destino); }
      catch (e) { if (backup) await rename(backup, caminhos.destino); throw e; }
    } finally { await rm(temporaria, { recursive: true, force: true }); }
  }
  if (acao === "instalar" && (!igual || gnome.info?.state !== 1)) gnome = await consultar(true);
  if (gnome.estado !== "gnome") return gnome as IntegracaoIlha;
  if (codigoEmCache && gnome.shellId !== shellAnterior) {
    const temporario = join(caminhos.destino, "niko-pendente.tmp");
    await writeFile(temporario, JSON.stringify({ shellId: gnome.shellId }), { flag: "wx", mode: 0o600 });
    await rename(temporario, join(caminhos.destino, "niko-pendente.json"));
  }
  if (gnome.info?.state === 3) return { estado: "erro" };
  if (gnome.info?.state === 4) return { estado: "incompativel" };
  try {
    const arquivo = join(caminhos.destino, "niko-pendente.json");
    const info = await lstat(arquivo);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 1024) return { estado: "erro", motivo: "caminho_inseguro" };
    if (JSON.parse(await readFile(arquivo, "utf8")).shellId === gnome.shellId) return { estado: "nova_sessao" };
  } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  if (!gnome.info?.version || gnome.info.version !== metadata.version || gnome.info.state === 99) return { estado: "nova_sessao" };
  if (gnome.habilitou === false) return { estado: "erro", motivo: "habilitacao_negada" };
  const estados: Record<number, EstadoIntegracaoIlha> = { 1: "ativa", 2: "habilitar", 3: "erro", 4: "incompativel", 6: "habilitar", 7: "aguardando", 8: "aguardando" };
  return { estado: estados[gnome.info.state ?? 0] ?? "erro" };
}

let instalacao: Promise<unknown> = Promise.resolve();
export function integrarIlhaLinux(acao: "estado" | "instalar", caminhos = caminhosPadrao()): Promise<IntegracaoIlha> {
  if (process.platform !== "linux") return Promise.resolve({ estado: "sem_gnome" });
  if (acao !== "estado" && acao !== "instalar") return Promise.reject(new Error("acao_invalida"));
  const atual = instalacao.catch(() => undefined).then(async () => {
    if (!caminhos.runtime) return estado(acao, caminhos);
    const resultado = await integrarIlhaRuntimeLinux(acao, caminhos);
    // Sem carregador reconhecido, atualizar somente a extensão local existente.
    // O GNOME mantém código em cache: estado() preserva backup e sinaliza nova sessão.
    if (resultado.estado === "canal_gnome" && !resultado.motivo) {
      const legado = { origem: join(dirname(caminhos.origem), UUID), destino: join(dirname(caminhos.destino), UUID) };
      try { await lstat(legado.destino); }
      catch (erro) {
        if ((erro as NodeJS.ErrnoException).code === "ENOENT") return resultado;
        throw erro;
      }
      return estado(acao, legado);
    }
    return resultado;
  }).catch((): IntegracaoIlha => ({ estado: "erro", motivo: "falha_instalacao" }));
  instalacao = atual;
  return atual;
}
