(function(root) {
  'use strict';
  let session=null, generation=0, loadPromise=null, nonce=null, nonceAt=0, completing=false;
  const CLIENT='1094158912679-4vs9a9t3lrv54uv4h9lmmmb1aq2h9roo.apps.googleusercontent.com';
  let channel;
  try{if(root.BroadcastChannel)channel=new root.BroadcastChannel('chargevoy-account');}catch{}
  const emit=(broadcast=false)=>{root.dispatchEvent(new CustomEvent('chargevoy-account-changed',{detail:session}));if(broadcast)channel?.postMessage('changed');};
  if(channel)channel.onmessage=()=>restore().catch(()=>{});
  async function request(path, options={}) {
    const epoch=generation;
    const {matchOwner=true,...fetchOptions}=options;
    const owner=matchOwner?session?.user?.id:null;
    const response=await fetch('/api/account'+path,{...fetchOptions,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',...(owner?{'X-ChargeVoy-Expected-User':owner}:{})},signal:AbortSignal.timeout(15000)});
    const data=await response.json();
    if (!response.ok) {
      if(response.status===401 && epoch===generation){generation++;session=null;emit();}
      throw Object.assign(Error(data.error||'Não foi possível concluir o pedido.'),{status:response.status,data});
    }
    if(epoch!==generation)throw Object.assign(Error('A conta mudou.'),{status:409});
    return data;
  }
  async function restore() {
    const epoch=generation;
    try{const data=await request('/me',{matchOwner:false});if(epoch===generation){if(session?.user?.id!==data.user?.id)generation++;session=data;emit();}return session;}
    catch(error){if(error.status!==401)throw error;return null;}
  }
  function loadGoogle() {
    if(root.google?.accounts?.id)return Promise.resolve(root.google.accounts.id);
    if(!loadPromise)loadPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
      const timer=setTimeout(()=>{loadPromise=null;script.remove();reject(Error('Não foi possível carregar o login Google. Tente novamente.'));},15000);
      script.onload=()=>{clearTimeout(timer);if(root.google?.accounts?.id)resolve(root.google.accounts.id);else{loadPromise=null;reject(Error('Login Google indisponível.'));}};
      script.onerror=()=>{clearTimeout(timer);loadPromise=null;script.remove();reject(Error('Não foi possível carregar o login Google.'));};
      document.head.appendChild(script);
    });
    return loadPromise;
  }
  async function renderSignIn(element, language='pt', onError=()=>{}) {
    const epoch=generation;
    const google=await loadGoogle();
    if(!nonce || Date.now()-nonceAt>240000){nonce=(await request('/challenge',{method:'POST',body:'{}'})).nonce;nonceAt=Date.now();}
    if(epoch!==generation || !element.isConnected)return;
    const challenge=nonce;
    google.initialize({client_id:CLIENT,nonce:challenge,auto_select:false,ux_mode:'popup',callback:async credential=>{
      if(completing || epoch!==generation)return;
      completing=true;
      try {
        const data=await request('/google',{method:'POST',body:JSON.stringify({idToken:credential.credential,nonce:challenge})});
        if(epoch===generation){generation++;session={user:{...data.user,user_metadata:{name:data.user.name,full_name:data.user.name}}};nonce=null;emit(true);}
      } catch(error){nonce=null;onError(error);}
      finally{completing=false;}
    }});
    google.renderButton(element,{theme:'outline',size:'large',text:'signin_with',locale:language==='en'?'en':'pt-PT',width:Math.min(320,element.clientWidth||280)});
  }
  async function signOut() {
    // Keep the session visible on network failure: do not claim remote logout succeeded.
    await request('/logout',{method:'POST',body:'{}'});
    generation++;session=null;nonce=null;root.google?.accounts?.id.disableAutoSelect();emit(true);
  }
  async function remove() {
    await request('/me',{method:'DELETE'});generation++;session=null;nonce=null;root.google?.accounts?.id.disableAutoSelect();emit(true);
  }
  const storage={getItem(key){return localStorage.getItem(session?.user?.id?'chargevoy-web:'+session.user.id+':'+key:key);},setItem(key,value){localStorage.setItem(session?.user?.id?'chargevoy-web:'+session.user.id+':'+key:key,value);}};
  const cache={getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value),removeItem:key=>localStorage.removeItem(key)};
  root.ChargeVoyAccount={request,restore,renderSignIn,signOut,remove,storage,cache,getSession:()=>session};
})(window);
