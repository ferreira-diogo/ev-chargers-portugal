# Contas Android independentes

Serviço candidato, ainda sem deploy. Usa D1 nova e binding `ACCOUNTS_DB`; não alterar `CHARGEVOY_DB` ou os Workers públicos. Sem Google/DB/rate limiter configurados, falha com 503. Não aceita email/password nem IDs de proprietário enviados pelo cliente.

## Preparação

1. Instalar `npm ci` nesta pasta e executar `npm test` com Node 24.
2. Criar D1 de staging específica para contas e guardar ID/configuração; definir binding `ACCOUNTS_DB` no wrangler.
3. Aplicar `migrations/0001_accounts.sql` só à nova DB; validar schema e recuperar num ambiente separado.
4. Definir `GOOGLE_CLIENT_ID` para o cliente OAuth WEB usado pelo Credential Manager Android. Configurar clientes Android para pacote/certificado debug e Play.
5. Adicionar binding rate limiter `AUTH_LIMITER`, com namespace próprio e limite inicial de 10 pedidos/60 segundos. O namespace é único na conta, não reaproveitar outro serviço.
6. Deploy apenas do novo Worker; preencher em `src/android-config.js` o HTTPS `accountApi` e `googleWebClientId` públicos. Nunca colocar segredos ou chaves administrativas no APK.
7. Testar pelo canal interno Play antes de ativar produção.

## Segurança e operação

Google ID tokens são verificados com jose, JWKS Google, RS256, emissor, audiência, idade, expiração, nonce e email verificado. Nonce aleatório válido 5 minutos e consumido uma única vez. Identidade permanente é `sub`, não email.

Sessões aleatórias de 256 bits; apenas hash SHA-256 guardado no servidor. Prazo inicial 12 horas, sem refresh token: após expiração exige Google novamente. Sessão nativa cifrada AES-GCM com chave Android Keystore; backup Android desativado. Logout revoga sessão corrente. Eliminação revoga todas as sessões e apaga favoritos/perfil numa batch D1. Máximo 200 favoritos por conta, operações idempotentes e queries parametrizadas.

Rotas ficam locais, por ID da conta, limitadas a 20; não são enviadas a este serviço. Avaliações públicas podem ser consultadas no catálogo existente; publicação de avaliações está explicitamente indisponível na candidata.

Precisam de medição real: linhas/ações D1, orçamento diário incluindo jobs públicos, sessões por utilizador, crescimento da DB, latência e abuso distribuído. Rate limiting por IP não é teto global de custos. Definir limpeza diária de sessões/challenges expirados com limite e retenção. O Worker limpa challenges expirados na emissão; não tem cron configurado para produção. Antes da produção, operacionalizar limpeza e alertas e rever limites de sessão/dispositivos.

## Recuperação

Sem migração de dados antigos realizada. Nunca ligar conta antiga pela coincidência de email; não importar cache anónima automaticamente. Exportação/migração e recurso web de eliminação continuam pendentes.

Em falha, parar distribuição e manter mapa público. Preservar DB nova; reverter o código Worker compatível com o schema aditivo, ou desativar funções pessoais. Nunca apagar a DB nova para regressar à Supabase. Código Android baseline está no procedimento `../play-store/action-and-rollback-20261008.md`.
