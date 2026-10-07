import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { open, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, relative } from "node:path";
import { fileURLToPath } from "node:url";

const executar = promisify(execFile);

// ponytail: processo por consulta; manter observador Gio se medições exigirem.
const SCRIPT = String.raw`
const {Gio, GLib} = imports.gi;
const pedido = JSON.parse(ARGV[0]);
const bus = Gio.bus_get_sync(Gio.BusType.SESSION, null);
function call(name, path, iface, method, params, type) {
    return bus.call_sync(name, path, iface, method, params,
        new GLib.VariantType(type), Gio.DBusCallFlags.NO_AUTO_START, 1000, null).deep_unpack();
}
function unpack(value) {
    if (value instanceof GLib.Variant) return unpack(value.deep_unpack());
    if (Array.isArray(value)) return value.map(unpack);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, unpack(v)]));
    return value;
}
const names = call('org.freedesktop.DBus', '/org/freedesktop/DBus',
    'org.freedesktop.DBus', 'ListNames', null, '(as)')[0]
    .filter(n => n.startsWith('org.mpris.MediaPlayer2.') && (pedido.acao === 'estado' || n === pedido.player)).sort();
const players = [];
let failures = 0;
for (const name of names) {
    try {
        const owner = call('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'GetNameOwner', new GLib.Variant('(s)', [name]), '(s)')[0];
        const props = unpack(call(owner, '/org/mpris/MediaPlayer2',
            'org.freedesktop.DBus.Properties', 'GetAll',
            new GLib.Variant('(s)', ['org.mpris.MediaPlayer2.Player']), '(a{sv})')[0]);
        const meta = props.Metadata || {};
        if (typeof meta['xesam:title'] !== 'string' || !meta['xesam:title']) continue;
        players.push({name, owner, props, meta});
    } catch (error) {
        // Um player pode desaparecer entre ListNames e GetAll.
        if (!String(error).includes('ServiceUnknown') && !String(error).includes('NameHasNoOwner')) failures++;
    }
}
let player = players.find(p => p.props.PlaybackStatus === 'Playing') ||
    players.find(p => p.props.PlaybackStatus === 'Paused') || players[0];
const path = '/org/mpris/MediaPlayer2';
const iface = 'org.mpris.MediaPlayer2.Player';
const trackId = p => p.meta['mpris:trackid'];
const validTrack = id => typeof id === 'string' && /^\/(?:[A-Za-z0-9_]+(?:\/[A-Za-z0-9_]+)*)?$/.test(id) && id !== '/org/mpris/MediaPlayer2/TrackList/NoTrack';
function capabilities(p) {
    const control = p.props.CanControl === true;
    return {podeAlternar: control && (p.props.PlaybackStatus === 'Playing' ? p.props.CanPause === true : p.props.CanPlay === true),
        podeAvancar: control && p.props.CanGoNext === true, podeVoltar: control && p.props.CanGoPrevious === true,
        podeBuscar: control && p.props.CanSeek === true && validTrack(trackId(p))};
}
if (pedido.acao !== 'estado') {
    // Use o dono único exibido, nunca um player substituto após troca/encerramento.
    player = players.find(p => p.name === pedido.player && p.owner === pedido.dono);
    if (player && (trackId(player) || null) === pedido.faixaId) {
        const caps = capabilities(player);
        const methods = {alternar: [caps.podeAlternar, player.props.PlaybackStatus === 'Playing' ? 'Pause' : 'Play'],
            proxima: [caps.podeAvancar, 'Next'], anterior: [caps.podeVoltar, 'Previous'], posicao: [caps.podeBuscar, 'SetPosition']};
        const [allowed, method] = methods[pedido.acao];
        if (!allowed) throw new Error('controle_midia_sem_suporte');
        let params = null;
        if (pedido.acao === 'posicao') {
            if (typeof pedido.segundos !== 'number' || !Number.isFinite(pedido.segundos) || pedido.segundos < 0 || pedido.segundos * 1000000 > Number.MAX_SAFE_INTEGER) throw new Error('posicao_midia_invalida');
            const length = player.meta['mpris:length'];
            const position = Math.round(pedido.segundos * 1000000);
            params = new GLib.Variant('(ox)', [trackId(player), typeof length === 'number' && length > 0 ? Math.min(length, position) : position]);
        }
        call(player.owner, path, iface, method, params, '()');
        player.props = unpack(call(player.owner, path, 'org.freedesktop.DBus.Properties', 'GetAll', new GLib.Variant('(s)', [iface]), '(a{sv})')[0]);
        player.meta = player.props.Metadata || {};
    } else player = null;
}
if (!player && failures) throw new Error("midia_players_indisponiveis");
if (!player) print(JSON.stringify({sessao: false}));
else {
    const {name, owner, props, meta} = player;
    const seconds = v => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v / 1000000) : 0;
    print(JSON.stringify({sessao: true, app: name.slice('org.mpris.MediaPlayer2.'.length),
        player: name, dono: owner, faixaId: trackId(player) || null, titulo: meta['xesam:title'], artista: Array.isArray(meta['xesam:artist']) ? meta['xesam:artist'].join(', ') : '',
        tocando: props.PlaybackStatus === 'Playing', posicao: seconds(props.Position), duracao: seconds(meta['mpris:length']),
        capa: typeof meta['mpris:artUrl'] === 'string' ? meta['mpris:artUrl'] : null,
        ...capabilities(player)}));
}
`;

