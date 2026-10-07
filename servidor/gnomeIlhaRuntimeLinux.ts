import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {createHash, randomUUID} from "node:crypto";
import {lstat, readFile, writeFile, rename, link, unlink} from "node:fs/promises";
import {dirname, join} from "node:path";
import type {IntegracaoIlha} from "./gnomeIlhaLinux";

const UUID = "niko-ilha-runtime@local";
const exec = promisify(execFile);
const SCRIPT = String.raw`
const {Gio, GLib} = imports.gi;
const bus = Gio.bus_get_sync(Gio.BusType.SESSION, null);
const call = (dest, path, iface, method, params, type) => bus.call_sync(dest, path, iface, method, params,
    new GLib.VariantType(type), Gio.DBusCallFlags.NO_AUTO_START, 1500, null).deep_unpack()[0];
const dbus = (method, value, type) => call('org.freedesktop.DBus', '/org/freedesktop/DBus',
    'org.freedesktop.DBus', method, new GLib.Variant('(s)', [value]), type);
const unpack = values => Object.fromEntries(Object.entries(values).map(([key,value]) => [key,value.deep_unpack()]));
try {
    if (!dbus('NameHasOwner', 'org.gnome.Shell', '(b)')) { print(JSON.stringify({estado:'sem_gnome'})); }
    else {
        const owner = dbus('GetNameOwner', 'org.gnome.Shell', '(s)');
        const busId = call('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'GetId', null, '(s)');
        if (ARGV[3] && ARGV[3] !== busId) throw new Error('bus_alterado');
        if (ARGV[2] && ARGV[2] !== owner) throw new Error('shell_alterado');
        // API Extensions nativa do Shell: evita ciclo de vida do serviço proxy de preferências.
        const native = (method, uuid) => call(owner, '/org/gnome/Shell', 'org.gnome.Shell.Extensions',
            method, new GLib.Variant('(s)', [uuid]), method.endsWith('Extension') ? '(b)' : '(a{sv})');
        const props = unpack(call(owner, '/org/gnome/Shell', 'org.freedesktop.DBus.Properties', 'GetAll',
            new GLib.Variant('(s)', ['org.gnome.Shell.Extensions']), '(a{sv})'));
        if (props.ShellVersion?.split('.')[0] !== '46') print(JSON.stringify({estado:'incompativel'}));
        else if (props.UserExtensionsEnabled !== true) print(JSON.stringify({estado:'bloqueada'}));
        else {
            if (ARGV[0] === 'enable' || ARGV[0] === 'disable') {
                const uuid = ARGV[1];
                if (!['niko-ilha-runtime@local', 'niko-ilha@local'].includes(uuid)) throw new Error('uuid_invalido');
                if (!native(ARGV[0] === 'enable' ? 'EnableExtension' : 'DisableExtension', uuid)) throw new Error('operacao_negada');
            }
            const info = unpack(native('GetExtensionInfo', 'niko-ilha-runtime@local'));
            const legacy = unpack(native('GetExtensionInfo', 'niko-ilha@local'));
            let runtime = null;
            if (dbus('NameHasOwner', 'com.niko.Ilha.Integracao', '(b)')) {
                if (dbus('GetNameOwner', 'com.niko.Ilha.Integracao', '(s)') !== owner) throw new Error('owner_invalido');
                runtime = unpack(call(owner, '/com/niko/Ilha/Integracao', 'org.freedesktop.DBus.Properties', 'GetAll',
                    new GLib.Variant('(s)', ['com.niko.Ilha.Integracao']), '(a{sv})'));
            }
            if (dbus('GetNameOwner', 'org.gnome.Shell', '(s)') !== owner) throw new Error('shell_alterado');
            print(JSON.stringify({estado:'gnome', owner, busId, info, legacy, runtime}));
        }
    }
} catch (error) { print(JSON.stringify({estado:'erro', motivo:String(error).includes('owner_invalido') ? 'owner_invalido' : 'falha_gnome'})); }
`;
interface Snapshot {
  estado: string; motivo?: string; owner?: string; busId?: string;
  info?: {state?: number}; legacy?: {state?: number};
  runtime?: {State?: string; Revision?: string; LastError?: string};
}
async function query(action = "state", uuid = UUID, expectedOwner = "", expectedBus = ""): Promise<Snapshot> {
  try {
    const {stdout} = await exec("/usr/bin/gjs", ["-c", SCRIPT, action, uuid, expectedOwner, expectedBus], {timeout: 10000, maxBuffer: 100_000});
    return JSON.parse(stdout);
  } catch { return {estado: "erro", motivo: "dependencias_ausentes"}; }
}
async function read(path: string, limit: number) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > limit) throw new Error("caminho_inseguro");
  const contents = await readFile(path, "utf8");
  if (Buffer.byteLength(contents) > limit) throw new Error("caminho_inseguro");
  return contents;
}
async function directories(path: string) {
  for (const current of [path, dirname(path), dirname(dirname(path))]) {
    const info = await lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("caminho_inseguro");
  }
}
async function atomic(path: string, contents: string, exclusive = false) {
  const temp = path + `.niko-${randomUUID()}.tmp`;
  try {
    await writeFile(temp, contents, {flag: "wx", mode: 0o600});
    if (exclusive) await link(temp, path);
    else await rename(temp, path);
  }
  finally { await unlink(temp).catch(error => { if (error.code !== "ENOENT") throw error; }); }
}
async function wait(owner: string, check: (snapshot: Snapshot) => boolean, busId?: string) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const snapshot = await query();
    if (snapshot.estado !== "gnome" || snapshot.owner !== owner || (busId !== undefined && snapshot.busId !== busId)) throw new Error("shell_alterado");
    if (check(snapshot)) return snapshot;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("timeout_integracao");
}

