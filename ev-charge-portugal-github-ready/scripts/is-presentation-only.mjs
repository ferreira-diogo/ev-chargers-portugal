import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
const base=process.argv[2];
const allowed=new Set(['index.html','package.json','privacy.html','account-deletion.html','service-worker.js','assets/chargevoy.js','assets/chargevoy.css','assets/web-app-layout.css','assets/web-app-ui.js','assets/route-corridor.js','scripts/route-safety.test.mjs','assets/recommendations.js','scripts/verify-web.mjs','scripts/browser-app-layout.mjs','scripts/is-presentation-only.mjs','scripts/import-mobie-tariffs.py','scripts/pricing-context.test.mjs']);
let preserve=false;
if(/^[a-f0-9]{40}$/.test(base||'')&&!/^0+$/.test(base)){
 const paths=execFileSync('git',['diff','--name-only',base,'HEAD','--','ev-charge-portugal-github-ready'],{encoding:'utf8',cwd:resolve(import.meta.dirname,'../..')}).trim().split('\n').filter(Boolean);
 preserve=paths.length>0&&paths.every(path=>allowed.has(path.replace(/^ev-charge-portugal-github-ready\//,'')));
}
process.stdout.write(String(preserve));
