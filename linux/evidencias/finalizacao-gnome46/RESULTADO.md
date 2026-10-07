# Instalação e validação da rodada conjunta — 07/10/2026

Prevalece sobre a etapa pendencias-gnome46 para instalação, OCR, hardware, foco e desempenho.

## Correção adicional validada no laboratório e instalada

Usuário informou dock ausente; imagem pessoal fornecida mostrou dock/ilha soltos. A imagem não foi copiada para as evidências. Causa confirmada no código: enable só tratava novos sinais map. Ao trocar a implementação com o Niko aberto, disable restaurava as posições originais e a nova implementação não adotava essas janelas. Corrigido enable para adotar as janelas Niko já mapeadas, sem ativação/restauração de foco. Estado do dock inclui geração, e o frontend reaplica a reserva quando a geração muda. Gates Tauri/WebKit reais passaram nos três modos após recarga, com ilha/dock existentes: âncoras recuperadas, foco preservado e reserva reaplicada. Inclui teste de ator temporariamente não mapeado. Pacote corrigido instalado; Niko encerrado pelo menu Sair e reaberto normalmente. Carregador ativo, erro vazio e revisão igual ao código atual. Confirmação visual pessoal ainda pendente; os gates privados não a substituem.

## Resultado atual

- Usuário instalou tesseract-ocr, eng/por; dpkg-query e list-langs confirmaram as versões Ubuntu 24.04. OCR com /usr/bin/tesseract e bibliotecas do sistema reconheceu NIKO/OCR/123 em PNG sintético, HOME/XDG/D-Bus privados. Não usa mais o motor extraído para esta evidência.
- .deb declara OCR/idiomas e demais dependências. `apt install ./Niko_0.2.0_amd64.deb` resolve dependências; dpkg isolado não resolve. Reinstalação local via pkexec/apt-get exit0, somente Niko, sem remover pacotes ou atualizar o restante do sistema.
- Pacote SHA256 `4e479902b362a5f4c8020c390a95ad329dd92c9368852b6c49152b71f89b676f`. Executável/ponte/Node/manifesto conferidos; ponte instalada igual ao build. Niko anterior já estava encerrado; versão atual aberta por /usr/bin/niko.
- Carregador pessoal: instalar → ativa; State active, LastError vazio, Revision igual à implementação local 1bc74dbac8163dbd81630db0ac4f55db0e8ea45c010f9541d6d4b589b937f994. Sem logout/reinício GNOME, mudanças globais de configurações, testes de mídia/credenciais/rede/energia/dados pessoais ou reset.
- Suíte: 118 testes, 116 passaram, zero falhas, 2 Windows pulados. OCR instalado agora integra a suíte automaticamente. Cliente simulado testa comportamento real do coordenador, mas não equivale a execução GJS nativa.
- GNOME privado com software forçado desativado e dispositivo Intel i915 selecionado: fixo/inteligente/esconder passaram. Fixo incluiu 20 ciclos minimizar/focar com estado confirmado, fechar/stale ID, miniaturas/ícones, reserva, fullscreen, overview, captura/OSK e cleanup. Captura/OSK somente privados; nenhuma imagem pessoal/mídia salva. Inteligente inclui janela não maximizada sobreposta.

## Foco e falhas investigadas

Corrida concreta no coordenador: saída tardia/malformada de um GJS antigo podia encerrar o novo cliente. A saída agora é ignorada quando não pertence ao processo atual, como já ocorria no callback exit. Teste usa o coordenador compilado com processos fictícios e verifica que resposta/exit antigos não interrompem o cliente novo. Não replica autenticação GNOME.

Diagnóstico seguro de fase/domínio/código/timeout fica restrito ao laboratório validado, sem títulos, IDs de janela ou tokens. Ajuda a diferenciar timeout do erro genérico. Nenhuma ação é repetida automaticamente.

