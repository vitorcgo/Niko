# Pendências GNOME 46/Wayland — 07/10/2026

Estado desta revisão local; prevalece sobre registros históricos para este escopo.
Windows preservado nos ramos existentes, sem execução Windows nesta rodada.
Alterações locais anteriores preservadas; nenhuma instalação pessoal nesta rodada.

Gate gráfico final do pacote: dock/ferramentas e painel passaram com cleanup confirmado;
`gnome-fixo-final.txt`, `painel-privado.txt` e `sistema-privado.png` são os resultados finais.
A tentativa anterior do painel terminou 143, registrada abaixo como histórico desta rodada.
Pacote: SHA256 `15eb8e51b9f8b6cb8a8515fb213abc14a2c22f8c795a4d34d8616e326c7a8e71`.
Fontes identificadas em `revisao.sha256`; conferência de conteúdo em `pacote.txt`.

## Inventário conferido e implementação

| Recurso | Situação e mudança |
| --- | --- |
| Dock/janelas | Frontend existente reutilizado. Janela Tauri e adapter GNOME implementados anteriormente; ícones nativos, miniaturas, reserva, fixo/inteligente/esconder implementados. Inteligente usa sobreposição geométrica, incluindo janela não maximizada. Nesta rodada o cliente GJS passa a persistir entre consultas, encerrando após 5s ocioso ou shutdown; requisições simultâneas continuam compartilhadas. Não há polling com um novo GJS por consulta. |
| Sistema | Windows dependia de PowerShell. Linux agora usa UPower, GNOME SettingsDaemon, NetworkManager, BlueZ, logind, ScreenSaver e StatusNotifierItem; áudio via wpctl/pw-dump. Mantidas validação, confirmação de energia e recusas. Senha Wi-Fi apenas stdin, sem shell/argv/arquivo. Controles acessíveis em Configurações → Sistema reutilizando o painel; barra lateral da ilha permanece desativada no Linux por limitações de geometria. |
| OCR | Windows preservado; Linux valida raster/dimensões via GdkPixbuf e usa Tesseract por/eng. Upload privado 0600 com remoção finalmente. Dependências nativas declaradas no .deb, não instaladas no sistema pessoal. |
| Gmail OAuth | Fluxo PKCE/state/loopback existente reutilizado. Linux abre navegador padrão com gio; falha do lançador e cancelamento encerram listener. Não recriado OAuth. |
| Consumo | Backend de leitura já existia. Removida recusa Linux na ponte e no agendamento; alertas opt-in e deduplicação preservados; cwd Linux usado nas sessões. Testes só com credenciais fictícias e endpoints simulados. Limpeza automática de dados/exemplos permanece restrita ao ramo Windows. |

## Evidência e limites

Suíte completa: 117 testes, 114 passaram, 0 falharam, 3 pulados (2 Windows e OCR nativo opcional).
OCR separado: Tesseract real extraído em /tmp reconheceu NIKO/OCR/123 em PNG gerado com Cairo.
Não instalou pacotes nem leu imagens pessoais. O motor não está instalado no computador pessoal.
Áudio separado: PipeWire/wpctl reais com sink/source/stream virtuais, sem monitores ALSA/Bluetooth;
volume, mute e volume/mute por aplicativo passaram. Nenhum som/hardware pessoal utilizado.
Controles: GJS/Gio e D-Bus reais, serviços UPower/NM/BlueZ/logind/SNI fictícios privados;
validam protocolo e comandos, não comprovam brilho, energia ou conectividade no hardware.
Gmail: gio e navegador fictício reais em HOME/XDG/D-Bus/rede privados, callbacks local inválido/válido;
Google/token endpoint simulado, sem autenticação pessoal. Consumo: logs e credenciais fictícios,
fetch simulado; não confirma limites reais do provedor.

Tauri/WebKit real no GNOME privado: dock fixo, ícones, miniaturas, ações/stale ID, reserva/fullscreen,
overview/captura/teclado e um único cliente GJS entre consultas por 8s passaram na revisão anterior
imediata à mudança textual final. CPU observada 8,7% de um núcleo em 8s após acomodação,
renderização por software; não há baseline equivalente nem comprovação de estabilidade.
Captura GNOME foi aberta/fechada sem salvar mídia. Teclado habilitado somente no HOME privado.
Inspeção visual real de Configurações → Sistema passou; ausência de áudio/barramentos de hardware
no laboratório exibe indisponibilidade esperada. Texto Windows encontrado nessa inspeção foi corrigido.

## Reproduzir

Usar Node integrado `src-tauri/recursos/node` (não Node 18 do sistema):

