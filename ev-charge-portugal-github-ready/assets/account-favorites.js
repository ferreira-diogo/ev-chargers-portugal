(function(root){
  'use strict';
  function create({request,storage,apply,status=()=>{}}){
    let owner=null,epoch=0,state=null,busy=false;
    const key=id=>'chargevoy-favorites-v1:'+id;
    const valid=id=>typeof id==='string'&&/^[a-zA-Z0-9:_-]{1,160}$/.test(id);
    const save=()=>storage.setItem(key(owner),JSON.stringify(state));
    const show=()=>{const ids=new Set(state.remote);for(const [id,on] of Object.entries(state.pending)){if(on)ids.add(id);else ids.delete(id);}apply([...ids]);};
    function detach(){epoch++;owner=null;state=null;busy=false;}
    function attach(id){
      detach();if(!id)return;
      owner=id;state={remote:[],pending:{}};
      try{const s=JSON.parse(storage.getItem(key(id))||'null');if(s&&Array.isArray(s.remote)&&s.remote.length<=200&&s.remote.every(valid)&&s.pending&&typeof s.pending==='object'&&!Array.isArray(s.pending)&&Object.keys(s.pending).length<=400&&Object.entries(s.pending).every(([k,v])=>valid(k)&&typeof v==='boolean'))state=s;}catch{}
      show();status(Object.keys(state.pending).length?'pending':'local');
    }
    function change(id,on){
      if(!owner||!valid(id))return;
      const previous=state.pending;state.pending={...previous,[id]:Boolean(on)};
      try{save();}catch(error){state.pending=previous;status('storage-error');throw error;}
      show();status('pending');
    }
    async function sync(){
      if(!owner||busy)return;
      const generation=epoch;busy=true;const active=()=>generation===epoch&&owner;
      try{
        status('syncing');const data=await request('/favorites');if(!active())return;
        if(!Array.isArray(data.favorites)||!data.favorites.every(valid))throw Error('Favoritos inválidos.');
        state.remote=data.favorites;save();show();
        // Snapshot bounds this drain; later edits remain pending for the next pass.
        for(const [id,on] of Object.entries({...state.pending})){
          await request('/favorites/'+encodeURIComponent(id),{method:on?'PUT':'DELETE',...(on?{body:'{}'}:{})});if(!active())return;
          state.remote=on?[...new Set([...state.remote,id])]:state.remote.filter(x=>x!==id);
          if(state.pending[id]===on)delete state.pending[id];save();show();
        }
        status(Object.keys(state.pending).length?'pending':'synced');
      }catch(error){if(active())status(error.status===401?'login-required':'pending');}
      finally{if(active())busy=false;}
    }
    function remove(id){storage.removeItem(key(id));if(owner===id)detach();}
    return {attach,detach,change,sync,remove};
  }
  root.ChargeVoyFavorites={create};
})(globalThis);
