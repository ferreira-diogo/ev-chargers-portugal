import {createRemoteJWKSet, jwtVerify} from 'jose';
import {validatePreferencePatch} from './preferences.mjs';
import {validRoute, validReview} from './web-data.mjs';
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
      if (path === '/health' && request.method === 'GET') {
        const rows=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('user_preferences','account_route_history','account_station_reviews')").all();
        const ready=rows.results.length===3;
        return cors(json({ok:ready,service:'chargevoy-accounts-web-v1',schemaReady:ready},ready?200:503));
      }
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
      const reviewMatch = /^\/reviews\/([a-zA-Z0-9:_-]{1,160})$/.exec(path);
      if (reviewMatch && request.method === 'GET') {
        if (!(await env.AUTH_LIMITER.limit({key:'reviews:'+await hash(request.headers.get('CF-Connecting-IP') || 'unknown')})).success) throw fail('Aguarde antes de consultar novamente.',429);
        const reviews = await db.prepare('SELECT id, rating, comment, created_at FROM account_station_reviews WHERE station_id=? ORDER BY created_at DESC LIMIT 8').bind(reviewMatch[1]).all();
        const summary = await db.prepare('SELECT COUNT(*) AS review_count, AVG(rating) AS average_rating FROM account_station_reviews WHERE station_id=?').bind(reviewMatch[1]).first();
        return cors(json({reviews:reviews.results,summary}));
      }
      const bearer = request.headers.get('Authorization') || '';
      if (!/^Bearer [A-Za-z0-9_-]{43}$/.test(bearer)) throw fail('Entre com Google para continuar.', 401);
      const tokenHash = await hash(bearer.slice(7));
      const session = await db.prepare('SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(tokenHash,now).first();
      if (!session) throw fail('Sessão expirada. Entre novamente com Google.',401);
      const expected=request.headers.get('X-ChargeVoy-Expected-User');
      if (expected && expected !== session.id) throw fail('A conta mudou. Atualize a sessão antes de continuar.',409);
      if (path === '/preferences' && ['GET','PUT'].includes(request.method)) {
        const read = async () => {
          const row = await db.prepare('SELECT revision, data, updated_at FROM user_preferences WHERE user_id=?').bind(session.id).first();
          return row ? {revision:row.revision, preferences:JSON.parse(row.data), updatedAt:row.updated_at} : {revision:0, preferences:{}, updatedAt:null};
        };
        if (request.method === 'GET') return cors(json(await read()));
        const data = await body();
        if (!validatePreferencePatch(data)) throw fail('Preferências inválidas.',400);
        // Limit writes per authenticated owner, independently of login/IP limits.
        if (!(await env.AUTH_LIMITER.limit({key:'preferences:'+session.id})).success) throw fail('Aguarde antes de voltar a sincronizar.',429);
        const current = await read();
        if (data.baseRevision !== current.revision) return cors(json({...current,error:'Preferências alteradas noutro dispositivo.'},409));
        const next = {...current.preferences};
        for (const [key,value] of Object.entries(data.changes)) {if(value === null)delete next[key];else next[key]=value;}
        // Compare and swap is atomic, including concurrent first writes.
        const row = await db.prepare('INSERT INTO user_preferences (user_id, revision, data, updated_at) SELECT ?, 1, ?, ? WHERE ?=0 OR EXISTS (SELECT 1 FROM user_preferences WHERE user_id=? AND revision=?) ON CONFLICT(user_id) DO UPDATE SET revision=user_preferences.revision+1, data=excluded.data, updated_at=excluded.updated_at WHERE user_preferences.revision=? RETURNING revision, data, updated_at').bind(session.id,JSON.stringify(next),now,current.revision,session.id,current.revision,current.revision).first();
        if (!row) return cors(json({...await read(),error:'Preferências alteradas noutro dispositivo.'},409));
        return cors(json({revision:row.revision,preferences:JSON.parse(row.data),updatedAt:row.updated_at}));
      }
      if (path === '/me' && request.method === 'GET') return cors(json({user:{id:session.id,email:session.email,user_metadata:{name:session.name,full_name:session.name}}}));
      if (path === '/logout' && request.method === 'POST') { await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(tokenHash).run(); return cors(json({ok:true})); }
      if (path === '/me' && request.method === 'DELETE') {
        await db.batch([db.prepare('DELETE FROM sessions WHERE user_id=?').bind(session.id),db.prepare('DELETE FROM favorites WHERE user_id=?').bind(session.id),db.prepare('DELETE FROM user_preferences WHERE user_id=?').bind(session.id),db.prepare('DELETE FROM account_route_history WHERE user_id=?').bind(session.id),db.prepare('DELETE FROM account_station_reviews WHERE user_id=?').bind(session.id),db.prepare('DELETE FROM users WHERE id=?').bind(session.id)]);
        return cors(json({ok:true}));
      }
      if (path === '/history' && request.method === 'GET') {
        const rows = await db.prepare('SELECT id, origin_label, destination_label, distance_km, charging_minutes, created_at FROM account_route_history WHERE user_id=? ORDER BY created_at DESC LIMIT 20').bind(session.id).all();
        return cors(json({history:rows.results}));
      }
      if (path === '/history' && request.method === 'POST') {
        const data=await body();if(!validRoute(data))throw fail('Rota inválida.',400);
        if (!(await env.AUTH_LIMITER.limit({key:'history:'+session.id})).success)throw fail('Aguarde antes de guardar novamente.',429);
        await db.batch([db.prepare('INSERT INTO account_route_history VALUES (?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(),session.id,data.origin_label,data.destination_label,data.distance_km,data.charging_minutes,new Date().toISOString()),db.prepare('DELETE FROM account_route_history WHERE user_id=? AND id NOT IN (SELECT id FROM account_route_history WHERE user_id=? ORDER BY created_at DESC, rowid DESC LIMIT 20)').bind(session.id,session.id)]);
        return cors(json({ok:true}));
      }
      if (reviewMatch && request.method === 'PUT') {
        const data=await body();if(!validReview(data))throw fail('Avaliação inválida.',400);
        if (!(await env.AUTH_LIMITER.limit({key:'review-write:'+session.id})).success)throw fail('Aguarde antes de avaliar novamente.',429);
        await db.prepare('INSERT INTO account_station_reviews VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, station_id) DO UPDATE SET rating=excluded.rating, comment=excluded.comment, created_at=excluded.created_at').bind(crypto.randomUUID(),session.id,reviewMatch[1],data.rating,data.comment,new Date().toISOString()).run();
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
