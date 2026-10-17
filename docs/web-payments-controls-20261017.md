# Website: pagamentos e controlos da app — 2026-10-17

Baseline: 876e4d3b3319e1a6289a76006909dd2ab4b89ca4.
Backup: backup/web-before-payments-controls-20261017.

A seleção dos cartões/apps restringe os preços de recomendações, Mais barato,
lista e detalhe. Seleção vazia não escolhe outra oferta. Cada resultado identifica
o fornecedor. As regras Continente e o catálogo revisto na app são reutilizados;
benefícios condicionais não são deduzidos ao pagamento. Valores desconhecidos não
são tratados como zero. Nada efetua pagamentos reais ou guarda dados bancários.

Preferência de pagamentos local, separada por visitante/conta. A preferência não
é sincronizada pela DB e o texto indica isso explicitamente. As preferências web
já sincronizadas e os favoritos mantêm o comportamento existente. Sem migrações,
novos endpoints, alteração de contas Android ou novas escritas D1 de pagamentos.

Miniatura do veículo com imagem existente e ilustração de fallback; acompanha a
seleção do veículo. Botão A minha localização no mapa, ícones GPS iguais nos
filtros e rotas e preservação do conteúdo após sucesso/falha. Mantém desktop
com menu lateral. Versões dos assets e cache PWA incrementadas.

Validação: regressões web, cálculo real com fornecedor escolhido, vazio e sem
fallback, persistência, isolamento, UI mobile/desktop, GPS e fluxos de conta.
O workflow de layout só descarrega o CSV nacional quando o importer muda: o CSV
remoto excede atualmente o limite defensivo de 50 MB. Este trabalho não altera
esse importer, não afrouxa o limite nem importa novas tarifas OPC. Os testes
funcionais do cálculo e da interface continuam obrigatórios em cada alteração.

Publicação: preservar o snapshot nacional existente, guardar versão Worker
anterior e snapshot antes do deploy; verificar assets/snapshot e gateway de contas.
Reversão automática da versão Worker se a verificação falhar. Código pode ser
revertido à baseline com novo cache PWA; não restaurar DB nem apagar preferências.
