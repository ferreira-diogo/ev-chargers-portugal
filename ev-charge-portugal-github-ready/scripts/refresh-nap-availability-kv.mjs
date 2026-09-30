import { Readable } from "node:stream";
import { setTimeout as wait } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { parseAvailability, SOURCE_URL } from "./import-nap-availability.mjs";

export const REFRESH_POLICY = Object.freeze({
  maxAttempts: 3,
  attemptTimeoutMs: 60_000,
  totalTimeoutMs: 240_000,
  retryDelaysMs: Object.freeze([10_000, 30_000]),
});

const emit = (event) => console.log(JSON.stringify(event));

function requestSignal(deadline, now, timeoutMs) {
  const remaining = deadline - now();
  if (remaining <= 0) throw new Error("Availability refresh time budget exhausted");
  return AbortSignal.timeout(Math.max(1, Math.min(timeoutMs, remaining)));
}

async function readSource({ fetchImpl, parse, deadline, now, policy, diagnostics }) {
  const response = await fetchImpl(SOURCE_URL, {
    headers: {
      Accept: "application/xml",
      "Accept-Encoding": "identity",
      "Cache-Control": "no-cache",
      "User-Agent": "ChargeVoy availability refresh/2.0",
    },
    signal: requestSignal(deadline, now, policy.attemptTimeoutMs),
  });
  diagnostics.http_status = response.status;
  const length = response.headers.get("content-length");
  diagnostics.content_length = /^\d+$/.test(length || "") ? Number(length) : null;
  diagnostics.content_encoding = response.headers.get("content-encoding") || "identity";
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => {});
    const error = new Error("NAP feed HTTP " + response.status);
    error.retryable = [408, 429].includes(response.status) || response.status >= 500;
    throw error;
  }

  const source = Readable.fromWeb(response.body);
  async function* countedSource() {
    for await (const chunk of source) {
      diagnostics.received_bytes += chunk.length;
      yield chunk;
    }
  }
  let parsed;
  try {
    parsed = await parse(countedSource());
  } finally {
    source.destroy();
  }
  // fetch decompresses encoded responses, so only compare identity byte counts.
  if (diagnostics.content_encoding === "identity" &&
      diagnostics.content_length !== null &&
      diagnostics.received_bytes !== diagnostics.content_length) {
    throw new Error(`Incomplete NAP response: received ${diagnostics.received_bytes} of ${diagnostics.content_length} bytes`);
  }
  return parsed;
}

export async function refreshAvailability({
  account = process.env.CLOUDFLARE_ACCOUNT_ID,
  token = process.env.CLOUDFLARE_API_TOKEN,
  fetchImpl = fetch,
  parse = parseAvailability,
  sleep = wait,
  now = Date.now,
  log = emit,
  policy = REFRESH_POLICY,
} = {}) {
  if (!account || !token) throw new Error("Cloudflare credentials missing");
  const deadline = now() + policy.totalTimeoutMs;
  let parsed, attempts;
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    const started = now();
    const diagnostics = { attempt, received_bytes: 0, content_length: null };
    try {
      parsed = await readSource({ fetchImpl, parse, deadline, now, policy, diagnostics });
      attempts = attempt;
      log({ event: "nap_source_verified", ...diagnostics,
        publication_time: parsed.publication_time, points: parsed.rows.length,
        sites: parsed.summary.sites, duration_ms: now() - started });
      break;
    } catch (error) {
      log({ event: "nap_source_attempt_failed", ...diagnostics,
        error: error.message, duration_ms: now() - started });
      if (error.retryable === false || attempt === policy.maxAttempts) throw error;
      const delayMs = policy.retryDelaysMs[attempt - 1];
      if (deadline - now() <= delayMs)
        throw new Error("Availability refresh time budget exhausted before retry", { cause: error });
      log({ event: "nap_source_retry", next_attempt: attempt + 1, delay_ms: delayMs });
      await sleep(delayMs, undefined, { signal: requestSignal(deadline, now, policy.totalTimeoutMs) });
    }
  }

  // No Cloudflare request or write is made until the entire feed is validated.
  const api = "https://api.cloudflare.com/client/v4/accounts/" + account + "/storage/kv/namespaces";
  const headers = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
  const listResponse = await fetchImpl(api + "?per_page=100", {
    headers, signal: requestSignal(deadline, now, 15_000),
  });
  const list = await listResponse.json();
  if (!listResponse.ok || !list.success)
    throw new Error("KV namespace lookup failed: " + JSON.stringify(list.errors));
  const namespace = list.result.find((item) => item.title === "chargevoy-availability");
  if (!namespace?.id) throw new Error("Availability namespace missing; deploy the site first");
  const statuses = Object.create(null);
  for (const row of parsed.rows) statuses[row.site_id + "|" + row.point_id] = row.status;
  const snapshot = {
    publication_time: parsed.publication_time,
    refreshed_at: new Date(now()).toISOString(),
    point_count: parsed.rows.length,
    statuses,
  };
  const body = JSON.stringify(snapshot);
  const put = await fetchImpl(api + "/" + namespace.id + "/values/mobie_nap_current", {
    method: "PUT", headers, body,
    signal: requestSignal(deadline, now, 15_000),
  });
  const result = await put.json();
  if (!put.ok || !result.success)
    throw new Error("KV snapshot write failed: " + JSON.stringify(result.errors));
  const summary = {
    event: "kv_snapshot_written", publication_time: snapshot.publication_time,
    refreshed_at: snapshot.refreshed_at, points: parsed.rows.length,
    sites: parsed.summary.sites, snapshot_bytes: Buffer.byteLength(body), attempts,
  };
  log(summary);
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  refreshAvailability().catch((error) => {
    console.error(JSON.stringify({ event: "availability_refresh_failed", error: error.message }));
    process.exitCode = 1;
  });
}
