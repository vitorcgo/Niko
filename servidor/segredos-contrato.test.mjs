import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createServer} from 'vite';

for (const plataforma of ['linux', 'win32']) test('contrato simulado do cofre ' + plataforma + ' sem serviço pessoal', async () => {
    const chamadas = [];
    const scripts = [];
    let modo = 'ok';
    let encerrados = 0;
    const anterior = globalThis.__nikoSpawnContrato;
    const anteriorScript = globalThis.__nikoScriptContrato;
    globalThis.__nikoScriptContrato = (_nome, script) => { scripts.push(script); return '/script-ficticio'; };
    globalThis.__nikoSpawnContrato = (programa, args, options) => {
        const filho = new EventEmitter();
        filho.stdout = new EventEmitter(); filho.stderr = new EventEmitter(); filho.stdin = new EventEmitter();
        filho.kill = () => { encerrados++; };
        filho.stdin.end = texto => {
            const entrada = JSON.parse(texto);
            chamadas.push({programa, args, options, entrada});
            const atual = modo;
            setImmediate(() => {
                if (atual === 'travado') return;
                if (atual === 'ausente') { filho.emit('error', Object.assign(new Error('ENOENT ficticio'), {code: 'ENOENT'})); return; }
                const resposta = entrada.acao === 'ler' ? {valor: 'ficticio'} : {ok: atual !== 'falha'};
                filho.stdout.emit('data', JSON.stringify(resposta)); filho.emit('close', 0);
            });
        };
        return filho;
    };
    const vite = await createServer({configFile: false, server: {middlewareMode: true, hmr: false, ws: false, watch: null}, appType: 'custom', optimizeDeps: {noDiscovery: true}, plugins: [{
        name: 'cofre-contrato-isolado', enforce: 'pre',
        transform(source, id) {
            if (id.endsWith('/servidor/segredos.ts')) {
                assert.ok(source.includes('import { spawn } from "node:child_process";'), 'interceptação obrigatória impede subprocesso real');
                assert.ok(source.includes('import { garantirScript } from "./scriptsTemporarios";'), 'não criar script real');
                return source.replace('import { spawn } from "node:child_process";', 'const spawn = (...args) => globalThis.__nikoSpawnContrato(...args);').replace('import { garantirScript } from "./scriptsTemporarios";', 'const garantirScript = (...args) => globalThis.__nikoScriptContrato(...args);').replaceAll('process.platform', JSON.stringify(plataforma)).replace('const TEMPO_LIMITE_MS = 20000;', 'const TEMPO_LIMITE_MS = 100;');
            }
        },
    }]});
    try {
        const {gravarSegredo, lerSegredo, apagarSegredo} = await vite.ssrLoadModule('/servidor/segredos.ts');
        if (plataforma === 'linux') {
            modo = 'ausente';
            await assert.rejects(lerSegredo('teste'), /cofre_indisponivel/);
            modo = 'ok';
            await Promise.all([gravarSegredo('teste', 'ficticio'), lerSegredo('teste'), apagarSegredo('teste')]);
            assert.deepEqual(chamadas.slice(1).map(c => c.entrada.acao), ['gravar', 'ler', 'apagar'], 'fila recupera falha e mantém ordem');
            assert.ok(chamadas.every(c => c.programa === '/usr/bin/gjs'));
        } else {
            await gravarSegredo('teste', 'ficticio');
            const antes = chamadas.length;
            assert.equal(await lerSegredo('teste'), 'ficticio');
            assert.equal(chamadas.length, antes, 'cache Windows preservado');
            modo = 'falha';
            await assert.rejects(apagarSegredo('teste'), /falha_ao_apagar/);
            assert.ok(chamadas.every(c => c.programa === 'powershell.exe'));
            assert.ok(scripts.some(s => s.includes('1168')), 'script declara item ausente Windows como exclusão idempotente');
        }
        modo = 'travado';
        await assert.rejects(lerSegredo('travado'), /tempo_credencial/);
        assert.equal(encerrados, 1, 'timeout encerra subprocesso simulado');
        modo = 'ok';
        assert.equal(await lerSegredo('travado'), 'ficticio', 'fila recupera timeout');
        for (const chamada of chamadas) {
            assert.ok(!JSON.stringify(chamada.args).includes('\"ficticio\"'), 'segredo não vai em argv');
            assert.ok(!JSON.stringify(chamada.options).includes('\"ficticio\"'), 'segredo não vai em env/options');
        }
    } finally {
        await vite.close();
        globalThis.__nikoSpawnContrato = anterior;
        globalThis.__nikoScriptContrato = anteriorScript;
    }
});
