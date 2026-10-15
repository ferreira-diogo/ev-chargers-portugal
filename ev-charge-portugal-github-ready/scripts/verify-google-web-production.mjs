import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const out=resolve(import.meta.dirname,'qa');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
try{
 for(const [i,origin] of ['https://chargevoy.pt','https://www.chargevoy.pt'].entries()){
  const context=await browser.newContext({viewport:i?{width:1440,height:900}:{width:390,height:844},serviceWorkers:'block'});
  const page=await context.newPage(),errors=[],google=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.url().startsWith('https://accounts.google.com/gsi/button'))google.push(response.status());});
  await page.goto(origin+'/',{waitUntil:'domcontentloaded',timeout:45000});
  const site=new URL(page.url()).origin;
  await page.waitForFunction(()=>Boolean(window.ChargeVoyAccount&&window.WebChargeVoy),null,{timeout:45000});
  const me=await page.request.get(site+'/api/account/me');assert.equal(me.status(),401);assert.match(me.headers()['cache-control'],/no-store/);
  assert(!('token' in await me.json()));
  const forbidden=await page.request.post(site+'/api/account/challenge',{headers:{Origin:'https://example.invalid'},data:{}});assert.equal(forbidden.status(),403);
  await page.locator('#nav-account').click();
  await page.locator('#google-signin-button iframe').waitFor({state:'visible',timeout:30000});
  await page.waitForTimeout(1000);
  assert(google.includes(200),'The real Google sign-in button must load');assert(!google.includes(403));
  assert.equal(await page.locator('input[type="password"]').count(),0);
  assert.equal(await page.getByText('Entrar com email',{exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>currentSession),null);
  assert.equal(errors.length,0,errors.join('\n'));
  await page.screenshot({path:resolve(out,i?'production-google-desktop.png':'production-google-mobile.png'),fullPage:true});
  console.log(JSON.stringify({requestedOrigin:origin,effectiveOrigin:site,anonymousSession:me.status(),crossOriginWrite:forbidden.status(),googleButton:200,passwordInputs:0,errors}));
  await context.close();
 }
 console.log('Published Google-only login and anonymous-session/CSRF boundaries passed. No real user sign-in or account creation was performed.');
}finally{await browser.close();}
