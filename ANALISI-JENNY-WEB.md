> Documento storico della baseline e del primo MVP 0.1. Per lo stato attuale consultare README-WEB.md e RELEASE-WEB-0.2.0.md.

# Analisi e piano di derivazione Jenny Web

## Baseline verificata

- Repository: https://github.com/SaltyPretz3l/jenny
- Commit: `46ab97a98f740975c36732f335cca1d43847dca1`
- Data acquisizione: 2026-09-07
- Licenza MIT, copyright originale preservato in `LICENSE`; attribuzioni in `NOTICE`.
- Checkout completo dei 4.931 file tracciati del commit, senza installazione delle dipendenze desktop. Clone superficiale: non è stato scaricato tutto lo storico precedente.
- Ricognizione mirata: 623 file in `services`, 458 in `sidecar`, 662 in `renderer`. Questi conteggi descrivono le directory, non una revisione manuale integrale di tutti i file.
- Nessun `AGENTS.md` trovato nel checkout.

## Architettura originale osservata

| Parte | Evidenza nel codice | Conseguenza per la webapp |
| --- | --- | --- |
| Processo principale | `main.js` importa `app`, `BrowserWindow`, `ipcMain`, `safeStorage`, `dialog`, `shell` da Electron | Non può essere l'entrypoint di un servizio headless |
| Bridge renderer | `preload.js` espone `window.jennyShell` tramite `contextBridge` e `ipcRenderer`; `services/ipc-contract.js` definisce il contratto | Servono API di rete e gestione server-side dell'autorità |
| Filesystem workspace | `services/workspace-ide-service.js`: lettura limitata, elenco, scrittura atomica con file temporaneo, controllo mtime; dipendenze `workspace-root-operation`, `tool-path-policy` | Riutilizzabile in Node, iniettando un coordinatore e una root |
| Coordinamento root | `services/workspace-root-coordinator.js` e `workspace-root-operation.js` | Va costruito per il workspace scelto, non lasciato implicito nel main desktop |
| Registro tool | `services/tools/tool-registry.js`: tool, schemi OpenAI, metadati readOnly e sideEffecting | Riutilizzabile senza Electron; l'HTTP adapter deve comunque applicare approvazioni e validazione |
| Orchestrazione desktop | `services/backend/backend-chat-stream.js`, famiglia `chat-stream-*`, `electron-tool-bridge.js` | Il porting integrale porta molte dipendenze di lifecycle, IPC e sessioni; non basta esporre tutto via HTTP |
| Motore compatibile | `sidecar/ai/engines/openai_compatible.py` deriva da `VLLMEngine`; usa le forme `/chat/completions` e `/models` | Il protocollo richiesto esiste già nel prodotto; l'MVP può usarlo direttamente senza gestire un processo Python |
| UI desktop | `index.html`, `renderer/`, `styles/` e bridge preload | Il renderer intero richiede una migrazione estesa; schermata web dedicata per il primo percorso completo |

## Scelta di implementazione

Un ingresso `web/` dedicato nel checkout originale, con Node HTTP e browser HTML/CSS/JS, senza nuove dipendenze npm. Docker include `web/` e i servizi originali; non copia il sidecar, gli asset desktop, i binari o il pacchetto Electron.

È una derivazione con riuso effettivo di codice, non un semplice cambio di nome e non una conversione completa del renderer originale. Sono nuovi: trasporto HTTP, persistenza web, loop LLM, superficie di approvazione e frontend.

### Piano MVP attuato

