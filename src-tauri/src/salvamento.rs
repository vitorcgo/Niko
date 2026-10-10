use std::collections::HashSet;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use tokio::sync::Notify;

#[derive(Default)]
pub struct ControleSalvamento {
    prontas: Mutex<HashSet<String>>,
    lote: Mutex<Option<Lote>>,
    notificacao: Notify,
    sequencia: AtomicU64,
}

struct Lote {
    tentativa: u64,
    pendentes: HashSet<String>,
    falhou: bool,
}

impl Lote {
    fn confirmar(&mut self, janela: &str, tentativa: u64, sucesso: bool) -> bool {
        if tentativa != self.tentativa || !self.pendentes.remove(janela) {
            return false;
        }
        self.falhou |= !sucesso;
        true
    }
}

#[derive(Clone, Serialize)]
struct Pedido {
    tentativa: u64,
}

#[tauri::command]
pub fn registrar_armazenamento(
    janela: WebviewWindow,
    estado: tauri::State<ControleSalvamento>,
) -> Result<(), String> {
    estado
        .prontas
        .lock()
        .map_err(|_| "falha_salvamento")?
        .insert(janela.label().to_string());
    Ok(())
}

#[tauri::command]
pub fn confirmar_salvamento(
    janela: WebviewWindow,
    tentativa: u64,
    sucesso: bool,
    estado: tauri::State<ControleSalvamento>,
) {
    if let Ok(mut atual) = estado.lote.lock() {
        if let Some(lote) = atual.as_mut() {
            if lote.confirmar(janela.label(), tentativa, sucesso) {
                estado.notificacao.notify_one();
            }
        }
    }
}

pub async fn salvar(app: &AppHandle) -> Result<(), String> {
    let estado = app.state::<ControleSalvamento>();
    let prontas = estado
        .prontas
        .lock()
        .map_err(|_| "falha_salvamento")?
        .clone();
    let pendentes: HashSet<String> = prontas
        .into_iter()
        .filter(|r| app.get_webview_window(r).is_some())
        .collect();
    let tentativa = estado.sequencia.fetch_add(1, Ordering::Relaxed) + 1;
    {
        let mut atual = estado.lote.lock().map_err(|_| "falha_salvamento")?;
        if atual.is_some() {
            return Err("salvamento_em_andamento".into());
        }
        *atual = Some(Lote {
            tentativa,
            pendentes: pendentes.clone(),
            falhou: false,
        });
    }
    let limite = tokio::time::Instant::now() + Duration::from_secs(12);
    let resultado = async {
        for janela in pendentes {
            app.emit_to(&janela, "niko://saindo", Pedido { tentativa })
                .map_err(|_| "falha_salvamento")?;
        }
        loop {
            {
                let atual = estado.lote.lock().map_err(|_| "falha_salvamento")?;
                let lote = atual.as_ref().ok_or("falha_salvamento")?;
                if lote.falhou {
                    return Err("falha_salvamento".to_string());
                }
                if lote.pendentes.is_empty() {
                    return Ok(());
                }
            }
            tokio::time::timeout_at(limite, estado.notificacao.notified())
                .await
                .map_err(|_| "tempo_salvamento")?;
        }
    }
    .await;
    if let Ok(mut atual) = estado.lote.lock() {
        *atual = None;
    }
    if resultado.is_err() {
        let _ = app.emit("niko://salvar-falhou", ());
    }
    resultado
}

#[cfg(test)]
mod testes {
    use super::*;

    fn lote() -> Lote {
        Lote {
            tentativa: 7,
            pendentes: HashSet::from(["sistema".into(), "ilha".into()]),
            falhou: false,
        }
    }

    #[test]
    fn aguarda_todas_as_janelas_e_ignora_respostas_antigas() {
        let mut atual = lote();
        assert!(!atual.confirmar("sistema", 6, true));
        assert!(!atual.confirmar("outra", 7, true));
        assert!(atual.confirmar("sistema", 7, true));
        assert!(!atual.pendentes.is_empty());
        assert!(!atual.confirmar("sistema", 7, true));
        assert!(atual.confirmar("ilha", 7, true));
        assert!(atual.pendentes.is_empty());
        assert!(!atual.falhou);
    }

    #[test]
    fn qualquer_falha_impede_encerramento() {
        let mut atual = lote();
        atual.confirmar("ilha", 7, false);
        atual.confirmar("sistema", 7, true);
        assert!(atual.falhou);
    }
}
