# Validação Linux e Windows — 06/10/2026

Matriz vigente consolidada: [MATRIZ_ATUAL.md](MATRIZ_ATUAL.md). Este documento
mantém os registros históricos; linhas antigas não substituem o estado vigente.

## Etapa 1 — testes, CI e correções

Base Git: `b5ff7425a3abbc0fbf7ef4b4ed655385348aea5f`, com alterações locais anteriores preservadas. `etapa1.sha256` é o registro histórico inicial. A revisão final está em `integrado.sha256`; conferir com `sha256sum -c linux/evidencias/integrado.sha256`.

Ambiente: Ubuntu 24.04, Node 22.23.3, pnpm 10.34.6, Cargo 1.99.0. PATH da rodada: `/home/usuario/.nvm/versions/node/v22.23.3/bin:/home/usuario/.cargo/bin:$PATH`.

| Comando | Resultado observado | Evidência |
| --- | --- | --- |
| `pnpm install --frozen-lockfile --offline --store-dir /caminho/cache-pnpm` | Passou; lockfile sem alteração | `/tmp/niko-etapa1-install.log` |
| `pnpm verificar` | Passou | `/tmp/niko-etapa1-types.log` |
| `pnpm build` | Passou | `/tmp/niko-etapa1-build.log` |
| `pnpm ponte:build` | Passou | `/tmp/niko-etapa1-ponte-build.log` |
| `pnpm test` | 96 testes: 94 passaram, 0 falharam, 2 testes Windows pulados | `/tmp/niko-etapa1-tests.log` |
| `python3 scripts/migrar-dados-linux.test.py` | Passou; bancos temporários/WAL/integridade/backup/recusas | `/tmp/niko-etapa1-migracao.log` |
| `cargo check --locked --offline --manifest-path src-tauri/Cargo.toml` | Passou | `/tmp/niko-etapa1-cargo.log` |
| `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --lib` | 10 passaram, 0 falharam | `/tmp/niko-etapa1-cargo.log` |
| `git diff --check` | Passou | Execução local |

A primeira instalação falhou por acesso ao store padrão fora do workspace; repetida com o store existente e autorização da ferramenta. Testes com sockets rodaram fora do sandbox restrito para criar D-Bus próprio e servidores locais temporários.

### Natureza das evidências

- Nativo: processos Node/GJS/Gio/D-Bus privado, SQLite real temporário com reinício abrupto, execução Rust, compilação frontend/ponte.
- Simulado: players MPRIS (inclui AccessDenied, timeout, morte/troca de serviço), React/serviços da ilha, timers/storage da interface, GNOME Shell/Meta.Window da extensão, gsettings do teste de rollback/concorrência.
- O teste do laboratório GNOME verifica contrato e sintaxe; não iniciou compositor nem demonstra interação gráfica.
- Revisão independente confirmou correção do isolamento e serialização e não apontou novo bloqueante estático. Não substitui execução.

### Estado e limites

Automação desta etapa passou. Etapa geral Linux permanece **em andamento**, sem pacote desta revisão, GNOME nested desta revisão, CI remota executada ou Windows executado. Foco/capa do aplicativo instalado precisam de confirmação manual atual. Não houve instalação, troca de serviço pessoal, modificação de mídia, credencial, conectividade ou sessão.

## Próxima integração preparada — cofre Linux

Objetivo: usar Secret Service/libsecret pelo GJS já instalado, com segredo somente em stdin, coleção persistente, erros propagados e operações do mesmo ID serializadas. Preservar executor Windows. Testes usarão credenciais fictícias e daemon/D-Bus/diretórios exclusivos. Critérios: gravação/leitura/exclusão, ausência de item versus serviço, permissão negada/bloqueio/timeout, concorrência, persistência após reinício, build/pacote e confirmação manual. **Ainda não validada nem concluída.**

## Revisão integrada final — automação e pacote

Snapshot do pacote instalado anterior ao novo aviso: `integrado.sha256`; base Git acima, sem commit/push/PR nesta rodada. Lockfiles sem diferenças em relação à base. As fontes herdadas e novas foram testadas juntas. Hashes do código do cofre no relatório `cofre.md` e da extensão em `gnome-nativo.md` complementam o manifesto.

| Comando final | Resultado | Evidência preservada |
| --- | --- | --- |
| `pnpm test` | 99 testes; 97 passaram, 0 falharam, 2 testes Windows pulados; 46,94 s | `suite-final.txt` |
| `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --lib` | 11/11 passaram, inclui configuração real GSettings em keyfile temporário | `rust-final.txt` |
| `pnpm tauri build --config src-tauri/tauri.linux.conf.json -- --locked --offline` | Build release + .deb passaram; Rust release 4m00s; pacote 50,65 MiB | `build-pacote.txt` |
| `node linux/validar-pacote.mjs` | Passou: conteúdo/dependências/Node executável/bibliotecas presentes | `pacote.txt` |
| `linux/gnome/native/run.sh` | **FALHOU**, EXIT1: assertions funcionais passaram, mas Mutter emitiu critical stack_position cinco vezes | `gnome-nativo.md`, laboratório `/tmp/niko-native.eANGtG` |
| `NIKO_NATIVE_BASELINE=1 linux/gnome/native/run.sh` | **FALHOU**, EXIT1: mesmo critical quatro vezes, sem extensão de produção | `gnome-nativo.md`, `/tmp/niko-native.e2yk3G` |
| `NIKO_NATIVE_SHOW_ONLY=1 linux/gnome/native/run.sh` | EXIT0, somente diagnóstico; omite GTK present, não equivale ao fluxo Tauri | `gnome-nativo.md`, `/tmp/niko-native.wP5eCc` |

Pacote: `src-tauri/target/release/bundle/deb/Niko_0.2.0_amd64.deb`.
SHA-256: `1de81f2191bdf6573fc38948320a82a4599347b6cb686d3ee18e9162f5287ede`.
O checker extrai em pasta temporária, confere versão/dependências/.desktop/Node/ponte e compara o binário integralmente após a única troca documentada do marcador Tauri UNK → DEB. A tentativa inicial de hash sem essa troca falhou; foram observados exatamente três bytes diferentes, correspondentes ao marcador. Nenhuma diferença arbitrária é ignorada. Não instalou nem iniciou Niko. Os recursos da ponte do pacote são iguais aos reconstruídos e usados pela suíte final.

