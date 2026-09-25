import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { SaxesParser } from 'saxes';

const SOURCE_URL = process.env.NAP_SOURCE_URL?.trim() || 'https://ev-nap.mobie.pt/integration/nap/evChargingInfra';
const OUTPUT = process.env.NAP_MAPPING_SQL || 'tmp/d1-nap-sync/0001_nap_mapping.sql';
const response = await fetch(SOURCE_URL, { headers: { Accept: 'application/xml', 'User-Agent': 'ChargeVoy NAP mapping/1.0' }, signal: AbortSignal.timeout(300000) });
if (!response.ok || !response.body) throw new Error(`NAP HTTP ${response.status}`);

const rows = [];
const stack = [];
let siteId = null, pointId = null, connectorCount = 0;
const parser = new SaxesParser({ xmlns: false });
const local = (name) => String(name).split(':').pop();
const attr = (node, name) => node.attributes?.[name] ?? null;
parser.on('opentag', node => {
  const name = local(node.name); stack.push(name);
  if (name === 'energyInfrastructureSite') siteId = attr(node, 'id');
  else if (name === 'refillPoint') { pointId = attr(node, 'id'); connectorCount = 0; }
  else if (pointId && name === 'connector') connectorCount += 1;
});
parser.on('closetag', node => {
  const name = local(typeof node === 'string' ? node : node.name);
  if (name === 'refillPoint' && siteId && pointId) {
    const count = Math.max(1, connectorCount);
    for (let index = 1; index <= count; index += 1) {
      const stationId = `nap-${siteId}`;
      const connectorId = `nap-${siteId}-${pointId}${count === 1 ? '' : `-${index}`}`;
      rows.push({ siteId, pointId, stationId, connectorId });
    }
    pointId = null; connectorCount = 0;
  } else if (name === 'energyInfrastructureSite') siteId = null;
  stack.pop();
});
parser.on('error', error => { throw error; });
for await (const chunk of Readable.fromWeb(response.body)) parser.write(chunk.toString('utf8'));
parser.close();
if (rows.length < 15000 || rows.length > 100000) throw new Error(`Unexpected mapping size: ${rows.length}`);
const esc = value => `'${String(value).replaceAll("'", "''")}'`;
let sql = 'DELETE FROM nap_connector_mapping;\n';
for (let i = 0; i < rows.length; i += 200) {
  const values = rows.slice(i, i + 200).map(r => `(${esc(r.siteId)},${esc(r.pointId)},${esc(r.stationId)},${esc(r.connectorId)},'mobie-nap','explicit',1.0,CURRENT_TIMESTAMP)`).join(',\n');
  sql += `INSERT OR REPLACE INTO nap_connector_mapping (site_id,point_id,station_id,connector_id,source,match_method,confidence,updated_at) VALUES\n${values};\n`;
}
sql += "SELECT 'nap_connector_mapping' AS table_name, count(*) AS row_count FROM nap_connector_mapping;\n";
await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, sql);
console.log(JSON.stringify({ source: SOURCE_URL, rows: rows.length, output: OUTPUT }, null, 2));
