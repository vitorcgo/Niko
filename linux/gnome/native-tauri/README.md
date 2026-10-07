# Niko real: Tauri/WebKit no GNOME nested

Requer o .deb local já gerado/verificado, GNOME46/Mutter, Python/Gio,
`unshare`, `ip`, `setsid`, `gdbus`, `dpkg-deb` e uma sessão gráfica. Não instala
dependências nem pacote. User/network namespaces precisam estar disponíveis;
o sandbox do agente pode exigir execução autorizada fora do sandbox restrito.

```bash
bash linux/gnome/native-tauri/run.sh
NIKO_TAURI_BASELINE=1 bash linux/gnome/native-tauri/run.sh
# Comparação de renderização, sem o override DMABUF usado no pacote pessoal:
NIKO_TAURI_DMABUF=0 bash linux/gnome/native-tauri/run.sh
# Dois monitores nested, troca de primário, 200%/125% e desativação lógica:
NIKO_TAURI_MONITORS=2 bash linux/gnome/native-tauri/run.sh
# Contrato de recusa headless (também descoberto pela suíte existente):
node --test linux/gnome/tauri-isolamento-linux.test.mjs
```

Extrai a árvore completa do .deb em /tmp e inicia o binário real, com frontend,
ponte e Node do mesmo pacote. Não copia somente o executável: isso poderia
resolver recursos da instalação pessoal. Banco, HOME/configuração/cache/estado,
runtime e D-Bus são próprios. APPDATA/APPDIR/DISPLAY e sockets pessoais são
removidos. O compositor usa DISPLAY externo somente para sua janela nested;
Niko usa o socket Wayland nested. A rede do app/ponte é um namespace próprio,
com loopback e porta47831; valida que é diferente da rede do host antes do app.
Não acessa rede externa nem a ponte pessoal. Não desabilita sandbox WebKit.

O watcher SNI é fictício, para impedir fallback GtkStatusIcon. Isso não testa
tray real. GNOME/Mutter, Tauri/WebKit, frontend/IPC e SQLite são reais. Probe
envia ExecuteCallback real para abrir e Meta.Window.delete para passar pelo
CloseRequested real de ocultação. Faz cinco ciclos, verifica map/foco e, com
extensão, posição/tablist/limpeza. Baseline omite a extensão de produção.
Pedidos são repetidos durante o primeiro carregamento: não é teste de prontidão
ou de um único clique imediatamente após startup.

Gate falha em timeout, ausência do listener privado, falhas dos asserts,
qualquer libmutter-CRITICAL, stack_position/has_last_sent_configuration/GTK/JS monitorados ou crash.
GStreamer pode emitir outros CRITICALs: preservados no app.log, não declarados
resolvidos nem logs totalmente limpos. O probe padrão também testa fullscreen real da janela Tauri: entrada, saída,
ocultação durante fullscreen e reabertura. A variante de monitores testa topologia
lógica nested e escalas reais do Mutter, sem comprovar desconexão física, aparência
visual, atalho físico ou integração SNI real.

Cada execução registra revisão do payload/extensão, logs, result, namespace,
listener e cleanup. App/Node/WebKit compartilham grupo exclusivo, encerrado pelo
trap; cleanup precisa confirmar término. O laboratório conserva evidências
temporárias; nenhuma credencial ou dado pessoal é usado.

Comparação GTK com foco diferido (diagnóstico, não substitui canônico):

```bash
NIKO_NATIVE_BASELINE=1 NIKO_NATIVE_PRESENT_DELAY_MS=250 bash linux/gnome/native/run.sh
```

Mantém show+present, separando foco por250ms. O canônico continua show/present
síncrono; variante que passa não prova sozinha que a causa foi resolvida no app.
