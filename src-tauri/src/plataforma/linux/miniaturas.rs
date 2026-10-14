use serde::Deserialize;
use tauri::WebviewWindow;

#[allow(dead_code)]
#[derive(Deserialize)]
pub struct Miniatura {
    janela: String,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

#[derive(Default)]
pub struct Miniaturas {}

#[tauri::command]
pub fn miniaturas_janelas(_window: WebviewWindow, _itens: Vec<Miniatura>, _estado: tauri::State<Miniaturas>) {}
