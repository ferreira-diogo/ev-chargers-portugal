# Execução e recuperação Android — 8 outubro 2026

## Decisões autorizadas

- Apenas Android. Website permanece como está; aproximá-lo da app só após a app live e em tarefa própria.
- Favoritos apenas com sessão autenticada. Não oferecer novos favoritos anónimos; preservar dados locais antigos para eventual importação explícita e segura.
- Google como único login. Preparar integração; configuração Google fica a cargo do Diogo quando disponível.
- Retirar Supabase do Android, sem apagar serviço nem migrar website.
- Identidade/contacto já encontrados no código: Diogo Ferreira, evchargeportugal@gmail.com. Confirmar correspondência dos documentos finais, sem pedir novamente dados já fornecidos.
- Cloudflare: usar configuração existente quando acessível; disponibilidade de acesso ainda não comprovada nesta sessão. Nunca inferir acesso a segredos apenas por existirem workflows.

## Checkpoint executável

Baseline Git: `1298734bd32b7a2ace641e4929454e272b6ba8cf`. Não equivale a identificação comprovada da última APK enviada; reconciliar artefacto/workflow/versionCode antes da candidata.

Executar na pasta Android, com destinos fora do repositório:

```sh
node recovery.mjs snapshot /caminho/privado/chargevoy-recovery
node recovery.mjs verify-web /caminho/privado/chargevoy-recovery
node recovery.mjs worktree /caminho/novo/chargevoy-android-recovery
```

Snapshot gera bundle Git verificado e manifesto com SHA-256. Não contém alterações não commitadas, APK/AAB, base de dados, chaves de assinatura ou configuração dos fornecedores. Guardar separadamente o último artefacto distribuído e respetivo hash, versionCode, assinatura e execução CI. O worktree recupera código sem destruir alterações atuais e sem publicar website/backend.

## Plano de implementação

1. Reproduzir contagens, pesquisa, origem GPS e ruído de rota; inventariar todas as chamadas Supabase e serviços consumidos pelo build Android.
2. Corrigir interface/dados somente no Android; alterações necessárias a API partilhada ficam isoladas num endpoint Android e são avaliadas antes de produção.
3. Preparar Google nativo e Worker de contas com configuração por ambiente. Sem configuração real, não apresentar login fictício nem tratar interface como autenticada.
4. Implementar perfil, sessões e favoritos com autorização server-side. Sessões de contas diferentes não partilham cache de favoritos. Logout limpa estado visível e revoga sessão; preservar apenas dados necessários e protegidos.
5. Resolver histórico, avaliações, eliminação e restantes chamadas; não deixar fallbacks Supabase. Nenhuma importação automática de favoritos antigos para uma conta Google por mera coincidência de email.
6. Medir quotas e preparar ambiente de teste, migrações aditivas e exportações autorizadas dos dados existentes. Uma D1 separada não aumenta as quotas da conta.
7. Atualizar documentos legais e ficha com serviços/recolhas reais; manter pendências de licenças visíveis. Imagens sem direito de uso confirmado recebem alternativa neutra.
8. Gerar APK de teste e AAB, executar testes físicos e via Play; só então preparar publicação.

## Rollback por tipo de alteração

| Alteração | Proteção prévia | Recuperação | Validação |
|---|---|---|---|
| Interface/pesquisa/rotas | Commit baseline, artefacto anterior, casos de teste | Compilar baseline em worktree; mesma assinatura, versionCode superior | Login, GPS, pesquisa, rota, botão Voltar e atualização |
| Contagem/agrupamento Android | Fixture original, IDs e contagens por operador | Reverter transformação Android; não restaurar catálogo global | Casos conhecidos e ausência de duplicados |
| Login e sessões | Serviço novo separado, configuração ambiente documentada | Parar promoção; revogar sessões afetadas; corrigir serviço ou retirar função pessoal temporariamente | Mapa público funciona; tokens antigos não recuperam acesso indevido |
| Favoritos/dados pessoais | Exportação restrita, esquema/migração e reconciliação | Preservar dados novos; recuperar por utilizador e reconciliar; não substituir globalmente base antiga | Contagens e titularidade; contas eliminadas continuam eliminadas |
| Imagens | Originais e manifesto de associação/licença | Recuperar referências Android anteriores quando licenciadas ou imagem neutra | Modelo correto, tamanho e renderização |
| Release Play | AAB/assinatura/versionCode e artefacto anterior | Interromper promoção; publicar correção com versionCode superior | Instalação pela Play e atualização sem desinstalar |

O baseline depende de Supabase; regressar a ele não garante favoritos/login funcionais se o fornecedor estiver indisponível. Não é rollback válido para contas novas sem reconciliação. Antes de ativar novas contas, a recuperação preferida é manter os dados e corrigir o serviço novo, permitindo usar o mapa sem sessão.

## Gatilhos e condições de passagem

Parar promoção por acesso entre contas, eliminação incompleta, perda de favoritos, login release quebrado, falha grave de rota/contagem reproduzida ou consumo fora do orçamento medido. Bloquear endpoint afetado se necessário, preservar evidência sem tokens e manter mapa público.

Exigir: testes de autorização e revogação; atualização sem perda; nenhum pedido Supabase nos fluxos da candidata; website/workflows partilhados intactos; serviço de contas recuperável; documentos coerentes; versão Play testada. Não alegar recuperação de dados nem funcionamento Google/Cloudflare até executar os testes no ambiente real.

## Estado desta preparação

Criados procedimento e ferramenta de snapshot/worktree/isolamento. As correções funcionais e o serviço de contas ainda não estão implementados por este documento. Não houve deploy, submissão Play, migração de dados ou alteração do website.
