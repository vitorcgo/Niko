import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Contrato da fonte: não comprova renderização do aplicativo instalado.
test('aviso GNOME limita a promessa de sessão e aparece somente no Linux com ilha ativa', () => {
    const configuracoes = readFileSync(new URL('../src/modulos/configuracoes/Configuracoes.tsx', import.meta.url), 'utf8');
    const textos = readFileSync(new URL('../src/textos/textos.ts', import.meta.url), 'utf8');
    const avisos = [...configuracoes.matchAll(/\{([^{}\n]+)\s*&&\s*<AvisoFaixa>\{T\.configuracoes\.ilhaGnomeSessao\}<\/AvisoFaixa>\}/g)];
    assert.equal(avisos.length, 1, 'aviso pertence ao componente e não se duplica');
    const guard = avisos[0][1];
    for (const [LINUX, ativa, esperado] of [[true, true, true], [true, false, false], [false, true, false]]) {
        assert.equal(runInNewContext(guard, {LINUX, cfg: {ilha: {ativa}}}, {timeout: 100}), esperado,
            `contrato de visibilidade: Linux=${LINUX}, ilha ativa=${ativa}`);
    }
    const texto = textos.match(/ilhaGnomeSessao:\s*("(?:[^"\\]|\\.)*")/);
    assert.ok(texto, 'texto centralizado existe');
    const aviso = JSON.parse(texto[1]);
    assert.match(aviso, /atualização .* validada sem reiniciar a sessão/);
    assert.match(aviso, /primeira ativação .* ainda está em preparação/);
});
