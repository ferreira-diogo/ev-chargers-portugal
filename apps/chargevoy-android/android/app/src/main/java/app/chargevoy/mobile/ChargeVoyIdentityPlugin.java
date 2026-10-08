package app.chargevoy.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.CancellationSignal;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.credentials.*;
import androidx.credentials.exceptions.*;
import androidx.core.content.ContextCompat;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.*;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "ChargeVoyIdentity")
public class ChargeVoyIdentityPlugin extends Plugin {
    private static final String KEY = "chargevoy-account-session-v1";
    private SharedPreferences storage() { return getContext().getSharedPreferences("chargevoy-private-session", Context.MODE_PRIVATE); }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(KEY)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(KEY, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(KEY, null);
    }
    @PluginMethod public void signIn(PluginCall call) {
        String clientId = call.getString("clientId"), nonce = call.getString("nonce");
        if (clientId == null || nonce == null || clientId.isEmpty() || nonce.isEmpty()) { call.reject("Configuração Google incompleta."); return; }
        getActivity().runOnUiThread(() -> {
            try {
                GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(clientId).setNonce(nonce).build();
                GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
                CredentialManager.create(getContext()).getCredentialAsync(getActivity(), request, new CancellationSignal(),
                    ContextCompat.getMainExecutor(getContext()), new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                        @Override public void onResult(GetCredentialResponse response) {
                            try {
                                Credential credential = response.getCredential();
                                if (!(credential instanceof CustomCredential)) { call.reject("Credencial Google inválida."); return; }
                                String type = credential.getType();
                                if (!type.equals(GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) && !type.equals(GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_SIWG_CREDENTIAL)) { call.reject("Credencial Google inválida."); return; }
                                GoogleIdTokenCredential google = GoogleIdTokenCredential.createFrom(credential.getData());
                                JSObject result = new JSObject(); result.put("idToken", google.getIdToken()); call.resolve(result);
                            } catch (Exception error) { call.reject("Não foi possível ler a credencial Google."); }
                        }
                        @Override public void onError(GetCredentialException error) { call.reject("Login cancelado ou indisponível. Tente novamente."); }
                    });
            } catch (Exception error) { call.reject("Não foi possível iniciar o login Google."); }
        });
    }
    @PluginMethod public void saveSession(PluginCall call) {
        try {
            String token = call.getString("token"); if (token == null || token.length() > 512) throw new Exception();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
            String encrypted = Base64.encodeToString(cipher.doFinal(token.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
            if (!storage().edit().putString("cipher", encrypted).putString("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)).commit()) throw new Exception();
            call.resolve();
        } catch (Exception error) { call.reject("Não foi possível proteger a sessão."); }
    }
    @PluginMethod public void getSession(PluginCall call) {
        try {
            String encrypted = storage().getString("cipher", null); JSObject result = new JSObject();
            if (encrypted != null) {
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(storage().getString("iv", ""), Base64.NO_WRAP)));
                result.put("token", new String(cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP)), StandardCharsets.UTF_8));
            }
            call.resolve(result);
        } catch (Exception error) { storage().edit().clear().commit(); call.resolve(new JSObject()); }
    }
    @PluginMethod public void clearSession(PluginCall call) {
        if (!storage().edit().clear().commit()) { call.reject("Não foi possível limpar a sessão."); return; }
        CredentialManager.create(getContext()).clearCredentialStateAsync(new ClearCredentialStateRequest(), new CancellationSignal(),
            ContextCompat.getMainExecutor(getContext()), new CredentialManagerCallback<Void, ClearCredentialException>() {
                @Override public void onResult(Void result) { call.resolve(); }
                @Override public void onError(ClearCredentialException error) { call.resolve(); }
            });
    }
}
