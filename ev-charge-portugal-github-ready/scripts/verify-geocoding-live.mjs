import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=await readFile(new URL('../assets/geocoding.js',import.meta.url),'utf8');
const context=vm.createContext({URLSearchParams,AbortController,Date,setTimeout,clearTimeout});
vm.runInContext(source,context);
for(const [query,lat,lon,ambiguous] of [['Bragança',41.806,-6.757,false],['Leiria',39.744,-8.807,false],['Faro',37.019,-7.931,false],['Castelo Branco',39.823,-7.491,true],['Marinha Grande',39.748,-8.933,false],['Funchal',32.65,-16.91,false],['Ponta Delgada',37.74,-25.67,true]]){
  try{
    const params=new URLSearchParams({q:query,format:'jsonv2',countrycodes:'pt',limit:'8',addressdetails:'1',namedetails:'1',dedupe:'0','accept-language':'pt-PT'});
    const response=await fetch('https://nominatim.openstreetmap.org/search?'+params,{headers:{'User-Agent':'ChargeVoy-geocoding-validation/1.0 (+https://chargevoy.pt)'},signal:AbortSignal.timeout(12000)});
    assert(response.ok,`Geocoder HTTP ${response.status}`);
    const options=context.ChargeVoyGeocoding.candidates(await response.json(),query);
    const automatic=context.ChargeVoyGeocoding.automaticChoice(options,query);
    if(ambiguous)assert.equal(automatic,null,`${query} must ask which locality the user means`);
    else assert(automatic,`${query} should resolve uniquely to its settlement`);
    // For repeated names, verify the primary city is a selectable urban option;
    // do not pretend the live validator made an actual user's choice.
    const place=automatic||options.find(p=>p.addresstype==='city');assert(place);
    const km=Math.hypot((Number(place.lat)-lat)*111,(Number(place.lon)-lon)*111*Math.cos(lat*Math.PI/180));
    console.log(JSON.stringify({query,label:place.display_name,lat:place.lat,lon:place.lon,requires_confirmation:!automatic,distance_from_city_km:Number(km.toFixed(2))}));
    assert(km<5,`${query} resolved more than 5 km from its urban centre`);
  }catch(error){console.error(`${query}: ${error.stack}`);process.exitCode=1;}
  await new Promise(resolve=>setTimeout(resolve,1100));
}