### Correções verificadas por testes

- Test runner descobre arquivos existentes e seleciona os nativos Linux por plataforma. CI preserva Windows e adiciona Linux, com instalação congelada, Rust locked, testes, build, .deb e checker. **Workflow preparado localmente, não executado no GitHub.**
- Laboratórios GNOME têm D-Bus sem diretórios de ativação automática, dados/config/cache/estado temporários e removem APPDATA herdado. O laboratório automatizado também usa runtime próprio.
- Configuração de atalho serializa leitura/gravação/confirmação/rollback; concorrência e backend keyfile real passaram. Não registra um atalho na sessão pessoal.
- Cofre usa libsecret/GJS e coleção persistente, sem cache Linux. Recusa coleção já bloqueada na consulta e serializa operações do mesmo ID. Falhas reais de permissão são identificadas por domínio/código GLib; segredo vai por stdin.
- Exclusão falha preserva metadados; provedor sem chave dispensa cofre; reset valida banco e limpa chaves antes do wipe. SQLite temporário e middleware de produção confirmaram preservação quando o cofre falha.
- Salvamento paralelo de provedores relê metadados após gravação da chave, preservando IDs distintos. Atualização/exclusão do mesmo ID também testadas.

### Limites que permanecem

A etapa GNOME **não está concluída**: o teste canônico falhou mesmo no baseline. A comparação não justifica alterar a extensão por tentativa. O diagnóstico que passou usa cliente GTK fictício sem present; não valida Tauri/WebKit nem o aplicativo instalado. O cofre e os demais recursos desta revisão também aguardam confirmação manual instalada.

A fila do cofre atua dentro de um processo; não é transação distribuída entre segredo/JSON/banco. Reset pode excluir algumas chaves antes de outra exclusão falhar, preservando o banco. Reset concorrente com novas configurações e múltiplos processos não foram validados. Se o estado de bloqueio mudar após a consulta, funções libsecret podem solicitar desbloqueio; essa corrida não foi validada. A inspeção de /proc/environ foi parcialmente negada pelo kernel e não demonstra inspeção completa do ambiente.

Não houve instalação/troca/encerramento do aplicativo pessoal, mudança de mídia, conectividade, credenciais reais, dados ou configuração da sessão. GNOME nested criou apenas janelas do laboratório. As confirmações históricas do CONTRIBUTION_LINUX.md pertencem às revisões anteriores.

## Matriz por recurso

A = testes automatizados; N = integração nativa; P = pacote; M = confirmação manual **desta revisão**. “Preparado” não significa CI executada.

| Recurso | Linux A | Linux N | Linux P | Linux M | Windows A / N / P / M |
| --- | --- | --- | --- | --- | --- |
| Mídia/capa MPRIS | Passou: capacidades, permissões, timeout, morte/troca/owner/faixa, capa segura | Gio/GJS/D-Bus reais com players simulados; player pessoal não usado | Ponte conferida no .deb | Pendente; aprovações históricas de controles não validam revisão atual | Testes comuns passam no Linux; 2 testes Windows pulados; CI preparada; execução/build/pacote/manual Windows pendentes |
| Persistência/saída/migração | Passou: SQLite temp, reinício SIGKILL, serialização/falhas/saída cancelada, migração WAL/backup | Node/SQLite reais; frontend/IPC simulados | Runtime/ponte conferidos | Pendente | Caminhos comuns e contratos simulados; execução Windows e manual pendentes |
| Ilha/extensão GNOME | Stubs e hooks passaram | **Canônico falhou** com Mutter/GTK3 reais; baseline também falha; show-only só diagnóstico | Binário contém ilha; extensão GNOME é separada, não instalada pelo .deb | Pendente: renderização, foco, capa, reabertura, fullscreen, monitores/escala | Rust Win32 preservado; CI preparada; A nativo/N/P/M Windows pendentes |
| Atalho da ilha | Concorrência/rollback/validação passaram | GSettings real, backend keyfile temporário passou; não prova captura global | Comando incluído | Pendente: combinação física com outro app em foco | Fluxo Ubuntu é isolado por cfg; atalhos Windows reais pendentes |
| Cofre de credenciais | Entradas inválidas, fila, perda/troca serviço, bloqueio, AccessDenied, coleção ausente, timeout/ENOENT simulados passaram | Secret Service/keyring reais privados; credenciais fictícias; persistência/restart passaram | GJS/gir1.2-secret-1 declarados; ponte incluída/conferida | Pendente, sem tocar cofre pessoal | Cache/stdin/erro excluir/idempotência simulados; advapi32/PowerShell nativos, CI, pacote e manual pendentes |
| Exclusão/reset com chaves | Passou: falha conserva metadata/banco; sem-chave funciona; banco inválido rejeitado | Middleware e SQLite reais com req/res simulados e cofre privado | Correções presentes na ponte | Pendente; não executar reset pessoal para teste | Código comum alterado; Windows real pendente |
| Build/distribuição/CI | Types, build, checker e lockfiles passaram | Bibliotecas Linux consultadas, Node do pacote executado | .deb gerado e payload verificado; **não instalado** | Pendente instalação/relocação | Workflow preparado; execução/build/pacote/manual Windows pendentes |
| Dock/miniaturas/controles de sistema/OCR/Gmail OAuth/consumo Windows | Integrações Linux ainda não implementadas nesta rodada | Não validado | Sem nova implementação | Pendente após fechar etapa atual | Implementações existentes preservadas; execução desta revisão pendente |

## Próxima validação com o usuário

Antes de avançar outra integração, validar a revisão no aplicativo instalado e resolver a pendência do compositor. A instalação substitui o pacote atual e o teste exige sair/reabrir Niko: requer autorização específica do usuário conforme sua restrição de sessão. Não resetar dados, mudar atalhos/extensões, tocar mídia/rede ou usar credenciais pessoais. Para cofre, combinar uma rodada explícita com credencial fictícia ou ambiente gráfico isolado; não testar APIs externas com dados reais. Windows requer runner/máquina próprios da mesma revisão.

## Instalação e reabertura autorizadas — 06/10/2026 17:31 -03

