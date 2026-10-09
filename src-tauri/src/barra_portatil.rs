use tauri::{AppHandle, WebviewWindow};

pub fn barra_oculta() -> bool {
    false
}

pub fn reservar_espaco_do_dock(_dock: &WebviewWindow, _reservar: bool) {}

pub fn restaurar(_app: &AppHandle) {}

#[tauri::command]
pub fn reservar_dock(window: WebviewWindow, reservar: bool) {
    let _ = (window, reservar);
}

#[tauri::command]
pub fn barra_windows(app: AppHandle, ocultar_barra: bool) {
    let _ = (app, ocultar_barra);
}
