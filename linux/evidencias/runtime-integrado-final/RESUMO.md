# Runtime Linux — validação adicional em 06/10/2026

Corrigidos: metadata.version atribuída pelo canal GNOME não impede bootstrap equivalente; payload publicado completo por hardlink exclusivo; temporários aleatórios; perda de ownership remove implementação ativa. Mantida arquitetura da ilha.

## Resultados

- Suíte geral: 106 testes, 104 passaram, 2 Windows ignorados, nenhum falhou; exit0. Dois testes adicionais de ownership passaram separadamente e agora são descobertos pelo runner padrão.
- GNOME46 nested real: atualização A→B e rollback, inclusive estado inicialmente desabilitado com/sem legado; metadata instalada normalizada; owner e PID preservados.
- Colisão D-Bus nativa: owner inválido recusado sem escrita; importação pendente cancelada. Perda após ativação: regressão com dependências simuladas, 2 testes.
- Clean final: UUID desconhecido retorna canal_gnome sem copiar arquivos nem alterar habilitações.
- Build .deb e verificador: PASS. SHA256 `0ed7f74e1375a2559ca981e06831448875ec3995d5c0d46aeb9739f70a276e2e`.
- Tauri real com runtime extraído do pacote: cinco ciclos mostrar/ocultar/reabrir passaram; owner/revisão/foco/âncora/tablist conferidos. UUID conhecido antes do startup. Evidências gráficas referidas na matriz atual.

## Limites

Não houve instalação, publicação, commit, logout ou alteração da sessão pessoal. Esta prova não invoca instalação do helper pela interface do aplicativo empacotado. Não prova primeira instalação pelo canal GNOME, aceitação do loader pelo canal, compatibilidade fora GNOME46, recuperação após SIGKILL ou desconexão nativa do Shell. GStreamer continua emitindo critical conhecido; warnings de ping apareceram. Passar esta rodada não elimina a falha stack_position intermitente anterior.

Primeira ativação via extensions.gnome.org segue dependente de revisão, identidade oficial e resolução de licença/publicação. A meta de instalação e atualização sem reinício da sessão permanece aberta.
