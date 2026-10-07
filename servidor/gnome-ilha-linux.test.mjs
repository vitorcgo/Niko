import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {PassThrough} from 'node:stream';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync, chmodSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {rename} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

const UUID = 'niko-ilha@local';
const FAKE = `
const {Gio, GLib} = imports.gi;
const [configPath, logPath] = ARGV;
let xml = '<node><interface name="org.gnome.Shell.Extensions"><method name="GetExtensionInfo"><arg type="s" direction="in"/><arg type="a{sv}" direction="out"/></method><method name="EnableExtension"><arg type="s" direction="in"/><arg type="b" direction="out"/></method><property name="ShellVersion" type="s" access="read"/><property name="UserExtensionsEnabled" type="b" access="readwrite"/></interface></node>';
if (ARGV[3] === 'missing') xml = xml.replace('<property name="ShellVersion" type="s" access="read"/>', '');
function config() { return JSON.parse(new TextDecoder().decode(GLib.file_get_contents(configPath)[1])); }
function log(action) { const old = GLib.file_get_contents(logPath)[1]; const values = JSON.parse(new TextDecoder().decode(old)); values.push(action); GLib.file_set_contents(logPath, JSON.stringify(values)); }
const implementation = {
    get ShellVersion() { return config().shellVersion || '46.0'; },
    get UserExtensionsEnabled() { return config().enabled !== false; },
    set UserExtensionsEnabled(_value) { throw new Error('global extension changes forbidden'); },
    GetExtensionInfoAsync(params, invocation) {
        if (!['niko-ilha@local', 'niko-ilha-runtime@local'].includes(params[0])) throw new Error('unexpected uuid');
        const c = config(); log('GetExtensionInfo');
        if (params[0] === 'niko-ilha-runtime@local') { invocation.return_value(new GLib.Variant('(a{sv})', [{}])); return; }
        if (c.denied) { invocation.return_dbus_error('org.freedesktop.DBus.Error.AccessDenied', 'private denied'); return; }
        const info = c.info ? Object.fromEntries(Object.entries(c.info).map(([k,v]) => [k, new GLib.Variant(typeof v === 'boolean' ? 'b' : typeof v === 'number' ? 'd' : 's', v)])) : {};
        invocation.return_value(new GLib.Variant('(a{sv})', [info]));
    },
    EnableExtensionAsync(params, invocation) {
        if (params[0] !== 'niko-ilha@local') throw new Error('unexpected uuid');
        const c = config(); log('EnableExtension');
        if (c.enableDenied) { invocation.return_dbus_error('org.freedesktop.DBus.Error.AccessDenied', 'private denied'); return; }
        if (c.info && c.accept !== false) { c.info.state = 1; GLib.file_set_contents(configPath, JSON.stringify(c)); }
        invocation.return_value(new GLib.Variant('(b)', [c.accept !== false]));
    },
};
const obj = Gio.DBusExportedObject.wrapJSObject(xml, implementation);
const native = Gio.DBusExportedObject.wrapJSObject(xml, implementation);
const loop = new GLib.MainLoop(null, false);
if (ARGV[2] !== 'none') Gio.bus_own_name(Gio.BusType.SESSION, 'org.gnome.Shell', Gio.BusNameOwnerFlags.NONE, null, () => { if (ARGV[2] === 'shell-only') print('READY'); }, null);
if (ARGV[2] !== 'shell-only') Gio.bus_own_name(Gio.BusType.SESSION, 'org.gnome.Shell.Extensions', Gio.BusNameOwnerFlags.NONE,
    bus => { obj.export(bus, '/org/gnome/Shell/Extensions'); native.export(bus, '/org/gnome/Shell'); }, () => print('READY'), () => loop.quit());
loop.run();
`;

