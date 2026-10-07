# HTTP da ponte empacotada em GNOME privado

Execute `bash linux/gnome/native-http-runtime/run.sh` após reconstruir e verificar o `.deb` da revisão integrada. O runner começa com um probe bubblewrap sem aplicativo. Exige permissões de namespaces, GNOME46 nested, Wayland, GJS, Python e iproute2 já instalados.

Extrai o pacote completo; executa seu Node/ponte originais, sem instalar Niko nem editar bundle. Bubblewrap fornece raiz readonly, laboratório temporário gravável, overlay readonly dos recursos GNOME no caminho absoluto de produção e namespace de rede próprio. Compositor e D-Bus são privados; o Wayland externo só recebe a janela nested. Nenhum player/cofre/dado/atalho pessoal é usado.

Testa GET sem escrita, POST com token/confirmacao inválidos sem escrita, atualização via POST autenticado, igualdade do payload e revisão/owner GNOME. O bootstrap está presente antes do startup: isso não valida primeira instalação pelo canal GNOME. A ponte é real, mas este teste não inicia Tauri/WebKit nem prova UI. Logs, hashes, resultado e cleanup ficam no diretório impresso. Criticals Mutter/GTK/JS fazem o runner falhar. Não publica nem instala pacote/extensão na sessão pessoal.
