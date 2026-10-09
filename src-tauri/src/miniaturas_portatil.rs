use serde::Deserialize;
use tauri::WebviewWindow;

#[derive(Deserialize)]
pub struct Miniatura {
    #[allow(dead_code)]
    janela: String,
    #[allow(dead_code)]
    x: f64,
    #[allow(dead_code)]
    y: f64,
    #[allow(dead_code)]
    w: f64,
    #[allow(dead_code)]
    h: f64,
}

#[derive(Default)]
pub struct Miniaturas;

#[tauri::command]
pub fn miniaturas_janelas(
    window: WebviewWindow,
    itens: Vec<Miniatura>,
    estado: tauri::State<Miniaturas>,
) {
    let _ = (window, itens, estado);
}