Usuário autorizou instalar o .deb verificado e fechar/reabrir apenas Niko. Consulta ao host antes da instalação não encontrou Niko nem listener47831; não houve processo pessoal a encerrar. Autenticação gráfica via pkexec feita no sistema, sem senha no chat.

- Comando: `pkexec /usr/bin/dpkg --install /caminho/Niko/src-tauri/target/release/bundle/deb/Niko_0.2.0_amd64.deb`; exit0. Log `/tmp/niko-instalacao-integrada.log`.
- `dpkg-query`: `install ok installed 0.2.0`. Um estado half-installed foi observado durante o unpack, depois resolvido pelo término normal do dpkg; não foi interpretado como falha final.
- `/usr/bin/niko`: SHA256 `5ae3a49aa352649a9758537d0ebc1fbc08eb08bc0845a8ddfc77f8171937140f`, igual ao payload DEB.
- `/usr/lib/Niko/recursos/ponte.mjs`: `e8506b9c9b81b7eb066880b34c5279935c6cf5a243e089cef6a061fbe93bb1ef`, igual ao recurso integrado.
- `/usr/lib/Niko/recursos/node`: `fde6a4bf8d0562f7751d1a2d6cb9b417c4cfe107bbcb0aa3e9a24e125e348f48`, igual ao recurso integrado; executáveis acessíveis.
- Revisor confirmou hashes e estado dpkg independentemente. Sandbox do revisor limitou consulta runtime; essa limitação não foi tratada como app encerrado.
- Abertura: `GDK_BACKEND=wayland WEBKIT_DISABLE_DMABUF_RENDERER=1 /usr/bin/niko`, sessão mantida58905. Principal observou no host PID144231 Niko e PID144243 Node filho; porta47831 ouvindo127.0.0.1.
- Nenhum endpoint de mídia/conexões/cofre/dados foi chamado para teste pelo agente. A abertura normal pode executar consultas já previstas pelo aplicativo. Não houve reset, edição de configurações, reload da extensão ou reinício da sessão GNOME.

**Atualização da matriz:** Linux P agora tem instalação real e runtime inicial observados para esta revisão. Linux M permanece pendente, inclusive aparência, cinco ciclos da ilha, foco/capa, persistência pela interface e cofre. A pergunta de confirmação visual foi enviada ao usuário. O teste canônico GNOME continua falhando no laboratório/baseline; a abertura do processo não resolve essa pendência. Windows e CI remota continuam pendentes. Não avançar declarando a etapa concluída.

### Confirmação manual do usuário — 06/10/2026 17:32 -03

Usuário confirmou: “Janela e cinco ciclos da ilha funcionaram”. Isso confirma aparência/abertura da janela principal e rodada de abertura/recolhimento da ilha, com posição/foco/avisos segundo o roteiro enviado, nesta instalação. Não presume observação individual de detalhes que não foram relatados nem valida persistência por edição/reinício, capa/controles de mídia, cofre, outras integrações ou Windows. A falha canônica do laboratório GTK/Mutter permanece registrada; não marcar suporte Linux geral concluído.

Matriz atualizada: Linux M de janela principal/ilha = confirmado nesta rodada de cinco ciclos; demais confirmações manuais continuam pendentes. Linux P = instalado, hashes e runtime inicial conferidos.

## Aviso ao habilitar a ilha — 06/10/2026

Pedido: evitar novas sessões para ajustes comuns e informar quando a integração GNOME exigir sair/entrar. Implementado aviso no Linux quando `cfg.ilha.ativa`, centralizado em `T.configuracoes.ilhaGnomeSessao`. Aparência, abas e configurações Niko não exigem recarregar extensão; código novo da extensão GNOME pode exigir nova sessão, inclusive em futuras atualizações. Não prometer única vez para sempre nem executar logout automático.

- `pnpm verificar`: passou, `/tmp/niko-aviso-types.log`.
- `pnpm build`: passou, `/tmp/niko-aviso-build.log`.
- `node --test scripts/ilha-aviso.test.mjs`: 1 passou, 0 falharam; resultado em `aviso-test.txt`.
- `git diff --check`: passou.
- Revisor confirmou guard Linux/ilha ativa, Windows preservado, ausência de comandos de sessão.
- Teste verifica o contrato da fonte e avalia a condição real nos cenários Linux ativo/inativo e Windows ativo; não é renderização visual de aplicativo.
- Agente de testes escreveu o teste, mas seu turno terminou por limite de uso; agente principal executou o teste integrado. Não atribuir execução ao agente que foi interrompido.

Hashes desta alteração: `aviso.sha256`. O pacote instalado ainda é o anterior, sem o novo aviso; não houve novo empacotamento/instalação ou mudança de sessão nesta rodada. A fonte atual difere do snapshot anterior em Configuracoes/textos/.gitignore e no novo teste. A confirmação visual anterior permanece válida para o pacote instalado, não valida o novo aviso.

Próximo trabalho identificado, ainda não implementado: incluir a extensão no pacote Linux e oferecer habilitação explícita com diagnóstico de compatibilidade/estado/erro. GNOME disponibiliza GetExtensionInfo e EnableExtension via D-Bus; nunca encerrar sessão automaticamente, nunca habilitar outras extensões e nunca anunciar pronta quando só foi instalada. Testar em barramento privado e GNOME nested antes de alterar sessão pessoal, com responsabilidades dos agentes restabelecidas.

Referências oficiais: https://gjs.guide/extensions/development/creating.html e https://gjs.guide/extensions/development/debugging.html (cache de código e Wayland); https://v2.tauri.app/distribute/debian/ (files no pacote); /usr/share/dbus-1/interfaces/org.gnome.Shell.Extensions.xml (contrato instalado). Limite atual: extensão foi desenhada para GNOME46, não declarar compatibilidade geral Linux.

## Instalação/ativação assistida GNOME46 — revisão final 06/10/2026

Implementação integrada pelo principal; agente testes_linux criou/executou contratos privados; agente testes_gnome criou/executou runner nativo; revisor verificou a fonte final sem editar. Base Git continua b5ff7425a3abbc0fbf7ef4b4ed655385348aea5f com alterações locais. Snapshot desta etapa: `gnome-integracao.sha256`, não substituir snapshots históricos. Helper final: 5522e73831ff9d2ee8b40f9065c1cd87791fec0bb39d3e99e24fd6541e4df1f3.

