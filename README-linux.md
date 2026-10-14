<div align="center">

<img src="src-tauri/icons/128x128@2x.png" alt="Logo do Niko" width="112" />

# Niko no Linux

**Seu sistema de vida, agora também no Linux.**

Adaptação do Niko para Linux: a ilha, o dock e a janela do sistema rodando sobre o mesmo código, com as partes exclusivas do Windows trocadas por equivalentes do Linux.

![Linux](https://img.shields.io/badge/Fedora%20%7C%20Ubuntu-GNOME-0b0d10?style=flat-square)
![Versão](https://img.shields.io/badge/versão-0.2.3-0b0d10?style=flat-square)
![Licença](https://img.shields.io/badge/licença-proprietária-b42318?style=flat-square)

</div>

---

Este documento descreve a adaptação para Linux, que começou no código da versão 0.2.2 e entrou no app a partir da 0.2.3. O [README](README.md) continua sendo a referência do app. O app foi testado em Fedora com GNOME em Wayland. Para Ubuntu, os pacotes foram conferidos no Ubuntu 24.04, mas o app ainda não foi executado nele. Outras distribuições e ambientes podem precisar de ajustes.

## Instalar

Baixe o pacote na [página de releases](https://github.com/vitorcgo/niko/releases/latest). O Node já vem dentro do pacote.

```bash
sudo apt install ./Niko_*_amd64.deb        # Ubuntu e Debian
sudo dnf install ./Niko-*.x86_64.rpm       # Fedora
chmod +x Niko_*_amd64.AppImage && ./Niko_*_amd64.AppImage   # outras distribuições
```

Depois instale as ferramentas da tabela abaixo que quiser usar. Sem elas o Niko abre, mas o recurso correspondente fica indisponível. No Linux o app avisa quando sai versão nova, mas não se atualiza sozinho: baixe o pacote novo e instale por cima.

## O que foi feito

O Windows continua funcionando como antes. Tudo o que depende do sistema fica numa pasta `plataforma`, com uma implementação para cada sistema e as mesmas funções nas duas. O resto do app chama só a `plataforma` e nunca fala direto com o Windows ou com o Linux. No Rust, o compilador escolhe o arquivo certo. Na ponte, o tipo `Plataforma` obriga as duas implementações a terem as mesmas funções com o mesmo formato de resposta, então o `pnpm verificar` acusa quando um lado fica para trás.

| Recurso | Como funciona no Linux | Fedora | Ubuntu |
| ------- | ---------------------- | ------ | ------ |
| **Credenciais e chaves de IA** | Chaveiro do sistema (Secret Service) | `libsecret` | `libsecret-tools` |
| **Mídia tocando** | MPRIS, com capa, controles e progresso | `playerctl` | `playerctl` |
| **Volume geral e por app** | WirePlumber e PulseAudio/PipeWire | `wireplumber`, `pulseaudio-utils` | `wireplumber`, `pulseaudio-utils` |
| **Wi-Fi, redes e Bluetooth** | NetworkManager e BlueZ | `NetworkManager`, `bluez` | `network-manager`, `bluez` |
| **Bateria e brilho** | `/sys` e `logind` | já vem no sistema | já vem no sistema |
| **Tema escuro** | `gsettings` (GNOME) | `glib2` | `libglib2.0-bin` |
| **Energia** | `loginctl` e `systemctl` | já vem no sistema | já vem no sistema |
| **OCR de anexos** | Tesseract, com o idioma da sessão | `tesseract`, `tesseract-langpack-por` | `tesseract-ocr`, `tesseract-ocr-por` |
| **Janelas abertas no dock** | Extensão Window Calls; sem ela, `wmctrl` (só X11 e XWayland) | extensão, `wmctrl`, `xdotool`, `xorg-x11-utils` | extensão, `wmctrl`, `xdotool`, `x11-utils` |
| **Busca e abertura de apps** | Arquivos `.desktop` e `gio launch` | já vem no sistema | já vem no sistema |
| **Atalhos do sistema na lupa** | Configurações do GNOME (ou do KDE), monitor do sistema, terminal e arquivos | já vem no sistema | já vem no sistema |
| **Trazer o terminal de uma sessão de código** | `ss` para achar o processo e a lista de janelas para focar | já vem no sistema | já vem no sistema |
| **Mostrar download na pasta** | Gerenciador de arquivos pelo D-Bus (`FileManager1`), com o arquivo destacado | já vem no sistema | já vem no sistema |
| **Captura de tela e teclado virtual** | `gnome-screenshot` (ou Spectacle, Flameshot) e `onboard` | `gnome-screenshot` | `gnome-screenshot`, `onboard` |
| **Abrir links, pastas e VS Code** | `xdg-open` | já vem no sistema | `xdg-utils` |
| **Tempo ocioso** | Monitor de inatividade do GNOME | já vem no sistema | já vem no sistema |
| **Ganchos das ferramentas de código** | Mesmos ganchos HTTP, com `curl` em vez de `curl.exe` | `curl` | `curl` |

A pasta de dados do app fica em `~/.local/share/com.niko.desktop`. No Linux o Niko força o backend X11 (`GDK_BACKEND=x11`), porque posicionar janelas por coordenada e ler o cursor global não funciona em Wayland puro.

## O que muda ou não existe

- O dock **não reserva espaço** na tela nem esconde a barra do sistema.
- Sem prévias ao vivo das janelas e sem detecção de tela cheia: o dock fica sempre visível. As opções de esconder em tela cheia e por app ficam ocultas nos Ajustes.
- A ilha aberta não recolhe ao clicar fora dela. Ela fecha pelo Esc, pelo botão ou pelo tempo de fechamento.
- O dock não sabe em qual monitor cada janela está, então todos os docks mostram todas as janelas.
- A bandeja de apps em segundo plano do Windows não existe; os ícones ficam na barra do GNOME (extensão AppIndicator).
- O botão **Iniciar** abre e fecha a visão geral do GNOME.
- Não há "abrir como administrador".
- Atalhos globais estão sujeitos às restrições do Wayland.
- Sem atualização automática: o app avisa da versão nova e o pacote é baixado à mão.
- Os pacotes da release saem do GitHub Actions (`.github/workflows/pacotes-linux.yml`), num Ubuntu 22.04, para abrirem também em sistemas mais antigos. O `pnpm lancar` continua gerando só os instaladores do Windows.
- Sem a extensão Window Calls, apps nativos de Wayland não aparecem no dock.

## Como rodar

### Requisitos

- Fedora ou Ubuntu com GNOME (testado em Wayland)
- Node 22.13 ou mais novo e pnpm
- Rust estável recente, via [rustup](https://rustup.rs)
- Bibliotecas de build do Tauri e as ferramentas da tabela acima

#### Fedora

```bash
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file libxdo-devel \
  libappindicator-gtk3-devel librsvg2-devel libsecret
sudo dnf group install "c-development"

sudo dnf install playerctl tesseract tesseract-langpack-por pulseaudio-utils \
  gnome-screenshot wmctrl xdotool xorg-x11-utils
```

#### Ubuntu

```bash
sudo apt update
sudo apt install -y build-essential curl wget file libwebkit2gtk-4.1-dev libxdo-dev \
  libssl-dev libayatana-appindicator3-dev librsvg2-dev libsecret-tools

sudo apt install -y playerctl tesseract-ocr tesseract-ocr-por pulseaudio-utils wireplumber \
  gnome-screenshot onboard wmctrl xdotool x11-utils network-manager bluez
```

O Node do repositório do Ubuntu é antigo. Instale o 22 e ative o pnpm:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable
```

O volume geral usa o `wpctl`, que exige PipeWire. Ele é o padrão a partir do Ubuntu 22.10; no 22.04 o volume geral não funciona sem trocar o servidor de áudio.

#### Rust (as duas)

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Para a lista completa de janelas no dock, instale a extensão **Window Calls** (`window-calls@domandoman.xyz`) pelo Extension Manager (no Ubuntu: `sudo apt install gnome-shell-extension-manager`) e saia da sessão e entre de novo.

### Versão desktop

```bash
pnpm install
pnpm ponte:build
pnpm dev
```

Com o `pnpm dev` aberto, em outro terminal:

```bash
pnpm tauri dev
```

O Niko aceita uma só instância. Para reiniciar o app, rode `pkill -x niko` antes do `pnpm tauri dev`.

### Gerar o pacote

```bash
pnpm tauri build --bundles deb                     # Ubuntu e Debian
pnpm tauri build --bundles rpm                     # Fedora
NO_STRIP=true pnpm tauri build --bundles appimage  # qualquer uma
```

O build copia o Node que estiver rodando para dentro do pacote (`src-tauri/recursos/node`), como no Windows. Use o Node 22 ou mais novo. O pacote só abre em sistemas com glibc igual ou mais nova que a da máquina que o gerou, por isso a release é gerada no Ubuntu 22.04.

Para instalar:

```bash
sudo apt install ./src-tauri/target/release/bundle/deb/*.deb   # Ubuntu
sudo dnf install ./src-tauri/target/release/bundle/rpm/*.rpm   # Fedora
```

As opções de pacote do Linux ficam em `src-tauri/tauri.linux.conf.json`, que o Tauri mescla sobre o `tauri.conf.json` só no Linux. Sem `--bundles`, o `pnpm tauri build` gera os três pacotes.

### Variáveis de ambiente

| Variável | Para que serve |
| -------- | -------------- |
| `GDK_BACKEND` | O Niko define `x11` sozinho; defina outro valor para sobrescrever |
| `WEBKIT_DISABLE_DMABUF_RENDERER=1` | Contorna janela em branco ou preta em algumas placas de vídeo (por exemplo NVIDIA) |
| `NO_STRIP=true` | Evita falha do empacotador do AppImage |
| `XDG_DATA_HOME` | Muda a pasta de dados (padrão `~/.local/share`) |

```bash
WEBKIT_DISABLE_DMABUF_RENDERER=1 pnpm tauri dev
```

### Outros comandos

```bash
pnpm verificar   # checagem de tipos em modo estrito
pnpm test        # testes isolados, em sequência
```

## Estrutura

```text
servidor/
  plataforma/
    tipos.ts          o contrato: tudo o que cada sistema precisa oferecer
    index.ts          escolhe a implementação do sistema em que a ponte está rodando
    windows/          PowerShell, Gerenciador de Credenciais, netsh, explorer
    linux/            NetworkManager, PipeWire, MPRIS, Secret Service, .desktop, xdg-open
  sistema.ts, controleRapido.ts, janelas.ts, midia.ts, ocr.ts, segredos.ts
                      validação e cache, iguais para os dois sistemas
src-tauri/
  tauri.linux.conf.json   pacotes deb, rpm e AppImage, com o Node embutido
  src/plataforma/
    mod.rs            escolhe windows/ ou linux/ na compilação
    windows/          barra de tarefas, janela da frente, miniaturas, teclado e foco
    linux/            as mesmas funções, com o equivalente do Linux ou sem efeito
.github/workflows/verificar.yml
                      tipos, testes, Clippy e testes do Rust no Windows e no Ubuntu
.github/workflows/pacotes-linux.yml
                      gera os pacotes do Linux e anexa na release publicada
```

## Para quem for mexer no código

- Nada fora de `plataforma` fala direto com o sistema. Precisa de algo novo do Windows ou do Linux? Acrescente no contrato (`tipos.ts` na ponte, as funções de `plataforma/windows` e `plataforma/linux` no Rust) e implemente nos dois lados.
- No `Cargo.toml`, o crate `windows` fica só em `[target.'cfg(windows)'.dependencies]` e só é usado dentro de `src/plataforma/windows`.
- No Linux, `set_ignore_cursor_events` falha em janela escondida. Use `plataforma::ignorar_cursor`.
- Imports relativos em `servidor/` terminam em `.ts`. Um teste confere isso, porque o `tsc` aceita sem a extensão e o Node não.
- Os textos da interface que citam o sistema usam `SISTEMA`, `COFRE` e `OCR` em `src/textos/textos.ts`, que mudam conforme o `NO_LINUX` de `src/desktop/plataforma.ts`.
- O dock só filtra apps por monitor quando o sistema informa o monitor de cada janela (`Dock.tsx`). No Linux a lista aparece inteira.

## Licença

Copyright (c) 2026 [vitorcgo](https://github.com/vitorcgo). Todos os direitos reservados.

O código é público apenas para consulta e **não é código aberto**. Esta adaptação não altera a licença: modificar, redistribuir ou publicar qualquer parte depende de autorização por escrito do autor. Os termos completos estão em [LICENSE.md](LICENSE.md).