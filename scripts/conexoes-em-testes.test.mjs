import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { criarServidorDeTeste } from './vite-para-testes.mjs';
import { readFileSync } from 'node:fs';
globalThis.BroadcastChannel = undefined;
const memoria = new Map();
globalThis.localStorage = { getItem: k => memoria.get(k) ?? null, setItem: (k,v) => memoria.set(k,v) };
globalThis.window = Object.assign(new EventTarget(), { setTimeout, clearTimeout, location: { search: '' } });
globalThis.document = Object.assign(new EventTarget(), { body: {}, getElementById: () => null });
let chamadas = [];
globalThis.fetch = async (url) => { chamadas.push(url); return { ok: true, json: async () => ({ ok:true }) }; };
const vite = await criarServidorDeTeste({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', optimizeDeps: { noDiscovery:true } });
after(() => vite.close());
const { useComunicacao } = await vite.ssrLoadModule('/src/estado/comunicacao.ts');
const { conexoesPonte } = await vite.ssrLoadModule('/src/ponte/conexoesReais.ts');
const backend = await vite.ssrLoadModule('/servidor/conexoes.ts');
const { configuracoesValidas } = await vite.ssrLoadModule('/src/utilitarios/configuracoesValidas.ts');
const { CONFIG_PADRAO, useConfig } = await vite.ssrLoadModule('/src/estado/configuracoes.ts');
const { T } = await vite.ssrLoadModule('/src/textos/textos.ts');

test('Google fica desativado ao editar, restaurar backup e reidratar, sem perder a informação da credencial', async () => {
  const antigo = { ...useComunicacao.getState().conexoes.find(c => c.id === 'google'), ligada:true, chaveSalva:true, fixadaNaIlha:true, status:'conectado' };
  useComunicacao.getState().substituir({conexoes:[antigo]});
  const conferir = () => {
    const c = useComunicacao.getState().conexoes.find(c => c.id === 'google');
    assert.equal(c.ligada, false); assert.equal(c.fixadaNaIlha, false);
    assert.equal(c.status, 'pausado'); assert.equal(c.chaveSalva, true);
  };
  conferir();
  useComunicacao.getState().atualizarConexao('google', {ligada:true, fixadaNaIlha:true, status:'conectado'});
  conferir();
  memoria.set(useComunicacao.persist.getOptions().name, JSON.stringify({state:{conexoes:[antigo]},version:0}));
  await useComunicacao.persist.rehydrate();
  conferir();
});

test('login, dados, agenda, rascunhos e envio são bloqueados antes da rede', async () => {
  chamadas = [];
  for (const acao of [
    () => conexoesPonte.loginDireto(), () => conexoesPonte.ler('google', true),
    () => conexoesPonte.salvarChave('google','teste'), () => conexoesPonte.buscarEmails('is:unread'),
    () => conexoesPonte.lerAgendaGoogle('2026-10-10','2026-10-11'),
    () => conexoesPonte.criarRascunho({para:'teste@example.com',assunto:'Teste',corpo:'Teste'}),
    () => conexoesPonte.enviarEmail({para:'teste@example.com',assunto:'Teste',corpo:'Teste'}),
    () => backend.lerConexao('google'), () => backend.chaveDe('google'),
    () => backend.salvarChaveConexao('google',{}),
  ]) await assert.rejects(acao, /conexao_em_testes/);
  assert.deepEqual(chamadas, []);
  await conexoesPonte.ler('github');
  assert.deepEqual(chamadas, ['/ponte/conexoes/github']);
});

test('cartões e janelas identificam Google em testes e bloqueiam os controles da integração', () => {
  assert.equal(T.conexoes.emTestes, 'Desativado (em testes)');
  assert.match(T.conexoes.emTestesDica, /Google Workspace está em testes/);
  const cartao = readFileSync(new URL('../src/modulos/conexoes/Conexoes.tsx', import.meta.url), 'utf8');
  assert.match(cartao, /desativado=\{!c.chaveSalva \|\| conexaoEmTestes\(id\)\}/);
  assert.match(cartao, /conexaoEmTestes\(id\) \? T.conexoes.emTestes : T.conexoes.status\[status\]/);
  assert.match(cartao, /if \(conexaoEmTestes\(servico\)\) return <Modal/);
  const ilha = readFileSync(new URL('../src/janelas/ilha/Visoes.tsx', import.meta.url), 'utf8');
  assert.match(ilha, /disabled=\{conexaoEmTestes\(c.id\)\}/);
  const janela = readFileSync(new URL('../src/modulos/conexoes/JanelaConexao.tsx', import.meta.url), 'utf8');
  assert.match(janela, /if \(conexaoEmTestes\(janela.id\)\) return <Janela/);
});

test('tempo imediato e frações sobrevivem ao salvamento e à validação de configurações', async () => {
  for (const s of [-1, 0, .5, 1, 2, 3, 5]) {
    assert.equal(configuracoesValidas({ilha:{fechamentoSeg:s}}, CONFIG_PADRAO).ilha.fechamentoSeg,s);
    useConfig.getState().definirIlha({fechamentoSeg:s});
    await useConfig.persist.rehydrate();
    assert.equal(useConfig.getState().ilha.fechamentoSeg,s);
  }
});
