# ChargeVoy — EV Charging & Routes

Aplicação web/móvel para localizar postos de carregamento em Portugal, filtrar por conector e potência, verificar disponibilidade, selecionar um veículo e preparar uma rota com paragens.

## Estado atual

- Site responsivo para desktop e telemóvel.
- Mapa com Leaflet e OpenStreetMap.
- Pesquisa por localização, origem e destino.
- Filtros por tipo de conector, potência, operador e compatibilidade com o veículo.
- Perfil de veículo e cálculo de autonomia estimada.
- Sugestão de paragens e alternativa quando existe risco de não chegar ao destino.
- Ligações de navegação para Google Maps e outros mapas compatíveis.
- Login com Supabase Auth, incluindo Google OAuth quando ativado no projeto.
- Favoritos, histórico de rotas e estrutura preparada para avaliações.
- Indicadores de disponibilidade: disponível, ocupado, indisponível, desconhecida e dados desatualizados.
- Tesla-only identificado separadamente dos postos públicos compatíveis com Tesla.

## Arquitetura Cloudflare atual

A infraestrutura pública do ChargeVoy é Cloudflare-first. O catálogo de postos/conectores e os mapeamentos de fontes ficam em Cloudflare D1; o snapshot de disponibilidade corrente fica em Cloudflare KV; Workers expõem a API consumida pelo frontend. Supabase não é a base de dados do catálogo/live. A utilização remanescente de Supabase deve limitar-se a funcionalidades ainda não migradas, como autenticação/dados privados e Edge Functions que ainda não tenham equivalente Worker.

### Atualização dos postos e estado live

- `evChargingInfra` do NAP/MOBI.E alimenta o catálogo NAP em D1 e o mapeamento explícito `site_id + point_id -> station_id + connector_id`.
- `evActualStatus` alimenta o snapshot KV `mobie_nap_current`.
- O workflow de disponibilidade consulta a fonte a cada 5 minutos (`*/5 * * * *`).
- Um snapshot só é apresentado como **live** durante 5 minutos. Depois disso os conectores passam a `unknown/stale`; o snapshot antigo pode permanecer guardado apenas para diagnóstico.
- O Worker cruza D1 e KV através de `nap_connector_mapping`. A inferência por IDs legados existe apenas como fallback transitório durante a migração.
- O estado live exposto aos clientes usa `available_count`, `status`, `availability_updated_at` e `availability_source`.
- O frontend renova os dados periodicamente quando a página está visível.

## APIs e fontes utilizadas

As chaves e tokens ficam apenas nas variáveis secretas da plataforma. Nunca devem ser colocados neste repositório.

### Dados de postos e conectores

- **NAP MOBI.E / EADME**:
  - `https://ev-nap.mobie.pt/integration/nap/evChargingInfra` — infraestrutura estática e IDs oficiais NAP.
  - `https://ev-nap.mobie.pt/integration/nap/evActualStatus` — disponibilidade atual publicada pelos operadores.
- **Cloudflare D1** — catálogo público, conectores, operadores, mapeamentos NAP e restantes dados públicos migrados.
- **Cloudflare KV** — snapshot rápido da disponibilidade NAP corrente.
- **Cloudflare Workers** — API pública, junção D1+KV e entrega do site.
- **OpenStreetMap / Overpass** — cartografia e enriquecimento complementar.
- **Leaflet** — visualização e interação com o mapa.
- **Supabase Auth** — autenticação enquanto esta componente não for migrada.

## Arquitetura live

```
NAP MOBI.E
    │
    ├── evChargingInfra ──> import/sync ──> Cloudflare D1
    │                                      ├── station_cache_v2
    │                                      ├── connectors
    │                                      └── nap_connector_mapping
    │
    └── evActualStatus ──> refresh 5 min ─> Cloudflare KV
                                           └── mobie_nap_current
                                                    │
                         D1 mapping + KV snapshot ───┤
                                                    ▼
                                           Cloudflare Worker API
                                                    │
                                                    ▼
                                                Frontend
```

