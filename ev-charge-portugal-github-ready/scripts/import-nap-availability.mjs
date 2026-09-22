import { createReadStream } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import { SaxesParser } from 'saxes';
import { createClient } from '@supabase/supabase-js';

export const SOURCE_URL = 'https://ev-nap.mobie.pt/integration/nap/evActualStatus';
const STATES = new Set(['available','charging','outOfOrder','unknown','blocked','planned','inoperative','reserved']);

export async function parseAvailability(stream, { minimum = 15000, now = Date.now() } = {}) {
  const parser = new SaxesParser({ xmlns: true });
  const stack = [];
  const rows = [];
  let site = null, point = null, text = '', publication = null, bytes = 0;
  parser.on('doctype', () => { throw new Error('DTD is not permitted'); });
  parser.on('opentag', node => {
    stack.push(node.local); text = '';
    if (node.local === 'energyInfrastructureSiteStatus') site = null;
    if (node.local === 'refillPointStatus') point = { site_id: site, point_id: null, status: null };
    if (node.local === 'reference') {
      const id = Object.values(node.attributes).find(a => a.local === 'id')?.value;
      const parent = stack.at(-2);
      if (parent === 'energyInfrastructureSiteStatus') site = id;
      if (parent === 'refillPointStatus') point.point_id = id;
    }
  });
  parser.on('text', value => { text += value; });
  parser.on('closetag', node => {
    if (node.local === 'publicationTime') publication = text.trim();
    if (node.local === 'status' && stack.at(-2) === 'refillPointStatus') point.status = text.trim();
    if (node.local === 'refillPointStatus') {
      if (!point.site_id || !point.point_id || !STATES.has(point.status)) throw new Error('Invalid point ID or status');
      rows.push(point); point = null;
    }
    stack.pop(); text = '';
  });
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for await (const chunk of stream) {
    bytes += chunk.length;
    if (bytes > 80_000_000) throw new Error('Feed exceeds 80 MB');
    parser.write(typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true }));
  }
  parser.write(decoder.decode()); parser.close();
  const time = Date.parse(publication);
  if (!Number.isFinite(time) || now-time > 45*60000 || time-now > 5*60000) throw new Error('Missing, expired or future publication time');
  if (rows.length < minimum || rows.length > 100000) throw new Error('Unexpected feed size');
  const ids = new Map();
  for (const r of rows) ids.set(r.point_id, (ids.get(r.point_id)||0)+1);
  return { publication_time: new Date(time).toISOString(), rows,
    summary: { bytes, points: rows.length, sites: new Set(rows.map(r=>r.site_id)).size,
      duplicated_point_ids: [...ids.values()].filter(n=>n>1).length,
      statuses: Object.fromEntries([...STATES].map(s=>[s,rows.filter(r=>r.status===s).length])) } };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const file = process.argv.find(a=>a.startsWith('--file='))?.slice(7);
  let stream;
  if (file) stream = createReadStream(file);
  else {
    const response = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(180000), headers: { Accept: 'application/xml' } });
    if (!response.ok || !response.body) throw new Error(`NAP HTTP ${response.status}`);
    stream = Readable.fromWeb(response.body);
  }
  const parsed = await parseAvailability(stream);
  let database = null;
  if (apply || process.argv.includes('--check-db')) {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Required server-side secrets are missing');
    const client = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error} = await client.rpc('import_nap_availability',{
      p_publication_time: parsed.publication_time, p_rows: parsed.rows, p_apply: apply
    });
    if(error) throw new Error(error.message);
    database=data;
  }
  console.log(JSON.stringify({mode:apply?'apply':'dry-run',publication_time:parsed.publication_time,...parsed.summary,database},null,2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error=>{ console.error(error.message); process.exitCode=1; });
}
