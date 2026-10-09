# Plano de suporte ao macOS

Data da análise: 8 de outubro de 2026.

## Objetivo

Adaptar o Niko para funcionar no macOS, mantendo o suporte ao Windows e compartilhando a interface, as regras de negócio e as integrações HTTP entre as duas plataformas.

Este documento registra a análise do checkout atual e o roadmap de implementação. Nenhuma adaptação de código foi realizada durante a análise. As tecnologias propostas para macOS devem ser validadas nas versões do sistema escolhidas para suporte.

## Diagnóstico

A interface React e os módulos de rotina, estudos, finanças, metas, calendário e chat são amplamente reaproveitáveis. A maior parte do trabalho está nas integrações nativas: janelas, ilha, dock, mídia, controles rápidos, credenciais, arquivos e distribuição.

É necessário distinguir dois resultados:

- **Funcionamento do aplicativo:** abrir o sistema principal, persistir dados, usar IA e conexões, trabalhar com arquivos e receber notificações.
- **Equivalência das integrações:** oferecer ilha, dock, prévias de janelas, mídia e controles do sistema com comportamento adequado ao macOS.

Compilar no Mac não comprova que todas as integrações funcionam. Recursos sem equivalente validado devem ser declarados como indisponíveis ou encaminhar o usuário aos Ajustes do Sistema.

### Evidências no projeto

| Área | Arquivos principais | Situação atual |
|---|---|---|
| Dependências frontend | `package.json`, `pnpm-lock.yaml` | Binding Windows do Rolldown declarado diretamente |
| Runtime Rust | `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs` | Dependência Windows geral e chamadas Win32 no código compartilhado |
| Janelas e dock | `windows_taskbar.rs`, `foreground_window.rs`, `thumbnails.rs`, `docks.rs` | Uso de HWND, AppBar e miniaturas DWM |
| Aplicativos abertos | `server/windows.ts` | Enumeração e ações sobre janelas via PowerShell e Win32 |
| Ponte de produção | `scripts/build-bridge.mjs`, `server/production.ts`, `src/desktop/desktop.ts` | Node empacotado como `node.exe`; frontend depende do hostname `tauri.localhost` |
| Dados e credenciais | `server/ai.ts`, `server/database.ts`, `server/secrets.ts` | Caminhos APPDATA e Gerenciador de Credenciais do Windows |
| Sistema e controles | `server/system.ts`, `server/quickControls.ts`, `server/powerShellProcess.ts` | PowerShell, WinRT, Registro e DLLs Windows |
| Mídia e OCR | `server/media.ts`, `server/ocr.ts` | Windows.Media.Control e Windows.Media.Ocr |
| Arquivos e navegador | `server/files.ts`, `server/gmail.ts`, `server/claude.ts` | Explorer, rundll32, Registro e caminhos de executáveis Windows |
| Ferramentas de código | `server/codingAgents.ts`, `server/claude.ts`, `server/usage.ts` | Hooks com `curl.exe`, PATH separado por `;` e leitura de credenciais em arquivos |
| Interface e preferências | `src/bridge/localBridge.ts`, `src/state/settings.ts`, `src/i18n/ptBR.ts`, `src/windows/` | Referências Windows e atalhos Ctrl; recursos habilitados principalmente por `NATIVO` |
| Distribuição | `src-tauri/tauri.conf.json`, `scripts/release.mjs`, `scripts/release-version.mjs` | Bundle NSIS e manifesto apenas `windows-x86_64` |
| Verificação | `package.json`, `scripts/`, `testes/` | Comando de testes referencia arquivos ausentes; não há workflow de CI neste checkout |

## Direção de arquitetura

Manter frontend, regras de negócio, banco e integrações HTTP compartilhados. Separar as operações dependentes do sistema em adaptadores Windows e macOS.

- Rust: módulos condicionais por plataforma, com `#[cfg(target_os = "...")]` e dependências específicas por target.
- Node: contratos comuns e seleção do adaptador por `process.platform`, evitando iniciar PowerShell no macOS.
- macOS: preferir uma camada nativa Rust; utilizar auxiliares Swift somente quando necessário.
- Frontend: consumir capacidades e estados de permissão, além de identificar a plataforma.
- Recursos não implementados: retornar indisponibilidade explícita, sem sucesso aparente ou falha silenciosa.