A chave de disponibilidade no KV é `site_id|point_id`. D1 mantém a correspondência explícita para os IDs internos. Isto evita depender de parsing heurístico dos IDs e permite que o catálogo evolua sem perder a associação ao estado live.

## Rotas

O cálculo de rota usa OSRM para obter a geometria e consulta postos na bounding box do percurso. Os candidatos são depois filtrados pela distância ao corredor, compatibilidade com o veículo e autonomia/SOC. A lista local do mapa é apenas fallback se a consulta de corredor falhar.

## Segurança

- Tokens Cloudflare e outras credenciais de servidor são secrets.
- Tokens com permissões de escrita em D1/KV nunca devem ser enviados para o frontend.
- A service role Supabase nunca deve ser colocada no HTML, JavaScript público, README ou GitHub.
- Tabelas privadas e dados de autenticação não são expostos pela API pública.

## Estrutura principal

- `index.html` — aplicação web.
- `service-worker.js` — suporte PWA/cache do browser.
- `worker/index.js` — Worker principal e API D1+KV.
- `cloudflare/d1/schema.sql` — schema público D1.
- `scripts/import-nap-datex.mjs` — parser/validação da infraestrutura NAP e geração do snapshot D1.
- `scripts/build-nap-d1-mapping.mjs` — geração do mapping explícito NAP para D1.
- `scripts/import-nap-availability.mjs` — parser/validação do `evActualStatus`.
- `scripts/refresh-nap-availability-kv.mjs` — atualização do snapshot live em KV.
- `.github/workflows/d1-stations-sync.yml` — sincronização periódica do catálogo/mapping D1.
- `.github/workflows/refresh-nap-availability.yml` — atualização do estado live a cada 5 minutos.

## Operação e rollback

Antes de alterações estruturais deve existir um ponto de rollback. Para a migração do mapping live Cloudflare, a baseline é `03daaa241890ff7ef5c95116e4e9d92bf980e00d` e a branch dedicada é `rollback/pre-cloudflare-nap-live-mapping`.

As alterações de schema são aditivas e idempotentes (`CREATE TABLE/INDEX IF NOT EXISTS`). O Worker mantém fallback para o formato anterior enquanto o mapping D1 ainda não estiver disponível, permitindo aplicar a migração e o deploy sem janela de indisponibilidade.

## Custo

A arquitetura privilegia Cloudflare D1/KV/Workers e fontes públicas NAP MOBI.E/OpenStreetMap. O refresh live de 5 minutos representa até 288 verificações por dia. As quotas Cloudflare e o volume dos feeds NAP devem ser monitorizados.

## Desenvolvimento

Abrir a pasta `ev-charge-portugal-github-ready`, instalar dependências e executar:

```bash
npm ci
npm test
```

As importações manuais devem ser executadas apenas com as variáveis secretas configuradas no ambiente seguro.

## Experiência mobile e aplicação

O site é também uma Progressive Web App (PWA):

- `manifest.webmanifest` e `service-worker.js` permitem instalar o ChargeVoy no ecrã inicial, em modo standalone.
- O mapa usa densidade progressiva: em zoom afastado agrupa visualmente os postos; ao aproximar mostra mais detalhe.
- No telemóvel, o detalhe do posto abre num painel inferior compacto.
- A instalação é iniciada no menu da conta quando o navegador disponibiliza essa opção.

## Android / Google Play

O projeto Android nativo está em `android/` e usa Capacitor 8. O identificador Android atual é `pt.evcharge.portugal` e não deve ser alterado depois da primeira publicação na Google Play.

### Preparar uma compilação

```bash
npm ci
npm run android:sync
npm run android:open
```

A aplicação pede localização apenas quando o utilizador usa a funcionalidade correspondente; os dados de postos são atualizados pelas fontes do backend sem exigir publicar uma nova versão da aplicação.

## Licença

Ver `LICENSE`.
