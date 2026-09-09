'use strict';
async function refreshExtensions(){
  const data=await api('/extensions');
  $('extensionsCatalog').replaceChildren();$('extensionsInstalled').replaceChildren();
  for(const item of data.catalog.filter(i=>i.id!=='mcp')) {
    const row=textNode('div',item.name+' ');
    const button=textNode('button',t('Installa'));button.disabled=data.installed.some(i=>i.id===item.id);
    button.onclick=act(async()=>{if(!confirm(t('Installare il plugin con i permessi indicati?')+'\n'+item.name+'\n'+t(item.description)))return;await api('/extensions/install',{kind:item.id,confirmed:true});await refreshExtensions();});
    row.append(textNode('p',t(item.description)),button);$('extensionsCatalog').append(row);
  }
  for(const item of data.installed){
    const row=textNode('div',item.name+' · '+(item.enabled?t('Attivo'):t('Disattivato')));
    for(const action of ['enable','disable','remove']) {
      const button=textNode('button',t({enable:'Attiva',disable:'Disattiva',remove:'Rimuovi'}[action]));
      button.onclick=act(async()=>{if(action==='remove'&&!confirm(t('Rimuovere il plugin e le credenziali salvate?')))return;await api('/extensions/manage',{id:item.id,action,confirmed:true});await refreshExtensions();});row.append(button);
    }
    if(item.kind==='mcp'){
      row.append(textNode('p',item.url));const discover=textNode('button',t('Elenca strumenti'));
      discover.onclick=act(async()=>{if(!confirm(t('Contattare questo server MCP?')+'\n'+item.url))return;const r=await api('/extensions/execute',{name:'mcp_tools',arguments:{plugin:item.id},workspace,confirmed:true});$('mcpOutput').textContent=r.result;});row.append(discover);
    }
    $('extensionsInstalled').append(row);
  }
}
$('extensionsButton').onclick=act(async()=>{$('extensionsDialog').showModal();await refreshExtensions();});
$('extensionsClose').onclick=()=>$('extensionsDialog').close();
$('extensionsRefresh').onclick=act(refreshExtensions);
$('mcpInstallForm').onsubmit=act(async event=>{
  event.preventDefault();const url=$('mcpURL').value;
  if(!confirm(t('Installare il plugin con i permessi indicati?')+'\n'+url+'\n'+t('Il server MCP riceve gli argomenti approvati e può avere accesso a servizi esterni.')))return;
  await api('/extensions/install',{kind:'mcp',name:$('mcpName').value,url,token:$('mcpToken').value,privateNetwork:$('mcpPrivate').checked,confirmed:true});$('mcpToken').value='';await refreshExtensions();
});
async function browseWeb(value){
  const name=/^https?:\/\//i.test(value)?'web_read':'web_search';
  if(!confirm(t('Inviare questa richiesta al web?')+'\n'+value))return;
  $('webOutput').textContent=t('Caricamento…');$('webLinks').replaceChildren();
  try {
    const result=await api('/extensions/execute',{name,arguments:name==='web_read'?{url:value}:{query:value},workspace,confirmed:true});
    $('webOutput').textContent=result.text;
    for(const link of result.links || []){const button=textNode('button',link.title||link.url);button.title=link.url;button.onclick=act(()=>browseWeb(link.url));$('webLinks').append(button);}
  }catch(e){$('webOutput').textContent=e.message;throw e;}
}
$('webForm').onsubmit=act(async event=>{event.preventDefault();await browseWeb($('webInput').value);});
$('webKeyForm').onsubmit=act(async event=>{event.preventDefault();await api('/extensions/web',{token:$('webKey').value,confirmed:true});$('webKey').value='';notice(t('Salvato.'));await refreshExtensions();});
async function refreshTerminal(){
  const current=workspace;const {jobs}=await api('/runner');if(workspace!==current)return;$('terminalOutput').replaceChildren();
  for(const job of jobs.filter(j=>j.workspace===current&&j.recipe==='terminal')){
    const row=document.createElement('details');row.open=true;row.append(textNode('summary',job.status+' · '+job.createdAt),textNode('pre',job.command+'\n'+job.output));
    if(job.status==='queued'){const cancel=textNode('button',t('Annulla'));cancel.onclick=act(async()=>{await api('/runner/cancel',{id:job.id});await refreshTerminal();});row.append(cancel);}
    $('terminalOutput').append(row);
  }
}
$('terminalForm').onsubmit=act(async event=>{
  event.preventDefault();const command=$('terminalCommand').value;
  if(!confirm(t('Eseguire il codice del progetto in un container temporaneo senza rete?')+'\n'+command))return;
  await api('/extensions/execute',{name:'terminal_run',arguments:{command},workspace,confirmed:true});await refreshTerminal();
});
$('terminalRefresh').onclick=act(refreshTerminal);
