# Website: conta exclusivamente Google

## Estado e âmbito

Candidata baseada no website main `e35380124c0135919c44ee379b63898e3ad225de`.
Backup remoto: `backup/web-before-google-20261015`, nesse mesmo commit.
Não altera o catálogo, preços, fontes, live KV nem código da app distribuída.
A fundação de preferências do Worker vem da fase 2A / PR #54. Este PR acrescenta
adaptação web e preserva os contratos nativos `/google`, `/me` e `/favorites`.
Reconciliar estas alterações no Worker ao integrar a próxima fase Android.

## Comportamento

- Login/registo/recuperação por palavra-passe removidos do cliente web.
- Google Identity Services, mesmo cliente WEB da app; backend verifica RS256,
  emissor, audiência, validade, nonce de uso único e email verificado.
- Mesmo Google `sub` resolve a mesma conta; email coincidente não liga identidades.
- Gateway `/api/account/*` no Worker web. Sessão em cookie host-only, Secure,
  HttpOnly, SameSite=Lax, até 12 horas; não expõe o token a JavaScript.
- Pedidos de escrita exigem Origin do próprio site; gateway limita caminhos,
  métodos e tamanho e ignora Authorization fornecido pelo browser.
- Sessões e respostas tardias isoladas por geração; o servidor rejeita pedidos
  cujo proprietário esperado não coincide com a sessão verificada. Um 401 atrasado
  não limpa cookies de uma sessão nova. Separadores comunicam mudanças de conta.
- Favoritos comuns com a app, fila local por conta para edições offline; cache
  de visitante não é importada. Falhas de rede/armazenamento não dizem sincronizado.
- Preferências web sincronizadas: veículo/especificações, potência, operadores,
  conectores, disponibilidade, bateria e idioma. Sem texto de pesquisa ou GPS.
  Faixas/operadores múltiplos recebidos são aplicados sem os reduzir à primeira opção.
  A app 1.1.9 ainda não carrega o motor de preferências; requer a futura integração 2B.
- Novas rotas web guardam até 20 resumos por conta, sem coordenadas nem lista de
  paragens. Publicação/consulta de avaliações usa o serviço comum. Leituras antigas
  públicas mantêm-se separadas; não são atribuídas automaticamente à nova conta.
- Eliminação de conta revoga todas as sessões e elimina favoritos, preferências,
  histórico web e avaliações dessa conta. Dados antigos ainda não associados
  exigem pedido e verificação de titularidade; não alegamos eliminá-los por email.
- Políticas e textos atualizados para refletir exatamente estes âmbitos.

## Ordem de ativação (ainda não executada)

1. No cliente OAuth WEB existente, confirmar as Authorized JavaScript origins:
   `https://chargevoy.pt` e `https://www.chargevoy.pt`. Não criar outra identidade
   de conta nem mudar chaves Android. O popup GIS utiliza callback JS, sem adicionar
   um redirect Supabase. Só adicionar localhost/origem preview se se pretender testar
   Google real nesses endereços. Não guardar secrets no frontend.
2. Passar testes do Worker, gateway, filas e todos os testes web e de browser no CI.
   O teste de interface simula o fornecedor Google: não é prova de login Google real.
3. Antes do Worker: guardar deployment/version anterior e bookmark D1 Time Travel
   da base privada `chargevoy-accounts-staging`. A base de contas atualmente usada
   pela app tem esse nome, mas contém contas reais: tratá-la como serviço ativo.
   Não exportar dados pessoais para artifacts de um repositório público.
4. Inspecionar schema remotamente. Se `user_preferences` não existir, aplicar
   `0002_preferences.sql`; se as duas tabelas web estiverem ausentes, aplicar
   `0003_web_account_data.sql`. Se houver estado parcial, parar e investigar.
   Nunca reaplicar `0001_accounts.sql` a uma base já inicializada. Nunca usar
   `CHARGEVOY_DB`, a base do catálogo, para estas migrações.
5. Publicar só o Worker de contas, validar schema e todos os contratos já usados
   pela app. As migrações são aditivas; nenhum proprietário/favorito é alterado.
6. Guardar versão exata do Worker web e snapshot atual. Construir a candidata
   preservando o catálogo publicado; não regenerar NAP como efeito deste login.
   Publicar preview primeiro e verificar visualmente mobile/desktop.
