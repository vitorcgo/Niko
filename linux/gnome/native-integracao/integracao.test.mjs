import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, statSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createServer} from 'vite';

const UUID = 'niko-ilha@local';
const lab = process.env.NIKO_GNOME_NATIVE_LAB;
const origem = join(lab, 'origem');
const destino = join(lab, 'data/gnome-shell/extensions', UUID);
const calls = () => (readFileSync(join(lab, 'enable-calls.log'), 'utf8').match(/member=EnableExtension/g) || []).length;
const files = () => Object.fromEntries(readdirSync(destino).sort().map(name => {
    const path = join(destino, name);
    return [name, {contents: readFileSync(path, 'utf8'), mtime: String(statSync(path, {bigint: true}).mtimeNs)}];
}));
const settings = () => execFileSync('gsettings', ['get', 'org.gnome.shell', 'enabled-extensions'], {encoding: 'utf8'});
const info = () => execFileSync('gdbus', ['call', '--session', '--dest', 'org.gnome.Shell.Extensions', '--object-path', '/org/gnome/Shell/Extensions', '--method', 'org.gnome.Shell.Extensions.GetExtensionInfo', UUID], {encoding: 'utf8'});

test('GNOME46 real: ativação privada, estado readonly e atualização exige sessão nova', {timeout: 30000}, async () => {
    assert.ok(lab?.startsWith('/tmp/niko-native-integracao.'));
    assert.equal(process.env.XDG_RUNTIME_DIR, join(lab, 'runtime'));
    assert.equal(process.env.GSETTINGS_BACKEND, 'keyfile');
    const vite = await createServer({configFile: false, root: process.env.NIKO_GNOME_NATIVE_REPO,
        server: {middlewareMode: true, hmr: false, ws: false, watch: null}, appType: 'custom', optimizeDeps: {noDiscovery: true}});
    try {
        console.log("native properties before import", execFileSync("gdbus", ["call", "--session", "--dest", "org.gnome.Shell.Extensions", "--object-path", "/org/gnome/Shell/Extensions", "--method", "org.freedesktop.DBus.Properties.GetAll", "org.gnome.Shell.Extensions"], {encoding: "utf8"}));
        const {integrarIlhaLinux} = await vite.ssrLoadModule('/servidor/gnomeIlhaLinux.ts');
        const caminhos = {origem, destino};
        const initial = files();
        assert.deepEqual(await integrarIlhaLinux('estado', caminhos), {estado: 'habilitar'});
        assert.deepEqual(files(), initial, 'estado não pode escrever arquivos');
        assert.equal(calls(), 0, 'estado não pode habilitar extensão');
        assert.equal(settings().trim(), '@as []');
        console.log('GNOME real detectou extensão versão 2 instalada/inativa; estado readonly.');
        const result = await integrarIlhaLinux('instalar', caminhos);
        assert.ok(['ativa', 'aguardando'].includes(result.estado), JSON.stringify(result));
        let active;
        for (let i = 0; i < 30; i++) {
            active = await integrarIlhaLinux('estado', caminhos);
            if (active.estado === 'ativa') break;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        assert.equal(active.estado, 'ativa');
        assert.equal(calls(), 1, 'habilitação usa uma chamada nativa');
        assert.deepEqual(files(), initial, 'habilitar instalação igual não pode copiar arquivos');
        assert.match(settings(), /niko-ilha@local/);
        assert.match(info(), /version.*2/);
        console.log('EnableExtension nativo ativou exclusivamente niko-ilha@local; info ativo versão2.');
        const beforeState = {files: files(), settings: settings(), calls: calls()};
        assert.deepEqual(await integrarIlhaLinux('estado', caminhos), {estado: 'ativa'});
        assert.deepEqual({files: files(), settings: settings(), calls: calls()}, beforeState, 'estado ativo é readonly');
        writeFileSync(join(origem, 'extension.js'), readFileSync(join(origem, 'extension.js'), 'utf8') + '\n// atualização privada da fixture, mesma versão 2\n');
        assert.deepEqual(await integrarIlhaLinux('estado', caminhos), {estado: 'instalar'});
        assert.deepEqual(await integrarIlhaLinux('instalar', caminhos), {estado: 'nova_sessao'});
        assert.equal(JSON.parse(readFileSync(join(destino, 'metadata.json'), 'utf8')).version, 2);
        assert.match(info(), /version.*2/);
        const pending = JSON.parse(readFileSync(join(destino, 'niko-pendente.json'), 'utf8'));
        const busValue = (method, args = []) => execFileSync('gdbus', ['call', '--session', '--dest', 'org.freedesktop.DBus', '--object-path', '/org/freedesktop/DBus', '--method', 'org.freedesktop.DBus.' + method, ...args], {encoding: 'utf8'}).split("'")[1];
        assert.equal(pending.shellId, busValue('GetId') + '/' + busValue('GetNameOwner', ['org.gnome.Shell']));
        const beforePendingState = {files: files(), settings: settings(), calls: calls()};
        assert.deepEqual(await integrarIlhaLinux('estado', caminhos), {estado: 'nova_sessao'});
        assert.deepEqual({files: files(), settings: settings(), calls: calls()}, beforePendingState, 'estado pending mesma sessão não escreve nem habilita');
        console.log('Código alterado mantendo versão2: marker persistido com id real do bus/owner, nova_sessao e GET readonly.');
        const metadata = JSON.parse(readFileSync(join(origem, 'metadata.json'), 'utf8'));
        metadata.version = 3;
        writeFileSync(join(origem, 'metadata.json'), JSON.stringify(metadata));
        assert.deepEqual(await integrarIlhaLinux('estado', caminhos), {estado: 'instalar'});
        assert.equal(JSON.parse(readFileSync(join(destino, 'metadata.json'), 'utf8')).version, 2);
        assert.deepEqual(await integrarIlhaLinux('instalar', caminhos), {estado: 'nova_sessao'});
        assert.equal(JSON.parse(readFileSync(join(destino, 'metadata.json'), 'utf8')).version, 3);
        assert.equal(readFileSync(join(destino, 'extension.js'), 'utf8'), readFileSync(join(origem, 'extension.js'), 'utf8'));
        assert.match(info(), /version.*2/, 'GNOME preserva cache versão2 até nova sessão');
        const backups = join(lab, 'data/gnome-shell/niko-backups-extensao');
        const names = readdirSync(backups);
        assert.equal(names.length, 2);
        assert.equal(JSON.parse(readFileSync(join(backups, names[0], 'metadata.json'), 'utf8')).version, 2);
        assert.deepEqual(await integrarIlhaLinux('estado', caminhos), {estado: 'nova_sessao'});
        assert.equal(calls(), 3);
        const monitor = readFileSync(join(lab, 'enable-calls.log'), 'utf8');
        const enabledUUIDs = [...monitor.matchAll(/member=EnableExtension\n\s+string "([^"]+)"/g)].map(match => match[1]);
        assert.deepEqual(enabledUUIDs, [UUID, UUID, UUID]);
        console.log('Atualização atômica versão3 + backup versão2; cache nativo2 retorna nova_sessao, sem reiniciar/logoff.');
        writeFileSync(join(lab, 'result'), 'PASS: GNOME46 real ativação, estado readonly, atualização de código mesma versão, marker readonly, atualização atômica e cache nova_sessao\n');
    } finally { await vite.close(); }
});
