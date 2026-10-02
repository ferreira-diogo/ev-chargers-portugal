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

Java 21 e Android SDK 36 são necessários. Os workflows Android usam esta pasta. O workflow de release assina com os segredos existentes, sem gerar outra chave, e produz AAB; não envia nada à Play Console. O `versionCode` deve ser superior ao último carregado na Play Console.

## Recomendações e recursos

A primeira versão usa os dados do catálogo existente, carregando o snapshot nacional público antes do fallback API, sem nova tabela nem escrita D1 para recomendações. Distâncias são em linha reta. O objetivo da bateria é local. Tempos de carga estimados usam potência compatível e fator médio de 75%, não uma curva específica do veículo nem espera/deslocação.

Respeita os filtros atuais e o conector do veículo. Seleciona até oito locais compatíveis num raio de 75 km e consulta até quatro IDs de carregadores por ciclo, nos quatro locais mais próximos. Os locais podem agregar vários carregadores: se o orçamento acabar, a comparação tem cobertura parcial e é apresentada como tal. Cache de tarifas em memória: 30 minutos, limite de 100 IDs; falhas aguardam um minuto. Só utiliza linhas de tarifas com menos de 48 horas e campanhas ativas. Planos com mensalidade e EDP não verificada são excluídos da ordenação do menor custo. A sugestão equilibrada requer energia conhecida, preço validado e disponibilidade completa recente com pelo menos um ponto livre. Alternativas mostram explicitamente preços por confirmar e estados desconhecidos/antigos.

O contador `window.AndroidChargeVoy.metrics()` regista consultas adicionais de tarifas e entradas de cache. NÃO mede linhas lidas da D1: isso exige métricas Cloudflare. Mudar zona pode originar novas consultas. A navegação, detalhes, favoritos e autenticação reutilizam os fluxos existentes; os favoritos autenticados podem escrever no serviço de contas como anteriormente.

## Testes

`recommendations.test.mjs` valida energia, elegibilidade, dados ausentes e alternativas. `browser-test.mjs` valida a interface real com fixtures controladas em mobile/tablet e captura imagens QA (não devem ser anunciadas como dados reais). O workflow executa estes testes e compila APK/AAB. Antes da produção, testar GPS, voltar Android, login/callback, navegação externa, offline e acessibilidade em dispositivo real.

A versão preview usa a mesma URI de retorno OAuth do projeto atual; ao coexistir com a versão instalada, o Android pode apresentar escolha de app. Validar login na release pelo teste interno da Play Store. Não se alterou a configuração do fornecedor OAuth.
