import {cp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const app=resolve(import.meta.dirname),web=resolve(app,'../../ev-charge-portugal-github-ready'),dist=resolve(app,'dist');
await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
await cp(resolve(web,'assets'),resolve(dist,'assets'),{recursive:true});
await cp(resolve(web,'icon.svg'),resolve(dist,'icon.svg'));
await cp(resolve(app,'src/index.html'),resolve(dist,'index.html'));
for(const name of ['chargevoy.js','android-ui.js','android-ui.css','recommendations.js'])await cp(resolve(app,'src',name),resolve(dist,'assets',name));
await cp(resolve(app,'src/assets'),resolve(dist,'assets'),{recursive:true});
// Merge Android-only vehicle credits with the read-only website photo catalogue.
const basePhotos=JSON.parse(await readFile(resolve(web,'assets/vehicle-images/credits.json'),'utf8'));
const extraPhotos=JSON.parse(await readFile(resolve(app,'src/assets/vehicle-images/additions.json'),'utf8'));
await writeFile(resolve(dist,'assets/vehicle-images/credits.json'),JSON.stringify([...basePhotos,...extraPhotos]));
if(process.env.ANDROID_INCLUDE_CATALOGUE === '1') {
  execFileSync('python3',[resolve(app,'scripts/package-tariffs.py'),'--out',resolve(dist,'assets/opc-tariffs-snapshot.json')],{stdio:'inherit'});
  let failure;
  for(let attempt=1;attempt<=3;attempt++) {
    try {
      const response=await fetch('https://broken-mud-373e.zombid.workers.dev/assets/stations-snapshot.json',{signal:AbortSignal.timeout(45000)});
      if(!response.ok)throw Error(`National catalogue HTTP ${response.status}`);
      const text=await response.text(),snapshot=JSON.parse(text);
      if(!Array.isArray(snapshot.stations)||snapshot.stations.length<8000||!Array.isArray(snapshot.connectors)||snapshot.connectors.length<15000)throw Error('Incomplete national catalogue');
      await writeFile(resolve(dist,'assets/stations-snapshot.json'),text);
      console.log(`Packaged national catalogue: ${snapshot.stations.length} stations, ${snapshot.connectors.length} connectors; no D1 import.`);
      failure=null;break;
    }catch(error){failure=error;console.warn(`Catalogue attempt ${attempt}: ${error.message}`);}
  }
  if(failure)throw failure;
}
await writeFile(resolve(dist,'android-build.json'),JSON.stringify({interface:'android-only',version:'1.1.0',built_at:new Date().toISOString()}));
console.log('Android-only bundle built in apps/chargevoy-android/dist; web bundle untouched.');
