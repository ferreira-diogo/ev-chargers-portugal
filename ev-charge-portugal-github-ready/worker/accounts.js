// Same-origin browser gateway. Native clients continue to use bearer sessions.
const API = 'https://chargevoy-android-accounts-staging.zombid.workers.dev';
const COOKIE = '__Host-chargevoy_session';
const cookie = (token, age) => `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const reply = (body, status) => Response.json(body, {status, headers:{'Cache-Control':'no-store'}});
export async function accountGateway(request, upstream = fetch) {
  const url = new URL(request.url);
  let path;try{path=decodeURIComponent(url.pathname.slice('/api/account'.length));}catch{return reply({error:'Pedido inválido.'},400);}
  const allowed = new Map([['/challenge',['POST']],['/google',['POST']],['/me',['GET','DELETE']],['/logout',['POST']],['/favorites',['GET']],['/preferences',['GET','PUT']],['/history',['GET','POST']]]);
  const methods = allowed.get(path) || (/^\/favorites\/[a-zA-Z0-9:_-]{1,160}$/.test(path)?['PUT','DELETE']:/^\/reviews\/[a-zA-Z0-9:_-]{1,160}$/.test(path)?['GET','PUT']:[]);
  if (!methods.includes(request.method)) return reply({error:'Pedido não permitido.'},405);
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site' || (request.method !== 'GET' && request.headers.get('Origin') !== url.origin)) return reply({error:'Origem não autorizada.'},403);
  const headers = new Headers();
  headers.set('Content-Type','application/json');
  // Do not forward caller-provided authorization, cookies or proxy headers.
  const token = (request.headers.get('Cookie') || '').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) headers.set('Authorization','Bearer '+token);
  const expected = request.headers.get('X-ChargeVoy-Expected-User');
  if (expected && /^[a-zA-Z0-9-]{1,80}$/.test(expected)) headers.set('X-ChargeVoy-Expected-User',expected);
  let body;
  if (['POST','PUT'].includes(request.method)) {
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return reply({error:'Pedido inválido.'},400);
    if (Number(request.headers.get('Content-Length')) > 16000) return reply({error:'Pedido demasiado grande.'},413);
    body = await request.text();
    if (body.length > 16000) return reply({error:'Pedido demasiado grande.'},413);
  }
  try {
    const response = await upstream(API + path, {method:request.method,headers,body,redirect:'error',signal:AbortSignal.timeout(15000)});
    const data = await response.json();
    const output = {...data};
    delete output.token;
    const result = reply(output,response.status);
    if (path === '/google' && response.ok) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(data.token || '') || !Number.isSafeInteger(data.expiresAt) || data.expiresAt<=Math.floor(Date.now()/1000)) return reply({error:'Sessão inválida.'},502);
      result.headers.set('Set-Cookie',cookie(data.token,Math.max(0,Math.min(43200,data.expiresAt-Math.floor(Date.now()/1000)))));
    } else if ((path === '/logout' && response.ok) || (path === '/me' && request.method === 'DELETE' && response.ok)) {
      result.headers.set('Set-Cookie',cookie('',0));
    }
    return result;
  } catch { return reply({error:'Serviço de contas temporariamente indisponível.'},503); }
}
