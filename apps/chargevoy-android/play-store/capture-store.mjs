import {existsSync} from 'node:fs';
import {readFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
const app=resolve(import.meta.dirname,'..'),dir=resolve(app,'dist'),out=resolve(import.meta.dirname,'export');
await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname;const file=resolve(dir,'.'+(p==='/'?'/index.html':p));if(!file.startsWith(dir+'/'))throw Error();const data=await readFile(file);res.setHeader('content-type',{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'}[extname(file)]||'application/octet-stream');res.end(data)}catch{res.writeHead(404);res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||(existsSync('/usr/bin/google-chrome')?'/usr/bin/google-chrome':chromium.executablePath()),headless:true,args:['--no-sandbox']});
try{
  // Render the released Android interface; no station, tariff or availability fixtures.
  const context=await browser.newContext({viewport:{width:432,height:768},deviceScaleFactor:2.5,hasTouch:true,isMobile:true,locale:'pt-PT',geolocation:{latitude:39.743,longitude:-8.807},permissions:['geolocation']});
  await context.addInitScript(()=>{localStorage.setItem('analytics-consent','denied');localStorage.setItem('chargevoy-android-scenario',JSON.stringify({start:32,target:80,period:'fora_vazio'}));});
  const page=await context.newPage();
  page.on('pageerror',e=>console.warn('Page error:',e.message));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.AndroidChargeVoy&&typeof allStations!=='undefined'&&allStations.length>100,{timeout:90000});
  await page.locator('#map-use-location').click();
  await page.waitForFunction(()=>!document.querySelector('#map-use-location').disabled,{timeout:45000});
  await page.waitForFunction(()=>document.querySelector('#android-vehicle-thumbnail img, #android-vehicle-thumbnail svg'),{timeout:45000});
  await page.waitForTimeout(8000);
  console.log('Real catalogue:',await page.evaluate(()=>({stations:allStations.length,hero:document.querySelector('#android-hero').innerText})));
  const capture=async name=>{await page.waitForTimeout(1000);await page.screenshot({path:resolve(out,name+'.jpg'),type:'jpeg',quality:96,fullPage:false});};
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await capture('01-mapa');
  await page.evaluate(()=>window.scrollTo({top:Math.max(0,document.querySelector('#android-hero').getBoundingClientRect().top+window.scrollY-20),behavior:'instant'}));
  await capture('02-opcoes-de-carregamento');
  await page.locator('#nav-vehicle').click();
  await page.evaluate(()=>document.querySelector('#filter-menu').scrollTo({top:0,behavior:'instant'}));
  await capture('03-veiculo-e-filtros');
  await page.locator('#close-mobile-filters').click();
  await page.locator('#nav-routes').click();
  await page.locator('#route-origin').fill('Leiria');
  await page.locator('#route-destination').fill('Lisboa');
  await page.evaluate(()=>{routeOriginOverride={input:'Leiria',label:'Leiria',lat:39.743,lon:-8.807};routeDestinationOverride={input:'Lisboa',label:'Lisboa',lat:38.7223,lon:-9.1393};});
  await page.evaluate(()=>window.scrollTo({top:Math.max(0,document.querySelector('#route-planner').getBoundingClientRect().top+window.scrollY-10),behavior:'instant'}));
  await capture('04-planeador-de-rotas');
  await context.close();
  const art=await browser.newPage();
  for(const [name,w,h,format] of [['icon',512,512,'png'],['feature-graphic',1024,500,'jpeg']]){
    await art.setViewportSize({width:w,height:h});
    await art.setContent('<style>body{margin:0}</style>'+await readFile(resolve(import.meta.dirname,'artwork',name+'.svg'),'utf8'));
    await art.screenshot({path:resolve(out,name+(format==='png'?'.png':'.jpg')),type:format,...(format==='jpeg'?{quality:100}:{})});
  }
  await copyFile(resolve(import.meta.dirname,'listing-pt-PT.txt'),resolve(out,'textos-pt-PT.txt'));
  await art.close();
}finally{await browser.close();server.close();}
