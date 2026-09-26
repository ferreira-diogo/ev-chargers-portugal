import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { SaxesParser } from 'npm:saxes@6.0.0';

const SOURCE_URL = 'https://ev-nap.mobie.pt/integration/nap/evActualStatus';
const STATES = new Set(['available','charging','outOfOrder','unknown','blocked','planned','inoperative','reserved']);
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: {'Content-Type':'application/json'}
});

async function publishCloudflareSnapshot(rows: Array<{site_id:string;point_id:string;status:string}>, publicationTime: string) {
  const account = Deno.env.get('CF_ACCOUNT_ID');
  const namespace = Deno.env.get('CF_AVAILABILITY_KV_ID');
  const token = Deno.env.get('CF_AVAILABILITY_KV_TOKEN');
  if (![account, namespace, token].every(Boolean)) throw Error('Cloudflare KV secrets are incomplete');
  const statuses: Record<string,string> = Object.create(null);
  for (const row of rows) statuses[row.site_id+'|'+row.point_id] = row.status;
  const snapshot = {publication_time:publicationTime,refreshed_at:new Date().toISOString(),point_count:rows.length,statuses};
  const result = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/storage/kv/namespaces/${namespace}/values/mobie_nap_current`, {
    method:'PUT',
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify(snapshot),signal:AbortSignal.timeout(20000)
  });
  const response = await result.json();
  if (!result.ok || response.success !== true) throw Error('Cloudflare KV snapshot write failed: HTTP '+result.status);
  return snapshot.point_count;
}

async function parse(stream: ReadableStream<Uint8Array>) {
  const parser = new SaxesParser({xmlns:true});
  const decoder = new TextDecoder('utf-8',{fatal:true});
  const stack: string[] = [];
  const rows: Array<{site_id:string;point_id:string;status:string}> = [];
  const prices: Array<{
    site_id:string; point_id:string; pricing_policy:string; rate_index:number;
    amount_eur:number; currency:string; valid_from:string|null; raw_data:Record<string, unknown>;
  }> = [];
  let site: string | null = null;
  type PriceDetail = {pricing_policy:string;amount_eur:number;rate_index:number;currency:string;valid_from:string|null};
  type Point = {site_id:string|null;point_id:string|null;status:string|null;priceDetails:PriceDetail[]};
  let point: Point | null = null;
  let energyMix: {rate_index:number;currency:string;valid_from:string|null;rates:Array<{pricing_policy:string;amount_eur:number}>} | null = null;
  let pricingPolicy: string | null = null;
  let text='', publication: string | null = null, bytes=0;
  parser.on('doctype',()=>{throw Error('DTD not allowed')});
  parser.on('opentag',node=>{
    stack.push(node.local); text='';
    if(node.local==='energyInfrastructureSiteStatus')site=null;
    if(node.local==='refillPointStatus')point={site_id:site,point_id:null,status:null,priceDetails:[]};
    if(node.local==='electricEnergyMixOverride' && point){
      const rawIndex=Object.values(node.attributes).find(a=>a.local==='energyMixIndex')?.value;
      const parsedIndex=Number(rawIndex);
      energyMix={rate_index:Number.isInteger(parsedIndex)&&parsedIndex>=0?parsedIndex:0,currency:'EUR',valid_from:null,rates:[]};
    }
    if(node.local==='energyPricingPolicy' && energyMix)pricingPolicy=null;
    if(node.local==='reference'){
      const id=Object.values(node.attributes).find(a=>a.local==='id')?.value;
      if(stack.at(-2)==='energyInfrastructureSiteStatus')site=id||null;
      if(stack.at(-2)==='refillPointStatus' && point)point.point_id=id||null;
    }
  });
  parser.on('text',value=>{text+=value});
  parser.on('closetag',node=>{
    if(node.local==='publicationTime')publication=text.trim();
    const value=text.trim();
    if(node.local==='status' && stack.at(-2)==='refillPointStatus' && point)point.status=value;
    if(node.local==='pricingPolicy' && energyMix)pricingPolicy=value;
    if(node.local==='minimumDeliveryFee' && energyMix && pricingPolicy){
      const amount=Number(value);
      if(Number.isFinite(amount)&&amount>=0)energyMix.rates.push({pricing_policy:pricingPolicy,amount_eur:amount});
    }
    if(node.local==='applicableCurrency' && energyMix && /^[A-Z]{3}$/.test(value))energyMix.currency=value;
    if(node.local==='overallStartTime' && energyMix && Number.isFinite(Date.parse(value)))energyMix.valid_from=new Date(value).toISOString();
    if(node.local==='electricEnergyMixOverride' && point && energyMix){
      point.priceDetails.push(...energyMix.rates.map(rate=>({
        ...rate,rate_index:energyMix!.rate_index,currency:energyMix!.currency,valid_from:energyMix!.valid_from
      })));
      energyMix=null;
    }
    if(node.local==='refillPointStatus'){
      if(!point?.site_id||!point.point_id||!point.status||!STATES.has(point.status))throw Error('Invalid point');
      rows.push({site_id:point.site_id,point_id:point.point_id,status:point.status});
      for(const rate of point.priceDetails)prices.push({
        site_id:point.site_id,point_id:point.point_id,...rate,
        raw_data:{official_label:'MOBI.E NAP ad hoc price',pricing_policy:rate.pricing_policy}
      });
      point=null;
    }
    stack.pop();text='';
  });
  for await(const chunk of stream){
    bytes+=chunk.byteLength;
    if(bytes>80_000_000)throw Error('Feed exceeds 80MB');
    parser.write(decoder.decode(chunk,{stream:true}));
  }
  parser.write(decoder.decode());parser.close();
  const time=Date.parse(publication||'');
  if(!Number.isFinite(time)||Date.now()-time>45*60_000||time-Date.now()>5*60_000)throw Error('Source is stale');
  if(rows.length<15000||rows.length>100000)throw Error('Unexpected coverage');
  if(prices.length===0)throw Error('No official price components in live feed');
  return {rows,prices,publication_time:new Date(time).toISOString(),source_points:rows.length,source_price_components:prices.length,source_bytes:bytes};
}

Deno.serve(async request=>{
  if(request.method!=='POST')return reply({error:'POST required'},405);
  const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const url=Deno.env.get('SUPABASE_URL');
  if(!key||!url)return reply({error:'Server configuration missing'},500);
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const token=request.headers.get('x-nap-token');
  if(!token||token.length<32)return reply({error:'Unauthorized'},401);
  const auth=await client.rpc('verify_nap_cron_token',{p_token:token});
  if(auth.error||auth.data!==true)return reply({error:'Unauthorized'},401);
  try{
    const kvSecrets = ['CF_ACCOUNT_ID','CF_AVAILABILITY_KV_ID','CF_AVAILABILITY_KV_TOKEN'].map(name=>Deno.env.get(name));
    if (kvSecrets.some(Boolean) && !kvSecrets.every(Boolean)) throw Error('Cloudflare KV secrets are incomplete');
    const publishKv = kvSecrets.every(Boolean);
    const etagResult=await client.rpc('get_nap_live_etag');
    if(etagResult.error)throw Error('ETag read failed: '+etagResult.error.message);
    const previousEtag=typeof etagResult.data==='string'?etagResult.data:null;
    const requestHeaders: Record<string,string>={Accept:'application/xml'};
    // The KV snapshot needs every current publication; a 304 provides no rows
    // to publish when the GitHub writer is retired.
    if(previousEtag && !publishKv)requestHeaders['If-None-Match']=previousEtag;
    const response=await fetch(SOURCE_URL,{headers:requestHeaders,signal:AbortSignal.timeout(115_000)});
    if(response.status===304)return reply({success:true,unchanged:true,source_status:304,etag:previousEtag});
    if(!response.ok||!response.body)throw Error('NAP HTTP '+response.status);
    const currentEtag=response.headers.get('etag');
    const {rows,prices,publication_time,source_points,source_price_components,source_bytes}=await parse(response.body);
    // Availability remains usable even if the subsequent price/database import fails.
    const kvPoints = publishKv ? await publishCloudflareSnapshot(rows,publication_time) : null;
    const result=await client.rpc('import_nap_availability',{
      p_publication_time:publication_time,p_rows:rows,p_apply:true
    });
    if(result.error)throw Error(result.error.message);
    const priceResult=await client.rpc('import_nap_ad_hoc_prices',{
      p_publication_time:publication_time,p_rows:prices
    });
    if(priceResult.error)throw Error(priceResult.error.message);
    if(currentEtag){
      const saved=await client.rpc('set_nap_live_etag',{p_etag:currentEtag});
      if(saved.error)throw Error('ETag save failed: '+saved.error.message);
    }
    return reply({success:true,unchanged:false,source_points,source_price_components,source_bytes,publication_time,etag:currentEtag,database:result.data,prices:priceResult.data,kv_points:kvPoints});
  }catch(error){
    console.error('NAP availability import:',error);
    return reply({success:false,error:String(error)},502);
  }
});
