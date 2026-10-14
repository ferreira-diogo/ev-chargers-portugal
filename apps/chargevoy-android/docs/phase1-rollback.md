# Android 1.1.7 — fase 1

Base: `47641fa99d41d4daa550f0638dc623502a69df23`, equivalente em conteúdo ao checkpoint remoto `4db60f5cb19dcb3ce115564efb5095db76e9a913`.
Backup local: tag `backup/android-before-phase1-20261014`; AAB anterior 1.1.6 (código 8) preservado.

Mudanças apenas Android: operadores múltiplos pesquisáveis, faixas de potência múltiplas (OU dentro de cada grupo, E entre grupos), Todos/repor, nomes comerciais Continente, esquema local de preferências v2 com leitura v1, tarifário Continente isolado no pacote Android. Não altera website, contas, favoritos, APIs ou DB.

Continente: 0,35 €/kWh AC até 22 kW, 0,41 €/kWh DC até 120 kW, IVA incluído; benefício condicional 0,10 €/kWh em cartão separado do pagamento. Tarifário aplica-se pelo operador, nunca pelo nome de uma loja. Ultrarrápidos: simulador oficial 0,45 €/kWh, FAQ 0,55 €/kWh; preço por confirmar e exclusão da ordenação automática até resolver divergência. Inatividade 0,20 €/min após 15 minutos de tolerância após conclusão, fora da estimativa. Requer adesão, App Cartão Continente, fatura eletrónica, Continente Pay. Fonte e termos consultados em 2026-10-14: https://feed.continente.pt/plug-charge e https://feed.continente.pt/plug-charge/termos-condicoes.

## Reversão

1. Interromper a distribuição da candidata no canal de testes caso surja regressão.
2. Reverter o commit de fase 1, ou reconstruir o checkpoint remoto anterior numa branch de recuperação.
3. Gerar o AAB com a mesma chave e código superior ao publicado (a Play não aceita downgrade). Não tentar carregar o antigo código 8 como atualização.
4. Os veículos, dados personalizados, favoritos e conta não são migrados nesta fase. A versão anterior só lê filtros v1: repor os filtros e voltar a guardar se a reversão não conseguir ler v2. Conservar um backup das preferências v1 no dispositivo antes da primeira gravação v2.
5. Validar GPS, catálogo, filtros, rotas e login antes de distribuir a recuperação. Não são necessárias reversões de dados nem publicação web.
