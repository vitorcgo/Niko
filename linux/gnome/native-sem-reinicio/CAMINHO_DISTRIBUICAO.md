# Caminho para instalação e atualização sem nova sessão

Direção de distribuição aprovada pelo usuário em 06/10/2026: Niko pelo .deb e
primeira ativação da integração pelo canal GNOME. Publicação ainda não autorizada;
instalação/atualização sem reinício ainda não é garantia de produto.
Manter a ilha Tauri e a integração compositor GNOME existentes.

## Primeira instalação

A API pública GNOME46 testada não descobre extensão local copiada após startup.
`InstallRemoteExtension` faz algo diferente: baixa a extensão de
extensions.gnome.org, pede confirmação e cria/carrega o objeto no Shell em execução.
Não permite escolher um arquivo ZIP local nem URL alternativa pelo parâmetro UUID.
Portanto, trocar apenas o instalador .deb não fecha este requisito.

Caminho candidato: publicar uma extensão de entrada estável no canal GNOME e
oferecer a primeira ativação explícita por esse canal. Não usar unsafe-mode, Eval,
Looking Glass, alteração do Shell ou reinstalação da sessão como instalador.
Ainda faltam identidade oficial/URL, revisão, autorização de publicação e validação
real desse canal. Não assumir que a revisão aprovará um carregador de código externo.

## Atualizações

Protótipo comprovado: entrypoint e metadata estáveis; implementação em arquivo com
SHA256 no nome; manifesto trocado atomicamente; desabilitar/habilitar somente Niko.
URI nova evita reutilizar o módulo anterior. Conferir revisão efetivamente executada,
painel próprio, dono D-Bus e PID do mesmo compositor, rollback e import cancelado.

O helper de produção consulta owner e revisão da interface do runtime; valida
payloads e paths, instala manifesto transacional com rollback e usa o recurso
`niko-ilha-runtime@local` preparado no build Linux. O .deb preserva também o
legado. A verificação do pacote compara loader, metadata, manifesto e implementação
por SHA256 com a fonte atual. Isso não comprova primeira instalação pelo canal
GNOME nem autoriza publicação.
O protótipo de laboratório escreve marcadores; não distribuir esse mecanismo como
interface de produto. Alteração futura do próprio entrypoint estável também precisa
ser tratada: não garantir atualizações ilimitadas apenas por manter metadata igual.

## Migração do legado

O entrypoint antigo já importado não pode virar o carregador só sobrescrevendo
extension.js no mesmo caminho. Candidato: identidade nova para o carregador,
desabilitar a extensão legada antes de habilitar a nova e manter arquivos antigos
para reversão. Não ativar as duas simultaneamente (ambas alteram métodos do Shell).

O diagnóstico migration pré-instala ambos os diretórios ANTES do Shell iniciar,
ativa legado real com marcadores diagnósticos de painel/filtros, troca para novo, executa revisões B/C e reativa legado para
reversão. Ele testa ciclo/cache, não resolve como registrar identidade nova numa
sessão na qual ela não existia no startup. Essa parte depende da primeira instalação.

## Critério final

Instalação em sessão já aberta, atualização e migração usando o canal escolhido;
versão de código efetivamente carregada; Tauri abre/oculta/reabre; dados/configuração
preservados; mesmo PID/owner do Shell; nenhum logout, restart ou alteração global.
Pacote e interface devem distinguir arquivo instalado de implementação realmente ativa.

Fontes GNOME46 e regras de distribuição:

- https://github.com/GNOME/gnome-shell/blob/46.0/js/ui/extensionDownloader.js
- https://github.com/GNOME/gnome-shell/blob/46.0/js/ui/extensionSystem.js
- https://github.com/GNOME/gnome-shell/blob/46.0/js/ui/shellDBus.js
- https://gjs.guide/extensions/review-guidelines/review-guidelines.html

A revisão GNOME exige termos compatíveis com GPL; o repositório tem licença própria
em LICENSE.md. Não alterar licença nem publicar partes do projeto sem resolução
explícita pelos responsáveis. Nenhuma publicação, upload ou mensagem externa foi feita.

## Estado da meta

Escolha do canal respondida em 06/10/2026: seguir com extensions.gnome.org.
Trabalho retomado; permanecem validação completa, revisão/licença e publicação.
O mesmo limite foi confirmado nas rodadas clean, loader e migration: atualização
experimental não resolve descoberta inicial. A preferência solicitada é aceitar
primeira ativação por extensions.gnome.org ou manter distribuição apenas pelo pacote
local. Ausência de resposta não autoriza publicação nem mudança dessa arquitetura.
O helper e a preparação do pacote já estão integrados; publicação/licença e
primeira ativação pelo canal escolhido continuam pendentes. A geração e verificação
do .deb não equivalem à instalação na sessão pessoal nem concluem a meta.

Metadados do canal: extensions.gnome.org atribui o campo version. O helper não
exige igualdade textual desse JSON; exige UUID e suporte GNOME46 compatíveis, e
código idêntico do bootstrap. Não permite trocar o bootstrap já importado apenas
sobrescrevendo arquivo. A aceitação do carregador pelo canal continua incerta.

Em 06/10/2026, o usuário confirmou que ainda não possui autorização do titular
para publicar a extensão com licença compatível. Prosseguir somente nas validações
locais; não alterar LICENSE.md, enviar código ao canal ou prometer instalação
inicial sem nova sessão antes de resolver essa dependência externa.
