import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync, writeFileSync, readFileSync, symlinkSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {createServer} from 'vite';

const FAKE = `
const {Gio, GLib} = imports.gi;
const [name, initialStatus, art, mode, log] = ARGV;
let status = initialStatus;
let position = 12500000;
let xml = '<node><interface name="org.mpris.MediaPlayer2.Player"><method name="Play"/><method name="Pause"/><method name="Next"/><method name="Previous"/><method name="SetPosition"><arg type="o" direction="in"/><arg type="x" direction="in"/></method><property name="CanControl" type="b" access="read"/><property name="CanPlay" type="b" access="read"/><property name="CanPause" type="b" access="read"/><property name="PlaybackStatus" type="s" access="read"/><property name="Metadata" type="a{sv}" access="read"/><property name="Position" type="x" access="read"/><property name="CanGoNext" type="b" access="read"/><property name="CanGoPrevious" type="b" access="read"/><property name="CanSeek" type="b" access="read"/></interface></node>';
if (mode === 'missingCapability') xml = xml.replace('<property name="CanGoNext" type="b" access="read"/>', '');
const player = Gio.DBusExportedObject.wrapJSObject(xml, {
    Play() { status = 'Playing'; GLib.file_set_contents(log, 'Play'); },
    PauseAsync(_params, invocation) {
        if (mode === 'denied') { invocation.return_dbus_error('org.freedesktop.DBus.Error.AccessDenied', 'test permission denied'); return; }
        if (mode === 'slow') return;
        if (mode === 'die') { GLib.file_set_contents(log, 'exited-during-command'); loop.quit(); return; }
        status = 'Paused'; GLib.file_set_contents(log, 'Pause'); invocation.return_value(new GLib.Variant('()', []));
    },
    Next() { GLib.file_set_contents(log, 'Next'); }, Previous() { GLib.file_set_contents(log, 'Previous'); },
    SetPosition(id, value) { position = value; GLib.file_set_contents(log, id + ':' + value); },
    get CanControl() { return mode !== 'readonly'; }, get CanPlay() { return true; }, get CanPause() { return mode !== 'noPause'; },
    get PlaybackStatus() { return status; },
    get Metadata() { return {...(mode === 'noTrack' ? {} : {'mpris:trackid': new GLib.Variant('o', '/track/test')}), 'xesam:title': new GLib.Variant('s', 'Faixa ' + name), 'xesam:artist': new GLib.Variant('as', ['Artista A', 'Artista B']), 'xesam:album': new GLib.Variant('s', 'Álbum teste'), 'mpris:length': new GLib.Variant('x', 125500000), 'mpris:artUrl': new GLib.Variant('s', art)}; },
    get Position() { return position; },
    get CanGoNext() { return mode !== 'noNext'; }, get CanGoPrevious() { return mode !== 'noPrevious'; }, get CanSeek() { return mode !== 'noSeek'; },
});
const loop = new GLib.MainLoop(null, false);
Gio.bus_own_name(Gio.BusType.SESSION, 'org.mpris.MediaPlayer2.' + name, Gio.BusNameOwnerFlags.NONE,
    bus => { if (status !== 'Broken') player.export(bus, '/org/mpris/MediaPlayer2'); }, () => print('READY'), () => { printerr('NAME LOST'); loop.quit(); });
loop.run();
`;

