# Correções de rotas e preços — rollback

Web: backup/web-before-audit-p0-20261013, 42073f68f3d77e3f1e619517def2c21372c10fc3.
Android: backup/android-before-audit-p0-20261013, 0670b8abae82e048da10bc9704eb4ec681a84bd5.

As alterações estão em branches separadas. Não há migrações D1, alterações KV, novos crons ou publicação automática no website a partir destas branches.

Para reverter a web após futura publicação: reverter o commit das correções, aumentar a versão da cache PWA e publicar preservando o snapshot validado. Não fazer reset/force-push em main.

Android candidata 1.1.4, versionCode 6. Se já estiver distribuída na Play, reconstruir o checkpoint anterior com a mesma chave e versionCode superior ao maior já usado. Parar rollout se aplicável; não enviar downgrade. Antes do upload confirmar o maior código na Play Console.

Limites: os desvios do percurso principal e o consumo continuam estimativas; até três alternativas rodoviárias são verificadas por paragem. Sem resposta válida do router não se apresenta plano B não verificado. Não há suporte novo a iOS/Automotive nem alertas.

Validação: testes de compatibilidade AC/DC, tarifa de potência diferente, preço fixo sem OPC, reserva insuficiente, resposta malformada, falha de router e limite de pedidos; suites existentes e browser QA em CI. A branch Android mantém o website/shared source no checkpoint aprovado.
