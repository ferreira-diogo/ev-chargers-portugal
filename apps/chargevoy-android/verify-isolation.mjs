import {execFileSync} from 'node:child_process';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {resolve} from 'node:path';
const repo=resolve(import.meta.dirname,'../..'),base='cc6d720d5fe1edfdf77aa25116b9dad7a7c680d7';
const files=execFileSync('git',['ls-tree','-r','--name-only',base,'ev-charge-portugal-github-ready'],{cwd:repo,encoding:'utf8'}).trim().split('\n');
for(const p of files){const prior=execFileSync('git',['show',`${base}:${p}`],{cwd:repo,maxBuffer:100*1024*1024});const current=await readFile(resolve(repo,p));if(!prior.equals(current))throw Error(`Website/shared source changed: ${p}`);}
console.log(`Web isolation: ${files.length} original files byte-identical to ${base}.`);
