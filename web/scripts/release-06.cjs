'use strict';
// Mechanical catalog/version update; source strings are intentionally explicit.
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const file=path.join(root,'public/locales.json'),c=JSON.parse(fs.readFileSync(file));
const additions={
 'Salvato.':'Saved.',
 'Ricerca e lettura di pagine pubbliche; ogni richiesta richiede approvazione.':'Search and read public pages; every request requires approval.',
 'Il modello sta pensando…':'The model is thinking…','Jenny sta scrivendo…':'Jenny is writing…','In attesa del modello…':'Waiting for the model…','Thinking del modello':'Model thinking','Plugin, Web e Terminale':'Plugins, Web and Terminal','Collega server MCP':'Connect MCP server','MCP HTTP 2025-11-25. Ogni chiamata richiede approvazione.':'MCP HTTP 2025-11-25. Every call requires approval.','Consenti endpoint nella rete privata':'Allow private network endpoint','Installa':'Install','Ricerca o URL':'Search or URL','Cerca / Apri':'Search / Open','Terminale':'Terminal','Comandi nella copia temporanea del workspace, senza rete. Richiede il worker Docker.':'Commands run in a temporary workspace copy, without network. Requires the Docker worker.','Comando':'Command','Installare il plugin con i permessi indicati?':'Install this plugin with the stated permissions?','Attivo':'Enabled','Disattivato':'Disabled','Attiva':'Enable','Disattiva':'Disable','Rimuovi':'Remove','Rimuovere il plugin e le credenziali salvate?':'Remove the plugin and its saved credentials?','Elenca strumenti':'List tools','Contattare questo server MCP?':'Contact this MCP server?','Il server MCP riceve gli argomenti approvati e può avere accesso a servizi esterni.':'The MCP server receives approved arguments and may have access to external services.','Inviare questa richiesta al web?':'Send this request to the web?','Caricamento…':'Loading…','Eseguire questa richiesta esterna? Controlla destinazione e argomenti.':'Execute this external request? Check its destination and arguments.'
};
for(const [it,en] of Object.entries(additions)){c.it[it]=it;c.en[it]=en;}
fs.writeFileSync(file,JSON.stringify(c,null,2)+'\n');
const p=path.join(root,'package.json'),pkg=JSON.parse(fs.readFileSync(p));pkg.version='0.6.0';fs.writeFileSync(p,JSON.stringify(pkg,null,2)+'\n');