7. Após validar as origens Google, publicar o website e fazer login real em browser
   e app com a mesma conta. Testar também duas contas diferentes, favoritos nos dois
   sentidos, offline/reconexão, logout, expiração e eliminação numa conta de teste.
   A sincronização de preferências com a app só pode ser dada como concluída quando
   a futura app 2B estiver distribuída e passar o teste com dois dispositivos.
8. Medir latência, pedidos e erros/rate limiter. A nova integração faz leituras e
   escritas na D1 privada de contas; não é uma alteração sem custo operacional.
   Sem polling: login, reconexão, regresso à página e gravações com debounce.

## Rollback

Guardar IDs das versões realmente ativas antes de cada deploy. Repor primeiro o
Worker web anterior se for o problema do login; reverter separadamente o Worker
de contas se houver regressão nativa. Manter as tabelas novas para preservar novos
registos e nunca apagar a base ou recriar identidades. Os IDs/favoritos Android e
as sessões existentes mantêm o contrato. Time Travel é último recurso: pode perder
alterações posteriores ao bookmark; não restaurar automaticamente uma base ativa.
A retenção Time Travel depende do plano (7 dias Free / 30 Paid). Registar o bookmark
no mesmo dia do deploy; o backup Git conserva código, não substitui o backup D1.

## Aceitação

A candidata não deve ser anunciada como publicada ou como login real validado só
por passar testes simulados. Registar run CI, versão Worker, bookmark, deploy web
bem-sucedido e resultado de login real antes de encerrar a ativação.

## Bloqueio confirmado e ativação preparada

Em 2026-10-15, o diagnóstico com a biblioteca Google real devolveu `/gsi/button`
HTTP 403 e `[GSI_LOGGER]: The given origin is not allowed for the given client ID.`
para `https://chargevoy.pt` e `https://www.chargevoy.pt`. Não houve login real.
É necessária a configuração destas duas origens no cliente WEB já utilizado pela
app, ID `1094158912679-4vs9a9t3lrv54uv4h9lmmmb1aq2h9roo.apps.googleusercontent.com`.

O workflow `Activate Google web accounts` está preparado para testar interface e
origens antes de tocar na infraestrutura. Só publica a partir de `main`, para não
permitir que a tarefa diária do main antigo reponha o website anterior depois.
Após configurar as origens e integrar o PR #55, executa: testes → gate Google →
bookmark D1/version Worker → schema aditivo → Worker de contas → saúde/401 anónimo
→ publicação web com catálogo preservado e rollback automático de versões.
A publicação web normal também tem o gate Google/backend, impedindo ativação fora
de ordem. Nunca exporta conteúdo das contas para artifacts; apenas metadados de
recuperação. Uma falha nas origens bloqueia todo o deploy, mantendo o website atual.

## Publicação concluída — 2026-10-15

Após configurar as origens no cliente WEB correto, a biblioteca Google real passou
com HTTP 200 em /gsi/button para chargevoy.pt e www.chargevoy.pt, sem erro de origem.
PR #55 integrado em main no commit c5faa3e941e518a9ecb0c1851e0d0ffcd1e112e5.
Workflow de ativação 38783621047 concluído com sucesso (19:14, Europe/Lisbon):
https://github.com/ferreira-diogo/ev-chargers-portugal/actions/runs/38783621047

- Worker de contas ativo: 0cf006f7-15db-4634-b7cc-abafd5e27212.
- Schema privado e fronteira anónima 401 verificados; migrações aditivas executadas.
- Worker web ativo: e5b01468-023c-4b5d-a941-f7c51c73f668.
- Snapshot nacional publicado preservado; páginas legais e ficheiros estáticos
  comparados com a candidata após publicar.
- Recuperação de contas: artifact google-account-recovery-metadata, ID 11996258754
  (versão anterior e bookmark D1; nenhum conteúdo de conta exportado).
- Recuperação web: artifact catalogue-web-rollback-38783621047, ID 11995869391.
- Os artifacts têm retenção de 7 dias; o backup Git continua na branch documentada.

A validação de UI com duas identidades simuladas passou. A verificação adicional
no domínio público encontrou o desafio Cloudflare "Just a moment..." (HTTP 403)
para o browser do GitHub Actions, sem executar o JavaScript da aplicação. Isto
impede essa verificação automática e não demonstra uma falha de login da aplicação.
Nenhuma proteção Cloudflare foi alterada para contornar o desafio.
Login completo com uma conta Google real e confirmação dos favoritos entre app e
website continuam como aceitação pelo utilizador. A app 1.1.9 permanece inalterada;
a integração das preferências no seu ecrã continua a depender da futura fase 2B.
