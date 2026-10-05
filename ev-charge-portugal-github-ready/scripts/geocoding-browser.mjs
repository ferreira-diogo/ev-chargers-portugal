import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const source=await readFile(new URL('../assets/geocoding.js',import.meta.url),'utf8');
const css=await readFile(new URL('../assets/geocoding.css',import.meta.url),'utf8');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
const place=(name,lat,lon,county)=>({name,display_name:`${name}, ${county}, Portugal`,lat:String(lat),lon:String(lon),category:'place',type:'village',addresstype:'village',address:{country_code:'pt'}});
try{
  for(const viewport of [{width:390,height:844},{width:1080,height:800}]){
    const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://nominatim.openstreetmap.org/**',route=>route.fulfill({json:[place('Vila Nova',41,-8,'Concelho A'),place('Vila Nova',38,-9,'Concelho B')]}));
    await page.setContent(`<html lang="pt-PT"><head><style>${css}</style></head><body><button id="search">Pesquisar</button><output id="result"></output></body></html>`);
    await page.addScriptTag({content:source});
    await page.addScriptTag({content:`document.getElementById('search').addEventListener('click',async()=>{try{const p=await ChargeVoyGeocoding.resolve('Vila Nova');document.getElementById('result').textContent=JSON.stringify(p)}catch(e){document.getElementById('result').textContent=e.name}})`});
    await page.locator('#search').click();await page.getByRole('dialog').waitFor();
    assert.equal(await page.getByRole('button',{name:/Vila Nova · Aldeia/}).count(),2);
    const box=await page.getByRole('dialog').boundingBox();assert(box.width<=viewport.width&&box.height<=viewport.height);
    await page.getByRole('button',{name:/Concelho B/}).click();
    const selected=JSON.parse(await page.locator('#result').textContent());assert.equal(selected.lat,38);assert.equal(selected.lon,-9);
    assert.equal(await page.getByRole('dialog').count(),0);
    await page.locator('#search').click();await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});
    assert.equal(await page.locator('#result').textContent(),'AbortError');assert.equal(await page.locator('#search').evaluate(el=>el===document.activeElement),true);
    await page.locator('#search').click();await page.getByRole('button',{name:'Cancelar',exact:true}).click();
    assert.equal(await page.getByRole('dialog').count(),0);
    assert.equal(errors.length,0,errors.join('\n'));await page.close();
  }
  console.log('Location chooser: mobile/tablet layout, explicit destination, Escape, cancel and focus restoration passed.');
}finally{await browser.close();}
