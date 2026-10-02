# Preparação Play Store — Android 1.1.0

## Pacotes

- APK debug: instalar para pré-visualização, pacote `app.chargevoy.mobile.preview`. Não é o pacote a enviar à Play Store.
- AAB release: assinado com a upload key existente, pacote `app.chargevoy.mobile`. Destino inicial: **teste interno**.
- Default de release: versão 1.1.0, código 2. Confirmar na Play Console o maior código já utilizado e definir um código superior antes da submissão. Não há acesso à Play Console confirmado nesta tarefa.
- SDK alvo: 36. Java 21. Permissões de localização aproximada/precisa e Internet; sem localização em background.

## Assinatura

Workflow `Build signed Android bundle`. Requer `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Não criar uma chave nova para uma app já existente. O workflow falha se os segredos faltarem. Confirmar certificado de upload na Play Console antes de carregar o bundle. AAB assinado não significa app publicada ou aprovada.

## Ficha

Texto em `listing-pt-PT.txt`. Ícone e feature graphic em `artwork/`, quando gerados. Usar capturas da app compilada, não a imagem conceptual. Capturas de QA usam dados controlados e não são prova de tarifas/disponibilidade reais. Criar capturas reais após teste interno.

## Declarações a confirmar pelo titular

- Política de privacidade: página pública preparada nesta alteração: `https://github.com/ferreira-diogo/ev-chargers-portugal/blob/main/apps/chargevoy-android/play-store/privacy.md`; confirmar a publicação do ficheiro em main e o contacto antes de inserir na Play Console.
- Eliminação de conta: fluxo existente na app e `https://github.com/ferreira-diogo/ev-chargers-portugal/blob/main/apps/chargevoy-android/play-store/account-deletion.md`; confirmar o caminho e funcionamento antes da submissão. Não foi alterado o site para esta release.
- Segurança dos dados: declarar o comportamento real do login Google/email, favoritos/histórico/avaliações autenticados, localização quando é enviada para pesquisas/rotas e analytics apenas após consentimento. Não responder “não recolhe dados” genericamente. A bateria/objetivo novos ficam localmente e não são enviados pelo motor de recomendações.
- Publicidade: não há anúncios visíveis nesta interface; confirmar a declaração com as integrações efetivamente incluídas.
- Público-alvo, classificação de conteúdo, contactos de suporte e acesso do revisor.
- Verificação da conta de programador e permissões da Play Console.

## Testar antes de promover

GPS concedido/negado, veículo sem dados, filtros sem resultados, tarifas indisponíveis, estados antigos, login/logout/delete, favoritos, rotas, mapa/detalhes, navegação externa, voltar físico/gesto, rotação, tamanhos de letra e funcionamento offline. Disponibilidade só é apresentada como recente quando provém de leitura válida. Preço promocional apenas dentro da validade.

Contas pessoais novas, se abrangidas pela regra Google, necessitam de teste fechado com pelo menos 12 testers inscritos continuamente durante 14 dias antes de pedir acesso a produção. O teste interno não substitui esse requisito.

## Rollback

Backup git: `backup/android-20261003`, commit `cc6d720d5fe1edfdf77aa25116b9dad7a7c680d7`. Não reverter main com reset/force push. Para regressar ao código anterior, reconstruir o Android antigo nesse checkpoint. Para distribuição pela Play Store, usar a mesma chave e um **versionCode superior** ao da versão problemática: a Play não aceita downgrade de código. Em lançamento gradual, parar o lançamento e preparar a correção/versão anterior recompilada. A preview pode ser removida sem remover a app de produção; os dados locais da preview são separados. O site não participa neste rollback.

## Fontes oficiais consultadas

- https://support.google.com/googleplay/android-developer/answer/11926878 — SDK alvo.
- https://support.google.com/googleplay/android-developer/answer/10787469 — segurança dos dados.
- https://support.google.com/googleplay/android-developer/answer/13327111 — eliminação de conta.
- https://support.google.com/googleplay/android-developer/answer/14151465 — testes para novas contas pessoais.
- https://support.google.com/googleplay/android-developer/answer/9859348 — criar e distribuir releases.
