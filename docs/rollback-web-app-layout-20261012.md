# ChargeVoy — website alinhado com a app

## Backup
- Repositório: ferreira-diogo/ev-chargers-portugal.
- Commit anterior: `714fd8032e92b59b78d6e60b7e45744cb6c50586`.
- Branch preservada: `backup/web-before-app-layout-20261012`.
- O workflow `deploy-chargevoy-web.yml` guarda a versão ativa do Worker e o catálogo anterior no artefacto `catalogue-web-rollback-<run_id>` antes de publicar (retenção de 7 dias). A branch de backup permanece disponível.

## Âmbito
Website com navegação lateral no desktop e os quatro menus da app no mobile. Componentes de recomendações, bateria e filtros reutilizados da app. Mapa, pesquisa, veículo, favoritos e detalhes usam os serviços existentes. A app Android não é alterada. Sem migrações, escritas na D1 ou alterações de crons/API. A lógica de recomendações acrescenta leituras de tarifas: até quatro candidatos por atualização, cache positivo 30 minutos e negativo um minuto; o número de linhas depende das tarifas devolvidas.

## Rollback imediato
1. Se a validação automática da publicação falhar, o workflow restaura a versão anterior do Worker automaticamente.
2. Para um problema visual/funcional identificado depois, abrir Cloudflare > Workers & Pages > Worker do website (`broken-mud-373e`) > Deployments e restaurar a versão indicada em `worker-version.txt` do artefacto de backup. Confirmar o Worker correto antes de restaurar.
3. Reverter apenas o commit/merge desta alteração no GitHub, mantendo os commits posteriores. Executar novamente `Deploy ChargeVoy web` na main. Isto impede que a publicação diária volte a aplicar o layout problemático. Não fazer reset/force-push da main nem restaurar a base de dados.
4. Validar mapa nacional, cores dos estados, pesquisa Bragança, detalhes de postos agrupados, rotas, veículo, favoritos e páginas legais. Verificar no telemóvel e num desktop.
5. Recarregar o navegador. O service worker anterior será reinstalado e removerá a cache da versão nova; se necessário, limpar os dados do website no dispositivo afetado.

## Critérios antes de publicar
- `npm test` e `npm run build:web`.
- Teste de navegador com dados controlados: menus, filtros, recomendações, bateria e ausência de overflow horizontal em mobile/desktop.
- Inspeção dos screenshots da execução do navegador.
- Verificação após publicação pelo workflow, incluindo integridade do catálogo nacional e páginas legais.
