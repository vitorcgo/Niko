const DESATIVAR_DMABUF: &str = "WEBKIT_DISABLE_DMABUF_RENDERER";
const FORCAR_SHM: &str = "WEBKIT_DMABUF_RENDERER_FORCE_SHM";

// API estável do WebKitGTK 4.1, já ligado pelo Tauri. Consultar a biblioteca carregada,
// não os headers do build: os pacotes são compilados no Ubuntu e executados também no Fedora.
#[link(name = "webkit2gtk-4.1")]
#[cfg(target_os = "linux")]
extern "C" {
    fn webkit_get_major_version() -> u32;
    fn webkit_get_minor_version() -> u32;
}

fn ajuste_padrao(versao: (u32, u32), desativar_definido: bool, shm_definido: bool) -> Option<&'static str> {
    // Não combinar um padrão nosso com a escolha explícita do usuário/empacotador,
    // inclusive "0": desativar DMA-BUF tem precedência sobre forçar SHM no WebKit.
    if desativar_definido || shm_definido {
        return None;
    }
    Some(if versao >= (2, 54) { FORCAR_SHM } else { DESATIVAR_DMABUF })
}

#[cfg(target_os = "linux")]
pub fn preparar() {
    // SAFETY: funções sem argumentos da biblioteca já requerida pelo app; leem apenas
    // a versão em execução e não exigem inicializar GTK ou criar uma WebView.
    let versao = unsafe { (webkit_get_major_version(), webkit_get_minor_version()) };
    if let Some(variavel) = ajuste_padrao(versao, std::env::var_os(DESATIVAR_DMABUF).is_some(), std::env::var_os(FORCAR_SHM).is_some()) {
        // O caminho antigo evita falhas GBM/NVIDIA, mas no WebKitGTK 2.54 deixa apenas
        // as regiões repintadas visíveis em janelas transparentes (issue #23).
        // SHM mantém o compositor ativo sem importar buffers DMA-BUF da GPU.
        // https://github.com/cjpais/Handy/pull/2360
        std::env::set_var(variavel, "1");
    }
}

#[cfg(test)]
mod testes {
    use super::{ajuste_padrao, DESATIVAR_DMABUF, FORCAR_SHM};

    #[test]
    fn preserva_o_contorno_das_versoes_antigas() {
        for versao in [(2, 40), (2, 42), (2, 50), (2, 52)] {
            assert_eq!(ajuste_padrao(versao, false, false), Some(DESATIVAR_DMABUF));
        }
    }

    #[test]
    fn webkit_recente_preserva_a_composicao_das_sobrepostas() {
        for versao in [(2, 54), (2, 56), (3, 0)] {
            assert_eq!(ajuste_padrao(versao, false, false), Some(FORCAR_SHM));
        }
    }

    #[test]
    fn respeita_cada_variavel_explicita_em_qualquer_versao() {
        for versao in [(2, 42), (2, 52), (2, 54), (3, 0)] {
            for (desativar, shm) in [(true, false), (false, true), (true, true)] {
                assert_eq!(ajuste_padrao(versao, desativar, shm), None);
            }
        }
    }
}
