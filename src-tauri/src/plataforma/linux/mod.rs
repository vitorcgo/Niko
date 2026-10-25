mod atalhos_gnome;
pub mod barra;
pub mod janela_frente;
pub mod miniaturas;
mod x11;

pub use atalhos_gnome::atalhos_do_sistema;

// Sem compositor (X11 simples, máquina virtual, o teste do catálogo de AppImages) janela transparente
// vira retângulo preto: a ilha, o dock e o AssistiveTouch, que cobrem faixas enormes da tela sempre por
// cima, esconderiam a janela principal. Nesse caso o Niko abre só como janela comum.
pub fn sobrepostas_transparentes() -> bool {
    !x11::sem_compositor()
}

// No Linux a frente é lida por consulta (X11 ou extensão do GNOME); não há aviso equivalente aqui.
pub fn vigiar_frente(_app: &AppHandle) {}

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{LazyLock, Mutex};

use tauri::{AppHandle, WebviewWindow};
use tauri_plugin_global_shortcut::Shortcut;

pub use barra::RECT;

pub fn preparar_ambiente() {
    if std::env::var_os("GDK_BACKEND").is_none() {
        std::env::set_var("GDK_BACKEND", "x11");
    }
    // O desenho por DMABUF do WebKitGTK falha em várias placas (NVIDIA principalmente) e pelo XWayland:
    // a janela abre vazia e o terminal mostra "Failed to create GBM buffer". Quem instala o pacote não
    // lê o README, então o contorno vem ligado; WEBKIT_DISABLE_DMABUF_RENDERER=0 volta ao padrão.
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
    // Sem compositor (X11 simples, máquina virtual, o teste do catálogo de AppImages) a composição
    // acelerada do WebKitGTK também deixa a janela em branco. Com compositor ela fica ligada,
    // porque deixa as animações da ilha e do dock mais leves.
    if std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() && x11::sem_compositor() {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }
}

pub(crate) fn comando_do_sistema(programa: &str) -> Command {
    let mut comando = Command::new(programa);
    let Some(pasta) = std::env::var("APPDIR").ok().filter(|p| !p.is_empty() && std::env::var_os("APPIMAGE").is_some()) else {
        return comando;
    };
    for chave in ["APPDIR", "APPIMAGE", "ARGV0", "OWD"] {
        comando.env_remove(chave);
    }
    for (chave, valor) in std::env::vars_os() {
        let Some(texto) = valor.to_str() else {
            continue;
        };
        if !texto.contains(pasta.as_str()) {
            continue;
        }
        let partes: Vec<&str> = texto.split(':').filter(|parte| !parte.is_empty() && !parte.starts_with(pasta.as_str())).collect();
        if partes.is_empty() {
            comando.env_remove(&chave);
        } else {
            comando.env(&chave, partes.join(":"));
        }
    }
    comando
}

pub fn tempo_ocioso_ms() -> u64 {
    let Ok(saida) = comando_do_sistema("gdbus")
        .args(["call", "--session", "--dest", "org.gnome.Mutter.IdleMonitor", "--object-path", "/org/gnome/Mutter/IdleMonitor/Core", "--method", "org.gnome.Mutter.IdleMonitor.GetIdletime"])
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
    else {
        return 0;
    };
    let texto = String::from_utf8_lossy(&saida.stdout);
    let digitos: String = texto.split_whitespace().nth(1).unwrap_or("").chars().take_while(|c| c.is_ascii_digit()).collect();
    digitos.parse::<u64>().unwrap_or(0)
}

static ULTIMA_FRENTE: AtomicU32 = AtomicU32::new(0);

pub fn registrar_frente(_app: &AppHandle) {
    let Some(frente) = x11::janela_ativa() else {
        ULTIMA_FRENTE.store(0, Ordering::Relaxed);
        return;
    };
    if frente != ULTIMA_FRENTE.load(Ordering::Relaxed) && x11::pid_da_janela(frente) != Some(std::process::id()) {
        ULTIMA_FRENTE.store(frente, Ordering::Relaxed);
    }
}

pub fn agir_na_janela(_acao: &str, _id: isize) -> bool {
    false
}