if (!process.env.NIKO_GNOME_TEST_LAB) {
    test('instalação GNOME simulada usa bus privado e diretórios temporários', {timeout: 60000}, async t => {
        const lab = mkdtempSync(join(tmpdir(), 'niko-gnome-integration-'));
        for (const dir of ['data', 'home', 'config', 'cache', 'state']) mkdirSync(join(lab, dir), {mode: 0o700});
        const config = join(lab, 'bus.conf');
        writeFileSync(config, '<busconfig><type>session</type><listen>unix:tmpdir=' + lab + '</listen><auth>EXTERNAL</auth><policy context="default"><allow send_destination="*"/><allow receive_sender="*"/><allow own="*"/></policy></busconfig>');
        const filho = spawn('dbus-run-session', ['--config-file=' + config, '--', process.execPath, fileURLToPath(import.meta.url)], {
            env: Object.fromEntries(Object.entries({...process.env, NIKO_GNOME_TEST_LAB: lab, NIKO_GNOME_PARENT_BUS: process.env.DBUS_SESSION_BUS_ADDRESS || 'absent',
                HOME: join(lab, 'home'), XDG_DATA_HOME: join(lab, 'data'), XDG_CONFIG_HOME: join(lab, 'config'), XDG_CACHE_HOME: join(lab, 'cache'), XDG_STATE_HOME: join(lab, 'state'),
                NIKO_TOKEN: 'token-ficticio-integracao-gnome', XDG_CURRENT_DESKTOP: 'GNOME', GIO_USE_VFS: 'local', DISPLAY: '', WAYLAND_DISPLAY: ''}).filter(([key]) => !['NODE_TEST_CONTEXT', 'APPDATA'].includes(key))),
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        t.after(() => { if (filho.exitCode === null && filho.signalCode === null) filho.kill('SIGTERM'); rmSync(lab, {recursive: true, force: true}); });
        let log = ''; filho.stdout.on('data', d => { log += d; }); filho.stderr.on('data', d => { log += d; });
        const [code] = await once(filho, 'exit'); assert.equal(code, 0, log); console.log(log.trim());
    });
} else {
    test('Gio real e GNOME fictício: instalação, backup, habilitação e falhas', {timeout: 45000}, async () => {
        const lab = process.env.NIKO_GNOME_TEST_LAB;
        assert.notEqual(process.env.DBUS_SESSION_BUS_ADDRESS, process.env.NIKO_GNOME_PARENT_BUS);
        const origem = join(lab, 'origem'); const destino = join(lab, 'data', 'gnome-shell', 'extensions', UUID);
        mkdirSync(origem, {recursive: true});
        writeFileSync(join(origem, 'metadata.json'), JSON.stringify({uuid: UUID, version: 2, 'shell-version': ['46']}));
        writeFileSync(join(origem, 'extension.js'), '// extensão fictícia v2\n');
        const configPath = join(lab, 'fake-config.json'); const logPath = join(lab, 'fake-log.json');
        const config = value => writeFileSync(configPath, JSON.stringify(value));
        const actions = () => JSON.parse(readFileSync(logPath, 'utf8'));
        writeFileSync(logPath, '[]'); config({info: null});
        const script = join(lab, 'gnome-fake.js'); writeFileSync(script, FAKE);
        const vite = await createServer({configFile: false, server: {middlewareMode: true, hmr: false, ws: false, watch: null}, appType: 'custom', optimizeDeps: {noDiscovery: true}});
        let fake;
        async function iniciar(shell = true, omitirVersao = false) {
            fake = spawn('/usr/bin/gjs', [script, configPath, logPath, shell === 'only' ? 'shell-only' : shell ? 'shell' : 'none', omitirVersao ? 'missing' : 'version'], {stdio: ['ignore', 'pipe', 'pipe']});
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('GNOME fake não iniciou')), 3000);
                fake.once('error', reject); fake.stdout.on('data', d => { if (String(d).includes('READY')) { clearTimeout(timeout); resolve(); } });
            });
        }
        async function parar() {
            if (fake && fake.exitCode === null && fake.signalCode === null) { const fim = once(fake, 'exit'); fake.kill('SIGTERM'); await fim; }
        }
        try {
            const {integrarIlhaLinux} = await vite.ssrLoadModule('/servidor/gnomeIlhaLinux.ts');
            const caminhos = {origem, destino};
            assert.equal((await integrarIlhaLinux('estado', caminhos)).estado, 'sem_gnome');
            assert.equal((await integrarIlhaLinux('instalar', caminhos)).estado, 'sem_gnome');
            assert.equal(existsSync(destino), false, 'sem GNOME não escreve extensão');
            await iniciar(false);
            assert.equal((await integrarIlhaLinux('estado', caminhos)).estado, 'sem_gnome', 'helper Extensions sozinho não equivale a compositor existente');
            assert.deepEqual(actions(), [], 'não chama helper quando Shell está ausente');
            await parar();
            await iniciar('only');
            assert.equal((await integrarIlhaLinux('estado', caminhos)).estado, 'erro', 'Shell existente com API Extensions ausente indica falha de capacidade');
            assert.equal((await integrarIlhaLinux('instalar', caminhos)).estado, 'erro');
            assert.equal(existsSync(destino), false, 'API ausente impede instalação');
            assert.deepEqual(actions(), [], 'API ausente não envia EnableExtension');
            await parar();
            await iniciar(true, true);
            assert.equal((await integrarIlhaLinux('instalar', caminhos)).estado, 'aguardando', 'ShellVersion ausente não é incompatibilidade confirmada');
            assert.equal(existsSync(destino), false);
            await parar();
            await iniciar();
            const {rotas} = await vite.ssrLoadModule('/servidor/ponte.ts');
            const logBeforeRoutes = actions();
            const filesBeforeRoutes = readdirSync(join(lab, 'data'), {recursive: true});
            async function postRota(token, confirmacao) {
                const req = new PassThrough();
                req.url = '/ponte/ilha/gnome'; req.method = 'POST';
                req.headers = {host: '127.0.0.1', 'x-niko': '1', 'x-niko-token': token};
                const res = {statusCode: 200, setHeader() {}, end(body) { this.body = JSON.parse(body); }};
                const pedido = rotas(req, res, () => assert.fail('middleware não tratou rota'));
                req.end(JSON.stringify({confirmacao}));
                await pedido;
                return res;
            }
            const badToken = await postRota('token-incorreto', 'ATIVAR_ILHA');
            assert.equal(badToken.statusCode, 403);
            const badConfirm = await postRota(process.env.NIKO_TOKEN, 'NAO_AUTORIZADO');
            assert.equal(badConfirm.statusCode, 400);
            assert.equal(badConfirm.body.erro, 'confirmacao_invalida');
            assert.deepEqual(actions(), logBeforeRoutes, 'token/confirm inválidos não consultam nem habilitam GNOME');
            assert.deepEqual(readdirSync(join(lab, 'data'), {recursive: true}), filesBeforeRoutes, 'token/confirm inválidos não escrevem arquivos');
            config({shellVersion: '47.0', info: null});
            assert.equal((await integrarIlhaLinux('instalar', caminhos)).estado, 'incompativel');
            assert.equal(existsSync(destino), false);
            config({enabled: false, info: null});
            assert.equal((await integrarIlhaLinux('instalar', caminhos)).estado, 'bloqueada');
            assert.equal(existsSync(destino), false, 'não instala com extensões globalmente bloqueadas');
            config({info: {uuid: UUID, state: 1, version: 1}});
            const migrationRoot = join(lab, 'migration');
            const migrationSource = join(migrationRoot, 'source', UUID);
            const migrationDest = join(migrationRoot, 'data', 'gnome-shell', 'extensions', UUID);
            mkdirSync(migrationSource, {recursive: true}); mkdirSync(migrationDest, {recursive: true});
            writeFileSync(join(migrationSource, 'metadata.json'), JSON.stringify({uuid: UUID, version: 2, 'shell-version': ['46']}));
            writeFileSync(join(migrationSource, 'extension.js'), '// dock novo ficticio');
            writeFileSync(join(migrationDest, 'metadata.json'), JSON.stringify({uuid: UUID, version: 1, 'shell-version': ['46']}));
            writeFileSync(join(migrationDest, 'extension.js'), '// ilha anterior ficticia');
            const migration = {runtime: true, origem: join(migrationRoot, 'source', 'niko-ilha-runtime@local'), destino: join(migrationRoot, 'data', 'gnome-shell', 'extensions', 'niko-ilha-runtime@local')};
            assert.equal((await integrarIlhaLinux('estado', migration)).estado, 'instalar');
            assert.equal(readFileSync(join(migrationDest, 'extension.js'), 'utf8'), '// ilha anterior ficticia', 'consulta não escreve');
            assert.equal((await integrarIlhaLinux('instalar', migration)).estado, 'nova_sessao');
            assert.equal(readFileSync(join(migrationDest, 'extension.js'), 'utf8'), '// dock novo ficticio');
            assert.equal((await integrarIlhaLinux('estado', migration)).estado, 'nova_sessao', 'não declara dock carregado com ilha antiga em cache');
            const migrationBackups = join(migrationRoot, 'data', 'gnome-shell', 'niko-backups-extensao');
            assert.equal(readFileSync(join(migrationBackups, readdirSync(migrationBackups)[0], 'extension.js'), 'utf8'), '// ilha anterior ficticia');
            assert.equal(existsSync(migration.destino), false, 'não instala carregador não reconhecido');
            config({info: null});
            assert.equal((await integrarIlhaLinux('estado', {...caminhos, origem: join(lab, 'source-ausente')})).estado, 'nao_instalada');
            assert.equal((await integrarIlhaLinux('estado', caminhos)).estado, 'instalar');
            assert.equal((await integrarIlhaLinux('instalar', caminhos)).estado, 'nova_sessao');
            assert.equal(readFileSync(join(destino, 'extension.js'), 'utf8'), readFileSync(join(origem, 'extension.js'), 'utf8'));
            assert.deepEqual(JSON.parse(readFileSync(join(destino, 'metadata.json'), 'utf8')), JSON.parse(readFileSync(join(origem, 'metadata.json'), 'utf8')));
            assert.ok(actions().includes('EnableExtension'), 'primeira instalação persiste intenção pelo API mesmo sem info carregada');
            assert.equal((await integrarIlhaLinux('estado', caminhos)).estado, 'nova_sessao');
            const info = {uuid: UUID, state: 1, version: 2};
            config({info});
            assert.equal((await integrarIlhaLinux('estado', caminhos)).estado, 'ativa');
            const enabledBefore = actions().filter(a => a === 'EnableExtension').length;
            const parent = join(destino, '..');
            const dirsBefore = readdirSync(parent);
            await Promise.all(Array.from({length: 3}, () => integrarIlhaLinux('instalar', caminhos)));
            assert.equal(actions().filter(a => a === 'EnableExtension').length, enabledBefore, 'ativa é no-op mesmo em chamadas concorrentes');
            assert.deepEqual(readdirSync(parent), dirsBefore, 'no-op não gera backups');
            for (const [state, esperado] of [[2, 'habilitar'], [6, 'habilitar'], [3, 'erro'], [4, 'incompativel'], [7, 'aguardando'], [8, 'aguardando']]) {
                config({info: {...info, state}});
                assert.equal((await integrarIlhaLinux('estado', caminhos)).estado, esperado);
            }
            for (const [state, esperado] of [[3, 'erro'], [4, 'incompativel']]) {
                config({info: {uuid: UUID, state}});
                assert.equal((await integrarIlhaLinux('estado', caminhos)).estado, esperado, 'estado de falha prevalece mesmo sem versão no serviço');
            }
            config({info: {...info, state: 2}});
            assert.equal((await integrarIlhaLinux('instalar', caminhos)).estado, 'ativa');
            config({info: {...info, version: 1}});
            assert.equal((await integrarIlhaLinux('estado', caminhos)).estado, 'nova_sessao', 'versão de disco não equivale a código carregado');
            config({info, denied: true});
            const denied = await integrarIlhaLinux('estado', caminhos);
            assert.equal(denied.estado, 'erro');
            assert.equal(denied.motivo, 'acesso_negado');
            config({info: {...info, state: 2}, enableDenied: true});
            const enableDenied = await integrarIlhaLinux('instalar', caminhos);
            assert.equal(enableDenied.estado, 'erro');
            assert.equal(enableDenied.motivo, 'acesso_negado');
            config({info: {...info, version: 1}});
            writeFileSync(join(destino, 'metadata.json'), JSON.stringify({uuid: UUID, version: 1, 'shell-version': ['46']}));
            writeFileSync(join(destino, 'extension.js'), '// extensão antiga preservada\n');
            writeFileSync(join(destino, 'sentinel.txt'), 'arquivo fictício do usuário');
            assert.equal((await integrarIlhaLinux('estado', caminhos)).estado, 'instalar');
            const updates = await Promise.all(Array.from({length: 3}, () => integrarIlhaLinux('instalar', caminhos)));
            assert.ok(updates.every(r => r.estado === 'nova_sessao'));
            assert.equal(JSON.parse(readFileSync(join(destino, 'metadata.json'), 'utf8')).version, 2);
            const backupsRoot = join(destino, '../..', 'niko-backups-extensao');
            const backups = readdirSync(backupsRoot).map(nome => join(backupsRoot, nome)).filter(p => existsSync(join(p, 'sentinel.txt')));
            assert.equal(backups.length, 1, 'instalações concorrentes produzem exatamente um backup do conteúdo substituído');
            assert.equal(readFileSync(join(backups[0], 'extension.js'), 'utf8'), '// extensão antiga preservada\n');
            assert.equal(readFileSync(join(backups[0], 'sentinel.txt'), 'utf8'), 'arquivo fictício do usuário');
            for (const nivel of ['base', 'parent', 'backups']) {
                const root = join(lab, 'symlink-' + nivel); mkdirSync(root);
                const fora = join(lab, 'alvo-symlink-' + nivel); mkdirSync(fora); writeFileSync(join(fora, 'sentinel'), 'não alterar');
                const base = join(root, 'gnome-shell');
                if (nivel === 'base') symlinkSync(fora, base);
                else {
                    mkdirSync(base);
                    if (nivel === 'parent') symlinkSync(fora, join(base, 'extensions'));
                    else { mkdirSync(join(base, 'extensions')); symlinkSync(fora, join(base, 'niko-backups-extensao')); }
                }
                for (const acao of ['estado', 'instalar']) {
                    const r = await integrarIlhaLinux(acao, {origem, destino: join(base, 'extensions', UUID)});
                    assert.equal(r.estado, 'erro'); assert.equal(r.motivo, 'caminho_inseguro');
                }
                assert.deepEqual(readdirSync(fora), ['sentinel'], 'symlink ancestral não redireciona escrita');
                assert.equal(readFileSync(join(fora, 'sentinel'), 'utf8'), 'não alterar');
            }
            for (const state of [1, 2]) {
                const cached = join(lab, 'cached-' + state, 'extensions', UUID);
                mkdirSync(cached, {recursive: true});
                writeFileSync(join(cached, 'metadata.json'), readFileSync(join(origem, 'metadata.json')));
                writeFileSync(join(cached, 'extension.js'), '// código antigo mesma versão2');
                config({info: {...info, state}});
                const target = {origem, destino: cached};
                assert.equal((await integrarIlhaLinux('instalar', target)).estado, 'nova_sessao', 'código alterado com version2 ainda está em cache');
                const marker = join(cached, 'niko-pendente.json');
                const markerBefore = readFileSync(marker, 'utf8');
                assert.ok(JSON.parse(markerBefore).shellId.includes('/:'), 'marcador contém bus e owner únicos');
                for (let n = 0; n < 2; n++) assert.equal((await integrarIlhaLinux('estado', target)).estado, 'nova_sessao');
                assert.equal(readFileSync(marker, 'utf8'), markerBefore, 'GET não apaga nem reescreve marcador');
                await parar(); await iniciar(); config({info});
                assert.equal((await integrarIlhaLinux('estado', target)).estado, 'ativa', 'owner Shell novo no mesmo bus invalida pendência antiga');
                assert.equal(readFileSync(marker, 'utf8'), markerBefore, 'marcador histórico permanece preservado');
            }
            const parentFile = join(lab, 'nao-e-diretorio'); writeFileSync(parentFile, 'sentinel');
            const failure = await integrarIlhaLinux('instalar', {origem, destino: join(parentFile, UUID)});
            assert.equal(failure.estado, 'erro');
            assert.equal(readFileSync(parentFile, 'utf8'), 'sentinel');
            if (process.getuid() !== 0) {
                const semPermissao = join(lab, 'permissao-negada');
                mkdirSync(semPermissao, {mode: 0o500});
                try {
                    const r = await integrarIlhaLinux('instalar', {origem, destino: join(semPermissao, 'extensions', UUID)});
                    assert.equal(r.estado, 'erro');
                    assert.deepEqual(readdirSync(semPermissao), [], 'permissão negada não deixa instalação parcial');
                } finally { chmodSync(semPermissao, 0o700); }
            } else console.log('Limitação: teste chmod de permissão não roda como root.');
            const rollbackDestino = join(lab, 'rollback', 'extensions', UUID);
            mkdirSync(rollbackDestino, {recursive: true});
            writeFileSync(join(rollbackDestino, 'metadata.json'), JSON.stringify({uuid: UUID, version: 1, 'shell-version': ['46']}));
            writeFileSync(join(rollbackDestino, 'extension.js'), 'original preservado');
            writeFileSync(join(rollbackDestino, 'sentinel.txt'), 'não perder arquivo existente');
            const anteriorRename = globalThis.__nikoRenameTeste;
            let falhouRename = false;
            globalThis.__nikoRenameTeste = async (de, para) => {
                assert.ok(de.startsWith(lab + '/') && para.startsWith(lab + '/'));
                if (!falhouRename && de.includes('/.niko-instalar-') && para === rollbackDestino) {
                    falhouRename = true;
                    throw Object.assign(new Error('rename ficticio negado'), {code: 'EACCES'});
                }
                return rename(de, para);
            };
            const rollbackVite = await createServer({configFile: false, server: {middlewareMode: true, hmr: false, ws: false, watch: null}, appType: 'custom', optimizeDeps: {noDiscovery: true}, plugins: [{
                name: 'rename-falha-isolada', enforce: 'pre',
                transform(source, id) {
                    if (!id.endsWith('/servidor/gnomeIlhaLinux.ts')) return;
                    assert.ok(source.includes('writeFile, rename, rm'), 'interceptação obrigatória de rename');
                    return source.replace('writeFile, rename, rm', 'writeFile, rm') + '\nconst rename = (...args) => globalThis.__nikoRenameTeste(...args);';
                },
            }]});
            try {
                const {integrarIlhaLinux: instalarRollback} = await rollbackVite.ssrLoadModule('/servidor/gnomeIlhaLinux.ts');
                const r = await instalarRollback('instalar', {origem, destino: rollbackDestino});
                assert.equal(r.estado, 'erro');
                assert.equal(falhouRename, true, 'falha simulada ocorreu após mover original para backup');
                assert.equal(readFileSync(join(rollbackDestino, 'extension.js'), 'utf8'), 'original preservado');
                assert.equal(readFileSync(join(rollbackDestino, 'sentinel.txt'), 'utf8'), 'não perder arquivo existente');
                assert.equal(JSON.parse(readFileSync(join(rollbackDestino, 'metadata.json'), 'utf8')).version, 1);
                assert.ok(!readdirSync(join(lab, 'rollback')).some(p => p.startsWith('.niko-instalar-')), 'staging removido após rollback');
            } finally { await rollbackVite.close(); globalThis.__nikoRenameTeste = anteriorRename; }
            await parar();
            assert.equal((await integrarIlhaLinux('estado', caminhos)).estado, 'sem_gnome', 'serviço encerrado não conserva estado ativo');
            await iniciar(); config({info});
            assert.equal((await integrarIlhaLinux('estado', caminhos)).estado, 'ativa', 'serviço substituto é consultado novamente');
            console.log('Gio/D-Bus privados reais; GNOME Shell inteiramente simulado.');
        } finally { await parar(); await vite.close(); }
    });
}
