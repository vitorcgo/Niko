use std::time::Instant;
#[cfg(any(windows, test))]
use std::time::Duration;

#[cfg(any(windows, test))]
pub const PRAZO_DO_SINAL: Duration = Duration::from_secs(15);

pub fn respondeu(ultimo: Option<Instant>, desde: Instant) -> bool {
    ultimo.is_some_and(|sinal| sinal >= desde)
}

#[cfg(any(windows, test))]
pub fn sobrepostas_prontas(ilha: Option<Instant>, dock: Option<Instant>, agora: Instant) -> bool {
    [ilha, dock].into_iter().all(|ultimo| ultimo.is_some_and(|sinal| agora.saturating_duration_since(sinal) <= PRAZO_DO_SINAL))
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn nao_esconde_a_barra_antes_de_ambas_as_interfaces_aparecerem() {
        let agora = Instant::now();
        assert!(!sobrepostas_prontas(None, None, agora));
        assert!(!sobrepostas_prontas(Some(agora), None, agora));
        assert!(!sobrepostas_prontas(None, Some(agora), agora));
        assert!(sobrepostas_prontas(Some(agora), Some(agora), agora));
    }

    #[test]
    fn uma_interface_travada_devolve_a_barra_e_pode_se_recuperar() {
        let inicio = Instant::now();
        let agora = inicio + PRAZO_DO_SINAL + Duration::from_secs(1);
        assert!(!sobrepostas_prontas(Some(inicio), Some(agora), agora));
        assert!(!sobrepostas_prontas(Some(agora), Some(inicio), agora));
        assert!(sobrepostas_prontas(Some(agora), Some(agora), agora));
    }

    #[test]
    fn reabrir_recupera_tambem_a_janela_que_nunca_chegou_a_responder() {
        let agora = Instant::now();
        assert!(!respondeu(None, agora));
        assert!(!respondeu(Some(agora - Duration::from_secs(1)), agora));
        assert!(respondeu(Some(agora), agora));
    }
}
