use serde::Serialize;
use tauri::{AppHandle, WebviewWindow};

#[derive(Serialize, Default, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TipoDaFrente {
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
    programa: String,
}

#[tauri::command]
pub fn frente_cobre_tela(_app: AppHandle, _window: WebviewWindow) -> EstadoDaFrente {
    EstadoDaFrente::default()
}