Os contratos devem cobrir janelas, inatividade, links, credenciais, mídia, OCR, arquivos, controles rápidos e permissões. Evitar duplicar regras de negócio nos adaptadores.

## Roadmap

Prioridades: **P0** bloqueia o funcionamento básico; **P1** compõe a experiência desktop; **P2** depende de viabilidade ou amplia a equivalência. A prioridade descreve o impacto, não uma estimativa de esforço.

### Fase 0 — Preparar a base e definir suporte

**Prioridade:** P0. **Dependências:** nenhuma.

- [ ] Definir a versão mínima de macOS, após avaliar requisitos das APIs e dependências.
- [ ] Definir suporte a Apple Silicon e Intel e estratégia de distribuição por arquitetura.
- [ ] Definir o canal de distribuição; este roadmap parte de distribuição direta com `.app` e `.dmg`.
- [ ] Restaurar os testes ausentes ou corrigir o comando `pnpm test` para representar a suíte disponível.
- [ ] Registrar uma linha de base Windows: compilação e fluxos principais.
- [ ] Configurar Node compatível com `node:sqlite`, pnpm, Rust e ferramentas de desenvolvimento Apple para a implementação.
- [ ] Criar uma matriz de funcionalidades por plataforma e estados: suportado, pendente, condicionado a permissão e indisponível.

**Critério de conclusão:** ambiente de desenvolvimento reproduzível, suíte executável e escopo de suporte explícito.

### Fase 1 — Separar plataformas e liberar compilação

**Prioridade:** P0. **Dependências:** fase 0.

- [ ] Mover a dependência `windows` para uma seção condicional no `Cargo.toml`.
- [ ] Isolar `windows_taskbar`, `foreground_window`, `thumbnails` e chamadas Win32 de `lib.rs`.
- [ ] Criar interfaces comuns e implementações Windows/macOS.
- [ ] Substituir BCrypt na geração de token por uma solução criptograficamente segura e multiplataforma.
- [ ] Separar foco de janela, inatividade e abertura de links por plataforma.
- [ ] Selecionar adaptadores Node sem iniciar processos PowerShell no Mac.
- [ ] Remover a dependência direta do binding Windows do Rolldown e atualizar o lockfile pelo gerenciador de pacotes.
- [ ] Expor capacidades iniciais ao frontend, permitindo executar o núcleo sem integrações ainda pendentes.

**Critério de conclusão:** compilação Rust e build frontend passam em Windows e macOS; a ausência de uma integração não impede a inicialização.

### Fase 2 — Empacotar Node e corrigir a ponte local

**Prioridade:** P0. **Dependências:** fase 1.

- [ ] Gerar `node.exe` no Windows e `node` no macOS em `construir-ponte.mjs`.
- [ ] Fixar e validar versão, arquitetura e origem do runtime empacotado.
- [ ] Garantir permissão de execução do Node no macOS.
- [ ] Adaptar localização e execução dos recursos em `lib.rs`.
- [ ] Ajustar `.gitignore` para os recursos gerados nas duas plataformas.
- [ ] Corrigir `prepararPonte()` para não depender exclusivamente de `tauri.localhost`.
- [ ] Obter porta e token pelo Tauri também no Mac, distinguindo desenvolvimento e produção.
- [ ] Revisar CORS, validação de origem e CSP em `producao.ts`, `ponte.ts`, `vite.config.ts` e configurações Tauri.
- [ ] Preservar autenticação por token e escuta somente em loopback.
- [ ] Validar HTTP, streaming de chat e eventos no WKWebView.
- [ ] Validar inicialização, reinício após queda e encerramento da ponte, incluindo fechamento do banco.

**Observação:** a lista CORS de produção já inclui `tauri://localhost`; o problema de inicialização no frontend permanece.

**Critério de conclusão:** um build de produção comunica-se com a ponte e funciona sem Node instalado no computador do usuário.

### Fase 3 — Dados persistentes e credenciais seguras

**Prioridade:** P0. **Dependências:** fase 2.

