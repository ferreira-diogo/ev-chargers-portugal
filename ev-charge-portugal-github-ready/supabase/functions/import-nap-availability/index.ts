import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { SaxesParser } from 'npm:saxes@6.0.0';

const SOURCE_URL = 'https://ev-nap.mobie.pt/integration/nap/evActualStatus';
const STATES = new Set(['available','charging','outOfOrder','unknown','blocked','planned','inoperative','reserved']);
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: {'Content-Type':'application/json'}
});

async function parse(stream: ReadableStream<Uint8Array>) {
  const parser = new SaxesParser({xmlns:true});
  const decoder = new TextDecoder('utf-8',{fatal:true});
  const stack: string[] = [];
  const rows: Array<{site_id:string;point_id:string;status:string}> = [];
  let site: string | null = null;
  let point: {site_id:string|null;point_id:string|null;status:string|null} | null = null;
  let text='', publication: string | null = null, bytes=0;
  parser.on('doctype',()=>{throw Error('DTD not allowed')});
  parser.on('opentag',node=>{
    stack.push(node.local); text='';
    if(node.local==='energyInfrastructureSiteStatus')site=null;
    if(node.local==='refillPointStatus')point={site_id:site,point_id:null,status:null};
    if(node.local==='reference'){
      const id=Object.values(node.attributes).find(a=>a.local==='id')?.value;
      if(stack.at(-2)==='energyInfrastructureSiteStatus')site=id||null;
      if(stack.at(-2)==='refillPointStatus' && point)point.point_id=id||null;
    }
  });
  parser.on('text',value=>{text+=value});
  parser.on('closetag',node=>{
    if(node.local==='publicationTime')publication=text.trim();
    if(node.local==='status' && stack.at(-2)==='refillPointStatus' && point)point.status=text.trim();
    if(node.local==='refillPointStatus'){
      if(!point?.site_id||!point.point_id||!point.status||!STATES.has(point.status))throw Error('Invalid point');
      rows.push({site_id:point.site_id,point_id:point.point_id,status:point.status});
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
  return {rows,publication_time:new Date(time).toISOString(),source_points:rows.length,source_bytes:bytes};
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
    const etagResult=await client.rpc('get_nap_live_etag');
    if(etagResult.error)throw Error('ETag read failed: '+etagResult.error.message);
    const previousEtag=typeof etagResult.data==='string'?etagResult.data:null;
    const requestHeaders: Record<string,string>={Accept:'application/xml'};
    if(previousEtag)requestHeaders['If-None-Match']=previousEtag;
    const response=await fetch(SOURCE_URL,{headers:requestHeaders,signal:AbortSignal.timeout(115_000)});
    if(response.status===304)return reply({success:true,unchanged:true,source_status:304,etag:previousEtag});
    if(!response.ok||!response.body)throw Error('NAP HTTP '+response.status);
    const currentEtag=response.headers.get('etag');
    const {rows,publication_time,source_points,source_bytes}=await parse(response.body);
    const result=await client.rpc('import_nap_availability',{
      p_publication_time:publication_time,p_rows:rows,p_apply:true
    });
    if(result.error)throw Error(result.error.message);
    if(currentEtag){
      const saved=await client.rpc('set_nap_live_etag',{p_etag:currentEtag});
      if(saved.error)throw Error('ETag save failed: '+saved.error.message);
    }
    return reply({success:true,unchanged:false,source_points,source_bytes,publication_time,etag:currentEtag,database:result.data});
  }catch(error){
    console.error('NAP availability import:',error);
    return reply({success:false,error:String(error)},502);
  }
});
