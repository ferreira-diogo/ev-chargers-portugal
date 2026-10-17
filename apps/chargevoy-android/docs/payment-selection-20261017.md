# Seleção de pagamentos Android 1.1.10 (12)

Baseline: ca3a9edb57305b4e0d6a9bf30f7f6831ce728573; Android 1.1.9 (11).
A alteração aplica-se apenas à app. Website e serviços remotos permanecem intactos.

Os operadores dos postos continuam a controlar os postos visíveis. A nova seleção
Cartões/apps de pagamento controla os fornecedores usados nas estimativas, detalhes,
recomendações e Mais barato. A escolha inicial é comparar todo o catálogo.
Seleção vazia ou sem preço elegível não usa outro fornecedor nem inventa um total.
Cada resultado com preço identifica o fornecedor. Campanhas, compatibilidade,
validade, benefício condicional e mensalidades continuam sujeitos às regras existentes.

## Login e DB

A seleção é permitida sem login e guardada localmente. Visitante e cada conta têm
chaves distintas; login não importa escolhas de visitante. Eliminar uma conta
remove a respetiva escolha local. Erro ao gravar não é apresentado como sucesso.
A interface diz explicitamente que a preferência fica apenas neste dispositivo.

Impacto remoto desta versão: zero tabelas, migrações, leituras ou escritas D1 novas.
Não há polling, alteração dos preços de origem, credenciais ou pagamentos reais.

A sincronização na conta não está incluída nesta release. Numa evolução, guardar
modo e IDs no documento user_preferences existente exige estender a validação do
servidor e os clientes; não precisa de uma linha por posto/cartão. Uma leitura por
abertura de sessão/sincronização e uma escrita por alteração agrupada são suficientes,
sem aumentar trabalho por posto consultado. Para 1000 utilizadores que gravem uma
vez num dia: aproximadamente 1000 atualizações lógicas de preferências; acessos de
autenticação/limitação e índices acrescem segundo a implementação. É uma projeção,
não medição da quota D1. Usar compare-and-swap e caches separados já existentes.

## Backup e recuperação

Backup de código antes de pagamentos: backup/android-before-payments-20261017.
A versão anterior é preservada; nenhuma migração de DB exige reversão.
Para reverter após distribuição, reconstruir a baseline com versionCode superior
à versão distribuída, mantendo a mesma assinatura. As chaves locais novas podem
permanecer inertes. Não reverter nem republicar o website para recuperar a app.

## Verificação

Testes do armazenamento: persistência, All, vazio, isolamento de duas contas,
logout, eliminação e falha de armazenamento. Teste com calculador e caminho real
de recomendação: fornecedor escolhido prevalece sobre oferta mais barata não
escolhida; desconhecido/vazio não produz estimativa. Regressões Android completas.
Teste browser mobile: controlos, independência dos operadores, reload e screenshot.
AAB assinado preparado pelo workflow existente; distribuição Play requer upload.