- [ ] Usar o diretório de dados resolvido pelo Tauri e repassá-lo à ponte Node.
- [ ] Definir o caminho equivalente para desenvolvimento.
- [ ] Centralizar banco, backups, provedores, anexos, configurações de hooks e logs.
- [ ] Preservar os caminhos existentes das instalações Windows.
- [ ] Implementar leitura, gravação e exclusão de segredos no Keychain.
- [ ] Preservar identificadores das credenciais, cache e coordenação de leituras em andamento.
- [ ] Distinguir credencial inexistente, Keychain bloqueado e acesso recusado.
- [ ] Validar gravação atômica dos arquivos de configuração e permissões de arquivos sensíveis no macOS.
- [ ] Validar backups e restauração entre sistemas, sem exportar segredos; pedir reconexão dos serviços quando necessário.

**Critério de conclusão:** dados sobrevivem a reinícios e atualizações; IA e conexões usam credenciais seguras no Mac.

### Fase 4 — Sistema principal, arquivos e experiência macOS

**Prioridade:** P0/P1. **Dependências:** fase 3.

- [ ] Adaptar abertura de links e navegador, incluindo o fluxo Gmail que utiliza `rundll32.exe`.
- [ ] Implementar abertura de arquivos e revelação no Finder em lugar do Explorer.
- [ ] Resolver Downloads sem consultar o Registro Windows no macOS.
- [ ] Revisar caminhos com espaços, Unicode, diferenças de maiúsculas e separadores.
- [ ] Validar tamanho, redimensionamento, fechamento, ocultação e reabertura da janela principal.
- [ ] Definir menu do aplicativo, comportamento do ícone no Dock e ícone na barra de menus.
- [ ] Adaptar atalhos locais para Command onde apropriado e atualizar tooltips e textos.
- [ ] Revisar atalhos globais e tratar falhas de registro e conflitos com o sistema.
- [ ] Generalizar `iniciarComWindows`, migrando preferências persistidas sem perda.
- [ ] Validar autostart e notificações; o código já usa o plugin com `MacosLauncher::LaunchAgent`.
- [ ] Substituir textos Windows, APPDATA, executáveis, Iniciar e bandeja conforme a plataforma.
- [ ] Validar chat, edição, anexos, impressão, sons, animações e escritório 3D no WKWebView.

**Critério de conclusão — marco A:** sistema principal utilizável no Mac com persistência, IA, conexões, arquivos e notificações.

### Fase 5 — Permissões, ilha e geometria das janelas

**Prioridade:** P1. **Dependências:** fase 4.

- [ ] Criar estado de permissões separado da disponibilidade de recursos.
- [ ] Oferecer solicitação contextual e orientação para Accessibility, gravação de tela, notificações e outras permissões efetivamente necessárias.
- [ ] Manter organização e demais funções básicas operacionais quando o usuário recusar permissões.
- [ ] Validar transparência, sombras, foco e clique através das áreas vazias.
- [ ] Revisar `macOSPrivateApi` e a feature Tauri correspondente para transparência, considerando distribuição e implicações de API privada.
- [ ] Implementar detecção de aplicativo/janela ativa, cobertura e tela cheia sem HWND.
- [ ] Implementar tempo de inatividade com API macOS apropriada.
- [ ] Respeitar a thread principal nas operações AppKit.
- [ ] Posicionar a ilha respeitando barra de menus, notch e área útil.
- [ ] Validar Retina, escalas diferentes, coordenadas e conexão/desconexão de monitores.
- [ ] Definir comportamento em Spaces, Mission Control, Stage Manager e tela cheia.

**Critério de conclusão:** ilha interativa e bem posicionada, sem roubar foco ou bloquear cliques fora de sua área.

### Fase 6 — Dock, aplicativos e prévias

**Prioridade:** P1. **Dependências:** fase 5.

