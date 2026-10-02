# Catálogo diário e total de fichas por local — 2 outubro 2026

## Versão anterior

- Commit: `115a526589ff418660033f206de9b72d50eb3c5a`.
- Backup Git: `backup/catalogue-20261002-before-location-totals`.
- Antes de cada publicação, o workflow `Deploy ChargeVoy web` guarda o ID exato
  da versão Worker que está a servir 100% do tráfego, e o catálogo anterior,
  no artefacto `catalogue-web-rollback-<run_id>` (7 dias).
- Antes de cada sincronização, `D1 station fallback sync` guarda um bookmark
  D1 em `catalogue-d1-rollback-<run_id>` (artefacto por 7 dias; a possibilidade
  de restaurar depende também da janela Time Travel disponível na Cloudflare).

## Alterações

- D1: interpretar o documento JSON final do Wrangler, ignorando mensagens de
  progresso. Não repetir um upload que terminou com sucesso só por um erro de parsing.
- Publicação do catálogo do mapa: diária às 04:47 UTC, além das publicações por
  alterações de código. Continua independente da disponibilidade em KV e da D1.
- O mapa, lista e detalhe agrupam registos NAP do mesmo operador, morada,
  município e coordenadas (5 casas decimais). Outros operadores e locais ficam separados.
- IDs de estações e de conectores, favoritos e leituras individuais são preservados.
  O plano B e as sugestões do corredor de rota também evitam repetir o mesmo local.
- Fátima, Av. João XXIII 137: os seis registos `FCT-ORM-00032` a `00037`
  contêm 15 fichas (12 CCS, 3 CHAdeMO). Fichas não equivalem a carros simultâneos.
- Uma resposta D1 parcial não reduz o detalhe abaixo do catálogo já carregado.
- Antes de publicar, bloquear perdas superiores a 5% de postos ou conectores.
  Depois de publicar, verificar o SHA-256 e tamanho exatos do catálogo gerado.
- A validação live regista Ray ID, tipo de bloqueio e um excerto da resposta
  quando encontra HTTP 403, para permitir correlacionar o próximo evento de segurança.

## Rollback do site

1. Se a validação depois do deploy falhar, o workflow repõe automaticamente o
   ID Worker guardado antes desse deploy, incluindo o catálogo dessa versão.
2. Se aparecer uma regressão depois da validação, desativar temporariamente
   `Deploy ChargeVoy web` no GitHub Actions, para impedir novas publicações.
3. Descarregar o artefacto do deploy relevante, ler `worker-version.txt` e repor:

   ```bash
   npx wrangler rollback <worker-version.txt> --name broken-mud-373e --message "Rollback catalogue location totals"
   ```

   Substituir `<worker-version.txt>` pelo UUID contido nesse ficheiro. Executar
   com a conta/token Cloudflare do projeto. Confirmar homepage, catálogo e live.
4. Reverter o commit desta alteração com `git revert <commit-da-alteracao>` e
   publicar esse commit no main, sem force-push. O backup Git mantém a referência
   exata anterior. O revert também remove a nova publicação diária.
5. Reativar o workflow só depois de confirmar os ficheiros revertidos. Um novo
   deploy reconstrói dados atuais; o rollback Worker é que repõe o catálogo exato anterior.

## D1

O agrupamento é feito no navegador: não apaga nem funde linhas D1. A
sincronização continua incremental e sem DELETE, com teto de 60.000 escritas
por execução. Os limites diários da conta devem continuar a ser monitorizados.

Uma regressão de interface exige apenas rollback do site e do código. Se houver
dados estruturais incorretos, parar primeiro `D1 station fallback sync` e
identificar as linhas afetadas. Preferir correção dessas linhas a partir do
catálogo anterior. Não restaurar automaticamente toda a D1, pois Time Travel
também reverte alterações posteriores noutras tabelas.

Só se estiver confirmado que nenhuma alteração posterior precisa de ser
preservada, ler `bookmark` de `d1-before.json` e executar:

```bash
npx wrangler d1 time-travel restore chargevoy-fallback --bookmark=<bookmark>
```

Depois, validar contagens, API, mapa e disponibilidade. O KV não é restaurado
nem modificado por esta operação de recuperação do catálogo.
