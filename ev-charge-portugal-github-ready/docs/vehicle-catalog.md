# Catálogo de veículos elétricos

O site lê `assets/vehicle-catalog.json`, mesmo com a D1 vazia. O catálogo contém versões de 2023–2027 com bateria útil, consumo e potência DC provenientes de [Gaia EVDB](https://github.com/gaia-charge/evdb), e modelos sem dados técnicos quando não existe uma versão suficientemente atribuída. A fonte de cada versão aparece em `source_url`; o conjunto de dados e a seleção derivada são CC BY-SA 4.0. `source_commit` fixa a revisão de origem. Os valores variam com mercado, ano, bateria e equipamento: selecionar a versão correspondente ao carro e conferir a ficha do fabricante.

O gerador `scripts/refresh-vehicle-catalog.py` exige a marcação `verified` da origem, fonte HTTPS que aponte para uma página concreta, bateria útil entre 15–125 kWh, consumo entre 100–400 Wh/km e carga DC entre 30–400 kW. Exclui Leaf (CHAdeMO) e Model S/X (conector dependente do mercado). Isto é um filtro de plausibilidade, não uma verificação manual de cada fonte. Novas versões devem ser revistas no pull request antes de publicação.

O seletor acrescenta “Outro modelo elétrico” por marca. Os campos “Bateria útil”, “Consumo” e “Carga DC” são guardados no navegador por veículo e substituem os dados da versão para simulação e rota. Campos em falta continuam com estimativas explícitas de 60 kWh, 170 Wh/km e 50 kW DC. Os modelos sem versão detalhada conservam nomes da seleção editorial anterior.

## Atualização semanal

Às segundas-feiras, `.github/workflows/refresh-vehicle-catalog.yml` obtém Gaia EVDB, gera o JSON e executa os testes. Se houver alterações, abre um pull request para revisão humana; só um merge inicia o deploy de produção. Se o repositório desativar a permissão do `GITHUB_TOKEN` para criar pull requests, ativar nas definições de Actions “Allow GitHub Actions to create and approve pull requests”. A execução manual (`workflow_dispatch`) usa o mesmo processo.

Para executar localmente: instalar `PyYAML==6.0.2`, clonar `https://github.com/gaia-charge/evdb`, executar `python3 scripts/refresh-vehicle-catalog.py /caminho/evdb` e `npm test`. Conferir as novas versões, os respetivos links de fonte, conectores e valores antes de aprovar o PR. Atualizar `reviewed_at` após revisão; se o JSON mudar manualmente, incrementar o parâmetro `?v=` e a cache PWA.