- [ ] Enumerar aplicativos e janelas macOS, com bundle ID para identidade de aplicativo e ID separado para cada janela.
- [ ] Obter ícones, títulos, estados e monitor quando disponíveis.
- [ ] Implementar ativação, minimização e fechamento com APIs apropriadas, incluindo Accessibility.
- [ ] Adaptar agrupamento do frontend, preservando regras Windows apenas no adaptador correspondente.
- [ ] Implementar prévias com ScreenCaptureKit, substituindo DWM.
- [ ] Definir captura e renderização compatíveis com o frontend e escala Retina.
- [ ] Capturar somente prévias visíveis e liberar recursos ao fechar o painel.
- [ ] Manter ícones e ações disponíveis quando gravação de tela estiver recusada.
- [ ] Ajustar posicionamento e geometria do dock por monitor.
- [ ] Fazer o dock Niko coexistir com o Dock macOS inicialmente.
- [ ] Tratar substituição/ocultação do Dock nativo como investigação separada, sem transportar AppBar nem modificar preferências do usuário automaticamente.

**Critério de conclusão — marco B:** ilha e dock funcionam com comportamento definido e fallback para permissões ausentes.

### Fase 7 — Integrações complementares e provas de viabilidade

**Prioridade:** P1/P2. **Dependências:** contratos da fase 1; integração final após o marco A.

| Funcionalidade | Implementação ou investigação proposta | Condição de entrega |
|---|---|---|
| Bateria e alimentação | APIs de energia, como IOKit | Estado confiável e ausência de bateria tratada |
| Wi-Fi e rede | CoreWLAN e APIs de rede; validar permissões por versão | Leitura/operações suportadas ou encaminhamento aos Ajustes |
| Bluetooth | Validar APIs e enumeração disponível | Não confundir pareamento com conexão; gerenciamento nos Ajustes quando necessário |
| Volume e mudo | CoreAudio | Controle do dispositivo de áudio suportado |
| Volume por aplicativo | Prova de viabilidade independente | Só habilitar após comprovar uma solução sustentável |
| Brilho | Validar telas internas e externas separadamente | Habilitar apenas em hardware suportado |
| Tema | Separar detecção do tema e alteração global | Não anunciar alteração global sem implementação validada |
| Captura de tela | Ferramenta ou API macOS | Fluxo funcional com permissões adequadas |
| Teclado virtual/papel de parede | Ação equivalente ou abertura dos Ajustes | Comportamento descrito na interface |
| Iniciar e bandeja Windows | Redesenhar para macOS | Não pressupor acesso equivalente a elementos de outros apps |
| Energia | Implementar bloqueio, suspensão, reinício e desligamento individualmente | Validar autorizações e resultados reais |
| Mídia | Investigar estratégia suportada e integrações específicas com players | Definir cobertura de players, controles e metadados |
| OCR | Apple Vision | Preservar contrato, idiomas, limites, timeout e limpeza de temporários |

- [ ] Executar uma prova de viabilidade antes de implementar mídia global, volume por aplicativo e substituição do Dock.
- [ ] Registrar a decisão de cada prova: suportar, limitar cobertura, encaminhar ao sistema ou deixar indisponível.
- [ ] Preservar as regras de mídia pausada e consultas fora de ordem.
- [ ] Evitar depender de APIs privadas adicionais sem uma decisão explícita e avaliação de manutenção.
- [ ] Atualizar capacidades e interface para cada recurso entregue.

**Critério de conclusão:** nenhum controle habilitado retorna sucesso sem realizar a operação; limitações aparecem de forma clara.

### Fase 8 — Ferramentas de código e consumo

**Prioridade:** P1. **Dependências:** fases 2 a 4. Pode avançar independentemente do dock.

- [ ] Adaptar hooks que hoje geram comandos `curl.exe` para o shell e sistema de destino.
- [ ] Preservar escaping, envio por stdin, autenticação, limites e timeouts dos hooks.
- [ ] Validar instalação, remoção e backups dos hooks sem sobrescrever configuração alheia ao Niko.
- [ ] Reutilizar e validar os hooks HTTP existentes da integração Claude.
- [ ] Corrigir descoberta de programas para usar o separador de PATH adequado.
- [ ] Adaptar descoberta e abertura do VS Code no macOS, sem exigir que o comando `code` esteja no PATH.
- [ ] Abrir projetos no Finder e manter validação de projetos conhecidos.
- [ ] Rever leitura de credenciais Claude: no macOS elas normalmente ficam no Keychain, com fallback para arquivo em determinadas situações.
- [ ] Validar diretórios e métodos de autenticação suportados pelas outras ferramentas, sem assumir que arquivos sempre existirão.
- [ ] Testar decisões pendentes, eventos em streaming, sessões e notificações no Mac.

