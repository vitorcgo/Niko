# Testes Linux — etapa 1

Revisão base: b5ff7425a3abbc0fbf7ef4b4ed655385348aea5f, com árvore local modificada. Esta evidência é preliminar; rerodar após integração final.

Versões observadas: Node v22.23.3, GJS 1.80.2, Python 3.12.3.

## Comandos e resultados

- `node --test servidor/midia-linux.test.mjs`: primeira tentativa no sandbox falhou. Diagnóstico com execução direta: D-Bus não conseguiu bind em socket /tmp, Operation not permitted. Não foi falha demonstrada da implementação.
- Mesmo comando executado com permissão ampliada para permitir exclusivamente laboratório privado: 1 teste externo e 1 interno passaram, zero falhas; 7,88 s total.
- `DBUS_SESSION_BUS_ADDRESS=unix:path=/tmp/niko-parent-bus-sentinel-inexistente node --test servidor/midia-linux.test.mjs`: passou (1 externo/1 interno), zero falhas; 9,20 s. Endereço sentinel confirma que wrapper substitui bus herdado.
- `node --test linux/gnome/isolamento.test.mjs`: 1 passou, zero falhas; inclui bash -n sem executar serviços.
- `git diff --check -- servidor/midia-linux.test.mjs`: passou.

Após essas execuções foi acrescentado t.after ao wrapper MPRIS para terminar seu filho caso o teste seja interrompido; exige rerodada final.

## Cobertura acrescentada

AccessDenied retornado pelo serviço; método lento sem responder (timeout do cliente); serviço encerrando no meio do comando; mesma identidade reaberta não aceita owner antigo; propriedade CanGoNext ausente não habilita nem envia controle; salvaguarda de endereço diferente do bus pai; limpeza de processo já encerrado.

## Evidências e limitações

D-Bus daemon, GJS/Gio e chamadas de produção rodaram nativamente no Linux. Players e conteúdo são simulados em bus privado. Isso comprova contratos/falhas, não comportamento de player pessoal real.
Teste GNOME inspeciona contrato do shell e sintaxe bash; não inicia GNOME, Mutter nem aplicativo. Nested real e confirmação manual instalada continuam pendentes. Não houve ação em mídia, rede, credenciais ou dados pessoais. Windows não executado.

## Hashes observados (preliminares)

- `servidor/midia-linux.test.mjs`: `3ecd91521b57281ea9578c467c9732110307a301274b038b679e3a5174542b55`
- `servidor/midiaLinux.ts`: `18a0ed05abbe33e314d2e54da7eab5492753b78190e32cfc85394e44440b6c42`
- `linux/gnome/isolamento.test.mjs`: `c0b0f2a06eebffafbbcdcdf84aebd94103092e4df446f6163173156743fe29a5`
- `linux/gnome/testar-isolado.sh`: `b80320ff999ec3ba9038084fc5494eda24f605dc8df4666ce630bc2cb861142b`

## Rerodada integrada final

MPRIS + isolamento: comando Node22 --test servidor/midia-linux.test.mjs linux/gnome/isolamento.test.mjs com bus pai sentinel inexistente passou: 2 externos, 0 falhas, 6,90s. Wrapper interno MPRIS também passou. t.after integrado testado. Shell foi posteriormente endurecido com bus.conf sem servicedirs/cache/state/APPDATA unset; teste de contrato adaptado e rerodado separadamente.

- `servidor/midia-linux.test.mjs`: `3ecd91521b57281ea9578c467c9732110307a301274b038b679e3a5174542b55`
- `servidor/midiaLinux.ts`: `18a0ed05abbe33e314d2e54da7eab5492753b78190e32cfc85394e44440b6c42`
- `linux/gnome/isolamento.test.mjs`: `fbe2fb3f6e7127db2a6e3147d369f28800c577a19a7d7a534a89e4d76abbbefc`
- `linux/gnome/testar-isolado.sh`: `82b1cc3e7ae0971d851e8b177c1402d5745f0a62467640aa3601b3b7e6965286`
