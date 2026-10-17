// Local selection only: no credentials, remote requests or account writes.
(function(root){
 'use strict';
 function create(storage){
  let owner='guest',state={mode:'all',ids:[]};
  const key=()=> 'chargevoy-web-payments:v1:'+owner;
  const valid=x=>x&&['all','selected'].includes(x.mode)&&Array.isArray(x.ids)&&x.ids.length<=100&&x.ids.every(id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id));
  function setOwner(id){owner=id?'user:'+encodeURIComponent(id):'guest';state={mode:'all',ids:[]};try{const saved=JSON.parse(storage.getItem(key()));if(valid(saved))state=saved;}catch{} }
  function save(mode,ids=[]){const next={mode,ids:[...new Set(ids)]};if(!valid(next))throw Error('Invalid payment selection');storage.setItem(key(),JSON.stringify(next));state=next;}
  setOwner(null);
  return {setOwner,save,includes:id=>state.mode==='all'||state.ids.includes(id),get:()=>({mode:state.mode,ids:[...state.ids]}),removeOwner(id){storage.removeItem('chargevoy-web-payments:v1:user:'+encodeURIComponent(id));}};
 }
 root.ChargeVoyPaymentStore={create};
 root.ChargeVoyPayments=create({getItem:key=>root.localStorage.getItem(key),setItem:(key,value)=>root.localStorage.setItem(key,value),removeItem:key=>root.localStorage.removeItem(key)});
})(globalThis);
