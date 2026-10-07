# Estado atual consolidado — Linux e Windows

Leitura consolidada: [o que fizemos e por quê](../../CONTRIBUTION_LINUX.md). Em 07/10/2026, o usuário confirmou Chat, conexão de email e funcionamento geral no uso pessoal; relato manual, sem nova execução automatizada e sem comprovação de cada operação individual.

## Atualização de 07/10/2026 — rodada conjunta e correção de recarga

Registro atual: [resultado da rodada](finalizacao-gnome46/RESULTADO.md).
OCR instalado e testado com Tesseract do sistema; dependências declaradas no .deb.
Pacote corrigido instalado e carregador ativo sem reiniciar a sessão. Recarga agora
adota ilha/dock existentes, preserva foco e reaplica reserva por geração.
Suíte: 118 testes, 116 passaram, zero falhas, 2 Windows pulados. GNOME privado com
Tauri/WebKit real passou fixo/inteligente/esconder, inclusive recarga; 20 ciclos
minimizar/focar passaram. Hardware e desempenho medidos por leitura estrita.
Confirmação visual pessoal do dock corrigido pendente. Não declara estabilidade
completa; stack_position/MSDK históricos e limites de paridade permanecem.
Licença inalterada; falta autorização escrita do titular para envio/publicação.


## Atualização de 07/10/2026 — pendências do escopo inicial implementadas localmente

Este registro prevalece sobre o histórico para dock/janelas, sistema, OCR, Gmail e consumo.
Inventário, evidências e limites: [pendencias-gnome46/RESULTADO.md](pendencias-gnome46/RESULTADO.md).
Dock: ícones, miniaturas, fixo/inteligente/esconder, reserva e ações GNOME implementados;
cliente GJS persistente reduz criação de processos. Sistema via APIs GNOME/UPower/NM/BlueZ/
logind/PipeWire/SNI, com painel acessível em Configurações → Sistema. OCR Tesseract,
abertura OAuth Gmail via gio e consumo/alertas opt-in implementados reutilizando fluxos existentes.
Suíte: 114 passaram, 0 falhas, 3 pulados. OCR/PipeWire nativos privados passaram separadamente.
Gmail/consumo com serviços/credenciais fictícios; não são validação autenticada pessoal.

Tauri/WebKit real privado validou dock e painel; pacote final local preparado, não instalado
nesta rodada. OCR exige instalar dependências ainda ausentes no sistema pessoal mediante
autorização específica. Hardware/uso diário e estabilidade continuam pendentes para rodada conjunta.
Barra lateral da ilha e abas Chat/Claude não têm paridade Windows; distribuição/instalação limpa separadas.
Uma rodada nativa falhou no foco com integracao_janelas_indisponivel; repetição passou sem mudança no produto, causa pendente. CPU privada variou; ganho em hardware ainda não comprovado. Histórico stack_position e biblioteca MSDK do sistema continuam abertos. Windows não executado aqui.
Licença inalterada; autorização escrita do titular não comprovada; sem publicação/push/PR.

## Registros anteriores (consultar revisão e data antes de usar)

Esta é a matriz vigente; `VALIDACAO.md` conserva o histórico. Base Git:
`b5ff7425a3abbc0fbf7ef4b4ed655385348aea5f`, com alterações locais preservadas,
sem commit/push/publicação. Snapshots históricos: `continuacao.sha256` e `tauri-real.sha256`.
Última rodada: `validacao-pendencias/` e `validacao-pendencias-final.sha256`.

Escopo observado: Ubuntu 24.04.5 LTS, x86_64, GNOME Shell 46.0, Mutter
46.2-1ubuntu0.24.04.16, GTK 3.24.41, sessão Wayland. É uma adaptação experimental;
não há suporte Linux geral nem estabilidade completa comprovados.

