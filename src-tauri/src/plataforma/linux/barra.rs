use tauri::{AppHandle, Monitor, WebviewWindow};

#[allow(clippy::upper_case_acronyms)]
#[derive(Clone, Copy, Default)]
pub struct RECT {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

pub fn barra_oculta() -> bool {
    false
}

pub fn restaurar(_app: &AppHandle) {}

pub fn retangulo_reservado(_dock: &WebviewWindow, _monitor: &Monitor) -> Option<RECT> {
    None
}

pub fn retangulo_da_sobreposta(reserva: RECT, altura: i32) -> RECT {
    RECT { left: reserva.left, top: reserva.bottom - altura, right: reserva.right, bottom: reserva.bottom }
}

pub fn reservar_espaco_do_dock(_dock: &WebviewWindow, _reservar: bool) {}

#[tauri::command]
pub fn reservar_dock(_window: WebviewWindow, _reservar: bool, _altura: Option<f64>) {}

#[tauri::command]
pub fn barra_windows(_app: AppHandle, _ocultar_barra: bool) {}
