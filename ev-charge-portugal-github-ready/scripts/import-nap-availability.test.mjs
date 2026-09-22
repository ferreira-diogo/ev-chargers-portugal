import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { parseAvailability } from './import-nap-availability.mjs';

const now=Date.parse('2026-09-22T19:05:00Z');
const xml=(status='available',time='2026-09-22T19:00:00Z')=>`<payload xmlns:e="urn:test" xmlns:f="urn:facility"><publicationTime>${time}</publicationTime><e:energyInfrastructureSiteStatus><f:reference id="OP-MGR-1"/><e:energyInfrastructureStationStatus><e:refillPointStatus><f:reference id="MGR-1-01"/><e:status>${status}</e:status></e:refillPointStatus></e:energyInfrastructureStationStatus></e:energyInfrastructureSiteStatus></payload>`;
const parse=s=>parseAvailability(Readable.from([Buffer.from(s)]),{minimum:1,now});
test('extracts source publication, site, point and exact status',async()=>{
  const data=await parse(xml('charging'));
  assert.deepEqual(data.rows,[{site_id:'OP-MGR-1',point_id:'MGR-1-01',status:'charging'}]);
  assert.equal(data.publication_time,'2026-09-22T19:00:00.000Z');
});
test('rejects expired and future sources',async()=>{
  await assert.rejects(parse(xml('available','2026-09-22T18:00:00Z')));
  await assert.rejects(parse(xml('available','2026-09-22T20:00:00Z')));
});
test('rejects malformed XML, unknown status, DTD and missing ID',async()=>{
  await assert.rejects(parse(xml().slice(0,-10)));
  await assert.rejects(parse(xml('free-ish')));
  await assert.rejects(parse('<!DOCTYPE payload>'+xml()));
  await assert.rejects(parse(xml().replace('id="MGR-1-01"','')));
});
test('preserves unknown rather than treating it as free',async()=>{
  assert.equal((await parse(xml('unknown'))).rows[0].status,'unknown');
});
test('retains duplicate rows so the database can quarantine all occurrences',async()=>{
  const text=xml();
  const point=text.match(/<e:refillPointStatus>[\s\S]*?<\/e:refillPointStatus>/)[0];
  const data=await parse(text.replace(point,point+point));
  assert.equal(data.rows.length,2); assert.equal(data.summary.duplicated_point_ids,1);
});
test('rejects truncated national coverage',async()=>{
  await assert.rejects(parseAvailability(Readable.from([Buffer.from(xml())]),{now}));
});
