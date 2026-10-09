use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};
#[cfg(windows)]
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetKeyboardLayoutList, MapVirtualKeyExW, ToUnicodeEx, HKL, MAPVK_VK_TO_VSC_EX, VIRTUAL_KEY, VK_0, VK_A, VK_CONTROL, VK_LCONTROL, VK_LMENU, VK_LSHIFT, VK_MENU,
    VK_OEM_1, VK_OEM_2, VK_OEM_3, VK_OEM_4, VK_OEM_5, VK_OEM_6, VK_OEM_7, VK_OEM_COMMA, VK_OEM_MINUS, VK_OEM_PERIOD, VK_OEM_PLUS, VK_RMENU, VK_SHIFT,
};

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

#[cfg(windows)]
fn tecla_virtual(codigo: Code) -> Option<VIRTUAL_KEY> {
    let letras = [
        Code::KeyA, Code::KeyB, Code::KeyC, Code::KeyD, Code::KeyE, Code::KeyF, Code::KeyG, Code::KeyH, Code::KeyI, Code::KeyJ, Code::KeyK, Code::KeyL, Code::KeyM,
        Code::KeyN, Code::KeyO, Code::KeyP, Code::KeyQ, Code::KeyR, Code::KeyS, Code::KeyT, Code::KeyU, Code::KeyV, Code::KeyW, Code::KeyX, Code::KeyY, Code::KeyZ,
    ];
    let digitos = [Code::Digit0, Code::Digit1, Code::Digit2, Code::Digit3, Code::Digit4, Code::Digit5, Code::Digit6, Code::Digit7, Code::Digit8, Code::Digit9];
    if let Some(i) = letras.iter().position(|c| *c == codigo) {
        return Some(VIRTUAL_KEY(VK_A.0 + i as u16));
    }
    if let Some(i) = digitos.iter().position(|c| *c == codigo) {
        return Some(VIRTUAL_KEY(VK_0.0 + i as u16));
    }
    Some(match codigo {
        Code::Backquote => VK_OEM_3,
        Code::BracketLeft => VK_OEM_4,
        Code::Backslash => VK_OEM_5,
        Code::BracketRight => VK_OEM_6,
        Code::Quote => VK_OEM_7,
        Code::Semicolon => VK_OEM_1,
        Code::Slash => VK_OEM_2,
        Code::Comma => VK_OEM_COMMA,
        Code::Period => VK_OEM_PERIOD,
        Code::Minus => VK_OEM_MINUS,
        Code::Equal => VK_OEM_PLUS,
        _ => return None,
    })
}

#[cfg(windows)]
fn digita_com_altgr(atalho: &Shortcut) -> bool {
    let mods = atalho.mods;
    if !(mods.contains(Modifiers::CONTROL) && mods.contains(Modifiers::ALT)) {
        return false;
    }
    let Some(vk) = tecla_virtual(atalho.key) else { return false };
    let mut estado = [0u8; 256];
    for tecla in [VK_CONTROL, VK_LCONTROL, VK_MENU, VK_LMENU, VK_RMENU] {
        estado[tecla.0 as usize] = 0x80;
    }
    if mods.contains(Modifiers::SHIFT) {
        estado[VK_SHIFT.0 as usize] = 0x80;
        estado[VK_LSHIFT.0 as usize] = 0x80;
    }
    unsafe {
        let total = GetKeyboardLayoutList(None);
        let mut layouts = vec![HKL::default(); total.max(0) as usize];
        let lidos = GetKeyboardLayoutList(Some(&mut layouts)).max(0) as usize;
        layouts.iter().take(lidos).any(|layout| {
            let varredura = MapVirtualKeyExW(vk.0 as u32, MAPVK_VK_TO_VSC_EX, Some(*layout));
            let mut texto = [0u16; 8];
            ToUnicodeEx(vk.0 as u32, varredura, &estado, &mut texto, 4, Some(*layout)) != 0
        })
    }
}

#[cfg(not(windows))]
fn digita_com_altgr(_atalho: &Shortcut) -> bool {
    false
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
