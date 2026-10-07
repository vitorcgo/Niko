# Dock e janelas — GNOME 46/Wayland — 07/10/2026

Rodada local, sem commit, push, PR, instalação no host ou alteração da sessão pessoal.
Alterações locais anteriores preservadas. Não amplia suporte a KDE/X11/outros shells.

## Inventário conferido no código

- Dock: frontend existente; criação da janela, reserva, hit-test e miniaturas exclusivos do Windows.
- Janelas: `/janelas` e suas ações roteavam somente para PowerShell/user32.
- Sistema: `sistema.ts` e `controleRapido.ts` dependem de Windows/PowerShell.
- OCR: `ocr.ts` recusa plataformas diferentes de Windows. Não há executável tesseract instalado nesta consulta.
- Gmail: PKCE/state/loopback/fetch existentes; abertura OAuth usa rundll32 e bloqueia Linux.
- Consumo: backend Node/HOME existente. Consulta agendada/alertas bloqueados por `LINUX` em `servicos.ts`; não recriar backend.

Ordem: dock/janelas → miniaturas/modos/reserva → sistema → OCR → Gmail → consumo.

## Alterações desta etapa

Janela dock Tauri/WebKit Linux com tamanho baseado no conteúdo, ancorada pelo compositor
no monitor primário. Modo fixo experimental; modos inteligentes/auto-hide, reserva de
área e miniaturas ainda não implementados. Configurações informa o limite. Lista de
prévia mostra títulos, sem simular imagem. Sem esconder dash/painel do GNOME.

Extensão exporta `/com/niko/Janelas` na conexão do Shell: listagem e foco/minimização/
fechamento com Meta.Window. Identificadores incluem epoch aleatório da ativação e sequência
do compositor; janela encerrada e ID de outra ativação são recusados. Filtra ilha/dock,
skip-taskbar e tipos que não sejam normal/dialog/modal-dialog. Sessão bloqueada/greeter
recusa chamadas. Adapter Node/GJS fixa o owner único do Shell e confere versão 46 pela
propriedade da própria integração, sem autoativar outro serviço. Endpoint HTTP existente
continua autenticado; implementação Windows mantida.

Dock oculto em fullscreen/bloqueio e fora de AltTab/overview. Cleanup cancela callback,
desconecta sinais e restaura posição, sticky/above e ator quando ainda gerenciado.
Não move Meta.Window após unmanaging. Acesso somente com integração ativa.

## Resultados e pendências

- TypeScript/frontend/ponte e build release/deb passaram; pacote somente extraído/verificado,
  nunca instalado. Rust locked/offline: 12 testes passaram. Contratos simulados: 2 testes passaram.
- Primeiras execuções Tauri privadas detectaram roubo de foco na abertura. A restauração
  pelo compositor após map confirmou foco preservado nas rodadas seguintes. Tentativas
  de focusable GTK não resolveram e foram removidas.
- Frame GTK observado: 320×200, apesar da altura menor pedida pelo conteúdo; precisa de
  máscara de entrada para a área transparente. Região GTK registrada no diagnóstico:
  96,138 com 129×62 em superfície 320×200, escala 1. Validação ainda em andamento.
  O adapter agora usa a região do widget e solicita redesenho para commit Wayland.
- O primeiro teste de clique tinha deslocamento do backend nested (pedido 370,569,
  observado 270,400). Agora calibra e exige coordenadas corretas antes de pressionar.
  Resultados antigos de clique não provam comportamento da interface.
- Com coordenadas corrigidas, o logo acionou o endpoint real e focou o Niko. Rodadas
  seguintes falharam no botão do aplicativo e na transparência; etapa não aprovada.
- Houve CRITICAL Cogl de viewport em algumas rodadas; causa não atribuída. Histórico
  intermitente stack_position permanece aberto; não declarar estabilidade geral.
- Regressão runtime-helper anterior nesta etapa: atualização A→B, rollback, readonly,
  manifesto/legado e mesmo compositor passaram; cleanup passou. Repetição da revisão
  final da extensão e regressão Tauri da ilha ainda pendentes.
- Windows real, miniaturas/modos/reserva/ícones e demais recursos do inventário pendentes.

O runner reproduzível é `NIKO_TAURI_DOCK=1 bash linux/gnome/native-tauri/run.sh`.
Ele usa HOME/XDG, banco e D-Bus privados e app em namespace de rede próprio. O cliente
recusa um barramento fora do laboratório. Não testa credenciais, mídia ou dados pessoais.

## Autorização e contribuição

Usuário autorizou continuar as alterações locais e destinar a contribuição ao titular.
Isso não comprova autorização escrita do titular. LICENSE.md permanece intacta;
publicação, push, fork público e PR retidos. Falta autorização escrita do titular para
adaptação e envio/publicação destas alterações nos termos da licença atual.

## Fontes técnicas consultadas

- [Mutter 46: entrada virtual](https://raw.githubusercontent.com/GNOME/mutter/46.0/src/backends/native/meta-virtual-input-device-native.c): botão Clutter é convertido para evdev; o botão 1 do teste foi mantido.
- [GTK 3.24.41: janela Wayland](https://raw.githubusercontent.com/GNOME/gtk/3.24.41/gdk/wayland/gdkwindow-wayland.c): input_shape marca input_region_dirty; o envio ocorre em sync_input_region. A necessidade de redesenho neste caso é hipótese em validação nativa.
