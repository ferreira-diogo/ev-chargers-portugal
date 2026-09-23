# EV Charge Portugal

Aplicação web para localizar postos de carregamento em Portugal, filtrar por conector e potência, verificar disponibilidade, selecionar um veículo e preparar uma rota com paragens.

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
- Registo histórico de alterações de disponibilidade para cálculo futuro de fiabilidade.
- Tesla-only identificado separadamente dos postos públicos compatíveis com Tesla.

## Atualização dos postos

A atualização automática é feita pelo Supabase Cron através da Edge Function `import-nap-availability`.

- Frequência do Cron: a cada 5 minutos (`*/5 * * * *`).
- A consulta visual do site também é renovada a cada 5 minutos quando a página está visível.
- A fonte NAP/MOBI.E publica alterações aproximadamente a cada 15 minutos. Por isso, uma execução a cada 5 minutos reduz o atraso de consulta, mas a informação só muda quando a fonte publica um novo snapshot.
- O importador rejeita feeds antigos, futuros, incompletos ou com cobertura inesperada.
- Se a fonte falhar, os últimos dados válidos permanecem disponíveis.
- Quando o snapshot da fonte não mudou, a função termina sem criar snapshots duplicados.
- O estado live fica associado aos conectores através de `available_count`, `status`, `availability_updated_at` e `availability_source`.

## APIs e fontes utilizadas

As chaves e tokens ficam apenas nas variáveis secretas da plataforma. Nunca devem ser colocados neste repositório.

### Dados de postos e conectores

- **Open Charge Map API**: importação e enriquecimento de postos públicos, operadores e conectores.
- **NAP MOBI.E / EADME**:
  - `https://ev-nap.mobie.pt/integration/nap/evChargingInfra` — infraestrutura estática.
  - `https://ev-nap.mobie.pt/integration/nap/evActualStatus` — estado de disponibilidade.
- **Supabase PostgREST**: leitura dos postos, conectores, operadores, tarifas e dados de utilizador.
- **Supabase Edge Functions**: ingestão segura do estado NAP.
- **Supabase Cron + pg_net**: execução automática da ingestão.
- **Supabase Auth**: autenticação, sessões e associação de favoritos/histórico.
- **OpenStreetMap**: cartografia e geocodificação utilizada pelo site.
- **Leaflet**: visualização e interação com o mapa.
- **Google Maps / aplicações de mapas do dispositivo**: abertura de rotas externas através de links.

## Arquitetura live

```
NAP MOBI.E
    │
    ├── evChargingInfra       → infraestrutura e correspondência de postos
    └── evActualStatus        → estados dos pontos de carregamento
            │
            ▼
Supabase Edge Function: import-nap-availability
            │
            ▼
Supabase PostgreSQL
    ├── connectors             → estado atual
    ├── availability_snapshots → alterações históricas
    └── station_source_links   → correspondência NAP/estação
            │
            ▼
Frontend
    ├── consulta dados públicos
    ├── atualiza a cada 5 minutos
    └── cruza estado live com o veículo escolhido
```

Atualmente não é utilizado Cloudflare KV para o estado live. O site pode continuar alojado em Cloudflare Pages/Workers, enquanto a base de dados e a ingestão permanecem na Supabase. Esta separação evita duplicar o estado e mantém o sistema simples.

## Segurança

- Chaves da Open Charge Map, Supabase e tokens de execução são configurados como secrets.
- A chave pública do Supabase pode ser usada no frontend com RLS ativo.
- A service role key nunca deve ser colocada no HTML, JavaScript público, README ou GitHub.
- O token usado pelo Cron para chamar a Edge Function é validado no servidor.
- Tabelas privadas, staging e backups não são expostas ao frontend.

## Estrutura principal

- `index.html` — aplicação web.
- `service-worker.js` — suporte PWA/cache do browser.
- `scripts/import-nap-availability.mjs` — parser, validação e importação manual.
- `scripts/import-nap-availability.test.mjs` — testes do parser e das validações.
- `supabase/functions/import-nap-availability/index.ts` — Edge Function live.
- `supabase/deployments/` — scripts de instalação e configuração.
- `supabase/rollback/` — scripts de rollback.
- `.github/workflows/` — validações e execução manual de importação.

## Operação e rollback

Antes de alterações estruturais deve ser criado um backup no schema privado. O backup atual do agendamento encontra-se em:

`private.nap_cron_backup_20260923`

Para reverter o intervalo, usar o backup e alterar o Cron para:

```sql
select cron.alter_job(1, '3,18,33,48 * * * *');
```

O rollback da funcionalidade NAP live está documentado em `supabase/rollback/nap-live.sql`.

## Custo

A arquitetura foi mantida com serviços gratuitos:

- Cloudflare para alojamento e entrega do site.
- Supabase para base de dados, autenticação, Edge Function e Cron.
- OpenStreetMap/Leaflet para o mapa.
- NAP MOBI.E e Open Charge Map como fontes públicas.

Os limites dos fornecedores devem ser monitorizados. O site não deve assumir que uma chave ou plano pago está disponível, e não deve guardar credenciais no código.

## Desenvolvimento

Abrir a pasta `ev-charge-portugal-github-ready`, instalar dependências e executar:

```bash
npm ci
npm test
```

As importações manuais devem ser executadas apenas com as variáveis secretas configuradas no ambiente seguro.

## Licença

Ver `LICENSE`.