pub fn devolver_foco() {
    let anterior = ULTIMA_FRENTE.load(Ordering::Relaxed);
    if anterior != 0 {
        x11::ativar(anterior);
    }
}

pub fn janela_em_foco(janela: &WebviewWindow) -> bool {
    janela.is_focused().unwrap_or(false)
}

pub fn digita_com_altgr(_atalho: &Shortcut) -> bool {
    false
}

pub fn abrir_no_sistema(endereco: &str) -> Result<(), String> {
    let mut filho = comando_do_sistema("xdg-open").arg(endereco).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|_| "falha_ao_abrir".to_string())?;
    std::thread::spawn(move || {
        let _ = filho.wait();
    });
    Ok(())
}

pub fn abrir_sistema_sem_esperar() -> bool {
    std::env::var("XDG_SESSION_TYPE").map_or(true, |s| !s.eq_ignore_ascii_case("wayland")) && x11::sem_compositor()
}

pub fn botao_do_mouse_pressionado() -> bool {
    x11::botao_pressionado()
}

pub const SOBREPOSTA_FOCAVEL_AO_CRIAR: bool = false;

// No GNOME em Wayland o Niko roda pelo XWayland, que só enxerga o cursor sobre janelas X11.
// Sobre apps nativos a posição global fica parada, então a janela não pode depender dela para
// voltar a receber o mouse: a área de entrada fica sempre igual às partes interativas.
static AREAS_DE_ENTRADA: LazyLock<Mutex<HashMap<String, Vec<[f64; 4]>>>> = LazyLock::new(|| Mutex::new(HashMap::new()));
const MARGEM_DA_AREA: f64 = 4.0;

pub fn definir_area_de_entrada(janela: &WebviewWindow, caixas: Vec<[f64; 4]>) {
    if let Ok(mut areas) = AREAS_DE_ENTRADA.lock() {
        areas.insert(janela.label().to_string(), caixas);
    }
    aplicar_area_de_entrada(janela);
}

fn aplicar_area_de_entrada(janela: &WebviewWindow) {
    let caixas = AREAS_DE_ENTRADA.lock().ok().and_then(|areas| areas.get(janela.label()).cloned()).unwrap_or_default();
    let alvo = janela.clone();
    let _ = janela.run_on_main_thread(move || {
        use gtk::cairo::{RectangleInt, Region};
        use gtk::prelude::*;
        let Ok(gtk_janela) = alvo.gtk_window() else { return };
        let Some(gdk_janela) = gtk_janela.window() else { return };
        // Uma região vazia faz alguns gerenciadores voltarem a aceitar a janela inteira; 1 px no canto não atrapalha.
        let regiao = Region::create_rectangle(&RectangleInt::new(0, 0, 1, 1));
        for [x, y, w, h] in caixas {
            let esquerda = (x - MARGEM_DA_AREA).floor() as i32;
            let topo = (y - MARGEM_DA_AREA).floor() as i32;
            let largura = (w + MARGEM_DA_AREA * 2.0).ceil() as i32;
            let altura = (h + MARGEM_DA_AREA * 2.0).ceil() as i32;
            let _ = regiao.union_rectangle(&RectangleInt::new(esquerda, topo, largura, altura));
        }
        gdk_janela.input_shape_combine_region(&regiao, 0, 0);
    });
}

pub fn ignorar_cursor(janela: &WebviewWindow, ignorar: bool) -> bool {
    if !janela.is_visible().unwrap_or(false) {
        return false;
    }
    let _ = janela.set_focusable(!ignorar);
    aplicar_area_de_entrada(janela);
    true
}

pub fn retangulo_da_janela(janela: &WebviewWindow) -> Option<RECT> {
    let posicao = janela.outer_position().ok()?;
    let tamanho = janela.outer_size().ok()?;
    Some(RECT { left: posicao.x, top: posicao.y, right: posicao.x + tamanho.width as i32, bottom: posicao.y + tamanho.height as i32 })
}

pub fn node_da_ponte(recursos: &Path) -> PathBuf {
    let embutido = recursos.join("node");
    if embutido.exists() {
        embutido
    } else {
        PathBuf::from("node")
    }
}

pub fn esconder_console(_comando: &mut Command) {}