| Verificação desta rodada | Resultado | Evidência |
| --- | --- | --- |
| `pnpm test` com Node22, última rodada | 105 testes: 102 passaram, 1 falhou (MPRIS), 2 Windows pulados. MPRIS isolado passou na repetição; suíte completa não aprovada nesta rodada | `validacao-pendencias/suite-final.txt`, `mpris-recheck.txt` |
| `pnpm verificar` | Passou | `continuacao-types-final.txt` |
| `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --lib` | 11 passaram | `continuacao-rust.txt` |
| `python3 scripts/migrar-dados-linux.test.py` | Passou | `continuacao-migracao.txt` |
| GTK fictício síncrono, baseline atual | Falhou: quatro criticals stack_position; ciclos passaram | `tauri-real/gtk-sincrono/` |
| Tauri/WebKit real, com extensão | Cinco ciclos/foco/posição/tablist passaram; listener privado e cleanup conferidos | `tauri-real/tauri-final/` |
| Tauri/WebKit real, sem extensão | Cinco ciclos/foco e listener privado passaram; runner anterior ao reforço de cleanup | `tauri-real/tauri-baseline/` |
| Tauri/WebKit real sem override DMABUF | Cinco ciclos e cleanup passaram; não valida todas GPUs/uso de vídeo | `tauri-real/tauri-sem-dmabuf/` |
| Contratos afetados/recusa de isolamento | 5 passaram; novo teste descoberto pela suíte existente; suíte inteira anterior preservada | `tauri-real/contratos.txt` |
| Fullscreen Tauri, última rodada | Passou com extensão corrigida, exit0; outra execução preservada falhou por stack_position | `validacao-pendencias/fullscreen-corrigido/`, `tauri-fullscreen/` |
| Tauri sem extensão, última rodada | Cinco ciclos funcionais passaram; gate FALHOU por stack_position | `validacao-pendencias/baseline-final/` |
| GStreamer separado | CRITICAL reproduzido sem Niko no MSDK; PCM/EOS passou, WebKit pendente | `../diagnostico-gstreamer/RESULTADO.md` |
| Revisão independente | Três achados corrigidos; nenhum bloqueador estático novo | `VALIDACAO.md`, seção Continuação |
| Build release e pacote da revisão | Passaram; .deb 50,65 MiB; payload integrado conferido; não instalado | `continuacao-build.txt`, `continuacao-pacote.txt` |

Pacote desta revisão: `src-tauri/target/release/bundle/deb/Niko_0.2.0_amd64.deb`,
SHA256 `81e7a26eba84b7c0ea1801d1245500229e499ec2f7bd69904bd444a6ae73fe9c`.
Conferência independente: cinco payloads e 213 arquivos do manifesto passaram.
Não instalado; extensão pessoal não atualizada nesta rodada. O .deb acima antecede
a correção de índice nativo desta última validação; não representa a fonte atual da extensão.

A = automação; N = integração nativa; P = pacote; M = confirmação manual.
Resultados anteriores continuam válidos apenas para comportamentos/revisões que
não foram afetados. Um PASS funcional com critical no log não fecha o teste nativo.

