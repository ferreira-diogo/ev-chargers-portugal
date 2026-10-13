import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareWebCatalogue} from './nap-web-quarantine.mjs';
const parsed=()=>({publicationTime:'2026-10-12T00:00:00Z',stations:Array.from({length:8100},(_,i)=>({external_id:'s'+i,latitude:39,longitude:-8})),connectors:Array.from({length:18000},(_,i)=>({external_id:'c'+i,station_external_id:'s'+i%8100}))});
const previous=()=>({publication_time:'2026-10-10T00:00:00Z',stations:Array(8000),connectors:Array(17000)});
test('quarantine removes invalid sites with their connectors, retaining valid coverage and report',()=>{
 const source=parsed();for(let i=0;i<38;i++)source.stations[i].latitude=null;
 const result=prepareWebCatalogue(source,previous());assert.equal(result.report.quarantined.length,38);assert.equal(result.parsed.stations.length,8062);assert(result.report.excluded_connectors>0);
 assert(!result.parsed.connectors.some(c=>c.station_external_id==='s0'));
 assert.equal(source.stations.length,8100,'source/staging input is not mutated');
});
test('large quarantine, missing baseline, duplicate/orphan data or coverage/date regression blocks publication',()=>{
 const source=parsed();for(let i=0;i<101;i++)source.stations[i].longitude=0;assert.throws(()=>prepareWebCatalogue(source,previous()),/quarantine/);
 assert.throws(()=>prepareWebCatalogue(parsed(),null),/Previous/);
 const old=parsed();old.publicationTime='2026-10-01T00:00:00Z';assert.throws(()=>prepareWebCatalogue(old,previous()),/regression/);
 const baseline=previous();baseline.stations=Array(10000);assert.throws(()=>prepareWebCatalogue(parsed(),baseline),/regression/);
 const orphan=parsed();orphan.connectors[0].station_external_id='missing';assert.throws(()=>prepareWebCatalogue(orphan,previous()),/Orphan/);
 const duplicate=parsed();duplicate.stations[1].external_id='s0';assert.throws(()=>prepareWebCatalogue(duplicate,previous()),/Duplicate/);
});
