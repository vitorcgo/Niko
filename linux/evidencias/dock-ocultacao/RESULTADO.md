# Ocultação do dock — 2026-10-07

Usuário informou melhora no desempenho, mas dock permanece sobre ChatGPT. Estado do carregador consultado sem listar janelas pessoais: State active, LastError vazio. Modo escolhido pelo usuário solicitado e ainda sem resposta; modo Fixo permanece sempre visível por definição.

Defeito confirmado no código do modo Inteligente: cobre somente quando janela está totalmente maximizada. Corrigido para interseção geométrica da janela em foco com região real do dock na borda inferior do monitor principal. Janelas grandes/encaixadas sem maximização também ocultam. Política de janela própria do Niko preservada, Windows preservado.

Contratos passaram incluindo janela parcial que cruza a borda e janela acima da borda que não cobre. GNOME46 headless/Tauri/WebKit real privado passou duas vezes: janela maximizada e janela grande não maximizada; dock oculto não intercepta clique, reaparece ao apontar borda; miniaturas, ações, reserva e fullscreen passaram. HOME/XDG/bancos/D-Bus/rede privados; nenhuma janela pessoal usada para testes. Pacote checker passou, SHA25670019cb9b68458619c3f3a01c19c6813a666de40faa23208798c9dfe5c7a2ff7.

CPU privada em renderização por software segue alta durante amostra de inicialização; não comprova desempenho pessoal ou estabilidade. Modos e funcionalidades da portabilidade ainda precisam validações restantes.

Instalação autorizada dpkg exit0. Aplicação na sessão pessoal pelo carregador: `instalar` → `ativa`; State active, Generation3, LastError vazio, revision implementation-93aa6332c462baac7f9a9ed23276bfb8ed6d5dda4de3e021ba24b8e321abc408.js. Sem logout/reinício do GNOME. Confirmação visual do modo escolhido pelo usuário ainda pendente.