if (!process.env.NIKO_MPRIS_TEST_BUS) {
  test('MPRIS genérico em D-Bus privado', {timeout: 60000}, async t => {
    const filho = spawn('dbus-run-session', ['--', process.execPath, fileURLToPath(import.meta.url)], {
      env: Object.fromEntries(Object.entries({...process.env, NIKO_MPRIS_TEST_BUS: '1', NIKO_MPRIS_PARENT_BUS: process.env.DBUS_SESSION_BUS_ADDRESS || 'absent', GIO_USE_VFS: 'local'}).filter(([key]) => key !== 'NODE_TEST_CONTEXT')), stdio: ['ignore', 'pipe', 'pipe'],
    });
    t.after(() => { if (filho.exitCode === null && filho.signalCode === null) filho.kill('SIGTERM'); });
    let log = '';
    filho.stdout.on('data', d => { log += d; });
    filho.stderr.on('data', d => { log += d; });
    const [codigo] = await once(filho, 'exit');
    assert.equal(codigo, 0, log);
    console.log(log.trim());
  });
} else {
  assert.ok(process.env.NIKO_MPRIS_PARENT_BUS, 'não aceitar marcador de teste sem salvaguarda do bus pai');
  assert.notEqual(process.env.DBUS_SESSION_BUS_ADDRESS, process.env.NIKO_MPRIS_PARENT_BUS, 'não usar bus herdado da sessão');
  assert.match(process.env.DBUS_SESSION_BUS_ADDRESS || '', /^unix:/);
  test('lê players sem whitelist, prefere Playing e distingue erro de ausência', {timeout: 45000}, async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'niko-mpris-teste-'));
    const script = join(pasta, 'player.js');
    writeFileSync(script, FAKE);
    const filhos = new Set();
    async function iniciar(nome, status, capa, mode = 'full') {
      const filho = spawn('/usr/bin/gjs', [script, nome, status, capa, mode, join(pasta, nome + '.log')], {stdio: ['ignore', 'pipe', 'pipe']});
      filhos.add(filho);
      await new Promise((resolve, reject) => {
        const limite = setTimeout(() => reject(new Error('fake player não iniciou')), 3000);
        filho.once('error', reject);
        filho.once('exit', codigo => { clearTimeout(limite); reject(new Error('fake encerrou ' + codigo)); });
        filho.stdout.on('data', d => { if (String(d).includes('READY')) { clearTimeout(limite); resolve(); } });
        filho.stderr.on('data', d => console.error(String(d)));
      });
      return filho;
    }
    async function parar(filho) {
      if (filho.exitCode === null && filho.signalCode === null) {
        const fim = once(filho, 'exit');
        filho.kill('SIGTERM');
        await fim;
      }
      filhos.delete(filho);
    }
    const vite = await createServer({configFile: false, server: {middlewareMode: true, hmr: false, ws: false, watch: null}, appType: 'custom', optimizeDeps: {noDiscovery: true}});
    try {
      const {pedirMidiaLinux, prepararCapaLinux} = await vite.ssrLoadModule('/servidor/midiaLinux.ts');
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
      const imagem = join(pasta, 'capa.png');
      writeFileSync(imagem, png);
      const urlImagem = pathToFileURL(imagem).href;
      assert.equal(await prepararCapaLinux(urlImagem), 'data:image/png;base64,' + png.toString('base64'));
      writeFileSync(join(pasta, 'texto'), 'arquivo normal não é imagem');
      assert.equal(await prepararCapaLinux(pathToFileURL(join(pasta, 'texto')).href), null);
      assert.equal(await prepararCapaLinux(pathToFileURL(join(pasta, 'ausente')).href), null);
      assert.equal(await prepararCapaLinux('file:///etc/passwd'), null);
      assert.equal(await prepararCapaLinux('file://outro-host/tmp/capa.png'), null);
      symlinkSync(imagem, join(pasta, 'link.png'));
      assert.equal(await prepararCapaLinux(pathToFileURL(join(pasta, 'link.png')).href), null);
      writeFileSync(join(pasta, 'grande.png'), Buffer.concat([png, Buffer.alloc(2_000_000)]));
      assert.equal(await prepararCapaLinux(pathToFileURL(join(pasta, 'grande.png')).href), null);
      writeFileSync(join(pasta, 'capa.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
      assert.equal(await prepararCapaLinux(pathToFileURL(join(pasta, 'capa.svg')).href), null);
      const capaLocal = await iniciar('capa_local', 'Playing', urlImagem);
      assert.equal((await pedirMidiaLinux()).capa, 'data:image/png;base64,' + png.toString('base64'));
      await parar(capaLocal);
      assert.equal((await pedirMidiaLinux()).sessao, false);
      const spotify = await iniciar('spotify', 'Paused', 'https://example.invalid/capa.png');
      const firefox = await iniciar('firefox.instance_test', 'Playing', 'file:///tmp/capa.png');
      const estado = await pedirMidiaLinux();
      assert.equal(estado.sessao, true);
      assert.equal(estado.titulo, 'Faixa firefox.instance_test');
      assert.match(estado.artista, /Artista A/);
      assert.match(estado.artista, /Artista B/);
      assert.equal(estado.duracao, 125.5);
      assert.equal(estado.posicao, 12.5);
      assert.equal(estado.tocando, true);
      assert.equal(estado.capa, null, 'capa file não expõe caminho local');
      for (const campo of ['podeAlternar', 'podeAvancar', 'podeVoltar', 'podeBuscar']) assert.equal(estado[campo], true);
      const alvo = {player: estado.player, dono: estado.dono, faixaId: estado.faixaId};
      assert.equal((await pedirMidiaLinux('alternar', undefined, alvo)).tocando, false);
      assert.equal((await pedirMidiaLinux('alternar', undefined, alvo)).tocando, true);
      await pedirMidiaLinux('proxima', undefined, alvo);
      assert.equal(readFileSync(join(pasta, 'firefox.instance_test.log'), 'utf8'), 'Next');
      await pedirMidiaLinux('anterior', undefined, alvo);
      assert.equal(readFileSync(join(pasta, 'firefox.instance_test.log'), 'utf8'), 'Previous');
      assert.equal((await pedirMidiaLinux('posicao', 35.25, alvo)).posicao, 35.25);
      assert.equal(readFileSync(join(pasta, 'firefox.instance_test.log'), 'utf8'), '/track/test:35250000');
      assert.equal((await pedirMidiaLinux('posicao', 999, alvo)).posicao, 125.5);
      for (const value of [-1, NaN, Infinity, 1e20]) await assert.rejects(pedirMidiaLinux('posicao', value, alvo));
      assert.equal((await pedirMidiaLinux('proxima', undefined, {...alvo, faixaId: '/track/old'})).sessao, false);

      await parar(firefox);
      assert.equal((await pedirMidiaLinux('alternar', undefined, alvo)).sessao, false, 'não controla Spotify ao encerrar Firefox');
      const replacement = await iniciar('firefox.instance_test', 'Playing', '');
      assert.equal((await pedirMidiaLinux('alternar', undefined, alvo)).sessao, false, 'dono antigo não controla nova instância');
      await parar(replacement);
      const estadoSpotify = await pedirMidiaLinux();
      assert.equal(estadoSpotify.titulo, 'Faixa spotify');
      assert.equal(estadoSpotify.capa, 'https://example.invalid/capa.png', 'HTTPS aceito sem baixar rede');
      await parar(spotify);
      const vlc = await iniciar('vlc.instance_test', 'Playing', 'https://example.invalid/capa com espaco.png');
      const estadoVlc = await pedirMidiaLinux();
      assert.equal(estadoVlc.titulo, 'Faixa vlc.instance_test');
      assert.equal(estadoVlc.capa, null, 'URL insegura rejeitada');
      await parar(vlc);
      assert.equal((await pedirMidiaLinux()).sessao, false, 'desaparecimento remove sessão');
      for (const mode of ['readonly', 'noPause', 'noSeek']) {
        const limitado = await iniciar('limited', 'Playing', '', mode);
        const r = await pedirMidiaLinux();
        const target = {player: r.player, dono: r.dono, faixaId: r.faixaId};
        assert.equal(r.podeAlternar, mode === 'noSeek');
        assert.equal(r.podeBuscar, mode === 'noPause');
        await assert.rejects(pedirMidiaLinux(mode === 'noSeek' ? 'posicao' : 'alternar', 5, target));
        await parar(limitado);
      }
      for (const [mode, capability, action] of [['noTrack', 'podeBuscar', 'posicao'], ['noNext', 'podeAvancar', 'proxima'], ['noPrevious', 'podeVoltar', 'anterior']]) {
        const limitado = await iniciar('limited', 'Playing', '', mode);
        const r = await pedirMidiaLinux();
        assert.equal(r[capability], false);
        assert.equal(r.podeAlternar, true);
        const target = {player: r.player, dono: r.dono, faixaId: r.faixaId};
        await assert.rejects(pedirMidiaLinux(action, 5, target));
        if (mode === 'noTrack') assert.equal((await pedirMidiaLinux('alternar', undefined, target)).tocando, false, 'sem trackid ainda pausa');
        await parar(limitado);
      }
      const missing = await iniciar('missing_capability', 'Playing', '', 'missingCapability');
      const missingState = await pedirMidiaLinux();
      assert.equal(missingState.podeAvancar, false, 'capacidade ausente não habilita controle');
      await assert.rejects(pedirMidiaLinux('proxima', undefined, missingState), /controle_midia_sem_suporte/);
      await parar(missing);
      for (const mode of ['denied', 'slow', 'die']) {
        const failing = await iniciar('failing_command', 'Playing', '', mode);
        const state = await pedirMidiaLinux();
        const target = {player: state.player, dono: state.dono, faixaId: state.faixaId};
        const before = Date.now();
        await assert.rejects(pedirMidiaLinux('alternar', undefined, target), error => {
          if (mode === 'denied') assert.match(error.message, /AccessDenied/);
          if (mode === 'slow') assert.match(error.message, /Timeout|timed out/i);
          return true;
        });
        assert.ok(Date.now() - before < 6500, 'comando com falha termina dentro do limite');
        if (mode === 'die') {
          assert.equal(readFileSync(join(pasta, 'failing_command.log'), 'utf8'), 'exited-during-command');
          assert.equal((await pedirMidiaLinux()).sessao, false);
          const newOwner = await iniciar('failing_command', 'Playing', '');
          assert.equal((await pedirMidiaLinux('alternar', undefined, target)).sessao, false);
          await parar(newOwner);
        }
        await parar(failing);
      }
      const stopped = await iniciar('aaa_stopped', 'Stopped', '');
      const paused = await iniciar('zzz_paused', 'Paused', '');
      assert.equal((await pedirMidiaLinux()).titulo, 'Faixa zzz_paused', 'Paused vence Stopped anterior na ordenação');
      await parar(stopped);
      await parar(paused);
      const broken = await iniciar('aaa_broken', 'Broken', '');
      const valid = await iniciar('zzz_valid', 'Playing', '');
      assert.equal((await pedirMidiaLinux()).titulo, 'Faixa zzz_valid', 'player falho não apaga válido');
      await parar(valid);
      await assert.rejects(pedirMidiaLinux(), 'todos os players falharam não equivale a ausência');
      await parar(broken);
      const endereco = process.env.DBUS_SESSION_BUS_ADDRESS;
      process.env.DBUS_SESSION_BUS_ADDRESS = 'unix:path=/tmp/niko-bus-inexistente';
      try { await assert.rejects(pedirMidiaLinux()); }
      finally { process.env.DBUS_SESSION_BUS_ADDRESS = endereco; }
    } finally {
      for (const filho of filhos) await parar(filho);
      await vite.close();
      rmSync(pasta, {recursive: true, force: true});
    }
  });
}
