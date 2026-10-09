use serde::Serialize;
use tauri::WebviewWindow;

#[derive(Serialize, Default)]
#[serde(rename_all = "snake_case")]
enum TipoDaFrente {
    #[default]
    AreaDeTrabalho,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct EstadoDaFrente {
    cobre: bool,
    tela_cheia: bool,
    maximizada: bool,
    frente: TipoDaFrente,
}

#[tauri::command]
pub fn frente_cobre_tela(window: WebviewWindow) -> EstadoDaFrente {
    let _ = window;
    EstadoDaFrente::default()
}