**Critério de conclusão:** ferramentas suportadas enviam eventos, abrem projetos e exibem consumo quando a autenticação correspondente estiver disponível.

### Fase 9 — Distribuição, assinatura e atualização

**Prioridade:** P0 para distribuição. **Dependências:** marco A; recursos adicionais entram conforme sua validação.

- [ ] Separar configurações Tauri comuns, Windows e macOS.
- [ ] Manter NSIS no Windows e gerar `.app`/`.dmg` no macOS.
- [ ] Incluir `icons/icon.icns`, já existente no projeto, na configuração macOS.
- [ ] Definir resources e localizar Node/ponte corretamente dentro do bundle.
- [ ] Gerar builds por arquitetura ou validar bundle universal, incluindo o runtime Node e eventuais auxiliares.
- [ ] Configurar assinatura Apple, notarização e assinatura dos executáveis auxiliares.
- [ ] Validar hardened runtime e entitlements efetivamente necessários ao Node e às integrações entregues.
- [ ] Adaptar validação de artefatos em `versao-release.mjs` para plataforma, arquitetura e diretório de target.
- [ ] Adaptar `lancar-versao.mjs` para reunir artefatos de plataformas diferentes.
- [ ] Manter sincronização de versões, validação de tags e prevenção de artefatos antigos.
- [ ] Gerar um único manifesto com Windows, `darwin-aarch64` e `darwin-x86_64`, conforme arquiteturas suportadas.
- [ ] Evitar que cada job de build sobrescreva o manifesto com apenas sua plataforma.
- [ ] Usar `.app.tar.gz` e assinatura para atualização macOS; `.dmg` para instalação inicial.
- [ ] Distinguir assinatura Apple da assinatura do updater e preservar a chave de atualização existente.
- [ ] Validar gravação de dados, fechamento da ponte, atualização, reinício e persistência das permissões.

**Critério de conclusão:** instalar e atualizar em um Mac sem ferramentas de desenvolvimento, mantendo dados e funcionamento.

### Fase 10 — CI, regressão e documentação

**Prioridade:** transversal. **Dependências:** começa nas fases 0/1; encerra após fase 9.

- [ ] Criar CI Windows/macOS com instalação, tipos, testes e compilação Rust.
- [ ] Testar contratos de plataforma, caminhos, credenciais e comunicação autenticada da ponte.
- [ ] Cobrir comportamento de capacidades indisponíveis e permissões recusadas/revogadas.
- [ ] Adicionar testes de hooks por sistema e manifestos com múltiplas arquiteturas.
- [ ] Validar manualmente Apple Silicon e Intel, se ambos forem suportados.
- [ ] Validar Retina, múltiplos monitores, tela cheia e retorno de suspensão.
- [ ] Testar falha e reinício da ponte, porta ocupada e encerramento do aplicativo.
- [ ] Medir CPU/memória da ilha e do dock; o polling atual do cursor ocorre a cada 45 ms.
- [ ] Limitar o custo das prévias e dos leitores contínuos do sistema.
- [ ] Executar regressão Windows após alterações compartilhadas.
- [ ] Atualizar README com requisitos macOS, instalação, desenvolvimento, atalhos, permissões, dados e limitações.
- [ ] Documentar build, assinatura, atualização e recuperação de erros nas duas plataformas.

**Critério de conclusão — marco C:** distribuição validada, funcionalidades documentadas e verificações automatizadas cobrindo as duas plataformas.

## Ordem de execução e dependências

