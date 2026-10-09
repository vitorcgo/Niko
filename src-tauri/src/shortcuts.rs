use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetKeyboardLayoutList, MapVirtualKeyExW, ToUnicodeEx, HKL, MAPVK_VK_TO_VSC_EX, VIRTUAL_KEY, VK_0, VK_A, VK_CONTROL, VK_LCONTROL, VK_LMENU, VK_LSHIFT, VK_MENU,
    VK_OEM_1, VK_OEM_2, VK_OEM_3, VK_OEM_4, VK_OEM_5, VK_OEM_6, VK_OEM_7, VK_OEM_COMMA, VK_OEM_MINUS, VK_OEM_PERIOD, VK_OEM_PLUS, VK_RMENU, VK_SHIFT,
};

pub const ACTIONS: [&str; 10] = ["captura", "lupa", "sistema", "pomodoro", "midia", "privacidade", "naoPerturbe", "pedido", "proximaAba", "terminal"];

pub const DEFAULT: [(&str, &str); 2] = [("captura", "ctrl+alt+space"), ("lupa", "ctrl+alt+l")];

#[derive(Default)]
pub struct Shortcuts {
    recorded: Mutex<HashMap<u32, String>>,
}

#[derive(Deserialize)]
pub struct ShortcutRequest {
    #[serde(rename = "acao")]
    action: String,
    #[serde(rename = "teclas")]
    keys: String,
}

#[derive(Serialize)]
pub struct ShortcutResult {
    #[serde(rename = "acao")]
    action: String,
    #[serde(rename = "teclas")]
    keys: String,
    #[serde(rename = "situacao")]
    status: &'static str,
}

fn virtual_key(code: Code) -> Option<VIRTUAL_KEY> {
    let letters = [
        Code::KeyA, Code::KeyB, Code::KeyC, Code::KeyD, Code::KeyE, Code::KeyF, Code::KeyG, Code::KeyH, Code::KeyI, Code::KeyJ, Code::KeyK, Code::KeyL, Code::KeyM,
        Code::KeyN, Code::KeyO, Code::KeyP, Code::KeyQ, Code::KeyR, Code::KeyS, Code::KeyT, Code::KeyU, Code::KeyV, Code::KeyW, Code::KeyX, Code::KeyY, Code::KeyZ,
    ];
    let digits = [Code::Digit0, Code::Digit1, Code::Digit2, Code::Digit3, Code::Digit4, Code::Digit5, Code::Digit6, Code::Digit7, Code::Digit8, Code::Digit9];
    if let Some(i) = letters.iter().position(|c| *c == code) {
        return Some(VIRTUAL_KEY(VK_A.0 + i as u16));
    }
    if let Some(i) = digits.iter().position(|c| *c == code) {
        return Some(VIRTUAL_KEY(VK_0.0 + i as u16));
    }
    Some(match code {
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

fn types_with_altgr(shortcut: &Shortcut) -> bool {
    let mods = shortcut.mods;
    if !(mods.contains(Modifiers::CONTROL) && mods.contains(Modifiers::ALT)) {
        return false;
    }
    let Some(vk) = virtual_key(shortcut.key) else { return false };
    let mut state = [0u8; 256];
    for key in [VK_CONTROL, VK_LCONTROL, VK_MENU, VK_LMENU, VK_RMENU] {
        state[key.0 as usize] = 0x80;
    }
    if mods.contains(Modifiers::SHIFT) {
        state[VK_SHIFT.0 as usize] = 0x80;
        state[VK_LSHIFT.0 as usize] = 0x80;
    }
    unsafe {
        let total = GetKeyboardLayoutList(None);
        let mut layouts = vec![HKL::default(); total.max(0) as usize];
        let read_count = GetKeyboardLayoutList(Some(&mut layouts)).max(0) as usize;
        layouts.iter().take(read_count).any(|layout| {
            let scan_code = MapVirtualKeyExW(vk.0 as u32, MAPVK_VK_TO_VSC_EX, Some(*layout));
            let mut text = [0u16; 8];
            ToUnicodeEx(vk.0 as u32, scan_code, &state, &mut text, 4, Some(*layout)) != 0
        })
    }
}

pub fn read(keys: &str) -> Option<Shortcut> {
    let shortcut = Shortcut::from_str(keys.trim()).ok()?;
    let has_modifier = shortcut.mods.intersects(Modifiers::CONTROL | Modifiers::ALT | Modifiers::SUPER);
    let function_key = matches!(shortcut.key, Code::F1 | Code::F2 | Code::F3 | Code::F4 | Code::F5 | Code::F6 | Code::F7 | Code::F8 | Code::F9 | Code::F10 | Code::F11 | Code::F12);
    (has_modifier || function_key).then_some(shortcut)
}

pub fn register(app: &AppHandle, list: Vec<ShortcutRequest>) -> Vec<ShortcutResult> {
    let shortcuts = app.state::<Shortcuts>();
    let mut recorded = match shortcuts.recorded.lock() {
        Ok(r) => r,
        Err(e) => e.into_inner(),
    };
    let _ = app.global_shortcut().unregister_all();
    recorded.clear();
    let mut result = Vec::new();
    for request in list {
        let status = if !ACTIONS.contains(&request.action.as_str()) {
            "invalido"
        } else if request.keys.trim().is_empty() {
            "desligado"
        } else {
            match read(&request.keys) {
                None => "invalido",
                Some(shortcut) if recorded.contains_key(&shortcut.id()) => "repetido",
                Some(shortcut) if types_with_altgr(&shortcut) => "digita_caractere",
                Some(shortcut) => match app.global_shortcut().register(shortcut) {
                    Ok(()) => {
                        recorded.insert(shortcut.id(), request.action.clone());
                        "ok"
                    }
                    Err(_) => "em_uso",
                },
            }
        };
        result.push(ShortcutResult { action: request.action, keys: request.keys, status });
    }
    result
}

pub fn register_defaults(app: &AppHandle) {
    register(app, DEFAULT.iter().map(|(action, keys)| ShortcutRequest { action: action.to_string(), keys: keys.to_string() }).collect());
}

pub fn action_for(app: &AppHandle, shortcut: &Shortcut) -> Option<String> {
    let shortcuts = app.state::<Shortcuts>();
    let recorded = shortcuts.recorded.lock().ok()?;
    recorded.get(&shortcut.id()).cloned()
}

pub fn notify_window(app: &AppHandle, window: &str, action: &str) {
    let _ = app.emit_to(window, "niko://atalho", action.to_string());
}

pub fn set_shortcuts(app: AppHandle, list: Vec<ShortcutRequest>) -> Vec<ShortcutResult> {
    register(&app, list)
}