| Recurso | Linux A | Linux N | Linux P | Linux M | Windows A / N / P / M |
| --- | --- | --- | --- | --- | --- |
| Janela principal e dados | SQLite temporário, reinício, migração/WAL/backup e contratos | Node/SQLite reais isolados; interface simulada | Payload integrado conferido; não instalado | Janela anterior confirmada; persistência instalada desta revisão pendente | Contratos comuns executados no Linux; Windows real pendente |
| Ilha: mostrar/recolher/cancelar | IPC controlado: cancelamento em unminimize/show, desativação, rajadas e serialização | Tauri/WebKit/frontend/IPC reais: cinco ciclos com/sem extensão passaram; startup imediato e cancelamento gráfico ainda pendentes | Novo frontend conferido no .deb; não instalado | Confirmações anteriores preservadas; cancelamento desta revisão pendente | Ramo Linux guardado; runtime Windows pendente |
| Ilha: fullscreen/bloqueio | Ator próprio ocultado/restaurado; sem foco; cleanup; ator nulo/oculto/minimizado/workspace inativa | Fullscreen Tauri/Mutter real passou: entrada/saída, sem roubo de foco, ocultação e reabertura. Falha geral intermitente de foco permanece | Extensão no código corrigida após geração do .deb; pacote anterior não contém guarda de índice nativo | Fullscreen e bloqueio desta revisão pendentes | Extensão exclusiva GNOME; Windows real pendente |
| Ilha: monitores/escala | Coordenadas primárias deslocadas; monitor ausente/removido; não restaura índice inválido | Tauri nested: dois monitores, primário deslocado, 100%/200%/125% e desativação lógica passaram funcionalmente. Índice inválido corrigido; repetição exit0, execução anterior falhou por stack_position. Hardware físico pendente | Correção de índice nativo ainda não incluída no .deb anterior | Hardware/escala pendentes | Windows real pendente |
| GTK/Mutter: estabilidade canônica | Contratos não comprovam estabilidade gráfica | GTK síncrono fictício FALHA; GTK delay250 passa como diagnóstico; Tauri real reproduziu stack_position COM e SEM extensão; falha intermitente aberta. GStreamer isolado no plugin MSDK, correção e mídia WebKit pendentes | Empacotamento não resolve falha | Cinco ciclos históricos confirmados não anulam falha nativa | Não aplicável ao GTK; regressão Windows pendente |
| Instalação/ativação assistida GNOME | Contratos privados: readonly/auth/estados/cache/permissões/backup/rollback | API Extensions real, GNOME nested: evidência anterior | Pacote anterior instalado e comparado; novo payload conferido; não instalado | Ambiente já configurado confirmado anteriormente; update atual pendente | Guards revisados; runtime pendente |
| Atalho | GSettings/concorrência/rollback | Backend keyfile real isolado; captura global não comprovada | Implementação anterior mantida | Combinação física com outro app em foco pendente | Execução nativa pendente |
| Mídia/capa | MPRIS simulado: capacidades/permissões/timeout/troca/owner/capa | Gio/GJS/D-Bus reais com players fictícios | Ponte anterior mantida | Controles históricos confirmados; capa/revisão instalada pendentes | Dois testes nativos pulados; Windows real pendente |
| Cofre/reset/exclusão | Contratos de falhas, concorrência, preservação de metadata/banco | Secret Service privado, credenciais fictícias, restart/persistência: evidência anterior | Ponte anterior mantida | Cofre instalado pendente; não testar reset em dados pessoais | PowerShell/advapi32 reais pendentes |
| Instalação limpa/autostart/WebKit | Verificação de payload; autostart e matriz de variáveis ainda pendentes | Pacote extraído iniciou e cinco ciclos passaram sem DMABUF; instalação/autostart e outras GPUs pendentes | Payload integrado conferido; não instalado | Pendente; nenhuma mudança na sessão pessoal nesta rodada | Instalador/startup Windows pendentes |
| Dock/janelas/miniaturas | Ainda não implementados no Linux | Pendente | Sem implementação Linux | Pendente | Implementação existente preservada, regressão pendente |
| Controles de sistema/OCR/Gmail OAuth/consumo | Integrações Linux ainda pendentes | Pendente | Sem implementação Linux | Pendente | Implementações existentes preservadas, regressão pendente |
| CI/distribuição/atualização | Workflow existente lido; checks locais passaram | CI remota e Windows indisponíveis nesta rodada | .deb local gerado e conferido; updater Linux não validado | Atualização automática Linux pendente | Workflow preparado, não executado; build/pacote/manual pendentes |

## Meta: instalar e atualizar sem reiniciar a sessão

Estado: investigação ativa. Diagnóstico GNOME46 comprova que copiar a extensão
local após startup não a descobre; Enable=false, Reload indisponível, Eval bloqueado.
Protótipo com carregador estável executou revisões novas na mesma sessão.
Migração/reversão entre UUIDs já conhecidos no startup foi testada; ainda não
integra produção nem resolve descoberta da primeira instalação após startup.
Ver `../gnome/native-sem-reinicio/README.md` e `sem-reinicio/`.

## Validação manual necessária após instalação autorizada

Não executar logout, reset, mudar conectividade/cofre/mídia nem recarregar a sessão
automaticamente. O pacote distribui a extensão; o GNOME pode manter código antigo
em cache. Registrar a versão efetivamente carregada antes de atribuir resultado ao
novo código. A instalação/atualização da integração requer ação explícita; nova
sessão, se necessária, fica a critério do usuário.

1. Abrir a ilha e recolher rapidamente com Escape; repetir durante abertura e
   desabilitar a ilha enquanto abre. Ela deve permanecer oculta, sem foco tardio.
2. Com a ilha aberta, colocar um aplicativo escolhido pelo usuário em fullscreen;
   conferir que a ilha some. Ao sair, não deve roubar foco nem reaparecer em outra
   workspace. Não usar mídia pessoal para este teste.
3. Se houver hardware disponível: conferir monitor primário deslocado, mudança de
   primário, desconexão e escala 100%/fracionária. A ilha deve ficar centralizada
   abaixo do painel, sem janela inacessível.
4. Acionar o atalho físico com outro aplicativo em foco. Registrar combinação,
   resultado e eventual conflito, sem alterar atalhos pessoais para contorná-lo.

Pendências independentes mantidas: cofre/persistência/capa instalados, instalação
limpa/autostart/variáveis WebKit e Windows. Dock e etapas seguintes não são
declarados concluídos enquanto os critérios necessários da ilha permanecerem abertos.

## Helper de atualização runtime — rodada nativa integrada

