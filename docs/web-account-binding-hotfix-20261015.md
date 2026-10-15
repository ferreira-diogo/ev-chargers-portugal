# Correção da comunicação web/contas — 2026-10-15

Incidente reportado após a publicação do login: o ecrã web abre, mas apresenta
"Serviço de contas temporariamente indisponível" antes do botão Google.
Diagnóstico inicial: o gateway fazia fetch público ao Worker de contas sem service binding. A configuração
não declarava ligação interna. A documentação Cloudflare requer service bindings
para esta comunicação entre Workers por routes/workers.dev na mesma zona.

Correção: binding HTTP ACCOUNT_SERVICE para o serviço de contas existente;
encaminhamento explícito pelo Fetcher dessa binding, preservando o seu receiver.
Sem fallback público se faltar a binding. O IP gerido pela plataforma é transmitido
internamente para manter a limitação de tentativas por cliente. Mantêm-se validação
de origem, métodos, IDs, proprietário esperado, nonce Google e cookie HttpOnly.
Não altera o cliente OAuth, a app Android, a base de contas, as sessões ou o catálogo.

Teste de regressão passa pela entrada real do Worker web, valida a chamada ao
Fetcher e a preparação do login, e verifica falha fechada sem binding.
A publicação passa a testar o gateway do Worker publicado: GET /me anónimo 401,
POST /challenge 200 com nonce válido e escrita cross-origin 403. Falha reverte a
versão web automaticamente. A validação do backend isolado não substitui este teste.

Backup de código: backup/web-before-account-binding-20261015 em
19c475d9951e203559c77c09a60599fbcccd036a. O deploy guarda a versão Worker anterior
e o snapshot publicado antes de substituir o serviço. Preservar o catálogo nesta
correção; não há migrações de base de dados nem mudança de assinatura Android.

## Causa confirmada e validação publicada

O diagnóstico inicial não explicava sozinho o erro. O log sanitizado do Worker
publicado identificou a exceção exata: o runtime rejeitava `redirect: 'error'`
na chamada Fetcher. Node aceitava esta opção, por isso os testes locais anteriores
não reproduziam a falha. A ligação interna permanece configurada.

Correção final em 2f69b4d9e29fefd5a471f356ac937905ed295f0f:
`redirect: 'manual'` e rejeição explícita de respostas 3xx antes de ler o corpo.
Nenhum redirecionamento pode reenviar as credenciais. O teste pela entrada real
do Worker exige o modo manual; um teste adicional verifica que uma resposta 302
não divulga token, Location ou Set-Cookie.

Publicação validada em 2026-10-15:
https://github.com/ferreira-diogo/ev-chargers-portugal/actions/runs/38794690485
Worker e25376da-6868-4653-9600-4244269dd61e. Após propagação, GET /api/account/me
anónimo respondeu 401 e POST /api/account/challenge respondeu 200 com nonce válido.
Origem não autorizada respondeu 403. Snapshot nacional e páginas legais passaram.
A entrada completa numa conta Google real depende da confirmação do utilizador.

Backup automático: artefacto catalogue-web-rollback-38794690485, ID 12001512114,
com a versão anterior e o catálogo publicado. Nenhuma migração ou alteração Android.