Falhas desta rodada no harness: reserva era conferida antes do pedido inicial do frontend; agora aguarda confirmação limitada. Contagem de todos os GJS confundia o cliente de janelas com consultas legítimas de controles de sistema; agora identifica especificamente o protocolo persistente. Após corrigir o harness, os gates passaram. Não atribuir essas falhas ao produto.

A falha histórica de foco com integracao_janelas_indisponivel não foi reproduzida nos gates finais com hardware e 20 ciclos. Não há evidência que permita atribuí-la com certeza à corrida encontrada. Esta rodada comprova os comportamentos testados e reforça o cliente; não comprova ausência de toda intermitência futura. Histórico stack_position/MSDK do sistema continua registrado.

## Hardware e desempenho

Leitura de sysfs confirmou Intel vendor8086/device4e55, driver i915, backlight e Bluetooth presentes; 2 CPUs lógicos visíveis e 15,4 GiB RAM. Sem SSID/IP/MAC/serial/hostname/perfil pessoal. Isso não valida operações físicas de volume/brilho/radio/suspensão; essas operações continuam testadas com serviços/dispositivos privados conforme a restrição do usuário.

CPU app/filhos por um núcleo, 30s após 20s de acomodação no GNOME privado: inteligente 18,4%, esconder 6,7%, fixo 6,1%; GNOME separado 2,1%, 2,5%, 1,9%. Fixo: PSS app481,1 MiB e GNOME229,0 MiB. Renderização não foi forçada a software; números não são baseline comparativo nem validam outras GPUs.

Processo instalado pessoal, leitura somente /proc: antes da correção 4,9% de um núcleo por 30,1s; PSS513,8 MiB. Após a correção e reabertura: 8,2% de um núcleo por 30,1s; PSS511,1 MiB (maquina-atual.json). Estados de UI diferentes; não inferir regressão ou ganho dessa comparação. Inclui Node/WebKit e filhos; PSS é memória proporcional ao compartilhar páginas, não mede memória GPU. Não consultar janelas, conteúdos, mídia, rede ou credenciais para esta medição. Resultado pontual; carga/estado de UI afetam os números. Não concluir estabilidade prolongada ou ganho percentual sem baseline equivalente.

## Reproduzir

```sh
src-tauri/recursos/node scripts/testar.mjs
src-tauri/recursos/node --test servidor/janelas-cliente-linux.test.mjs servidor/ocr-linux.test.mjs
NIKO_TAURI_HEADLESS=1 NIKO_TAURI_SOFTWARE=0 NIKO_TAURI_DOCK=1 NIKO_DOCK_MODO=fixo NIKO_CPU_SETTLE_SECONDS=20 NIKO_CPU_SAMPLE_SECONDS=30 NIKO_JANELAS_CICLOS=20 NIKO_CONTROLES_NATIVE=1 bash linux/gnome/native-tauri/run.sh
src-tauri/recursos/node linux/medir-processo-niko.mjs PID_DO_NIKO 30
```

`medir-processo-niko` aceita somente processo do /usr/bin/niko instalado; leitura estrita. Não copiar HOME/banco/env de processo/logs pessoais à contribuição. Evidências selecionadas são técnicas/sintéticas. Confirmação visual do usuário no uso pessoal é distinta dos gates privados.

## Limites do conjunto

GNOME46/Wayland exclusivo. Miniaturas minimizadas/fora do workspace indisponíveis; OSK requer habilitação já feita pelo usuário; brilho depende do hardware; SNI requer watcher. Novas redes WEP/enterprise recusadas. Não executar testes pessoais de energia/radio/mídia/credenciais para ampliar a alegação.

Esta rodada instala e valida os pontos solicitados; não declara paridade Windows de barra lateral/abas Chat e Claude, autenticação Google/provedores real, estabilidade completa ou distribuição/instalação limpa. Windows não executado. LICENSE.md inalterado; falta autorização escrita do titular para envio/publicação. Sem push, PR ou publicação.