export type AcaoMidia = "estado" | "alternar" | "proxima" | "anterior" | "posicao";
export interface AlvoMidia { player?: string; dono?: string; faixaId?: string | null }
export async function pedirMidiaLinux(acao: AcaoMidia = "estado", segundos?: number, alvo: AlvoMidia = {}): Promise<unknown> {
  if (acao !== "estado" && (!alvo.player?.startsWith("org.mpris.MediaPlayer2.") || !alvo.dono?.startsWith(":"))) throw new Error("player_midia_invalido");
  if (acao === "posicao" && (typeof segundos !== "number" || !Number.isFinite(segundos) || segundos < 0 || segundos * 1_000_000 > Number.MAX_SAFE_INTEGER)) throw new Error("posicao_midia_invalida");
  const { stdout } = await executar("/usr/bin/gjs", ["-c", SCRIPT, JSON.stringify({ acao, segundos, ...alvo })], { timeout: 4000, maxBuffer: 1_000_000 });
  const resposta = JSON.parse(stdout);
  resposta.capa = await prepararCapaLinux(resposta.capa);
  return resposta;
}

// Somente imagens raster em pastas temporárias; nunca ler caminhos arbitrários do player.
export async function prepararCapaLinux(valor: unknown): Promise<string | null> {
  if (typeof valor !== "string" || !valor) return null;
  try {
    const url = new URL(valor);
    if (url.username || url.password) return null;
    if (["https:", "http:"].includes(url.protocol)) return /["\\\s]/.test(valor) ? null : valor;
    if (url.protocol !== "file:" || (url.hostname && url.hostname !== "localhost")) return null;
    const caminho = fileURLToPath(url);
    const arquivo = await realpath(caminho);
    // Symlinks não são necessários para capas temporárias e podem redirecionar a dados privados.
    if (arquivo !== caminho) return null;
    const temporarios = [await realpath(tmpdir())];
    if (process.env.XDG_RUNTIME_DIR) temporarios.push(await realpath(process.env.XDG_RUNTIME_DIR));
    if (!temporarios.some(pasta => {
      const trecho = relative(pasta, arquivo);
      return trecho && !isAbsolute(trecho) && trecho !== ".." && !trecho.startsWith("../");
    })) return null;
    const handle = await open(arquivo, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size < 12 || info.size > 2_000_000 || info.uid !== process.getuid?.()) return null;
      const inicio = Buffer.alloc(12);
      await handle.read(inicio, 0, 12, 0);
      const tipo = inicio.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "image/png"
        : inicio[0] === 255 && inicio[1] === 216 && inicio[2] === 255 ? "image/jpeg"
        : ["GIF87a", "GIF89a"].includes(inicio.toString("ascii", 0, 6)) ? "image/gif"
        : inicio.toString("ascii", 0, 4) === "RIFF" && inicio.toString("ascii", 8, 12) === "WEBP" ? "image/webp" : null;
      if (!tipo) return null;
      const dados = Buffer.alloc(info.size);
      const { bytesRead } = await handle.read(dados, 0, dados.length, 0);
      if (bytesRead !== dados.length) return null;
      return `data:${tipo};base64,${dados.toString("base64")}`;
    } finally { await handle.close(); }
  } catch { return null; }
}
