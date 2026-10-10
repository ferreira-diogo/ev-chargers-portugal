# ChargeVoy — Política de privacidade da aplicação Android

Última atualização: 10 de outubro de 2026. Esta política aplica-se à aplicação Android ChargeVoy (pacote app.chargevoy.mobile), incluindo as funcionalidades de conta utilizadas pela aplicação.

## 1. Responsável e contacto

O responsável pelo tratamento é Diogo Ferreira, responsável pelo projeto ChargeVoy, em Portugal. Para apoio, questões de privacidade ou exercício de direitos, contacte **chargevoy@chargevoy.pt**.

A ChargeVoy permite consultar postos de carregamento, disponibilidade, estimativas de custo e percursos. Pode consultar o mapa e pesquisar postos sem criar uma conta. O login Google é opcional e necessário para guardar favoritos associados à conta.

## 2. Dados tratados e finalidades

- **Localização:** quando autoriza a permissão Android, a aplicação utiliza a localização aproximada ou precisa para centrar o mapa, encontrar postos próximos e definir a origem de percursos. Não acompanha a sua localização em segundo plano nem mantém um histórico de posições GPS no serviço de contas. Pode recusar a permissão e pesquisar um local manualmente. Coordenadas e locais pesquisados podem ser enviados aos fornecedores de pesquisa e percursos para responder ao pedido.
- **Conta Google:** quando escolhe entrar, recebemos um identificador Google, nome e endereço de email verificado, além dos elementos técnicos necessários para validar o login. Guardamos no serviço de contas o identificador interno da conta, identificador Google, nome, email e data de criação. Não recebemos nem guardamos a sua palavra-passe Google.
- **Favoritos:** os identificadores dos postos que guarda e as datas de criação dos favoritos ficam associados à conta no serviço de contas. Estes dados permitem recuperar os seus favoritos após o login.
- **Veículo e opções locais:** o veículo selecionado, características que introduza, filtros, bateria atual e objetivo de carregamento são guardados no dispositivo para personalizar pesquisas e estimativas. O histórico local de rotas é separado por conta e limitado às últimas 20 rotas. O serviço de contas não guarda estes valores nem as coordenadas das rotas; os pedidos enviados a fornecedores de percursos podem conter coordenadas e parâmetros necessários ao cálculo.
- **Sessão e segurança:** utilizamos tokens de sessão e dados técnicos de autenticação para validar o acesso à conta e impedir acesso indevido. O serviço utiliza o endereço IP, através do fornecedor de infraestrutura, para limitar tentativas de autenticação.
- **Pedidos de rede:** alojamento, mapas, pesquisa e outros fornecedores podem receber o endereço IP e informação técnica do pedido, como o agente de utilizador, as coordenadas ou os termos de pesquisa necessários à funcionalidade utilizada.
- **Analítica opcional:** se aceitar a opção de analítica, o Google Analytics pode tratar informação técnica e de utilização, incluindo identificadores de analítica. Pode recusar esta opção. A analítica não é necessária para consultar postos ou planear percursos.
- **Contacto de apoio:** se nos enviar um email, tratamos o endereço, o conteúdo e os anexos que enviar para responder ao pedido. Evite enviar palavras-passe ou informação desnecessária.

Esta versão não permite publicar novas avaliações e não apresenta anúncios. Não vendemos dados pessoais.

## 3. Fundamentos do tratamento

Tratamos dados de conta, favoritos e pedidos de apoio para prestar o serviço que solicita. A localização opcional e a analítica dependem da sua autorização ou consentimento, que pode retirar. Utilizamos os dados técnicos estritamente necessários à segurança e prevenção de abuso com base no interesse legítimo em proteger o serviço. Poderemos tratar dados necessários para cumprir obrigações legais aplicáveis.

As recomendações de postos são estimativas informativas baseadas nas opções que introduz e nos dados dos postos. Não constituem decisões automatizadas com efeitos jurídicos ou semelhantes sobre o utilizador.

## 4. Fornecedores e comunicação de dados

