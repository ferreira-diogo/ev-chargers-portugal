# ChargeVoy Android — Encontre. Compare. Siga viagem.

Interface Android separada, baseada no ponto de recuperação `cc6d720d5fe1edfdf77aa25116b9dad7a7c680d7`. Toda a interface nova, dependências, configuração Capacitor e projeto nativo estão nesta pasta. O diretório original `ev-charge-portugal-github-ready` fica intacto, incluindo a antiga configuração Android. Não existe publicação web neste fluxo.

## Estrutura

- `src/`: entrada HTML, interface exclusiva, motor de recomendações e cópia independente do controlador atual.
- `android/`: projeto nativo. Release mantém `app.chargevoy.mobile`; debug usa `app.chargevoy.mobile.preview` para coexistência.
- `build.mjs`: copia dados/imagens/estilos base em modo leitura e sobrepõe apenas os componentes Android em `dist/`.
- `verify-isolation.mjs`: compara os 159 ficheiros originais com o checkpoint, incluindo os projetos anteriores; bloqueia diferenças.
- `play-store/`: ficha, preparação de publicação e rollback.

## Compilar

```sh
cd apps/chargevoy-android
npm ci
npm test
npm run android:sync
cd android
./gradlew assembleDebug
```

Java 21 e Android SDK 36 são necessários. A CI define `ANDROID_INCLUDE_CATALOGUE=1` para incluir o catálogo nacional completo no APK, sem importar nada na D1. Compilações locais sem essa variável usam o fallback API. O catálogo estrutural incluído é atualizado a cada compilação; a disponibilidade continua a consultar a fonte live existente. Os workflows Android usam esta pasta. O workflow de release assina com os segredos existentes, sem gerar outra chave, e produz AAB; não envia nada à Play Console. O `versionCode` deve ser superior ao último carregado na Play Console.

## Recomendações e recursos

A primeira versão usa os dados do catálogo existente, incluindo na compilação CI uma cópia do snapshot nacional público existente, antes do fallback API, sem nova tabela nem escrita D1 para recomendações. Distâncias são em linha reta. O objetivo da bateria é local. Tempos de carga estimados usam potência compatível e fator médio de 75%, não uma curva específica do veículo nem espera/deslocação.

Respeita os filtros atuais e o conector do veículo. Seleciona até oito locais compatíveis num raio de 75 km e consulta até quatro IDs de carregadores por ciclo, nos quatro locais mais próximos. Os locais podem agregar vários carregadores: se o orçamento acabar, a comparação tem cobertura parcial e é apresentada como tal. Cache de tarifas em memória: 30 minutos, limite de 100 IDs; falhas aguardam um minuto. Só utiliza linhas de tarifas com menos de 48 horas e campanhas ativas. Planos com mensalidade e EDP não verificada são excluídos da ordenação do menor custo. A sugestão equilibrada requer energia conhecida, preço validado e disponibilidade completa recente com pelo menos um ponto livre. Alternativas mostram explicitamente preços por confirmar e estados desconhecidos/antigos.

O contador `window.AndroidChargeVoy.metrics()` regista consultas adicionais de tarifas e entradas de cache. NÃO mede linhas lidas da D1: isso exige métricas Cloudflare. Mudar zona pode originar novas consultas. A navegação, detalhes, favoritos e autenticação reutilizam os fluxos existentes; os favoritos autenticados podem escrever no serviço de contas como anteriormente.

## Testes

`recommendations.test.mjs` valida energia, elegibilidade, dados ausentes e alternativas. `browser-test.mjs` valida a interface real com fixtures controladas em mobile/tablet e captura imagens QA (não devem ser anunciadas como dados reais). O workflow executa estes testes e compila APK/AAB. Antes da produção, testar GPS, voltar Android, login/callback, navegação externa, offline e acessibilidade em dispositivo real.

A versão preview usa a mesma URI de retorno OAuth do projeto atual; ao coexistir com a versão instalada, o Android pode apresentar escolha de app. Validar login na release pelo teste interno da Play Store. Não se alterou a configuração do fornecedor OAuth.


### APK de teste — preços e localização (03/10/2026)
- Cópia do CSV oficial MOBI.E incluída durante a compilação, sem ler ou escrever D1. Usa o mesmo parser validado do website, apenas em leitura; cópia válida na app por 48 h desde a consulta.
- Até quatro consultas adicionais de tarifas/minuto apenas para candidatos sem cópia recente; cache de respostas com tarifas 30 min e de respostas vazias 5 min. Detalhes reutilizam a cópia disponível.
- Preços finais publicados de campanhas elegíveis podem ser estimados sem inventar componentes OPC. Indicar cartão, condições e confirmação de elegibilidade; mensalidades e cashback não reduzem o preço da sessão.
- Disponibilidade desconhecida permite mostrar uma opção a comparar; não recebe o rótulo de recomendação com disponibilidade recente. Sem tarifa aplicável, o preço permanece desconhecido.
- Ponto azul GPS permanece no mapa ao procurar outra zona; botão centrar solicita a localização apenas quando utilizado, sem acompanhamento contínuo.
- Nove novas fotografias locais e créditos/licenças; seleção por geração/ano preserva as fotografias existentes.
- Website, API, jobs e schema D1 intactos. Backup anterior: backup/android-prices-location-20261003 (ccf7ffe4697828a6c0ae6afbd5320ee4e4907c54).

### Android test refinements — 2026-10-03
- Vehicle thumbnails in the map and route selectors use the licensed photo catalogue, with an illustration fallback and credits in the vehicle screen.
- Map count, zoom and Portugal controls occupy separate areas; map and route GPS actions share the same target icon.
- Removed the user-selectable tariff period. Existing published bi-hourly rates use the local station clock (22:00–08:00 off-peak), including DST and Azores time. Estimates concern starting the session now; card/network components remain included so the displayed total is not merely an OPC fee. No schema, API or website changes.
