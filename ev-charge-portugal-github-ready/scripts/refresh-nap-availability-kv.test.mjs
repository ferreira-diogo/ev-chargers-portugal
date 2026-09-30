import test from "node:test";
import assert from "node:assert/strict";
import { parseAvailability, SOURCE_URL } from "./import-nap-availability.mjs";
import { refreshAvailability, REFRESH_POLICY } from "./refresh-nap-availability-kv.mjs";

const clock = Date.parse("2026-09-30T12:00:00Z");
const xml = (time = "2026-09-30T11:59:00Z") => `<payload xmlns:e="urn:test" xmlns:f="urn:facility"><publicationTime>${time}</publicationTime><e:energyInfrastructureSiteStatus><f:reference id="OP-MGR-1"/><e:energyInfrastructureStationStatus><e:refillPointStatus><f:reference id="MGR-1-01"/><e:status>available</e:status></e:refillPointStatus></e:energyInfrastructureStationStatus></e:energyInfrastructureSiteStatus></payload>`;
const complete = () => new Response(xml(), { headers: { "content-length": String(Buffer.byteLength(xml())) } });
const truncated = () => new Response(xml().slice(0, -25), { headers: { "content-length": String(Buffer.byteLength(xml())) } });

function harness(responses, overrides = {}) {
  const requests = [], events = [], waits = [];
  let current = { publication_time: "previous-valid-snapshot", statuses: { old: "charging" } };
  const previous = structuredClone(current);
  let sourceRequests = 0;
  const options = {
    account: "test-account", token: "test-token",
    now: () => clock,
    parse: (stream) => parseAvailability(stream, { minimum: 1, now: clock }),
    sleep: async (ms) => { waits.push(ms); },
    log: (event) => events.push(event),
    fetchImpl: async (url, init = {}) => {
      requests.push({ url, ...init });
      if (url === SOURCE_URL) {
        const entry = responses[sourceRequests++];
        if (!entry) throw new Error("Unexpected extra source request");
        if (entry instanceof Error) throw entry;
        return typeof entry === "function" ? entry(init) : entry;
      }
      if (init.method === "PUT") {
        current = JSON.parse(init.body);
        return Response.json({ success: true });
      }
      return Response.json({ success: true, result: [{ id: "test-namespace", title: "chargevoy-availability" }] });
    },
    ...overrides,
  };
  return { options, requests, events, waits, previous,
    get current() { return current; },
    get sourceRequests() { return sourceRequests; },
  };
}

test("a cut HTTP 200 XML is retried, then exactly one complete snapshot is written", async () => {
  const h = harness([truncated, complete]);
  const result = await refreshAvailability(h.options);
  assert.equal(h.sourceRequests, 2);
  assert.deepEqual(h.waits, [10_000]);
  assert.equal(h.requests.filter((r) => r.method === "PUT").length, 1);
  assert.deepEqual(h.current.statuses, { "OP-MGR-1|MGR-1-01": "available" });
  assert.equal(h.current.point_count, 1);
  assert.equal(result.attempts, 2);
  const failure = h.events.find((e) => e.event === "nap_source_attempt_failed");
  assert.equal(failure.received_bytes, Buffer.byteLength(xml().slice(0, -25)));
  assert.equal(failure.content_length, Buffer.byteLength(xml()));
  assert.match(failure.error, /unclosed/);
});

test("three cut feeds leave the previous snapshot untouched and make no Cloudflare requests", async () => {
  const h = harness([truncated, truncated, truncated]);
  await assert.rejects(refreshAvailability(h.options), /unclosed/);
  assert.equal(h.sourceRequests, 3);
  assert.deepEqual(h.waits, [10_000, 30_000]);
  assert.deepEqual(h.current, h.previous);
  assert.ok(h.requests.every((r) => r.url === SOURCE_URL));
  assert.ok(!h.events.some((e) => e.event === "kv_snapshot_written"));
});

test("even valid XML is rejected when identity Content-Length does not match", async () => {
  const h = harness([
    () => new Response(xml(), { headers: { "content-length": String(Buffer.byteLength(xml()) + 10) } }),
    complete,
  ]);
  await refreshAvailability(h.options);
  assert.equal(h.sourceRequests, 2);
  assert.match(h.events[0].error, /Incomplete NAP response/);
  assert.equal(h.requests.filter((r) => r.method === "PUT").length, 1);
});

