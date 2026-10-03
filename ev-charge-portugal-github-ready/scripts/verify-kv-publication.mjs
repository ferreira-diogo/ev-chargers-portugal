export function validateSnapshot(live, now = Date.now()) {
  const published = Date.parse(live.publication_time || live.refreshed_at || "");
  const ageMinutes = (now - published) / 60000;
  const statuses = live.statuses;
  const points = statuses && typeof statuses === "object" && !Array.isArray(statuses)
    ? Object.keys(statuses).length : 0;
  if (!Number.isFinite(ageMinutes) || ageMinutes < -5 || ageMinutes > 20 || points < 10000)
    throw new Error("Availability snapshot missing, incomplete or older than twenty minutes");
  return {ok:true, availability_age_minutes:ageMinutes, live_points:points};
}

export async function verifyKV(env = process.env, request = fetch) {
  const account = env.CLOUDFLARE_ACCOUNT_ID;
  const namespace = env.CLOUDFLARE_AVAILABILITY_KV_NAMESPACE_ID;
  const token = env.CLOUDFLARE_KV_READ_TOKEN;
  if (!account || !namespace || !token)
    throw new Error("Configure CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_AVAILABILITY_KV_NAMESPACE_ID and CLOUDFLARE_KV_READ_TOKEN");
  const url = "https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(account)
    + "/storage/kv/namespaces/" + encodeURIComponent(namespace) + "/values/mobie_nap_current";
  const response = await request(url, {method:"GET", redirect:"error",
    headers:{Authorization:"Bearer " + token}, signal:AbortSignal.timeout(45000)});
  if (!response.ok) throw new Error("Cloudflare KV read failed: HTTP " + response.status);
  const result = validateSnapshot(await response.json());
  if (result.availability_age_minutes > 5)
    console.warn("::warning::MOBI.E is older than five minutes; report the last reading in the UI.");
  return {...result, source:"cloudflare-management-api"};
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  try { console.log(JSON.stringify(await verifyKV())); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
