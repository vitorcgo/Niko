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
pub struct Thumbnail {
    #[serde(rename = "janela")]
    window: String,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

#[derive(Default)]
pub struct Thumbnails(Mutex<HashMap<(isize, isize), isize>>);

fn fit(source_width: i32, source_height: i32, x: i32, y: i32, width: i32, height: i32) -> RECT {
    if source_width <= 0 || source_height <= 0 {
        return RECT { left: x, top: y, right: x + width, bottom: y + height };
    }
    let ratio = (width as f64 / source_width as f64).min(height as f64 / source_height as f64);
    let w = (source_width as f64 * ratio).round() as i32;
    let h = (source_height as f64 * ratio).round() as i32;
    let left = x + (width - w) / 2;
    let top = y + (height - h) / 2;
    RECT { left, top, right: left + w, bottom: top + h }
}

pub fn window_thumbnails(window: WebviewWindow, items: Vec<Thumbnail>, state: tauri::State<Thumbnails>) {
    let Ok(mut registered) = state.0.lock() else { return };
    let (Ok(destination), Ok(scale)) = (window.hwnd(), window.scale_factor()) else { return };
    let destination = HWND(destination.0);
    let destination_key = destination.0 as isize;

    let mut requested: HashMap<isize, &Thumbnail> = HashMap::new();
    for item in &items {
        let Ok(id) = item.window.parse::<i64>() else { continue };
        let source = HWND(id as isize as *mut core::ffi::c_void);
        if unsafe { IsWindow(Some(source)) }.as_bool() {
            requested.insert(id as isize, item);
        }
    }

    registered.retain(|(owner, source), thumbnail| {
        let keep = *owner != destination_key || requested.contains_key(source);
        if !keep {
            let _ = unsafe { DwmUnregisterThumbnail(*thumbnail) };
        }
        keep
    });

    for (source, item) in requested {
        let thumbnail = match registered.get(&(destination_key, source)) {
            Some(m) => *m,
            None => match unsafe { DwmRegisterThumbnail(destination, HWND(source as *mut core::ffi::c_void)) } {
                Ok(m) => {
                    registered.insert((destination_key, source), m);
                    m
                }
                Err(_) => continue,
            },
        };
        let size = unsafe { DwmQueryThumbnailSourceSize(thumbnail) }.unwrap_or_default();
        let destination_rect = fit(size.cx, size.cy, (item.x * scale).round() as i32, (item.y * scale).round() as i32, (item.w * scale).round() as i32, (item.h * scale).round() as i32);
        let properties = DWM_THUMBNAIL_PROPERTIES {
            dwFlags: DWM_TNP_RECTDESTINATION | DWM_TNP_VISIBLE | DWM_TNP_OPACITY | DWM_TNP_SOURCECLIENTAREAONLY,
            rcDestination: destination_rect,
            opacity: 255,
            fVisible: true.into(),
            fSourceClientAreaOnly: false.into(),
            ..Default::default()
        };
        let _ = unsafe { DwmUpdateThumbnailProperties(thumbnail, &properties) };
    }
}