O .deb distribui a extensão versão2 em /usr/share/niko/gnome/niko-ilha@local; não a habilita no pós-install. Configurações → Ilha oferece ação autenticada e explícita para copiar/ativar somente esse UUID, backup e diagnóstico. Consultas não escrevem nem habilitam. Código carregado anterior é detectado por versão e marcador da sessão D-Bus, inclusive JS alterado sem incrementar versão. Nenhum logout/restart ou alteração da política global de extensões. GNOME46 somente. Ajustes comuns do Niko não exigem nova sessão; futuras alterações no código da extensão podem exigir.

| Comando na revisão integrada | Resultado | Evidência preservada |
| --- | --- | --- |
| `pnpm test` (Node22, fora sandbox para sockets privados) | 101 testes; 99 passaram; 0 falhas; 2 Windows nativos pulados | gnome-integracao-suite.txt |
| `pnpm verificar` | tsc exit0 | /tmp/niko-gnome-integracao-types.log |
| `pnpm tauri build --config src-tauri/tauri.linux.conf.json -- --locked --offline` | build frontend/ponte/Rust e .deb exit0 | gnome-integracao-build.txt |
| `pnpm tauri bundle --config src-tauri/tauri.linux.conf.json --bundles deb --ci` | reempacota binário compilado e ponte final, exit0 | gnome-integracao-bundle.txt |
| `node linux/validar-pacote.mjs` | exit0; hashes binário/ponte/Node/extensão, dependências e ldd | gnome-integracao-pacote.txt |
| `node --test servidor/gnome-ilha-linux.test.mjs` | agente executou helper final; exit0 | gnome-integracao-contratos.md |
| `linux/gnome/native-integracao/run.sh` | GNOME46/Mutter46.2 real, exit0, gate critical passou | gnome-integracao-native.md; /tmp/niko-native-integracao.SoNW6r |

Node22.23.3/pnpm10.34.6; dependências e lockfiles existentes usados. Última correção backend foi incorporada pela ponte construída no início da suíte e pelo bundle posterior; checker compara recursos com a fonte integrada. O frontend e Rust não mudaram após build. CI Linux headless preparada; runner nested exige sessão gráfica/hardware e está separado. CI remota não executada, sem push autorizado.

Simulado: GNOME Shell no contrato D-Bus, versões de metadata/código nas cópias do laboratório, falha de rename injetada e requests middleware em memória. Nativo: GJS/Gio/D-Bus privado, POSIX/permissões/backup/rollback temporários; compositor GNOME/Mutter e serviço Extensions da distro no runner nested. Não inicia Niko no runner de API. Não usa mídia, rede ou credenciais pessoais nem modifica a sessão principal.

Revisor final: nenhum novo bloqueador estático; Windows tem guards antes de spawn/fs e UI restrita Linux. Limites reais: serialização por processo, TOCTOU com alterações externas do mesmo usuário, dois renames sem fsync podem deixar UUID ausente se processo morrer no intervalo (backup preservado). Testes não comprovam recuperação automática após crash nesse intervalo. O teste canônico antigo GTK/Mutter continua falhando também no baseline; esta etapa não o resolve nem declara estabilidade geral da ilha.

| Recurso desta etapa | Linux automatizado | Integração nativa | Pacote Linux | Manual Linux | Windows |
| --- | --- | --- | --- | --- | --- |
| Aviso/diagnóstico GNOME e ação explícita | Suíte/contratos passaram, auth/confirm recusam, readonly | API real e nested passaram | Payload final verificado | Novo fluxo ainda pendente | Guards/revisão; runtime pendente |
| Instalação/ativação/update/cache/backup | Ausência, AccessDenied, estados, concorrência, symlinks, permissões e rollback cobertos | Ativação, cache mesma versão, backup e readonly passaram | Extensão versão2 e fontes exatas | Clique/estado do aplicativo instalado pendentes | Integração Linux não executa; build/manual Windows pendentes |
| Janela/ilha Tauri existente | Testes anteriores registrados; falha canônica GTK separada | Nova etapa API não cobre janela | Build final gerado | Cinco ciclos do pacote anterior confirmados pelo usuário | Execução da revisão pendente |

Status: implementação, automação, API nativa e payload desta etapa verificados. Instalação/reabertura autorizadas em andamento; confirmação manual do novo fluxo ainda necessária. Não marcar etapa geral Linux concluída.

### Pacote instalado e reaberto — mesma revisão

Autorização anterior de instalar e fechar/reabrir somente Niko permanece vigente. Menu DBusMenu do próprio Niko identificado pelo owner :1.1002/PID144231; item4 tinha label Sair. Event(4,clicked) executou encerramento normal; pgrep -x niko depois não encontrou processo. Não foi usado kill/sinal nem encerrado GNOME/outro aplicativo.

`pkexec /usr/bin/dpkg --install .../Niko_0.2.0_amd64.deb` exit0; dpkg-query `install ok installed 0.2.0`. Log preservado em gnome-integracao-install.txt. Reabertura com `GDK_BACKEND=wayland WEBKIT_DISABLE_DMABUF_RENDERER=1 /usr/bin/niko`: PID164772; ponte Node164788 na porta127.0.0.1:47831. Nenhum endpoint de mídia/cofre/rede/dados foi chamado para testes; sem reset ou reload/logout GNOME. Instalação só fornece arquivos do pacote; a cópia/habilitação pessoal da extensão depende do clique explícito do usuário.

Binário instalado SHA256 3403b24089d2e2d0337686b5ed920358828afd2ae72d5e61be1924ab4eb8eeec; ponte a9892e784fbf50001616dcd44cd9290a25a312023416c8e309032fcb6c32a3fc; metadata252caebe5833d3a756cae41245ce706803f9d31691b5527607dcfd132ca3bba7; extension.js b2f5a3b14fefe4023daab92f3e8a281eb1abeaf419ba00881448a42c07024f29. Pacote SHA256 6fbe4d5f8e6771001acd79b0acc61880d46f7b29836f707a8b83d2350dcc7941.

Matriz atualizada: pacote Linux desta etapa instalado e runtime inicial observado. Pergunta manual enviada para Configurações → Ilha, estado/aviso/ação explícita e cinco ciclos. Não exige logout imediato. Confirmação manual do novo fluxo ainda pendente; demais pendências Windows/CI/falha canônica continuam. Evidência nativa final copiada para gnome-integracao-native-final/, sem depender apenas dos arquivos temporários do laboratório.

