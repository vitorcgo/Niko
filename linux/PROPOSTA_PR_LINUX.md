# Título proposto

Adicionar suporte experimental GNOME 46/Wayland à ilha, dock e serviços do Niko

# Descrição pronta para revisão local

O Linux não tinha a janela do dock nem as operações de janelas que dependiam de user32/
PowerShell. Este conjunto reutiliza o frontend Tauri/WebKit e integra ilha/dock ao GNOME 46:
ícones, miniaturas, foco/minimização/fechamento, IDs com geração, reserva e modos fixo,
inteligente por sobreposição geométrica e esconder. Um cliente GJS persistente compartilha
consultas e encerra quando ocioso, evitando um novo processo a cada atualização.
Recarga adota janelas existentes sem ativá-las e reaplica a reserva por geração;
saídas tardias do cliente antigo não interrompem o cliente novo.

Os controles antes exclusivos do Windows usam APIs nativas UPower, SettingsDaemon,
NetworkManager, BlueZ, logind, ScreenSaver e StatusNotifierItem, com áudio wpctl/pw-dump.
O painel existente fica acessível em Configurações → Sistema no Linux. OCR usa Tesseract
por/eng com validação de raster e arquivo temporário privado. O OAuth Gmail existente abre
o navegador via gio preservando PKCE/state/loopback. Consumo reutiliza a leitura existente,
com agendamento e alertas opt-in habilitados no Linux e caminhos de sessão corretos.

Inclui o trabalho local anterior de base Tauri/ponte, persistência, atalhos, Secret Service,
MPRIS, pacote/autostart e carregador versionado com rollback/journal/recuperação explícita.
Os ramos Windows foram preservados; execução Windows não validada nesta máquina.

## Validação e limites

Evidências por revisão em `linux/evidencias/MATRIZ_ATUAL.md`; etapa atual em
`linux/evidencias/finalizacao-gnome46/RESULTADO.md`. Suíte completa: 116 passaram,
0 falhas, 2 Windows pulados (118 testes). OCR instalado passou na suíte;
PipeWire real com dispositivos virtuais passou. Controles usam transporte Gio/D-Bus real
com serviços fictícios; OAuth usa navegador fictício e Google simulado; consumo usa logs
fictícios/fetch simulado. Sem testes sobre dados pessoais ou credenciais reais.
Tauri/WebKit real em GNOME privado valida interface e operações do dock; HOME/XDG,
banco, barramentos e rede isolados. Pacote instalado e carregador atualizado na sessão pessoal sem logout; CPU/memória
e hardware medidos por leitura estrita. Recarga com ilha/dock abertos passou nos três
modos privados, sem roubar foco. Usuário confirmou posteriormente Chat, conexão Gmail e funcionamento geral no uso pessoal; relato manual distinto dos testes automatizados.
Os resultados não comprovam operações físicas de rádio/energia, estabilidade prolongada ou instalação limpa. Detalhes e comandos estão nas evidências.

Somente GNOME 46/Wayland. Miniaturas não disponíveis quando minimizadas/fora do workspace.
Brilho depende do hardware; teclado virtual deve estar habilitado no GNOME. Novas redes
WEP/enterprise recusadas, perfis salvos delegados ao NetworkManager. Bandeja exige watcher.
A confirmação pessoal não comprova paridade exaustiva de cada fluxo Windows. Histórico stack_position
intermitente, falha de comunicação de foco observada em uma rodada e MSDK do sistema permanecem abertos; distribuição automática é separada.
Pacote declara dependências Tesseract/idiomas, instaladas e testadas no computador pessoal.
Sem declaração de estabilidade prolongada ou paridade exaustiva Windows.
Resumo das alterações e motivos: [CONTRIBUTION_LINUX.md](../CONTRIBUTION_LINUX.md).

## Condição para envio

Descrição local; nenhum PR aberto. LICENSE.md permanece reservando direitos ao titular
vitorcgo. Falta autorização escrita desse titular para adaptar e enviar/publicar o código
sob a licença atual; a intenção do usuário de manter a autoria não comprova essa permissão.
Não fazer push, publicação, fork público nem mudança de licença enquanto pendente.
Excluir da contribuição pacotes, HOME/bancos de laboratório, segredos e temporários;
anexar apenas evidências sintéticas selecionadas e revisão dos arquivos locais acumulados.
