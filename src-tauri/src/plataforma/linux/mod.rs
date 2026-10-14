pub mod barra;
pub mod janela_frente;
pub mod miniaturas;

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use tauri::{AppHandle, WebviewWindow};
use tauri_plugin_global_shortcut::Shortcut;

pub use barra::RECT;

pub fn preparar_ambiente() {
    if std::env::var_os("GDK_BACKEND").is_none() {
        std::env::set_var("GDK_BACKEND", "x11");
    }
}

pub fn tempo_ocioso_ms() -> u64 {
    let Ok(saida) = Command::new("gdbus")
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

pub fn registrar_frente(_app: &AppHandle) {}

pub fn devolver_foco() {}

pub fn janela_em_foco(janela: &WebviewWindow) -> bool {
    janela.is_focused().unwrap_or(false)
}

pub fn digita_com_altgr(_atalho: &Shortcut) -> bool {
    false
}

pub fn abrir_no_sistema(endereco: &str) -> Result<(), String> {
    let mut filho = Command::new("xdg-open").arg(endereco).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|_| "falha_ao_abrir".to_string())?;
    std::thread::spawn(move || {
        let _ = filho.wait();
    });
    Ok(())
}

pub fn botao_do_mouse_pressionado() -> bool {
    false
}

pub fn ignorar_cursor(janela: &WebviewWindow, ignorar: bool) -> bool {
    if !janela.is_visible().unwrap_or(false) {
        return false;
    }
    janela.set_ignore_cursor_events(ignorar).is_ok()
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
