# ChargeVoy — análise de quotas e continuidade

Análise de código em 2026-09-29. Nenhuma base de dados, binding, cron ou armazenamento foi alterado por este documento. Os valores efetivos da conta exigem consulta ao painel Cloudflare e aos metadados de cada execução.

## Limites relevantes do plano gratuito

| Serviço | Limite | Implicação |
| --- | ---: | --- |
| D1 | 100 000 linhas escritas/dia, 5 milhões lidas/dia, por conta | Uma segunda D1 na mesma conta não duplica o orçamento diário. Índices também podem aumentar linhas escritas. |
| Workers KV | 1 000 escritas/dia, 100 000 leituras/dia | O snapshot nacional a cada 5 min consome até 288 escritas/dia. Um pedido manual por janela de 5 min pode acrescentar até 288; reservar margem para outras chaves e para propagação/concorrência. |
| Workers Free | 100 000 invocações do script/dia, 10 ms de CPU por pedido | Os assets estáticos correspondentes são servidos antes do script e sem consumir esta quota. O mapa deve ler o catálogo como asset direto; os endpoints dinâmicos continuam sujeitos ao limite. |
| Supabase Free | 500 MB de Postgres, 5 GB de egress e 5 GB de egress em cache por mês | Útil para Auth e dados editáveis; um catálogo nacional entregue integralmente a cada visita pode consumir egress rapidamente. Projetos inativos podem pausar. |
| R2 Standard | 10 GB-mês, 1 milhão de operações A e 10 milhões B por mês | Opção para snapshots publicados independentemente do deploy. Confirmar requisitos de ativação e controlar operações antes de adotar. |

Fontes: Cloudflare D1 pricing/limits, KV limits, Workers limits e R2 pricing; Supabase pricing (consultadas em 2026-09-29).

## O que o código faz hoje

- A D1 guarda o catálogo estrutural de postos, conectores, mapeamentos, veículos e tarifários. O Worker local já usa um snapshot nacional estático quando a D1 falha. A página inicial tenta D1 e depois o snapshot estático.
- O workflow estrutural é diário e usa UPSERT condicional para postos e conectores, mas o guard de 95 000 conta linhas candidatas, não as escritas reais dos índices nem os tarifários. A importação de preços corre também num workflow separado. O workflow OSM manual ainda faz substituição completa e merece proteção antes de ser usado.
- O estado NAP está numa única chave KV, atualizado pela GitHub Action. A leitura do KV ocorre a cada pedido de postos/conectores, incluindo páginas nacionais. O pedido manual preparado neste ramo partilha uma janela global de cinco minutos.
- O site público é publicado por um Worker com assets estáticos. Como não usa `run_worker_first`, os ficheiros correspondentes são servidos diretamente; o limite diário afeta os endpoints dinâmicos. O catálogo estático deve ser a fonte primária do mapa e das rotas, com disponibilidade do KV consultada em separado.

## Recomendação em duas fases, sujeita a aprovação

1. **Nesta implementação:** validar a cobertura e o checksum do snapshot antes do build Cloudflare; servi-lo diretamente como asset principal do Worker atual. O mapa usa uma consulta KV por atualização nacional e mantém a última leitura datada se ela falhar. Os workflows estruturais e de tarifas deixam de duplicar a importação; a rotina OSM destrutiva é recusada. A importação estrutural para quando atinge 60 000 linhas escritas por execução, além do limite prévio de candidatas.
2. **Medição e expansão:** acompanhar por 7 dias linhas lidas/escritas D1 totais da conta, operações KV, invocações Worker, tamanho do snapshot e idade MOBI.E. O limite da execução não conhece os consumos de outros workflows: se o total da conta se aproximar de 100 000 linhas/dia, reduzir ou suspender importações. Só migrar para Pages/R2 se for necessário publicar os ficheiros independentemente do Worker ou se o asset crescer para além de 25 MiB. Conservar Supabase para Auth e dados pessoais.

Uma segunda D1 **na mesma conta** ajuda a isolar catálogos e manutenção, mas não resolve a quota partilhada. Migrar todas as leituras públicas para Supabase desloca a pressão para o egress mensal e cria outra dependência. A preferência é retirar o catálogo público repetitivo do caminho das bases de dados e preservar duas vias de publicação/consulta.

## Critérios de decisão e rollback

- Medir diariamente `rows_read`/`rows_written` por rotina, tamanho e transferências do snapshot, leituras/escritas KV, pedidos Worker e idade de publicação NAP.
- Só avançar para R2 ou outra base depois de quantificar esses valores e validar o custo e os limites da conta real.
- Publicar uma versão estática anterior de imediato se uma atualização de catálogo vier incompleta. Manter a última versão válida do snapshot e a versão anterior do Worker. Não apagar D1 nem Supabase durante a transição.