Comparação instalada adicional: `dpkg-deb -x` em TemporaryDirectory e igualdade byte a byte com /usr/bin/niko, ponte, Node e os dois arquivos da extensão passaram (5 asserts). Não confundir binário instalado DEB com marcador UNK do binário release não empacotado. `sha256sum -c linux/evidencias/gnome-integracao.sha256` passou para todos os14 arquivos registrados; `git diff --check` passou.

### Confirmação manual do pacote atual — usuário

Resposta ao roteiro Configurações → Ilha/estado/aviso/ação se oferecida/cinco ciclos: “Não pediu nada por que o meu já está configurado, tudo está funcionando corretamente”. Registrar confirmação do funcionamento nesta sessão já configurada e ausência de pedido de nova sessão. Não afirmar que usuário executou instalação inicial/habilitação ou observou cada detalhe do aviso; não foi necessário no ambiente relatado. Primeira instalação/update/cache são comprovados separadamente pelos contratos e API GNOME nested, não por esta confirmação pessoal.

Matriz final desta etapa: Linux automatizado99pass/0fail/2Windows skip; integração API GNOME46 real passou; pacote instalado e igualdade de5payloads passou; manual do ambiente configurado confirmado. Windows: fonte/guards revisados, execução nativa/build/pacote/manual desta revisão pendentes. CI remota preparada mas não executada. Encerrada a rodada de entrega do fluxo assistido GNOME; suporte Linux geral e falha GTK/Mutter canônica permanecem em andamento, sem alegação de estabilidade completa. Etapas futuras não iniciadas.

## Continuação — estabilidade da ilha, 06/10/2026

Base Git inalterada, alterações locais anteriores preservadas. Principal:
`extension.js`, `Aplicativos.tsx`, `.gitignore`, registros/matriz; agente testes:
`extension.test.mjs` e `ilha-visibilidade.test.mjs`; agente nativo: somente
`linux/gnome/native/`; revisor independente sem edição. Nenhum commit/push/PR,
instalação, fechamento do Niko pessoal ou alteração da sessão nesta rodada.

### Reprodução e correções

- Fullscreen: o código apenas retornava sem posicionar, deixando a ilha visível.
  Teste headless falhou na fonte anterior (`continuacao-fullscreen-red.txt`);
  novo probe real falhou step19 com fonte antiga (`continuacao-native/fullscreen-antes/`).
  Agora `in-fullscreen-changed`/sessionMode `updated` ocultam somente o ator da
  ilha; restauração não ativa janela, não mostra ator previamente oculto nem
  revive janela GTK retirada. Workspace atual, minimização e ator nulo têm guards.
- Cancelamento: `show()`/`setFocus()` podiam continuar depois de Escape ou
  desativação durante `unminimize()`. Teste reproduziu antes da correção
  (`continuacao-visibilidade-red.txt`). Fila por instância e geração de pedido
  serializam IPC e revalidam após awaits. Testes controlam também `show()` pendente,
  desativação e rajadas, verificando hide final e ausência de sobreposição/foco tardio.
- Monitores: restauração ignora monitor removido, em vez de enviar índice inválido
  ou coordenadas antigas. Testes cobrem primário deslocado/ausente e índice removido.

Mocks: React/hooks/eventos/IPC, Clutter/Meta/monitores nos testes headless.
O novo teste frontend transpila o TSX efetivo com Oxc/Vite já instalado; não testa
GTK. Nenhuma dependência/lockfile adicionada. Atalho físico/escala/multimonitor
real não são comprovados por esses mocks.

### Integração nativa e investigação canônica

Comandos: `linux/gnome/native/run.sh`,
`NIKO_NATIVE_BASELINE=1 linux/gnome/native/run.sh`,
`NIKO_NATIVE_SHOW_ONLY=1 linux/gnome/native/run.sh`. Node22.23.3, Ubuntu24.04.5,
GNOME46.0/Mutter46.2/GTK3.24.41, compositor Wayland nested, D-Bus e XDG privados.
Cliente GTK3 e serviço SingleInstance são fictícios; gerenciamento de janelas,
fullscreen e compositor são reais. Não executar nem alegar Tauri/WebKit real.

| Caso | Resultado | Laboratório/log preservado |
| --- | --- | --- |
| Canônico inicial | Assertions PASS, exit1: cinco criticals | YUmkWL / `continuacao-native/canonico-inicial/` |
| Baseline sem extensão produção | Ciclos PASS, exit1: quatro criticals | uylfMa / `continuacao-native/baseline/` |
| Fullscreen com extensão anterior | FAIL step19: ator não ocultado | HeuZPo / `continuacao-native/fullscreen-antes/` |
| Canônico final integrado | Assertions PASS, exit1: seis criticals | r4PJ13 / `continuacao-native/canonico-final/` |
| SHOW_ONLY intermediário | exit0, diagnóstico apenas | 9ioos2 / `continuacao-native/diagnostico/` |
| Baseline sob gdb | Assertion/backtrace capturados, encerramento intencional | YkiK2Q / `continuacao-native/debugger-baseline/` |

Debugger: `meta_window_set_stack_position_no_sync`, expressão
`window->stack_position >= 0`, vindo de `meta_window_raise` pelo despacho Wayland.
Reproduz sem extensão de produção. Delimita o caminho nativo, mas não identifica
um patch seguro nem prova causa completa. Tao0.37.1 local usa GTK `show_all` e
`present_with_time(GDK_CURRENT_TIME)`; isso justifica manter o cliente canônico
com present. Não suprimir critical, afrouxar gate nem considerar SHOW_ONLY solução.

Fonte final executada e integrada da extensão:
`a1b7b9bfea45f7c9effd6bd9b09dc897ece14f865a24efdaf476d0313cd89eaf`.
Probe cobre fullscreen entrar/sair sem foco, GTK hide durante fullscreen não
revive, disable enquanto oculto restaura somente ator próprio, cinco ciclos,
atenção, tablist, permissão e desaparecimento do serviço. Todos os processos dos
laboratórios foram encerrados. Runner final registra hash da cópia executada,
evitando race copiar→hash da fonte, e concede 90s aos passos adicionados.

