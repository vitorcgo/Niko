import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, renameSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
const lab = process.env.NIKO_GNOME_LAB;
const candidate = process.env.NIKO_GNOME_MODE === 'candidate';
const migration = process.env.NIKO_GNOME_MODE === 'migration' || candidate;
const uuid = migration ? 'niko-ilha-runtime@local' : 'niko-ilha@local';
const dest = join(lab, 'data/gnome-shell/extensions', uuid);
const dbus = (method, ...args) => execFileSync('gdbus', ['call', '--session', '--timeout', '3', '--dest', 'org.gnome.Shell.Extensions', '--object-path', '/org/gnome/Shell/Extensions', '--method', 'org.gnome.Shell.Extensions.' + method, ...args], {encoding: 'utf8'});
const sleep = () => new Promise(resolve => setTimeout(resolve, 100));
async function until(read, check) { let value; for (let i = 0; i < 80; i++) { try { value = read(); if (check(value)) return value; } catch {} await sleep(); } assert.fail(JSON.stringify(value)); }
const owner = () => execFileSync('gdbus', ['call', '--session', '--dest', 'org.freedesktop.DBus', '--object-path', '/org/freedesktop/DBus', '--method', 'org.freedesktop.DBus.GetNameOwner', 'org.gnome.Shell'], {encoding: 'utf8'});
const file = name => readFileSync(join(dest, name), 'utf8');
const atomic = (name, contents) => { writeFileSync(join(dest, name + '.tmp'), contents); renameSync(join(dest, name + '.tmp'), join(dest, name)); };
const loaded = () => JSON.parse(readFileSync(join(lab, 'loaded.json'), 'utf8'));
test('GNOME46 mesma sessão: descoberta local e atualização por URI imutável', {timeout: 60000}, async () => {
    assert.ok(lab.startsWith('/tmp/niko-sem-reinicio.'));
    assert.equal(process.env.XDG_DATA_HOME, join(lab, 'data'));
    await until(() => dbus('GetExtensionInfo', uuid), value => typeof value === 'string');
    const shellOwner = owner();
    const shellPid = Number(readFileSync(join(lab, 'shell.pid'), 'utf8'));
    const connectionPid = execFileSync('gdbus', ['call', '--session', '--dest', 'org.freedesktop.DBus', '--object-path', '/org/freedesktop/DBus', '--method', 'org.freedesktop.DBus.GetConnectionUnixProcessID', 'org.gnome.Shell'], {encoding: 'utf8'});
    assert.equal(Number(connectionPid.match(/(?:uint32 )?(\d+)/)[1]), shellPid, 'owner corresponde ao compositor nested');
    if (process.env.NIKO_GNOME_MODE === 'clean') {
        assert.equal(dbus('GetExtensionInfo', uuid).trim(), '(@a{sv} {},)');
        const vite = await createServer({configFile: false, root: process.env.NIKO_GNOME_REPO, server: {middlewareMode: true, hmr: false, ws: false, watch: null}, appType: 'custom', optimizeDeps: {noDiscovery: true}});
        try {
            const {integrarIlhaLinux} = await vite.ssrLoadModule('/servidor/gnomeIlhaLinux.ts');
            const paths = {origem: join(lab, 'origem'), destino: dest};
            assert.deepEqual(await integrarIlhaLinux('estado', paths), {estado: 'instalar'});
            assert.deepEqual(await integrarIlhaLinux('instalar', paths), {estado: 'nova_sessao'});
            assert.equal(file('extension.js'), readFileSync(join(lab, 'origem/extension.js'), 'utf8'));
            assert.equal(dbus('EnableExtension', uuid).trim(), '(false,)');
            assert.equal(dbus('GetExtensionInfo', uuid).trim(), '(@a{sv} {},)');
            assert.throws(() => dbus('ReloadExtension', uuid), /deprecated|does not work|NotSupported|UnknownMethod/);
            const evalResult = execFileSync('gdbus', ['call', '--session', '--dest', 'org.gnome.Shell', '--object-path', '/org/gnome/Shell', '--method', 'org.gnome.Shell.Eval', '1+1'], {encoding: 'utf8'});
            assert.equal(evalResult.trim(), "(false, '')", 'modo inseguro não habilitado');
            console.log('CONFIRMED LIMIT: instalação local depois do startup não é descoberta; Enable=false, Reload obsoleto, Eval bloqueado.');
        } finally { await vite.close(); }
    } else {
        let legacyBefore;
        let legacyGeneration;
        const legacyFile = name => readFileSync(join(lab, 'data/gnome-shell/extensions/niko-ilha@local', name), 'utf8');
        if (migration) {
            legacyBefore = {code: legacyFile('extension.js'), metadata: legacyFile('metadata.json')};
            assert.equal(dbus('EnableExtension', 'niko-ilha@local').trim(), '(true,)');
            await until(() => dbus('GetExtensionInfo', 'niko-ilha@local'), value => /'state': <1/.test(value));
            const legacy = await until(() => JSON.parse(readFileSync(join(lab, 'legacy-loaded.json'), 'utf8')), value => value.panelOwned && value.tabFilterInstalled);
            legacyGeneration = legacy.generation;
            assert.equal(dbus('DisableExtension', 'niko-ilha@local').trim(), '(true,)');
            await until(() => dbus('GetExtensionInfo', 'niko-ilha@local'), value => /'state': <2/.test(value));
            await until(() => JSON.parse(readFileSync(join(lab, 'legacy-disabled.json'), 'utf8')), value => value.generation === legacyGeneration && value.panelAbsent && value.tabFilterRestored);
            assert.equal(owner(), shellOwner);
        }
        const stable = {code: file('extension.js'), metadata: file('metadata.json')};
        assert.equal(dbus('EnableExtension', uuid).trim(), '(true,)');
        const first = await until(loaded, value => value.panelOwned === true);
        assert.equal(first.pid, shellPid);
        const status = () => JSON.parse(execFileSync('gjs', ['-c', `
            const {Gio, GLib} = imports.gi;
            const values = Gio.DBus.session.call_sync('com.niko.Ilha.Integracao', '/com/niko/Ilha/Integracao',
                'org.freedesktop.DBus.Properties', 'GetAll', new GLib.Variant('(s)', ['com.niko.Ilha.Integracao']),
                new GLib.VariantType('(a{sv})'), Gio.DBusCallFlags.NO_AUTO_START, 1500, null).deep_unpack()[0];
            print(JSON.stringify(Object.fromEntries(Object.entries(values).map(([key,value]) => [key,value.deep_unpack()]))));
        `], {encoding: 'utf8'}));
        if (candidate) assert.deepEqual(status(), {State: 'active', Revision: first.revision, Generation: first.generation, LastError: ''});
        if (migration) assert.equal(first.legacyPanelAbsent, true, 'painel legado removido antes de ativar novo');
        const original = readFileSync(join(lab, 'origem/extension.js'), 'utf8');
        for (const label of ['B', 'C']) {
            const source = original.replace('enable() {', `enable() { console.log('NIKO_PAYLOAD_${label}_EXECUTED');`);
            const name = 'implementation-' + createHash('sha256').update(source).digest('hex') + '.js';
            writeFileSync(join(dest, name), source, {flag: 'wx'});
            assert.equal(dbus('DisableExtension', uuid).trim(), '(true,)');
            await until(() => dbus('GetExtensionInfo', uuid), value => /'state': <2/.test(value));
            atomic('current.json', JSON.stringify({file: name}));
            assert.equal(dbus('EnableExtension', uuid).trim(), '(true,)');
            const active = await until(loaded, value => value.revision === name && value.panelOwned === true);
            assert.equal(active.pid, shellPid);
            if (candidate) assert.equal(status().Revision, active.revision);
            assert.equal(owner(), shellOwner);
            assert.match(readFileSync(join(lab, 'shell.log'), 'utf8'), new RegExp('NIKO_PAYLOAD_' + label + '_EXECUTED'));
            assert.deepEqual({code: file('extension.js'), metadata: file('metadata.json')}, stable);
            console.log(`LOADED payload ${label}: código novo executado, painel pertence à nova implementação, pid/owner inalterados.`);
        }
        const previous = loaded();
        assert.equal(dbus('DisableExtension', uuid).trim(), '(true,)');
        await until(() => dbus('GetExtensionInfo', uuid), value => /'state': <2/.test(value));
        atomic('current.json', JSON.stringify({file: 'implementation-' + '0'.repeat(64) + '.js'}));
        assert.equal(dbus('EnableExtension', uuid).trim(), '(true,)');
        await until(() => dbus('GetExtensionInfo', uuid), value => /'state': <1/.test(value));
        const restored = await until(loaded, value => value.generation > previous.generation);
        assert.equal(restored.revision, previous.revision, 'rollback mantém revisão anterior');
        assert.equal(restored.panelOwned, true, 'painel recriado pertence à implementação anterior');
        assert.equal(restored.pid, shellPid);
        if (candidate) assert.deepEqual(status(), {State: 'rollback', Revision: restored.revision, Generation: restored.generation, LastError: 'load_failed'});
        assert.equal(owner(), shellOwner);
        console.log('ROLLBACK: payload ausente não destrói integração anterior; mesma sessão.');
        const delayed = original.replace('enable() {', "enable() { console.log('NIKO_CANCELLED_PAYLOAD_EXECUTED');") + "\nawait new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1200, () => { resolve(); return GLib.SOURCE_REMOVE; }));\n";
        const delayedName = 'implementation-' + createHash('sha256').update(delayed).digest('hex') + '.js';
        writeFileSync(join(dest, delayedName), delayed, {flag: 'wx'});
        dbus('DisableExtension', uuid);
        await until(() => dbus('GetExtensionInfo', uuid), value => /'state': <2/.test(value));
        atomic('current.json', JSON.stringify({file: delayedName}));
        dbus('EnableExtension', uuid);
        await until(() => JSON.parse(readFileSync(join(lab, 'loading.json'), 'utf8')), value => value.generation > restored.generation);
        await until(() => dbus('GetExtensionInfo', uuid), value => /'state': <1/.test(value));
        dbus('DisableExtension', uuid);
        await new Promise(resolve => setTimeout(resolve, 1600));
        assert.match(dbus('GetExtensionInfo', uuid), /'state': <2/);
        assert.equal(loaded().generation, restored.generation, 'import cancelado não publica ativação');
        assert.doesNotMatch(readFileSync(join(lab, 'shell.log'), 'utf8'), /NIKO_CANCELLED_PAYLOAD_EXECUTED/);
        console.log('CANCEL: desabilitar durante import impede ativação tardia.');
        if (migration) {
            assert.deepEqual({code: legacyFile('extension.js'), metadata: legacyFile('metadata.json')}, legacyBefore, 'arquivos legados preservados');
            dbus('EnableExtension', 'niko-ilha@local');
            await until(() => dbus('GetExtensionInfo', 'niko-ilha@local'), value => /'state': <1/.test(value));
            assert.equal(owner(), shellOwner);
            await until(() => JSON.parse(readFileSync(join(lab, 'legacy-loaded.json'), 'utf8')), value => value.generation > legacyGeneration && value.panelOwned && value.tabFilterInstalled);
            console.log('MIGRATION: legado carregado foi desabilitado, novo UUID ativado/atualizado, legado preservado e reativado para reversão, sem reinício.');
        }
    }
    assert.equal(owner(), shellOwner);
    writeFileSync(join(lab, 'result'), 'PASS: diagnóstico ' + process.env.NIKO_GNOME_MODE + '; Shell owner inalterado\n');
});
