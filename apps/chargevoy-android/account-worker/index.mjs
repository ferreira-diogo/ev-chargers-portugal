import {createRemoteJWKSet, jwtVerify} from 'jose';
const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const json = (data, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});
const fail = (message, status) => Object.assign(new Error(message), {status});
export const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(x => x.toString(16).padStart(2, '0')).join('');
const random = () => { const bytes = crypto.getRandomValues(new Uint8Array(32)); return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''); };
export async function verifyGoogle(token, audience, nonce, keys = jwks) {
  const {payload} = await jwtVerify(token, keys, {algorithms: ['RS256'], issuer: ['https://accounts.google.com','accounts.google.com'], audience, maxTokenAge: '10m'});
  if (!payload.exp || !payload.iat || !payload.sub || payload.nonce !== nonce || payload.email_verified !== true || typeof payload.email !== 'string') throw fail('Identidade Google inválida.', 401);
  return payload;
}
export function createWorker(verify = verifyGoogle) {
  return {async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = new Set(['https://localhost', 'http://localhost']);
    if (origin && !allowed.has(origin)) return json({error: 'Origem não autorizada.'}, 403);
    const cors = response => { if (origin) { response.headers.set('Access-Control-Allow-Origin', origin); response.headers.set('Vary', 'Origin'); } return response; };
    if (request.method === 'OPTIONS') return cors(new Response(null, {status: 204, headers: {'Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'}}));
    try {
      if (!env.ACCOUNTS_DB || !env.GOOGLE_CLIENT_ID || !env.AUTH_LIMITER) throw fail('Serviço de contas por configurar.', 503);
      const db = env.ACCOUNTS_DB, path = new URL(request.url).pathname, now = Math.floor(Date.now()/1000);
      async function body() {
        if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw fail('Pedido inválido.', 400);
        const text = await request.text(); if (text.length > 16000) throw fail('Pedido demasiado grande.', 413);
        try { return JSON.parse(text); } catch { throw fail('Pedido inválido.', 400); }
      }
      if (path === '/challenge' || path === '/google') {
        if (request.method !== 'POST') throw fail('Método não permitido.', 405);
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        if (!(await env.AUTH_LIMITER.limit({key: await hash(ip)})).success) throw fail('Demasiadas tentativas. Aguarde e tente novamente.', 429);
        if (path === '/challenge') {
          const nonce = random();
          await db.batch([db.prepare('DELETE FROM challenges WHERE expires_at < ?').bind(now), db.prepare('INSERT INTO challenges VALUES (?, ?)').bind(await hash(nonce), now+300)]);
          return cors(json({nonce}));
        }
        const data = await body();
        if (typeof data.idToken !== 'string' || typeof data.nonce !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(data.nonce)) throw fail('Credencial inválida.', 401);
        let claims;
        try { claims = await verify(data.idToken, env.GOOGLE_CLIENT_ID, data.nonce); } catch { throw fail("Identidade Google inválida.", 401); }
        const consumed = await db.prepare('DELETE FROM challenges WHERE nonce_hash = ? AND expires_at >= ? RETURNING nonce_hash').bind(await hash(data.nonce),now).first();
        if (!consumed) throw fail('Pedido de login expirado ou já utilizado.', 401);
        const id = crypto.randomUUID(), token = random();
        await db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?) ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email, name=excluded.name').bind(id, claims.sub, claims.email, String(claims.name || 'Utilizador').slice(0,120), now).run();
        const user = await db.prepare('SELECT id, email, name FROM users WHERE google_sub = ?').bind(claims.sub).first();
        await db.batch([db.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at < ?').bind(user.id, now), db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').bind(await hash(token), user.id, now+43200)]);
        return cors(json({token, expiresAt:now+43200, user}));
      }
      const bearer = request.headers.get('Authorization') || '';
      if (!/^Bearer [A-Za-z0-9_-]{43}$/.test(bearer)) throw fail('Entre com Google para continuar.', 401);
      const tokenHash = await hash(bearer.slice(7));
      const session = await db.prepare('SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(tokenHash,now).first();
      if (!session) throw fail('Sessão expirada. Entre novamente com Google.',401);
      if (path === '/me' && request.method === 'GET') return cors(json({user:{id:session.id,email:session.email,user_metadata:{name:session.name,full_name:session.name}}}));
      if (path === '/logout' && request.method === 'POST') { await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(tokenHash).run(); return cors(json({ok:true})); }
      if (path === '/me' && request.method === 'DELETE') {
        await db.batch([db.prepare('DELETE FROM sessions WHERE user_id=?').bind(session.id),db.prepare('DELETE FROM favorites WHERE user_id=?').bind(session.id),db.prepare('DELETE FROM users WHERE id=?').bind(session.id)]);
        return cors(json({ok:true}));
      }
      if (path === '/favorites' && request.method === 'GET') {
        const rows = await db.prepare('SELECT station_id FROM favorites WHERE user_id=? ORDER BY created_at DESC LIMIT 200').bind(session.id).all();
        return cors(json({favorites:rows.results.map(row=>row.station_id)}));
      }
      if (path.startsWith('/favorites/') && ['PUT','DELETE'].includes(request.method)) {
        const id = decodeURIComponent(path.slice('/favorites/'.length));
        if (!/^[a-zA-Z0-9:_-]{1,160}$/.test(id)) throw fail('Posto inválido.',400);
        if (request.method === 'DELETE') await db.prepare('DELETE FROM favorites WHERE user_id=? AND station_id=?').bind(session.id,id).run();
        else await db.prepare('INSERT OR IGNORE INTO favorites SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM favorites WHERE user_id=?) < 200').bind(session.id,id,now,session.id).run();
        if (request.method === 'PUT' && !await db.prepare('SELECT station_id FROM favorites WHERE user_id=? AND station_id=?').bind(session.id,id).first()) throw fail('Limite de 200 favoritos atingido.',409);
        return cors(json({ok:true}));
      }
      throw fail('Pedido não encontrado.',404);
    } catch (error) { return cors(json({error: error.status ? error.message : 'Não foi possível concluir o pedido.'},error.status || 500)); }
  }};
}
export default createWorker();