### Revisão independente

Três achados P2 corrigidos: IPC atrasado, fullscreen visível e índice removido.
Revisão incremental também detectou igualdade entre atores nulos e necessidade
de distinguir workspace atual da hipótese `showing_on_its_workspace()`: ambos
corrigidos e cobertos. Snapshot final do frontend:
`65a8fc6afa7063b2d81299d58bf5cdfc4fec69b1aace1141efe272c91394c0a3`.
Revisor final não encontrou bloqueador estático nos novos diffs. Não substitui
runtime, não aprova estabilidade canônica nem Windows.

Verificações Rust: 11/11 (`continuacao-rust.txt`); migração temporária/WAL/integridade/
backup/recusas passou (`continuacao-migracao.txt`); TypeScript final passou.
`pnpm test` final executado por agente testes, Node22 e processos/serviços privados
fora do sandbox que negava sockets: **104 testes, 102 passaram, 0 falharam, 2 testes
Windows nativos pulados**, 165,618s (`continuacao-suite.txt`). A tentativa inicial
no sandbox falhou por `listen EPERM` e por atualização coordenada do stub durante
a execução; não é execução final nem regressão atribuída ao produto. O resultado
final usa a fonte integrada estável.

Revisor também conferiu os scripts nativos finais: gate de critical preservado,
isolamento e trap de cleanup corretos; nenhum novo bloqueador estático. Windows
e CI remota não executados. Comandos de distribuição seguem o workflow existente,
lockfiles sem alteração; nenhuma dependência instalada nesta rodada.

### Distribuição final desta rodada

`pnpm tauri build --config src-tauri/tauri.linux.conf.json -- --locked --offline`
passou: frontend/ponte/Rust release e .deb 50,65 MiB; Rust release 5m25s. Log:
`continuacao-build.txt`. `node linux/validar-pacote.mjs` passou fora do sandbox
após `spawnSync dpkg-deb EPERM` na tentativa restrita; extração temporária,
dependências, bibliotecas, Node22 executável e igualdade binário/ponte/Node/extensão
com a revisão integrada foram conferidos (`continuacao-pacote.txt`). O binário
tem somente a troca documentada do marcador Tauri UNK→DEB. Não instala/inicia Niko.

Pacote: `src-tauri/target/release/bundle/deb/Niko_0.2.0_amd64.deb`.
SHA256: `81e7a26eba84b7c0ea1801d1245500229e499ec2f7bd69904bd444a6ae73fe9c`.
Manifesto `continuacao.sha256` identifica fontes/testes/lockfiles/configurações
locais desta rodada; `sha256sum -c` passou. `git diff --check` passou.

Revisor conferiu o pacote independentemente por extração temporária: cinco payloads
iguais à revisão integrada (binário/Node/ponte/metadata/extensão) e **213 arquivos**
do manifesto conferidos. Não instalou nem iniciou payload.

Pacote novo **não instalado**, extensão pessoal não substituída; a autorização
desta solicitação permite gerar pacotes/testar isolado e exclui mudanças na sessão
pessoal. Históricos de instalação/confirmações permanecem preservados e não
comprovam o novo código. Roteiro curto de validação em `MATRIZ_ATUAL.md`.

Etapa ilha permanece em andamento: falha canônica GTK/Mutter, Tauri/WebKit real,
monitores/escala/atalho físicos e confirmações instaladas necessárias pendentes.
Dock/controles/demais integrações Linux, instalação limpa/autostart/variáveis WebKit,
CI remota/updater e regressão Windows não foram concluídos nesta rodada.

## Comparação real Tauri/WebKit — 06/10/2026

Pedido autorizado: continuar o diagnóstico isolado, sem instalação. Nesta rodada
não houve mudança no código do aplicativo ou novo pacote. Criado runner
`linux/gnome/native-tauri/` e contrato headless descoberto pela suíte existente.
O .deb SHA81e7a26e…73fe9c da rodada anterior foi extraído integralmente em /tmp.
Binário/Node/ponte/frontend/extensão efetivamente executados pertencem ao pacote
integrado. Manifesto adicional: `tauri-real.sha256`; logs: `tauri-real/`.

Principal assumiu criação/execução porque agentes de testes/integração atingiram
limite de uso antes de produzir arquivos; não atribuir execução a eles. Revisor
independente conferiu isolamento, gate, listener e resultados; não editou arquivos.

Isolamento: compositor GNOME46/Mutter46.2 próprio, D-Bus sem servicedirs,
HOME/config/dados/cache/runtime temporários, APPDATA/APPDIR/DISPLAY e sockets
pessoais removidos. DISPLAY externo é passado somente ao compositor para criar
sua janela nested. Niko usa GDK Wayland/socket nested e namespace de rede próprio
(UID1000 mantido, loopback ativo); namespace diferente do host verificado antes
do app. Porta47831/listener real conferidos em /proc do processo próprio.
Watcher SNI é fictício para evitar fallback GtkStatusIcon: não valida tray real.
Tauri/WebKit/frontend/IPC/SQLite/ponte e gerenciamento de janela são reais.

### Resultados comparáveis

| Caso e comando | Resultado | Evidência |
| --- | --- | --- |
| `bash linux/gnome/native-tauri/run.sh` inicial | Cinco ciclos PASS; runner exit1 por exigir ponte.log inexistente | f9IydP / `tauri-real/tauri-inicial-logcheck/` |
| `NIKO_TAURI_BASELINE=1 bash linux/gnome/native-tauri/run.sh` | exit0; cinco ciclos reais sem extensão de produção; foco/listener passaram | TQj8r5 / `tauri-real/tauri-baseline/` |
| `bash linux/gnome/native-tauri/run.sh` final | exit0; cinco ciclos, foco/posição/tablist, listener e cleanup passaram | ZMIEzx / `tauri-real/tauri-final/` |
| `NIKO_TAURI_DMABUF=0 bash linux/gnome/native-tauri/run.sh` | exit0; cinco ciclos e cleanup passaram sem override DMABUF | 9oo6cD / `tauri-real/tauri-sem-dmabuf/` |
| `NIKO_NATIVE_BASELINE=1 bash linux/gnome/native/run.sh` | exit1; quatro criticals stack_position, assertions ciclos passaram | 4zDhwW / `tauri-real/gtk-sincrono/` |
| `NIKO_NATIVE_BASELINE=1 NIKO_NATIVE_PRESENT_DELAY_MS=250 bash linux/gnome/native/run.sh` | exit0; mantém show+present mas separa foco por250ms; diagnóstico | 3SSjzn / `tauri-real/gtk-delay250/` |