- **Cloudflare:** alojamento, API, dados públicos, infraestrutura de contas e armazenamento dos favoritos.
- **Google:** autenticação quando escolhe entrar com Google, analítica quando aceite e navegação externa quando escolhe abrir Google Maps. A política Google está disponível em [policies.google.com/privacy](https://policies.google.com/privacy).
- **OpenStreetMap e fornecedores de mapas:** apresentação do mapa e das respetivas imagens. Consulte [a política da OpenStreetMap Foundation](https://osmfoundation.org/wiki/Privacy_Policy).
- **Photon/Komoot e Nominatim:** sugestões e resolução dos locais pesquisados.
- **OSRM:** cálculo de percursos a partir das coordenadas necessárias ao pedido.
- **Serviços que abre externamente:** quando escolhe navegar ou abrir uma ligação externa, esse serviço trata os dados segundo a sua própria política.

Os fornecedores recebem apenas os dados necessários aos pedidos e serviços descritos. A infraestrutura de fornecedores internacionais pode tratar dados fora do Espaço Económico Europeu. As condições e garantias aplicáveis a esse tratamento constam dos acordos e políticas desses fornecedores; pode contactar-nos para obter esclarecimentos. Consulte também [a política da Cloudflare](https://www.cloudflare.com/privacypolicy/).

## 5. Segurança

As comunicações da aplicação com os serviços de conta e os fornecedores de rede utilizam HTTPS. O serviço de contas valida a identidade Google e exige uma sessão válida para aceder aos favoritos ou eliminar a conta. Os tokens de sessão são guardados no servidor como resumos criptográficos, e os pedidos de login estão sujeitos a limitação de tentativas. O acesso aos dados de conta e favoritos é limitado à conta autenticada. A aplicação não solicita uma palavra-passe própria.

Estas medidas reduzem o risco de acesso indevido, mas nenhum sistema permite garantir segurança absoluta. Proteja o seu dispositivo e a sua conta Google.

## 6. Conservação

- **Perfil e favoritos no serviço de contas:** conservados enquanto a conta existir. A eliminação da conta remove o perfil, os favoritos e as sessões da base ativa.
- **Sessões:** os tokens deixam de ser válidos após 12 horas, ou antes quando termina a sessão ou elimina a conta. Registos expirados podem permanecer tecnicamente até à limpeza efetuada pelo serviço; não permitem autenticação após expirarem.
- **Dados locais:** conservados até limpar os dados da aplicação ou desinstalá-la. O histórico local é limitado às últimas 20 rotas por conta. A cópia de segurança automática Android da aplicação está desativada nesta versão.
- **Correspondência de apoio:** conservada durante a resolução do pedido e pelo tempo necessário para documentar o seu cumprimento ou cumprir obrigações legais. Pode solicitar esclarecimentos ou apagamento.
- **Registos técnicos e cópias de segurança dos fornecedores:** sujeitos aos ciclos de conservação e eliminação dos respetivos serviços; apagar os dados na base ativa não significa eliminar imediatamente todas as cópias técnicas históricas. Dados que devam ser conservados por obrigação legal ficam limitados a essa finalidade e ao período aplicável.

## 7. Eliminação da conta e dos dados

Na aplicação, abra a área de conta, entre com Google, escolha **Eliminar a minha conta** e confirme. Esta ação elimina o perfil, os favoritos e todas as sessões no serviço de contas. O histórico local dessa conta é removido no dispositivo onde executa a ação. Não elimina a sua conta Google.

Pode pedir a eliminação **sem instalar a aplicação e sem iniciar sessão**: envie um email para **chargevoy@chargevoy.pt**, preferencialmente a partir do endereço associado à conta, com o assunto **Pedido de eliminação de conta ChargeVoy**. Se não tiver acesso a esse endereço, explique a situação; poderá ser necessária uma verificação proporcional da titularidade.

Consulte [Eliminar conta e dados](https://chargevoy.pt/account-deletion.html) para as instruções completas. Preferências gerais e dados locais noutros dispositivos podem ser apagados nas definições Android: Aplicações → ChargeVoy → Armazenamento → Limpar dados. Desinstalar a aplicação não elimina a conta no servidor.

## 8. Direitos e escolhas

Pode solicitar acesso, retificação, apagamento, limitação, oposição e portabilidade dos seus dados, nos casos previstos na legislação aplicável, através de **chargevoy@chargevoy.pt**. Pode retirar o consentimento sem afetar a licitude do tratamento anterior e desativar a localização nas definições Android. Pode alterar a escolha de analítica através dos controlos de consentimento ou limpar os dados locais para voltar a escolher.

Os pedidos de direitos recebem resposta no prazo legal, normalmente um mês. Se for necessária uma prorrogação legal, será informado do motivo. Pode apresentar reclamação à [Comissão Nacional de Proteção de Dados — CNPD](https://www.cnpd.pt/cidadaos/participacoes/) ou à autoridade de controlo competente.

## 9. Alterações

Publicaremos as atualizações nesta página, com a respetiva data. Se forem introduzidas novas utilizações dos dados, analítica ou publicidade que exijam informação adicional ou consentimento, a política e os controlos aplicáveis serão atualizados antes desse tratamento.
