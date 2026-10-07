# Runtime empacotado com Tauri real

Depois de gerar e verificar o `.deb` da revisão atual:

```bash
bash linux/gnome/native-tauri-runtime/run.sh
```

Reutiliza isolamento e cleanup de `native-tauri/session.sh`: D-Bus privado,
HOME/XDG temporários, watcher SNI fictício, GNOME nested e aplicação real com
loopback/rede próprios. Usa o runtime extraído do pacote, sem alterar seu código;
uma segunda extensão de diagnóstico observa D-Bus e janelas. Verifica revisão,
estado ativo, mesmo owner do Shell, cinco ciclos Tauri show/hide/remap, foco,
âncora e exclusão da tablist. O gate de criticals nativos continua ativo.

Os UUIDs do runtime e do probe existem antes do startup do compositor. Não prova
primeira instalação pelo canal GNOME, atualização ou publicação. Não invoca a
operação de instalação do helper pela ponte; sua origem de recursos permanece
absoluta em produção. Não usa o aplicativo, banco, mídia ou credenciais pessoais.
Sem instalação, logout ou reinício da sessão pessoal. Logs e hashes ficam no
laboratório `/tmp/niko-tauri.*` informado pelo runner.

Execução observada em 06/10/2026: `.deb` SHA256
`0ed7f74e1375a2559ca981e06831448875ec3995d5c0d46aeb9739f70a276e2e`,
laboratório `/tmp/niko-tauri.z9IvcX`, EXIT0 e cleanup confirmado. Os cinco ciclos
usaram o mesmo PID do aplicativo; revisão ativa
`implementation-f7f3a81edb8dd64c60c02a5f491a67300317f51a82b4d7baea553fb366411509.js`.
Gate de criticals de janelas/GTK/JS passou. Permanecem dois CRITICALs conhecidos
GStreamer `_dma_fmt_to_dma_drm_fmts`, avisos de ping ao fechar e serviços ausentes;
esta execução não resolve nem mascara esses resultados. Execução anterior
`/tmp/niko-tauri.AWQ0NE` falhou por metadata incompleta do probe diagnóstico,
corrigida antes da rodada final; não representava falha do loader de produção.
