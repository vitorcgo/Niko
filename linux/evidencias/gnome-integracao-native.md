# Instalação/ativação GNOME nativa — 2026-10-06

Papel: agente de testes Linux, responsabilidade exclusiva novos linux/gnome/native-integracao/{run.sh,integracao.test.mjs,README.md}. Não alterou produção nem fixtures anteriores.

Comando final: linux/gnome/native-integracao/run.sh
Resultado final: EXIT0; node:test 1 passou/0 falharam; assertions nativas e gate critical passaram.
Evidência: /tmp/niko-native-integracao.a3547t/{revision.sha256,info-before,enable-calls.log,test.log,shell.log,result}.
Helper integrado SHA256 cc94afef5d25f2fbc3bf3fb3071f9d091454c75ccc408a2e36694441e0978e38.
Extensão produção SHA256 b2f5a3b14fefe4023daab92f3e8a281eb1abeaf419ba00881448a42c07024f29.
Current helper hash conferido após teste igual snapshot. GNOME Shell46.0/Mutter46.2. Node22.23.3/Vite real SSR loader.

Executado nativamente: GNOME nested, compositor Mutter, serviço GNOME Extensions da distro, gsettings keyfile, gjs/Gio, D-Bus, módulo integrarIlhaLinux real, filesystem atomic rename/backup. Sem GTK fake windows, sem Niko/WebKit/Tauri.
Simulado: somente versão2/3 de metadata em cópia privada da extensão real. Nenhuma API GNOME fake. Nenhuma credencial/mídia/conexão pessoal.
Isolamento: runtime/config/data/cache/state privados; custombus só permite autoativar serviço nativo org.gnome.Shell.Extensions via servicemetadata em lab (nenhuma outra service directory). DISPLAY externo hospeda janela nested; nenhum logout/restart/settings da sessão pessoal. Processes próprias encerradas pelo trap.

Asserts reais:
- GetInfo detecta versão2/inativa; UserExtensionsEnabled=true/ShellVersion46.0 via API.
- estado=habilitar readonly por contents+mtime dos files, settings e monitor de EnableExtension.
- instalar chama EnableExtension uma vez somente UUID niko-ilha@local; estado fica ativa.
- consulta ativa readonly sem EnableExtension adicional.
- fonte privada metadata3 atualizada; estado=instalar antes sem trocar destino.
- instalar troca destino3 atomicamente e preserva backup2; GNOME conserva cacheinfo2; helper retorna nova_sessao sem reiniciar/logoff.
- monitor capturou duas chamadas externas total somente UUID esperado (habilitação inicial e atualização).
- logs sem stack_position/has_last_sent_configuration/Gtk-CRITICAL/JS ERROR/TypeError/Segmentation fault.

Comandos adicionais: bash -n linux/gnome/native-integracao/run.sh PASS; git diff --check PASS.
Descobertas anteriores: nested precisa DISPLAY externo; serviço Extensions separado autoencerra idle e requer ativação permitida específica; ativá-lo antes Shell startup produz ShellVersion null/JS ERROR, runner aguarda startup completo. Falhas intermediárias de contador eram encaminhamento interno API->Shell e sinais de monitor startup; filtro final conta somente chamadas externas e seus argumentos.

Limitações: UI Tauri e pacote instalado não exercitados; ciclo GTK ilha/foco antigo tem questão Mutter baseline separada. Validação manual de clique e confirmação no aplicativo instalado continua pendente. Sem evidência Windows nativa neste agente.

## Revalidação após revisão de produção
Comando: linux/gnome/native-integracao/run.sh.
Resultado: EXIT0, 1 teste passou/0 falharam, critical gate PASS.
Evidência final atual: /tmp/niko-native-integracao.mIhQTB/{revision.sha256,info-before,enable-calls.log,test.log,shell.log,result}.
Helper integrado SHA256: 4a1b4cc6472e4df1b4fe84631e523a096ed1d8f5ec1feb5189d6f9278fee96e2; hash corrente conferido idêntico ao snapshot após execução. Extensão SHA256 permanece b2f5a3b14fefe4023daab92f3e8a281eb1abeaf419ba00881448a42c07024f29.
Casos adicionais NATIVOS: fonte JS alterada comentário mantendo versão2; instalar preserva código/cache antigo da sessão e retorna nova_sessao; niko-pendente.json contém GetId + GetNameOwner reais; consulta na mesma sessão permanece nova_sessao, sem write/EnableExtension, snapshot incluindo arquivo marcador e mtime; metadata3 subsequente atomicamente instalada, dois backups2; monitor três chamadas externas todas exclusivamente niko-ilha@local. Nenhum logout/reinício da sessão pessoal, nenhum GTKfake/Niko binário real.
Não cobre reinício do compositor ou troca owner por si; agente de contratos cobre serviço simulado, manual instalada continua separada.

## Última revisão: classificação de capacidade ausente
Comando inalterado: linux/gnome/native-integracao/run.sh.
EXIT0, 1 teste passou/0 falharam, critical gate PASS.
Evidência atual: /tmp/niko-native-integracao.SoNW6r/{revision.sha256,info-before,enable-calls.log,test.log,shell.log,result}.
Helper SHA256 5522e73831ff9d2ee8b40f9065c1cd87791fec0bb39d3e99e24fd6541e4df1f3; conferido idêntico à fonte integrada após rodada. Mesmos casos nativos de ativação, readonly, cache/update mesmaversão marker e backup2/metadata3 passaram. Não houve edição dos arquivos de teste nesta rodada. A classificação de capacidades ausentes permanece coberta separadamente pelos contratos privados simulados.
