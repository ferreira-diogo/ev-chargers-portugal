# Android 1.1.9 / código 11 — inventário e cobertura da disponibilidade

Base e rollback de código: d6c282b81e93738c7e20a25b5e12424f12287519 (1.1.8 / 10). Backup remoto: backup/android-1.1.8-before-inventory-20261015. AAB anterior preservado. Para recuar após distribuição Play, reconstruir a base com a mesma chave e um código de versão superior ao último distribuído.

## Alterações

- Contagens identificadas como tomadas reportadas, separadas de registos agrupados, lugares e capacidade simultânea. Um registo NAP não prova a existência de um carregador físico individual.
- Painel com fonte, data estrutural, limitação da cobertura física e ligação ao operador nas cinco localizações revistas. Evidência datada de 15/10/2026, com aviso após 30 dias.
- Os dados Continente descrevem lugares normais/rápidos, não fichas. Nenhum ID de conector, quantidade de fichas DC, potência por ficha ou estado live foi inventado a partir desses lugares.
- Correspondência de evidência exige ID NAP revisto, origem nap-mobie e distância até 500 m da localização publicada pelo operador. Não usa Google Places, nem dados derivados da Google.
- Disponibilidade e tempo da leitura referem-se somente aos conectores reportados. A ausência de disponibilidade AC não marca todo o local indisponível quando os rápidos estão por comunicar.
- Respostas falhadas de atualização conservam tipos de conector e última leitura. Linhas Unknown são apresentadas como pontos sem detalhe, em vez de tomadas físicas confirmadas.
- Filtros, preços, recomendações, rotas/plano B, pesquisa, veículo, preferências, favoritos, login Google, navegação e imagens mantêm os fluxos existentes. Equipamentos sem tipo/potência publicados não entram artificialmente no planeamento ou na comparação de preços.

## Âmbito e custo

Apenas apps/chargevoy-android e workflow da compilação. Sem publicação web, migração D1, novos pedidos de inventário em runtime ou alteração de contas/favoritos. Evidência estática incluída no bundle. Não foi integrado Google Places ou outra API paga.

## Validação

Executar npm test e browser-test.mjs no workflow assinado. Os testes novos cobrem contagens, duplicados, Unknown, limites de correspondência, leituras atuais/antigas/ausentes/futuras, indisponibilidade parcial, atualização da fonte com DC, ausência de perda de conectores após falha, PT/EN e ecrãs 320/390/800.

O AAB é candidato para o canal de testes. A validação automatizada não substitui a atualização num dispositivo físico, login Google e GPS.
