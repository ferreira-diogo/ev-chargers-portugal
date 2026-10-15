# Fase 2 — conta Google e sincronização app/website

Baseline validada pelo utilizador: 1.1.9 / versionCode 11, commit
`1d8bf50f3565f60938d9c6a9609f4a510f397463`. AAB e assinatura preservados.
Checkpoint Git local: `backup/android-1.1.9-before-phase2-20261015`.

## Resultado pretendido e limites

Sincronizar veículo (incluindo especificações pessoais do veículo selecionado),
filtros múltiplos, bateria inicial/objetivo e idioma entre dispositivos da mesma
conta Google. Preservar cópia local, favoritos autenticados, mapa, rotas, preços,
operadores normalizados e indicação de inventário parcial da 1.1.9.
Histórico de rotas e coordenadas continuam locais na app. O catálogo D1 público,
disponibilidade KV e fontes Google Maps não são alterados. A fundação 2A não
altera o website; por instrução do utilizador em 2026-10-15, a integração da fase 2
inclui login exclusivamente Google no website e conta partilhada com a app.

Unificação futura app/website e migração de favoritos antigos precisam de uma
prova de controlo de ambas as identidades. Não ligar utilizadores por email,
por cache anónima ou por um ID de proprietário enviado pelo cliente.
Os favoritos atuais do serviço Android mantêm o proprietário/IDs existentes.

## 2A — fundação implementada nesta candidata

- `GET /preferences` e `PUT /preferences` autenticados no Worker de contas.
- Tabela aditiva `user_preferences`, apenas na base privada `ACCOUNTS_DB`.
- Esquema limitado a veículo, filtros, bateria e idioma; tamanhos, tipos e
  intervalos validados antes da escrita. Sem credenciais/rotas/posição.
- Compare-and-swap atómico por revisão, incluindo primeiras escritas concorrentes;
  conflito devolve HTTP 409 e estado atual, sem sobrescrever silenciosamente.
- Escritas limitadas por conta; sem polling ou novos pedidos na app atual.
- Eliminação de conta elimina também as preferências.
- Motor cliente independente com cache por ID de conta, fila persistente,
  leitura antes de enviar, duas tentativas limitadas e descarte de respostas
  atrasadas após troca de conta. Nenhuma importação automática de estado anónimo.
- Erros do cliente de contas retêm status/estado para resolver conflitos;
  um 401 atrasado da sessão anterior não termina a sessão nova.

O motor ainda **não está carregado nem ligado à interface**. Nenhuma funcionalidade
de sincronização é anunciada como disponível. Não há deploy, aplicação remota da
migração, nova release distribuída ou alteração da configuração de produção.

## 2B — integração a concluir antes de uma release de fase 2

1. Adaptar veículo, especificações pessoais, filtros, bateria e idioma ao motor;
   separar o estado de visitante do estado das contas, incluindo ao reiniciar offline.
2. Mostrar estados guardado neste dispositivo, pendente, sincronizado e sessão
   expirada em PT/EN. Não dizer sincronizado após erro de armazenamento/rede.
3. Atualizar em login, reconexão, regresso à app e após gravações com debounce;
   sem polling. Não enviar texto de pesquisa, localização ou histórico.
4. Regra de conflitos: grupos distintos preservam alterações remotas; para o mesmo
   grupo prevalece a última gravação aceite pelo servidor, nunca relógio do telefone.
   Alterações locais posteriores a um pedido em curso continuam na fila. Após duas
   colisões, manter pendente até nova tentativa explícita/reconexão.
5. Exportar a D1 de contas e aplicar `0002_preferences.sql` em staging antes do
   deploy do Worker; não executar na D1 pública. Validar com duas contas Google
   reais e dois dispositivos, offline, logout, troca, expiração e eliminação.
6. Verificar favoritos existentes sem migração. A migração de contas/favoritos
   antigos só avança após definir e testar uma prova de identidade para a origem.
7. Rever textos de privacidade, validar regressões UI/funcionais e só então
   incrementar versão/versionCode e produzir AAB com a chave existente.


## 2C — website com login exclusivamente Google (requisito confirmado)

- Apresentar apenas «Entrar com Google»; remover entrada, criação de conta e
  recuperação por email/palavra-passe. Consultar postos sem conta continua possível.
- Integrar o website com o mesmo serviço de contas da app. O login Google atual
  via Supabase não equivale à identidade do Worker Android: retirar botões de email,
  por si só, não unifica contas nem sincroniza dados.
- Validar no servidor a identidade Google (emissor, audiência permitida, validade,
  assinatura e nonce) e resolver o mesmo Google subject para a mesma conta interna.
  Configurar as origens web e clientes autorizados; nunca aceitar um subject ou
  proprietário declarado pelo browser como prova de identidade.
- Adaptar favoritos e preferências ao serviço comum, com caches separadas por conta.
  Inventariar também avaliações, histórico e eliminação de conta antes de substituir
  o cliente antigo, para não deixar funcionalidades ligadas a uma sessão incompatível.
- Preservar dados antigos; importar apenas após prova verificada de controlo da
  identidade de origem e da conta Google de destino. Não associar por email apenas.
  Se a origem estiver indisponível, assinalar a migração pendente sem apagar dados.
- Testar a mesma conta em Android e browser, duas contas distintas, logout, sessões
  expiradas, offline, sincronização e eliminação, além dos fluxos existentes do site.
- Antes de publicar: guardar a versão do website e exportar a base privada, validar
  em preview/staging e preparar reversão independente do website e do Worker.

Esta secção define o trabalho autorizado seguinte. O login web e a sincronização
app/website **ainda não estão implementados nem publicados** nesta candidata.

## Recuperação

Antes de qualquer deploy, exportar D1 privada e guardar versão anterior do Worker.
A migração é aditiva: pode manter-se ao reverter código. Preservar preferências
novas e favoritos; não apagar a base nem tentar restaurar um fornecedor antigo.
Reverter interface/motor mantendo versão Android superior caso já distribuída;
Android não permite downgrade normal para versionCode 11. Manter mesma assinatura.
Não alterar o website como forma de recuperar a app.

## Validação desta candidata

Testes do Worker exercitam autenticação, isolamento, validação, limitação,
duas primeiras escritas concorrentes, conflitos, atualização e eliminação.
Testes do motor exercitam offline/reinício, ausência de importação anónima,
isolamento, respostas atrasadas, alterações durante pedidos, duas colisões,
serviço antigo/expiração e erro de armazenamento. Regressões Android e isolamento
do website verificadas separadamente. Isto não substitui testes Google físicos.
