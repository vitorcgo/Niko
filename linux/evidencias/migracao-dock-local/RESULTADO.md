# Atualização local da integração existente — 2026-10-07

Quando o carregador runtime não é conhecido pelo GNOME, o backend agora verifica a extensão local `niko-ilha@local` já existente. Reutiliza o instalador anterior para consultar/atualizar essa extensão com backup, validação de caminhos e marcador de código em cache. Não instala o carregador desconhecido, não publica extensão e não reinicia a sessão. Carregador presente e diferente continua exigindo o canal GNOME; journal e recuperação permanecem no fluxo runtime.

O diagnóstico e o botão de atualização estão disponíveis também em Configurações → Dock, mesmo com a ilha desativada. Extensão antiga carregada retorna `nova_sessao`, sem afirmar que o dock esteja ativo.

## Validação

- `src-tauri/recursos/node node_modules/typescript/bin/tsc --noEmit`: exit 0.
- `src-tauri/recursos/node servidor/gnome-ilha-linux.test.mjs`: exit 0. Gio/D-Bus real privado com serviço GNOME fictício: consulta não escreve, migração guarda backup e preserva aviso de nova sessão; não instala runtime desconhecido. Não é teste gráfico.
- `NIKO_TEST_NODE="$PWD/src-tauri/recursos/node" bash linux/gnome/native-sem-reinicio/run.sh runtime-helper`: exit 0. GNOME 46 nested privado: atualização A→B, rollback de payload inválido, compositor preservado e legado intacto.
- Mesmo comando com `runtime-helper-clean`: exit 0. GNOME real sem extensão existente continua `canal_gnome`, sem cópia nem alteração de configurações.
- `git diff --check`: passou.

## Limites

A migração da extensão antiga foi testada contra serviço fictício; a execução gráfica do novo dock após essa migração ainda não foi validada. Os testes GNOME acima são regressões do carregador, não prova desse dock na sessão pessoal. Esta alteração ainda não foi empacotada nem instalada. Não houve logout, reload, escrita em configuração pessoal ou publicação. A primeira atualização do legado em cache requer nova sessão voluntária; atualizações de payload do carregador já reconhecido continuam sem logout. Proteção D-Bus e modos do dock pendentes na etapa anterior continuam pendentes.

## Continuação: migração GNOME real e segurança do dock

- `run.sh legacy-update`: passou com painel de extensão antiga fictícia realmente carregado no GNOME 46 nested. Atualização gravou código novo, guardou backup, manteve o mesmo compositor e retornou `nova_sessao`; não declarou código em cache atualizado. HOME/XDG, sessão e sistema D-Bus privados.
- Contratos da extensão e de janelas passaram, incluindo permissão para filhos do Niko e recusa de processo externo/executável que apenas usa o mesmo nome D-Bus.
- Dock fixo no GNOME headless privado com Tauri/WebKit real passou com a fonte final da extensão: clique em região transparente, logo, item, miniatura limitada, foco/minimizar/restaurar/fechar, ID obsoleto, fullscreen e reserva. Cliente externo recusado; chamadas funcionais atravessaram a ponte HTTP do Niko em namespace de rede privado. Este primeiro teste ainda usou o pacote anterior para o aplicativo; será distinguido da verificação do novo pacote.

Modos esconder/inteligente e estabilidade `stack_position` continuam separados e pendentes.

## Pacote e instalação concluídos

Build locked/offline exit0. Pacote SHA256 `b6f6f80ff2f6525259102e7dc1cedd0553fd755b75281e233e724f4520b8d46d` passou no checker. Repetição com esse pacote e fonte final da extensão no GNOME headless privado passou: dock fixo, input, miniaturas, ações, reserva e fullscreen. A fonte carregada no laboratório vem do repositório; checker confirmou igualdade com a extensão empacotada.

Instalação pessoal explicitamente autorizada: pkexec dpkg exit0, `install ok installed`. Executável, Node, ponte e extensão instalada iguais por SHA256 ao pacote. Atualização da extensão local pelo helper validado: antes `instalar`, depois `nova_sessao`; cópia local igual ao pacote e versão anterior preservada em backup. Nenhum logout ou reinício da sessão, nenhum dado pessoal testado. A sessão pessoal ainda usa código antigo em cache; visualização do dock nessa sessão fica pendente de nova sessão voluntária e abertura do aplicativo atualizado.
