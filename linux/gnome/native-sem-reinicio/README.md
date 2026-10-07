# Investigação: integração sem reinício da sessão

Este diretório contém diagnóstico e protótipo isolados, não uma instalação ou
implementação de produção. Usa GNOME46 real, HOME/XDG/GSettings e D-Bus privados.
Não habilita unsafe-mode, não chama Eval para executar código no Shell, não usa
InstallRemoteExtension, não publica extensão e não modifica a sessão pessoal.

```bash
bash linux/gnome/native-sem-reinicio/run.sh clean
bash linux/gnome/native-sem-reinicio/run.sh loader
bash linux/gnome/native-sem-reinicio/run.sh migration
```

Requer sessão gráfica, GNOME/Mutter46, GJS/serviço Extensions, gdbus, Python3,
Node22/Vite locais. `NIKO_TEST_NODE` substitui caminho padrão do Node22. O DISPLAY
externo hospeda somente a janela nested; scripts não instalam dependências. Os
logs/result/cleanup ficam no diretório temporário impresso. Não está na suíte
headless. Cada rodada verifica o owner D-Bus/PID do compositor próprio.

`clean`: inicia Shell sem extensão; chama helper de produção, confirma arquivos
copiados mas GetExtensionInfo vazio, EnableExtension=false e nova_sessao. Confirma
ReloadExtension indisponível e Eval bloqueado. PASS significa limite reproduzido,
**não instalação inicial aprovada**.

`loader`: instala o protótipo ANTES de iniciar o Shell, apenas para estudar cache.
Mantém entrypoint e metadata idênticos; implementação de produção fica em arquivo
com SHA256 no nome, escolhido por manifesto JSON trocado atomicamente. Desabilita
somente a extensão Niko e habilita novamente. Importa URI diferente, verifica
hash/tipo de arquivo, executa nova implementação real e confirma posse do painel,
PID e owner do mesmo Shell. Testa duas revisões, rollback com marcador novo e
cancelamento durante import assíncrono. Não comprova instalação inicial depois do
startup, migração de entrypoint antigo, pacote, ilha Tauri ou atualização automática.
O carregador de laboratório não deve ser distribuído como solução pronta.

Limite arquitetural: GNOME46 não redescobre uma extensão local copiada após startup
pela API pública testada. A fonte oficial distingue a instalação pelo canal remoto,
que cria e carrega o objeto no Shell, da simples cópia local:

- https://github.com/GNOME/gnome-shell/blob/46.0/js/ui/shellDBus.js
- https://github.com/GNOME/gnome-shell/blob/46.0/js/ui/extensionSystem.js
- https://github.com/GNOME/gnome-shell/blob/46.0/js/ui/extensionDownloader.js

Próxima decisão necessária: canal de primeira instalação suportado (por exemplo,
extensão publicada e instalada via extensions.gnome.org). Esse caminho depende de
publicação/revisão e consentimento do usuário para instalação; não foi executado.
A cópia local atual não deve ser apresentada como instalação sem reinício.

`migration`: usa UUID experimental novo apenas no laboratório, desabilita extensão
legada real, ativa carregador, troca implementações e reativa legado para reversão.
Ambos os diretórios existem antes do startup; não comprova descoberta de UUID novo
após primeira instalação. Consulte [caminho de distribuição](CAMINHO_DISTRIBUICAO.md).

O runner mantém cliente D-Bus privado persistente para estudar ciclo da extensão:
o serviço oficial Extensions encerra quando clientes curtos saem e pode devolver
NoReply numa chamada em andamento. A falha anterior foi preservada. Isso não
valida robustez do helper de produção, que ainda usa subprocessos GJS curtos.

No cenário migration, o legado usa uma subclasse diagnóstica da implementação
real para publicar marcadores novos de painel/filtros após enable/disable. Isso
permite verificar reversão sem depender só de ACTIVE no GNOME. Esses marcadores
não fazem parte da extensão distribuída; arquivos da fixture permanecem intactos
entre instalação e reversão. O cliente persistente e compositor são aguardados e
seus grupos conferidos no cleanup final.

Regressão headless de perda do nome após ativação:
`node linux/gnome/runtime-owner-loss-linux.test.mjs` (fonte real, callback/import/payload simulados; inclui falha de cleanup).
Colisão nativa no startup: `NIKO_GNOME_COLLISION=1 bash linux/gnome/native-sem-reinicio/run.sh runtime-helper`.

Recuperação após interrupção: `NIKO_GNOME_CRASH=1 bash linux/gnome/native-sem-reinicio/run.sh runtime-helper`.
Encerra com SIGKILL apenas processos helper filhos exclusivos do laboratório,
antes/depois da troca de manifesto; valida consulta readonly, recusa writer vivo,
contexto/hash adulterados e restauração explícita. Não comprova durabilidade após
queda de energia nem autoriza reiniciar sessão pessoal.
