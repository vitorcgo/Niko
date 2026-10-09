//! Compatibility entry points for the existing Tauri command protocol.
//! Keep command names and argument keys stable; use English in the implementation.

use super::*;
use super::shortcuts::{ShortcutRequest, ShortcutResult};
use super::docks::NikoMonitor;
use super::foreground_window::ForegroundState;
use super::thumbnails::{Thumbnail, Thumbnails};

#[tauri::command]
pub fn definir_atalhos(app: AppHandle, lista: Vec<ShortcutRequest>) -> Vec<ShortcutResult> {
    shortcuts::set_shortcuts(app, lista)
}

#[tauri::command]
pub fn reservar_dock(window: WebviewWindow, reservar: bool) {
    windows_taskbar::reserve_dock(window, reservar)
}

#[tauri::command]
pub fn barra_windows(app: AppHandle, ocultar_barra: bool) {
    windows_taskbar::windows_taskbar(app, ocultar_barra)
}

#[tauri::command]
pub fn monitores(app: AppHandle) -> Vec<NikoMonitor> {
    docks::monitors(app)
}

#[tauri::command]
pub async fn definir_docks(app: AppHandle, ligado: bool, escolha: String) {
    docks::set_docks(app, ligado, escolha).await
}

#[tauri::command]
pub fn definir_monitor_da_ilha(app: AppHandle, escolha: String) {
    docks::set_island_monitor(app, escolha)
}

#[tauri::command]
pub fn frente_cobre_tela(app: AppHandle, window: WebviewWindow) -> ForegroundState {
    foreground_window::foreground_covers_screen(app, window)
}

#[tauri::command]
pub fn area_interativa(janela: String, retangulos: Vec<Rectangle>, estado: tauri::State<AppState>) {
    super::set_interactive_area(janela, retangulos, estado)
}

#[tauri::command]
pub fn token_ponte(estado: tauri::State<AppState>) -> String {
    super::bridge_token(estado)
}

#[tauri::command]
pub fn porta_ponte() -> u16 {
    super::bridge_port()
}

#[tauri::command]
pub fn mostrar_sistema(app: AppHandle) {
    super::show_system(app)
}

#[tauri::command]
pub fn liberar_sistema_inicial(app: AppHandle) {
    super::release_initial_system_window(app)
}

#[tauri::command]
pub fn tempo_ocioso_ms() -> u64 {
    super::idle_time_ms()
}

#[tauri::command]
pub fn devolver_foco() {
    super::restore_focus()
}

#[tauri::command]
pub fn alternar_sistema(app: AppHandle) {
    super::toggle_system(app)
}

#[tauri::command]
pub fn abrir_link(url: String) -> Result<(), String> {
    super::open_link(url)
}

#[tauri::command]
pub fn sair(app: AppHandle) {
    super::exit(app)
}

#[tauri::command]
pub async fn preparar_atualizacao(app: AppHandle) {
    super::prepare_update(app).await
}

#[tauri::command]
pub fn miniaturas_janelas(window: WebviewWindow, itens: Vec<Thumbnail>, estado: tauri::State<Thumbnails>) {
    thumbnails::window_thumbnails(window, itens, estado)
}
