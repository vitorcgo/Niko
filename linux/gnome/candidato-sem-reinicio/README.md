# Candidato de carregador estável

Direção aprovada: Niko pelo .deb; primeira ativação da integração pelo canal GNOME.
O helper de produção agora consulta este runtime, e o build Linux prepara seu
recurso para o .deb em `runtime-build/niko-ilha-runtime@local`. O pacote mantém
a extensão legada para reversão. Não houve publicação nem instalação desta
revisão na sessão pessoal.

Mantém a implementação atual da ilha em payload por SHA256 e permite atualização
por manifesto atual, sem substituir o entrypoint já importado. O processo do Shell
publica interface D-Bus somente leitura `com.niko.Ilha.Integracao`, no caminho
`/com/niko/Ilha/Integracao` e nome de mesmo identificador:

- `State`: loading, active, rollback ou error. ACTIVE do gerenciador GNOME não basta.
- `Revision`: arquivo imutável realmente importado/ativado; rollback conserva anterior.
- `Generation`: identifica tentativa atual e invalida import quando desabilitado.
- `LastError`: código de erro; não expõe caminhos ou conteúdo pessoal.

O diretório contém current.json e implementation-<sha256>.js. Leitura exige arquivos
regulares, sem symlink, manifesto até1KiB e payload até128KiB; hash confere conteúdo.
O helper cria payloads imutáveis e substitui o manifesto de forma atômica,
confere dono D-Bus/revisão efetiva e mantém reversão transacional. Verificação seguida de import não elimina alteração concorrente por outro
processo do mesmo usuário: não tratar hash local como assinatura de publicador.

```bash
bash linux/gnome/native-sem-reinicio/run.sh candidate
```

Usa candidato efetivo com subclasse diagnóstica para marcador de posse do painel,
mas consulta a API D-Bus real do candidato em processo GNOME. Mantém fixture legada
para migração/reversão. Ambos UUIDs conhecidos antes do startup; esse teste não
prova primeira instalação via EGO nem atualizações do entrypoint propriamente dito.

Pendentes: publicação/licença, revisão do canal GNOME e primeira instalação real
nesse canal. O recurso empacotado e o helper não removem a limitação de descoberta
de uma nova extensão local na sessão já iniciada; não prometem primeira ativação
sem reinício. Testes do helper e do pacote devem comprovar a revisão integrada.

Revisão independente exigiu proteção contra callback de ownership antigo e perda
do nome durante import. Guardas de geração foram adicionadas; resultados da colisão estão descritos abaixo.

Validação adicional: colisão real antes da ativação confirma erro de ownership e
cancelamento da importação pendente. Callback de perda do nome após ativação
agora desativa o payload; seu teste de regressão usa a fonte real com dependências
simuladas, sem representar desconexão nativa do Shell. O nome não aceita substituição.

O helper aceita metadata.version atribuída pelo canal GNOME: valida UUID, suporte
ao GNOME46 e código exato do bootstrap. Payload é publicado por hardlink exclusivo
a partir de temporário completo; manifesto usa rename atômico e temporário aleatório.
Isso evita payload parcial no nome final, mas não fornece journal de recuperação
automática após SIGKILL nem garantia de durabilidade após falta de energia.
