# Teste nativo GNOME 46

Execute em sessão Wayland existente, com `gnome-shell` 46, Mutter 46, `dbus-run-session`, `gsettings`, Python 3/PyGObject e typelib GTK 3 instalados:

```sh
linux/gnome/native/run.sh
# Diagnóstico diferencial sem carregar extensão de produção:
NIKO_NATIVE_BASELINE=1 linux/gnome/native/run.sh
# Variante diagnóstica: GTK mostra sem present síncrono; NÃO equivale ao foco Tauri:
NIKO_NATIVE_SHOW_ONLY=1 linux/gnome/native/run.sh
```

O runner retorna erro se um assert funcional falhar, houver timeout/crash ou logs indicarem critical de gerenciamento de janelas, GTK, TypeError ou JS ERROR. Cada execução imprime diretório temporário com logs, resultado e SHA-256 da extensão integrada. Não pertence à suíte headless: exige sessão gráfica Wayland e renderização EGL disponíveis. GNOME 47+ não foi validado; o contrato da extensão declara 46.

O laboratório usa D-Bus privado sem autoativação, runtime/configuração/dados/cache/estado temporários e backend GSettings keyfile. A conexão ao Wayland externo só cria a janela nested. Os processos do laboratório são encerrados ao terminar. Nenhum binário Niko, banco real, credencial, player ou conexão de rede pessoal é usado.

O cliente GTK3 é fictício e exporta o contrato D-Bus de mostrar ilha; GNOME Shell, Mutter, GTK, Wayland e gerenciamento de foco/janelas são nativos. A extensão testada é copiada do arquivo de produção e subclassificada apenas para executar assertions. Cobertura: cinco ciclos map/hide/remap, posição central abaixo do painel, ausência na tablist, foco após map, atenção com outra janela focada, restauração de tablist/cancelamento ao desabilitar, reabilitação e serviço desaparecendo; fullscreen de outra janela GTK (oculta/restaura actor sem tomar foco, não revive ilha escondida e limpa actor ao desabilitar). O baseline mantém apenas ciclos GTK sem carregar a extensão de produção. O modo canônico chama GTK show_all/present e reutiliza a janela oculta; a variante SHOW_ONLY omite present e existe apenas para isolar criticals do GTK/Mutter, sem comprovar o fluxo Tauri real.

A integração Tauri/WebKit, aparência, múltiplos monitores, escala fracionária, fullscreen, bloqueio de sessão e aplicativo/pacote instalado precisam de validação manual adicional autorizada pelo usuário. Esses testes não alteram a sessão principal para cobrir tais casos.