O primeiro runner exigia ponte.log, mas Rust abre o stderr antes de criar o
diretório de dados no primeiro startup; pode usar /dev/null. Verificação alterada
para listener privado real. Nenhum gate de stack/GTK/JS foi removido. Tentativas
anteriores do laboratório não iniciaram GNOME porque DISPLAY externo estava
removido; não são evidência de erro do Niko. Probe repete pedidos durante primeiro
carregamento WebKit: não prova prontidão de um único clique logo após startup.

O Niko real abre via ExecuteCallback da instância única e oculta via Meta.Window.delete
→ CloseRequested Rust real → frontend/GTK hide. Não substitui execução por cliente
GTK fictício. Com extensão, assertions conferem posição central abaixo do painel,
foco e ausência de ilha na tablist; não há avaliação visual de conteúdo/aparência.

### Conclusão e limites

`stack_position` não foi reproduzido no ciclo real testado, com nem sem extensão.
GTK show/present síncrono continua falhando; separar present por250ms elimina a
ocorrência no diagnóstico que mantém foco. Isso sustenta **inferência de falha
dependente da sequência/tempo no cliente GTK/Mutter**, não prova causa completa
ou correção de Mutter. Tao0.37.1 local despacha Visible(show_all) e Focus
(present_with_time) por requisições; os awaits do frontend real separam chamadas.
A equivalência anterior entre show/present síncrono fictício e Tauri real não era
comprovada e não deve continuar como alegação. Histórico permanece preservado.

Não tratar variante diagnóstica como solução nem suprimir critical. O canônico
GTK permanece vermelho; acrescentamos evidência independente real. Não houve
patch especulativo na produção. GStreamer emitiu dois CRITICALs
`_dma_fmt_to_dma_drm_fmts` no app; esses logs foram preservados e não resolvidos.
Há também avisos de serviços ausentes no D-Bus privado e ping serial durante
delete; não afirmar logs completamente limpos. O gate monitora explicitamente
criticals de janelas/GTK/JS, não todos os subsistemas de mídia.

Cleanup reforçado usa grupos exclusivos via setsid para app/Node/WebKit/compositor/
watcher. ZMIEzx e9oo6cD registram término do grupo do app; TQj8r5 foi executado
antes desse reforço. Revisor final não encontrou bloqueador estático no runner,
confirmou listener privado/cleanup e destacou corretamente GStreamer/tray simulado.

Verificações: `node --test linux/gnome/tauri-isolamento-linux.test.mjs
linux/gnome/extension.test.mjs scripts/ilha-visibilidade.test.mjs`: **5 passaram,
0 falharam** (`tauri-real/contratos.txt`). Recusa de namespace usa unshare/extração
simulados e confirma ausência de app/bus iniciados. Bash syntax, AST Python e
diff-check passaram. Suíte inteira anterior102pass/2skip não foi repetida pois
produção/lockfiles/pacote não mudaram; não anunciar novo total integrado completo.

Escopo comprovado adicional: ciclo real de cinco aberturas/ocultações no pacote
extraído, Ubuntu24.04.5/GNOME46/Mutter46.2/Wayland x86_64. Sem instalação,
sem fechar Niko pessoal, modificar atalhos/cofre/mídia/rede/extensões pessoais,
commit/push/publicação. Fullscreen Tauri, cancelamento gráfico, hardware/escala/
atalho físico, primeira prontidão, GStreamer, autostart instalado e Windows
continuam pendentes. Sem DMABUF passou neste laboratório, mas não autoriza
remover override da sessão pessoal nem declarar desnecessário em todas GPUs.

## Validação das pendências — 06/10/2026

Fullscreen foi ampliado para Tauri/WebKit/frontend reais no GNOME nested:
entrada/saída, ator ocultado/restaurado sem foco tardio, ocultação via CloseRequested
durante fullscreen e reabertura passaram em `validacao-pendencias/fullscreen-corrigido/`
(exit0). Isso valida o comportamento nesta topologia, não bloqueio real da sessão.

A falha de foco é intermitente e agora foi reproduzida no Tauri real COM extensão
(`tauri-fullscreen/`, `monitores-corrigido/`) e SEM extensão (`baseline-final/`).
Cinco ciclos funcionais podem passar enquanto o gate nativo falha. A comparação
GTK síncrono/delay250 aponta para sequência de foco, sem provar causa completa.
Não atribuir a falha apenas à extensão, nem declarar estabilidade da ilha.

Dois monitores nested de 1920x1080, primário deslocado, escalas 100%, 200%,125%
e desativação lógica foram exercitados via DisplayConfig real, com owner PID
validado contra compositor privado. A primeira execução `monitores-1920/` revelou
`meta_display_get_monitor_in_fullscreen` com índice inválido, apesar do PASS do
probe: o gate antigo não capturava essa assinatura. Durante a atualização,
layoutManager ainda expunha índice1 e Mutter já tinha somente um monitor.

Correção: `_primaryMonitor()` valida índice pela contagem nativa nos três callers
(show, ativação, posição); restauração também valida monitor original. Regressão
falhou antes e passou depois. Gate ampliado para qualquer libmutter-CRITICAL.
Revisão independente não encontrou novo bloqueador nesses diffs.
`monitores-corrigido/` não reproduziu índice inválido e passou asserts de monitores,
mas FALHOU no gate por stack_position. Desconexão física permanece pendente.

GStreamer: ver `../diagnostico-gstreamer/RESULTADO.md`. O CRITICAL foi reproduzido
no scanner do plugin Intel MSDK sem Niko/WebKit/GTK/GNOME/D-Bus; PCM fictício chegou
a EOS. Formato inválido exato, correção e HTMLAudio/vídeo WebKit permanecem abertos.

Nada instalado ou publicado; nenhum commit/push. O .deb anterior não contém a
última guarda de monitor: seu hash histórico não comprova o código novo da extensão.
Os testes usam dados/DBus/rede próprios e confirmam limpeza dos grupos de processos.

