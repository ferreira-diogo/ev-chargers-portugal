# Backups, Storage e rollback

## Estado desta alteração

A otimização publicada em setembro de 2026 altera apenas o frontend:

- a lista/mapa carrega primeiro postos e operadores;
- conectores são consultados apenas quando um posto é aberto;
- a atualização periódica refresca apenas o posto selecionado;
- avaliações/fiabilidade continuam a ser consultadas por posto;
- não há migração, apagamento ou alteração de dados na Supabase.

Rollback do frontend: reverter o commit que introduziu a otimização e publicar novamente a versão anterior. Os commits ficam no histórico do GitHub.

## Backups de dados

Os backups da base de dados devem permanecer privados. O catálogo de veículos tem uma cópia privada na Supabase em `private.vehicle_models_backup_20260924`, com script de recuperação em `supabase/rollback/20260924_vehicle_catalog_update.sql`.

Não guardar dumps SQL, chaves, tokens ou dados de utilizadores no GitHub público nem num bucket público.

## Uso recomendado da Storage de 1 GB

A Storage gratuita deve ser reservada para ativos pequenos e reutilizáveis:

- fotografias de postos selecionadas e comprimidas em WebP/AVIF;
- logótipos de operadores;
- imagens de veículos, se forem necessárias;
- imagens da marca e fallback da aplicação.

Regras práticas:

- guardar apenas a versão otimizada, idealmente 100–250 KB por imagem;
- definir limite de dimensão e tamanho no upload;
- usar nomes por entidade, por exemplo `stations/{station_id}/cover.webp`;
- eliminar versões antigas depois de confirmar a nova;
- manter dumps, XML NAP, snapshots completos e ficheiros pessoais fora de um bucket público;
- não usar Storage para tiles do mapa, porque isso consome quota rapidamente e não substitui um fornecedor de mapas.

A aplicação atualmente usa o fallback estático do repositório e não depende da Storage para abrir o mapa. A adoção de um bucket de imagens pode ser feita numa alteração isolada, com políticas RLS e rollback próprios.
