# Fotografias dos veículos

As dez fotografias atuais estão em `assets/vehicle-images/` e na subpasta [Vehicle Photos do Drive](https://drive.google.com/drive/folders/1gqnZOi-E_EDJ7GvrDQl1u2smro2As2Ud). O ficheiro `credits.json` regista, para cada uma, o autor, a página original no Wikimedia Commons, a licença e os anos de modelo aos quais a fotografia se aplica. As imagens servidas pelo site foram redimensionadas para acelerar o carregamento; os créditos aparecem junto da fotografia.

Para acrescentar um modelo, obtenha uma fotografia da versão de produção com licença adequada à publicação e confirme visualmente a geração e o ano. Adicione o JPEG otimizado e uma entrada em `credits.json`; carregue também ambos para a pasta do Drive. Uma fotografia de outra geração nunca deve ser associada a um ano diferente. Quando não houver correspondência, a aplicação mostra a ilustração genérica. Ao atualizar o catálogo, aumente a versão do URL `credits.json` em `assets/chargevoy.js` e `service-worker.js` e a versão do cache da PWA.

As fotografias disponibilizadas estão sob CC BY-SA 4.0 ou CC BY-SA 3.0 de, conforme a entrada individual no catálogo. As respetivas páginas e licenças estão ligadas no site e no `credits.json`; mantenha esses créditos e a indicação de redimensionamento quando reutilizar os ficheiros.