1. Acquisizione baseline e preservazione attribuzione.
2. `web/workspaces.cjs`: adapter di `WorkspaceIdeService` e `WorkspaceRootCoordinator`, root fissa per progetto, limite 256 KiB, blocco `.git`/symlink, hash contenuto per conflitti, coda interna delle scritture.
3. `web/agent.cjs`: registro originale `ToolRegistry`, tre tool, richieste OpenAI-compatible, limite passi, salvataggio conversazioni e richieste pendenti, approvazione monouso e continuazione con messaggi `role: tool`.
4. `web/server.cjs`: API allowlist, token lato server, origini, limite richieste, file statici espliciti, health endpoint, arresto dei turni.
5. `web/public/`: interfaccia italiana responsive, chat/workspace/editor, selezione modello, prima/dopo, errori e stop.
6. `Dockerfile`, `compose.yaml`, `.env.example`: container non root, filesystem immutabile salvo volumi e tmp, endpoint esterno, nessun runtime desktop.
7. `web/test/integration.test.cjs`: test HTTP con endpoint LLM deterministico e file reali su directory temporanee.

### Flusso di autorizzazione

Il modello riceve solo gli schemi registrati. Le letture operano dentro il workspace della conversazione. Per una scrittura il server memorizza percorso, contenuto precedente, contenuto proposto, hash precedente e identificatore della chiamata tool. Il browser può solo approvare/rifiutare quell'identificatore: non sostituisce il contenuto approvato. L'approvazione viene consumata una volta. Prima del salvataggio si verifica che la revisione non sia cambiata; il servizio originale effettua anche controlli mtime/identità e sostituzione tramite rename. La risposta del tool viene restituita al modello prima di continuare.

Gli endpoint non danno accesso a `ipcMain`, comandi shell o metodi arbitrari dei servizi. La lista dei tre tool evita anche di inviare decine di schemi al piccolo modello locale.

### Contratto HTTP principale

| Endpoint | Uso |
| --- | --- |
| `GET /healthz` | Stato del processo, senza segreti |
| `GET /api/config`, `/api/models` | Configurazione pubblica e modelli disponibili |
| `GET/POST /api/workspaces` | Elenco e creazione workspace |
| `GET /api/files`, `GET/POST /api/file` | Esplorazione, lettura e salvataggio con revisione |
| `GET/POST /api/sessions` | Elenco e creazione conversazioni |
| `GET /api/sessions/:id` | Stato, messaggi e proposta pendente |
| `POST /api/sessions/:id/message` | Nuovo turno |
| `POST /api/sessions/:id/approval` | Decisione su una proposta |
| `POST /api/sessions/:id/stop` | Arresto richiesta o annullamento tool pendenti |

Le richieste POST usano JSON. Le API richiedono `Authorization: Bearer JENNY_TOKEN` quando il token è configurato. Il server rifiuta un bind in rete senza token. Le credenziali LLM non sono esposte nelle API.

## Verifica e limiti di evidenza

14 test d'integrazione superati nel runtime Node.js 24.19.0. Verificati server HTTP reale, pagina e asset, filesystem e protocollo LLM simulato. Nessuna dipendenza Electron caricata per l'avvio web. Nessuna suite desktop completa eseguita, perché il codice originale non è stato modificato.

Non ancora verificati: build Docker effettiva, avvio su host Ubuntu dell'utente, interazione browser reale, modello locale reale. Il Dockerfile usa Node 22; la conferma su quella immagine resta parte della prima prova Docker. Non presentare questi punti come superati.

## Prossima iterazione concreta

1. Sul server dell'utente: avvio compose, verifica UID/volumi, collegamento a LocalAI/Ollama e prova tool calling con il modello effettivo.
2. Aggiungere streaming SSE, interruzione lato provider verificata e indicatore di consumo contesto.
3. Aggiungere editor con syntax highlighting e diff per righe, mantenendo la revisione obbligatoria.
4. Migrare il loop su una separazione provider/agent/store più strutturata e SQLite quando servono query, molte sessioni o più processi. Aggiungere backup esportabile prima di aumentare complessità.
5. Introdurre ricerca testuale e patch mirate per ridurre il contesto e le riscritture integrali.
6. Solo successivamente: esecuzione test/comandi in un runner isolato con approvazioni dedicate; Git locale e integrazione GitHub nel repository che l'utente creerà.

La compatibilità automatica completa con futuri aggiornamenti upstream non è un obiettivo. I servizi originali riutilizzati sono identificati per poter valutare e importare correzioni selettive, soprattutto quelle dei controlli filesystem.
