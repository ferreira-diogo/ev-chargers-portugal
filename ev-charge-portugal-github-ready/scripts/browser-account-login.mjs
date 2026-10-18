import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const dir=resolve(import.meta.dirname,'../dist'),out=resolve(import.meta.dirname,'qa');await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;const file=resolve(dir,'.'+(path==='/'?'/index.html':path));if(!file.startsWith(dir+'/'))throw Error();res.setHeader('content-type',{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'}[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 const supabaseCalls=[];page.on('request',request=>{const host=new URL(request.url()).hostname;if(/(^|\.)supabase\.(co|in|net)$/i.test(host))supabaseCalls.push(request.url());});
 page.on('pageerror',e=>errors.push(e.message));
 const car={id:'account-test-car',make:'Tesla',model:'Model 3',variant:'RWD',battery_capacity_kwh:60,max_ac_power_kw:11,max_dc_power_kw:170,consumption_wh_km:150,connector_types:['CCS','Type 2'],active:1};
 const now=new Date().toISOString(),stations=['alice','bob','guest'].map((name,i)=>({id:'nap-'+name,name:name+' station',operator_id:'op-'+i,operator_name:'Powerdot',source:'nap-mobie',latitude:39.74+i*.01,longitude:-8.8,max_power_kw:150,status:'available'}));
 const connectors=stations.map(s=>({id:s.id+'-c',station_id:s.id,type:'CCS',power_kw:150,quantity:2,available_count:1,status:'available',availability_source:'mobie_nap',availability_updated_at:now}));
 let active=null,next='alice';
 const favourites={alice:['nap-alice'],bob:['nap-bob']};
 const prefs={alice:{revision:1,preferences:{language:'en',vehicle:{id:car.id,specs:{}},battery:{start:30,target:80},filters:{powers:['50-150','150-250'],operators:['Powerdot'],connectors:['CCS'],statuses:['available','unknown']}}},bob:{revision:1,preferences:{language:'pt',vehicle:{id:car.id,specs:{}},battery:{start:60,target:90}}}};
 const user=()=>({id:active,email:active+'@example.test',name:active==='alice'?'Alice':'Bob',user_metadata:{name:active==='alice'?'Alice':'Bob'}});
 await context.addInitScript(()=>{localStorage.setItem('analytics-consent','denied');localStorage.setItem('ev-charge-favorites','["nap-guest"]');localStorage.setItem('ev-charge-vehicle','account-test-car');});
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;
  if(url.hostname==='accounts.google.com'&&path==='/gsi/client')return route.fulfill({contentType:'text/javascript',body:`window.google={accounts:{id:{initialize(config){window.googleTestCallback=config.callback;},renderButton(parent){const b=document.createElement('button');b.textContent='Entrar com Google';b.onclick=()=>window.googleTestCallback({credential:'fake-test-id-token'});parent.appendChild(b);},disableAutoSelect(){}}}};`});
  if(path.startsWith('/api/account/')){
   const endpoint=path.slice('/api/account'.length),method=request.method();
   if(endpoint==='/challenge')return route.fulfill({json:{nonce:'a'.repeat(43)}});
   if(endpoint==='/google'){active=next;return route.fulfill({json:{user:user(),expiresAt:Date.now()/1000+43200}});}
   if(!active)return route.fulfill({status:401,json:{error:'Entre com Google.'}});
   const expected=request.headers()['x-chargevoy-expected-user'];if(expected&&expected!==active)return route.fulfill({status:409,json:{error:'Conta mudou.'}});
   if(endpoint==='/me')return route.fulfill({json:{user:user()}});
   if(endpoint==='/logout'){active=null;return route.fulfill({json:{ok:true}});}
   if(endpoint==='/favorites')return route.fulfill({json:{favorites:favourites[active]}});
   if(endpoint==='/preferences'){
    if(method==='PUT'){const body=request.postDataJSON();if(body.baseRevision!==prefs[active].revision)return route.fulfill({status:409,json:prefs[active]});prefs[active]={revision:prefs[active].revision+1,preferences:{...prefs[active].preferences,...body.changes}};}
    return route.fulfill({json:prefs[active]});
   }
   if(endpoint.startsWith('/favorites/')){const id=endpoint.slice('/favorites/'.length);favourites[active]=method==='PUT'?[...new Set([...favourites[active],id])]:favourites[active].filter(x=>x!==id);return route.fulfill({json:{ok:true}});}
   if(endpoint==='/history')return route.fulfill({json:{history:[]}});
   if(endpoint.startsWith('/reviews/'))return route.fulfill({json:{reviews:[],summary:{review_count:0}}});
  }
  if(path==='/api/stations')return route.fulfill({json:{stations,connectors}});
  if(path==='/api/availability')return route.fulfill({json:{publication_time:now,statuses:{}}});
  if(path==='/api/catalog'){const table=url.searchParams.get('table');return route.fulfill({json:{rows:table==='vehicle_models'?(Number(url.searchParams.get('offset')||0)===0?[car]:[]):table==='operators'?stations.map(s=>({id:s.operator_id,name:s.operator_name})):[]}});}
  if(path.endsWith('/stations-snapshot.json'))return route.fulfill({status:404,body:''});
  if(url.hostname.endsWith('supabase.co'))return route.abort('blockedbyclient');
  return route.continue();
 });
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.WebChargeVoy&&window.ChargeVoyWebPreferences&&currentVehicle);
 await page.locator('#nav-account').click();await page.locator('#google-signin-button button').waitFor();
 assert.equal(await page.locator('input[type=password]').count(),0);assert.equal(await page.getByText('Entrar com email',{exact:true}).count(),0);
 await page.screenshot({path:resolve(out,'google-login-mobile.png'),fullPage:true});
 await page.locator('#google-signin-button button').click();
 await page.waitForFunction(()=>currentSession?.user?.id==='alice'&&currentLanguage==='en'&&window.WebChargeVoy.getScenario().start===30);
 assert.deepEqual(favourites.alice,['nap-alice']);assert.equal(await page.evaluate(()=>Array.from(favoriteStationIds).includes('nap-guest')),false);
 assert.equal(await page.evaluate(()=>selectedPower),'50-150,150-250');assert.equal(await page.evaluate(()=>matchesPower(175)),true);
 await page.locator('#android-soc').click();await page.locator('#android-start').fill('45');await page.locator('#android-save-scenario').click();
 await page.waitForFunction(()=>document.querySelector('#android-soc-label').textContent==='45% → 80%');
 await page.waitForTimeout(900);assert.equal(prefs.alice.preferences.battery.start,45);
 await page.locator('#nav-account').click();await page.locator('[onclick="signOutUser()"]').click();
 await page.waitForFunction(()=>!currentSession);next='bob';
 await page.locator('#nav-account').click();await page.locator('#google-signin-button button').click();
 await page.waitForFunction(()=>currentSession?.user?.id==='bob'&&currentLanguage==='pt'&&window.WebChargeVoy.getScenario().start===60);
 assert.deepEqual(favourites.bob,['nap-bob']);assert.equal(await page.evaluate(()=>Array.from(favoriteStationIds).includes('nap-alice')),false);
 assert.equal(prefs.alice.preferences.battery.start,45);assert.equal(prefs.bob.preferences.battery.start,60);
 await page.locator('#nav-account').click();await page.setViewportSize({width:1440,height:900});
 await page.screenshot({path:resolve(out,'google-account-desktop.png'),fullPage:true});
 assert.equal(errors.length,0,errors.join('\n'));
 assert.equal(supabaseCalls.length,0,'Unexpected Supabase requests: '+JSON.stringify(supabaseCalls));console.log('SUPABASE AUDIT: account flows attempted zero Supabase requests.');
 console.log('Google-only web UI: two account sessions, isolated guest/favourites/preferences, battery sync, power ranges and responsive account modal passed. Google provider itself is mocked; real OAuth origins and two-device login remain acceptance checks.');
}finally{await browser.close();server.close();}
