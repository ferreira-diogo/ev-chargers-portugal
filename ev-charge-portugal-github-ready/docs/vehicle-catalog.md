# Catálogo de veículos elétricos

O site carrega `assets/vehicle-catalog.json` como catálogo estático de modelos BEV, independentemente da D1. As versões com especificações locais e, quando disponível, as versões da D1 continuam a ser apresentadas. Modelos estáticos que já têm uma versão local detalhada não são duplicados no seletor.

Revisto em 2026-09-29. Esta lista identifica **modelos**, não uma versão ou bateria concreta. As entradas estáticas têm potência e capacidade desconhecidas. Quando selecionadas, o simulador e as rotas identificam que utilizam um perfil genérico (60 kWh, 170 Wh/km, 50 kW DC). Não acrescente especificações numéricas sem uma fonte para a versão exata.

## Fontes e atribuição

Seleção editorial de nomes de modelos, com referência ao projeto [Gaia EVDB](https://github.com/gaia-charge/evdb) (dados CC BY-SA 4.0), complementada e conferida com gamas oficiais: [Mercedes-Benz GLC elétrico](https://www.mercedes-benz.pt/passengercars/models/suv/glc-electric/overview.html), [BMW iX3](https://www.bmw.pt/pt/all-models/x-series/ix3/bmw-ix3.html), [Renault](https://www.renault.pt/configuradores.html), [Volkswagen](https://www.volkswagen.pt/eletricos/eletricos), [Peugeot](https://www.peugeot.pt/showroom/peugeot-5008/eletrico.html), [Kia](https://m.kia.pt/modelos-kia/) e [BYD](https://media.byd.com/section/models/?lang=eng). A seleção do ficheiro JSON é partilhada sob [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); o código da aplicação mantém a sua licença própria.

## Atualização

1. Verificar nos fabricantes se o modelo é 100% elétrico e vendido ou anunciado para o mercado europeu. Excluir versões híbridas mesmo quando partilham o nome.
2. Editar `assets/vehicle-catalog.json`, mantendo o `id` estável e sem inventar bateria, consumo ou potência de carga.
3. Incrementar o `?v=` do ficheiro no carregamento da aplicação e no service worker, e a versão da cache PWA. Atualizar `reviewed_at`.
4. Executar `npm test` e `npm run build:web`; validar no preview a marca, a seleção e a indicação de perfil genérico antes de publicar.

O catálogo estático evita que uma D1 vazia ou indisponível reduza o seletor às poucas versões de recurso e não consome escritas diárias na D1.
