import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const repo=resolve(import.meta.dirname,'../..'),base='733b237a27f2fe89e73e8776a1633c8bb402d0df';
// User-approved shared geographic fix, 2026-10-05. All other website files
// remain byte-identical to the pre-fix checkpoint; Android still never writes web.
const approved={
  "ev-charge-portugal-github-ready/assets/chargevoy.js": "d9746e6c7441f332deda3c24f2dc697b2b291eab35aeb72904ecb827c2d14ce5",
  "ev-charge-portugal-github-ready/index.html": "26160baabbdef5fa7df9472e4db688a88fd94df9972a942e68956048e700dcc0",
  "ev-charge-portugal-github-ready/package.json": "de65ac1bf066e7854801a8304f77abe93b02330a4ef9368a7f36e2bb032f2873",
  "ev-charge-portugal-github-ready/scripts/verify-web.mjs": "62af3844ba9ac6da046a51fd3c32fdcd758c81640b59e9e0cc266ee8bf729389",
  "ev-charge-portugal-github-ready/service-worker.js": "2f58c6b68aac1aae61967abbb6a5ee88cb231ca0e0f02e5ee48c4ec676e529be",
  "ev-charge-portugal-github-ready/assets/geocoding.js": "ffb7406d22ea224588b3579cc2d8f8304f8727176fec9237046c058eec17b4b4",
  "ev-charge-portugal-github-ready/assets/geocoding.css": "848d49945869a6b107122caf621a55b91e450a427ca05592b693eb613e3f23c4",
  "ev-charge-portugal-github-ready/scripts/geocoding.test.mjs": "fa1efbf6f61a02697c337daba64911c95f9192067f890e459c732671f6e2b4b4",
  "ev-charge-portugal-github-ready/scripts/verify-geocoding-live.mjs": "05bda1fd7ab1210fe1660f97e4fb28f765a5bb9c153519d53e661dcf9c1a4118",
  "ev-charge-portugal-github-ready/scripts/geocoding-browser.mjs": "5e275f432f59ff80590649ca18961015dd25cc24cb318de6cdfd51fe3af1ca21"
};
const files=execFileSync('git',['ls-tree','-r','--name-only',base,'ev-charge-portugal-github-ready'],{cwd:repo,encoding:'utf8'}).trim().split('\n');
for(const p of new Set([...files,...Object.keys(approved)])){
  const current=await readFile(resolve(repo,p));
  if(approved[p]){
    if(createHash('sha256').update(current).digest('hex')!==approved[p])throw Error(`Approved geographic source changed: ${p}`);
  }else{
    const prior=execFileSync('git',['show',`${base}:${p}`],{cwd:repo,maxBuffer:100*1024*1024});
    if(!prior.equals(current))throw Error(`Website/shared source changed: ${p}`);
  }
}
console.log(`Web isolation: only the approved geographic fix differs from ${base}; Android build is read-only.`);
