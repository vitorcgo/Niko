import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transformWithOxc} from 'vite';

const tick = () => new Promise(resolve => setImmediate(resolve));

for (const [fase, desativar] of [['unminimize', false], ['show', false], ['show', true]]) {
test(`cancelamento durante ${fase}, desativar=${desativar}, não reabre nem rouba foco`, async () => {
  let finalizar;
  const espera = new Promise(resolve => { finalizar = resolve; });
  const calls = [];
  const eventos = new Map();
  const hooks = [];
  let cursor = 0;
  let estado = 'compacta';
  let ativa = true;
  let simultaneas = 0;
  let maxSimultaneas = 0;
  const useIlha = selector => selector(useIlha.getState());
  useIlha.getState = () => ({estado, abrir() { estado = 'expandida'; }, recolher() { estado = 'compacta'; }});
  const useConfig = selector => selector(useConfig.getState());
  useConfig.getState = () => ({ilha: {ativa}});
  const react = {
    createElement: () => null,
    useRef(value) { const index = cursor++; return hooks[index] ??= {current: value}; },
    useEffect(effect, deps) {
      const index = cursor++;
      const previous = hooks[index];
      if (previous && deps.every((v, i) => v === previous.deps[i])) return;
      previous?.cleanup?.();
      hooks[index] = {deps, cleanup: effect()};
    },
  };
  const operacao = async nome => {
    calls.push(nome);
    maxSimultaneas = Math.max(maxSimultaneas, ++simultaneas);
    if (nome === fase) await espera;
    simultaneas--;
  };
  const desktop = {LINUX: true, janelaAtual: async () => ({
    unminimize: () => operacao('unminimize'), show: () => operacao('show'),
    hide: () => operacao('hide'), setFocus: () => operacao('focus'),
  }), ouvirEvento: async (nome, callback) => { eventos.set(nome, callback); return () => eventos.delete(nome); }};
  const transformed = await transformWithOxc(readFileSync(new URL('../src/desktop/Aplicativos.tsx', import.meta.url), 'utf8'), 'Aplicativos.tsx', {jsx: {runtime: 'classic'}});
  const source = transformed.code.replace(/^import .*;$/gm, '').replace(/export function /g, 'function ') + '\nexports.AppIlha = AppIlha;';
  const exports = {};
  vm.runInNewContext(source, {exports, console, React: react, ...react, ...desktop, useIlha, useConfig,
    usarTema() {}, usarSincronia() {}, useServicos() {}, Ilha() {},
  });
  const render = () => { cursor = 0; exports.AppIlha(); };
  render();
  await tick();
  calls.length = 0;
  eventos.get('niko://mostrar-ilha')();
  render();
  await tick();
  assert.ok(calls.includes('unminimize'));
  eventos.get('niko://mostrar-ilha')();
  eventos.get('niko://revelar-ilha')();
  if (desativar) ativa = false;
  else eventos.get('niko://ocultar-ilha')();
  render();
  await tick();
  finalizar();
  await tick();
  await tick();
  assert.ok(calls.includes('hide'));
  assert.equal(maxSimultaneas, 1, 'operações de janela nunca sobrepõem');
  if (fase === 'unminimize') assert.equal(calls.includes('show'), false, 'cancelamento antes de show impede reabertura');
  assert.equal(calls.at(-1), 'hide', 'hide final prevalece após show em voo');
  assert.equal(calls.includes('focus'), false, 'ocultar não permite foco atrasado');
  hooks.forEach(hook => hook.cleanup?.());
});

}
