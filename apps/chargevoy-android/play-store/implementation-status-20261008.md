# Candidata Android — alterações de 8 outubro

Estado: código aplicado numa branch Android; não publicado em produção ou Play. Não é ainda uma versão pronta para lançar.

## Aplicado

- Sem SDK, login por email/password, callback web ou fallback operacional Supabase no controlador Android.
- Google nativo via Credential Manager e plugin Capacitor próprio; sessão cifrada Android Keystore, backup desativado. Configuração Google/serviço de contas vazia deliberadamente até staging validado.
- Worker separado para contas/favoritos: validação de tokens Google, nonce consumível, sessões revogáveis e autorização por utilizador; schema novo, sem tocar na DB de postos.
- Favoritos só com login, sem mistura com cache anónima; operações confirmadas no servidor antes de mudar interface.
- Sugestões Photon com cache, atraso de 700 ms, cancelamento e rejeição de respostas antigas; teclado/toque e mensagens de indisponibilidade; Portugal filtrado.
- Origem GPS selecionada para substituição e apagada ao começar a escrever; seleção de sugestão preserva coordenadas escolhidas.
- Rotas ocultam camada geral, ponto de pesquisa e pins de recomendação; mantêm apenas percurso, origem/destino e paragens A/B. Voltar ao mapa restaura exploração.
- Deduplicação de conectores por identidade de carregador + conector, preservando IDs locais repetidos em carregadores distintos.
- Histórico apenas local, por conta, limitado a 20. Publicação de avaliações temporariamente indisponível e explicitamente indicada.
- Documentos de privacidade/eliminação ajustados ao comportamento da candidata.

## Pendências reais

- Google Cloud: cliente web/Android e certificados da Play, teste login/cancelamento/troca/reinício no dispositivo.
- Cloudflare: credenciais não disponíveis nesta sessão; criar DB/bindings de staging, configurar rate limiter, aplicar schema e deploy do Worker exclusivo Android. Medir quotas antes de produção.
- Compilação Android e teste visual/dispositivo; SDK/Java 21 indisponíveis localmente. Verificar CI e artefacto antes de distribuir.
- Reconciliar última APK enviada com versionCode/assinatura; preservar package de produção e aumentar versionCode quando publicar.
- Auditoria dos postos reais de várias operadoras: regressão de IDs corrigida não prova completude dos dados fonte.
- Fotos: tratamento/licenças/cobertura de todo o catálogo ainda pendentes; nenhuma alteração às fotos nesta etapa.
- Migração de contas/favoritos antigos não executada. Caches antigas preservadas sem associar automaticamente a Google.
- Recurso web público de eliminação, declarações Data Safety finais, licenças e aprovação jurídica dos pontos em dúvida.
- Plano B ainda mostra alternativas de paragem, não redesenha rota completa alternativa ao selecioná-las; validar autonomia real e desvio antes de anunciar equivalência ao Google Maps.
- Orçamento de consumo e limpeza de sessões/challenges antes da produção. Sessão inicial expira em 12 h e pede novo login Google, sem refresh token.

## Recuperação

Baseline `1298734bd32b7a2ace641e4929454e272b6ba8cf`; snapshot e worktree de recuperação verificados. Sem alteração de produção/dados, reversão é por código/artefacto. Depois de novas contas, preservar dados no novo serviço e reconciliar; não regressar cegamente ao fornecedor antigo. Website e workflows partilhados intactos.
