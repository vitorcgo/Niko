<div align="center">

<img src="src-tauri/icons/128x128@2x.png" alt="Logo do Niko" width="112" />

# Niko

**Seu sistema de vida para Windows.**

Rotina, estudos, finanças, metas e os serviços que você acompanha, reunidos em um só lugar e cuidados por um time de agentes com personalidade própria.

![Windows 10 e 11](https://img.shields.io/badge/Windows-10%20%7C%2011-0b0d10?style=flat-square)
![Versão](https://img.shields.io/badge/versão-0.2.1-0b0d10?style=flat-square)
![Licença](https://img.shields.io/badge/licença-proprietária-b42318?style=flat-square)

<br />

<a href="midia/comercial.mp4">
  <img src="midia/capa-comercial.png" alt="Assistir ao comercial do Niko" width="760" />
</a>

<sub>Clique na imagem para assistir ao comercial.</sub>

</div>

---

## Sobre

O Niko é um aplicativo desktop que fica junto do Windows, e não dentro de uma aba do navegador. Ele aparece em três camadas:

| Camada | Onde fica | Para que serve |
| ------ | --------- | -------------- |
| **Ilha** | Topo da tela | Mídia tocando, pomodoro, tarefas do dia, captura rápida e avisos do time |
| **Dock** | Base da tela | Abre o Niko e mostra os apps abertos, com prévia das janelas ao passar o mouse |
| **Sistema** | Janela própria | Todas as áreas do app: início, chat, finanças, estudos, metas, calendário e configurações |

Três princípios guiam o projeto:

- **Funciona sem IA.** Toda função principal tem um caminho próprio. A IA é uma camada opcional que melhora o que já funciona.
- **Você escolhe o provedor.** Cada pessoa conecta o provedor e o modelo que quiser, com a própria chave, ou usa um modelo local.
- **Seus dados ficam com você.** Tudo é guardado no seu computador. As chaves ficam só no Gerenciador de Credenciais do Windows. Não existe conta do Niko nem servidor do Niko.

## Funcionalidades

### Ilha

Uma barra discreta no topo da tela, com três estados: escondida, compacta e expandida. As abas são configuráveis:

- **Calendário:** a hora, o que tem marcado hoje e o mês, com uma marca nos dias com compromisso. Um clique no dia abre o calendário completo.
- **Hoje:** tarefas do dia, com entrada em linguagem natural ("ligar pro banco 15h").
- **Capturar:** tarefa, gasto, link, nota ou lembrete em poucos segundos.
- **Mídia:** o que está tocando no Windows, com capa e controles.
- **Foco:** pomodoro com etapas de foco e pausa.
- **Hábitos e Agenda:** marcação rápida e próximos compromissos.
- **Chat:** conversa rápida com o time, com anexos.
- **Conexões:** números e últimas atividades de cada serviço, como cobranças do Stripe, Actions do GitHub, e-mails do Resend e tráfego do Cloudflare.
- **Avisos:** os alertas do time.

Na área de trabalho, a ilha ganha uma **aba de cada lado**, ligadas por uma faixa fina no topo. Com um app na frente, fica só a ilha.

- **Esquerda:** personalização (tema, cor de destaque, cor e opacidade da ilha e do dock, tamanho e repouso da ilha), o Iniciar do Windows e as tarefas do dia.
- **Direita:** os apps em segundo plano (os ícones da bandeja do Windows), Wi-Fi, volume, bateria e um painel de controles rápidos, com Wi-Fi e Bluetooth, não perturbe, mudo, microfone, captura de tela, teclado virtual, modo escuro, volume de cada app, brilho, mídia e energia.

Modos **fixo**, **esconder** e **inteligente**. Durante jogos, vídeos em tela cheia e apresentações, a ilha e o dock somem por completo. O **modo privacidade** esconde valores e textos sensíveis quando você compartilha a tela.

### Dock

Substitui a barra de tarefas do Windows com a logo do Niko e os apps abertos, agrupados por programa. Ao passar o mouse, mostra uma prévia ao vivo de cada janela, de onde dá para focar ou fechar. Também tem os modos fixo, esconder e inteligente.

### Sistema

| Área | O que faz |
| ---- | --------- |
| **Início** | Painel do dia com blocos configuráveis: time, tarefas, foco, finanças, revisões e conquistas |
| **Chat** | Conversa com os agentes, com comandos que funcionam mesmo sem IA |
| **Escritório** | O time trabalhando em um escritório 3D |
| **Journal** | Tarefas, hábitos, humor, notas e calendário do dia, com desfazer e refazer |
| **Estudos** | Matérias com páginas, quadro, datas de prova, links e revisão espaçada |
| **Finanças** | Contas, cartões, transações, orçamento, recorrentes, metas de economia, divisão de contas, lista de compras e relatórios |
| **Metas** | Pilares de vida, metas medidas por hábitos, horas de estudo, economia ou tarefas, e quadro de visão |
| **Calendário** | Tudo que tem data no Niko, nas vistas de mês, semana e agenda, com eventos e lembretes recorrentes |
| **Conexões** | Stripe, GitHub, Vercel, Resend, Notion, Cal.com, n8n, Gmail, Supabase e Cloudflare, cada um com janela própria |
| **Provedores de IA** | Escolha do provedor e do modelo, com chave guardada no cofre do Windows |
| **Consumo de IA** | Uso e limites das ferramentas de IA que você usa |
| **Conquistas** | Marcos e mapa de calor da sua rotina |
| **Configurações** | Aparência, ilha, dock, sons, atalhos, privacidade, backup e dados |

### O time

| Agente | Cuida de |
| ------ | -------- |
| **Organizador** | Rotina, tarefas, hábitos e agenda |
| **Tutor** | Estudos, revisões e provas |
| **Operador** | Finanças e serviços conectados |
| **Java** | Código, repositórios e pull requests |

Cada agente tem oito estados visíveis (ocioso, ouvindo, pensando, escrevendo, sucesso, alerta, erro e dormindo) e reage ao que está acontecendo de verdade no app.

## Atalhos

| Atalho | Ação |
| ------ | ---- |
| `Ctrl` `Alt` `Espaço` | Captura rápida |
| `Ctrl` `Alt` `N` | Abrir ou esconder o sistema |
| `Ctrl` `Alt` `P` | Iniciar ou pausar o pomodoro |
| `Ctrl` `Alt` `M` | Tocar ou pausar a mídia |
| `Ctrl` `Alt` `H` | Modo privacidade |
| `Ctrl` `K` | Busca global e comandos |
| `Ctrl` `N` | Novo item na área atual |
| `Ctrl` `B` | Recolher ou expandir a barra lateral |
| `Ctrl` `1` a `Ctrl` `9` | Ir para as áreas da barra lateral |
| `Esc` | Fechar modal, painel ou ilha |

## Recursos do chat

O pomodoro, a lista de capacidades e o relatório semanal funcionam sem provedor de IA:

- `/pomodoro 25` inicia o foco, sem sobrescrever uma sessão existente.
- `/pomodoro pausar`, `/pomodoro continuar` e `/pomodoro encerrar` controlam a sessão atual. Encerrar registra somente os minutos utilizados e não inicia outra etapa.
- `/pomodoro status` consulta o estado e o tempo restante real.
- `/capacidades` lista as ferramentas cadastradas, respeitando as permissões e conexões atuais. Não comprova que o modelo escolhido aceita ferramentas.
- `/relatorio` calcula os últimos sete dias a partir dos registros locais. Não inclui finanças e não preenche dias sem registro.

Anexos de texto têm botões para resumir, explicar, criar perguntas e extrair texto. Extrair funciona localmente; as demais análises usam o provedor escolhido, com ferramentas de ação desativadas e sem enviar o contexto pessoal do Niko. O conteúdo enviado para análise é limitado a 45 mil caracteres. Imagens não usam esses botões e precisam de um modelo com visão; PDF e pesquisa web ainda não estão disponíveis.

Perguntas sobre Cloudflare e Supabase são encaminhadas ao Java. Menções explícitas continuam escolhendo o agente. Confirmações e resultados de ações vêm das ferramentas, sem anunciar um cartão pendente como salvo. As respostas do modelo são verificadas antes de aparecer, mas isso não elimina todos os possíveis erros de uma IA.

A ilha compacta destaca mídia somente enquanto o Windows informa reprodução ativa. Uma música pausada continua acessível na aba Mídia, sem ocupar automaticamente a compacta. Quando Mídia é escolhida para repouso, a compacta mostra o relógio enquanto não há reprodução.

## Tecnologias

| Camada | Tecnologia |
| ------ | ---------- |
| Desktop | Tauri 2 e Rust, com APIs nativas do Windows |
| Interface | React 19, TypeScript e Vite |
| Animações | Motion e Three.js |
| Estado | Zustand |
| Ponte local | Node, empacotado junto com o app |

## Como rodar

### Requisitos

- Windows 10 ou 11
- Node 22 ou mais novo e pnpm
- Rust estável, para a versão desktop
- WebView2, que já vem no Windows 11

### Interface no navegador

```powershell
pnpm install
pnpm dev
```

Abra o endereço que aparecer no terminal (por padrão `http://localhost:5420`). No navegador as conexões usam dados de demonstração e a IA fica desligada, porque as chaves só podem ficar no cofre do Windows.

### Versão desktop

```powershell
pnpm install
pnpm bridge:build
pnpm dev
```

Com o `pnpm dev` aberto, em outro terminal:

```powershell
pnpm tauri dev
```

### Outros comandos

```powershell
pnpm verify   # checagem de tipos em modo estrito
pnpm test        # todos os testes isolados, executados em sequência
pnpm build       # build da interface em dist/
pnpm chat:test # testes do chat com provedor falso, sem rede ou banco real
pnpm media:test # testes de mídia pausada e consultas fora de ordem
pnpm app         # gera o instalador do Windows
```

### Publicar uma nova versão

Informe a versão explicitamente, sem editar os arquivos à mão:

```powershell
pnpm release 0.1.2 "Descrição das novidades"
```

O comando sincroniza `package.json`, `src-tauri/tauri.conf.json`, a versão do pacote Niko em `src-tauri/Cargo.toml` e `src-tauri/Cargo.lock`, além do selo de versão deste README. Antes de escrever, valida os arquivos, recusa redução de versão e consulta o GitHub para impedir uma release duplicada. Em builds feitos a partir de uma tag no GitHub Actions, a tag precisa ser `v` seguida da mesma versão.

O instalador e a assinatura precisam existir com o nome esperado e ter sido gerados no build atual. Só depois é criado o `latest.json`. O comando não publica nada no GitHub. Envie o instalador e o manifesto gerados em `src-tauri/target/release/bundle/nsis`.

Use a mesma chave de atualização das versões anteriores. O script usa `TAURI_SIGNING_PRIVATE_KEY` ou a chave em `%USERPROFILE%\.tauri\niko-atualizacao.key`. Se ela tiver senha, configure `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` no terminal. Nunca publique a chave privada.

Comandos que não geram instalador:

```powershell
pnpm release:verify
pnpm release 0.1.2 --check
pnpm release:test
```

O primeiro confere se as quatro versões concordam. O segundo mostra uma prévia da sincronização, sem alterar arquivos nem consultar o GitHub. O terceiro executa os testes das proteções de release.

Para reconstruir deliberadamente uma versão já publicada, use `pnpm release 0.1.1 --rebuild "Notas da versão"`. Essa opção dispensa a consulta de duplicidade no GitHub, mas mantém as validações dos arquivos e do build. Não substitua uma release publicada usando esses arquivos.

## Estrutura

```text
src/
  windows/        área de trabalho, ilha, dock e janela do sistema
  features/        uma pasta por área do sistema
  components/    botões, campos, modais, editor e gráficos
  characters/     personagens do time e suas animações
  state/         stores de cada área
  bridge/          comunicação com o lado nativo
  services/       lembretes, pomodoro, recorrentes, orçamento e conquistas
  i18n/         todos os textos da interface
  utils/    datas, dinheiro, comandos e sanitização
server/         ponte local: banco, credenciais, mídia, janelas e conexões
src-tauri/        app desktop em Rust
scripts/          build da ponte, personagens e lançamento de versões
public/           personagens e sons
```

As convenções de código e as exceções de compatibilidade estão em [CODE_STYLE.md](CODE_STYLE.md).

## Licença

Copyright (c) 2026 [vitorcgo](https://github.com/vitorcgo). Todos os direitos reservados.

Este código está público apenas para consulta. **Não é código aberto.** É proibido usar o Niko para fins comerciais, vender, redistribuir, modificar, criar obras derivadas ou reaproveitar qualquer parte dele sem autorização por escrito do autor. Os termos completos estão em [LICENSE.md](LICENSE.md).