```text
Fase 0: base e definição de suporte
  -> Fase 1: separação de plataformas
  -> Fase 2: runtime Node e ponte
  -> Fase 3: dados e Keychain
  -> Fase 4: sistema principal                         [Marco A]
  -> Fase 5: permissões, ilha e geometria
  -> Fase 6: dock e prévias                           [Marco B]

Após os contratos da fase 1:
  -> Fase 7: provas de viabilidade e controles adicionais

Após as fases 2 a 4:
  -> Fase 8: ferramentas de código e consumo

A partir do marco A:
  -> Fase 9: distribuição, assinatura e atualização

Fase 10: CI e regressão durante toda a implementação;
         validação final após distribuição            [Marco C]
```

O marco A permite validar o núcleo do produto no Mac sem aguardar equivalência de todas as integrações. O marco B entrega as camadas desktop. O marco C conclui a distribuição e a validação do escopo definido, com limitações explicitamente documentadas.

## Decisões que precisam ser fechadas durante a implementação

| Decisão | Recomendação inicial | Momento |
|---|---|---|
| Canal de distribuição | Distribuição direta com app/DMG | Fase 0 |
| Arquiteturas | Planejar Apple Silicon e Intel; confirmar alcance e custo de validação | Fase 0 |
| Versão mínima macOS | Escolher após cruzar requisitos das APIs e dependências | Fase 0 |
| Organização nativa | Rust com módulos por plataforma; Swift apenas quando necessário | Fase 1 |
| Dock nativo | Coexistir com o Dock do macOS | Fase 6 |
| Mídia global | Definir cobertura somente após prova de viabilidade | Fase 7 |
| Volume por aplicativo | Não habilitar até validar solução sustentável | Fase 7 |
| Recursos sem equivalente | Encaminhar aos Ajustes ou declarar indisponibilidade | Fases 7/8 |
| Bundle universal | Adotar somente se todos os binários incluídos forem compatíveis | Fase 9 |

Não há estimativa fechada de prazo: a maior incerteza está na equivalência das integrações nativas. As fases 1 a 4 e as provas da fase 7 fornecerão evidências para estimar o restante.

## Critérios gerais de aceite

- [ ] Windows continua compilando e seus fluxos existentes passam na regressão.
- [ ] macOS instala e abre sem depender de Node, Rust ou pnpm no computador do usuário.
- [ ] Dados, backups e credenciais persistem corretamente.
- [ ] A ponte mantém autenticação, validação de origem e escuta local.
- [ ] Negar permissões opcionais não impede o uso do sistema principal.
- [ ] Não existem controles habilitados que falhem silenciosamente por serem Windows-only.
- [ ] Janelas não roubam foco nem bloqueiam cliques indevidamente.
- [ ] Recursos capturados e processos auxiliares são liberados corretamente.
- [ ] Atualização preserva dados e usa o artefato da plataforma/arquitetura correta.
- [ ] Consumo de recursos foi medido em cenários normais, incluindo previews.
- [ ] Documentação corresponde às funcionalidades efetivamente entregues.

## Validação feita nesta análise

- Inspeção de frontend, backend Node, Rust, configuração Tauri e scripts de build/release.
- Execução de `node --test scripts/release-version.test.mjs`: **11 testes passaram**.
- Não foi validada a compilação desktop: `cargo` e `pnpm` não estavam disponíveis no ambiente da análise.
- Não foi executada a suíte completa: além da indisponibilidade de pnpm, o comando atual referencia arquivos ausentes neste checkout.
- Não há comprovação prática de equivalência das APIs macOS propostas; ela faz parte do roadmap.

## Referências técnicas

- [Tauri — configuração e configurações específicas por plataforma](https://v2.tauri.app/reference/config/)
- [Tauri — assinatura e notarização no macOS](https://v2.tauri.app/distribute/sign/macos/)
- [Tauri — updater e artefatos por plataforma](https://v2.tauri.app/plugin/updater/)
- [Apple — Keychain Services](https://developer.apple.com/documentation/security/keychain-services)
- [Apple — Accessibility / AXUIElement](https://developer.apple.com/documentation/applicationservices/axuielement_h)
- [Apple — ScreenCaptureKit e permissão de captura](https://developer.apple.com/documentation/ScreenCaptureKit?language=objc)
- [Apple — CoreWLAN](https://developer.apple.com/documentation/CoreWLAN)
- [Claude Code — autenticação e armazenamento de credenciais no macOS](https://code.claude.com/docs/en/authentication)
