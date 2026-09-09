#!/usr/bin/env node
"use strict";
const fs=require('node:fs/promises');
const path=require('node:path');
const {SessionStore}=require('../store.cjs');
const {acquire}=require('../backup.cjs');
async function main(){
  const [dataDir,destination]=process.argv.slice(2);
  if(!dataDir||!destination)throw Error('Usage: node web/scripts/export-legacy.cjs DATA_DIR NEW_DIRECTORY');
  const release=await acquire(dataDir);let store;
  try {
    store=new SessionStore(dataDir);const sessions=store.all();
    await fs.mkdir(destination,{mode:0o700});
    for(const s of sessions){
      if(!/^[a-f0-9-]+$/.test(s.id))throw Error('Invalid session ID');
      const done=new Set(s.messages.filter(m=>m.role==='tool').map(m=>m.tool_call_id));
      for(const m of [...s.messages])for(const call of m.tool_calls||[])if(!done.has(call.id)){s.messages.push({role:'tool',tool_call_id:call.id,content:JSON.stringify({error:'Cancelled for legacy export; no automatic execution.'})});done.add(call.id);}
      s.status='idle';s.pending=null;s.queue=[];s.partial='';
      await fs.writeFile(path.join(destination,s.id+'.json'),JSON.stringify(s),{flag:'wx',mode:0o600});
    }
    console.log('Exported '+sessions.length+' sessions');
  }finally{store?.close();await release();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