test("compressed response lengths are not compared with the decoded body", async () => {
  const h = harness([() => new Response(xml(), { headers: { "content-length": "100", "content-encoding": "gzip" } })]);
  await refreshAvailability(h.options);
  assert.equal(h.sourceRequests, 1);
  assert.equal(h.current.point_count, 1);
});

test("a connection error and a temporary HTTP failure recover on the third attempt", async () => {
  const h = harness([new TypeError("fetch failed"), () => new Response("Unavailable", { status: 503 }), complete]);
  await refreshAvailability(h.options);
  assert.equal(h.sourceRequests, 3);
  assert.deepEqual(h.waits, [10_000, 30_000]);
  assert.equal(h.requests.filter((r) => r.method === "PUT").length, 1);
});

test("a stream interrupted after headers is retried with a fresh download", async () => {
  let reads = 0;
  const broken = () => new Response(new ReadableStream({
    pull(controller) {
      if (reads++ === 0) controller.enqueue(new TextEncoder().encode(xml().slice(0, 120)));
      else controller.error(new Error("Socket closed during body"));
    },
  }));
  const h = harness([broken, complete]);
  await refreshAvailability(h.options);
  assert.equal(h.sourceRequests, 2);
  assert.match(h.events[0].error, /Socket closed/);
  assert.equal(h.requests.filter((r) => r.method === "PUT").length, 1);
});

test("HTTP 403 fails without retrying or accessing Cloudflare", async () => {
  const h = harness([() => new Response("Forbidden", { status: 403 })]);
  await assert.rejects(refreshAvailability(h.options), /NAP feed HTTP 403/);
  assert.equal(h.sourceRequests, 1);
  assert.equal(h.waits.length, 0);
  assert.deepEqual(h.current, h.previous);
});

test("expired source timestamps remain rejected after all retries", async () => {
  const expired = () => new Response(xml("2026-09-30T10:00:00Z"));
  const h = harness([expired, expired, expired]);
  await assert.rejects(refreshAvailability(h.options), /expired/);
  assert.ok(h.requests.every((r) => r.url === SOURCE_URL));
  assert.deepEqual(h.current, h.previous);
});

test("the global deadline stops retries before another delay would exceed it", async () => {
  let time = clock;
  const h = harness([truncated, truncated], {
    now: () => time,
    sleep: async (ms) => { time += ms; },
    policy: { ...REFRESH_POLICY, totalTimeoutMs: 20, retryDelaysMs: [10, 30] },
  });
  await assert.rejects(refreshAvailability(h.options), /budget exhausted before retry/);
  assert.equal(h.sourceRequests, 2);
  assert.deepEqual(h.current, h.previous);
});

test("slow requests are aborted, and exhausted timeouts never write a snapshot", async () => {
  const slow = ({ signal }) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(complete()), 1000);
    signal.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  });
  const h = harness([slow, slow, slow], {
    now: Date.now,
    policy: { ...REFRESH_POLICY, attemptTimeoutMs: 20, totalTimeoutMs: 1000, retryDelaysMs: [0, 0] },
  });
  await assert.rejects(refreshAvailability(h.options), /timeout/i);
  assert.equal(h.sourceRequests, 3);
  assert.deepEqual(h.current, h.previous);
});

test("a failed KV write is reported once, without repeating the feed or the write", async () => {
  const h = harness([complete]);
  const fetchImpl = h.options.fetchImpl;
  h.options.fetchImpl = async (url, init = {}) => {
    if (init.method === "PUT") {
      h.requests.push({ url, ...init });
      return Response.json({ success: false, errors: [{ message: "Write quota exceeded" }] }, { status: 429 });
    }
    return fetchImpl(url, init);
  };
  await assert.rejects(refreshAvailability(h.options), /KV snapshot write failed/);
  assert.equal(h.sourceRequests, 1);
  assert.equal(h.requests.filter((r) => r.method === "PUT").length, 1);
  assert.deepEqual(h.current, h.previous);
  assert.ok(!h.events.some((e) => e.event === "kv_snapshot_written"));
});

test("missing credentials fail before any network operation", async () => {
  const h = harness([], { account: "", token: "" });
  await assert.rejects(refreshAvailability(h.options), /credentials missing/);
  assert.equal(h.requests.length, 0);
});
