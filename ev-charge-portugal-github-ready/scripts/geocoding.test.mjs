import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../assets/geocoding.js',import.meta.url),'utf8');
function load(fetch=async()=>({ok:true,json:async()=>[]})) {
  const context=vm.createContext({URLSearchParams,AbortController,Date,setTimeout,clearTimeout,fetch});
  vm.runInContext(source,context);return context.ChargeVoyGeocoding;
}
const city=(name,lat=41.806,lon=-6.757,extra={})=>({name,display_name:`${name}, Portugal`,lat:String(lat),lon:String(lon),category:'place',type:'city',addresstype:'city',osm_type:'node',address:{country_code:'pt'},...extra});
const district={...city('Distrito de Bragança',41.55,-6.8),category:'boundary',type:'administrative',addresstype:'state',osm_type:'relation'};
test('Bragança city wins over the district and municipality centroids',()=>{
  const api=load(),town=city('Bragança'),municipality={...district,name:'Bragança',addresstype:'municipality'};
  const options=api.candidates([district,municipality,town],'Bragança');assert.equal(api.automaticChoice(options,'Bragança'),town);
});
test('district-only and municipality-only matches require explicit confirmation',()=>{
  const api=load();assert.equal(api.automaticChoice([district],'Bragança'),null);
  assert.equal(api.automaticChoice([{...district,name:'Bragança'}],'Bragança'),null);
});
test('an explicit district request can use its unique administrative result',()=>{
  assert.equal(load().automaticChoice([district],'Distrito de Bragança'),district);
});
test('Portuguese accents and case do not prevent an exact locality match',()=>{
  const town=city('Bragança');assert.equal(load().automaticChoice([district,town],' BRAGANCA '),town);
});
test('two localities with the same name require a choice',()=>{
  const api=load(),a=city('Vila Nova',41,-8,{type:'village',addresstype:'village'}),b=city('Vila Nova',38,-9,{type:'village',addresstype:'village'});
  assert.equal(api.automaticChoice(api.candidates([a,b],'Vila Nova'),'Vila Nova'),null);
});
test('villages and hamlets remain valid destinations',()=>{
  for(const type of ['village','hamlet']){const place=city('Rio de Onor',41.933,-6.615,{type,addresstype:type});assert.equal(load().automaticChoice([place],'Rio de Onor'),place);}
});
test('address and hotel searches retain their precise coordinates',()=>{
  const api=load(),hotel=city('Água Hotels Terra Fria',41.78,-6.76,{category:'tourism',type:'hotel',addresstype:'tourism',osm_type:'way'});
  assert.equal(api.automaticChoice([hotel],'Água Hotels Terra Fria, Bragança'),hotel);
  assert.equal(api.automaticChoice([hotel],'Rua do Teste 10, Bragança'),hotel);
});
test('Madeira and Açores are accepted without mainland bounding boxes',()=>{
  const api=load();for(const place of [city('Funchal',32.65,-16.91),city('Ponta Delgada',37.74,-25.67)])assert.equal(api.candidates([place],place.name)[0],place);
});
test('invalid coordinates and foreign matches are rejected',()=>{
  const api=load();assert.equal(api.candidates([city('Bragança',NaN),city('Bragança',100),{...city('Bragança'),lat:null},city('Bragança',41,-6,{address:{country_code:'es'}})],'Bragança').length,0);
});
test('duplicate representations collapse without merging distant localities',()=>{
  const api=load(),a=city('Vila Nova',41,-8,{osm_id:10}),near=city('Vila Nova',41.00001,-8,{osm_id:11}),far=city('Vila Nova',38,-9,{osm_id:12});
  assert.equal(api.candidates([a,near,far],'Vila Nova').length,2);
});
test('resolved coordinates are reused without repeating external requests',async()=>{
  let calls=0;const town=city('Bragança');const api=load(async url=>{calls++;const p=new URL(url).searchParams;assert.equal(p.get('limit'),'8');assert.equal(p.get('dedupe'),'0');assert.equal(p.get('countrycodes'),'pt');assert.equal(p.get('addressdetails'),'1');assert.equal(p.has('viewbox'),false);return {ok:true,json:async()=>[district,town]};});
  const result=await api.resolve('Bragança');assert.equal(result.lat,41.806);assert.equal(result.lon,-6.757);
  await api.resolve('braganca');assert.equal(calls,1);
});
test('a district hiding the city triggers a structured settlement search',async()=>{
  let calls=0;const town=city('Bragança');const api=load(async url=>{calls++;const p=new URL(url).searchParams;if(calls===1)return {ok:true,json:async()=>[district]};assert.equal(p.get('city'),'Bragança');assert.equal(p.has('q'),false);assert.equal(p.get('featureType'),'city');return {ok:true,json:async()=>[town]};});
  const result=await api.resolve('Bragança');assert.equal(result.lat,41.806);assert.equal(calls,2);
});
test('HTTP errors and absent locations remain errors, never a fallback coordinate',async()=>{
  await assert.rejects(load(async()=>({ok:false,status:429})).resolve('Bragança'),/HTTP 429/);
  await assert.rejects(load().resolve('Nada, Portugal'),/Local não encontrado/);
});
test('both platforms load the shared resolver before the controller and use it for map/routes',async()=>{
  for(const [htmlPath,jsPath] of [['../index.html','../assets/chargevoy.js'],['../../apps/chargevoy-android/src/index.html','../../apps/chargevoy-android/src/chargevoy.js']]){
    const html=await readFile(new URL(htmlPath,import.meta.url),'utf8'),js=await readFile(new URL(jsPath,import.meta.url),'utf8');
    assert(html.indexOf('assets/geocoding.js')<html.indexOf('assets/chargevoy.js'));
    assert(html.includes('assets/geocoding.css'));assert(js.includes('window.ChargeVoyGeocoding.resolve(query)'));
    assert(js.includes('await geocodePortugal(query)'));assert(js.includes('await geocodePortugal(originText)'));assert(js.includes('await geocodePortugal(destinationText)'));
  }
});
