import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
// User approved changes to both products on 2026-10-05. This checkpoint
// contains the approved grouping and geographic changes. Android remains read-only.
const repo=resolve(import.meta.dirname,'../..'),base='260528be4e58f078a6350fafcc9f0dd4d8d83dd4';
const files=execFileSync('git',['ls-tree','-r','--name-only',base,'ev-charge-portugal-github-ready'],{cwd:repo,encoding:'utf8'}).trim().split('\n');
for(const path of files){
 const current=await readFile(resolve(repo,path));
 const prior=execFileSync('git',['show',`${base}:${path}`],{cwd:repo,maxBuffer:100*1024*1024});
 if(!prior.equals(current))throw Error(`Website/shared source changed during Android work: ${path}`);
}
console.log(`Web isolation: Android uses approved shared source checkpoint ${base} without modifying it.`);
