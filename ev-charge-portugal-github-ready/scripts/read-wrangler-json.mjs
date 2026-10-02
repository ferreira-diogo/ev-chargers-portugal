import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// D1 file imports print spinner messages to stdout even with --json.
// Parse the final JSON document; never treat a successful upload as a reason
// to retry the write just because its progress output was not JSON.
export function readWranglerJson(text) {
  const clean = text.replace(/\u001b\[[0-9;]*m/g, '').trim();
  for (const match of clean.matchAll(/(?:^|\n)\s*(?=[\[{])/g)) {
    try { return JSON.parse(clean.slice(match.index).trim()); } catch {}
  }
  throw new Error('Wrangler did not return a complete JSON result');
}

export function rowsWritten(result) {
  const rows = Array.isArray(result) ? result : [result];
  if (!rows.length || rows.some(row => row.success !== true ||
      !Number.isSafeInteger(row.meta?.rows_written) || row.meta.rows_written < 0))
    throw new Error('Wrangler did not confirm successful D1 writes and their row count');
  return rows.reduce((sum, row) => sum + row.meta.rows_written, 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(String(rowsWritten(readWranglerJson(readFileSync(process.argv[2], 'utf8')))));
}