interface Journal {pid: number; busId: string; owner: string; previous: string; bootstrapHash: string; legacyActive: boolean; runtimeActive: boolean}
const hash = (contents: string) => createHash("sha256").update(contents).digest("hex");
async function restore(journal: Journal, destination: string) {
  const snapshot = await query();
  if (snapshot.estado !== "gnome" || snapshot.owner !== journal.owner || snapshot.busId !== journal.busId) throw new Error("shell_alterado");
  if (hash(await read(join(destination, "extension.js"), 128 * 1024)) !== journal.bootstrapHash) throw new Error("carregador_alterado");
  const file = JSON.parse(journal.previous).file;
  if (typeof file !== "string" || !/^implementation-[a-f0-9]{64}\.js$/.test(file) ||
      `implementation-${hash(await read(join(destination, file), 128 * 1024))}.js` !== file) throw new Error("backup_invalido");
  let restored = true;
  try {
    await query("disable", UUID, journal.owner, journal.busId);
    await wait(journal.owner, state => state.info?.state === 2 && !state.runtime, journal.busId);
    await atomic(join(destination, "current.json"), journal.previous);
    if (journal.runtimeActive && !journal.legacyActive) {
      await query("enable", UUID, journal.owner, journal.busId);
      await wait(journal.owner, state => state.runtime?.State === "active" && state.runtime.Revision === file, journal.busId);
    }
  } catch { restored = false; }
  if (journal.legacyActive) {
    try {
      await query("disable", UUID, journal.owner, journal.busId);
      await wait(journal.owner, state => state.info?.state === 2 && !state.runtime, journal.busId);
      await query("enable", "niko-ilha@local", journal.owner, journal.busId);
      await wait(journal.owner, state => state.legacy?.state === 1, journal.busId);
    } catch { restored = false; }
  }
  if (!restored) throw new Error("falha_rollback");
}

