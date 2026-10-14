(function(){
'use strict';
const $=id=>document.getElementById(id),core=window.ChargeVoyRecommendations;
let scenario={start:32,target:80,period:'fora_vazio'},records=[],timer,busy=false,pending=false,mode='recommended';const cache=new Map(),pins=L.layerGroup().addTo(map);let requestCount=0;
window.addEventListener('chargevoy-route-map', event => { if(event.detail.active)map.removeLayer(pins);else pins.addTo(map); });
try{const saved=JSON.parse(localStorage.getItem('chargevoy-android-scenario')||'null');if(saved&&core.energyFor({battery_capacity_kwh:60},Number(saved.start),Number(saved.target))!==null)scenario={start:Number(saved.start),target:Number(saved.target),period:'fora_vazio'};}catch{}

const optionsKey='chargevoy-android-options';
let operatorRestore;
function restoreOptions(){
 try{
  const saved=JSON.parse(localStorage.getItem(optionsKey)||'null');if(!saved||![1,2].includes(saved.version))return;
  const valid=['0-50','50-150','150-250','250+'];
  const powers=(saved.version===1?[saved.power]:saved.powers||[]).filter(value=>valid.includes(value));
  selectedPower=powers.length?[...new Set(powers)].join('|'):'all';
  for(const [selector,key] of [['.connector-filter','connectors'],['.status-filter','statuses']]){
   if(Array.isArray(saved[key]))document.querySelectorAll(selector).forEach(input=>{input.checked=saved[key].includes(input.value);});
  }
  const wanted=(saved.version===1?[saved.operator]:saved.operators||[]).filter(value=>typeof value==='string'&&value!=='all').map(operatorDisplayName);
  const select=$('operator-filter');
  const restoreOperator=()=>{
   for(const option of select.options)option.selected=option.value==='all'?!wanted.length:wanted.includes(option.value);
   // Keep observing: later catalogue pages may add saved operators.
   renderOperatorChoices();renderStations(false);
  };
  operatorRestore=new MutationObserver(restoreOperator);operatorRestore.observe(select,{childList:true});
  select.addEventListener('change',()=>operatorRestore.disconnect(),{once:true});restoreOperator();syncQuickFilters();
 }catch{}
}
restoreOptions();
window.addEventListener('chargevoy-filters-reset',()=>{operatorRestore?.disconnect();try{localStorage.removeItem(optionsKey);}catch{}summary();});
['android-note','android-filter-summary','android-vehicle-label','android-soc-label','android-scenario-error'].forEach(id=>$(id).setAttribute('data-i18n-managed',''));
const tr=(pt,en)=>currentLanguage==='en'?en:pt;
const euro=v=>new Intl.NumberFormat(currentLanguage==='en'?'en-IE':'pt-PT',{style:'currency',currency:'EUR'}).format(v);
function syncVehicleThumbnail(){
 const source=$('vehicle-image')?.firstElementChild,target=$('android-vehicle-thumbnail');
 if(!target)return;
 target.replaceChildren();
 if(!currentVehicle)return;
 if(source){const copy=source.cloneNode(true);if(copy.tagName==='IMG'){copy.alt='';copy.loading='eager';copy.onerror=()=>{target.innerHTML=vehicleIllustration(currentVehicle);};}target.appendChild(copy);}
 else target.innerHTML=vehicleIllustration(currentVehicle);
}
function powerMarkup(power){
 const value=Number(power);if(!Number.isFinite(value)||value<=0)return '<span>'+t('Potência por confirmar')+'</span>';
 const count=value<=50?1:value<=150?2:3;
 const bolt='<svg viewBox="0 0 16 20" aria-hidden="true"><path fill="currentColor" d="M9 0 1 11h6l-1 9 9-12H9z"/></svg>';
 return `<span class="android-power" title="${tr('Potência compatível com o veículo','Power supported by your vehicle')}"><span class="android-power-bolts power-${count}" aria-hidden="true">${bolt.repeat(count)}</span><strong>${value} kW</strong></span>`;
}
function summary(){syncVehicleThumbnail();const values=selectedValues('.connector-filter'),statuses=selectedValues('.status-filter'),operator=selectedOperatorValues().join(', '),query=$('global-search').value.trim();const labels={available:t('Disponível'),unavailable:t('Indisponível'),unknown:t('Desconhecido')};const parts=[selectedPower==='all'?'':selectedPower.split('|').join(' + ')+' kW',...values,operator&&operator!=='all'?operator:'',statuses.length&&statuses.length<document.querySelectorAll('.status-filter').length?statuses.map(x=>labels[x]||x).join(', '):'',query?tr('Pesquisa: ','Search: ')+query:''].filter(Boolean);$('android-filter-summary').textContent=parts.join(' · ')||t('Personalizar pesquisa');$('android-filter-summary').title=parts.join(' · ');$('android-vehicle-label').textContent=currentVehicle?[currentVehicle.make,currentVehicle.model].filter(Boolean).join(' '):t('Adicionar veículo');$('android-soc-label').textContent=`${scenario.start}% → ${scenario.target}%`;}

function compatibleConnectors(s){let types=currentVehicle?.connector_types||[];if(typeof types==='string'){try{types=JSON.parse(types);}catch{types=[]}}const vehicleTypes=new Set(types.map(connectorCategory));const filters=selectedValues('.connector-filter').filter(x=>x!=='Tesla');return stationConnectorRows(s).filter(c=>matchesPower(c.power_kw)&&(!vehicleTypes.size||vehicleTypes.has(connectorCategory(c.type)))&&(!filters.length||filters.includes(connectorCategory(c.type))));}
function effectivePower(c){const ac=['Type 2','Type 1','Schuko'].includes(connectorCategory(c.type||c.connector_type));const vehicle=Number(ac?currentVehicle?.max_ac_power_kw:currentVehicle?.max_dc_power_kw);return Math.min(Number(c.power_kw)||0,vehicle>0?vehicle:0);}
function baseRows(){if(!currentVehicle||!searchPosition)return[];return records.filter(s=>stationCompatibleWithVehicle(s)).map(s=>{const connectors=compatibleConnectors(s),power=Math.max(0,...connectors.map(effectivePower)),availability=stationAvailability(connectors),energy=core.energyFor(currentVehicle,scenario.start,scenario.target);return{id:s.id,station:s,power,energy,distance:distanceKm(searchPosition,{lat:s.latitude,lon:s.longitude}),minutes:energy&&power?Math.max(5,Math.ceil(energy/power*60/.75)):null,live:availability.kind==='live'&&availability.complete,available:availability.available||0,availability,total:null,card:null};}).filter(s=>s.power>0&&s.distance<=75).sort((a,b)=>a.distance-b.distance||String(a.id).localeCompare(String(b.id))).slice(0,40);}
async function tariffs(id){const old=cache.get(id);if(old&&old.until>Date.now())return old.rows;requestCount++;const rows=await getD1Rows('official_opc_tariffs',`select=station_id,connector_uid,voltage_level,tariff_period,connector_type,power_kw,activation_fee_eur,energy_price_eur_kwh,time_price_eur_min,updated_at&station_id=eq.${encodeURIComponent(id)}&tariff_period=eq.REGULAR&limit=100`).catch(()=>[]);cache.set(id,{rows,until:Date.now()+(rows.length?30*60000:60000)});if(cache.size>100)cache.delete(cache.keys().next().value);return rows;}
function priced(row){
 if(!Number.isFinite(row.energy)||row.energy<=0)return row;
 const members=row.station._location_members||[row.station],options=[];
 const cards=cemeCards.filter(c=>c.estimate_enabled!==false&&!c.subscription_required&&cardIsActive(c));
 const add=(card,opc,member)=>{const price=calculateCardPrice(card,opc,{energyKwh:row.energy},scenario.period,member);if(price&&Number.isFinite(price.total)&&price.total>=0)options.push(price);};
 for(const member of members){
  const connectors=compatibleConnectors(member);
  // A final fixed price needs an eligible physical connector, not an OPC row.
  // Restrict national offers to the official Portuguese network catalogue.
  if(member.source==='nap-mobie')for(const connector of connectors){
   const type=connectorCategory(connector.type);
   for(const card of cards.filter(c=>c.pricing_mode==='final_fixed'&&(c.id==='continente-plug-charge'||(['CCS','CHAdeMO'].includes(type)&&Number(connector.power_kw)>=50))))add(card,{connector_type:type,power_kw:Number(connector.power_kw)},member);
  }
  for(const opc of cache.get(member.id)?.rows||[]){
   const observed=Date.parse(opc.updated_at||'');
   if(!Number.isFinite(observed)||observed>Date.now()+300000||observed<Date.now()-48*3600000)continue;
   if(!connectors.some(c=>connectorCategory(c.type)===connectorCategory(opc.connector_type)&&Number(c.power_kw)===Number(opc.power_kw)))continue;
   for(const card of cards.filter(c=>c.pricing_mode!=='final_fixed'))add(card,opc,member);
  }
 }
 options.sort((a,b)=>a.total-b.total);const best=options[0];
 return best?{...row,total:best.total,card:best.card,minutes:best.minutes,price:best}:row;
}
function openStation(row,mapOnly=false){if(!row)return;const s=row.station;map.setView([s.latitude,s.longitude],15,{animate:true});if(mapOnly){closeStationPanel();$('map-section').scrollIntoView({behavior:'smooth',block:'start'});}else{document.getElementById('from').value=scenario.start;document.getElementById('to').value=scenario.target;document.getElementById('price-period').value=scenario.period;simMode='energy';selectStation(s,operatorMap.get(s.operator_id));renderSimulator();}}
function favoriteAction(id){return `<button data-android-favorite="${escapeHtml(id)}">${favoriteStationIds.has(id)?'★ Remover dos favoritos':'☆ Adicionar aos favoritos'}</button>`;}
async function favoriteClick(event){const button=event.target.closest('[data-android-favorite]');if(!button)return;const station=records.find(s=>s.id===button.dataset.androidFavorite);if(!station)return;if(!currentSession?.user){showAccount();return;}button.disabled=true;selectStation(station,operatorMap.get(station.operator_id));await toggleSelectedFavorite();view(baseRows().map(priced));}
$('station-cards').addEventListener('click',favoriteClick);$('android-hero').addEventListener('click',favoriteClick);
function view(rows){summary();const result=core.choices(rows);const hero=result[mode]||result.recommended;let text='';if(!currentVehicle)text='Seleciona o veículo para encontrar opções compatíveis.';else if(!searchPosition)text='Permite a localização ou pesquisa uma zona para encontrar opções próximas.';else if(!rows.length)text='Não existem opções compatíveis nesta zona com os filtros atuais.';else if(!hero)text='Ainda não há preço validado e disponibilidade recente suficientes para recomendar. Explora as alternativas abaixo.';
if(text){$('android-hero').innerHTML=`<span class="android-badge">ENCONTRE A SUA OPÇÃO</span><h2>${escapeHtml(text)}</h2><p>Os filtros, o mapa e os detalhes dos postos continuam disponíveis.</p>`;}else{const labels={recommended:'★ RECOMENDADO PARA SI',cheap:'€ MAIS BARATO NESTA SELEÇÃO',fast:'ϟ MENOR TEMPO ESTIMADO',near:'⌖ MAIS PRÓXIMO'};const total=hero.total===null?'Preço por confirmar':`~${euro(hero.total)}`;const reason=mode==='recommended'?'Equilíbrio entre distância, custo e tempo, com disponibilidade recente.':mode==='cheap'?'Menor estimativa entre os candidatos com preço disponível. Confirma a elegibilidade e o preço no fornecedor antes de carregar.':mode==='fast'?'Tempo de carga estimado com a potência compatível do veículo.':'Distância em linha reta à localização selecionada.';$('android-hero').innerHTML=`<span class="android-badge">${labels[mode]||labels.recommended}</span><h2>${escapeHtml(hero.station.name||operatorMap.get(hero.station.operator_id)||'Posto')}</h2><div class="android-metrics"><span>⌖ ${hero.distance.toFixed(1).replace('.',',')} km</span><span class="${hero.live?'android-good':''}">${escapeHtml(t(hero.availability.label))}</span>${powerMarkup(hero.power)}<span>💰 ${escapeHtml(total)}</span><span>◷ ${hero.minutes?'~'+hero.minutes+tr(' min de carga',' min charging'):'Tempo por confirmar'}</span><span>🔋 ${tr('Até','Up to')} ${scenario.target}%</span></div><p class="android-reason">ⓘ ${escapeHtml(t(reason))}</p>${hero.card?`<p>${escapeHtml(hero.card.name)} · ${hero.energy.toFixed(1)} kWh${hero.price?.conditionalBenefit?` · ${tr('Benefício condicional em cartão','Conditional card benefit')}: ${euro(hero.price.conditionalBenefit)} (${tr('não deduzido','not deducted')})`:''} · ${cardSourceLink(hero.card)}</p>`:''}<div class="android-actions"><button id="android-go">IR PARA O POSTO →</button><button id="android-show-map">Ver no mapa</button>${favoriteAction(hero.id)}</div>`;$('android-go').onclick=()=>{openStation(hero);openSelectedStationMaps();};$('android-show-map').onclick=()=>openStation(hero,true);}
$('android-alternatives').innerHTML=[['cheap','€ Mais barato'],['fast','ϟ Mais rápido'],['near','⌖ Mais próximo']].map(([key,label])=>{const r=result[key];return`<button class="android-alternative" data-choice="${key}" ${r?'':'disabled'}><b>${label}</b><strong>${r?escapeHtml(operatorMap.get(r.station.operator_id)||r.station.name||'Posto'):'Sem dados'}</strong><small>${r?r.distance.toFixed(1).replace('.',',')+' km':'Sem preço elegível'}<br>${r&&r.total!==null?'~'+euro(r.total):'Preço por confirmar'}${r?.minutes?' · ~'+r.minutes+' min':''}</small></button>`}).join('');$('android-alternatives').querySelectorAll('button').forEach(b=>b.onclick=()=>{mode=b.dataset.choice;if(mode==='cheap')refresh();else view(rows)});
$('android-note').textContent=currentVehicle&&rows.length?tr(`Distâncias em linha reta. Tempos de carga estimados, sem deslocação ou espera. Estimativas disponíveis em ${result.pricedCount}/${result.totalCount} candidatos (até 40 locais compatíveis mais próximos, num raio de 75 km); planos com mensalidade excluídos. Confirma o preço e a elegibilidade no fornecedor.`,`Straight-line distances. Estimated charging times exclude travel and waiting. Estimates available for ${result.pricedCount}/${result.totalCount} candidates (up to the nearest 40 compatible locations within 75 km); subscription plans excluded. Confirm price and eligibility with the provider.`):'';
if(rows.length){$('station-cards').innerHTML=rows.filter(r=>r.id!==hero?.id).slice(0,5).map(r=>`<article class="android-station"><h3>${escapeHtml(r.station.name||operatorMap.get(r.station.operator_id)||'Posto')}</h3><div class="android-metrics"><span>⌖ ${r.distance.toFixed(1).replace('.',',')} km</span><span class="${r.live?'android-good':''}">${escapeHtml(t(r.availability.label))}</span>${powerMarkup(r.power)}<span>${r.total!==null?'~'+euro(r.total):'Preço por confirmar'}</span></div><div class="android-station-actions"><button data-android-map="${escapeHtml(r.id)}">Ver no mapa</button><button data-android-details="${escapeHtml(r.id)}">Detalhes e navegar ›</button>${favoriteAction(r.id)}</div></article>`).join('')||'<p class="android-note">Não existem outros candidatos nesta seleção.</p>';}
applyTranslations($('android-recommendations'));applyTranslations($('station-cards'));
pins.clearLayers();const seen=new Set();for(const [key,mark] of [['recommended','★'],['cheap','€'],['fast','ϟ']]){const r=result[key];if(!r||seen.has(r.id))continue;seen.add(r.id);L.marker([r.station.latitude,r.station.longitude],{icon:L.divIcon({className:'android-pin '+key,html:`<span><i>${mark}</i></span>`,iconSize:[36,36],iconAnchor:[18,36]}),title:r.station.name,zIndexOffset:1200}).addTo(pins).on('click',()=>{mode=key;view(rows);openStation(r)});}}
async function refresh(){if(busy){pending=true;return}busy=true;pending=false;const rows=baseRows();view(rows.map(priced));try{let budget=4;const ids=new Set();for(const row of rows){for(const member of row.station._location_members||[row.station]){if(budget===0)break;if(ids.has(member.id)||!String(member.source).startsWith('nap'))continue;ids.add(member.id);const cached=cache.get(member.id);if(cached&&cached.until>Date.now())continue;budget--;await tariffs(member.id);}}view(baseRows().map(priced));}finally{busy=false;if(pending){pending=false;clearTimeout(timer);timer=setTimeout(refresh,250);}}}
window.AndroidChargeVoy={translate(){view(baseRows().map(priced));applyTranslations($('android-scenario-dialog'));},update(stations){records=stations;clearTimeout(timer);timer=setTimeout(refresh,300);},metrics(){return{tariffRequests:requestCount,cacheEntries:cache.size,newD1Writes:0}}};
$('android-save-options').onclick=async()=>{
 if(!currentVehicle){notifyUser(t('Seleciona um veículo.'),{kind:'error'});return;}
 if(!Object.keys(VEHICLE_SPEC_FIELDS).every(id=>$(id).reportValidity()))return;
 try{updateVehicleSpecs();const previous=localStorage.getItem(optionsKey);if(previous&&JSON.parse(previous).version===1&&!localStorage.getItem(optionsKey+'-v1-backup'))localStorage.setItem(optionsKey+'-v1-backup',previous);localStorage.setItem(optionsKey,JSON.stringify({version:2,powers:selectedPower==='all'?[]:selectedPower.split('|'),connectors:selectedValues('.connector-filter'),statuses:selectedValues('.status-filter'),operators:selectedOperatorValues()}));}
 catch{notifyUser(t('Não foi possível guardar as opções neste dispositivo. Tenta novamente.'),{kind:'error'});return;}
 operatorRestore?.disconnect();await searchPortugal().catch(()=>{});closeFilterMenu();$('nav-map').click();renderStations(false);refresh();notifyUser(t('As tuas opções foram guardadas.'),{kind:'success'});
};$('android-vehicle').onclick=()=>$('nav-vehicle').click();$('android-soc').onclick=()=>{$('android-start').value=scenario.start;$('android-target').value=scenario.target;$('android-scenario-dialog').showModal()};$('android-save-scenario').onclick=()=>{const start=Number($('android-start').value),target=Number($('android-target').value);if(core.energyFor({battery_capacity_kwh:60},start,target)===null){$('android-scenario-error').textContent=t('Define uma bateria entre 0 e 99% e um objetivo superior, até 100%.');return}scenario={start,target,period:'fora_vazio'};try{localStorage.setItem('chargevoy-android-scenario',JSON.stringify(scenario));}catch{}$('android-scenario-error').textContent='';$('android-scenario-dialog').close();mode='recommended';refresh()};$('android-all-filters').onclick=()=>openFilterMenu();document.addEventListener('change',()=>{clearTimeout(timer);timer=setTimeout(()=>refresh(),400)});const nav=document.querySelector('.top .nav');nav.classList.add('android-bottom-nav');document.body.appendChild(nav);$('station-cards').addEventListener('click',event=>{const details=event.target.closest('[data-android-details]'),mapButton=event.target.closest('[data-android-map]');const id=details?.dataset.androidDetails||mapButton?.dataset.androidMap;if(id)openStation(baseRows().find(r=>r.id===id),Boolean(mapButton));});const account=$('nav-account');account.classList.add('android-profile');document.querySelector('.top').appendChild(account);new MutationObserver(syncVehicleThumbnail).observe($('vehicle-image'),{childList:true,subtree:true,attributes:true,attributeFilter:['src']});const syncDrawerInset=()=>{document.documentElement.style.setProperty('--android-nav-height',document.querySelector('.android-bottom-nav').getBoundingClientRect().height+'px');};new ResizeObserver(syncDrawerInset).observe(document.querySelector('.android-bottom-nav'));syncDrawerInset();summary();applyTranslations($('android-scenario-dialog'));renderStations(false);
})();
