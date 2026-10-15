(function(root) {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const fields = ['vehicle','filters','battery','language'];
  const validSnapshot = data => data && Number.isSafeInteger(data.revision) && data.revision >= 0 && data.preferences && typeof data.preferences === 'object' && !Array.isArray(data.preferences) && Object.keys(data.preferences).every(k=>fields.includes(k));
  function create({request, storage, apply, status = ()=>{}}) {
    let owner = null, generation = 0, state = null, busy = false;
    const key = id => 'chargevoy-preferences-v1:'+id;
    function save() {storage.setItem(key(owner),JSON.stringify(state));}
    function view() {
      const values = {...state.preferences};
      for (const [k,v] of Object.entries(state.pending)) {if(v === null)delete values[k];else values[k]=v;}
      apply(copy(values));
    }
    function detach() {generation++;owner=null;state=null;busy=false;status('local');}
    function attach(id) {
      detach(); if (!id) return;
      owner=id;state={revision:0,preferences:{},pending:{}};
      try {
        const saved=JSON.parse(storage.getItem(key(id))||'null');
        if (validSnapshot(saved) && saved.pending && typeof saved.pending==='object' && !Array.isArray(saved.pending) && Object.keys(saved.pending).every(k=>fields.includes(k))) state=saved;
      } catch {}
      // Never import guest or another account's preferences automatically.
      view(); status(Object.keys(state.pending).length?'pending':'local');
    }
    function change(changes) {
      if (!owner) return;
      const next=Object.fromEntries(Object.entries(changes).filter(([k])=>fields.includes(k)));
      const previous=state.pending;state.pending={...previous,...copy(next)};
      try {save();} catch(error){state.pending=previous;status('storage-error');throw error;}
      status('pending');
    }
    async function sync() {
      if (!owner || busy) return;
      const epoch=generation;busy=true;
      const active=()=>generation===epoch && owner;
      try {
        status('syncing');
        let remote=await request('/preferences');
        if (!active()) return;
        if(!validSnapshot(remote))throw Error('Invalid preferences response');
        state.preferences=remote.preferences;state.revision=remote.revision;save();view();
        // Two bounded CAS attempts. Own modified groups win only when accepted by server.
        for(let attempt=0;attempt<2 && Object.keys(state.pending).length;attempt++) {
          const pending=copy(state.pending);
          try {
            remote=await request('/preferences',{method:'PUT',body:JSON.stringify({baseRevision:state.revision,changes:pending})});
            if (!active()) return;
            if(!validSnapshot(remote))throw Error('Invalid preferences response');
            state.preferences=remote.preferences;state.revision=remote.revision;
            for(const [k,v] of Object.entries(pending))if(JSON.stringify(state.pending[k])===JSON.stringify(v))delete state.pending[k];
          } catch(error) {
            if (!active()) return;
            if (error.status!==409 || !validSnapshot(error.data))throw error;
            state.preferences=error.data.preferences;state.revision=error.data.revision;
          }
          save();view();
        }
        status(Object.keys(state.pending).length?'pending':'synced');
      } catch(error) {if(active())status(error.status===401?'login-required':error.status===404?'unavailable':'pending');}
      finally {if(active())busy=false;}
    }
    function remove(id) {storage.removeItem(key(id));if(owner===id)detach();}
    return {attach,detach,change,sync,remove};
  }
  root.ChargeVoyPreferences={create};
})(globalThis);
