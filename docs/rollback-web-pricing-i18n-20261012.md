# Correção das traduções e preços do website

Backup do código: `backup/web-before-pricing-i18n-fix-20261012`, commit `4f97b2977b56787c0c3b8a2fa99ba29d17761b89`.

O CSV oficial tem 30 319 538 bytes (243 001 linhas). O limite anterior de 15 MB recusava-o desde pelo menos 10/10/2026. O novo limite é 50 MB; tamanho mínimo, schema, cobertura, compatibilidade, preço e frescura mantêm validação. A confirmação diária usa julianday para comparar timestamps ISO corretamente e manter confirmação com idade até 24h, dentro da janela de 48h do website. Só os registos alterados ou a necessitar de confirmação são escritos. Nenhum preço antigo é apresentado como validado para contornar o problema.

Antes da primeira escrita, o job D1 MOBI.E tariff sync exporta apenas a tabela official_opc_tariffs. O artefacto tariff-rollback-<run_id> é guardado por 30 dias. A execução para se o backup falhar. A importação não apaga registos existentes.

Rollback do website: restaurar a versão anterior do Worker guardada pelo workflow Deploy ChargeVoy web; reverter o commit de correção no GitHub para evitar republicação diária. Não restaurar a base inteira.

Rollback das tarifas: interromper uma importação ainda ativa, obter official_opc_tariffs.sql do artefacto de backup da execução, confirmar o alvo D1 e validar o SQL exportado. Restaurar apenas a tabela de tarifas a partir desse backup num período sem importações concorrentes. Se a falha for apenas de interface/tradução, não restaurar tarifas válidas. Reverter o importador em conjunto se necessário; não alterar estações, disponibilidade, utilizadores ou favoritos.

Validação: testes de dados e preços, troca PT→EN→PT incluindo atualizações dinâmicas e diálogo, garantia de ausência de consultas por mudança de idioma, importação oficial em modo preparação sem escritas, build e validação de publicação. A app Android não é alterada.

A ação Mais barato verifica candidatos ainda sem consulta, com limite de quatro novas consultas por atualização e cache de 30 minutos para tarifas devolvidas e um minuto para respostas vazias. Um resultado sem tarifa recente apresenta uma mensagem explícita; não inventa ou considera zero o preço. A validação do CSV encontrou 13 576 tarifas em 6 440 postos.
