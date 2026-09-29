# ChargeVoy — análise de quotas e continuidade

Análise de código em 2026-09-29. Nenhuma base de dados, binding, cron ou armazenamento foi alterado por este documento. Os valores efetivos da conta exigem consulta ao painel Cloudflare e aos metadados de cada execução.

## Limites relevantes do plano gratuito

| Serviço | Limite | Implicação |
| --- | ---: | --- |
| D1 | 100 000 linhas escritas/dia, 5 milhões lidas/dia, por conta | Uma segunda D1 na mesma conta não duplica o orçamento diário. Índices também podem aumentar linhas escritas. |
| Workers KV | 1 000 escritas/dia, 100 000 leituras/dia | O snapshot nacional a cada 5 min consome até 288 escritas/dia. Um pedido manual por janela de 5 min pode acrescentar até 288; reservar margem para outras chaves e para propagação/concorrência. |
| Workers Free | 100 000 pedidos/dia, 10 ms de CPU por pedido | O Worker que serve site e API deve ser separado do site estático para preservar a página se a API atingir o limite. |
| Supabase Free | 500 MB de Postgres, 5 GB de egress e 5 GB de egress em cache por mês | Útil para Auth e dados editáveis; um catálogo nacional entregue integralmente a cada visita pode consumir egress rapidamente. Projetos inativos podem pausar. |
| R2 Standard | 10 GB-mês, 1 milhão de operações A e 10 milhões B por mês | Opção para snapshots publicados independentemente do deploy. Confirmar requisitos de ativação e controlar operações antes de adotar. |

Fontes: Cloudflare D1 pricing/limits, KV limits, Workers limits e R2 pricing; Supabase pricing (consultadas em 2026-09-29).

## O que o código faz hoje

- A D1 guarda o catálogo estrutural de postos, conectores, mapeamentos, veículos e tarifários. O Worker local já usa um snapshot nacional estático quando a D1 falha. A página inicial tenta D1 e depois o snapshot estático.
- O workflow estrutural é diário e usa UPSERT condicional para postos e conectores, mas o guard de 95 000 conta linhas candidatas, não as escritas reais dos índices nem os tarifários. A importação de preços corre também num workflow separado. O workflow OSM manual ainda faz substituição completa e merece proteção antes de ser usado.
- O estado NAP está numa única chave KV, atualizado pela GitHub Action. A leitura do KV ocorre a cada pedido de postos/conectores, incluindo páginas nacionais. O pedido manual preparado neste ramo partilha uma janela global de cinco minutos.
- O site público é atualmente publicado por um Worker com assets estáticos; o limite de pedidos Worker é, por isso, um risco para a própria página pública.

## Recomendação em duas fases, sujeita a aprovação

1. **Sem migração:** medir por 7 dias linhas lidas/escritas D1 por workflow, operações KV e pedidos Worker. Corrigir o guard com o `meta.rows_written` real e uma margem por rotina, parar importações antes do limite, retirar o workflow OSM destrutivo ou torná-lo incremental. Gerar um snapshot nacional versionado com manifesto e checksum; validar cobertura antes de o publicar.
2. **Separar disponibilidade do catálogo:** servir HTML, JS e catálogo nacional particionado como assets estáticos no Pages/CDN. O Worker fica apenas com endpoints dinâmicos; o estado KV continua separado e com cache curta por região/edge. Se o ficheiro estático ou a publicação independente exigir, usar R2 para snapshots versionados. Conservar D1 para tabelas editáveis e consultas que não caibam nos ficheiros estáticos; conservar Supabase para Auth e dados pessoais. Se a D1 falhar, mapa e rotas usam o snapshot; se KV falhar, mostrar a última leitura com hora, nunca como LIVE.

Uma segunda D1 **na mesma conta** ajuda a isolar catálogos e manutenção, mas não resolve a quota partilhada. Migrar todas as leituras públicas para Supabase desloca a pressão para o egress mensal e cria outra dependência. A preferência é retirar o catálogo público repetitivo do caminho das bases de dados e preservar duas vias de publicação/consulta.

## Critérios de decisão e rollback

- Medir diariamente `rows_read`/`rows_written` por rotina, tamanho e transferências do snapshot, leituras/escritas KV, pedidos Worker e idade de publicação NAP.
- Só avançar para R2 ou outra base depois de quantificar esses valores e validar o custo e os limites da conta real.
- Publicar uma versão estática anterior de imediato se uma atualização de catálogo vier incompleta. Manter a última versão válida do snapshot e a versão anterior do Worker. Não apagar D1 nem Supabase durante a transição.
