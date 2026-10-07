# Protótipo GNOME 46 — ilha do Niko

**Estado atual (06/10/2026):** usuário confirmou posição correta, exclusão de
Alt+Tab e botão desaparecendo ao sair do Niko e voltando ao abrir. Preservar as
guardas atuais de Meta.Window; houve crash histórico em revisão anterior.
Mídia MPRIS pertence à ponte, independente desta extensão; a rodada anterior de
controles tem confirmação histórica. A revisão atual, capa/foco e cofre precisam
de validação instalada. O teste GNOME canônico atual falha também no baseline sem
extensão; não declarar estabilidade com a variante diagnóstica show-only.
Ver [matriz atual](../evidencias/VALIDACAO.md) e CONTRIBUTION_LINUX.md.

Extensão experimental opcional, somente GNOME46. Requer o Niko experimental aberto,
ilha habilitada e o mesmo protocolo de ativação. Não lê banco ou credenciais.

O botão Niko no painel abre a ilha **somente por clique**. Sem hover. A ilha começa
oculta, sem moldura e com skip_taskbar solicitado ao GTK. Fechar/recolher/Escape
ocultam o cliente; os serviços continuam no AppIlha. O compositor ancora abaixo
do painel principal, acompanha tamanho e corrige tentativas de deslocamento.
Não resolve dock, mídia, conexões, reserva de espaço ou fullscreen completo.

A extensão chama ExecuteCallback no D-Bus da instância única já existente
(com.niko.desktop.SingleInstance), com --mostrar-ilha. NO_AUTO_START impede iniciar
serviço automaticamente. Nenhum subprocesso, caminho de executável ou pasta de dados
é necessário na extensão. O botão começa oculto e acompanha a posse desse nome
D-Bus: aparece ao abrir o Niko e desaparece ao sair, sem iniciar outro processo.
Ocultar só a ilha não remove o botão. Ao sair, timers pendentes são cancelados;
watcher é removido ao desabilitar e callbacks antigos são ignorados.
A interface espera até1s após resposta para identificar a ilha por aplicação+título.
Usar a instalação atual do .deb e o destino permanente padrão de dados. Não usar
/tmp para tarefas definitivas. O cache WebKit não foi mesclado na migração do banco.

```bash
node --test linux/gnome/extension.test.mjs servidor/ilha-linux.test.mjs
```

Testes controlam nome D-Bus/visibilidade, callbacks/timers, click-only, posição, fullscreen no destino,
respostas atrasadas e restauração. Não comprovam comportamento real no GNOME.

O .deb inclui metadata.json/extension.js em /usr/share/niko/gnome/niko-ilha@local.
Em Configurações → Ilha, habilite a ilha e use “Instalar ou ativar integração GNOME”.
Somente esse clique copia a extensão para a pasta do usuário e pede habilitação do
UUID niko-ilha@local. Cópias anteriores são preservadas em gnome-shell/niko-backups-extensao.
Consultar ou “Verificar novamente” não altera arquivos nem habilita extensões.
O aplicativo informa ausência do GNOME, incompatibilidade, bloqueio global e falhas.

GNOME46 mantém módulos JS em cache. Se a instalação/atualização exigir nova sessão,
o estado avisa para salvar o trabalho e sair/entrar quando for conveniente; nunca
encerra a sessão automaticamente. Ajustar aparência, abas ou configurações do Niko
não exige isso. Futuras alterações no código da extensão também podem exigir nova
sessão; disable/enable não recarrega esse código. Use “Verificar novamente” depois.

Desabilitar: gnome-extensions disable niko-ilha@local. Remove botão, timer e sinais;
restaura posição/monitor da janela acompanhada. A janela cliente continua
sem moldura/oculta por padrão nesta etapa; usar menu Mostrar ilha se extensão ausente.

Validar: não aparece ao iniciar nem pelo hover; clique abre expandida, estática,
sem moldura; fechar oculta; novo clique restaura. Conferir Alt+Tab/Visão Geral,
outros apps, foco, sincronia, troca de abas/dimensionamento e desabilitação.
O efeito de skip_taskbar e o bloqueio de movimento precisam evidência nativa.


## Validação em GNOME nested

O contrato de instalação/ativação/atualização com APIs GNOME reais possui runner
independente: `linux/gnome/native-integracao/run.sh`. Consulte seus
[requisitos e limites](native-integracao/README.md). Não substitui o teste de janela abaixo.

Com Vite ativo na porta5420 e nenhum Niko ativo, executar:

```bash
bash linux/gnome/testar-isolado.sh
```

