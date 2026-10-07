# Instalação e ativação em GNOME real

```sh
linux/gnome/native-integracao/run.sh
```

Requisitos: sessão gráfica existente, GNOME Shell/Mutter 46, EGL, GJS com serviço `/usr/share/gnome-shell/org.gnome.Shell.Extensions`, `gsettings`, `gdbus`, `dbus-monitor`, `dbus-run-session`, Python3 e dependências Node/Vite instaladas pelo lockfile do projeto. Node22 padrão: `node`; sobrescreva `NIKO_TEST_NODE` se necessário. Não pertence à suíte headless.

O runner cria GNOME nested com runtime, configuração, dados, cache, estado e D-Bus privados. O barramento permite autoativar exclusivamente o serviço nativo GNOME Extensions em seu diretório privado de serviços. Não inicia Niko, não usa janelas GTK fictícias, não altera mídia/credenciais/conectividade e não modifica as configurações da sessão principal. O DISPLAY externo só hospeda a janela do compositor nested. Ao finalizar encerra processos próprios e preserva logs no diretório temporário impresso.

O teste importa `servidor/gnomeIlhaLinux.ts` efetivamente integrado via Vite e chama a API real: detecta extensão versão2 inativa; confirma que consultar estado não escreve nem habilita; habilita somente `niko-ilha@local`; confirma estado ativo e consulta readonly; altera código mantendo versão2 e exige nova_sessao com marcador persistente identificado pelo bus/owner reais e consulta readonly; atualiza fonte privada para versão3, verifica arquivos/backup instalados e cache GNOME versão2; exige retorno `nova_sessao` sem logoff/reinício. O monitor D-Bus registra as chamadas reais de habilitação com UUID. A extensão é a implementação real copiada do repositório; apenas seu metadata de laboratório tem versões2/3.

`revision.sha256`, `info-before`, `enable-calls.log`, `test.log`, `shell.log` e `result` ficam no diretório de evidências. Qualquer assertion, timeout, crash ou critical de gerenciamento GTK/Mutter/JS reconhecido faz o runner falhar. Warnings de CalendarServer, portal e serviços ausentes pertencem ao laboratório mínimo; não são suprimidos. O teste aguarda startup completo do Shell antes de ativar o serviço nativo para evitar propriedades transitórias nulas.

Este teste comprova instalação/ativação/atualização pelo helper e APIs GNOME reais. Interface Tauri, pacote instalado e confirmação manual com o usuário continuam sendo validações separadas. Não substitui os testes de ciclo/foco da ilha em `../native/`.
