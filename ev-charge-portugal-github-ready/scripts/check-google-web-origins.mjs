// Read-only diagnostic: no login, credentials or account creation.
import {chromium} from 'playwright';
const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),headless:true,args:['--no-sandbox']});
const client='1094158912679-4vs9a9t3lrv54uv4h9lmmmb1aq2h9roo.apps.googleusercontent.com';
try{
 for(const origin of ['https://chargevoy.pt','https://www.chargevoy.pt']){
  const context=await browser.newContext(),page=await context.newPage(),messages=[],responses=[];
  page.on('console',message=>{if(/GSI|origin|client/i.test(message.text()))messages.push(message.text());});
  page.on('response',response=>{if(response.url().startsWith('https://accounts.google.com/gsi/'))responses.push({path:new URL(response.url()).pathname,status:response.status()});});
  // Render only a diagnostic document at the intended origin. Never reuse a signed-in browser.
  await page.route(origin+'/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><title>Google origin diagnostic</title></head><body><div id="button"></div></body></html>'}));
  let loaded=false;
  try{
   await page.goto(origin+'/');await page.addScriptTag({url:'https://accounts.google.com/gsi/client'});
   await page.evaluate(client=>{google.accounts.id.initialize({client_id:client,callback(){},auto_select:false});google.accounts.id.renderButton(document.getElementById('button'),{theme:'outline',size:'large'});google.accounts.id.prompt();},client);
   await page.waitForTimeout(3500);loaded=true;
  }catch(error){messages.push(error.message.slice(0,300));}
  const rejected=messages.some(x=>/origin.+(?:not allowed|not registered|mismatch)|origin_mismatch/i.test(x));
  console.log(JSON.stringify({origin,result:rejected?'origin-rejected':loaded?'no-origin-error-observed':'inconclusive',responses,messages}));
  await context.close();
 }
}finally{await browser.close();}
