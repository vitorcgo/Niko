# Pendências locais — 06/10/2026

## Implementado e validado

Recuperação explícita de atualização interrompida: journal exclusivo registra manifesto e estados anteriores antes da primeira mutação. GUID do barramento, owner do Shell, PID do escritor e hashes impedem restaurar em contexto diferente ou durante outra operação. GET somente informa; POST restaura, confirma estado e remove journal. UI oferece Restaurar integração anterior e depois permite nova tentativa.

Quatro SIGKILL reais no helper privado passaram: antes/depois da troca do manifesto com legado ativo/runtime desabilitado e legado desabilitado/runtime ativo. Regressão A→B e rollback por erro passaram. Sem garantia de queda de energia/fsync ou recuperação automática em nova sessão.

Build e verificação do .deb: PASS. SHA256 `224efa08ca648a608186b5bdaf569e209d84079f6d31ac8877d3a023a87658bd`.
Suíte: 108 testes, 106 aprovados, 2 Windows ignorados, nenhuma falha; `suite-final.log`.

Endpoint HTTP da ponte original extraída do pacote + GNOME46 nested: PASS, GET readonly, token inválido 403, confirmação inválida 400, POST autenticado ativa revisão correta. Recursos montados readonly no namespace; host-before/after idênticos e cleanup PASS. Não prova clique/renderização da UI nem primeira instalação.

## Mídia e limites externos

Causa MSDK confirmada: espaço inicial no formato VUYA. Correção upstream identificada; ajuste somente do argumento em processo GDB isolado elimina a assertiva. Biblioteca do host não foi alterada. Reprodução HTMLAudio/HTMLVideo no WebKit real passou com sink silencioso privado e quadros de pixels distintos; ver linux/diagnostico-gstreamer/RESULTADO.md.

Publicação/primeira instalação via extensions.gnome.org aguardam autorização do titular, ausente conforme usuário. Nenhuma licença alterada, publicação, instalação pessoal, logout ou commit realizado. Meta completa sem reinício permanece aberta. Compatibilidade fora GNOME46, falha gráfica stack_position intermitente e reprodução no fluxo específico de mídia do Niko continuam limites independentes.
