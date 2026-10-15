# Correção da comunicação web/contas — 2026-10-15

Incidente reportado após a publicação do login: o ecrã web abre, mas apresenta
"Serviço de contas temporariamente indisponível" antes do botão Google.
O gateway fazia fetch público ao Worker de contas sem service binding. A configuração
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
