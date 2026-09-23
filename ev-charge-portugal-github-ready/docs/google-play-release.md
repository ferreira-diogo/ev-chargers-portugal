# Lançamento Android — ChargeVoy

O identificador definitivo da aplicação é `app.chargevoy.mobile`. Não o altere depois de criar a aplicação na Google Play Console: é esse identificador que permite publicar atualizações.

## 1. Validar o login Google na app

1. Na Supabase, abra **Authentication → URL Configuration**.
2. Em **Additional Redirect URLs**, adicione exatamente:
   `chargevoy://auth/callback`
3. Publique a versão Cloudflare do site e execute a ação **Build signed Android bundle** depois de configurar as credenciais abaixo.
4. Instale a AAB através do teste interno da Play Console e confirme: tocar em “Entrar com Google” abre o browser e regressa à app já autenticado.

## 2. Criar e proteger a upload key

No teu computador, com Java instalado:

```bash
keytool -genkeypair -v -keystore chargevoy-upload.jks -alias chargevoy-upload -keyalg RSA -keysize 4096 -validity 10000
base64 -w 0 chargevoy-upload.jks
```

Guarda o ficheiro `chargevoy-upload.jks` e as palavras-passe num local seguro e fora do repositório. A chave não pode ser reposta por nós; a Google Play permite trocar a upload key em caso de perda, mas é um processo adicional.

Em **GitHub → Settings → Secrets and variables → Actions**, cria estes segredos:

- `ANDROID_KEYSTORE_BASE64`: saída do comando `base64`;
- `ANDROID_KEYSTORE_PASSWORD`;
- `ANDROID_KEY_ALIAS`: `chargevoy-upload` (ou o alias que escolheste);
- `ANDROID_KEY_PASSWORD`.

Depois abre **Actions → Build signed Android bundle → Run workflow**, define `1.0.0` e `1`, e descarrega o ficheiro `.aab`.

## 3. Criar a app na Google Play Console

1. Cria uma conta de programador pessoal em [Google Play Console](https://play.google.com/console/). Há uma taxa de registo única de US$25 e verificação de identidade.
2. Cria a aplicação **ChargeVoy**, idioma principal português (Portugal), tipo **App**, gratuita.
3. Escolhe **Play App Signing** e deixa a Google gerir a chave de assinatura da app.
4. Em **Internal testing**, cria uma release e carrega o AAB gerado. Testa em telemóvel real antes de qualquer lançamento público.
5. Cria a ficha da loja:
   - Nome: **ChargeVoy**
   - Descrição curta: **EV Charging & Routes**
   - Descrição: postos em tempo real, rotas, custos e alternativas para veículos elétricos.
   - Email de apoio: `evchargeportugal@gmail.com`
   - Política de privacidade: URL pública do site depois do deploy.
6. Carrega um ícone PNG 512×512, uma imagem de destaque 1024×500 e pelo menos duas capturas de ecrã reais da app. O ícone vetorial de origem está em `icon.svg`.
7. Completa **App content** e **Data safety** coerentemente com a política publicada:
   - conta (email e Google, quando escolhido);
   - favoritos, histórico de rotas, veículo/preferências e avaliações;
   - localização apenas com autorização;
   - Analytics apenas após consentimento;
   - sem publicidade e sem venda de dados no lançamento;
   - eliminação de conta dentro da app e na página pública.
8. Faz primeiro um teste fechado, cumpre qualquer requisito de testes que a Play Console apresentar para uma conta pessoal nova e só depois cria a release de produção.

## 4. Atualizações futuras

Para cada atualização, aumenta sempre o `version_code` no workflow (2, 3, 4…) e ajusta o `version_name` (1.0.1, 1.1.0…). Carrega o novo AAB numa nova release. A Google Play entrega a atualização automaticamente aos utilizadores.

## Antes de publicar

- [ ] Confirmar domínio/URL público do ChargeVoy.
- [ ] Validar a marca em INPI e EUIPO.
- [ ] Publicar Aviso legal, Privacidade, Cookies, Termos e página de eliminação de conta.
- [ ] Validar login Google, email/password, recuperação de palavra-passe, localização e eliminação de conta no AAB.
- [ ] Rever os textos PT e EN e tirar screenshots finais.