export async function integrarIlhaRuntimeLinux(action: "estado" | "instalar", paths: {origem: string; destino: string}): Promise<IntegracaoIlha> {
  const snapshot = await query();
  if (snapshot.estado !== "gnome") return snapshot as IntegracaoIlha;
  if (!snapshot.info?.state || snapshot.info.state === 99) return {estado: "canal_gnome"};
  await directories(paths.destino);
  const journalPath = join(paths.destino, "niko-update-journal.json");
  let pending: string | undefined;
  try { pending = await read(journalPath, 4096); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (pending !== undefined) {
    if (action === "estado") return {estado: "recuperar", motivo: "recuperacao_pendente"};
    try {
      const journal: Journal = JSON.parse(pending);
      if (!Number.isSafeInteger(journal.pid) || journal.pid < 1 || typeof journal.owner !== "string" || !/^:[0-9]+\.[0-9]+$/.test(journal.owner) ||
          typeof journal.previous !== "string" || Buffer.byteLength(journal.previous) > 1024 ||
          typeof journal.busId !== "string" || !/^[a-f0-9]{32}$/.test(journal.busId) ||
          typeof journal.bootstrapHash !== "string" || !/^[a-f0-9]{64}$/.test(journal.bootstrapHash) ||
          typeof journal.legacyActive !== "boolean" || typeof journal.runtimeActive !== "boolean") throw new Error("journal_invalido");
      if (journal.pid !== process.pid) {
        try { process.kill(journal.pid, 0); return {estado: "erro", motivo: "atualizacao_em_andamento"}; }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") return {estado: "erro", motivo: "atualizacao_em_andamento"}; }
      }
      if (journal.owner !== snapshot.owner || journal.busId !== snapshot.busId) return {estado: "erro", motivo: "recuperacao_contexto_alterado"};
      await restore(journal, paths.destino);
      await unlink(journalPath);
      return {estado: "recuperada"};
    } catch { return {estado: "erro", motivo: "falha_recuperacao"}; }
  }
  if (snapshot.info.state === 3) return {estado: "erro", motivo: "falha_extensao"};
  if (snapshot.info.state === 4) return {estado: "incompativel"};
  await directories(paths.origem);
  const metadata = JSON.parse(await read(join(paths.origem, "metadata.json"), 8192));
  const installedMetadata = JSON.parse(await read(join(paths.destino, "metadata.json"), 8192));
  if ([metadata, installedMetadata].some(value => value.uuid !== UUID ||
      !Array.isArray(value["shell-version"]) || !value["shell-version"].includes("46"))) return {estado: "incompativel"};
  const code = await read(join(paths.origem, "extension.js"), 128 * 1024);
  // O canal GNOME atribui metadata.version; a compatibilidade do bootstrap depende do código.
  if (code !== await read(join(paths.destino, "extension.js"), 128 * 1024))
    return {estado: "canal_gnome", motivo: "carregador_diferente"};
  const manifest = await read(join(paths.origem, "current.json"), 1024);
  const file = JSON.parse(manifest).file;
  if (typeof file !== "string" || !/^implementation-[a-f0-9]{64}\.js$/.test(file)) throw new Error("manifesto_invalido");
  const payload = await read(join(paths.origem, file), 128 * 1024);
  if (`implementation-${createHash("sha256").update(payload).digest("hex")}.js` !== file) throw new Error("hash_invalido");
  const currentPath = join(paths.destino, "current.json");
  const previous = await read(currentPath, 1024);
  const sameManifest = manifest === previous;
  const active = snapshot.runtime?.State === "active" && snapshot.runtime.Revision === file && snapshot.info.state === 1;
  if (action === "estado") return {estado: active && sameManifest && snapshot.legacy?.state !== 1 ? "ativa" : sameManifest ? "habilitar" : "instalar"};
  if (active && sameManifest && snapshot.legacy?.state !== 1) return {estado: "ativa"};
  const owner = snapshot.owner!;
  const legacyActive = snapshot.legacy?.state === 1;
  const runtimeActive = snapshot.info.state === 1;
  const journal: Journal = {pid: process.pid, busId: snapshot.busId!, owner, previous, bootstrapHash: hash(code), legacyActive, runtimeActive};
  const previousFile = JSON.parse(previous).file;
  if (typeof previousFile !== "string" || !/^implementation-[a-f0-9]{64}\.js$/.test(previousFile) ||
      `implementation-${hash(await read(join(paths.destino, previousFile), 128 * 1024))}.js` !== previousFile) throw new Error("backup_invalido");
  await atomic(journalPath, JSON.stringify(journal), true);
  try {
    if (legacyActive) {
      await query("disable", "niko-ilha@local", owner, journal.busId);
      await wait(owner, state => state.legacy?.state === 2, journal.busId);
    }
    if (snapshot.info.state === 1) {
      await query("disable", UUID, journal.owner, journal.busId);
      await wait(owner, state => state.info?.state === 2 && !state.runtime, journal.busId);
    }
    try { await atomic(join(paths.destino, file), payload, true); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || await read(join(paths.destino, file), 128 * 1024) !== payload) throw error;
    }
    await atomic(join(paths.destino, "niko-current-backup.json"), previous);
    await atomic(currentPath, manifest);
    await query("enable", UUID, journal.owner, journal.busId);
    await wait(owner, state => state.info?.state === 1 && state.runtime?.State === "active" && state.runtime.Revision === file, journal.busId);
    await unlink(journalPath);
    return {estado: "ativa"};
  } catch {
    try {
      await restore(journal, paths.destino);
      await unlink(journalPath);
      return {estado: "erro", motivo: "atualizacao_revertida"};
    } catch { return {estado: "erro", motivo: "falha_rollback"}; }
  }
}
