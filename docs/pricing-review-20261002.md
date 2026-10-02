# Revisão de preços — 2 outubro 2026

Backup remoto: `backup/prices-20261002-2315`, commit `ba88df753132f4779599c8ec44d00077b1c34958`.

As tarifas OPC são atualizadas pelo workflow D1 MOBI.E; o catálogo CEME é separado e mantido manualmente. A validade é agora verificada no cálculo e na apresentação, segundo a data de Europe/Lisbon. O service worker consulta o catálogo online primeiro e conserva a última versão para utilização offline, sujeita à mesma verificação de validade.

| Fornecedor | Resultado da revisão oficial |
| --- | --- |
| myAtlante | 1 outubro–31 dezembro 2026: 0,55 €/kWh sem subscrição; Go 0,49 €/kWh + 7,99 €/mês. Rápidos/ultrarrápidos elegíveis pela app/RFID. ChargeBack futuro 25%/10% ou Go 50%/20%, rede própria/outras. |
| PRIO | Valores mantidos; fonte sem data final explícita. |
| Via Verde | Valores mantidos; fonte sem data final explícita. |
| Galp | Valores mantidos; tabela em vigor desde 1 janeiro 2026, sem termo explícito. |
| Repsol | Valores mantidos; tabela em vigor desde 1 janeiro 2026. A pasta 22-05-2026 não indica início de validade. |
| EDP | Fontes com preços divergentes; estimativa final continua desativada. |

Fontes: URLs registadas em `ev-charge-portugal-github-ready/assets/ceme-cards.json`. Não foram inventadas datas finais para tabelas permanentes. Planos com mensalidade não recebem o destaque de menor estimativa sem subscrição; o custo mensal não é imputado integralmente a cada carregamento. Cashback não reduz o preço da sessão.

## Rollback

O workflow de publicação captura a versão anterior do Worker e reverte automaticamente se a verificação após publicação falhar; consultar o artefacto `catalogue-web-rollback-<run_id>` (retenção de sete dias). O backup git é independente dessa retenção.

Para reverter apenas esta alteração, num branch novo da versão atual de main:

```sh
git restore --source=ba88df753132f4779599c8ec44d00077b1c34958 --staged --worktree -- ev-charge-portugal-github-ready/assets/ceme-cards.json ev-charge-portugal-github-ready/assets/chargevoy.js ev-charge-portugal-github-ready/index.html ev-charge-portugal-github-ready/service-worker.js ev-charge-portugal-github-ready/scripts/data-regressions.test.mjs ev-charge-portugal-github-ready/scripts/verify-web.mjs
```

Rever o diff, executar `npm test` no diretório da aplicação, criar commit e publicar pelo fluxo normal. Se houver alterações posteriores nos mesmos ficheiros, reverter o commit desta correção com resolução manual preserva essas alterações. Não resetar main nem fazer force push. A revisão documentada não altera os dados dos postos ou de disponibilidade.
