# NAP audit e monitorização de disponibilidade — 2026-10-17

Backup: backup/monitoring-before-fix-20261017, em
55961e7156f7d46a81e64c552eb73f8d80a27e0a.

## Causas confirmadas em logs

NAP DATEX II audit: runs 39067641016 e 39046001692 falham com 38 sites com
coordenadas inválidas. O modo agendado antigo tenta staging Supabase e valida o
feed bruto; o fluxo de publicação web já tem quarentena limitada e não exige
que esses registos inválidos sejam publicados.

Validate production live availability: runs 39059888958 e 39050348121 param em
https://chargevoy.pt/ com HTTP 403 e cf-mitigated: challenge, antes de ler KV.
Isto não demonstra indisponibilidade da API. O mesmo verificador é chamado após
deploy pelo workflow Validate live map production.

## Correção

O audit passa a ser apenas leitura em todos os eventos: aplica a quarentena web
existente, compara com o catálogo publicado e produz candidato e relatório,
sem publicar, staging, tokens Supabase, alterações D1 ou KV. Mantém limite de
1%/100 sites inválidos, mínimos nacionais, unicidade, conectores órfãos,
publicação/data e regressão máxima de 5% perante a baseline publicada.
O relatório e log ficam como artefacto 14 dias; os registos não são corrigidos
nem inventados pelo audit. Os fluxos reais de atualização de postos e
Refresh NAP availability snapshot permanecem independentes e inalterados.

Os monitores verificam o Worker de produção pelo endereço de serviço e a API
chargevoy-api. Não alteram regras Cloudflare, não falsificam o browser e não
consideram desafios 403 um sucesso. Isto verifica serviço/catálogo/KV, não a
experiência de acesso ao domínio público através do WAF. A API de disponibilidade
é consumida tanto pelo Android como pelo website, por isso mantém-se a
monitorização em vez de eliminar o job.

Mantêm-se hash, bytes, cobertura, timestamp e contagem de pontos; dados com mais
de 20 minutos ou mais de 5 minutos no futuro continuam a falhar. Leituras entre
5 e 20 minutos emitem aviso; não são anunciadas como live. Testes exercitam
respostas 403, divergência de hash, catálogo incompleto e disponibilidade inválida.
Não há instalação npm nos monitores que só usam módulos standard do Node.

## Recuperação

Reverter os workflows/scripts deste PR à branch de backup. Não restaurar bases
de dados: esta correção não escreve em dados de utilizadores, D1 ou KV.
Não reverter nem republicar a interface web ou o APK para recuperar os jobs.
