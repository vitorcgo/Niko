use std::collections::HashMap;
use std::sync::Mutex;

use serde::Deserialize;
use tauri::WebviewWindow;
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Dwm::{
    DwmQueryThumbnailSourceSize, DwmRegisterThumbnail, DwmUnregisterThumbnail, DwmUpdateThumbnailProperties, DWM_THUMBNAIL_PROPERTIES, DWM_TNP_OPACITY, DWM_TNP_RECTDESTINATION, DWM_TNP_SOURCECLIENTAREAONLY, DWM_TNP_VISIBLE,
};
use windows::Win32::UI::WindowsAndMessaging::IsWindow;

#[derive(Deserialize)]
pub struct Miniatura {
    janela: String,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

#[derive(Default)]
pub struct Miniaturas(Mutex<HashMap<(isize, isize), isize>>);

fn encaixar(fonte_largura: i32, fonte_altura: i32, x: i32, y: i32, largura: i32, altura: i32) -> RECT {
    if fonte_largura <= 0 || fonte_altura <= 0 {
        return RECT { left: x, top: y, right: x + largura, bottom: y + altura };
    }
    let proporcao = (largura as f64 / fonte_largura as f64).min(altura as f64 / fonte_altura as f64);
    let w = (fonte_largura as f64 * proporcao).round() as i32;
    let h = (fonte_altura as f64 * proporcao).round() as i32;
    let left = x + (largura - w) / 2;
    let top = y + (altura - h) / 2;
    RECT { left, top, right: left + w, bottom: top + h }
}

#[tauri::command]
pub fn miniaturas_janelas(window: WebviewWindow, itens: Vec<Miniatura>, estado: tauri::State<Miniaturas>) {
    let Ok(mut registradas) = estado.0.lock() else { return };
    let (Ok(destino), Ok(escala)) = (window.hwnd(), window.scale_factor()) else { return };
    let destino = HWND(destino.0);
    let chave_destino = destino.0 as isize;

    let mut pedidas: HashMap<isize, &Miniatura> = HashMap::new();
    for item in &itens {
        let Ok(id) = item.janela.parse::<i64>() else { continue };
        let fonte = HWND(id as isize as *mut core::ffi::c_void);
        if unsafe { IsWindow(Some(fonte)) }.as_bool() {
            pedidas.insert(id as isize, item);
        }
    }

    registradas.retain(|(dono, fonte), miniatura| {
        let manter = *dono != chave_destino || pedidas.contains_key(fonte);
        if !manter {
            let _ = unsafe { DwmUnregisterThumbnail(*miniatura) };
        }
        manter
    });

    for (fonte, item) in pedidas {
        let miniatura = match registradas.get(&(chave_destino, fonte)) {
            Some(m) => *m,
            None => match unsafe { DwmRegisterThumbnail(destino, HWND(fonte as *mut core::ffi::c_void)) } {
                Ok(m) => {
                    registradas.insert((chave_destino, fonte), m);
                    m
                }
                Err(_) => continue,
            },
        };
        let tamanho = unsafe { DwmQueryThumbnailSourceSize(miniatura) }.unwrap_or_default();
        let destino_rect = encaixar(tamanho.cx, tamanho.cy, (item.x * escala).round() as i32, (item.y * escala).round() as i32, (item.w * escala).round() as i32, (item.h * escala).round() as i32);
        let propriedades = DWM_THUMBNAIL_PROPERTIES {
            dwFlags: DWM_TNP_RECTDESTINATION | DWM_TNP_VISIBLE | DWM_TNP_OPACITY | DWM_TNP_SOURCECLIENTAREAONLY,
            rcDestination: destino_rect,
            opacity: 255,
            fVisible: true.into(),
            fSourceClientAreaOnly: false.into(),
            ..Default::default()
        };
        let _ = unsafe { DwmUpdateThumbnailProperties(miniatura, &propriedades) };
    }
}
