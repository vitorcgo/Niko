# Cofre Linux — evidências da revisão integrada

Base: b5ff7425a3abbc0fbf7ef4b4ed655385348aea5f mais árvore modificada identificada abaixo. Node v22.23.3; GJS 1.80.2; gnome-keyring-daemon 46.1; Python 3.12.3.

## Execuções

Comando final nativo:

`DBUS_SESSION_BUS_ADDRESS=unix:path=/tmp/niko-secret-parent-sentinel-inexistente node --test servidor/segredos-linux.test.mjs`

Executado com permissão ampliada exclusivamente para sockets privados. Resultado: 1 teste externo + 1 interno passaram; zero falhas; 22,78 s. Wrapper cria bus.conf sem servicedirs, HOME/data/config/runtime/control temporários, sem DISPLAY/Wayland e sem APPDATA herdado. Não permite ativação automática. Senha fictícia do daemon e segredos fictícios via stdin. Recursos removidos ao terminar.

Comando portátil simulado:

`DBUS_SESSION_BUS_ADDRESS=unix:path=/tmp/niko-contrato-bus-sentinel-inexistente node --test servidor/segredos-contrato.test.mjs`

Passou, zero falhas; 3,90 s. `node --test` agregou o arquivo em 1 teste; execução direta anterior mostrou os dois casos linux/win32 passando. A fonte é transformada somente em memória para plataforma e subprocesso fictício. Imports obrigatoriamente interceptadas, sem criação de scripts ou subprocessos. Timeout reduzido em memória para 100 ms testa cancelamento e recuperação da fila.

## O que rodou nativamente

- D-Bus daemon, GJS/Gio/Secret e gnome-keyring-daemon reais em laboratório privado.
- Store/lookup/delete, item ausente, chave unicode, reinício do daemon com persistência, serviço ausente sem autostart, coleção bloqueada sem prompt.
- Fila por id: oito writes concorrentes, read/write/delete intercalados; ids diferentes concorrentes.
- Dois provedores salvos simultaneamente com ids diferentes: metadata e cofre preservados. Update e delete no mesmo id terminam sem metadata/segredo.
- Provedor sem chave removido mesmo sem serviço. Provedor/conexão com chave preservam temChave quando exclusão falha.
- SQLite real temporário e middleware real /dados/zerar preservam dados e metadata quando cofre falha; banco inválido é rejeitado antes de apagar credenciais.
- /proc snapshots de filhos monitoraram argv sem valores fictícios. Kernel recusou environ em 60 snapshots; isso é limitação de inspeção, não evidência de ambiente integralmente inspecionado.

## O que foi simulado

- Serviço Secret Service GJS retorna AccessDenied de fato em ReadAlias, ou / indicando coleção ausente. Três exports exigem cofre_nao_configurado no segundo cenário. Assert exige cofre_acesso_negado. Esse teste revelou erro de mapeamento por String(error), corrigido com GLib.Error.matches.
- Requisição/resposta do middleware reset são streams/objetos simulados; não houve servidor HTTP nessa cobertura.
- Contrato portátil: Windows/cache/erro apagar e Linux/ENOENT/fila/stdin/timeout/recovery usando subprocesso fictício. Verificação textual do código1168 declara idempotência, mas não executa advapi32. Não comprova Windows real.

## Falhas anteriores e correções

- Auto-review inicial expirou antes de decidir; retry único permitido executou teste.
- Monitor environ lançou EACCES; ajustado para registrar limitação mantendo inspeção argv.
- AccessDenied virava cofre_falha; produção corrigida com domain/code matches e rerodada passou.
- Assert reset inicialmente esperava500; middleware existente retorna400. Ajustado ao contrato observado; preservação de dados permanece obrigatória.
- Primeira tentativa de mock via Vite resolveId não interceptou builtin. Tentou leitura gjs, sandbox negou bus, e powershell ENOENT; nenhuma operação de gravação/exclusão pessoal. Substituído por transform obrigatório das imports e execução sentinel. Evidência final usa mocks efetivos.

## Pendências

Aplicativo instalado/manual com usuário e execução Windows real não realizadas pelo agente. Empacotamento/build/CI ficam nas evidências do principal. Testes isolados não equivalem a uso do cofre pessoal. Ausência de typelib específica não foi reproduzida removendo dependência do host; executable ausente é simulado com ENOENT.

## Hashes finais observados

- `servidor/segredos-linux.test.mjs`: `7d3216bc99a6cd87c364c7819e1a06f171e5a2da07fd580befeef9433d0cfa6b`
- `servidor/segredos-contrato.test.mjs`: `c51dd203ed036b3d19c3cde5bef01bde2b3f580166303661dfce75ddf221fd35`
- `servidor/segredos.ts`: `b93f6dd3c2e2fff3af2d48e74413af19d106a6b32dd16aea6a5894aa6a4d2f43`
- `servidor/segredosLinux.ts`: `cde74a42f0855095d7284d2fbf17941d71a7695e949fd213cb53a11b612d84e5`
- `servidor/ia.ts`: `f7ab1dc7c2ebfa03a5626fb0a575891526ff56e0f59e4ca3f0e225513962eb0b`
- `servidor/conexoes.ts`: `4d86745cb459b923f26a852ea93e1ccbc1e0b56f542c47451cd24a796e480cb8`
- `servidor/ponte.ts`: `2e5e6f7f88e1b0bfb68a47c9f8ce993b9c6109a5d6243da4b5b5dc245c27ef25`

Rerodada contrato + isolamento endurecido: 2/2 arquivos passaram, zero falhas, 2,90s. Sintaxe node --check e git diff --check passaram nos arquivos de testes.