`bash linux/gnome/native-sem-reinicio/run.sh runtime-helper` passou exit0 em
GNOME46 nested privado, laboratório `/tmp/niko-sem-reinicio.YcwTuB`; teste55,80s.
Fontes e logs preservados em `runtime-helper-final/`, helper SHA256
`c8896431f4973aea317a28f658cbb0c5030d84b111da46fa6aaf37974f555bd6`.

| Recurso | Automatizado Linux | Nativo Linux | Pacote / manual / Windows |
| --- | --- | --- | --- |
| Helper runtime, UUID conhecido no startup | Teste reproduzível chama helper real; fonte payload B e erro fictício | A→B código executado, D-Bus active/Revision desejada, owner/PID compositor iguais; GET não escreve; arquivos legado preservados | Distribuição e fluxo instalado dependem da rodada de integração; Windows não executado por este teste |
| Rollback payload inválido | Falha não anuncia ativa; manifesto B restaurado | Runtime previamente ativo volta B; runtime inicialmente desabilitado permanece desabilitado tanto com legado ativo quanto com legado desabilitado; legado recupera estado original | Não prova recuperação após crash entre renames |
| UUID desconhecido após startup | GET e instalar retornam canal_gnome | Rodada clean `/tmp/niko-sem-reinicio.b6LwzW`: sem copiar destino ou mudar enabled-extensions; helper anterior à última correção de rollback | Não equivale a primeira instalação sem nova sessão |

Compositor/cliente privados encerrados e gate de CRITICAL passaram. D-Bus,
GNOME Shell e helper são reais; cliente SingleInstance e payload com erro são
fictícios. Os ajustes gsettings usam backend keyfile e HOME/XDG temporários,
com guarda explícita antes de escrever. Sem alteração da sessão pessoal.
Colisão do nome D-Bus runtime passou no teste dedicado registrado abaixo; queda externa do compositor e recuperação após
crash continuam pendentes. Esta rodada não confirma clique no aplicativo
instalado nem instalação inicial do novo UUID na sessão já em andamento.

### Colisão D-Bus runtime — teste nativo dedicado

`NIKO_GNOME_COLLISION=1 bash linux/gnome/native-sem-reinicio/run.sh runtime-helper`
passou exit0, laboratório `/tmp/niko-sem-reinicio.TaAUvz`, teste2,68s.
Owner fictício GJS mantém `com.niko.Ilha.Integracao` antes da habilitação:
helper GET/install devolvem erro/owner_invalido sem gravar arquivos; candidato
real recebe name-lost durante import de payload com espera1s e não chama
`enable` do payload. Consulta direta ao owner Shell confirma Stateerror e
LastErrorbus_unavailable. Mesmo compositor, gate e cleanup passaram.
Evidências preservadas em `runtime-helper-collision/`. Colisão/proprietário e
payload lento são fictícios; D-Bus, GJS e GNOME nested são reais. Não testa queda
da conexão depois que uma implementação já está ativa ou recuperação após crash.

### Runtime integrado final: canal, colisão e perda do nome

Helper `1e954423360149850addfa0f290d2c221294e3b22e6e68580adcfb8055f8ecd2`
e loader `1434a4e8137d761f4cbbe8a077c5da21eb20e479d0c38b6c08cee333907701f4`:
GNOME nested lifecycle final passou (`Blouik`,67,09s) com metadata instalada
version2/description normalizada versus origem version1, bootstrap igual,
A→B e rollback inicialmente ativo/desabilitado com/sem legado. Colisão nativa
final passou (`dFNc7c`,7,00s); helper owner inválido não escreve e import tardio
não ativa payload. Gates de CRITICAL e cleanup dos dois laboratórios passaram.
Proxy Extensions encerrou objeto em uma tentativa de cleanup; teste passou após
usar API Extensions nativa do Shell, mesma API usada pelo helper.

Perda do nome depois de implementação ativa reproduziu falha em teste headless;
correção passou2casos, incluindo disable que lança erro. Fonte real do loader,
import/payload e callback simulados. O nome não permite ALLOW_REPLACEMENT, então
contender nativo não pode roubá-lo enquanto ativo; desconexão real do Shell não
foi induzida e permanece limite. Evidências em `runtime-integrado-final/`.
Não representa recuperação após crash ou confirmação manual instalada.

## Suíte após ajustes do runtime — 06/10/2026

