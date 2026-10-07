# Diagnóstico GStreamer — 06/10/2026

O CRITICAL `_dma_fmt_to_dma_drm_fmts` foi reproduzido **sem Niko, WebKit, GTK, GNOME ou D-Bus** durante descoberta dos plugins GStreamer. O problema permanece; nenhum filtro de log, plugin removido ou instalação foi aplicado.

## Reprodução

`bash linux/diagnostico-gstreamer/run.sh` — exit0 diagnóstico, laboratório `/tmp/niko-gstreamer.C0W3Mi`; log externo `/tmp/niko-gstreamer-repro-final.log`. Cada processo usa HOME/XDG/registry temporários e ambiente `env -i`. Não altera registro pessoal nem produz som. `bash -n` passou. A execução requer acesso aos dispositivos DRM disponíveis no host; dentro do sandbox sem `/dev/dri` o CRITICAL não apareceu, resultado que não valida ausência no host.

Resultados observados:

- `gst-inspect-1.0` com registry novo: CRITICAL durante carga de `libgstmsdk.so`, exit0.
- Diretório de plugins contendo apenas symlink de `libgstmsdk.so`: mesmo CRITICAL, exit0. Logs detectam `/dev/dri/renderD128`, Intel Media SDK, implementação HARDWARE e MFX1.35.
- `GST_REGISTRY_FORK=no G_DEBUG=fatal-criticals gdb --batch --nx ... gst-inspect-1.0`: SIGTRAP na assert; três frames de `libgstmsdk.so` antecedem `gst_update_registry`. Biblioteca sem símbolos de debug: não identifica argumento exato.
- WAVE PCM fictício mono16bit/8000Hz/1segundo → `wavparse ! audioconvert ! fakesink`: scanner emite CRITICAL, depois pipeline alcança PAUSED/PLAYING/EOS e finaliza exit0. Demonstra decodificação PCM nesse pipeline, não áudio físico nem HTMLAudio/WebKit nem vídeo/GPU.

## Origem e limite da conclusão

Pacote observado: `gstreamer1.0-plugins-bad:amd64 1.24.2-1ubuntu4`; GStreamer1.24.2; WebKitGTK4.1 2.52.6-0ubuntu0.24.04.1. Versões e hash integral do plugin em `evidencias/`.

A [fonte oficial GStreamer1.24.2](https://github.com/GStreamer/gstreamer/blob/1.24.2/subprojects/gst-plugins-bad/sys/msdk/gstmsdkcaps.c#L259) mostra `_dma_fmt_to_dma_drm_fmts`: recebe string de formato, chama `gst_video_format_from_string` e recusa `GST_VIDEO_FORMAT_UNKNOWN` (linhas275–278). Ela é chamada na criação de capacidades DMA/DRM do plugin MSDK. A assert e a biblioteca foram confirmadas em execução; o formato inválido específico e eventual correção upstream ainda não foram identificados. Não presumir que mudar a versão WebKit ou desabilitar DMABUF corrigirá este plugin.

## Evidências preservadas

`evidencias/all-errors.txt`, `msdk-errors.txt`, `stack.txt`, `audio.txt`, `versions.txt` e `plugin.sha256`. Os arquivos incluem o CRITICAL integral. O script imprime `REPRODUCED` explicitamente; seu exit0 significa diagnóstico executado, **não estabilidade aprovada**. Nenhuma credencial, mídia, configuração pessoal ou processo Niko foi usado.

Próximo critério: validar HTMLAudio/WebKit com áudio fictício em ambiente privado e vídeo real apenas com autorização/ambiente apropriados; investigar correção oficial do MSDK na distribuição antes de alterar produção.

## Causa exata e correção upstream

GDB confirmou `FORMAT_INPUT= VUYA`, com espaço inicial, imediatamente antes da
assertiva. O código 1.24.2 contém espaço duplicado em `Y210,  VUYA` na lista HEVC.
O commit oficial [236d6714ec7777dd83d8955ca188328369393283](https://github.com/GStreamer/gstreamer/commit/236d6714ec7777dd83d8955ca188328369393283),
integrado em 29/05/2024, remove esse espaço e descreve a mesma assertiva.
A fonte consultada 1.26.0 contém a correção; 1.24.4/1.24.5 consultadas ainda
contêm o defeito nessa lista. Não concluir disponibilidade atual no Ubuntu com
base em índices locais não atualizados.

Experimento GDB em processo isolado ajustou somente o ponteiro do argumento
` VUYA` para `VUYA`: gst-inspect concluiu normalmente com 2 plugins/16 features.
Nenhum plugin foi desativado, biblioteca modificada ou pacote instalado. Isso
confirma a causa e o efeito da correção, mas não corrige a biblioteca do host.
Logs, script diagnóstico e resposta oficial do commit em `evidencias/formato-exato/`.

Reprodução HTMLAudio/WebKit ainda não aprovada: o ambiente privado inicial
aguardou conexão/configuração do sink de áudio; não atribuir esse timeout ao
Niko nem concluir que a correção do formato resolve reprodução.

## Reprodução WebKit real — resultado final

`bash linux/diagnostico-gstreamer/webkit-media-run.sh` terminou exit0 com
WebKitGTK4.1 2.52.6, GNOME nested, D-Bus/rede/HOME/XDG privados.
HTMLAudio silencioso WAV de 1s chegou ended/currentTime1; HTMLVideo Theora
160×90 de 1s chegou ended/currentTime1 e apresentou 27 assinaturas de pixels
distintas via canvas durante reprodução. Não produz som: mute/volume0 e null sink
privado com monitores ALSA/Bluetooth/câmera desabilitados. Cleanup dos grupos
próprios confirmado. Nenhum player ou servidor de áudio pessoal foi usado.

Timeouts anteriores tinham servidor de áudio sem gerenciador de sessão privado.
Uma rodada por requestAnimationFrame passou (23 quadros), sua repetição não
amostrou pixels; o teste final usa setInterval para não depender da animação da
janela nested. O contador totalVideoFrames retornou0 e não foi usado para
aprovar renderização. Evidências finais e falha de repetição preservadas em
`evidencias/webkit-media/`. Não representa reprodução no componente de mídia do
Niko/Tauri, saída física de áudio, todos codecs ou aceleração de vídeo. Avisos
de rtkit/portal/tempfile do ambiente privado não foram ocultados. O defeito MSDK
permanece na biblioteca do host; a correção upstream não foi instalada.
