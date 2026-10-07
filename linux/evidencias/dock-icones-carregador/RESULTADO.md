# Dock: ícones e carregador — 2026-10-07

Usuário confirmou dock funcionando, mas relatou ícones ausentes e lentidão. Consulta somente à versão D-Bus confirmou API GNOME46 ativa; carregador runtime desconhecido. Preparados arquivos do carregador em pasta local nova, a partir do pacote validado, com verificação do hash do payload e sem substituir o legado nem alterar settings. Primeira ativação permanece pendente; nenhuma promessa de hot reload de módulo ainda desconhecido pelo Shell.

Código: fonte da extensão expõe GIcon do Shell.App. Ponte resolve no tema Gtk3 nativo para PNG32, mantém cache limitado por identidade do ícone e fallback para inicial quando ausente. Leitura de lista/estado simultânea compartilha processo GJS; ações permanecem independentes. Medições do frontend agora consultam estado leve e limitam verificações a uma por dois segundos; não repetem lista/ícones a cada mutação do DOM. Windows preservado.

TypeScript e contratos da extensão/janelas passaram; build e execução gráfica em andamento. Ainda não declarar lentidão resolvida ou carregador ativo na sessão pessoal.

## Teste do pacote

Pacote `eb5856eba84f59150c026ca08f997972262947971f679a4da93a02a7c885f770` passou no checker e no GNOME headless privado/Tauri/WebKit real. Fixture com desktop entry e ícone utilities-terminal: PNG do ícone presente; consultas simultâneas compartilhadas; ação/foco/miniatura/input/reserva/fullscreen passaram.

Amostra de 3s da CPU dos processos vivos do Niko: 91,5% de um núcleo, incluindo inicialização, em renderização por software. Sem baseline equivalente e sem medir processos curtos já encerrados: não prova melhora e não equivale ao consumo da sessão pessoal. Lentidão ainda pendente de investigação específica.

Instalação local autorizada: dpkg exit0. Extensão local atualizada com backup pelo helper; código novo fica pendente da nova sessão. Carregador foi preparado, mas sua primeira ativação segue pendente. Nenhum logout automático nem alteração global.