```sh
src-tauri/recursos/node scripts/construir-ponte.mjs
src-tauri/recursos/node scripts/testar.mjs
src-tauri/recursos/node node_modules/typescript/bin/tsc --noEmit
src-tauri/recursos/node --test servidor/audio-linux.test.mjs
src-tauri/recursos/node --test servidor/controles-linux.test.mjs servidor/gmail-linux.test.mjs
NIKO_OCR_PRIVATE_ENGINE=/tmp/niko-ocr-motor/extraido/usr/bin/tesseract src-tauri/recursos/node --test servidor/ocr-linux.test.mjs
NIKO_TAURI_HEADLESS=1 NIKO_TAURI_DOCK=1 NIKO_DOCK_MODO=esconder bash linux/gnome/native-tauri/run.sh
NIKO_TAURI_HEADLESS=1 NIKO_TAURI_DOCK=1 NIKO_DOCK_MODO=inteligente bash linux/gnome/native-tauri/run.sh
src-tauri/recursos/node linux/validar-pacote.mjs
```

O OCR privado exige previamente extrair motor/dados e dependências Ubuntu em /tmp;
a suíte padrão pula o teste opcional quando ausente. Testes privados recusam isolamento incompleto.

Rodadas finais de esconder e inteligente passaram com pacote final antes da última correção
textual de dicas GNOME. Inteligente inclui janela sem maximização cobrindo o dock e cliques
pass-through/abertura pela borda. Uma rodada inteligente falhou na ação posterior de foco
com integracao_janelas_indisponivel; repetição sem mudança no produto passou. Causa aberta.
Falhas do harness e esta intermitência registradas em `falhas-observadas.txt`.
A CPU variou amplamente entre amostras por software; medir no hardware pessoal antes de
concluir que a lentidão foi resolvida. O reaproveitamento de processo foi comprovado.

## Pendências para a rodada conjunta

Instalar o pacote final e, com autorização específica, as dependências OCR tesseract-ocr,
tesseract-ocr-eng e tesseract-ocr-por; não foram instaladas nesta rodada.
Conferir dock/ícones/modos no uso pessoal e custo de CPU em hardware real.
Validar controles de leitura e interface; operações de energia/rede/mídia/credenciais continuam
fora dos testes pessoais automatizados. Brilho exige suporte do hardware; OSK deve já estar
habilitado pelo usuário no GNOME. Novas redes WEP/enterprise são recusadas; perfil salvo pode
ser ativado pelo NetworkManager. Bandeja depende de um StatusNotifierWatcher ativo.
Miniaturas não disponíveis para janelas minimizadas ou fora do workspace atual.
Informações do computador usam métricas nativas; CPU precisa de duas amostras, GPU usa IDs/driver,
sem promessa de nomes comerciais ou dados indisponíveis.
OAuth e consumo autenticados requerem validação manual autorizada posterior.
Histórico intermitente stack_position e MSDK GStreamer do sistema permanecem abertos.
Abas Chat/Claude e barra lateral da ilha não têm paridade Windows nesta etapa.
Distribuição automática/instalação limpa são trabalho separado. Não declarar portabilidade completa.

LICENSE.md inalterado. Falta autorização escrita do titular vitorcgo para adaptação e envio/publicação
sob a licença atual. Sem push, PR, fork público ou publicação. Não anexar HOME, bancos, tokens,
pacotes extraídos ou dumps de serviços à contribuição.

Revisão final dos textos: dicas/ações do painel dizem GNOME no Linux; ramos Windows mantêm os textos específicos. O import desses textos revelou criação de BroadcastChannel em SSR; guardado por presença de window no módulo compartilhado e verificado por `scripts/desktop-ssr.test.mjs`. A suíte final encerrou normalmente e passou.

Reforço final de isolamento: todos os XDG dos testes novos foram redirecionados explicitamente, incluindo state/cache; seis testes afetados passaram com OCR real. Suite completa anterior a esse reforço passou; o reforço altera somente ambiente de laboratório. Pacote final e payloads conferidos em pacote.txt.
Inspeção visual do painel no pacote final mostrou os textos corrigidos (sistema-privado.png). Essa execução teve término 143 sem result/cleanup final do harness; valida o render observado, não um gate completo. A inspeção anterior teve gate PASS.

Gate nativo do pacote final: `gnome-fixo-final.txt` passou com dock, ícones/miniaturas, ações de janela, stale ID, reserva/fullscreen, overview, captura e OSK via ponte autenticada e cleanup. CPU nesta amostra foi 13,1% de um núcleo por software; não é uma medição comparativa.
