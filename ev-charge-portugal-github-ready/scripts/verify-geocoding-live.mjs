import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=await readFile(new URL('../assets/geocoding.js',import.meta.url),'utf8');
const context=vm.createContext({URLSearchParams,AbortController,Date,setTimeout,clearTimeout,
  fetch:async(url,options)=>{
    const response=await fetch(url,{...options,headers:{'User-Agent':'ChargeVoy-geocoding-validation/1.0 (+https://chargevoy.pt)'}});
    if(response.ok){const raw=await response.clone().json();console.log(JSON.stringify({request:url,matches:raw.map(p=>({name:p.name,display_name:p.display_name,lat:p.lat,lon:p.lon,category:p.category,type:p.type,addresstype:p.addresstype,osm_type:p.osm_type,osm_id:p.osm_id,place_rank:p.place_rank,namedetails:p.namedetails}))}));}
    return response;
  }});
vm.runInContext(source,context);
for(const [query,lat,lon] of [['Bragança',41.806,-6.757],['Leiria',39.744,-8.807],['Faro',37.019,-7.931],['Castelo Branco',39.823,-7.491],['Marinha Grande',39.748,-8.933],['Funchal',32.65,-16.91],['Ponta Delgada',37.74,-25.67]]){
  try{
    const place=await context.ChargeVoyGeocoding.resolve(query);
    const km=Math.hypot((place.lat-lat)*111,(place.lon-lon)*111*Math.cos(lat*Math.PI/180));
    console.log(JSON.stringify({query,...place,distance_from_city_km:Number(km.toFixed(2))}));
    assert(km<5,`${query} resolved more than 5 km from its urban centre`);
  }catch(error){console.error(`${query}: ${error.stack}`);process.exitCode=1;}
}
