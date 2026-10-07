# Contribuição de suporte ao Linux

## Revisão de privacidade para contribuição — 07/10/2026

Revisados 743 arquivos candidatos ao envio (rastreados e não ignorados), com buscas
por caminhos/identificadores do usuário, formatos reconhecíveis de credenciais e JWT.
Não foram encontrados segredos nesses formatos. Essa busca não comprova ausência
absoluta de qualquer segredo nem substitui revisão de segurança integral do código.

Foram anonimizados 36 registros com caminhos pessoais; o caminho do cache local
também foi generalizado. Emails de autores no JSON upstream de diagnóstico foram
retirados, preservando referência ao commit e autoria pública. Dois scripts de
laboratório deixaram de depender do caminho pessoal do Node e usam `NIKO_TEST_NODE`
ou `node` do PATH (Node 22 ou superior conforme os requisitos).

As duas imagens novas nas evidências foram inspecionadas: mostram fixture/perfil
fictícios de laboratório. Capturas pessoais fornecidas no chat não estão no material.
Banco, instaladores, executáveis gerados, segredos e payload GNOME de build estão
fora dos candidatos pelas regras de ignore. Mídia, ícones e identidade originais do
projeto foram preservados. UUID de extensão e email fictício de teste não são dados
pessoais do usuário. Nenhum dado do aplicativo instalado foi apagado.

`bash -n` passou nos dois scripts alterados; `git diff --check` passou. Não repetimos
os gates gráficos nesta revisão: a alteração dos scripts é apenas a seleção do
executável Node; execução gráfica com esse novo padrão ainda não repetida.
Logs anonimizados são cópias editoriais; hashes históricos identificam a revisão
original testada, não certificam o conteúdo textual após anonimização.

Não houve commit, push, fork público ou PR. O envio continua pendente da autorização
escrita do titular, conforme LICENSE.md e a restrição explícita desta tarefa.

# Consolidação: o que foi feito no Linux e por quê

Consolidação em 07/10/2026 para revisão da contribuição local. Escopo: GNOME 46 com Wayland, validado em Ubuntu 24.04. O trabalho mantém a ilha Tauri/WebKit e reutiliza os módulos existentes. Não adiciona suporte a KDE ou outros ambientes.

Este documento explica o resultado; este arquivo conserva o histórico detalhado. A [matriz de evidências](linux/evidencias/MATRIZ_ATUAL.md) identifica as rodadas. Resultados antigos descrevem suas respectivas revisões e não substituem o estado consolidado abaixo.

## Motivo da adaptação

O Niko possuía recursos dependentes de APIs Windows, como user32, PowerShell e o cofre de credenciais daquele sistema. Compilar a interface no Linux não disponibilizava automaticamente essas operações. No Wayland, o aplicativo também não pode assumir controle geral sobre posição, foco e conteúdo das janelas por conta própria.

A solução foi manter o aplicativo e implementar os pontos específicos do sistema com APIs Linux e uma integração GNOME. Recursos que já existiam, como o fluxo OAuth e a leitura de consumo, foram reaproveitados em vez de recriados. Os ramos Windows foram preservados; isso não equivale a uma execução de validação no Windows.

## Alterações e justificativas

| Área | O que fizemos | Por que foi necessário |
| --- | --- | --- |
| Aplicativo e ponte | Adaptamos a base Tauri/Rust e a ponte Node ao Linux, incluindo recursos empacotados, inicialização, supervisão e encerramento. Mantivemos autenticação por token na ponte local. | O aplicativo instalado precisa encontrar e executar os recursos corretos sem depender do servidor de desenvolvimento nem de caminhos Windows. |
| Dados e persistência | Adaptamos armazenamento, migração e caminhos Linux. A saída normal coordena o salvamento. A migração possui proteção contra sobrescrita. | Atualizar ou fechar o aplicativo não deve perder dados nem substituir silenciosamente um banco existente. |
| Pacote, atalho e autostart | Preparamos o .deb, lançador, recursos e inicialização automática; integramos o atalho da ilha ao GNOME. | Tornar o uso cotidiano possível fora do ambiente de desenvolvimento. Pacote/atalho e autostart foram confirmados pelo usuário. |
| Ilha GNOME | Implementamos a integração de posição, visibilidade, foco e comportamento no Alt+Tab, mantendo a janela Tauri/WebKit. | O Wayland não oferece ao aplicativo as mesmas operações gerais de janela disponíveis no Windows. A integração fica no compositor GNOME, onde essas operações são possíveis. |
| Carregador GNOME | Implementamos carregamento versionado, atualização, rollback e recuperação explícita com journal. | Permitir atualizar a implementação sem exigir logout e recuperar uma atualização interrompida. Não confundir atualização de um carregador ativo com primeira ativação numa instalação limpa. |
| Recarga com janelas abertas | O novo carregamento adota ilha e dock já existentes, preserva o foco e reaplica a reserva do dock quando a geração muda. | Antes, a recarga tratava apenas novos eventos de janela; ilha e dock abertos podiam ficar fora de posição. Corrigimos a causa compartilhada, não apenas um modo do dock. |
| Dock e janelas | Reutilizamos o frontend e implementamos janela Linux, ícones nativos, miniaturas disponíveis, foco, minimizar, fechar e identificação com geração. Implementamos Fixo, Inteligente e Esconder, incluindo reserva de espaço. | Essas operações dependiam de integração Windows. O modo Inteligente precisa considerar sobreposição real, inclusive por janela não maximizada. |
| Custo do dock | Um cliente GJS persistente compartilha consultas, encerra quando ocioso e ignora respostas tardias de processos antigos. | Evitar criar um processo por atualização e impedir que uma resposta antiga interrompa o cliente novo. O usuário relatou melhora de responsividade; não medimos um ganho percentual com baseline equivalente. |
| Controles do sistema | Usamos UPower, GNOME SettingsDaemon, NetworkManager, BlueZ, logind, ScreenSaver e StatusNotifierItem; áudio com wpctl/pw-dump. Reutilizamos o painel em Configurações → Sistema. | Substituir operações PowerShell por APIs nativas, mantendo validações e confirmações existentes. Disponibilidade depende dos serviços e dispositivos presentes. |
| Mídia | Integramos leitura e controles MPRIS, com tratamento das informações disponibilizadas pelos players. | No Linux, navegadores e aplicativos compatíveis expõem controle de mídia pelo D-Bus. Não é necessário criar integração específica para cada player. |
| Credenciais | Implementamos armazenamento via Secret Service/libsecret. | Substituir o cofre Windows por armazenamento nativo, sem colocar segredos nas evidências da contribuição. |
| OCR | Implementamos Tesseract com idiomas português/inglês, validação de imagem/dimensões e temporários privados removidos ao final. | Oferecer reconhecimento de texto no Linux usando o motor existente no sistema. As dependências e idiomas estão declarados no .deb. |
| Gmail | Mantivemos OAuth com PKCE, state e retorno local; no Linux, o navegador é aberto por gio. Falha ou cancelamento encerra o listener. | A autorização já existia; faltava adaptar a abertura do navegador e o ciclo de vida ao Linux. O cliente OAuth ainda precisa ser configurado no Google. |
| Consumo | Habilitamos os caminhos Linux de leitura, agendamento e alertas opt-in, mantendo deduplicação e corrigindo o diretório das sessões. | O backend já existia, mas bloqueios e caminhos de plataforma impediam seu uso completo no Linux. |
| Diagnóstico e testes | Criamos testes de contratos e laboratórios GNOME, Tauri/WebKit, D-Bus e serviços privados. Registramos revisões, resultados e falhas. | Demonstrar comportamento real sem alterar a sessão ou usar banco, credenciais, mídia e conectividade pessoais nos testes automatizados. |

## Como foi validado

A [rodada final](linux/evidencias/finalizacao-gnome46/RESULTADO.md) contém comandos, resultados e identificação do pacote. A suíte registrada teve **118 testes: 116 passaram, zero falhas e dois testes Windows foram pulados**. Esse resultado vale para a revisão registrada, não é uma nova execução feita durante esta consolidação documental.

No GNOME privado, com Tauri/WebKit reais, passaram os três modos do dock, posição, ícones, miniaturas disponíveis, ações de janelas, reserva, fullscreen e recarga com ilha/dock existentes sem roubar foco. Foram executados 20 ciclos de minimizar/focar com estado confirmado. Também foram exercitados IDs obsoletos, overview, captura e teclado virtual no laboratório. Capturas pessoais não foram incluídas nas evidências.

OCR foi executado com Tesseract instalado e imagem sintética. Áudio foi testado com PipeWire e dispositivos virtuais. Controles de sistema usaram transporte GJS/Gio/D-Bus real com serviços fictícios: validam comandos e protocolo, não substituem operações físicas no hardware. OAuth automatizado usou navegador fictício e endpoint Google simulado; consumo usou logs, credenciais e respostas fictícios.

O pacote corrigido foi instalado no computador do usuário. Confirmamos o executável empacotado, a ponte instalada e a revisão do carregador GNOME ativo. A implementação foi atualizada sem reiniciar a sessão; somente o Niko foi reaberto para carregar a interface atualizada. O usuário confirmou posteriormente Chat, conexão de email e o funcionamento geral dos recursos em seu uso pessoal. Essa confirmação é um relato manual, separado dos testes automatizados; não documenta cada operação individual, como envio de email.

CPU e memória foram medidas por leitura de processos, sem consultar conteúdos pessoais. Uma amostra da versão instalada registrou 8,2% de um núcleo em 30,1 segundos e 511,1 MiB de memória proporcional do aplicativo e filhos. É uma medição pontual, influenciada pelo estado da interface; não comprova estabilidade prolongada, ausência de vazamento nem desempenho em outras GPUs.

## Instalação das dependências

O .deb declara Tesseract e seus idiomas, além das dependências de execução da integração. A instalação com `apt install ./Niko_0.2.0_amd64.deb` resolve as dependências pelo gerenciador de pacotes; `dpkg -i` sozinho não faz essa resolução. No computador de desenvolvimento, o usuário instalou as dependências OCR e o motor instalado foi conferido e testado.

Isso não significa que o pacote já tenha distribuição oficial ou atualização automática Linux. A instalação limpa e a distribuição são trabalhos separados.

## Limites e decisões de escopo

- Suporte experimental restrito a GNOME 46/Wayland. Não alegamos compatibilidade com KDE, outras versões do GNOME ou Linux em geral.
- Miniaturas de janelas minimizadas ou fora da área de trabalho atual não estão disponíveis nessa integração. O aplicativo não promete contornar as restrições do Wayland.
- Brilho depende do hardware; teclado virtual depende de habilitação no GNOME; bandeja depende de um watcher StatusNotifierItem. Novas redes WEP/enterprise são recusadas; perfis salvos são delegados ao NetworkManager.
- A primeira ativação do novo carregador pelo canal GNOME, em instalação ainda sem integração ativa, depende do canal autorizado. A atualização de uma integração já ativa foi testada sem logout.
- Os ramos Windows foram preservados, mas não executados nesta máquina. Uso pessoal aprovado no Linux não comprova paridade exaustiva com cada fluxo Windows.
- Há histórico de falha intermitente `stack_position` e de comunicação de foco. Os gates finais passaram; isso não permite declarar eliminada toda intermitência. A corrida corrigida no cliente não foi comprovada como causa da falha histórica de foco.
- O aviso GStreamer MSDK teve causa e correção upstream identificadas. A biblioteca do sistema não foi corrigida por esta contribuição.
- Registros anteriores sobre barra lateral e Chat/Claude são históricos. Chat e funcionamento geral foram confirmados pelo usuário; uma afirmação de paridade completa exige uma comparação específica dos fluxos, não uma pendência genérica nem a inferência de que o código todo foi coberto.

## Contribuição e autoria

O objetivo é entregar essas alterações para revisão do titular, preservando a licença e a implementação Windows. Não alteramos LICENSE.md. Não houve push, PR, fork público ou publicação nesta etapa.

A licença reserva direitos ao titular e exige autorização prévia por escrito para modificação/publicação. Embora contenha uma seção sobre contribuições, não há autorização escrita comprovada para o envio desta adaptação. A [descrição de PR](linux/PROPOSTA_PR_LINUX.md) está preparada localmente; a publicação permanece pendente dessa autorização.

A proposta deve conter código, documentação e evidências técnicas selecionadas. Não deve incluir instaladores gerados, banco pessoal, HOME de laboratório, tokens, segredos, imagens pessoais ou temporários. O histórico detalhado também precisa ser revisado antes de qualquer envio público.

## Leitura recomendada

1. Este resumo: alterações, motivos e limites.
2. [Descrição do PR](linux/PROPOSTA_PR_LINUX.md): escopo proposto para revisão.
3. [Resultado final](linux/evidencias/finalizacao-gnome46/RESULTADO.md): testes e evidências por revisão.
4. [Matriz](linux/evidencias/MATRIZ_ATUAL.md) e o histórico detalhado abaixo: investigação e resultados anteriores, quando necessários.


---

## Histórico das etapas


## Atualização de 07/10/2026 — rodada conjunta e correção de recarga

Registro atual: [resultado da rodada](linux/evidencias/finalizacao-gnome46/RESULTADO.md).
OCR instalado e testado com Tesseract do sistema; dependências declaradas no .deb.
Pacote corrigido instalado e carregador ativo sem reiniciar a sessão. Recarga agora
adota ilha/dock existentes, preserva foco e reaplica reserva por geração.
Suíte: 118 testes, 116 passaram, zero falhas, 2 Windows pulados. GNOME privado com
Tauri/WebKit real passou fixo/inteligente/esconder, inclusive recarga; 20 ciclos
minimizar/focar passaram. Hardware e desempenho medidos por leitura estrita.
Confirmação visual pessoal do dock corrigido pendente. Não declara estabilidade
completa; stack_position/MSDK históricos e limites de paridade permanecem.
Licença inalterada; falta autorização escrita do titular para envio/publicação.


## Objetivo e estado atual

Adicionar suporte ao Linux preservando as implementações existentes do Windows.
Este documento registra preparação, alterações, testes e limitações da contribuição.
Instalar dependências não significa que o aplicativo já funciona no Linux.

### Meta confirmada: instalação e atualização sem reiniciar a sessão

Manter a arquitetura atual da ilha e encontrar uma solução que permita instalar
e atualizar o Niko e sua integração GNOME sem logout/login, reinício do GNOME
Shell ou reinício do computador. Reiniciar somente o processo do Niko, se
necessário para carregar a atualização, é permitido; preservar dados e configurações.

Critério de aceitação: em ambiente gráfico isolado, executar instalação limpa e
atualização de uma versão anterior na mesma sessão Wayland. Conferir a versão
efetivamente carregada da extensão, o acesso à ilha, ciclos de mostrar/ocultar/reabrir
e ausência de erros nativos. Não aceitar arquivos novos no disco como prova de
que o GNOME está executando o código atualizado. Registrar também falhas e rollback.

Estado: meta de investigação e implementação, ainda não comprovada. A validação
inicial será GNOME/Wayland; outros desktops exigem integração e testes próprios.
Não instalar nem alterar a sessão pessoal sem autorização específica.

**Comparação gráfica posterior em 06/10/2026:** pacote extraído Tauri/WebKit real
passou cinco ciclos com e sem extensão; também passou sem override DMABUF. A
falha stack_position continua no GTK fictício síncrono, sem reprodução nesses
ciclos reais. GTK present diferido250ms passou apenas como diagnóstico. Não houve
patch na produção nem instalação. GStreamer e demais validações físicas/manuais
permanecem pendentes. Evidências em `linux/evidencias/tauri-real/` e matriz abaixo.

**Continuação em 06/10/2026:** ilha oculta em fullscreen/bloqueio, IPC serializado
e cancelável, restauração segura após remoção de monitor. Suíte integrada:
102 passaram, 0 falharam, 2 Windows pulados; Rust 11/11. Fullscreen passou nas
assertions GNOME nested, mas o gate canônico falhou por seis criticals; baseline
sem extensão também falha. Nenhuma mudança na sessão pessoal nesta rodada.
Estado consolidado separado dos históricos:
[linux/evidencias/MATRIZ_ATUAL.md](linux/evidencias/MATRIZ_ATUAL.md).

**Nova rodada em 06/10/2026:** testes/CI Linux, correções de isolamento e concorrência,
cofre libsecret, build e pacote preparados com agentes separados. Suíte integrada:
97 passaram, 0 falharam, 2 testes Windows pulados; Rust 11/11 passou. O .deb foi
conferido, instalado e reaberto com autorização; hashes e runtime inicial confirmados. **GNOME canônico falhou também no baseline sem extensão;
etapa permanece em andamento.** Windows, CI remota e confirmação manual instalada
continuam pendentes. Matriz, comandos, hashes e limites atuais:
[linux/evidencias/VALIDACAO.md](linux/evidencias/VALIDACAO.md).

**Registro anterior em 06/10/2026 (não valida a nova revisão):** usuário confirmou ilha na posição correta,
fora do Alt+Tab, botão acompanhando saída/reabertura, configurações persistentes e
aba Música exibindo mídia do Brave. Banco já limpo com autorização e backup:
**não repetir reset nem restaurar dados automaticamente**. Controles MPRIS genéricos
implementados e rodada manual aprovada pelo usuário. Capa temporária PNG e foco
diferido adicionados; testes isolados passaram, instalação atualizada e fonte da
extensão copiada com backup. Capa visual/foco na sessão normal ainda pendentes. Confirmar capacidades do player em vez de habilitar
controles sem suporte. Windows preservado no código, sem execução neste host.
PR só será aberto após nova liberação explícita do usuário. Registros abaixo são
históricos e não substituem evidência desta revisão.

## Ambiente inicial observado

| Item | Resultado |
| --- | --- |
| Distribuição | Ubuntu 24.04.5 LTS |
| Arquitetura | x86_64 |
| Desktop / sessão | GNOME / Wayland |
| Node ativo no terminal do agente | 18.19.1; insuficiente para o projeto |
| nvm | Instalado; Node 20.20.2 disponível, também abaixo do requisito do projeto |
| pnpm | 11.25.0 disponível no ambiente do agente |
| Rust | Toolchain stable instalada por rustup; cargo e rustc fora do PATH do agente |
| Bibliotecas do sistema | build-essential, curl, wget, file e libssl-dev instalados |
| Bibliotecas ausentes | libwebkit2gtk-4.1-dev, libxdo-dev, libayatana-appindicator3-dev e librsvg2-dev |

O terminal pessoal pode ter um PATH diferente do terminal do agente.

## Preparação no Ubuntu 24.04

### Bibliotecas do sistema

