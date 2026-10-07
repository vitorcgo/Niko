import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {PassThrough} from 'node:stream';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

const senha = 'senha-ficticia-somente-laboratorio';
const segredo = 'credencial-ficticia-ç-"-\\-🔑';
const arquivo = fileURLToPath(import.meta.url);
if (!process.env.NIKO_SECRET_TEST_LAB) {
    test('cofre Linux em bus privado sem ativação automática e HOME temporário', {timeout: 90000}, async t => {
        const lab = mkdtempSync(join(tmpdir(), 'niko-secret-lab-'));
        for (const nome of ['home', 'data', 'config', 'runtime', 'control']) mkdirSync(join(lab, nome), {mode: 0o700});
        const config = join(lab, 'bus.conf');
        writeFileSync(config, '<busconfig><type>session</type><listen>unix:tmpdir=' + lab + '</listen><auth>EXTERNAL</auth><policy context="default"><allow send_destination="*"/><allow receive_sender="*"/><allow own="*"/></policy></busconfig>');
        const filho = spawn('dbus-run-session', ['--config-file=' + config, '--', process.execPath, arquivo], {
            env: Object.fromEntries(Object.entries({...process.env, NIKO_SECRET_TEST_LAB: lab,
                NIKO_SECRET_PARENT_BUS: process.env.DBUS_SESSION_BUS_ADDRESS || 'absent', HOME: join(lab, 'home'),
                XDG_DATA_HOME: join(lab, 'data'), XDG_CONFIG_HOME: join(lab, 'config'), XDG_RUNTIME_DIR: join(lab, 'runtime'),
                GIO_USE_VFS: 'local', DISPLAY: '', WAYLAND_DISPLAY: ''}).filter(([key]) => !['NODE_TEST_CONTEXT', 'GNOME_KEYRING_CONTROL', 'SSH_AUTH_SOCK', 'APPDATA'].includes(key))),
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        t.after(() => { if (filho.exitCode === null && filho.signalCode === null) filho.kill('SIGTERM'); rmSync(lab, {recursive: true, force: true}); });
        let log = '';
        filho.stdout.on('data', d => { log += d; }); filho.stderr.on('data', d => { log += d; });
        const [code] = await once(filho, 'exit');
        assert.ok(!log.includes(segredo) && !log.includes(senha), 'stdout/stderr não expõem credenciais fictícias');
        assert.equal(code, 0, log);
        console.log(log.trim());
    });
} else {
    const lab = process.env.NIKO_SECRET_TEST_LAB;
    assert.notEqual(process.env.DBUS_SESSION_BUS_ADDRESS, process.env.NIKO_SECRET_PARENT_BUS);
    assert.equal(process.env.HOME, join(lab, 'home'));
    assert.equal(process.env.XDG_DATA_HOME, join(lab, 'data'));
    test('Secret Service real: persistência, concorrência, ausência e entradas inválidas', {timeout: 70000}, async () => {
        const vite = await createServer({configFile: false, server: {middlewareMode: true, hmr: false, ws: false, watch: null}, appType: 'custom', optimizeDeps: {noDiscovery: true}});
        const filhos = new Set();
        const monitorErros = [];
        let observado = 0;
        let ambientesNegados = 0;
        function snapshot() {
            for (const pid of readdirSync('/proc').filter(nome => /^\d+$/.test(nome))) {
                try {
                    const status = readFileSync('/proc/' + pid + '/status', 'utf8');
                    if (!status.includes('PPid:\t' + process.pid + '\n')) continue;
                    const cmd = readFileSync('/proc/' + pid + '/cmdline', 'utf8');
                    let env = '';
                    try { env = readFileSync('/proc/' + pid + '/environ', 'utf8'); }
                    catch (erro) { if (erro.code === 'EACCES') ambientesNegados++; else throw erro; }
                    if (cmd.includes('gjs') || cmd.includes('gnome-keyring-daemon')) observado++;
                    if (cmd.includes(segredo) || cmd.includes(senha) || env.includes(segredo) || env.includes(senha)) monitorErros.push(pid);
                } catch (erro) { if (!['ENOENT', 'ESRCH'].includes(erro.code)) throw erro; }
            }
        }
        const monitor = setInterval(snapshot, 5);
        function temOwner() {
            return execFileSync('gdbus', ['call', '--session', '--timeout', '1', '--dest', 'org.freedesktop.DBus', '--object-path', '/org/freedesktop/DBus', '--method', 'org.freedesktop.DBus.NameHasOwner', 'org.freedesktop.secrets'], {encoding: 'utf8'}).includes('true');
        }
        async function iniciar() {
            const filho = spawn('gnome-keyring-daemon', ['--foreground', '--components=secrets', '--control-directory=' + join(lab, 'control'), '--unlock'], {stdio: ['pipe', 'pipe', 'pipe']});
            filhos.add(filho);
            let log = ''; filho.stdout.on('data', d => { log += d; }); filho.stderr.on('data', d => { log += d; });
            filho.stdin.end(senha);
            for (let n = 0; n < 100; n++) {
                if (temOwner()) return filho;
                assert.equal(filho.exitCode, null, log);
                await new Promise(resolve => setTimeout(resolve, 30));
            }
            throw new Error('daemon isolado não iniciou: ' + log);
        }
        async function parar(filho) {
            if (filho.exitCode === null && filho.signalCode === null) { const fim = once(filho, 'exit'); filho.kill('SIGTERM'); await fim; }
            filhos.delete(filho);
        }
        try {
            const {gravarSegredo, lerSegredo, apagarSegredo} = await vite.ssrLoadModule('/servidor/segredos.ts');
            assert.equal(temOwner(), false, 'bus sem serviço e sem autostart');
            await assert.rejects(lerSegredo('ausente-servico'));
            await assert.rejects(gravarSegredo('ausente-servico', segredo));
            await assert.rejects(apagarSegredo('ausente-servico'));
            const ia = await vite.ssrLoadModule('/servidor/ia.ts');
            const conexoes = await vite.ssrLoadModule('/servidor/conexoes.ts');
            const banco = await vite.ssrLoadModule('/servidor/banco.ts');
            const {rotas} = await vite.ssrLoadModule('/servidor/ponte.ts');
            const pasta = ia.pastaDados();
            assert.ok(pasta.startsWith(join(lab, 'data') + '/'), 'metadata isolada também sem APPDATA herdado');
            mkdirSync(pasta, {recursive: true});
            const provedores = join(pasta, 'provedores.json');
            const arquivoConexoes = join(pasta, 'conexoes.json');
            const provedor = {id: 'ia-ficticio', tipo: 'anthropic', nome: 'Teste', urlBase: 'https://example.invalid', modelo: '', temChave: false};
            writeFileSync(provedores, JSON.stringify([provedor]));
            await ia.removerProvedor(provedor.id);
            assert.deepEqual(ia.listarProvedores(), [], 'sem chave remove sem consultar serviço');
            writeFileSync(provedores, JSON.stringify([{...provedor, temChave: true}]));
            await assert.rejects(ia.removerProvedor(provedor.id), /cofre_indisponivel/);
            assert.equal(ia.listarProvedores()[0].temChave, true, 'falha de exclusão preserva metadata do provedor');
            writeFileSync(arquivoConexoes, JSON.stringify({github: {temChave: true}}));
            await assert.rejects(conexoes.removerChaveConexao('github'), /cofre_indisponivel/);
            assert.equal(conexoes.estadoConexoes().github.temChave, true);
            banco.gravar({'niko:sentinel': 'dados-ficticios-preservados'});
            async function reset(nome = '') {
                const req = new PassThrough();
                req.url = '/ponte/dados/zerar'; req.method = 'POST';
                req.headers = {host: '127.0.0.1', 'x-niko': '1', 'x-niko-token': process.env.NIKO_TOKEN, 'x-niko-banco': nome};
                const res = {statusCode: 200, setHeader() {}, end(body) { this.body = JSON.parse(body); }};
                const resultado = rotas(req, res, () => assert.fail('rota real não tratou reset'));
                req.end(JSON.stringify({confirmacao: 'APAGAR', chaves: true}));
                await resultado;
                return res;
            }
            const resetProvedor = await reset();
            assert.equal(resetProvedor.statusCode, 400);
            assert.match(resetProvedor.body.erro, /cofre_indisponivel/);
            assert.equal(ia.listarProvedores()[0].temChave, true);
            assert.equal(banco.lerTudo()['niko:sentinel'], 'dados-ficticios-preservados');
            writeFileSync(provedores, '[]');
            const resetConexao = await reset();
            assert.equal(resetConexao.statusCode, 400);
            assert.equal(conexoes.estadoConexoes().github.temChave, true);
            assert.equal(banco.lerTudo()['niko:sentinel'], 'dados-ficticios-preservados');
            const invalido = await reset('../invalido');
            assert.equal(invalido.statusCode, 400);
            assert.match(invalido.body.erro, /banco_invalido/);
            assert.equal(conexoes.estadoConexoes().github.temChave, true);
            banco.fecharBanco();
            console.log('Native: SQLite temporário + middleware real preservam dados/metadata quando cofre ausente; requisição/resposta simuladas.');
            let daemon = await iniciar();
            const criados = await Promise.all(['A', 'B'].map(nome => ia.salvarProvedor({tipo: 'anthropic', nome: 'Ficticio ' + nome, chave: 'chave-ficticia-' + nome})));
            assert.equal(criados.length, 2);
            for (const [n, criado] of criados.entries()) {
                assert.ok(ia.listarProvedores().some(p => p.id === criado.id), 'gravações em ids diferentes preservam ambos provedores');
                assert.equal(await lerSegredo(criado.id), 'chave-ficticia-' + ['A', 'B'][n]);
            }
            await Promise.all([ia.salvarProvedor({...criados[0], chave: 'nova-chave-ficticia'}), ia.removerProvedor(criados[0].id)]);
            assert.ok(!ia.listarProvedores().some(p => p.id === criados[0].id));
            assert.equal(await lerSegredo(criados[0].id), null, 'update seguido de delete remove segredo e metadata');
            await ia.removerProvedor(criados[1].id);
            assert.equal(await lerSegredo('ausente-item'), null);
            await apagarSegredo('ausente-item');
            await gravarSegredo('persistencia', segredo);
            assert.equal(await lerSegredo('persistencia'), segredo);
            await parar(daemon);
            assert.equal(temOwner(), false);
            await assert.rejects(lerSegredo('persistencia'), 'não reutilizar cache quando daemon desaparece');
            daemon = await iniciar();
            assert.equal(await lerSegredo('persistencia'), segredo, 'item persiste após reiniciar daemon');
            const gravacoes = Array.from({length: 8}, (_, n) => gravarSegredo('serial', 'ficticio-' + n));
            await Promise.all(gravacoes);
            assert.equal(await lerSegredo('serial'), 'ficticio-7', 'fila mantém ordem no mesmo id');
            await Promise.all([gravarSegredo('outro-a', 'a'), gravarSegredo('outro-b', 'b')]);
            assert.deepEqual(await Promise.all([lerSegredo('outro-a'), lerSegredo('outro-b')]), ['a', 'b']);
            const escrita = gravarSegredo('serial', 'ultimo');
            const leitura = lerSegredo('serial');
            const exclusao = apagarSegredo('serial');
            await escrita;
            assert.equal(await leitura, 'ultimo');
            await exclusao;
            assert.equal(await lerSegredo('serial'), null, 'exclusão posterior não deixa cache');
            for (const id of ['', '../escape', 'A', 'a'.repeat(65)]) {
                await assert.rejects(gravarSegredo(id, segredo), /id_invalido/);
                await assert.rejects(lerSegredo(id), /id_invalido/);
                await assert.rejects(apagarSegredo(id), /id_invalido/);
            }
            for (const invalido of ['', 'a'.repeat(4001), 'ficticio\0invalido']) await assert.rejects(gravarSegredo('invalido', invalido), /segredo_invalido/);
            await apagarSegredo('persistencia');
            assert.equal(await lerSegredo('persistencia'), null);
            const alias = execFileSync('gdbus', ['call', '--session', '--dest', 'org.freedesktop.secrets', '--object-path', '/org/freedesktop/secrets', '--method', 'org.freedesktop.Secret.Service.ReadAlias', 'default'], {encoding: 'utf8'});
            const collection = alias.match(/'(\/[^']+)'/)[1];
            execFileSync('gdbus', ['call', '--session', '--dest', 'org.freedesktop.secrets', '--object-path', '/org/freedesktop/secrets', '--method', 'org.freedesktop.Secret.Service.Lock', "['" + collection + "']"]);
            for (const operacao of [() => lerSegredo('outro-a'), () => gravarSegredo('outro-a', segredo), () => apagarSegredo('outro-a')]) await assert.rejects(operacao(), /cofre_bloqueado/);
            await parar(daemon);
            const scriptFake = join(lab, 'negado.js');
            writeFileSync(scriptFake, `
const {Gio, GLib} = imports.gi;
const xml = '<node><interface name="org.freedesktop.Secret.Service"><method name="ReadAlias"><arg type="s" direction="in"/><arg type="o" direction="out"/></method><property name="Collections" type="ao" access="read"/></interface></node>';
const obj = Gio.DBusExportedObject.wrapJSObject(xml, {
    get Collections() { return []; },
    ReadAliasAsync(_params, invocation) {
        if (ARGV[0] === 'missing') invocation.return_value(new GLib.Variant('(o)', ['/']));
        else invocation.return_dbus_error('org.freedesktop.DBus.Error.AccessDenied', 'isolated denial');
    },
});
const loop = new GLib.MainLoop(null, false);
Gio.bus_own_name(Gio.BusType.SESSION, 'org.freedesktop.secrets', Gio.BusNameOwnerFlags.NONE,
    bus => obj.export(bus, '/org/freedesktop/secrets'), () => print('READY'), () => loop.quit());
loop.run();
`);
            for (const mode of ['denied', 'missing']) {
            const fake = spawn('/usr/bin/gjs', [scriptFake, mode], {stdio: ['ignore', 'pipe', 'pipe']});
            filhos.add(fake);
            await new Promise((resolve, reject) => {
                const limite = setTimeout(() => reject(new Error('fake não iniciou')), 3000);
                fake.once('error', reject);
                fake.stdout.on('data', d => { if (String(d).includes('READY')) { clearTimeout(limite); resolve(); } });
            });
            for (const operacao of [() => lerSegredo('outro-a'), () => gravarSegredo('outro-a', segredo), () => apagarSegredo('outro-a')]) await assert.rejects(operacao(), mode === 'denied' ? /cofre_acesso_negado/ : /cofre_nao_configurado/);
            await parar(fake);
            }
            console.log('Simulated: Secret Service retorna AccessDenied e ausência de coleção; locked validado no keyring real.');
            snapshot(); assert.ok(observado > 0, 'snapshot observa processos nativos');
            assert.deepEqual(monitorErros, [], 'stdin é o único transporte de credenciais para subprocessos');
            console.log('Native: keyring real, store/lookup/delete/restart/concurrency; argv verificados; environ bloqueado pelo kernel em ' + ambientesNegados + ' snapshots.');
        } finally {
            clearInterval(monitor);
            for (const filho of filhos) await parar(filho);
            await vite.close();
        }
    });
}
