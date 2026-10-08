(() => {
  let token = null;
  const native = () => window.Capacitor?.Plugins?.ChargeVoyIdentity;
  function endpoint(path) {
    const base = window.ChargeVoyAndroidConfig?.accountApi;
    if (!base || !base.startsWith('https://')) throw Error('O serviço de contas ainda não está configurado nesta versão de teste.');
    return base.replace(/\/$/, '') + path;
  }
  async function request(path, options = {}) {
    const url = endpoint(path);
    const response = await fetch(url, {...options, headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})}, signal: AbortSignal.timeout(15000)});
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) await clear();
      throw Error(data.error || 'Não foi possível concluir o pedido da conta.');
    }
    return data;
  }
  async function clear() { token = null; window.dispatchEvent(new Event("chargevoy-account-cleared")); await native()?.clearSession(); }
  async function restore() {
    const stored = await native()?.getSession();
    if (!stored?.token) return null;
    token = stored.token;
    const data = await request('/me');
    return {user: data.user};
  }
  async function signIn() {
    if (!native()) throw Error('O login Google está disponível na aplicação Android.');
    const clientId = window.ChargeVoyAndroidConfig?.googleWebClientId;
    if (!clientId) throw Error('O login Google aguarda a configuração da conta Google Cloud.');
    const challenge = await request('/challenge', {method: 'POST'});
    const credential = await native().signIn({clientId, nonce: challenge.nonce});
    const session = await request('/google', {method: 'POST', body: JSON.stringify({idToken: credential.idToken, nonce: challenge.nonce})});
    try { await native().saveSession({token: session.token}); } catch (error) {
      token = session.token;
      try { await request('/logout', {method: 'POST'}); } finally { token = null; }
      throw error;
    }
    token = session.token;
  }
  async function signOut() {
    try { if (token) await request('/logout', {method: 'POST'}); }
    finally { await clear(); }
  }
  window.ChargeVoyAccount = {request, restore, signIn, signOut, clear};
})();