`node scripts/testar.mjs` terminou exit0: 106 testes, 104 passaram, nenhum
falhou, 2 ignorados (Windows). O teste MPRIS privado passou nesta rodada.
Os dois testes de perda de ownership passaram separadamente e agora integram
a descoberta padrão; não estavam na lista capturada ao iniciar esta rodada.
Log: `runtime-integrado-final/suite.log`. O resultado substitui a falha da suíte
antiga para esta revisão, sem substituir validação gráfica ou instalação real.

Clean UUID desconhecido repetido na fonte final helper1e954/loader1434:
`runtime-helper-clean` passou exit0, SP6WOm,1,60s; GET/install canal_gnome,
sem copiar destino ou alterar habilitações. Gate e cleanup passaram;
`runtime-integrado-final/clean/` preserva logs e SHA. Substitui a lacuna da
rodada clean histórica com helper anterior; não muda limite da primeira instalação.

## Tauri real com runtime do pacote atual

Rodada `/tmp/niko-tauri.z9IvcX` terminou exit0 e cleanupPASS. Cinco ciclos
mostrar/ocultar/reabrir com mesmo appPID62206 passaram, incluindo active/Revision,
owner do Shell, âncora, foco e exclusão da tablist. Loader do próprio pacote
SHA256 `0ed7f74e1375a2559ca981e06831448875ec3995d5c0d46aeb9739f70a276e2e`,
verificado antes de iniciar. Evidências: `runtime-integrado-final/tauri/`.

UUID pré-registrado antes do startup; não testa primeira instalação ou endpoint
instalar do helper no aplicativo. Duas CRITICAL do GStreamer e warnings de ping
persistem. Não elimina falha stack_position intermitente anterior. Falha inicial
da fixture (metadata.description ausente) foi corrigida somente no runner e
preservada no relato do laboratório. Sem instalação ou alteração da sessão pessoal.

### Recuperação explícita após SIGKILL do helper runtime

Helper `b53f4b090d64f8370ab63937ec21d8f424859d0e91d2c8640bdc45f4c65ba657`
gravou journal exclusivo antes de mudar habilitações/manifesto. GET com journal
é readonly e retorna recuperar. POST confere GUID do barramento, owner Shell,
PID do escritor, bootstrap e payload anterior por SHA; só remove journal após
manifesto e estados confirmados. Escritor de outro processo vivo impede recovery.
Owner/GUID/hash adulterados são recusados sem restaurar manifesto.

`NIKO_GNOME_CRASH=1 .../run.sh runtime-helper` passou exit0 em GNOME46 nested
privado, mnGnIY,33,04s. Quatro SIGKILL reais de grupos helper filhos: após criar
journal e após trocar manifesto, nos estados runtime ativo/legado desabilitado
e runtime desabilitado/legado ativo. POST recuperada restaurou manifesto B e
estados originais. Payloads com espera têm URI/hash distintos por caso; não
instrumentam código de produção. Gate e cleanup passaram. Regressão lifecycle
A→B e rollback após falha de payload também passou,6nemwe,64,40s.

Logs/types/SHA em `runtime-journal/`. Não comprova perda de energia/fsync,
recuperação automática, todos os pontos possíveis de SIGKILL ou restart do
compositor. Outro barramento/sessão exige decisão explícita e conserva journal;
não altera o compositor automaticamente. Instalação/manual do novo fluxo ficam
pendentes até o pacote final e validação autorizada; Windows não executado.

## Endpoint empacotado e suíte após journal

Pacote atual SHA256 `224efa08ca648a608186b5bdaf569e209d84079f6d31ac8877d3a023a87658bd`
passou build/verificação. HTTP real da ponte extraída em GNOME nested passou
GET readonly, POST inválidos sem escrita e atualização autenticada com revisão
correta. Namespace readonly sobrepôs recursos apenas no laboratório; fingerprint
do host antes/depois idêntico; cleanupPASS. Evidências `runtime-journal/http/`.
Suíte final: 108 testes, 106 aprovados, 2 Windows ignorados, nenhum erro.
UI de recuperação implementada e tipos/build passaram; clique visual não testado.

## WebKit mídia e origem do aviso MSDK

Motor WebKitGTK4.1 real reproduziu WAV silencioso e vídeo Theora de1s no
ambiente privado: ended/currentTime e 27 quadros de pixels distintos; exit0
e cleanupPASS. Não prova reprodução no componente Niko nem som físico ou
todos codecs. Causa exata da assertiva MSDK confirmada por GDB (` VUYA`) e
commit upstream; experimento no argumento do processo elimina assertiva sem
modificar biblioteca. Correção da distribuição não instalada. Evidências em
`../../linux/diagnostico-gstreamer/RESULTADO.md`.
