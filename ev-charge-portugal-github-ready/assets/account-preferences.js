(function(){
  'use strict';
  const account=window.ChargeVoyAccount,$=id=>document.getElementById(id);
  let applying=false,owner=null,timer,desiredVehicle=null,sharedOperators=[],syncStatus='local';
  const defaults={language:'pt',filters:{powers:[],connectors:[],statuses:['available','unavailable','unknown'],operators:[]},battery:{start:32,target:80}};
  const identity=name=>{
    let n=String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    if(/^atlante(?: infra portugal)?(?: s a)?$/.test(n))n='atlante';
    if(/^(?:modelo )?continente hipermercados(?: s a)?$/.test(n)||/^continente plug (?:and )?charge$/.test(n)||n==='continente')n='continente';
    return n.replace(/[^a-z0-9]/g,'');
  };
  const engine=window.ChargeVoyPreferences.create({request:account.request,storage:account.cache,apply,status(value){syncStatus=value;const node=$('account-preferences-status');if(node)node.textContent=statusText();}});
  function statusText(){const en=currentLanguage==='en';return ({synced:en?'Preferences synced':'Preferências sincronizadas',syncing:en?'Syncing preferences…':'A sincronizar preferências…',pending:en?'Preferences saved locally; sync pending':'Preferências guardadas localmente; sincronização pendente',local:en?'Preferences saved on this device':'Preferências guardadas neste dispositivo','login-required':en?'Sign in again to sync preferences':'Entre novamente para sincronizar preferências',unavailable:en?'Preference sync temporarily unavailable':'Sincronização de preferências temporariamente indisponível','storage-error':en?'Unable to save preferences':'Não foi possível guardar as preferências'})[syncStatus];}
  function chooseVehicle(){
    if(!vehicleModels.length)return;
    const vehicle=vehicleModels.find(x=>x.id===desiredVehicle?.id)||vehicleModels[0];
    if(desiredVehicle && vehicle.id!==desiredVehicle.id){
      currentVehicle=null;$('vehicle-select').value='';$('vehicle-specs').textContent=currentLanguage==='en'?'Saved vehicle is not available in this catalogue. Select a vehicle.':'O veículo guardado não está disponível neste catálogo. Selecione um veículo.';
      $('vehicle-image').textContent='🚘';$('vehicle-image-credit').textContent='';return;
    }
    if(desiredVehicle)account.storage.setItem('chargevoy-vehicle-specs:'+vehicle.id,JSON.stringify(desiredVehicle.specs||{}));
    $('vehicle-brand').value=vehicle.make;
    renderVehicleOptions(vehicle.make,vehicle.id);
  }
  function apply(values){
    applying=true;
    try{
      const data={...defaults,...values},filters=data.filters||defaults.filters;
      setLanguage(data.language==='en'?'en':'pt');
      selectedPower=Array.isArray(filters.powers)&&filters.powers.length?filters.powers.join(','):'all';
      for(const input of document.querySelectorAll('.connector-filter'))input.checked=(filters.connectors||[]).includes(input.value);
      for(const input of document.querySelectorAll('.status-filter'))input.checked=(filters.statuses||defaults.filters.statuses).includes(input.value);
      sharedOperators=Array.isArray(filters.operators)?filters.operators:[];
      const selector=$('operator-filter');selector.querySelector('[data-account-operators]')?.remove();
      if(sharedOperators.length){const option=document.createElement('option');option.value='__shared__';option.dataset.accountOperators='true';option.textContent=sharedOperators.join(' + ');selector.appendChild(option);selector.value='__shared__';}else selector.value='all';
      desiredVehicle=data.vehicle||null;chooseVehicle();
      window.WebChargeVoy?.setScenario(data.battery||defaults.battery);
      const note=$('android-scenario-dialog').querySelector('p');if(note)note.textContent=owner?(currentLanguage==='en'?'These account preferences sync when online.':'As preferências desta conta sincronizam quando existe ligação.'):(currentLanguage==='en'?'Preferences saved only on this device.':'Preferências guardadas apenas neste dispositivo.');
      renderStations(false);
    }finally{applying=false;}
  }
  function snapshot(){
    const selected=$('operator-filter').value;
    return {language:currentLanguage,filters:{powers:selectedPower==='all'?[]:selectedPower.split(','),connectors:selectedValues('.connector-filter'),statuses:selectedValues('.status-filter'),operators:selected==='__shared__'?sharedOperators:selected==='all'?[]:[selected]},battery:window.WebChargeVoy.getScenario(),...(currentVehicle?{vehicle:{id:currentVehicle.id,specs:JSON.parse(account.storage.getItem('chargevoy-vehicle-specs:'+currentVehicle.id)||'{}')}}:{})};
  }
  function changed(group){
    if(applying||!owner)return;
    try{const value=snapshot()[group];if(value===undefined)return;engine.change({[group]:value});clearTimeout(timer);timer=setTimeout(()=>engine.sync(),650);}
    catch{syncStatus='storage-error';}
  }
  function attach(id){
    clearTimeout(timer);owner=id;engine.detach();sharedOperators=[];
    if(id){engine.attach(id);engine.sync();}
    else{
      const guest={...defaults};
      try{guest.language=account.storage.getItem('ev-charge-language')||'pt';guest.battery=JSON.parse(account.storage.getItem('chargevoy-android-scenario')||'null')||defaults.battery;const id=account.storage.getItem('ev-charge-vehicle');if(id)guest.vehicle={id,specs:JSON.parse(account.storage.getItem('chargevoy-vehicle-specs:'+id)||'{}')};}catch{}
      apply(guest);
    }
  }
  window.addEventListener('chargevoy-user-ready',event=>attach(event.detail.id));
  window.addEventListener('online',()=>engine.sync());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)engine.sync();});
  document.addEventListener('change',event=>{if(event.target.matches('#vehicle-select,#vehicle-brand,#vehicle-battery,#vehicle-consumption,#vehicle-dc'))changed('vehicle');if(event.target.matches('#operator-filter,.connector-filter,.status-filter,.quick-filter-input'))changed('filters');});
  document.addEventListener('click',event=>{if(event.target.closest('#language-toggle'))changed('language');if(event.target.closest('#power-filter .chip,#quick-power-filter .chip,#clear-quick-filters,#reset-all-filters'))changed('filters');if(event.target.closest('#android-save-scenario'))changed('battery');if(event.target.closest('#save-vehicle-specs'))changed('vehicle');});
  window.ChargeVoyWebPreferences={statusText,sync:engine.sync,matchesOperator(name,value){return value==='__shared__'?sharedOperators.some(x=>identity(x)===identity(name)):value==='all'||identity(name)===identity(value);},catalogueReady(){if(desiredVehicle){applying=true;try{chooseVehicle();}finally{applying=false;}}}};
  const initial=account.getSession()?.user?.id;if(initial)attach(initial);
})();
