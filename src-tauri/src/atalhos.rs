use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

use crate::plataforma::digita_com_altgr;

pub const ACOES: [&str; 10] = ["captura", "lupa", "sistema", "pomodoro", "midia", "privacidade", "naoPerturbe", "pedido", "proximaAba", "terminal"];

pub const PADRAO: [(&str, &str); 2] = [("captura", "ctrl+alt+space"), ("lupa", "ctrl+alt+l")];

#[derive(Default)]
pub struct Atalhos {
    registrados: Mutex<HashMap<u32, String>>,
}

#[derive(Deserialize)]
pub struct PedidoDeAtalho {
    acao: String,
    teclas: String,
}

#[derive(Serialize)]
pub struct ResultadoDoAtalho {
    acao: String,
    teclas: String,
    situacao: &'static str,
}

pub fn ler(teclas: &str) -> Option<Shortcut> {
    let atalho = Shortcut::from_str(teclas.trim()).ok()?;
    let tem_modificador = atalho.mods.intersects(Modifiers::CONTROL | Modifiers::ALT | Modifiers::SUPER);
    let tecla_de_funcao = matches!(atalho.key, Code::F1 | Code::F2 | Code::F3 | Code::F4 | Code::F5 | Code::F6 | Code::F7 | Code::F8 | Code::F9 | Code::F10 | Code::F11 | Code::F12);
    (tem_modificador || tecla_de_funcao).then_some(atalho)
}

pub fn registrar(app: &AppHandle, lista: Vec<PedidoDeAtalho>) -> Vec<ResultadoDoAtalho> {
    let atalhos = app.state::<Atalhos>();
    let mut registrados = match atalhos.registrados.lock() {
        Ok(r) => r,
        Err(e) => e.into_inner(),
    };
    let _ = app.global_shortcut().unregister_all();
    registrados.clear();
    let mut resultado = Vec::new();
    for pedido in lista {
        let situacao = if !ACOES.contains(&pedido.acao.as_str()) {
            "invalido"
        } else if pedido.teclas.trim().is_empty() {
            "desligado"
        } else {
            match ler(&pedido.teclas) {
                None => "invalido",
                Some(atalho) if registrados.contains_key(&atalho.id()) => "repetido",
                Some(atalho) if digita_com_altgr(&atalho) => "digita_caractere",
                Some(atalho) => match app.global_shortcut().register(atalho) {
                    Ok(()) => {
                        registrados.insert(atalho.id(), pedido.acao.clone());
                        "ok"
                    }
                    Err(_) => "em_uso",
                },
            }
        };
        resultado.push(ResultadoDoAtalho { acao: pedido.acao, teclas: pedido.teclas, situacao });
    }
    resultado
}

pub fn registrar_padrao(app: &AppHandle) {
    registrar(app, PADRAO.iter().map(|(acao, teclas)| PedidoDeAtalho { acao: acao.to_string(), teclas: teclas.to_string() }).collect());
}

pub fn acao_de(app: &AppHandle, atalho: &Shortcut) -> Option<String> {
    let atalhos = app.state::<Atalhos>();
    let registrados = atalhos.registrados.lock().ok()?;
    registrados.get(&atalho.id()).cloned()
}

pub fn avisar_janela(app: &AppHandle, janela: &str, acao: &str) {
    let _ = app.emit_to(janela, "niko://atalho", acao.to_string());
}

#[tauri::command]
pub fn definir_atalhos(app: AppHandle, lista: Vec<PedidoDeAtalho>) -> Vec<ResultadoDoAtalho> {
    registrar(&app, lista)
}