Requisitos da [documentação oficial do Tauri 2](https://v2.tauri.app/start/prerequisites/#linux):

```bash
sudo apt update
sudo apt install build-essential curl wget file libssl-dev \
  libwebkit2gtk-4.1-dev libxdo-dev libayatana-appindicator3-dev librsvg2-dev
```

O apt mantém os pacotes já instalados e instala os ausentes.

### Node e pnpm

O README exige Node 22 ou mais novo; a ponte usa `node:sqlite`.
Usar Node 22 nesta primeira etapa, sem trocar o Node padrão de outros projetos.
O nvm já está instalado neste ambiente:

```bash
source "$HOME/.nvm/nvm.sh"
nvm install 22
nvm use 22
node --version
pnpm --version
```

Se pnpm não estiver disponível no terminal pessoal após ativar Node 22:

```bash
npm install --global pnpm@10
pnpm --version
```

Referência: [nvm](https://github.com/nvm-sh/nvm).

### Rust

Rust já está instalado neste ambiente. Carregar seus comandos no terminal:

```bash
source "$HOME/.cargo/env"
rustc --version
cargo --version
```

A toolchain inicialmente instalada era Rust 1.88.0. A tentativa de compilação
confirmou que as dependências fixadas no Cargo.lock exigem Rust 1.90 ou superior.
A stable foi atualizada para Rust 1.99.0 durante a preparação:

```bash
rustup update stable
```

Não é necessário reinstalar Rust. Em outro computador sem Rust, seguir o
[instalador oficial rustup](https://rustup.rs/).

### Dependências do repositório

Com Node 22 ativo:

```bash
cd /caminho/Niko
pnpm install --frozen-lockfile
```

Preservar o lockfile. Caso a instalação falhe, registrar o erro antes de alterar
versões ou dependências.

## Obstáculos identificados na leitura do código

- Rust usa Win32 para token aleatório, foco de janelas e abertura de links.
- Barra do sistema, reserva de espaço para o dock e miniaturas dependem do Windows.
- Credenciais usam o Gerenciador de Credenciais do Windows via PowerShell/C#.
- Mídia, controles do sistema, áudio e OCR têm implementações específicas do Windows.
- Build da ponte e inicialização nativa esperam `node.exe`.
- Empacotamento está configurado para NSIS, instalador Windows.
- Caminho de dados da ponte assume AppData do Windows.

## Etapas propostas e critérios de validação

Cada etapa só será marcada como concluída quando todos os seus critérios tiverem
evidências. Registrar arquivos alterados, como a mudança foi implementada, ambiente,
comandos, resultados e pendências. Teste automatizado, compilação, empacotamento e
teste manual de interface são evidências distintas; nenhum substitui todos os outros.

| Etapa | Estado | Trabalho e critério de conclusão |
| --- | --- | --- |
| 1. Preparação | Concluída | Node 22, pnpm, Rust >= 1.90 e bibliotecas Linux disponíveis; versões e consultas registradas |
| 2. Diagnóstico inicial | Em andamento | Executar checagem de tipos, testes existentes e compilação Rust; registrar falhas preexistentes e bloqueios específicos de plataforma |
| 3. Compilação Linux | Concluída | Chamadas Windows isoladas; `cargo check --locked`, três testes Rust e build do executável desktop de desenvolvimento passaram; execução gráfica e pacote permanecem nas etapas seguintes |
| 4. Janela principal e dados | Reaberta: migração permanente e encerramento confirmado | Interface debug/release e tarefa após saída/reinício confirmadas pelo usuário; desktop terminou com código 0, ponte/porta encerraram e SQLite íntegro |
| 5. Integrações Linux | Em andamento: primeira ilha experimental; dock pendente | Adaptar uma integração por vez, com teste relevante e confirmação de comportamento; recurso sem implementação aparece como indisponível, sem fingir sucesso |
| 6. Pacote Linux | Pacote anterior validado; revisão atual pendente | .deb gerado e instalado, /usr/bin/niko e Node incluído confirmados; interface, nova tarefa após saída/reinício e SQLite íntegro validados |
| 7. Regressão Windows | Pendente | Validar testes e build em Windows; instalar/executar a mesma revisão e testar recursos Windows afetados, com evidências manuais |
| 8. Pull request | Pendente | Revisar diff, consolidar ambientes validados, instruções, testes e limitações; anexar resultados disponíveis e declarar qualquer validação ainda pendente |

Suporte a outras distribuições só será declarado após validação nesses ambientes.

## Revisão por outro agente

Fluxo acordado para cada etapa de código:

1. O agente principal implementa o escopo da etapa e executa os testes relevantes.
2. Um segundo agente revisa os arquivos e o diff, sem modificar código. Recebe o
   objetivo, critérios, resultados observados e limitações; confere correção,
   cobertura dos testes e possíveis regressões Windows.
3. O agente principal corrige os achados e repete as verificações afetadas.
   Mudanças relevantes após a revisão retornam ao revisor.
4. Registrar como foi implementado, testes/comandos e resultados, achados do revisor,
   correções e pendências. Só marcar a etapa concluída quando seus critérios forem
   atendidos e não houver achado bloqueante sem resolução.

A revisão não substitui execução real no Linux ou Windows. Se uma validação depender
de ambiente ainda indisponível, registrar essa limitação e manter o critério pendente.

## Primeira adaptação: compilação Linux

### O que foi feito

- `src-tauri/Cargo.toml`: dependência `windows` movida para
  `[target.'cfg(windows)'.dependencies]`, mantendo versão e features. Isso impede
  que `windows-future` entre na árvore de dependências do alvo Linux.
- `src-tauri/src/lib.rs`: módulos Win32, foco por HWND, miniaturas, sobrepostas e
  restauração da barra só são compilados/executados no Windows. O handler Windows
  mantém os comandos existentes. Linux registra apenas os comandos comuns e cria
  somente a janela principal nesta etapa.
- Linux gera o token de 32 bytes a partir de `/dev/urandom`; falha de leitura impede
  a inicialização, sem usar token previsível. Windows mantém BCryptGenRandom.
- Linux consulta foco via Tauri e abre links HTTP/HTTPS com `xdg-open`, passando a
  URL como argumento sem shell. Validação existente é compartilhada. A espera do
  abridor ocorre via `spawn_blocking`, fora do thread principal.
- Três testes Rust foram acrescentados no próprio módulo: formato/diferenciação
  dos tokens, rejeição de links inválidos e sucesso/falhas do abridor com programas
  controlados (`/bin/true`, `/bin/false` e caminho inexistente), sem abrir navegador.

### Limites desta etapa

Esta primeira mudança não implementou ilha/dock Linux, cofre Linux, controles de
sistema ou empacotamento Linux. O nome do Node e os recursos foram posteriormente
adaptados na etapa de release sem Vite registrada ao final deste documento. A geração atual desses recursos é pré-requisito do build Rust:

```bash
pnpm build
pnpm ponte:build
cargo check --locked --offline --manifest-path src-tauri/Cargo.toml
cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --lib
cargo build --locked --offline --manifest-path src-tauri/Cargo.toml --bin niko
```

`--offline` exige dependências Cargo previamente baixadas; no primeiro preparo,
executar sem essa opção. O banco, o navegador real e as janelas não são validados
pelos testes unitários desta etapa. No Linux, serviços hoje inicializados pela ilha
também precisarão de tratamento antes de declarar funções como lembretes validadas.

### Revisão independente

Agente `review_linux_compile` revisou o diff sem alterar arquivos. Encontrou espera
síncrona de `xdg-open` que poderia bloquear a interface (P2). Corrigido com comando
Linux assíncrono e `spawn_blocking`, e acrescentadas verificações de sucesso/falha.
Na segunda revisão, confirmou a resolução e não identificou novos bloqueantes.
Não executou aplicativo nem validou Windows; revisão estática não é teste de runtime.

### Resultados finais

- `pnpm build`: passou; Vite emitiu avisos sobre imports sem extensão para uma futura
  mudança de loader, sem impedir o build.
- `pnpm ponte:build`: passou; recursos gerados pelo script existente.
- `cargo check --locked --offline --manifest-path src-tauri/Cargo.toml`: passou
  novamente após a correção apontada pelo revisor.
- `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --lib`:
  **3 passaram, 0 falharam**. Primeira compilação das dependências levou 8m19s;
  execução dos testes levou 0,02s.
- `cargo build --locked --offline --manifest-path src-tauri/Cargo.toml --bin niko`:
  passou; executável em `src-tauri/target/debug/niko`.
- Cargo emitiu aviso de campos não lidos em `Retangulo` no Linux porque sobrepostas
  ainda não são criadas. Não foi suprimido; não impediu testes nem build.
- Árvore Cargo para Linux não inclui `windows-future`; a consulta da árvore Windows
  em modo offline não terminou por falta de pacote em cache, sem validar Windows.
- `git diff --check`: passou. Nenhum commit, push ou PR realizado nesta etapa.

**Conclusão da etapa 3:** compilação Linux de desenvolvimento validada neste Ubuntu
x86_64. Não comprova execução gráfica, persistência, instalação, outras distribuições
ou ausência de regressões Windows. A etapa 4 continua pendente.

## Janela principal e persistência: registro da validação

### Alterações

- `servidor/ia.ts`: Linux usa `$XDG_DATA_HOME/com.niko.desktop` quando a variável
  é absoluta; caso contrário, `~/.local/share/com.niko.desktop`. O override APPDATA
  existente continua aceito e mantém o caminho Windows e o isolamento dos testes.
- `src/desktop/desktop.ts`: reconhece também protocolo `tauri:` para encaminhar
  requisições da janela Linux à ponte autenticada. O caminho Windows foi preservado.
- `servidor/ponte.test.mjs`: teste do encaminhamento/token com ambiente frontend
  simulado e teste de integração da ponte real com SQLite em diretório temporário.
  Grava dados, encerra o processo, inicia outro e confere o mesmo conteúdo. Também
  verifica token incorreto, origens nativas, preflight e origem rejeitada.
- `package.json`: comando `pnpm ponte:testar` constrói a ponte antes dos dois testes.
- `.github/workflows/compatibilidade.yml`: verificações Windows, sem release.

### Evidências

- `pnpm verificar`, `pnpm build` e `pnpm ponte:testar` passaram (2 testes novos).
- Suíte dos seis arquivos JS existentes: 87 testes, **85 passaram, 0 falharam e
  2 testes nativos Windows foram pulados no Linux**. Comando:

```bash
node --test --test-concurrency=1 scripts/chat.test.mjs scripts/midia.test.mjs scripts/claude.test.mjs scripts/versao-release.test.mjs scripts/animacoes-ilha.test.mjs scripts/ilha.test.mjs
```

- Segundo agente revisou alterações e workflow. Pediu adicionar teste da ponte à
  CI e ignorar XDG relativo; ambos corrigidos. Revisão final sem novos bloqueantes.
- Processo desktop iniciado no Ubuntu/GNOME/Wayland com o servidor Vite ativo,
  usando `XDG_DATA_HOME=/tmp/niko-linux-desktop` para não tocar em dados pessoais.
  O processo permaneceu ativo; houve aviso CRITICAL do gst-plugin-scanner sobre
  formato de vídeo. Isso não comprova erro da interface nem renderização correta.
- Usuário confirmou que a janela renderizou, permitiu mudar cor e mostrou o layout.
  Depois de algum tempo, sem relação imediata com a mudança de cor, relatou tela
  preta. Logs do Vite registram reinício por alterações em `servidor/ia.ts` e reload
  de `package.json` durante a sessão. Reinício do servidor é hipótese, não causa
  comprovada. Leitura SQLite confirmou configuração de tema salva. Processo de
  teste fechado e reaberto com os mesmos dados; recuperação visual pendente.
- Após reabertura, usuário confirmou recuperação da interface e relatou lentidão.
  Causa da tela preta não comprovada; não foi aplicada correção especulativa.
  Ambiente observado: Celeron N4500 (2 núcleos), aproximadamente 16 GB RAM,
  6,9 GiB de memória disponível na consulta. Processos WebKit e Node estavam entre
  os consumidores relevantes; valores de CPU do `ps` são médias ao longo da vida
  do processo, não benchmark instantâneo. Execução atual usa Rust debug e Vite.
  Não há comparação de desempenho com build de distribuição nem diagnóstico
  suficiente para atribuir lentidão exclusivamente ao hardware.
- Usuário criou “Teste Linux”; imagem confirmou sua exibição na barra lateral.
  Após informar “pronto”, o processo desktop anterior foi observado encerrado com
  código 0. Consulta somente leitura ao SQLite confirmou a tarefa gravada. Niko
  reaberto com o mesmo XDG_DATA_HOME; usuário confirmou que “Teste Linux” reapareceu.
  O mecanismo de encerramento usado pelo usuário não foi confirmado.

### Roteiro manual (debug e release confirmados)

O agente não dispõe de inspeção visual da janela nativa nesta sessão. Confirmar:

1. A janela mostra a interface, sem tela em branco ou erro da ponte.
2. Criar uma tarefa identificada como teste e verificar sua exibição.
3. Sair pelo comando Sair do aplicativo; reiniciar e conferir a tarefa.
4. Registrar observação e resultado de cada ação. Em modo desenvolvimento manter
   o servidor Vite ativo. A ponte debug é servida pelo Vite; a validação da ponte
   release está registrada na etapa seguinte.

Para reproduzir o ambiente isolado, ativar Node 22 e executar em dois terminais:

```bash
XDG_DATA_HOME=/tmp/niko-linux-desktop pnpm dev
```

```bash
XDG_DATA_HOME=/tmp/niko-linux-desktop src-tauri/target/debug/niko
```

Persistência da ponte real e persistência acionada pela interface debug foram
validadas, a última pela confirmação do usuário. Renderização e interação debug
também confirmadas. A validação posterior de saída e reinício da release registrada
ao final concluiu a etapa 4; pacote instalado permanece como critério separado.

## Como verificar o Windows

O Linux local não prova funcionamento no Windows. Preservar implementações Windows
e usar compilação condicional reduz risco, mas não é evidência de execução.

Workflow criado: `.github/workflows/compatibilidade.yml`, com runner Windows para a
mesma revisão do PR, disparado por `pull_request` ou manualmente.
Seguir a [documentação de pipelines do Tauri](https://v2.tauri.app/distribute/pipelines/github/).
YAML e caminhos verificados localmente; workflow ainda não enviado nem executado no
GitHub. Não houve validação Windows nesta sessão. Permissões somente de leitura,
sem publicação de release ou uso de credenciais pessoais.

Executa instalação congelada, TypeScript, seis arquivos JS existentes, build da
interface e ponte, os testes novos da ponte e cargo check/test/build do executável.
Os testes Rust atuais são específicos do Linux e não executam no Windows.

No Windows, verificar instalação com lockfile, tipos, os arquivos de teste realmente
existentes, build da interface/ponte e compilação Rust. Gerar também o executável
desktop; validar o instalador quando o fluxo de empacotamento estiver preparado.
Não disponibilizar chaves de assinatura ou credenciais pessoais em testes de PR.

Depois, usar computador ou VM Windows com interface gráfica para teste manual:

- Instalar/iniciar, fechar/reabrir e confirmar persistência de dados.
- Conferir ilha, dock, foco e miniaturas de janelas.
- Conferir mídia, credenciais e os controles de sistema tocados pela contribuição.
- Confirmar encerramento da ponte e restauração da barra do Windows.

Registrar revisão testada, versão do Windows, ações executadas e resultados.
Comparar com a revisão original quando houver dúvida de regressão. Build aprovado
em CI será descrito como compilação validada; execução Windows só será declarada
após observação em ambiente Windows. Wine pode ajudar em diagnóstico, mas não
substitui essa validação. Uma compilação cruzada no Linux também não a substitui.

## Registro de alterações e testes

| Data | Alteração / verificação | Resultado |
| --- | --- | --- |
| 06/10/2026 | Leitura de arquitetura e dependências Windows | Obstáculos listados acima; sem alterações de código |
| 06/10/2026 | Consulta a versões, pacotes, sessão gráfica e rustup | Ambiente registrado; instalação de dependências pendente |
| 06/10/2026 | Criação deste documento | Preparação e critérios registrados; aplicativo não testado |
| 06/10/2026 | Verificação após instalação pelo colaborador | Node 22.23.3, pnpm 10.34.6 e quatro bibliotecas antes ausentes disponíveis |
| 06/10/2026 | `pnpm verificar` | Checagem TypeScript passou |
| 06/10/2026 | `pnpm test` dentro do sandbox | Quatro arquivos de teste passaram; teste Claude falhou sem diagnóstico detalhado |
| 06/10/2026 | `node --test --test-reporter=spec scripts/claude.test.mjs` fora do sandbox | 20 testes passaram; falha anterior ligada à restrição de servidor local |
| 06/10/2026 | `cargo check --locked --manifest-path src-tauri/Cargo.toml` | Rust 1.88 recusado pelas dependências; toolchain atualizada para 1.99.0 e verificação reiniciada |
| 06/10/2026 | Plano incremental e validação Windows documentados | Etapas com estados e critérios; CI Windows e execução manual ainda pendentes |
| 06/10/2026 | Fluxo de revisão por segundo agente acordado | Implementação, testes, revisão sem escrita, correções e registro antes de concluir etapas de código |
| 06/10/2026 | Resultado da compilação inicial com Rust 1.99 | Falhou com 16 erros E0425 em windows-future 0.3.2 (IMarshal, marshaler e submit ausentes); dependência Windows está sendo compilada no Linux; aplicativo não executado |
| 06/10/2026 | Primeira adaptação Linux e revisão independente | Dependência Windows isolada; caminhos Linux de token/foco/links; achado P2 corrigido e reavaliado |
| 06/10/2026 | Validação final da compilação Linux | Interface, ponte, cargo check, 3 testes Rust e build do executável passaram; etapa 3 concluída, execução gráfica e Windows pendentes |
| 06/10/2026 | Ajustes de dados XDG e origem da janela Linux | Revisados por segundo agente; novos testes 2/2, tipos e build passaram |
| 06/10/2026 | Suíte JS existente fora do sandbox | 85 aprovados, 0 falhas, 2 pulados por exigirem Windows |
| 06/10/2026 | Início do desktop com dados isolados | Processo ativo; confirmação visual e persistência pela interface pendentes |
| 06/10/2026 | Workflow Windows criado e revisado | Arquivo local preparado; execução no GitHub e resultado Windows pendentes |

O script `pnpm test` também referencia `scripts/navegacao-ilha.test.mjs` e
`scripts/ponte.test.mjs`, ausentes no checkout inicial. A execução observada
apresentou apenas os cinco arquivos existentes; não representa validação desses
dois testes ausentes. Não foram criados testes substitutos nesta etapa.

Atualizar este registro a cada mudança, incluindo comandos de validação, resultados
e limitações. Não registrar credenciais ou chaves de serviços.

## Execução Linux de distribuição sem Vite — em andamento (06/10/2026)

Escopo autorizado: gerar e executar release sem servidor Vite, comparar com debug,
revisar e registrar. Sem commit, push, PR ou publicação. `/tmp/niko-linux-desktop`
é preservado; não consultar provedores ou credenciais para os testes.

### Implementação desta etapa

- `scripts/construir-ponte.mjs`: copia o runtime como `node` no Linux e mantém
  `node.exe` no Windows. O arquivo Linux conserva a permissão de execução.
- `.gitignore`: ignora também o runtime Linux gerado.
- `src-tauri/src/lib.rs`: seleciona o mesmo nome por plataforma ao iniciar a ponte.
  Mantém início fora de debug, token aleatório e monitoramento existentes.
- `src-tauri/tauri.linux.conf.json`: overlay nativo do Tauri; array de recursos
  substitui o mapa Windows por `recursos/node` e `recursos/ponte.mjs`; alvo Linux
  `deb`, sem artefatos updater nesta etapa. Configuração base Windows preservada.
- `servidor/ponte.test.mjs`: integração usa o Node copiado nos recursos; rejeita
  token errado, token vazio e ausência de `x-niko`, além das verificações anteriores.

### Comandos e resultados

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 22
source "$HOME/.cargo/env"
CARGO_NET_OFFLINE=true pnpm tauri build --no-bundle
node --test servidor/ponte.test.mjs
```

- Node 22.23.3, pnpm 10.34.6, Rust 1.99.0 novamente observados.
- Tentativa `pnpm tauri build --no-bundle --offline` recusada pelo parser CLI;
  corrigida para `CARGO_NET_OFFLINE=true`, sem alterar dependências.
- `pnpm build` e geração da ponte passaram no hook do build release.
- Dois testes da ponte passaram com o runtime incluído; repetição com os dois
  casos negativos adicionais: **2 passaram, 0 falharam** (5,75 s total).
- Sandbox impediu execução dos testes com servidor local; execução autorizada
  fora do sandbox passou. Dados dos testes automatizados ficam em diretório
  temporário próprio, sem apagar `/tmp/niko-linux-desktop`.
- Runtime gerado confirmado como ELF x86_64 executável.

### Revisão independente desta etapa

Agente `review_linux_release`, sem editar código: sem achados bloqueantes no diff.
Confirmou no código instalado do Tauri a substituição do mapa pelo array Linux e
cópia de recursos para a pasta Cargo mesmo sem bundle. Executou os dois testes da
ponte independentemente fora do sandbox: **2/2 passaram**. Sugeriu autenticação
sem token/sem `x-niko`; asserts adicionados, reexecução passou e delta revisado.
Apontou lacuna de encerramento desktop real: Rust usa `Child.kill()` (SIGKILL no
Linux), enquanto o teste original encerrava por SIGTERM. O teste agora força SIGKILL
antes de reiniciar e conferir SQLite: **2/2 passaram** (8,12 s). Esse delta foi
revisado, sem achado. Saída pelo usuário e reinício posteriormente validados
conforme registro final abaixo.
Revisão estática não valida Windows nem instalação.

### Critérios ainda pendentes

Build release e início nativo da ponte passaram; medições por intervalo registradas
abaixo. Usuário confirmou interface/tarefa release e percepção de execução mais leve.
Saída informada pelo usuário validada; janela e tarefa após último reinício
confirmadas pelo usuário. Encerramento/reinício de segurança registrados abaixo.
Pacote instalável continua pendente: `--no-bundle` não gera nem instala pacote.
O Tauri resolve recursos ao lado do executável dentro de `target/release` quando
identifica a pasta Cargo; isso não comprova que um executável copiado sozinho funcione.

### Build e inicialização release observados

- Build Tauri `--no-bundle` completo passou: **22m12s**, perfil release otimizado
  original (`opt-level="s"`, LTO, um codegen unit). Não usa Vite em runtime.
- Executável `src-tauri/target/release/niko`, ELF x86_64 stripped, e recursos
  `target/release/recursos/node` + `ponte.mjs` gerados. Node tem bit executável.
- Três testes Rust passaram após mudanças: **3/3**, build teste 28,75 s.
- Release aberta com `XDG_DATA_HOME=/tmp/niko-linux-desktop`; logs confirmaram
  início da ponte com o Node incluído, filho direto do desktop, porta 47831.
- Portas 5420/5421 fechadas antes da execução release. Não há servidor Vite
  atendendo a interface release. Confirmação visual foi solicitada ao usuário.
- Avisos conhecidos: campos de Retangulo não usados no Linux e SQLite experimental
  no Node; nenhum impediu build/início observado.

### Comparação observada de consumo

Método: Python `/proc/<pid>/stat`, delta `utime+stime` por `SC_CLK_TCK`, 20 intervalos
consecutivos de aproximadamente 1 s; soma desktop e descendentes. Desenvolvimento
inclui também árvore do Vite. Sem build/testes concorrentes na coleta final, mesma
sessão gráfica e dados. Desktop reaberto em cada modo; sem ações automatizadas na
interface. Estado visual/ações do usuário não controlados; amostras únicas, portanto
não é benchmark geral nem prova de responsividade. A primeira coleta coincidiu
com recompilação de testes Rust e foi descartada.

| Execução | CPU média por intervalo, 100% = um núcleo | RSS somado médio | RSS somado máximo |
| --- | ---: | ---: | ---: |
| Debug + Vite | 100,72% | 1.135,84 MiB | 1.190,41 MiB |
| Release + Node incluído, sem Vite | 90,05% | 669,85 MiB | 669,95 MiB |

Nesta amostra: CPU cerca de 10,6% menor e RSS somado cerca de 41,0% menor na
release. RSS pode contar páginas compartilhadas mais de uma vez; não representa
memória exclusiva nem RAM efetiva do sistema. CPU veio de deltas por intervalo,
**não** da média histórica `%CPU` de `ps`. Não atribuir lentidão ao hardware ou
provar causalidade entre modo de build e experiência com essas amostras.

Evidências locais: `/tmp/niko-medicao-dev.json`, `/tmp/niko-medicao-release.json`
e coletor `/tmp/niko-medir.py`. Para reproduzir: `python3 /tmp/niko-medir.py PID_DESKTOP
PID_VITE` no desenvolvimento; somente PID_DESKTOP na release, pois Node é filho.
Aguardar inicialização e não compilar durante a coleta. Esses arquivos temporários
não são testes permanentes do repositório.

- Ponte iniciada pelo desktop release: token ausente e incorreto retornaram **403**.
  Não ler/exibir o token nativo nem credenciais pessoais. Casos autenticados,
  origem/preflight e SQLite cobertos pelos testes com token sintético e Node incluído.
- Consulta SQLite somente leitura e resultado booleano confirmou “Teste Linux”
  presente no diretório isolado; nenhum conteúdo de credenciais foi inspecionado.
- Usuário confirmou na release: “A tarefa ainda está e agora está mais leve a
  execução”. Isso confirma visualmente a tarefa e percepção de melhora nesta sessão;
  não é medição de latência de navegação nem prova geral de desempenho.

### Lifecycle release e persistência reais

- Ponte filha encerrada por SIGTERM; monitor do Rust iniciou outro Node e porta
  voltou a rejeitar requisição não autenticada em **3,14 s**. Log confirmou novo PID.
- Desktop terminado por SIGTERM; ponte detectou perda do pai e encerrou em **1,75 s**
  nesta observação; porta 47831 fechada. Isso valida o fallback por perda do pai,
  **não** o evento Tauri de saída pelo comando Sair.
- Após encerramento, `PRAGMA quick_check` via SQLite somente leitura retornou **ok**;
  consulta booleana confirmou “Teste Linux” preservada.
- Release reaberta com os mesmos dados, sem Vite, para confirmação visual.
- Auth positiva e gravação/reinício com SQLite são testes reais da ponte incluída
  com token sintético; o token interno do desktop não foi extraído. Usuário confirmou
  visualmente a tarefa na interface release; IPC não foi instrumentado separadamente.

### Estado final desta execução

Adaptação mínima, build release, recursos, testes Rust/ponte, revisão independente,
lifecycle de segurança, integridade e coleta de consumo: realizados. Nenhum achado
bloqueante do diff ficou aberto. `git diff --check` passou.

**Etapa de release sem Vite concluída neste Ubuntu/GNOME/Wayland:** usuário
confirmou interface, tarefa e execução mais leve; saída validada tecnicamente e
janela/tarefa confirmadas após o último reinício. Etapa 4 concluída. Etapa 6 (pacote) continua
pendente: não foi gerado/instalado pacote, nem validada relocação do executável.
Windows não executado, workflow local não publicado/executado no GitHub. Sem commit,
push, PR ou release publicado. Ilha, dock, cofre e controles Linux não implementados.

Revisão final `review_linux_release`: releu diff, relatório, coletor e JSONs; sem
bloqueantes. Conferiu índices `/proc/stat`, tempo monotônico, ticks, somas e reduções
da tabela; ressaltou variação entre intervalos e necessidade de não generalizar.
Confirmou separação entre fallback por perda do pai, comando Sair e IPC/interface.
`git diff --check` passou novamente. Pendências acima permanecem explícitas.

### Validação após saída pelo usuário (06/10/2026)

Após o roteiro solicitando Sair, usuário informou que saiu e pediu validação.
A janela nativa não foi inspecionada pelo agente; o gesto exato é informado pelo
usuário/contexto do roteiro. Evidências técnicas da saída:

- Sessão do executável release retornou **código 0**.
- Nenhum processo Niko/WebKit da execução permaneceu; porta da ponte 47831 fechada.
  Portas Vite 5420/5421 também fechadas.
- SQLite somente leitura: `PRAGMA quick_check` **ok**; “Teste Linux” presente
  (consulta booleana, sem exibir dados ou ler credenciais).
- Release reaberta com `XDG_DATA_HOME=/tmp/niko-linux-desktop`, mesmos dados,
  sem Vite. Ponte filha e porta 47831 voltaram a iniciar normalmente.
- Usuário respondeu “Sim” à confirmação de janela aberta e “Teste Linux”
  reaparecida após este último reinício. Critério visual final atendido.
  Pacote instalado, Windows e integrações Linux seguem fora da validação.

### Geração do pacote .deb iniciada (06/10/2026)

Usuário autorizou gerar/testar o .deb e pediu deixar a geração rodando sem
acompanhamento se demorar. Usado `pnpm tauri bundle --bundles deb --ci` para
empacotar a release já compilada, sem recompilar Rust. Processo iniciado com nohup,
Node 22 e Cargo offline; sem assinatura/publicação ou leitura de credenciais.

- Log: `/tmp/niko-deb-build.log`.
- PID: `/tmp/niko-deb-build.pid`.
- Código final, gravado ao terminar: `/tmp/niko-deb-exit-code` (0 indica sucesso).
- Saída prevista: `src-tauri/target/release/bundle/deb/`.
- Estado: geração iniciada; resultado ainda não verificado. Sem acompanhamento
  periódico, conforme pedido. Inspeção, instalação e teste do pacote pendentes.

### Correção da inicialização do empacotamento

Na consulta posterior, nenhum .deb/código final existia; log vazio e processo nohup
ausente. O lançamento desacoplado anterior não persistiu nesta ferramenta; portanto
a confirmação de que estava rodando foi corrigida. Geração reiniciada em sessão
mantida de `exec_command`, com o mesmo script/comando e log. Resultado ainda pendente.

A geração reiniciada criou um .deb legível por `dpkg-deb --info`, mas terminou com
código 1 por `Text file busy`: tentou modificar/restaurar o executável release aberto.
Esse arquivo não foi tratado como geração aprovada. Repetido com
`pnpm tauri bundle --bundles deb --ci --no-binary-patching`, evitando tocar no binário
em execução. Isso preserva a janela aberta; atualização por tipo de pacote não foi
validada e artefatos de updater permanecem desabilitados no overlay Linux.

Mesmo `--no-binary-patching` terminou com Text file busy na finalização. A release
de teste foi então encerrada por SIGTERM, preservando dados; geração reiniciada
com o comando original (sem --no-binary-patching). Não generalizar o sucesso da
criação parcial do arquivo como sucesso do processo de empacotamento.

Resultado final: geração **passou, código 0**, pacote
`src-tauri/target/release/bundle/deb/Niko_0.2.0_amd64.deb`, **50,64 MiB**.
`dpkg-deb --info` confirmou niko 0.2.0 amd64 e dependências Linux; conteúdo inclui
`/usr/bin/niko` e `/usr/lib/Niko/recursos/node` executáveis, e ponte.mjs.
A pasta do pacote usa `Niko` com maiúscula; conferir resolução real de recursos
na execução instalada, sem presumir equivalência de caminhos no Linux.
Inspeção estrutural não valida instalação ou execução do pacote. Etapa 6 segue
parcial até instalar/executar/persistir e validar saída. Sem publicação/push/PR.

## Validação do pacote .deb — iniciada em 06/10/2026

- Pacote niko 0.2.0 amd64 gerado com código 0. Control archive contém apenas
  control e md5sums, sem scripts de instalação.
- Extraído em diretório único `/tmp/niko-deb-validacao-*`; sete checksums internos
  passaram. `ldd usr/bin/niko` não mostrou bibliotecas ausentes.
- Entrada desktop: `Exec=niko`, `Name=Niko`, `Icon=niko`, Terminal=false.
- Conferido tauri-codegen/context.rs instalado: PackageInfo.name usa productName
  `Niko`. Diretório `usr/lib/Niko` é coerente, sem mudança de configuração.
- `sudo -n true` retornou senha necessária. Usuário orientado a executar
  `sudo apt install /caminho/Niko/src-tauri/target/release/bundle/deb/Niko_0.2.0_amd64.deb`
  no próprio terminal, sem compartilhar senha. Instalação real ainda pendente.
- Executável extraído aberto com XDG_DATA_HOME=/tmp/niko-linux-desktop. Log confirmou
  Node e ponte em `/tmp/niko-deb-validacao-IY26CV/usr/lib/Niko/recursos/`, não Cargo.
  Porta 47831 ativa; sem Vite nas portas 5420/5421.
- Ponte do pacote rejeitou token ausente/incorreto com 403; SQLite somente leitura
  retornou quick_check ok e tarefa “Teste Linux” presente (booleano).
- Isso valida estrutura e inicialização do pacote extraído, **não** instalação
  gerenciada pelo dpkg/apt ou renderização visual. Etapa 6 permanece em andamento;
  falta instalar, executar /usr/bin/niko, confirmar interface/persistência e saída.

Revisor `review_linux_release` verificou o pacote independentemente: sem bloqueantes,
checksums7/7, ldd e caminho productName confirmados. Recomendou fechar a instância
extraída antes de testar instalada para não obter falso positivo por single-instance.
Instância extraída encerrada pelo agente; lançamento pelo menu não será usado sem
isolamento XDG explícito. Teste instalado exigirá exe=/usr/bin/niko e Node filho de
/usr/lib/Niko/recursos/node. Sem mudança de código nesta validação.

### Execução do pacote instalado (06/10/2026)

Após usuário confirmar instalação:
- `dpkg-query`: **install ok installed 0.2.0 amd64**.
- `dpkg -V niko`: nenhuma divergência registrada, comando passou.
- Arquivos root-owned instalados em `/usr/bin/niko` e `/usr/lib/Niko/recursos/`;
  desktop e Node possuem permissões de execução.
- Aberto `XDG_DATA_HOME=/tmp/niko-linux-desktop /usr/bin/niko`.
- `/proc` confirmou desktop exe=/usr/bin/niko e Node filho direto com
  exe=/usr/lib/Niko/recursos/node: sem falso positivo da instância extraída/Cargo.
- Porta 47831 ativa, Vite 5420/5421 fechadas; token ausente/incorreto retornaram 403.
- SQLite somente leitura: quick_check ok, presença de “Teste Linux” confirmada
  por booleano. Não ler/exibir credenciais.
- Logs stdout/stderr do desktop instalado sem erro observado na consulta.
- Pendentes para concluir etapa 6: confirmação visual do aplicativo instalado,
  saída pelo usuário, desktop/ponte encerrados e reinício com tarefa reaparecida.
  Não declarar pacote totalmente validado antes dessas evidências.

### Saída do aplicativo instalado e revisão

Usuário confirmou interface/tarefa visíveis e informou saída. Sessão instalada
retornou código 0; nenhum Niko/WebKit da execução nem porta 47831 permaneceu.
Vite ausente. SQLite quick_check ok e “Teste Linux” preservada após saída.
Reaberto /usr/bin/niko com os mesmos dados isolados para confirmação final.

Revisor `review_linux_release` releu registro, sem bloqueantes e diff check passou.
Ressaltou que tarefa preexistente prova leitura/preservação, não nova escrita pela
interface instalada. Para cobrir escrita instalada, solicitar criar “Teste .deb”,
sair e conferir após reinício. Etapa 6 permanece em andamento por esse teste manual.

### Nova tarefa instalada — confirmação ainda pendente

Após solicitação de criar “Teste .deb” e sair, usuário informou pronto.
Sessão instalada retornou código 0; desktop/WebKit e ponte encerrados, portas
47831/5420/5421 fechadas. SQLite quick_check ok e “Teste Linux” preservada.
Consulta somente leitura por nome exato “Teste .deb” NÃO encontrou ocorrência.
Não concluir falha de persistência sem confirmar o nome utilizado; pergunta enviada
ao usuário e aplicativo instalado reaberto com mesmos dados. Nova escrita instalada
permanece pendente até esclarecer e confirmar a tarefa após reinício.

### Conclusão da validação instalada (06/10/2026)

Usuário esclareceu que a nova tarefa se chama **“New Teste Linux”** e confirmou
que reapareceu no aplicativo instalado após saída/reinício. Consulta SQLite
somente leitura confirmou essa ocorrência e quick_check ok. Ausência de “Teste .deb”
na consulta anterior era diferença de nome; não há falha de persistência comprovada.

**Etapa 6 concluída neste Ubuntu 24.04.5/GNOME/Wayland x86_64:** pacote gerado,
instalado (dpkg), arquivos verificados, desktop /usr/bin/niko e Node instalado
confirmados, execução sem Vite, autenticação negativa, interface confirmada pelo
usuário, nova gravação pela interface instalada e persistência após saída/reinício,
saída com código 0 e ponte/porta encerradas, SQLite íntegro. Revisão independente
registrada acima, sem achados bloqueantes. Evidência visual veio do usuário;
IPC não instrumentado, abertura pelo menu fora do isolamento não testada.

Esta conclusão não valida Windows, outras distribuições, updater, ilha/dock/cofre
ou controles Linux. Sem commit, push, PR ou publicação. Dados de teste preservados.


## Primeira base da ilha — 06/10/2026, em validação

Proposta aceita pelo usuário: **janela móvel experimental**, com moldura nativa,
opaca e pequena; expandir componentes locais existentes, abrir a principal e
reutilizar a sincronia. Sem instalar dependências/extensões ou forçar X11.
O dock não foi adaptado nesta etapa.

### Capacidade e limites

GNOME/Wayland controla posicionamento e empilhamento. [GTK Window.move](https://docs.gtk.org/gtk3/method.Window.move.html)
permite ao compositor ignorar posição; [GTK set_keep_above](https://docs.gtk.org/gtk3/method.Window.set_keep_above.html)
não garante ficar acima. A implementação instalada de Tao 0.37.1 retorna (0,0)
para consulta global do cursor no Wayland (platform_impl/linux/util.rs).
Portanto esta base não usa posição global, observação global do cursor,
passagem de cliques, faixa transparente ou detecção global de fullscreen.
A janela ocupa somente seu retângulo dimensionado; a ausência de bloqueio dos
outros aplicativos ainda exige confirmação nativa.

| Fluxo | Primeira implementação Linux | Estado Windows |
| --- | --- | --- |
| Criação/posição | Janela comum, moldura, posição pelo compositor | Sobrepostas existentes mantidas |
| Transparência/foco | Fundo opaco; ativação normal, restauração pelo menu | Fluxo anterior mantido |
| Área/cursor/cliques | Dimensionamento nativo real; sem observador global | Retângulos e Win32 mantidos |
| Monitores/fullscreen | Sem ancoragem ou ocultação global automática | Implementação anterior mantida |
| Barra/reserva/miniaturas | Não implementadas | Módulos anteriores mantidos |
| Serviços/sincronia | AppIlha continua único dono de useServicos; sincronia existente | Sem validação runtime nesta sessão |

Abas locais: Hoje, Captura, Foco, Hábitos, Calendário e Avisos. As demais ficam
indisponíveis no Linux nesta base. Os modos de ocultação dependentes do cursor
usam estado compacto nesta janela experimental. Barra lateral do sistema, mídia,
consumo de planos, integrações de conexões, Claude Code e updater automático da
ilha não são iniciados no Linux. A consulta compartilhada lerConsumo rejeita
explicitamente antes de acessar a ponte, evitando leitura de credenciais pessoais.
Limpeza automática de tarefas de demonstração foi desativada no Linux para
preservar os dados isolados existentes.

### Arquivos e verificações

Alterações desta etapa: src-tauri/src/lib.rs, src/desktop/Aplicativos.tsx,
src/desktop/desktop.ts, src/janelas/ilha/Ilha.tsx e ilha.css,
src/servicos/servicos.ts, src/ponte/ponteLocal.ts; teste servidor/ilha-linux.test.mjs.
Comando dimensionar_ilha valida origem (janela ilha), valores finitos e limites;
erros reais de set_size são propagados. Fechar a ilha oculta a janela e conserva
seus serviços; menu “Mostrar ilha” restaura quando habilitada.

Comandos (carregar ~/.nvm/nvm.sh, nvm use 22 e ~/.cargo/env):

```bash
pnpm verificar
pnpm build
pnpm ponte:build
cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --lib
cargo build --locked --offline --manifest-path src-tauri/Cargo.toml --bin niko
node --test servidor/ilha-linux.test.mjs
CARGO_NET_OFFLINE=true pnpm tauri build --no-bundle --config src-tauri/tauri.linux.conf.json --ci
XDG_DATA_HOME=/tmp/niko-linux-desktop src-tauri/target/debug/niko
```

TypeScript, build frontend/ponte e Rust passaram (4 testes Rust). Build debug
concluiu em 1m36s. Suíte JS executada: chat, mídia, Claude, versão, animações,
ilha, ponte e novo teste Linux: 90 testes, 88 passaram e 2 específicos Windows
ignorados. O teste Linux usa Vite SSR e relógio controlado para exercitar serviços
reais: não apagar tarefa de demonstração, terminar pomodoro uma vez, disparar
lembrete, limpar timers/listeners e não consultar serviços externos. Não simula GTK
nem prova interação/sincronia entre janelas nativas. Foi repetido após correção
com sucesso; pnpm verificar e build frontend também repetidos com sucesso.
Avisos existentes do Vite native-loader e SQLite experimental persistem.

Revisão independente, somente leitura, por review_linux_island: achado P2 de
suspensão dos serviços locais lentos ao ocultar/minimizar a ilha. Corrigido mantendo
a verificação local a cada 20s também oculta no Linux, sem duplicar o serviço.
Teste cobre lembrete enquanto oculto e ausência de repetição; revisor repetiu teste
com sucesso e não encontrou outros achados acionáveis. Windows continua não validado.

### Execução nativa e critérios pendentes

Antes de abrir debug, nenhum outro Niko ativo foi encontrado. Vite iniciado em
sessão mantida, XDG_DATA_HOME=/tmp/niko-linux-desktop preservado. SQLite quick_check
ok e tarefas “Teste Linux” e “New Teste Linux” presentes antes da execução.
Debug iniciou dois webviews, mas WebKit registrou internallyFailedLoadTimerFired;
usuário confirmou **tela preta**. Vite respondeu HTTP 200 para índice e módulo
principal; isso não prova carregamento do WebKit. Debug encerrado por SIGTERM para
permitir investigação sem falso positivo de single-instance.

Primeiro build release desta etapa terminou em 5m17s. Após ajuste de serviço e
novo build frontend, build release atualizado iniciado em sessão mantida.
Ainda não há confirmação visual da release desta etapa. [Diagnóstico oficial Tauri](https://v2.tauri.app/develop/debug/linux-graphics/)
inclui investigação de renderer para janelas vazias; nenhuma variável de workaround
foi incorporada ao produto nem há causa confirmada para esta tela preta.

Critérios ainda abertos: renderização debug/release, expansão/abas/campo de tarefa,
foco e abertura da principal pela ilha, sincronia nos dois sentidos, fechar/restaurar,
interação com outros aplicativos e saída/persistência desta nova versão.
Não marcar ilha concluída sem essas evidências. Não houve medição de consumo com
build concorrente. .deb anterior permanece instalado e validado para a etapa
anterior; não foi gerado/reinstalado durante ajustes da ilha. Revalidar pacote ao
fechar etapa relevante. Dados preservados, sem commit, push, PR ou publicação.


### Correções do registro e diagnóstico em andamento

Comando da suíte completa (novo teste agora em caminho não ignorado pelo Git):

```bash
node --test --test-reporter=spec servidor/ilha-linux.test.mjs scripts/chat.test.mjs scripts/midia.test.mjs scripts/claude.test.mjs scripts/versao-release.test.mjs scripts/animacoes-ilha.test.mjs scripts/ilha.test.mjs servidor/ponte.test.mjs
```

Durante a execução original o teste Linux estava em scripts/ilha-linux.test.mjs;
foi movido sem mudar conteúdo porque scripts/ é ignorado. Reexecutado no novo
caminho com sucesso. pnpm test existente não inclui este teste.

Diagnóstico temporário iniciado, sem incorporar workaround ao produto:

```bash
WEBKIT_DISABLE_DMABUF_RENDERER=1 XDG_DATA_HOME=/tmp/niko-linux-desktop src-tauri/target/debug/niko
```

Resultado visual ainda aguardado. Build direto cargo --release de 5m17s não
configurou custom-protocol: flags observadas incluíam cfg(dev). Portanto foi uma
compilação otimizada de desenvolvimento, não uma release embarcada sem Vite.
Segundo build direto foi interrompido; substituído por CLI Tauri --no-bundle
registrado acima, em sessão mantida. Nenhuma execução sem Vite desta nova etapa
foi declarada validada. Revisão documental apontou falta do comando da suíte;
corrigida aqui. Não houve novos achados de código.


### Resultado do diagnóstico temporário

Usuário confirmou **principal e ilha aparecem** com WEBKIT_DISABLE_DMABUF_RENDERER=1
no debug. Sem a variável houve tela preta. Isso aponta para o caminho de renderização
WebKitGTK; não estabelece um workaround necessário para todas as distribuições.
Nenhuma alteração de renderer foi incorporada ao produto. Interação, sincronia e
foco estão em teste manual. SQLite somente leitura repetido: quick_check ok,
duas tarefas originais preservadas (“Teste Linux” e “New Teste Linux”).


Build correto pelo CLI Tauri --no-bundle concluído com sucesso em **7m59s**,
executável target/release/niko gerado. Isso confirma compilação, ainda não execução
sem Vite ou resultado visual desta ilha. Aguardando concluir teste debug antes de
encerrar a instância e iniciar release, para respeitar single-instance.


### Retorno de uso — ajustes necessários

Usuário informou que está funcionando e que a ilha expande para mostrar botões.
Relatou Música e outro ícone parecido com tomada sem ação; as abas Mídia e
Conexões estão explicitamente desabilitadas nesta base. Não interpretar como
validação dessas integrações. Estado compacto foi percebido como quadrado e
insatisfatório. Acesso fácil, equivalente à região superior no Windows, é uma
necessidade de produto ainda não resolvida pela janela móvel experimental.

Proposta seguinte antes de mudar comportamento: melhorar a apresentação compacta
e usar “Mostrar ilha” já existente no menu do Niko para acesso imediato; alternativa
é investigar integração GNOME para região superior/hover. Não presumir que atalho
global atual do plugin funciona no Wayland. Ainda faltam confirmação específica
sobre sincronia, foco, interação com outros apps, fechar/restaurar e release sem Vite.


## Investigação: acesso pelo topo no GNOME/Wayland (06/10/2026)

Escopo autorizado nesta rodada: investigação, sem instalar extensão, nova biblioteca
ou alterar comportamento do produto. GNOME Shell local 46.0-0ubuntu6~24.04.15;
xdg-desktop-portal 1.18.4, backend GNOME 46.2. Extensões habilitadas consultadas:
Ubuntu AppIndicators, Ubuntu Dock, Desktop Icons NG e Tiling Assistant.

### Alternativas avaliadas

| Opção | Resultado no ambiente atual |
| --- | --- |
| Tauri/GTK comum | Não garante ancoragem superior nem captura global de hover; manter janela móvel como alternativa |
| gtk-layer-shell | Descartada para este GNOME: upstream declara GNOME-on-Wayland não suportado; instalar biblioteca não resolve |
| Ícone/menu já existente | Ubuntu AppIndicators habilitado; “Mostrar ilha” já existe; acesso por menu, sem garantir hover/ancoragem |
| Atalho global Tauri | Dependência global-hotkey instalada usa backend X11 no Linux; não substitui integração Wayland |
| Portal GlobalShortcuts | Ausente no gnome.portal instalado e na introspecção do portal em execução; não presumir disponível por existir na documentação |
| Extensão GNOME específica | Candidata para ponto de acesso no painel e controle da janela pelo compositor; precisa protótipo e validação real |

InputCapture está anunciado, mas não é API de layout de painel; não é proposto
capturar entrada global para obter um gatilho de hover. org.gnome.Shell.Eval aparece
na introspecção; não foi chamado e não se propõe habilitar modo inseguro.

### Proposta mínima concreta (ainda não implementada)

Extensão opcional exclusiva GNOME 46, com pequeno botão do Niko no painel superior.
Primeiro validar clique no botão mostrando e posicionando a janela existente logo
abaixo do painel. Depois validar hover com pequeno atraso e cancelamento ao sair,
sem roubar foco de teclado; clique dá foco para digitação. Usar somente a área do
botão como gatilho, sem faixa invisível ocupando toda a tela. Não deslocar o relógio
nem interferir em Atividades na primeira prova. Posição exata final é decisão de UX.

A extensão deve ser um adaptador: componentes React, dados, ponte e useServicos
continuam no Niko. Não embutir WebKit/GTK no processo do Shell nem duplicar serviços.
Reaproveitar o fluxo de “niko://mostrar-ilha”, adicionando somente um canal de ativação entre
processos se necessário. O evento atual sempre chama setFocus: o protótipo precisa
diferenciar hover (mostrar sem foco) de clique/menu (mostrar com foco), por payload
ou eventos explícitos; reutilizá-lo sem ajuste violaria o critério de não roubar foco. A segunda execução atual de niko abre a principal e ignora
argumentos: não tratar um comando novo --mostrar-ilha como já suportado. Canal D-Bus
local específico ou tratamento explícito single-instance são opções a decidir no
protótipo; não usar token HTTP da ponte ou leitura de banco pela extensão.

GNOME Shell possui acesso compositor: Meta.Window.move_frame/make_above podem
controlar a janela, diferentemente da API cliente GTK. Métodos move_frame,
make_above, get_gtk_application_id e sinal Clutter.Actor enter-event foram
confirmados disponíveis nos typelibs Meta/Clutter **14** deste GNOME 46, em processo
GJS separado, sem manipular janelas. Isso prova disponibilidade de API, não resultado
visual. Identificar a ilha por aplicação e identidade de janela, sem depender somente
do título e sem mover a principal; identidade real ainda precisa validação.

Arquivos esperados para protótipo futuro: pasta específica de extensão com
metadata.json/extension.js (CSS apenas se necessário); lib.rs para canal de ativação
e identidade; Aplicativos.tsx/Ilha.tsx para abrir expandida quando acionada pelo topo.
Sem novo serviço de negócio, sem adaptação do dock. Remover moldura/estado compacto
somente quando ancoragem/interação da alternativa tiverem passado.

Limitações: extensão executa dentro do Shell e exige limpeza de sinais/timers ao
ser desabilitada. Compatibilidade entre versões GNOME exige manutenção. Fullscreen,
lock screen, múltiplos monitores, escala, workspaces e desabilitação da extensão
precisam testes. Primeira prova deve atuar no painel do monitor principal, respeitar
fullscreen e bloquear atuação na tela de bloqueio; ao desabilitar, devolver janela
móvel e retirar apenas recursos criados pela extensão. Não prometer equivalência
Windows até validar expansão/recolhimento, posição e teclado. Outras interfaces
Linux exigem adaptadores próprios.

Critérios do protótipo: acesso com principal oculta; hover não rouba foco; clicar
permite digitar; cursor transita do gatilho para janela sem fechamento prematuro;
outros apps não ficam bloqueados; mudança de tamanho preserva posição; desativar
extensão limpa recursos/restaura alternativa; dados e serviços permanecem únicos.
Instalação/habilitação da extensão deve ser apresentada ao usuário após preparar
artefato revisável. Nenhuma extensão instalada ou código de produto alterado nesta
investigação. A release da ilha continua pendente de execução sem Vite.

Fontes primárias:
- [GTK Layer Shell — Supported Desktops](https://github.com/wmww/gtk-layer-shell#supported-desktops)
- [GNOME: botão no painel](https://gjs.guide/extensions/development/preferences.html)
- [Clutter.Actor enter-event](https://mutter.gnome.org/clutter/signal.Actor.enter-event.html)
- [Meta.Window.move_resize_frame](https://mutter.gnome.org/meta/method.Window.move_resize_frame.html)
- [Meta.Window.make_above](https://mutter.gnome.org/meta/method.Window.make_above.html)
- [Arquitetura de extensões](https://gjs.guide/extensions/overview/anatomy.html)
- [Práticas de comunicação/processos](https://gjs.guide/extensions/review-guidelines/best-practices.html)
- [GlobalShortcuts portal](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.GlobalShortcuts.html)

Consultas locais: gnome-shell --version, dpkg-query -W, arquivos
/usr/share/xdg-desktop-portal/portals/gnome.portal e gnome-portals.conf;
gnome-extensions list --enabled; gdbus introspect (somente leitura) do portal e
Shell; módulos da dependência global-hotkey; introspecção GJS separada com
GI_TYPELIB_PATH/LD_LIBRARY_PATH para mutter-14. Nada instalado/configurado.


Revisão independente somente leitura por review_linux_island: proposta coerente,
sem bloqueante de viabilidade confirmado. Achado P3: evento existente sempre dá
foco; distinção hover/clique agora registrada acima. Fontes online Meta API51 e
Clutter18 descrevem versões mais novas; a verificação local Meta/Clutter14 confirmou
somente disponibilidade dos métodos/sinal usados na proposta para GNOME46.
[Meta.Window.move_frame](https://mutter.gnome.org/meta/method.Window.move_frame.html)
complementa a fonte de posicionamento. Não houve teste de posicionamento ou hover
real, nem alteração do produto. Diff check passou.


## Protótipo GNOME autorizado e preparado — 06/10/2026

Usuário autorizou “Faça isso, vamos testar”. Criados linux/gnome/niko-ilha@local/
metadata.json e extension.js, linux/gnome/extension.test.mjs e README.md.
Extensão local exclusiva GNOME46: botão Niko no painel, hover350ms mostra expandida
sem solicitar foco, clique mostra com foco, janela existente centralizada abaixo do
painel principal e acima de janelas comuns. Sem recolher automaticamente ao sair;
moldura preservada até validação. Não substitui barra superior inteira.

Mudanças pequenas lib.rs e Aplicativos.tsx: single-instance Linux distingue
--ilha-hover (niko://revelar-ilha) e --mostrar-ilha (evento anterior); frontend
expande, restaura janela e só chama setFocus no clique/menu. Windows conserva
handler anterior. Nenhum useServicos novo. Ativação requer Niko aberto e ilha ativa;
extensão identifica aplicação com título específico, sem usar só título. Identidade
real ainda precisa confirmação no Shell. Executável e XDG_DATA_HOME são específicos
deste teste local; não é pacote de distribuição.

TypeScript passou; Rust5/5; build debug concluído em1m18s. Node checks da extensão
e teste de serviços passaram2/2. Novo teste controla timers e janela para verificar
hover/clique, posição, fullscreen no monitor destino e restauração/cleanup; não prova
GNOME real. Revisão independente readonly apontou P2 consulta fullscreen no monitor
origem em vez do destino. Corrigido para primaryMonitor.index, teste agora separa
origem1/destino0. Revisor repetiu teste1/1 com sucesso e não encontrou novos achados.
Diff check passou.

Copiados somente extension.js e metadata.json para
~/.local/share/gnome-shell/extensions/niko-ilha@local/ (não existia extensão anterior
com esse identificador). Tentativa gnome-extensions enable retornou código2:
“Extension niko-ilha@local does not exist”. Arquivos instalados, extensão NÃO
habilitada/reconhecida na sessão atual. Fonte GNOME46 confirma varredura inicial e
[ReloadExtension público desativado](https://raw.githubusercontent.com/GNOME/gnome-shell/46.0/js/ui/shellDBus.js).
Não chamado Eval, não alterado modo inseguro, não reiniciado Shell ou sessão.
Próximo passo necessário: usuário salvar trabalho e sair/entrar na sessão; habilitar
extensão depois e reabrir debug/Vite se encerrados. Não instalar bibliotecas extras.

Niko debug antigo encerrado por SIGTERM; novo aberto com workaround gráfico temporário
WEBKIT_DISABLE_DMABUF_RENDERER=1. Dois pedidos CLI sequenciais --ilha-hover e
--mostrar-ilha terminaram com código0 e restou apenas uma instância Niko (PID74969).
Isso observa entrega via single-instance/lifecycle, ainda não confirma foco/posição
visual. SQLite quick_check ok e as tarefas originais preservadas.

Critérios nativos ainda abertos: botão reconhece ilha, clique/hover, teclado em outro
app preservado no hover, digitação no clique, sincronia, dimensionamento/posição,
fullscreen, desabilitação e restauração. Release sem Vite e pacote desta etapa ainda
pendentes. Não declarar etapa concluída nem avançar dock. Sem commit/push/PR.


### Retorno à sessão e habilitação do protótipo

Usuário voltou após sair/entrar. GNOME reconheceu niko-ilha@local como INITIALIZED,
desabilitada. Nenhum processo Niko/Node ou porta5420/47831 ativo encontrado antes
de iniciar o teste. gnome-extensions enable executado; consulta posterior confirmou
Enabled Yes / State ACTIVE. Vite iniciado em sessão mantida (ready1744ms), Niko debug
novo iniciado com WEBKIT_DISABLE_DMABUF_RENDERER=1 e
XDG_DATA_HOME=/tmp/niko-linux-desktop. Nenhuma alteração adicional de código.
Solicitada confirmação visual do botão, clique, posição, expansão e foco no hover.
Estado ACTIVE prova habilitação no Shell; não comprova funcionamento da ilha.


### Revisão de comportamento: somente clique, sem janela adicional

Após teste usuário confirmou abertura agradável, mas pediu ilha sem aparência de
janela extra, estática e aberta somente por clique. Implementado: Linux sem moldura,
skip_taskbar solicitado; AppIlha não mostra ao iniciar e oculta quando recolhida.
Extensão sem hover, usa ExecuteCallback do D-Bus já existente da instância única
com NO_AUTO_START; nenhum subprocesso ou caminho de executável. Sinal position-changed
reancora tentativas de deslocamento; comparação de coordenadas evita recursão.
Pedido clique expande, mostra e dá foco. Efeito real em Alt+Tab e posição ainda pendente.

Testes: TypeScript passou, Rust5/5 e build debug45,71s. Teste extensão passou,
com respostas D-Bus atrasadas, IDs distintos e geração monotônica para impedir
timer órfão após disable/enable. Revisão independente achou essa corrida P2;
corrigida, teste repetido pelo revisor1/1, sem novos achados. Assinatura ExecuteCallback
(as argv, s cwd) confirmada pela introspecção do serviço real. README atualizado.

Extensão antiga desabilitada e arquivos atualizados. Usuário saiu/entrou novamente
por cache de módulos do GNOME46. Novo retorno: descrição click-only reconhecida,
INITIALIZED e desabilitada; nenhum Niko/Node/portas5420/47831 ativo. Habilitação
e Vite/debug iniciados novamente com dados isolados preservados e workaround
WEBKIT_DISABLE_DMABUF_RENDERER=1 temporário. Validação visual solicitada a seguir;
não declarar etapa concluída nem Windows validado. Release/dock permanecem pendentes.


## Incidente bloqueante: extensão derruba GNOME Shell — 06/10/2026

Usuário confirmou primeira abertura funcional, mas segundo clique derruba sessão
e retorna ao login com aplicativos fechados. journalctl confirmou **signal11** no
GNOME Shell em dois episódios (11:13:51 e11:28:53 America/Bahia), stack extensão
linha110 move_to_monitor em _restoreWindow, chamada por _anchor82/timeout66.
Registro também contém assertion window->stack_position>=0. Não atribuir falha
a hardware/libinput. Falha de código/lifecycle da extensão é comprovada no stack;
hipótese técnica: ocultar cliente GTK retira Meta.Window do compositor, nova abertura
obtém outro objeto e restauração tenta operar sobre o anterior inválido.

Extensão desabilitada imediatamente: Enabled No / State INACTIVE. Nenhum Niko ativo.
Não reabilitar nem pedir repetir cliques na sessão principal. Não houve exclusão de
dados ou reinício de sessão por ferramenta. coredumpctl indisponível, sem instalar.

Correção candidata no repositório: acompanhar unmanaged; esquecer referências e
sinais antes de chamadas nativas; não restaurar/mover janela não gerenciada; conferir
identidade/gerenciamento após operações Meta que podem emitir sinais síncronos.
Teste agora simula unmanaged, nova janela e unmanaged síncrono durante troca de
monitor. Teste anterior não cobria lifetime de Meta.Window e foi insuficiente.
Revisão independente reproduziu TypeError na correção inicial durante reentrância;
guarda pós-operação acrescentada, teste atualizado passou. Isto não confirma ausência
de crash nativo. Extensão instalada permanece antiga/desabilitada; não foi habilitada
candidata nesta sessão. Próxima validação deve ser em sessão GNOME isolada/nested,
antes de qualquer teste na sessão principal, sem extensões ou dependências novas.

Consulta SQLite somente leitura: quick_check ok, registro niko:rotina/state contém
**tarefas vazias**; “Teste Linux” e “New Teste Linux” não estão presentes nesta consulta.
Preservação das tarefas não pode ser reiterada com base em verificações antigas.
Não há evidência suficiente para atribuir ausência ao crash, à sessão ou à escrita
anterior; investigar separadamente, sem apagar/restaurar banco automaticamente.
Etapa ilha bloqueada por validação nativa; dock/release/pacote novos permanecem
pendentes. Windows não validado. Sem commit/push/PR/publicação.


### Prioridade confirmada: corrigir ilha; dados depois

Usuário informou que reiniciou computador ao entender a solicitação anterior de
reentrada GNOME. Limpeza de /tmp no reboot é hipótese possível para tarefas ausentes,
não confirmada; investigação de dados adiada por instrução explícita do usuário.
Nenhuma alteração/restauração/deleção de dados nesta rodada.

Candidata lifecycle teve revisão independente final: teste1/1 e diff check passaram,
sem novos achados confirmados. Extensão real permanece INACTIVE. Preparado script
linux/gnome/testar-isolado.sh; bash -n passou. Utiliza GNOME46 --nested --wayland
--no-x11 --sm-disable, D-Bus próprio (dbus-run-session), configuração keyfile e cópia
da extensão em XDG_DATA_HOME único para Shell. Não usa --replace nem GSettings da
sessão principal. Niko mantém dados exigidos em /tmp/niko-linux-desktop e workaround
gráfico temporário. Nested não é isolamento completo/VM; compartilha usuário/GPU,
conforme [GNOME debugging](https://gjs.guide/extensions/development/debugging.html).

Vite iniciado em sessão mantida, HTTP200 antes do laboratório. Laboratório observado
/tmp/niko-gnome-lab.MmZqNa; Shell nested PID21534, Niko PID21562. Logs iniciais sem
crash/erro de extensão; avisos de SessionManager ausente e permissões geolocation
presentes. Serviços portal/GVfs registraram mount FUSE negado no ambiente da ferramenta;
não instalar nem habilitar permissões para ocultar avisos. Solicitação visual: abrir,
recolher e reabrir pelo botão cinco vezes no nested. Nenhuma conclusão de estabilidade
antes desse teste. Sem Windows/dock/release/pacote novos validados.


Revisão readonly do script apontou P2: bus separado também separa single-instance;
reexecutar laboratório sem verificar processos poderia duplicar cliente/dados.
Corrigido com recusa se pgrep -x niko encontra processo ou porta47831 ocupada,
antes de criar laboratório. A execução já aberta teve essas verificações manuais.
Script não assume que single-instance protege clientes em barramentos diferentes.


Primeira execução nested: usuário informou Niko preto, desktop de teste visível.
Shell permaneceu vivo; Niko.log registrou WebLoaderStrategy internallyFailedLoadTimerFired.
Não houve crash signal11 da extensão observado nesta tentativa, mas interface não
carregada impede validar fechamento/reabertura. Apenas compositor nested encerrado
por SIGTERM; trap encerrou seu Niko. Reaberto laboratório com diagnóstico temporário
WEBKIT_DISABLE_COMPOSITING_MODE=1 (DMABUF desabilitado já existente). Sem incorporar
variável no produto. Validação visual solicitada novamente. Dados seguem fora do
escopo de investigação por solicitação do usuário. Guarda do script contra outro
Niko ativo testada: reexecução retornou exit1 antes de abrir processos.


### Backend herdado incorreto identificado no laboratório

Usuário confirmou renderização com composição desabilitada, primeira abertura,
mas segunda mostrou aviso para abrir Niko e travamento. Imagem mostra Desktop Icons
NG reclamando GTK em X11. Consulta explícita printenv GDK_BACKEND retornou **x11**
no ambiente das ferramentas: invocações anteriores que não sobrescreviam variável
herdaram backend X11 mesmo com sessão Ubuntu GNOME/Wayland. Não tratar evidências
anteriores como validação cliente nativo Wayland. Isso não prova configuração global
do usuário; pode ser ambiente herdado específico da ferramenta.

Script corrigido somente no laboratório: export GDK_BACKEND=wayland e
GNOME --mode=user (remove extensões obrigatórias do modo Ubuntu como DING), além de
--nested --wayland --no-x11. Sem mudar configurações da sessão real. Compositor nested
anterior encerrado; novo /tmp/niko-gnome-lab.bkZJtJ iniciado com workaround de composição
apenas diagnóstico. Consulta pelo D-Bus privado confirmou niko-ilha@local ACTIVE,
carregada da cópia deste laboratório. Logs iniciais não contêm DING ou erro WebKit.
Solicitada nova sequência visual. Erro D-Bus agora registrado com motivo real além
da mensagem ao usuário; não concluir que processo fechado sem consultar resposta.
Associação entre backend herdado e falha da segunda abertura ainda em validação.


### Abertura/reabertura confirmadas em Wayland nested

Usuário informou “Agora deu certo, está funcionando e consigo abrir e reabrir” no
laboratório bkZJtJ com GDK_BACKEND=wayland explícito e modo user. Isso confirma
renderização e ciclo de abertura/reabertura por clique nesse ambiente; não comprova
sessão principal, foco, Alt+Tab, posição fixa ou sincronia completa.
Shell/Niko continuaram ativos; extensão real segue Enabled No/INACTIVE. Logs ainda
contêm GTK gtk_widget_get_scale_factor assertion GTK_IS_WIDGET e Mutter
meta_window_set_stack_position_no_sync assertion stack_position>=0, sem novo
signal11 observado. Não ignorar críticos nem declarar estabilidade total.

Investigação adicional fonte Mutter46: sinal unmanaging é emitido no início da
retirada, antes da remoção do compositor; unmanaged é posterior. make_above e
unmake_above chamam raise. Alteração candidata futura para acompanhar unmanaging
pode reduzir operações durante retirada; não afirmar causa dos avisos sem teste.
Método/sinal unmanaging confirmado nos typelibs locais14. Fontes:
https://raw.githubusercontent.com/GNOME/mutter/46.0/src/core/window.c e stack.c.
Prioridade segue ilha; dados continuam adiados. Dock e release/pacote desta etapa
não avançados; Windows não validado.


### Ajustes autorizados de lifecycle/resposta

Usuário pediu aplicar ajustes e relatou lentidão. Extensão agora acompanha
**unmanaging** (antes da retirada do compositor, conforme fonte Mutter46 e sinal
local14), mantém guarda contra objeto removido e usa _positioning try/finally para
impedir reposicionamento recursivo em sinais nativos síncronos. Teste cobre
move_frame emitindo position-changed recursivamente. Ilha.tsx dimensiona somente
expandida, evitando resize de estado compacto que está oculto por regra Linux.
Windows não recebe essas condições. Sem novo serviço/dependência.

Testes locais2/2 e TypeScript passaram; revisor independente repetiu2/2 e diff check,
sem novos achados acionáveis. Extensão principal segue desabilitada; correção
carregada somente em novo laboratório KRps4Q (Shell27213, Niko27244). GTK Wayland
explícito, removida WEBKIT_DISABLE_COMPOSITING_MODE apenas nesta tentativa; mantida
WEBKIT_DISABLE_DMABUF_RENDERER=1 como diagnóstico. Solicitação visual aberta.

Amostra antes dos ajustes,10,04s com árvores completas: Niko124,9% de um núcleo,
RSS somado1167,5MiB/4 processos; nested0,4%/257,4MiB/5; Vite0%/435,1MiB/3.
Segunda amostra5s separou Niko1,2%, webviews61,8% e8,3%, rede0%. Não é %CPU
histórico do ps. Evidência indica custo concentrado nos webviews; não prova causa
nos avisos ou hardware. Arquivos /tmp/niko-ilha-antes.json e depois.json guardam
amostras de10s por árvore. RSS somado pode contar páginas compartilhadas.
Interação/estado de UI e renderer variaram entre amostras: não atribuir diferença
exclusivamente ao patch nem apresentar comparação como benchmark controlado.

Logs iniciais após ajuste não mostraram nova assertion stack_position, mas ainda
contêm GTK gtk_widget_get_scale_factor assertion GTK_IS_WIDGET. Não afirmar que
avisos GTK foram corrigidos, nem que ausência inicial prova estabilidade futura.
Dados continuam adiados por instrução; dock/release/pacote desta etapa pendentes.


Amostra posterior10,05s: Niko104,3% de um núcleo/RSS somado1058,9MiB;
nested1%/254,3MiB; Vite2,1%/440,7MiB. Consumo continua alto; não concluir
melhora de latência pela queda entre janelas de interação diferentes.
Ajuste adicional mínimo: AppIlha não monta componente visual Ilha quando recolhida
no Linux; useServicos e usarSincronia continuam no root AppIlha, mantendo serviços
únicos. Evita renderizar avatar/compacta oculta sem cortar rotinas locais.
Validação afetada e revisão solicitadas novamente.


### Custo dos SVGs decorativos e rosto leve existente

Usuário localizou lentidão em digitar/trocar abas, principal oculta não melhorou.
Retirada apenas a textura decorativa nativa Linux em Personagem.tsx: ela usava
caminhoPersonagem (SVG animado) como máscara além do personagem. Mantido desenho,
olhar e estados. Amostra10,02s após retirada: Niko60,1% de um núcleo/RSS1144,9MiB,
nested0%/255,1MiB, Vite0%/442,5MiB. Ainda consumo alto.

Ajuste adicional mínimo reutiliza carregarRosto/render inline já existentes:
quando Linux+estadoocioso+podeOlhar e mouse fora raio, olharVisual neutro(0,0)
mantém rosto leve em vez de voltar ao arquivo SVG animado. Não remove reações ou
expressões dos outros estados, nem muda Windows. Nova amostra10,05s observou
Niko0,3%/RSS1147,4MiB, nested0,2%/254,9MiB, Vite0%/442,7MiB. Evidência promissora
para custo de renderização; amostras variaram interação/visibilidade e não são prova
controlada de melhoria da latência. Responsividade ainda requer confirmação visual.
Logs/capturas de intervalos em /tmp/niko-ilha-sem-textura.json e rosto-leve.json.

TypeScript passou, testes extensão/serviços2/2, revisor sem achados em import LINUX
ou estado/renderização. Windows preservado por condição, mas não validado runtime.
Aviso stack_position reapareceu na candidata anterior. Descoberta/guardas da extensão
agora consultam **global.display.list_all_windows()** (registro de janelas) em vez de
get_window_actors (pode manter ator de saída após retirada). Teste deixa ator de
animação persistir enquanto registro vazio; não encontra nem move cliente retirado.
Método confirmado local14; revisor repetiu2/2 e diff check sem achados.

Laboratório anterior encerrado após medições; nova candidata carregada com GTK
Wayland explícito e sem WEBKIT_DISABLE_COMPOSITING_MODE. Extensão principal continua
desabilitada. Confirmar no novo laboratório abertura/reabertura, avisos e percepção
antes de qualquer habilitação real. Limite da otimização visual oculta: desmonta
quando estado recolhido; CloseRequested nativo somente hide pode conservar estado
expandido. Não afirmar que todo tipo de ocultação desmonta a UI. Release semVite,
pacote e dock continuam pendentes; dados continuam adiados pelo usuário.


### Melhora de responsividade confirmada pelo usuário

Após nova candidata no laboratório elCIUN, usuário informou **“Melhorou muito”**.
Confirma melhora percebida de resposta no fluxo que antes estava lento; não equivale
à validação completa de foco/sincronia/Alt+Tab, ausência de avisos ou estabilidade
na sessão principal. Extensão principal continua desabilitada. Próximo passo:
compilar release atual pelo CLI Tauri --no-bundle e testar sem Vite no laboratório,
respeitando ausência de instância anterior antes de executar. Não medir CPU durante
build concorrente. Dados permanecem adiados; dock não iniciado.


Build release atualizado iniciado em sessão mantida (log
/tmp/niko-ilha-release-atual.log), ainda não concluído/executado. Consulta posterior
logs do laboratório elCIUN ainda encontrou assertions stack_position no Mutter e
GTK_IS_WIDGET no Niko; nenhuma nova queda signal11 nessa consulta. Melhora de
responsividade não resolve essa pendência de estabilidade. Não habilitar a extensão
principal com base somente na melhora visual.


## Validação aprofundada dos críticos — em execução

Usuário pediu validação completa e ajuste dos avisos. Mantida extensão principal
INACTIVE. Build release atualizado passou em3m04s pelo CLI Tauri --no-bundle.
Recursos ponte.mjs de origem/target release têm SHA256 igual; executável ELFx86_64.

### Diagnóstico GTK por stack nativo

GDB já instalado; usado somente em cliente do laboratório. Breakpoint
 g_return_if_fail_warning, backtrace sem argumentos/locais (não expor dados),
debuginfod desabilitado. Dois avisos GTK capturados em niko-gdb.log no laboratório:
 gtk_widget_get_scale_factor -> gtk_status_icon_set_from_file ->
 libayatana-appindicator3 -> ciclo GTK/Tao. Portanto não atribuir esses dois avisos
à dimensionar_ilha. Laboratório modo user removia o host AppIndicator disponível no
Ubuntu real, e a biblioteca entrava em fallback GtkStatusIcon/X11.
Fonte GTK confirma GtkStatusIcon voltado ao protocolo X11/freedesktop:
https://gnome.pages.gitlab.gnome.org/gtk/gtk3/class.StatusIcon.html .

Script passou a carregar ubuntu-appindicators@ubuntu.com **já instalada**, apenas
no Shell nested, e esperar StatusNotifierWatcher antes do Niko. Revisor apontou
P2 timeout sem exigir sucesso; corrigido com teste NameHasOwner obrigatório antes
launch. Consulta no laboratório retorna true. Não foi instalada nova dependência
ou alterada habilitação de extensão da sessão principal.

Debugger interferiu no carregamento WebKit (internallyFailedLoadTimerFired, ilha
não encontrada); usuário confirmou aviso nessa tentativa. Não usar essa tentativa
como validação funcional, nem atribuir falha ao backend sem evidência. GDB cliente
e Shell anterior encerrados; processo inferior verificado ausente após kill do
supervisor. Tentativa debugger de Shell também perdeu WebKit, sem stack útil do
Mutter; sem declarar que chamadas críticas foram rastreadas nele.

### Ambiente corrigido e release real

Script permite NIKO_TEST_BINARY para escolher release e NIKO_SHELL_GDB somente para
diagnóstico, atualiza ambiente de ativação **no D-Bus privado** para display nested
Wayland/GDK_BACKEND=wayland, evitando serviços apontarem ao display herdado errado.
Modo user sem DING; AppIndicator habilitada intencionalmente nesse laboratório.
GNOME nested continua compartilhando usuário/GPU, não é sandbox completo.

Release iniciada em laboratório PcwGK9 com workaround gráfico temporário
WEBKIT_DISABLE_COMPOSITING_MODE=1 e WEBKIT_DISABLE_DMABUF_RENDERER=1; nenhum workaround incorporado produto.
NikoPID35466, NodePID35590 filho; porta47831 ativa,5420/5421 fechadas e nenhum Vite.
Ponte sem token e token incorreto retorna403 sem ler token ou conteúdo de dados.
Initial logs não contêm GTK_IS_WIDGET, stack_position ou signal11 nessa tentativa.
Solicitada renderização+duas reaberturas pela extensão. Cinco ativações diretas no
D-Bus do Niko (sem reposicionamento da extensão) iniciadas como experimento para
separar foco/show de manipulação da janela pelo Shell; não cobrem close/reopen.

| Critério | Evidência/estado |
| --- | --- |
| Tipo e causa GTK_IS_WIDGET | Stack nativo capturado, fallback de tray identificado |
| Host tray presente | D-Bus privado NameHasOwner true; appindicator instalada reutilizada |
| Release sem Vite | Processo/recurso/ponte/portas confirmados; visual aguardado nesta execução |
| Rejeição auth ponte | HTTP403 sem token e com token incorreto |
| CPU/responsividade debug | Intervalos registrados; usuário confirmou “Melhorou muito” |
| Erro Mutter stack_position | Persistiu em laboratório anterior; stack exata ainda pendente |
| Click/recolher/reabrir release | Solicitação visual pendente; não concluir ausência de crítico |
| Foco, posição fixa, Alt+Tab, sincronia | Critérios anteriores ainda não integralmente confirmados |
| Sessão principal | Extensão continua desabilitada |
| Windows | Não validado |
| Dock e novo .deb | Não avançados |

Revisor verificou fonte Mutter46: make_above e unmake_above chamam raise sempre.
Retirar estas duas chamadas é experimento mínimo possível se aviso persistir,
preservando posição e foco do clique, mas outro app poderá cobrir ilha ao ganhar
foco. Não implementado ainda nem confirmado como causa. Dados permanecem adiados
por instrução do usuário. Sem commit/push/PR/publicação.


Cinco ativações diretas do cliente release terminaram exit0; consulta posterior
logs sem GTK/Mutter críticos nesse experimento. Não incluem hide/reopen nem _anchor
da extensão. Revisão readonly final do runner/documento: bash -n e diff check
passaram, sem bloqueantes; duas precisões documentais corrigidas (variável renderer
por nome exato e resultado da sequência). Validação visual segue aguardada.


### Ciclos release confirmados; crítico Mutter reproduzido

Usuário confirmou que abriu/fechou várias vezes e “agora está top”. Inspeção após
sequência encontrou **3** assertions stack_position>=0 no Shell PcwGK9
(12:22:28,12:23:37,12:24:08 America/Bahia), sem GTKcritical/WebKiterror/signal11.
Processos Niko35466/Node35590 e Shell35173 continuavam ativos; Vite fechado.
Portanto funcionalidade/percepção passaram, mas crítico Mutter continuava pendente.

Experimento mínimo autorizado: retirar make_above/unmake_above e armazenamento
original.above da extensão. Essas chamadas elevam a janela mesmo com estado acima
já igual; native click já solicita foco. Mantidos posicionamento, reancoragem,
serviços e UI. Consequência apresentada ao usuário: outro app pode cobrir ilha ao
ganhar foco, embora ela permaneça fixa. Teste exige ausência de operações acima;
passou1/1, revisor repetiu1/1 sem achados e diff check passou. Não alterar Windows.

Laboratório anterior encerrado, cliente/ponte aguardados até processos/porta livre;
mesma release (sem rebuild/.deb) reaberta com **somente** extensão sem elevação
redundante e mesmos diagnósticos gráficos. Saída dos serviços auxiliares guardada
em /tmp/niko-lab-console-atual.log; logs Shell/Niko separados no laboratório.
Solicitados novos ciclos; comparar logs limpos desta execução após confirmação.
Não declarar causa/eliminação do crítico antes do resultado desse experimento.
Extensão principal continua desabilitada. README atualizado com requisitos reais
AppIndicator e limite do empilhamento. Dados/dock permanecem adiados.

### Resultado do experimento sem elevação redundante — 2026-10-06

Usuário confirmou novos ciclos de abrir/recolher/reabrir: “Continua rápida e
funciona”. A mesma release sem Vite foi usada no laboratório
`/tmp/niko-gnome-lab.hP38tB`, com os mesmos dois diagnósticos gráficos anteriores.
Consulta após a confirmação em `shell.log` e `niko.log` não encontrou os padrões
`critical|internal error|signal 11|assert|falha|TypeError`. Portanto os críticos
GTK/Mutter observados anteriormente não reapareceram nesta sequência. O teste
`node --test linux/gnome/extension.test.mjs` passou 1/1; `git diff --check` passou.

Isso valida a regressão observada nos ciclos deste laboratório, sem provar a
causa definitiva ou ausência de falhas futuras. Ainda há avisos de inicialização
do ambiente nested (portal, autenticação, barreira e serviços auxiliares); não
foram ocultados nem classificados como corrigidos. A consulta restrita não enxergou os processos do desktop. A verificação posterior
fora do namespace restrito confirmou Niko37884 e Shell37608 ainda ativos; não houve
evidência de término do laboratório. Não foi relançada instância.

Consulta real do desktop confirmou extensão da sessão principal Enabled No /
INACTIVE. A cópia instalada antiga não deve ser habilitada para este teste. A aprovação visual pertence à cópia corrigida do laboratório.
Validação na sessão principal, foco entre aplicativos, Alt+Tab e sincronia completa
continuam pendentes. Etapa da ilha segue em andamento; dock, dados e novo .deb não
foram avançados. Windows não validado; sem commit, push, PR ou publicação.

Revisão final independente somente leitura: sem achados acionáveis no delta;
confirmada ausência de make_above/unmake_above/raise na extensão, diff check limpo
e ausência dos padrões de erro nos dois logs. Revisor concordou com a conclusão
limitada ao laboratório e com as pendências acima; não editou código.

### Fechamento das pendências funcionais — 2026-10-06

Usuário confirmou “Tudo funcionando” para: criação na ilha visível na principal,
edição na principal refletida na ilha, abertura da principal pela ilha, interação
normal com outro aplicativo, resistência a arrastar e conferência Alt+Tab/Visão
Geral. A resposta agregada comprova que não relatou problema nessa sequência;
não especifica separadamente se o compositor mostrou a ilha no seletor.

Fechamento nativo antes apenas ocultava GTK e conservava estado expandido. Agora
CloseRequested Linux oculta e emite niko://ocultar-ilha; AppIlha recolhe o estado
com listener e cleanup existentes. Somente UI desmonta; serviços/sincronia seguem
no AppIlha. Revisão independente readonly sem achados; pede Alt+F4/reabertura real.
TypeScript passou; Rust 5/5; extensão+serviços 2/2. Ponte 2/2 (auth/SQLite após
reinício) passou fora do namespace restrito, em dados temporários próprios; a
primeira execução restrita terminou exit1 sem diagnóstico útil, não foi contada
como sucesso. bash -n e diff check passaram.

Cópia corrigida metadata.json/extension.js instalada no diretório local da extensão,
backup anterior em /tmp/niko-extensao-anterior.rtmt1p. Enabled No / INACTIVE confirmado.
GNOME deve recarregar sessão antes de habilitar; não foi habilitado módulo em cache.
Primeiro build .deb falhou com Text file busy no build-script Tauri enquanto runtime
da release estava ativo. Laboratório Shell37608 encerrado; Niko e porta47831
confirmados livres antes do segundo build em sessão mantida (log
/tmp/niko-ilha-fechamento-build.log). Nenhum dado do usuário apagado.

Build CLI release + .deb concluído em 3m04s; pacote
src-tauri/target/release/bundle/deb/Niko_0.2.0_amd64.deb (50,64MiB).
Inspeção dpkg-deb confirmou amd64, /usr/bin/niko, /usr/lib/Niko/recursos/node
executável e ponte.mjs; dependências GTK3/WebKit4.1/AppIndicator esperadas.
Instalação via sudo -n dpkg -i não ocorreu: sudo exige senha do administrador.
Solicitado ao usuário executar o comando localmente; não solicitado segredo.
Não confundir pacote gerado com pacote instalado.

Nova release corrigida aberta no laboratório /tmp/niko-gnome-lab.y8lqMm,
com WEBKIT_DISABLE_COMPOSITING_MODE=1 e WEBKIT_DISABLE_DMABUF_RENDERER=1 temporários,
GTK Wayland explícito, sem Vite. Solicitado Alt+F4/reabertura e resposta explícita
sobre presença no Alt+Tab. Testes na sessão principal exigem recarregar GNOME para
não ativar código antigo em cache; aguardam instalação e essa transição.

### Instalação local por autorização gráfica

A pedido do usuário, instalação executada localmente via
pkexec /usr/bin/dpkg -i src-tauri/target/release/bundle/deb/Niko_0.2.0_amd64.deb.
Autorização ocorreu no Ubuntu, sem senha acessada pela ferramenta. Exit0;
dpkg-query confirmou install ok installed. Hash de /usr/bin/niko coincide com
usr/bin/niko extraído do pacote: de8705a25783a75250dcfca9f5cc5ef30645cdcf3c4496a569d2d412a7bc1bbf.
Hash do binário no target difere do pacote; comparação válida feita com o payload
do .deb, sem inferir erro a partir dessa diferença. Ponte instalada coincide com
recurso fonte (c9f8d4ec9467a6adc594cabdd987103cd259b8f61bfd3a46253c7973b8378aa1).

Laboratório anterior encerrado e cliente/porta liberados. /usr/bin/niko iniciado
no laboratório /tmp/niko-gnome-lab.PaaiSt (Niko43340, Shell43059), com mesmos
diagnósticos gráficos temporários e dados preservados. /proc/exe confirmou
/usr/bin/niko. Solicitada observação visual sem comandos para Alt+F4/reabertura e
presença no seletor; pacote instalado não equivale a essa confirmação pendente.
Consulta posterior confirmou Node43486 filho de Niko43340 executando
/usr/lib/Niko/recursos/node ponte.mjs; porta47831 ativa. Logs iniciais Shell/Niko
sem padrões críticos anteriores. Confirmação visual e sessão principal pendentes.

Usuário pediu abandonar laboratório para o teste atual. Shell nested43059 encerrado,
cliente/porta liberados; /usr/bin/niko aberto diretamente na sessão GNOME principal,
com XDG_DATA_HOME=/tmp/niko-linux-desktop preservado, GDK_BACKEND=wayland e os dois
workarounds WebKit apenas no processo. Log /tmp/niko-sessao-principal.log; extensão
do painel permanece INACTIVE, não habilitado código em cache. Ilha acessível pelo
menu Mostrar ilha da bandeja; sem extensão, ancoragem fixa não está comprovada.
Usuário confirmou que está mostrado corretamente na sessão normal. Executável
instalado /usr/bin/niko (PID43828) e hash do payload conferidos; log inicial sem
erro registrado. Solicitado fechamento Alt+F4/reabertura e presença no seletor
nesta sessão; confirmação ainda pendente. Extensão de painel continua INACTIVE.

### Ilha ainda aparece no Alt+Tab — investigação e candidata

Usuário confirmou Alt+F4 fecha a janela, mas ilha aberta aparece no Alt+Tab na
sessão normal. Reabertura após Alt+F4 ainda não foi explicitamente confirmada.
Skip_taskbar solicitado ao GTK não satisfez o critério nesta sessão Wayland.
Typelib local Meta14: skip-taskbar somente leitura; hide_from_window_list/set_type
não expostos. Não usar APIs da documentação Mutter atual ausentes no GNOME46.

Fontes oficiais GNOME46 altTab.js getWindows filtra get_tab_list, AppSwitcher e
GroupCycler usam Shell.App.get_windows; workspace.js _isOverviewWindow usa skip_taskbar:
https://raw.githubusercontent.com/GNOME/gnome-shell/gnome-46/js/ui/altTab.js
https://raw.githubusercontent.com/GNOME/gnome-shell/gnome-46/js/ui/workspace.js

Candidata somente extensão: InjectionManager filtra Meta.Display.get_tab_list,
Shell.App.get_windows e Workspace._isOverviewWindow pelo mesmo matcher appID+título
exato usado para descobrir ilha; principal e outros apps preservados. Clear restaura
métodos ao desabilitar. Filtro Shell.App também afeta consumidores como dock GNOME,
apenas excluindo ilha (não modifica implementação do dock Niko). Sem manipulação
Meta.Window, tipo modal, empilhamento ou dependência nova. Transient parent poderia
alterar agrupamento/stack e vínculo à principal; não introduzido neste experimento.
Teste Node1/1 passou incluindo exclusão da ilha, preservação da principal/outro app
com mesmo título, resultado original Overview e restauração ao desabilitar;
diff check passou. Validação GNOME nativa pendente. Sem novo build/.deb necessário.
Revisão readonly independente do delta: sem achados acionáveis, confirmou
receptor/argumentos/cleanup; repetiu Node1/1 e diff check. Candidata copiada para
instalação local mantendo extensão INACTIVE; não habilitado módulo em cache.
Usuário deve salvar trabalho e sair/entrar GNOME para recarregar, sem reiniciar
computador. Teste principal e seletor vazio/Ubuntu Dock permanecem pendentes.

Usuário voltou após sair/entrar GNOME. Shell49327 novo confirmado; extensão instalada
hash igual fonte. Autostart abriu debug49509 --escondido, encerrado por SIGTERM antes
do teste; porta/instância verificadas livres. Extensão habilitada, consulta posterior
Enabled Yes / ACTIVE. /usr/bin/niko PID52059 aberto na sessão principal com dados
isolados preservados, Wayland e diagnósticos WebKit anteriores. Log específico
/tmp/niko-sessao-principal-filtro.log. Journal recente inclui GTKcritical da fase de
entrada/debug anterior; não atribuir ao novo processo sem distinguir PID/horário.
Teste visual filtros AltTab/Overview e reabertura ainda pendente. Autostart apontando
para debug é pendência real descoberta; não alterar silenciosamente outros dados.

### Alt+Tab passou; posição variável relatada na sessão principal

Usuário confirmou ilha não aparece mais no Alt+Tab; Alt+F4 fecha janela, conforme
atalho nativo esperado. Relatou posição variável, requisito centro superior fixo
não passou. Fluxo da extensão só ancorava pelo callback do botão do painel;
exibição via bandeja não garantia ancoragem. Não atribuir toda variação a esse
caminho antes do teste real.

Candidata mínima: sinal global.window_manager map identifica exclusivamente ilha
e usa _anchor existente em cada exibição; monitors-changed recalcula posição.
Disconnect de ambos em disable. Sem raise/above ou nova dependência. Teste1/1
passou: outro app ignorado, mapilha sem botão ancora, troca largura recentraliza,
cleanup. Fonte assinatura oficial GNOME46:
https://raw.githubusercontent.com/GNOME/gnome-shell/gnome-46/js/ui/windowManager.js
Validação nativa posição continua pendente; não encerrar etapa.
Revisor encontrou P2 guardas sessão/fullscreen ausentes nos novos caminhos. Corrigido
em _position central; map e monitors-changed durante fullscreen testados sem mover.
Node1/1 e diff check passaram novamente. Candidata copiada para instalação local;
código em memória da sessão atual permanece anterior até sair/entrar GNOME.
Revisão independente da correção P2: resolvido, teste1/1 repetido112ms e diff check
limpo, sem novos achados. Posição real ainda aguardando recarga e confirmação.

Após nova saída/entrada, Shell56581 novo confirmado; extensão ACTIVE/Enabled Yes,
hash instalada igual fonte06b00c2421aa83e595c69450970a0d87c838c027d370fe655e4380a5d6ca07a3.
Nenhum Niko/porta47831 concorrente. /usr/bin/niko reaberto na sessão principal,
com dados isolados preservados e mesmos diagnósticos gráficos temporários;
log /tmp/niko-sessao-principal-posicao.log. Solicitada posição topo centro nas
aberturas painel/bandeja e trocas de abas. Resultado visual ainda pendente.

### Posição aprovada e atalho global solicitado

Usuário confirmou “Ficou muito bom” após correção de posição na sessão principal.
Pediu atalho global e escolheu Ctrl+Alt+I. Consultados atalhos wm/mutter e lista
personalizada (vazia), sem conflito encontrado para essa combinação nessas fontes.
Registrado no mecanismo Ubuntu media-keys custom-keybindings, caminho
/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/niko-ilha/,
nome Mostrar ilha do Niko, binding <Control><Alt>i; lista existente preservada.
Comando gdbus ExecuteCallback ['niko','--mostrar-ilha'] com timeout2, mesma ativação
nativa já existente; não inicia nova instância nem muda dados. Sem novo schema,
dependência ou reload GNOME. Requer Niko aberto e extensão ativa para ancoragem.
Leitura pós-escrita confirmou binding; chamada direta e comando salvo interpretado
pelo GLib shell_parse_argv retornaram exit0 e (). Pressionar teclas em outro app
segue dependente de confirmação visual; configuração local não empacotada no .deb.
Revisão independente readonly do atalho/documentação sem achados; captura física
em outro aplicativo e persistência após sessão ainda não comprovadas. Autostart
apontando debug permanece pendência independente registrada. Nada publicado.

### Alterar o atalho dentro do aplicativo — implementação

Usuário confirmou Ctrl+Alt+I passou após re-registro e pediu edição nas configurações.
Adicionado campo Linux em Configurações → Ilha: lê binding atual do Ubuntu, permite
selecionar Ctrl+Alt/Ctrl+Shift/Super+Alt/Super+Shift e letra/número, salva explicitamente
e mostra erro/status. Não grava ao montar nem guarda cópia concorrente no SQLite.
Requer entrada personalizada niko-ilha já registrada; em máquina sem essa preparação
mostra indisponibilidade, sem fingir criação/sucesso. Combinações reservadas por outros
serviços podem não ativar: confirmação de leitura não equivale a captura física.

Backend atalho_ilha_linux somente Linux/janela sistema; valida combinação na fronteira,
executa /usr/bin/gsettings por argumentos (sem shell), apenas binding do caminho fixo,
preserva comando/lista/outros atalhos; processos fora da thread UI via spawn_blocking.
Clear/re-registro reutiliza correção observada do media-keys. Qualquer erro de set ou
confirmação após clear restaura valor anterior; falha de rollback informada.
Revisão encontrou P2 confirmação sem rollback, corrigido antes do build.
Rust8/8 incluindo escrita/leitura/mismatch/restauração e validação; TypeScript passou.
UI/native runtime ainda requer observação. Sem alteração Windows e sem validação dele.

Niko instalado59399 encerrado SIGTERM, processos/porta liberados antes do build
CLI release/deb em sessão mantida; log /tmp/niko-config-atalho-build.log. Não apagar
dados nem duplicar serviços; extensão de posição/AltTab não modificada nesta mudança.
Revisor independente confirmou P2 resolvido, repetiu testes módulo3/3 sem acessar
preferências reais, diff check passou e sem novos achados. Validação UI pendente.
Build release/deb terminou2m46s, pacote50,64MiB. Instalação pkexec iniciada com
autorização gráfica, ainda aguardando; não contar como instalada até exit0.
Solicitada autorização no Ubuntu sem pedir senha pela conversa. Extensão não precisa
reload para este editor; lançamento atual ficará na sessão normal após instalação.
Instalação pkexec terminou exit0 após autorização gráfica. /usr/bin/niko aberto
na sessão normal com dados/diagnósticos anteriores preservados; log
/tmp/niko-config-atalho-runtime.log. Teste UI leitura/alteração e captura física
aguarda confirmação do usuário. Nenhum commit/push/PR/publicação.

### Pergunta sobre persistência ao desligar computador

Usuário aprovou visualmente editor do atalho e perguntou sobre salvar dados.
Revisão atual: armazenamento agenda POST em350ms e reenvia falhas; sair via comando
emite niko://saindo, espera700ms; não há confirmação transacional do frontend antes
do exit. Ponte SQLite usa transações, WAL/synchronousNORMAL e fecha banco ao SIGTERM.
Teste anterior comprova dados já gravados sobrevivendo SIGKILL da ponte, não shutdown
com edição pendente nem perda abrupta de energia. Não prometer zero perda nesse caso.

Instância de validação segue XDG_DATA_HOME=/tmp/niko-linux-desktop conforme instrução
original: diretório temporário não é destino para dados definitivos e pode ser limpo
em reinício. Consulta read-only integrity_check e contagem, sem valores/credenciais;
nenhuma migração/deleção feita. Destino padrão Linux sem override é
~/.local/share/com.niko.desktop/niko.db. Antes de mudar, preservar cópia consistente
do SQLite e conferir eventual banco existente; não sobrescrever dados padrão.


## Continuação: dados permanentes e inicialização — 06/10/2026

### Escopo e preservação

O estado inicial tinha 14 arquivos rastreados modificados e vários arquivos novos,
incluindo este documento. Essas mudanças anteriores foram preservadas. Nesta rodada
foram alterados armazenamento.ts, Configuracoes.tsx e o fechamento em lib.rs, além
do documento e exceções específicas no .gitignore para preservar os três arquivos
novos; adicionados script de migração e testes isolados. Não houve commit,
push, PR, release publicada, extensão alterada, dependência nova, logout ou reinício.

A visibilidade de processos do sandbox é limitada: ps dentro dele não mostrou a
instância real. A consulta autorizada no host encontrou /usr/bin/niko PID64196,
ponte PID64208 e porta47831, usando XDG_DATA_HOME=/tmp/niko-linux-desktop e ambas
variáveis WebKit. Consultas posteriores devem usar o host antes de lançar outra
instância; ausência em ps restrito não comprova ausência no desktop.

### Migração executada

`python3 scripts/migrar-dados-linux.py /tmp/niko-linux-desktop/com.niko.desktop/niko.db ~/.local/share/com.niko.desktop/niko.db`

- SQLite backup API obtém snapshot consistente, inclusive com WAL ativo.
- Destino SQLite e sidecars existentes são recusados. Arquivos WebKit que já
  existiam no destino não foram substituídos nem mesclados.
- Backup exclusivo: `~/.local/share/com.niko.desktop/migracao-linux-4sbyfjqs/niko.db`.
  É independente do banco publicado; permissões diretório0700/bancos0600.
- Origem preservada. integrity_check=ok e seis registros em origem/destino/backup;
  comparação completa sem imprimir valores confirmou igualdade. Nova comparação
  online no host, enquanto a instância antiga seguia aberta, confirmou igualdade.
- A pasta original e seus arquivos auxiliares permanecem em /tmp. Apenas o banco
  foi migrado; cache e perfil WebKit não foram transportados. Nenhum arquivo de
  provedores/tokens foi aberto. A comparação de dados não foi impressa.
- Reversão deve ocorrer com o Niko encerrado, preservando primeiro qualquer banco
  atualizado do destino. Não copiar um banco ativo ou sobrescrever o destino.
  A origem e o backup permitem retorno, mas não incluem edições feitas depois
  do snapshot. Se divergirem, exigir decisão antes de substituir/mesclar.

### Salvamento e saída

A fila agora serializa POSTs e aguarda envios já em voo, drenando novas edições;
falha repõe itens sem sobrescrever edição mais recente. salvarAgora retorna boolean
confirmado. Backup/restauração não avançam quando esse salvamento falha; zerarTudo
aguarda envios anteriores e recupera a trava no erro da requisição.

Sair pela bandeja/comando aguarda confirmação de todas as webviews da tentativa.
Resposta200 da ponte ocorre depois do COMMIT SQLite. Falha ou timeout10s cancela
saída e mantém o aplicativo aberto com aviso. IDs rejeitam confirmações antigas;
janela participante pode revogar ACK se surgir nova escrita, inclusive depois de
ter confirmado. Durante a tentativa, body.inert bloqueia interação; escritas dos
serviços continuam preservadas e cancelam essa tentativa. Listeners de saída são
registrados uma vez, inclusive nas novas tentativas de conexão do bootstrap.
Fechar uma janela continua escondendo-a; não é o comando Sair.

Isso cobre saída normal do aplicativo. Não comprova desligamento da sessão,
SIGTERM/SIGKILL do desktop, travamento ou perda abrupta de energia. SQLite permanece
WAL/synchronous=NORMAL. Não prometer perda zero nesses casos.

### Autostart e renderização

Foi alterada somente a linha Exec do autostart existente para
`/usr/bin/niko --escondido`. Backup:
`~/.config/autostart/niko-autostart-backup-1hwtb2ic/Niko.desktop`.
Preferência ligada e outras linhas preservadas. Plugin antigo considera enabled
pela presença do arquivo e não corrigia Exec apontando ao debug.

GNOME real confirmou XDG_SESSION_TYPE=wayland. Ferramenta herda GDK_BACKEND=x11;
não confundir com sessão real. Histórico não isola quais variáveis WebKit são
necessárias. Nenhuma delas incorporada ao produto sem confirmação. Não foram
alteradas configurações gráficas globais nem aberta sessão nested.

### Verificações automáticas

- `pnpm verificar`: passou.
- `node scripts/armazenamento.test.mjs` com Node22: 1/1 passou; fila serial,
  aguarda voo, falha/recuperação, listeners únicos, saída/cancelamento e revogação
  por edição durante flush e depois de ACK; zerar aguarda envio e recupera a
  trava após falha HTTP/rede. Mocks sem preferências/dados reais.
- `python3 scripts/migrar-dados-linux.test.py`: passou; WAL ativo, integridade,
  backup independente, recusa de destino/sidecars e arquivos existentes preservados.
- `node servidor/ponte.test.mjs` com Node22 no host: 2/2 passaram; autenticação,
  encaminhamento e SQLite após SIGKILL/reinício, em porta efêmera e diretório isolado.
  No sandbox o bind deu EPERM; execução autorizada no host resolveu essa limitação.
- `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --lib`: 9/9
  passaram novamente depois da correção final. Teste adicional cobre todas as
  janelas, tentativa antiga, rótulo inválido e revogação pósACK.
- Revisão independente encontrou envio concorrente, espera fixa, listeners
  duplicados, descarte de escrita e revogação ignorada pelo Rust. Correções feitas;
  revisor confirmou correções, inclusive cancelamento atômico sob mutex; nenhum
  novo bloqueante no delta. Testes não comprovam interface nativa.

### Rodada manual necessária — aguardando confirmação visual

1. **Abertura e dados permanentes:** com a instância antiga encerrada pelo menu
   da bandeja → Sair e a revisão nova instalada, abrir Niko no menu de aplicativos
   do Ubuntu. Esperado: principal renderiza e tarefas antigas aparecem. Falha:
   janela preta/vazia, erro de conexão ou tarefas ausentes. Não exige logout.
2. **Edição recente e saída:** editar uma tarefa, confirmar a edição e imediatamente
   escolher Sair na bandeja; abrir de novo pelo menu Ubuntu. Esperado: saída normal
   e edição preservada. Falha: perda da edição; se aparecer aviso de salvamento,
   o aplicativo deve permanecer aberto e permitir tentar novamente. Não exige logout.
3. **Autostart:** na próxima entrada normal no GNOME, sem logout solicitado agora,
   verificar Niko em segundo plano e abrir pela bandeja. Esperado: instalação real,
   tarefas preservadas e principal renderizada. Falha: debug, duplicação, dados
   ausentes ou tela preta. Exige apenas a próxima sessão normal, após salvar o trabalho.

Não repetir posição/AltTab/atalho já confirmados: nenhuma mudança na extensão nesta
rodada. Editor de atalho, dock e demais integrações continuam para etapas seguintes.


### Pacote final preparado; troca de instância pendente

Build final `pnpm tauri build --config src-tauri/tauri.linux.conf.json --bundles deb`
terminou exit0; compilação release3m46s, pacote50,65MiB. Um build anterior foi
superado pelas correções da revisão e não deve ser usado como evidência final.
Log final: `/tmp/niko-dados-permanentes-build-final.log`.

Pacote: `src-tauri/target/release/bundle/deb/Niko_0.2.0_amd64.deb`,
Package=niko, Version=0.2.0, Architecture=amd64.
SHA256: `d6e0a8792282d7feeacdf4d5796632c0ccdac64e1073685ac6e0e5e9d28e9cee`.
Payload extraído em `/tmp/niko-dados-pacote-07kn1new` confirmou:
`/usr/bin/niko` e `/usr/lib/Niko/recursos/node` executáveis0755,
`/usr/lib/Niko/recursos/ponte.mjs`0644. Ponte igual ao recurso fonte.
SHA256 do executável do payload:
`8b0778dcb40a540429e738fe6a4e6be4b3063133b3a976fb343f027bb80e687c`.
Binário instalado ainda anterior:
`26180294cf44fa04ee74f52be467c11d6718ce5728592d4f5f62962581bdd9c6`.

A instância instalada anterior PID64196/ponte64208 permaneceu ativa, porta47831,
usando dados temporários e diagnósticos WebKit. Foi solicitado ao usuário Sair pela
bandeja; nenhum SIGTERM/SIGKILL imposto ao desktop para forçar a troca. Não lançar
outra instância: single-instance reativaria a antiga e invalidaria o teste.
Instalação nova NÃO executada nesta rodada. Antes dela, confirmar fechamento e porta
livre no host, e comparar novamente origem/destino: uma edição posterior ao snapshot
na instância antiga exige decisão, sem mesclar/substituir silenciosamente. Executar
pkexec dpkg somente então; a autorização ocorre na janela Ubuntu, sem senha no chat.
Depois conferir hash instalado contra payload, abrir launcher padrão com XDG_DATA_HOME
e APPDATA removidos e sem flags WebKit herdadas; se a visualização falhar, diagnosticar
uma variável por vez sem incorporar solução não comprovada ao produto.

Etapa de dados ainda NÃO concluída: faltam execução instalada no destino permanente
e teste nativo de edição recente/saída. Inicialização também pendente: arquivo de
autostart corrigido não comprova execução após login e renderização pelo menu.
Portabilidade Linux integral, Windows e outras distribuições não foram validados.


### Botão do painel permanece após Sair — causa e correção

Usuário saiu do Niko e relatou botão da ilha ainda no painel. Consulta real no host
confirmou nenhum processo Niko/ponte e porta47831 livre. Portanto não era aplicativo
preso: a extensão mantinha o botão visível desde enable até disable, sem observar
o serviço da instância. Nova consulta pós-saída confirmou origem e destino do banco
íntegros e iguais; nenhum dado substituído após a migração.

Correção mínima somente na extensão: Gio.bus_watch_name no barramento de sessão,
nome com.niko.desktop.SingleInstance, BusNameWatcherFlags.NONE (sem auto-start).
Container do botão oculto após addToStatusArea, visível quando nome aparece, oculto
quando some; perder nome cancela timer de ativação. Ocultar janela da ilha não muda
a posse do nome e mantém botão. Disable retira watcher; identidade do botão protege
callbacks de ativações antigas. Nenhuma nova chamada Meta.Window/empilhamento,
nenhum polling, subprocesso, dependência ou nova extensão.

Fonte GNOME46 mostra que addToStatusArea força container.show, por isso ocultação é
aplicada ao container depois da inserção, evitando também espaço vazio no painel:
https://raw.githubusercontent.com/GNOME/gnome-shell/gnome-46/js/ui/panel.js
https://raw.githubusercontent.com/GNOME/gnome-shell/gnome-46/js/ui/panelMenu.js
API Gio disponível desde2.26:
https://docs.gtk.org/gio/func.bus_watch_name.html

- `node linux/gnome/extension.test.mjs` Node22:1/1 passou, cobrindo ausência inicial,
  saída/reabertura, ilha ocultada sem sumir botão, cancelamento de timers, cleanup,
  callbacks antigos e container separado que panel mostra durante inserção.
- `node servidor/ilha-linux.test.mjs`:1/1 passou. Vite tentou portaHMR24678 e recebeu
  EPERM no sandbox; assertions passaram, sem daemon ou GUI real. Não é prova gráfica.
- Revisor independente sem novos bloqueantes; git diff --check passou.

Copiada fonte corrigida para a extensão instalada; SHA256:
c5f99eafacb92998eb868c35fd45ec1be7cef528728af9c86d0c19321b7dd2b1.
Backup: ~/.local/share/gnome-shell/extensions/niko-ilha-backup-d8nt9fbx/extension.js.
Extensão permanece ACTIVE no código anterior da sessão. Não foi usado disable/enable
para tentar carregar módulo novo, nem logout/reinício automático. A atualização não
altera o .deb já preparado; extensão continua opcional e separada do pacote.
Instalação do .deb final via pkexec iniciada; aguardando resultado/autorização gráfica.

Adicionar à rodada manual, **após próxima entrada no GNOME com código novo**:
abrir Niko pelo menu Ubuntu → botão deve aparecer; clicar botão → ilha abre;
fechar só a ilha → botão permanece; escolher Sair na bandeja → botão desaparece;
reabrir pelo menu → botão reaparece e abre ilha de novo. Falha: botão órfão, espaço
vazio, perda do botão enquanto app ainda está aberto ou callback abrindo após saída.
Exige fechar Niko nos passos indicados e uma nova sessão para carregar a extensão;
requer salvar o trabalho antes, sem reiniciar computador. Este teste segue aguardando
confirmação visual; não declarar ciclo nativo aprovado apenas por teste Node.


### Instalação e preparação após saída confirmada pelo usuário

Pkexec/dpkg terminou exit0; dpkg-query confirmou install ok installed0.2.0.
/usr/bin/niko coincide com payload final pelo SHA256
8b0778dcb40a540429e738fe6a4e6be4b3063133b3a976fb343f027bb80e687c.
Nenhuma instância/porta concorrente antes de lançar. A autorização foi gráfica,
sem senha acessada. Smoke real GJS/Gio em barramento privado também passou:
`env GIO_USE_VFS=local dbus-run-session -- gjs /tmp/niko-gio-watcher-smoke.js`
mostrou APPEARED/VANISHED/OK exit0. Sem Shell/Niko reais; não comprova painel.

`gtk-launch Niko` com overrides removidos retornou0, mas consulta posterior não
mostrou Niko/ponte; log vazio e journal específico Niko sem entradas. Isso NÃO
comprova abertura pelo menu. Para deixar versão correta aberta, lançamento direto
/usr/bin/niko em sessão da ferramenta mantida (3147), log
/tmp/niko-dados-permanentes-runtime.log. Host confirmou Niko76255, ponte76272 filha,
porta47831 e exe/usr/bin/niko. Nenhum XDG_DATA_HOME/APPDATA/GDK_BACKEND/variável
WebKit diagnóstica no processo. Banco permanente integrity_check=ok, seis registros;
nenhum padrão de erro gráfico no log inicial. Processo vivo não prova renderização.

Extensão desta sessão continua carregando versão anterior em cache. Nova fonte está
instalada no disco e aguardando próxima entrada no GNOME. Não desabilitar/habilitar
para alegar recarga; não alterar empilhamento nem encerrar sessão automaticamente.

**Rodada manual consolidada que substitui listas anteriores:**

1. Dados/saída normal: na versão aberta, conferir tarefas antigas, editar e confirmar
   uma tarefa; escolher Sair pela bandeja logo depois e abrir pelo menu Ubuntu.
   Esperado: renderiza e conserva edição. Falha: desaparece edição/tarefas, janela
   preta ou aplicativo fecha mesmo avisando falha de salvamento. Exige fechar somente
   o Niko; sem logout. Se menu não abrir, relatar (launcher não foi comprovado).
2. Botão/ilha: na próxima entrada normal GNOME, após salvar trabalho e carregar a
   extensão nova, abrir Niko se não estiver em segundo plano. Botão aparece; clicar
   abre ilha, fechar só ilha mantém botão, Sair bandeja remove botão e reabrir pelo
   menu devolve botão funcional. Falha: botão órfão/espaço vazio, sumiço ao ocultar
   somente ilha ou falha de reabertura. Exige uma nova sessão para carregar extensão,
   sem reiniciar computador; não repetir AltTab/posição já aprovados sem regressão.
3. Autostart: nessa mesma nova sessão, verificar início em segundo plano e abrir pela
   bandeja. Esperado: instalação correta/dados permanentes/renderização; falha:
   ausência inesperada, debug, duplicação, dados ausentes ou preto. Pode ser realizado
   junto ao teste2; nenhuma segunda recarga de sessão necessária.

Sem confirmação visual desses critérios, dados/inicialização/ciclo do botão continuam
em validação. Variáveis WebKit ainda não consolidadas e suporte Windows não validado.


### Reset imediato autorizado para configurar do zero

Usuário confirmou “Agora, para configurar do zero”. Encerrados somente Niko76255 e
ponte76272 previamente identificados, usando SIGTERM; processos/porta livres antes
do reset. Essa ação de manutenção não valida o protocolo normal de saída pela UI.
SQLite backup API gerou cópia consistente independente antes da exclusão:
`~/.local/share/com.niko.desktop/reset-autorizado-evdas5rh/niko.db`.
Backup íntegro e seis registros conferidos sem imprimir valores; diretório0700,
banco0600. DELETE FROM dados em transação, VACUUM e checkpoint executados no banco
permanente; contagem0 e integrity_check=ok. Schema/meta preservados. Não foram
apagados arquivos de credenciais/provedores, atalhos, extensão, origem temporária
ou backups anteriores. Pasta storage possui somente salt, sem arquivos de dados
locais a reimportar; conteúdo desse arquivo não foi lido.

Versão final permanece instalada com hash conferido anteriormente; Niko foi deixado
fechado para configuração do zero. Ao abrir, valores padrão/onboarding podem gerar
novos registros; isso não significa retorno dos seis registros antigos. Confirmação
visual da primeira configuração e renderização permanece pendente.

Na rodada manual anterior, substituir “conferir tarefas antigas/editar tarefa” por
“abrir Niko, completar configuração inicial, criar uma tarefa nova, Sair pela bandeja
e reabrir pelo menu; tarefa nova deve persistir”. Dados antigos foram removidos por
escolha explícita do usuário e não devem ser restaurados automaticamente. Testes da
extensão e autostart após nova sessão permanecem pendentes, sem logout automático.


## Mídia Linux — primeira etapa de leitura MPRIS

### Pedido e escopo

Usuário autorizou implementar mídia genérica para navegadores/aplicativos com música
ou vídeo e pediu primeiro remover botão órfão ativo, sem Niko aberto. Consulta host
confirmou Niko/ponte ausentes e porta livre. `gnome-extensions disable niko-ilha@local`
executado; info confirmou EnabledNo/INACTIVE. Isso remove botão da sessão atual e
mantém a extensão desabilitada nas próximas sessões até reativação deliberada. Não
foi habilitado código em cache nem encerrado GNOME. A fonte corrigida do ciclo do
botão continua no disco; só reativar após nova sessão carregar essa fonte.

Mídia usa padrão MPRIS no D-Bus da sessão, sem whitelist de Brave/Spotify/Firefox etc.
Inclui música e vídeo que o player expuser. Aplicativos que não oferecem MPRIS não
são identificados por este método; um navegador determina qual sessão/aba publica.
Não há captura de áudio, detecção por processo ou leitura de credenciais.

Primeira etapa: somente título, artistas, estado de reprodução, duração, posição e
capa remota segura. Prioridade reproduzindo > pausado > parado, com nomes ordenados
como desempate; não há seletor de múltiplos players ainda. Capa file:// é omitida;
HTTP(S) sem credenciais, aspas, barras invertidas ou espaços é fornecida à interface,
que pode carregar imagem diretamente. Ponte não baixa imagens nem lê caminhos do
player. Falta player => sessão vazia; falha de runtime/bus => indisponibilidade real.
Um player com erro não mascara outro válido; somente falhas não inventam ausência.

Play/pause/próxima/anterior/seek continuam indisponíveis nesta etapa Linux, bloqueados
no backend, estado e botões (inclui painel rápido). Não fingem sucesso. UI já existente
reaproveitada; texto de falha não afirma que Windows é necessário no Linux. Backend
PowerShell do Windows preservado e podeAlternar ausente em sua resposta mantém
compatibilidade. Windows não foi executado nem validado.

### Implementação e runtime

servidor/midiaLinux.ts executa /usr/bin/gjs com script Gio embutido via execFile sem
shell; JSON evita parser de texto GVariant. GJS1.80.2 já instalado neste GNOME46;
nenhuma instalação de dependência nova. Necessidade demonstrada: Node não tem binding
D-Bus nativo; Gio já fornece propriedades tipadas e descoberta. Gjs declarado como
dependência explícita do .deb Linux, pois agora é necessário à mídia.
Timeout por chamada1s, global4s e stdout máximo1MB. NO_AUTO_START não abre players.
Processo por consulta é simplificação deliberada; revisar para observador persistente
se medições exigirem. Muitos players lentos podem exceder4s antes de ler todos e
mostrar indisponibilidade; não prometer seleção universal nessas condições.

servidor/midia.ts encaminha apenas leitura Linux. src/servicos/servicos.ts consulta
mídia visível a cada2,5s, reutilizando deduplicação existente do estado. Ao ocultar ilha,
essa consulta para e volta na reabertura; serviços locais anteriores preservados.
Controles alterados em estado/midia.ts, Visoes.tsx e PainelRapido.tsx. Scripts de teste
específicos preservados por exceções no .gitignore; nenhum commit/push/PR/release.

Fonte padrão: https://specifications.freedesktop.org/mpris/latest/

### Evidências automáticas

- pnpm verificar: passou.
- scripts/midia.test.mjs Node22:5/5 passaram; consulta concorrente/stale, falha sem
  sucesso inventado e nenhuma ação enviada com controles indisponíveis.
- servidor/ilha-linux.test.mjs Node22:1/1 passou; leitura de mídia permitida no Linux,
  timers visível/oculto/cleanup e preservação dos serviços/tarefas existentes.
- servidor/midia-linux.test.mjs: teste real GJS + D-Bus privado1/1 passou; players
  Firefox/Spotify/VLC simulados, prioridadePlaying/Paused/Stopped, artistas, conversão
  microsegundos/segundos, capa local recusada/HTTPS aceito/URL espaço recusada,
  desaparecimento e distinção entre falha de um player e de todos. Sem mudar mídia real.
- Consulta read-only no MPRIS real:5 consultas com latências93/83/76/72/73ms,
  sessãoPlaying e presença título/artista/duração confirmadas sem imprimir conteúdo.
  Nenhuma ação de reprodução executada; isso não comprova interface nativa nem CPU
  total/consumo persistente. Não atribuir lentidão ou eficiência sem medição adicional.
- Revisão independente identificou preferênciaPaused ausente; corrigida e retestada.
  Revisão final sem novos bloqueantes no delta; pacote em preparação.

### Testes manuais desta etapa

Depois de instalar pacote: abrir Niko, bandeja → Mostrar ilha → aba Música.
Reproduzir música/vídeo em navegador ou player que ofereça MPRIS; esperar até3s.
Esperado: título/artista e progresso quando disponibilizados pelo player. Pausar no
player: ilha mostra pausa; fechar player: faixa some ou seleciona outro disponível.
Controles na ilha permanecem desativados nesta etapa. Falha: faixa incorreta,
permanência após fechar ou UI inventando reprodução. Repetir com um segundo app
MPRIS se disponível; não instalar apps/extensões só para isso. Sem logout para mídia.

Extensão está desabilitada a pedido. Botão Niko de painel não será acesso nesta sessão;
usar Mostrar ilha da bandeja. Posição ancorada/filtros AltTab dependem da extensão e
não são critérios de mídia sem ela. Reativação da extensão corrigida só após nova
sessão GNOME; teste do ciclo do botão permanece pendente e separado da mídia.


Ponte reconstruída com mídia Linux: servidor/ponte.test.mjs2/2 passaram novamente
no host com porta efêmera e banco isolado (auth e persistência apósSIGKILL/reinício).
A revisão final confirmou correçãoPlaying/Paused/Stopped e ausência de novos
bloqueantes; foi estática, não execução da interface. Nenhuma música real foi
pausada/avançada/alterada pelos testes.


### Pacote da leitura MPRIS

Build release/deb final exit0; compilação3m34s, pacote50,65MiB.
Log /tmp/niko-midia-linux-build.log. Payload extraído:
/tmp/niko-midia-payload-vilpw0jl. Architectureamd64; Depends contém gjs e mantém
libayatana-appindicator3-1/libwebkit2gtk-4.1-0/libgtk-3-0.
SHA256 payload /usr/bin/niko:
f6477c0a5a0686231aadfce40f9cefc32c7d8a499471f7fcef36d4a812984e1e.
SHA256 ponte:
d6ccdc3b3cd23acfeddeb96c785f6c84363bde1db8f8def7d0cd20391946a294.
Ponte do pacote coincide com recurso gerado. Nenhuma instância/porta47831 ativa
antes de iniciar instalação pkexec, que aguarda resultado/autorização gráfica.
Fonte da extensão não foi modificada nem reativada nesta etapa; continuaINACTIVE.


### Instalação liberada e versão de mídia aberta

Usuário confirmou autorização gráfica. Pkexec/dpkg exit0 e dpkg-query install ok
installed0.2.0. SHA256 /usr/bin/niko e ponte instalada coincidem com o payload de
mídia listado acima. Extensão segue EnabledNo/INACTIVE, sem botão órfão reativado.

Nenhum Niko/ponte/porta47831 ativo antes do lançamento. /usr/bin/niko aberto em
sessão mantida da ferramenta28769; host confirmou Niko86094, ponte86106 filha e
porta47831. Banco permanente integrity_check=ok. Processo sem XDG_DATA_HOME,
APPDATA, GDK_BACKEND ou variáveis WebKit diagnósticas. Log
/tmp/niko-midia-linux-runtime.log sem padrões iniciais de erro gráfico.

Isso confirma instalação e execução, não renderização ou funcionamento visual da
aba Música. Teste pendente: bandeja → Mostrar ilha → Música, reproduzir mídia num
player MPRIS e conferir título/estado/progresso; pausar/fechar no próprio player e
conferir atualização até3s. Nenhuma recarga GNOME necessária para esse teste de mídia.
Controles Linux na ilha permanecem desativados nesta etapa. Acesso pelo botão da
extensão permanece indisponível até nova sessão e reativação deliberada da correção.


### Regressão observada sem extensão: posição e Alt+Tab

Usuário testou a ilha na versão de mídia e relatou posição incorreta e ilha como
mais uma aba/janela. Causa operacional confirmada: extensão foi desabilitada para
retirar o botão órfão e, com ela, ficaram indisponíveis ancoragem e filtros de janela.
Não é evidência de falha MPRIS nem mudança no código de posicionamento.

Consulta atual: extensãoINACTIVE/EnabledNo, GNOME Shell56581 (mesmo PID da sessão
com código anterior em cache), Niko86094 ativo. Fonte e extensão instalada coincidem
SHA256c5f99eafacb92998eb868c35fd45ec1be7cef528728af9c86d0c19321b7dd2b1,
incluindo watcher que oculta botão quando Niko sai. Shell Eval retornafalse/vazio;
não habilitado modo unsafe nem modificada memória do Shell.

Recuperação preparada: após uma única saída/entrada GNOME pelo usuário, confirmar
novo PID e reativar niko-ilha@local com o código corrigido. Não reativar módulo antigo
na sessão56581, não trocar UUID/criar outra extensão, não fazer logout automaticamente.
Depois validar em uma rodada: topo central, exclusão AltTab, sair/reabrir Niko para
ciclo do botão e leitura de música. Mídia visual ainda não comprovada pelo relato.


### Recuperação após nova sessão confirmada

Usuário voltou após sair/entrar. Consulta host confirmou Shell89713 novo (anterior
56581), Niko/porta ausentes e fonte instalada hashc5f99eaf...igual ao repositório.
Extensão habilitada nesta sessão nova: EnabledYes/ACTIVE. /usr/bin/niko SHA256
f6477c0a...corresponde ao pacote MPRIS; aberto sem overrides temporários, Niko93543,
ponte93555 e porta47831 ativos. ExecuteCallback--mostrar-ilha retornou() para abrir
ilha. Posição/AltTab/ciclo do botão/música ainda aguardam observação visual.

Journal tinha TypeError this.actor is null do Shell anterior56581, não atribuído
à extensão reativada no novo Shell. Havia aviso no login porque backup da extensão
estava como subpasta sem metadata.json dentro de extensions. Backup preservado e
movido para ~/.local/share/com.niko.desktop/backups-extensao/niko-ilha-backup-d8nt9fbx,
fora do diretório varrido pelo GNOME. Nenhum backup excluído, nenhuma nova recarga
GNOME solicitada para essa organização. Log Niko /tmp/niko-midia-sessao-nova.log.

### Correção da aba Música bloqueada no Linux

Usuário confirmou que o clique bloqueado era na aba Música, não nos controles de
reprodução. Causa: `ABAS_LOCAIS` ainda excluía `midia` após implementar a leitura
MPRIS. Incluída na lista compartilhada pelo filtro de navegação e `disabled` das
abas. Controles continuam somente leitura nesta etapa. TypeScript passou e teste
`servidor/ilha-linux.test.mjs` passou com regressão garantindo mídia na lista.
Validação visual e instalação do pacote atualizado ainda pendentes.

Pacote da correção compilado (release 3m01s), dpkg terminou com status0.
Niko reaberto PID96081, ExecuteCallback--mostrar-ilha retornou(), extensão ACTIVE.
Binário instalado SHA256 fb9723083ec7e9f2df743b03fc8c0721b288de4cb1f8e40bb0b46c200dc8ed87.
A confirmação visual de clique na aba fica com o usuário; automação nativa não disponível.

## Continuação — controles MPRIS (06/10/2026)

Fluxo existente reutilizado: estado → ponte HTTP autenticada → `midiaLinux.ts` → Gio.
Descoberta genérica, prioridade Playing > Paused > Stopped e desempate por nome.
Sem whitelist de navegador ou distinção artificial entre música/vídeo.
CanControl e capacidades específicas governam Play/Pause, Next, Previous e SetPosition.
Busca absoluta usa trackid, segundos convertidos em microsegundos e limite da duração.
Sem trackid válido não há busca; mídia sem essa capacidade continua com outros controles.
Cada clique leva nome, dono D-Bus único e trackid exibidos: player substituído/encerrado
ou faixa trocada não recebe comando stale. Front não sobrepõe ações; falha desativa
controles até nova consulta. Slider informa indisponibilidade à acessibilidade.

Teste real em D-Bus privado, sem ações na mídia pessoal: Play/Pause, Next/Previous,
SetPosition e conversão/limite, números inválidos, capacidades parciais/read-only,
múltiplos players, encerramento/reuso do nome, faixa stale, ausência e falhas.
Primeira execução em sandbox não criou socket (Operation not permitted); repetição
fora do sandbox passou. Isso é teste de protocolo, não validação visual do aplicativo.
Pacote e confirmação manual desta revisão ainda pendentes.

Referência: https://specifications.freedesktop.org/mpris/latest/Player_Interface.html

Repetição final MPRIS: passou com teste explícito de ausência de trackid (pausa
continua funcional), Next/Previous individualmente indisponíveis e demais cenários.
Uma execução intermediária teve timeout Gio de 1s durante compilação concorrente;
nova execução passou. Não atribuir causa ao player real: o teste usa serviço simulado.
`pnpm verificar` passou; testes do estado de mídia (incluindo alvo e ações concorrentes)
e regressão da ilha passaram. Build release ainda em andamento neste registro.

Pacote de controles: release/deb exit 0, compilação Rust 3m49s, 50,65 MiB.
Após ajuste final da seleção por destino, ponte reconstruída e `tauri bundle`
reexecutado; payload extraído coincide com ponte e Node gerados; Node executável.
Depends: gjs, libayatana-appindicator3-1, libwebkit2gtk-4.1-0, libgtk-3-0.
SHA256 pacote: d61e5e183edc3cde31b5bc5ee6071491f81125e527bd1391e069c0074018e5ee.
SHA256 binário: f400603a59cd9fbf315e4ab286246a33500f53963edd527aea2e993b6edbcd86.
SHA256 ponte: ac352b59751568ec7d02673e76ae8646aa555190a8f13708363637875dce39ef.
`servidor/ponte.test.mjs`: 2/2 passaram com banco isolado, autenticação e reinício.
Instalação pkexec/dpkg iniciada; confirmação do resultado e teste visual pendentes.
Logs: /tmp/niko-mpris-controles-build.log e /tmp/niko-mpris-controles-bundle.log.

Instalação `pkexec dpkg -i`: exit 0. Hashes de /usr/bin/niko, ponte e Node
instalados coincidem com o payload acima, distinguindo este build dos demais 0.2.0.
Niko aberto pelo executável instalado, log /tmp/niko-mpris-controles-runtime.log.
Nenhum reset/migração/restauração do banco executado nesta continuação.
Rodada manual solicitada: pausar/retomar, buscar progresso, anterior/próxima quando
suportados e fechar player (sumir/selecionar outro). Resultado visual pendente.
As etapas de auditoria restante, inventário completo de instalações e finalização
aguardam essa rodada, respeitando a ordem solicitada. PR retido até liberação.

## Retorno manual — controles aprovados; capa e foco (06/10/2026)

Usuário confirmou “Deu certo” na rodada dos controles e pediu capa, além de relatar
ilha atrás do aplicativo ativo ao abri-la sobre o Brave. Não assumir que cada player
ou controle foi individualmente observado: aprovação pertence à rodada relatada.

Consulta real apenas de metadados técnicos da capa: Brave anuncia arquivo temporário
PNG de 25.223 bytes. O código anterior descartava file://. Ponte agora converte
PNG/JPEG/GIF/WebP temporários do próprio usuário em data: (máximo 2MB), verifica
assinatura, arquivo regular/proprietário, rejeita symlinks e caminhos fora de tmpdir
ou XDG_RUNTIME_DIR. Não lê arquivos de provedores/credenciais nem baixa capas remotas.
Capas locais fora dessas pastas ainda são omitidas; HTTPS já permanece funcional.
Consulta real read-only retornou capaInline=true, data:image/png, 33.654 caracteres;
isso comprova transporte, não renderização visual. Teste MPRIS privado passou com
imagem completa e casos negativos (texto, SVG, ausente, grande, symlink e host externo).
TypeScript e 2/2 testes da ponte reconstruída também passaram.

Extensão agora solicita Main.activateWindow 250ms após map/ativação, uma vez por
abertura: evita elevar dentro do sinal map e não usa make_above/unmake_above/raise.
Confere janela ainda gerenciada, ator mapeado, sessão desbloqueada e monitor sem
fullscreen; traz ilha ao workspace atual. Ocultar/sair/desabilitar cancela callback.
Teste Node passou com ativação diferida, workspace, janela oculta, unmanaging,
fullscreen e preservação dos filtros de Alt+Tab/ciclo do botão.

Teste nativo GNOME46 nested com duas janelas GTK3 fictícias: 5 ciclos mostram
focus_window=Ilha do Niko, ilha mapeada/focada e janela anterior sem foco.
Sem stack_position, Gtk-CRITICAL, signal11, JS ERROR ou TypeError nos logs da rodada.
Laboratório /tmp/niko-foco-lab.jERZtf; runner /tmp/niko-testar-foco-isolado.sh e
/tmp/niko-foco-cliente.js; saída /tmp/niko-foco-native-test.log. Não confundir com
execução do Niko/Brave real. Tentativas iniciais falharam no fixture GTK/Visão Geral
ou asserção do runner; não contam como validação. Ambiente nested tem avisos próprios
de serviços/barreira; não declarar ausência geral de todos os avisos.
Barramento final sem autoativação de serviços; configurações/XDG em diretório de teste.
Unsafe mode somente no Shell de laboratório para consulta de foco, nunca no principal.

Pacote recomposto com binário/frontend anteriores e nova ponte, exit0; payload/Node
conferidos. SHA256 pacote 4c99831323224128821af3284c255bdc02b38d53a117f960298e387c598e0629;
ponte 03a210c3306775fd52a7be78409dfdf28f726c84cddfc91ffa16f38dd47a95c4.
Instalação e cópia da extensão com backup em preparação; teste visual da capa e foco
na sessão principal pendente. GNOME46 mantém módulo da extensão em cache: nova sessão
pelo usuário necessária para carregar fonte nova; não executar logout/restart automático.

Instalação da capa: dpkg exit0; hashes de binário/ponte/Node instalados coincidem
com payload da revisão. Extensão anterior preservada em
~/.local/share/com.niko.desktop/backups-extensao/niko-foco-backup-qi74wt01.
Fonte nova instalada igual à fonte do repositório, SHA256
b61cbae91e0696155793a68d76c4731a55cee107e3ce7bde238971edb1f0fc80.
Extensão continua ACTIVE com módulo anterior em cache; não executados disable/enable,
logout ou restart. Niko em execução anterior preservado: reiniciar somente o app
permite testar capa; uma nova sessão GNOME pelo usuário carrega a correção de foco.

## Atalho mostra “ilha pronta” sem trazer à frente — 06/10/2026

Após nova sessão, usuário confirmou sucesso da rodada anterior, mas relatou:
comando/atalho mostra notificação “está pronta”, botão Niko funciona normalmente.
Binding lido: Ctrl+Alt+I; comando chama ExecuteCallback --mostrar-ilha diretamente.
Fonte instalada b61cbae... confere; Shell108297/Niko108472 na sessão consultada.
A revisão anterior ativava em map e após clique do painel: ilha já mapeada pode
solicitar foco sem novo map, caindo na notificação de atenção do GNOME.

Adicionados listeners window-demands-attention e window-marked-urgent apenas para
a identidade exata da ilha, reutilizando _anchor/_activateLater. Demais aplicativos
não são ativados. Desabilitar remove sinais e callbacks pendentes. Não mudar binding,
comando, banco, pacote da capa ou Windows.

Teste Node passou incluindo atenção da ilha já mapeada e recusa de outro aplicativo.
GNOME46 nested/D-Bus privado: cinco ciclos de map e atenção native set_demands_attention
com outra janela previamente ativada; foco retornou à ilha em todos. Sem padrões
stack_position/Gtk-CRITICAL/signal11/JS ERROR/TypeError na rodada final.
Laboratório /tmp/niko-foco-lab.eREC6g; saída /tmp/niko-atalho-native-test.log.
É teste de compositor com janelas fictícias, não teste do atalho instalado real.

Consulta da sessão principal encontrou uma assertion stack_position às16:45:56 no
Shell108297, antes de instalar este delta. Não descartar nem atribuir causa sem
rastreamento; ausência no laboratório não prova estabilidade na sessão principal.
Nova validação do atalho e dos avisos continua pendente após carregamento da fonte nova.

Fonte corrigida copiada para extensão existente, hash b2f5a3b14fefe4023daab92f3e8a281eb1abeaf419ba00881448a42c07024f29.
Backup anterior: ~/.local/share/com.niko.desktop/backups-extensao/niko-atalho-backup-ibkixu3_.
Nenhum reload/logout, encerramento do Niko, alteração do atalho ou novo pacote executado.

## Instalação da revisão multiagente — 06/10/2026

Usuário autorizou o .deb e a reabertura apenas do Niko. Dpkg exit0, estado instalado, hashes de binário/ponte/Node iguais ao payload; Niko144231 e ponte144243 ativos na porta47831. Revisão independente confirmou os hashes. Confirmação visual de janela/ilha solicitada e pendente. Nenhum reset, reload da extensão ou teste de controles/cofre pessoal executado. Registro completo em linux/evidencias/VALIDACAO.md.

Confirmação manual desta instalação: usuário relatou “Janela e cinco ciclos da ilha funcionaram”. Registrar como aprovação desta rodada visual, sem estender ao cofre/mídia/persistência/Windows e sem eliminar a falha canônica GTK/Mutter do laboratório.

## Fluxo GNOME integrado ao pacote — 06/10/2026

Extensão versão2 distribuída pelo .deb e ação explícita em Configurações → Ilha, com diagnóstico, backup e aviso de nova sessão quando código estiver em cache. Sem logout automático, sem reinício para ajustes comuns. Principal integrou; testes_linux cobriu contratos privados/permissões/rollback/concorrência; testes_gnome passou API GNOME46 real em nested privado; revisor final sem novos bloqueadores. Suíte final101/99pass/0fail/2Windows skip, types/build locked offline/bundle/checker passaram. Snapshot e matriz em linux/evidencias/VALIDACAO.md, seção instalação/ativação assistida. Instalação e confirmação manual do novo fluxo ainda em andamento; falha GTK canônica e Windows/CI remotos continuam separados e pendentes.

Fechamento da rodada GNOME assistida: .deb final instalado/reaberto com autorização persistente; binário/ponte/Node/metadata/extension.js instalados iguais byte a byte ao payload. Usuário confirmou “Não pediu nada por que o meu já está configurado, tudo está funcionando corretamente”. Confirmação vale para sessão previamente configurada; primeira instalação segue comprovada no nested, não na sessão pessoal. Matrizes/evidências atualizadas. Sem logout, commit, push ou início dos outros recursos. Windows runtime/CI remoto e falha canônica GTK continuam pendentes e separados.

## Dock e janelas — 07/10/2026

Inventário atual e resultados desta etapa em
`linux/evidencias/dock-gnome46/RESULTADO.md`. Implementação local de dock fixo experimental
Tauri/WebKit e adapter GNOME46 para listagem/foco/minimização/fechamento, reutilizando
frontend, endpoints e integração existentes. Não amplia ambientes nem substitui Windows.
Primeira execução nativa detectou roubo de foco; correção em validação. Miniaturas,
modos/reserva, sistema, OCR, Gmail e consumo continuam pendentes.

Descrição pronta para revisão em `linux/PROPOSTA_PR_LINUX.md`, sem abrir PR. Usuário
confirmou destinar a contribuição ao titular; autorização escrita do titular ainda
não comprovada. Nenhuma alteração de licença/publicação/push/instalação pessoal.

## 2026-10-07 — atualização local do legado para disponibilizar o dock

Fallback restrito à extensão local já existente quando o carregador runtime é desconhecido. Reutiliza backup e marcador de cache do instalador anterior; diagnóstico também em Configurações → Dock. TypeScript, contrato Gio privado e regressões GNOME nested runtime/clean passaram. Migração gráfica e pacote novo ainda pendentes. Evidência: `linux/evidencias/migracao-dock-local/RESULTADO.md`.


## 07/10/2026 — controles, OCR, OAuth, consumo e custo do dock

Implementação local do escopo inicial restante: APIs nativas GNOME/UPower/NetworkManager/
BlueZ/logind/SNI/PipeWire, painel reutilizado em Configurações → Sistema, OCR Tesseract por/eng,
abertura gio no OAuth existente e leitura/alertas de consumo opt-in. Cliente GJS de janelas
persistente, com timeout/encerramento ocioso, substitui spawn por consulta. Windows preservado.
Evidências atuais e pendências: `linux/evidencias/pendencias-gnome46/RESULTADO.md`.
114 testes passaram na suíte; OCR e áudio nativos privados passaram separadamente.
Testes com serviços fictícios não comprovam hardware ou autenticação pessoal.
Pacote local final preparado; instalação pessoal e testes conjuntos adiados. OCR requer dependências
nativas ainda não instaladas; nenhuma mudança global/sessão/dados pessoais nesta etapa.
Portabilidade completa e estabilidade não declaradas. Sem publicação: autorização escrita do titular pendente.