Repetição `monitores-final/`: exit0, todos os asserts passaram e nenhum CRITICAL
monitorado. O erro de índice não apareceu em ambas as execuções com a correção;
a execução anterior com stack_position permanece preservada, sem seleção de logs.

Suíte completa final: 105 testes, 102 passaram, 1 falhou, 2 Windows pulados.
Falha MPRIS em `failing_command.log` ausente no cenário de player encerrando durante
comando; repetição isolada passou (exit0). Não há evidência suficiente para atribuir
a falha a produção ou somente sincronização do teste. Ambos os logs preservados;
a repetição não apaga o resultado da suíte completa. Cinco contratos diretamente
afetados passaram, bash -n e git diff --check passaram.

## Meta sem reinício: investigação inicial — 06/10/2026

Diagnóstico privado `linux/gnome/native-sem-reinicio/`, sem modificar produção.
`sem-reinicio/clean/` confirma no GNOME46 real: extensão ausente no startup, helper
copia arquivos, EnableExtension retorna false, GetExtensionInfo permanece vazio,
ReloadExtension indisponível e Eval bloqueado. A cópia local atual não satisfaz
instalação inicial sem nova sessão. PASS do diagnóstico é reprodução do limite.

Protótipo `loader.js` mantém entrypoint/metadata estáveis e importa implementação
por URI imutável com SHA256. B/C executaram implementação real nova, mantendo
PID/owner do compositor e posse do botão. Revisão encontrou falso positivo no
rollback (marker antigo) e races no enable/disable; os testes foram ampliados para
marcador fresh de geração e cancelamento de import. Execuções anteriores falhas
não comprovam estabilidade e foram preservadas. A versão inicial preinstala loader
antes do startup: não pode ser usada como prova de primeira instalação na sessão.

A fonte GNOME46 registra cache e bloqueio de versão carregada diferente; o canal
InstallRemoteExtension cria/load o objeto durante a sessão, distinto da cópia local:
https://github.com/GNOME/gnome-shell/blob/46.0/js/ui/extensionSystem.js
https://github.com/GNOME/gnome-shell/blob/46.0/js/ui/extensionDownloader.js

Faltam canal suportado de primeira instalação, migração do entrypoint legado já
em cache, integração de produção/pacote e ilha Tauri real durante atualização.
Publicação remota não foi autorizada nem executada. Não habilitar unsafe-mode nem
alterar internals do Shell para transformar uma limitação em PASS.

`sem-reinicio/loader-final/`: diagnóstico final exit0. B/C, rollback com marcador
novo e cancelamento durante import passaram; PID/owner do mesmo Shell conferidos,
cleanup terminou grupo do compositor. Não há CRITICAL monitorado de Mutter/GTK/JS;
warnings/serviços ausentes do nested preservados. Isso prova o mecanismo experimental
de atualização, ainda sem instalação inicial, pacote ou Tauri durante a troca.

`sem-reinicio/clean-final/`: diagnóstico repetido com owner/PID guard e cleanup,
exit0; limite de primeira instalação local confirmado. Revisão independente
permanece separada da validação de produto; produção/pacote/sessão pessoal intactos.

## Sem reinício: migração de entrypoint legado — 06/10/2026

O modo `migration` pré-instala extensão legada de produção sob niko-ilha@local e
carregador experimental sob UUID diferente ANTES do startup. Ativa legado real,
desabilita somente ele, habilita novo, executa B/C com provas de revisão/painel,
rollback fresh/cancel e reativa legado como reversão. Código/metadata legados ficam
intactos; PID/owner do Shell permanecem iguais. `sem-reinicio/migration-inicial/`
exit0; não prova primeira instalação de UUID ausente no startup nem Tauri/pacote.

Execução anterior `migration-no-reply/` falhou por NoReply do serviço nativo Extensions.
Fonte local do serviço mostra autoencerramento quando clientes curtos desaparecem.
Cliente privado persistente GetInfo/MainLoop mantém esse serviço vivo durante teste
posterior; não modifica o serviço nem política do Shell. Não usar isso para afirmar
que o helper de produção com GJS curto está robusto: esse comportamento exige
tratamento separado. Logs falhos e limites preservados.

Proposta de distribuição e requisitos em
`linux/gnome/native-sem-reinicio/CAMINHO_DISTRIBUICAO.md`. Canal remoto GNOME, revisão,
licença e autorização não resolvidos; nenhuma publicação e nenhuma mudança produtiva.

`sem-reinicio/migration-final/`: exit0 após reforço da reversão: subclasse diagnóstica
chama implementação legada real e publica marcadores novos de painel/filtro após
enable/disable. Painel removido e método restaurado ao desabilitar; painel próprio
recriado e filtro instalado novamente após reversão, com geração maior. Cleanup
aguarda/confere grupos do cliente persistente e compositor. Nenhum código produtivo
ou configuração pessoal alterado. Pergunta de preferência sobre canal de primeira
instalação enviada ao usuário; não confundir ausência de resposta com publicação autorizada.

## Direção escolhida e candidato com estado real — 06/10/2026

Usuário autorizou seguir direção .deb + primeira ativação pelo canal GNOME;
não autorizou publicação. Preparado candidato-sem-reinicio/extension.js, sem alterar
helper/pacote ou sessão pessoal. D-Bus readonly State/Revision/Generation/LastError
permite conferir código realmente ativo e diferenciar rollback de atualização nova.

`sem-reinicio/candidate-api/` exit0: protocolo real consultado no GNOME nested,
revisão/generation conferidas na primeira ativação e rollback; B/C executados,
migração/reversão, import cancelado, PID/owner e grupos privados conferidos.
Fixture de diagnóstico envolve candidato real; não comprova instalação após startup,
canal EGO, instalador transacional, pacote, Tauri ou distribuição/licença.

Revisão independente: guardas de epoch/generation para ownership D-Bus antigas e
perda do nome durante import adicionadas. `candidate-api-final/` repetiu fluxo
principal exit0 com essa fonte; colisão dedicada do nome segue pendente, sem afirmar
cobertura desse cenário. Resposta do usuário removeu bloqueio de preferência de
canal; requisitos de distribuição/publicação e validação final permanecem abertos.