O script cria configurações/backend keyfile e cópia da extensão em pasta única
/tmp/niko-gnome-lab.*, barramento D-Bus próprio e compositor Wayland nested.
Niko usa XDG_DATA_HOME exclusivo dentro do laboratório e remove APPDATA herdado.
D-Bus não tem diretórios de ativação automática, e cache/estado também ficam no
laboratório. Fechar a janela nested encerra seu
cliente pelo trap; logs do Shell/Niko ficam no laboratório para análise.
Não usa --replace nem altera habilitação da extensão na sessão principal.
Nested não é VM nem sandbox completo: usa o mesmo usuário e hardware; dados Niko
ficam em pasta temporária exclusiva. Consulte documentação GNOME.
Teste abrir/recolher/reabrir cinco vezes antes de considerar validação na sessão
principal. Se houver crash, a aprovação em Node não substitui falha nativa.


O script força GTK **Wayland somente no laboratório** e usa modo GNOME user para
não carregar extensões obrigatórias Ubuntu/DING. Ambiente da ferramenta tinha
GDK_BACKEND=x11; omitir essa sobrescrita não prova teste de cliente Wayland.
O arquivo bus-address dentro do laboratório permite consultas ao D-Bus privado,
sem confundir com o Shell principal. Não é um token da ponte.


O laboratório carrega também Ubuntu AppIndicators já instalada e exige o serviço
StatusNotifierWatcher antes de iniciar Niko, para evitar fallback GtkStatusIcon/X11.
NIKO_TEST_BINARY permite testar target/release/niko sem Vite. NIKO_SHELL_GDB aponta
opcionalmente para comandos de debugger em um teste diagnóstico; nesse modo o PID
supervisor é do GDB, e o encerramento do inferior precisa ser verificado.
Não medir desempenho sob debugger.

A extensão não chama make_above/unmake_above nem raise. Nesta revisão solicita
Main.activateWindow 250ms após abertura/mapeamento para trazer a ilha à frente do
aplicativo atual. Confere janela gerenciada e ator mapeado antes de ativar, fora do
sinal map; oculta/saída/disable cancelam a ativação pendente. Traz a ilha ao workspace
atual, preservando ancoragem/filtros. Cinco ciclos com janelas fictícias em GNOME46
nested passaram; foco no Niko/Brave instalado ainda aguarda nova sessão do usuário.
Outro aplicativo poderá cobri-la ao receber foco depois. Nos ciclos reais de release confirmados
pelo usuário, os críticos anteriores não reapareceram nos logs do laboratório.
Isso não comprova estabilidade geral nem substitui a validação da sessão principal.

Candidata GNOME46 para Alt+Tab/Visão Geral: filtros via InjectionManager excluem
somente appID+título exato da ilha. Também retiram ilha dos consumidores da lista
Shell.App.get_windows (por exemplo dock GNOME); principal permanece. Disable
restaura os três métodos. Teste Node passou; comportamento nativo ainda pendente.
Código precisa recarregar sessão GNOME antes de testar esta revisão.

## Atalho global na sessão Ubuntu

Ctrl+Alt+I foi registrado em Configurações do Ubuntu → Teclado → Atalhos
personalizados, nome “Mostrar ilha do Niko”, pelo mecanismo nativo GSettings.
Não precisa recarregar a extensão. Comando:

```bash
gdbus call --session --timeout 2 --dest com.niko.desktop.SingleInstance --object-path /com/niko/desktop/SingleInstance --method org.SingleInstance.DBus.ExecuteCallback "['niko', '--mostrar-ilha']" "''"
```

Requer Niko aberto; não inicia o aplicativo nem garante posicionamento sem extensão.
A ancoragem existente acompanha a janela exibida. Para remover, exclua somente
“Mostrar ilha do Niko” em Atalhos personalizados. Não substituir lista de outros
atalhos. Esta configuração é da sessão local, não instalada pelo .deb.

Na revisão com editor de atalho, Configurações → Ilha permite mudar a combinação
já registrada no Ubuntu e salvar. Disponíveis quatro pares de modificadores e
letras/números; não modifica os demais atalhos. Em instalação sem a entrada nativa
preparada, mostra indisponibilidade. Salvar confirma o valor armazenado; teste a
combinação com outro app em foco para conferir se não está reservada pelo sistema.

Ao usar o atalho direto com ilha já mapeada, GNOME pode emitir somente a notificação
“está pronta” em vez de foco. A revisão também escuta window-demands-attention e
window-marked-urgent exclusivamente para a ilha e usa a mesma ativação diferida.
Testes Node e cinco ciclos de atenção em compositor isolado passaram; atalho real
aguarda nova sessão para carregar a fonte. Nenhum outro app ganha foco por esse listener.
