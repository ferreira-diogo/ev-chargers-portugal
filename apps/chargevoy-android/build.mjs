import {cp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
const app=resolve(import.meta.dirname),web=resolve(app,'../../ev-charge-portugal-github-ready'),dist=resolve(app,'dist');
await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
await cp(resolve(web,'assets'),resolve(dist,'assets'),{recursive:true});
// Only reviewed Android cutouts override the shared catalogue.
const photos=JSON.parse(await readFile(resolve(app,'vehicle-images/credits.json'),'utf8'));
await writeFile(resolve(dist,'assets/vehicle-images/credits.json'),JSON.stringify(photos,null,2));
for(const photo of photos.filter(photo=>photo.android_segmented)) {
  const name=photo.image.split('/').at(-1);
  await cp(resolve(app,'vehicle-images',name),resolve(dist,'assets/vehicle-images',name));
}
await cp(resolve(web,'icon.svg'),resolve(dist,'icon.svg'));
await cp(resolve(app,'src/index.html'),resolve(dist,'index.html'));
for(const name of ['chargevoy.js','android-ui.js','android-ui.css','recommendations.js','route-corridor.js','account.js','search-suggestions.js','android-config.js'])await cp(resolve(app,'src',name),resolve(dist,'assets',name));
if(process.env.ANDROID_INCLUDE_CATALOGUE === '1') {
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
await writeFile(resolve(dist,'android-build.json'),JSON.stringify({interface:'android-only',version:'1.1.1',built_at:new Date().toISOString()}));
console.log('Android-only bundle built in apps/chargevoy-android/dist; web bundle untouched.');
