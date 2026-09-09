"use strict";
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
async function writable(directory) {
  const file=path.join(directory,'.jenny-probe-'+randomUUID());
  try { await fs.writeFile(file,'',{flag:'wx',mode:0o600}); await fs.unlink(file); return true; }
  catch { return false; }
}
async function diagnose(agent, workspaces, dataDir, model) {
  const checks=[{name:'data',ok:await writable(dataDir),hint:'Controlla i permessi del volume dati (UID 1000).'}, {name:'workspaces',ok:await writable(workspaces.root),hint:'Controlla i permessi del volume workspace (UID 1000).'}];
  try {
    const models = await agent.models();
    checks.push({name:'connection',ok:true,hint:'Connessione riuscita.'});
    checks.push({name:'model',ok:!!model && models.includes(model),hint:'Scegli un modello installato. Se /models manca, verifica il nome sul server.'});
    if(model && agent.provider.kind==='ollama') {
      const info=await agent.provider.info(model);
      checks.push({name:'tools',ok:info.capabilities.includes('tools'),hint:'Per Agente scegli un modello con tools; altrimenti usa la chat semplice.'});
    }
  } catch { checks.push({name:'connection',ok:false,hint:'Controlla endpoint, porta e rete Docker. localhost nel container indica Jenny, non il server host.'}); }
  return {checks,provider:agent.provider.kind,node:process.version,storage:'SQLite',model,measuredAt:new Date().toISOString()};
}
module.exports={diagnose};
