use gtk::prelude::*;
use serde::Deserialize;
use tauri::WebviewWindow;

#[derive(Deserialize)]
pub struct Retangulo { x: f64, y: f64, w: f64, h: f64 }

fn valido(r: &Retangulo) -> bool {
    [r.x, r.y, r.w, r.h].iter().all(|v| v.is_finite() && v.abs() <= 16384.0) && r.w >= 0.0 && r.h >= 0.0
}

#[tauri::command]
pub fn area_interativa(janela: WebviewWindow, retangulos: Vec<Retangulo>) -> Result<(), String> {
    if janela.label() != "dock" || retangulos.len() > 64 || !retangulos.iter().all(valido) {
        return Err("area_dock_invalida".into());
    }
    let alvo = janela.clone();
    janela.run_on_main_thread(move || {
        if let Ok(widget) = alvo.gtk_window() {
            if widget.window().is_some() {
                let region = gtk::cairo::Region::create();
                for r in retangulos {
                    let _ = region.union_rectangle(&gtk::cairo::RectangleInt::new(
                        r.x.floor() as i32, r.y.floor() as i32,
                        (r.x + r.w).ceil() as i32 - r.x.floor() as i32,
                        (r.y + r.h).ceil() as i32 - r.y.floor() as i32));
                }
                // WebKitGTK impõe altura mínima; só o conteúdo recebe eventos Wayland.
                widget.input_shape_combine_region(Some(&region));
                // GDK Wayland envia a região pendente junto do próximo commit da superfície.
                widget.queue_draw();
            }
        }
    }).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn area_rejeita_numeros_invalidos_e_dimensoes_negativas() {
        assert!(valido(&Retangulo { x: -10.5, y: 100.0, w: 42.5, h: 62.0 }));
        for r in [Retangulo { x: f64::NAN, y: 0.0, w: 1.0, h: 1.0 },
                  Retangulo { x: 0.0, y: 0.0, w: -1.0, h: 1.0 },
                  Retangulo { x: 0.0, y: 0.0, w: 1.0, h: f64::INFINITY }] {
            assert!(!valido(&r));
        }
    }
}
