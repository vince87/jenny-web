# Jenny Web 0.2.0 — release di sviluppo

Questa release estende la 0.1 senza attendere il repository dell'utente. L'obiettivo resta Linux/Docker e browser, con Ollama come provider prioritario.

## Architettura

- `web/server.cjs`: HTTP, autenticazione, origini, route esplicite, eventi SSE, export.
- `web/agent.cjs`: loop, schemi tool originali Jenny, approvazioni, stato conversazioni.
- `web/provider.cjs`: trasporto OpenAI-compatible e parser SSE limitato.
- `web/ollama.cjs`: protocollo nativo, opzioni, diagnostica e serializzazione delle inferenze.
- `web/context.cjs`: budget stimato per turni completi e adattamento delle vecchie cronologie.
- `web/workspaces.cjs`: servizi Jenny originali, contenimento percorsi, letture, ricerca e conflitti.
- `web/public/presentation.js`: funzioni pure di diff ed evidenziazione, senza HTML non fidato.
- `web/public/app.js`: stato GUI, editor, ricerca, revisione e canale realtime.

I token parziali restano in memoria; il disco viene aggiornato ai cambiamenti di stato, non per ogni token. Gli eventi parziali non reinviano tutta la cronologia. Le scritture restano serializzate e controllate con revisione. Il parser provider impone un limite di risposta e non esegue tool incompleti.

## Correzioni importanti

Nella 0.1 la coda dei tool condivideva l'array con il messaggio assistant; `shift()` alterava quindi anche la cronologia. Ora la coda è una copia e i test verificano l'intero abbinamento chiamate/risultati. Per vecchie sessioni già affette, i risultati senza chiamata vengono convertiti in testo storico soltanto nel prompt in uscita: il salvataggio originale resta disponibile.

Sono migliorati anche il recupero da sessioni illeggibili, la protezione da doppi invii nell'interfaccia, i cambi di conversazione durante richieste pendenti, la gestione dei chunk SSE spezzati e i messaggi d'errore per modelli senza tool.

## GUI

Nuova superficie di lavoro grafite con accenti verdi, tema chiaro, navigazione dedicata su schermi piccoli, editor con righe/indentazione/anteprima, ricerca e risultati navigabili, confronto per righe e prima/dopo, codice copiabile, export e rinomina delle chat. I sorgenti del frontend sono formattati per continuare a mantenerli.

## Ollama

Protocollo `/api/chat`, NDJSON, schemi tool convertiti, risultati con `tool_name`, conservazione del campo thinking nelle continuazioni, opzioni per contesto/output/temperatura/keep-alive, rilevamento capacità e metriche. Il thinking non viene mostrato come risposta all'utente; viene conservato dove serve per la continuità del protocollo.

Budget input stimato con margine per output e overhead, eliminazione di soli turni vecchi completi, nessuna modifica della chat persistita. Un'inferenza alla volta per questa istanza, con annullamento delle richieste in attesa. Non vengono cambiati processi o impostazioni dell'Ollama già installato.

## Distribuzione

`start-web.sh` facilita la prima configurazione. Compose principale per Ollama esistente; file aggiuntivi per un nuovo Ollama e per GPU NVIDIA. Nessun modello incluso o scaricato automaticamente. Il progetto desktop originale rimane nello snapshot completo; non viene installato dal Dockerfile web.

## Evidenza

Vedere `VALIDAZIONE-WEB.md` per i risultati effettivi e le prove non disponibili. Questa è una release di sviluppo ampliata, non una dichiarazione di produzione collaudata sul server dell'utente.
