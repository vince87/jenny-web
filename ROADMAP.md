# Jenny Web — roadmap operativa

Ultimo aggiornamento: 2026-09-09 · Release di lavoro: **0.6.1**

## Aggiornamento SearXNG 0.6.1

JW-041: provider, endpoint SearXNG, consenso LAN e chiave Brave configurabili da `.env` e inoltrati da Compose. Template con `http://192.168.10.250:8081`; nessuna sovrascrittura dei `.env` esistenti. SearXNG esplicito non ripiega su altri provider; endpoint fisso e redirect rifiutati, protezioni di web_read preservate. Test HTTP dedicati: encoding query, risultati limitati, credenziali escluse dallo stato, errori JSON/403, LAN opt-in. Prossimo passo: verificare il container aggiornato sul server dell'utente.

## Tranche 0.6 richiesta dall'utente

| ID | Stato | Implementazione / prossimo passo |
| --- | --- | --- |
| JW-040 | Implementato, browser e modello reale da collaudare | Attesa immediata, thinking Ollama live, scrittura e secondi trascorsi; test DOM simulato e adapter HTTP |
| JW-041 | Implementato con limiti | Lettura pagine/link, blocco reti private, ricerca Brave con chiave GUI; lettura pubblica reale riuscita. DuckDuckGo bloccato anti-bot; Brave non provato senza chiave. Non è un browser JavaScript |
| JW-042 | Implementato, GUI da collaudare | Catalogo locale Web/Terminale, connessioni MCP; installa, abilita, disabilita, rimuovi; configurazione persistita, credenziali non esposte nell'API |
| JW-043 | Parziale | MCP Streamable HTTP 2025-11-25, tools/list paginato, tools/call JSON/SSE, bearer HTTPS, chiusura sessione; mock HTTP reale. Mancano stdio, OAuth, risorse/prompt e collaudo server terzo |
| JW-044 | Parziale | Terminale batch tramite worker isolato, coda e approvazioni testate. Smoke Docker reale riuscito: non-root, rete assente, source read-only e nessun write-back. Mancano PTY e integrazione desktop originale |
| JW-045 | Da fare | Portare catalogo/pacchetti e strumenti desktop originali con runtime dedicato e confini di sicurezza; non equivalgono alle connessioni MCP |
| JW-046 | Completato | CI GitHub Linux run 34343263897: build Docker, 54/54 test senza esclusioni, terminale isolato reale, Compose, non-root e persistenza riusciti |

Prossimo passo concreto: prova dell'utente sul server per thinking, chiave ricerca, server MCP e worker; poi JW-045 (runtime degli strumenti desktop). Non dichiarare completati gli aspetti desktop non portati.

Questo file è il registro principale del progetto. A ogni ripresa si leggono prima questa roadmap, `AGENTS.md` e `VALIDAZIONE-WEB.md`. Le attività mantengono il loro ID tra una release e l'altra. Le date delle versioni future non sono ancora fissate.

## Obiettivo e vincoli

Applicazione browser per Linux/Docker, derivata da Jenny, con Ollama prioritario e compatibilità OpenAI alternativa. Prima affidabilità e controllo delle modifiche, poi ampliamento delle capacità. Un utente fidato, nessun Electron/VNC nel runtime. Non serve il repository dell'utente per continuare a sviluppare e conservare release complete.

## Come leggere gli stati

- **Completato**: implementazione presente con verifica automatica pertinente, oppure documento presente e controllato. Non implica un collaudo hardware o visuale.
- **Da collaudare**: implementazione disponibile, ma manca la verifica nell'ambiente indicato.
- **Da fare**: lavoro non implementato; non deve essere descritto come già disponibile.
- **Bloccato**: richiede accesso o infrastruttura non disponibili.

## Lavoro completato

| ID | Attività | Release | Evidenza / sorgenti |
| --- | --- | --- | --- |
| JW-001 | Acquisire Jenny e preservare attribuzione/licenza | 0.1 | Baseline `46ab97a98f740975c36732f335cca1d43847dca1`; `LICENSE`, `NOTICE`, analisi |
| JW-002 | Avvio HTTP headless, chat e workspace | 0.1 | `web/server.cjs`, `web/agent.cjs`, test HTTP |
| JW-003 | Lettura/scrittura, confini filesystem e conflitti | 0.1 | `web/workspaces.cjs`, servizi originali Jenny, test su file reali |
| JW-004 | Approvazioni monouso e rifiuto delle scritture | 0.1 | Test attesa/rifiuto/conflitti/riavvio |
| JW-005 | Streaming OpenAI SSE e Ollama NDJSON | 0.2 | `web/provider.cjs`, `web/ollama.cjs`, test chunk e stream incompleti |
| JW-006 | Ollama: opzioni, capacità, metriche e coda inferenze | 0.2 | Test protocollo nativo e annullamento richieste in coda |
| JW-007 | Budget contesto e conservazione della cronologia tool | 0.2 | `web/context.cjs`; regressione della coda condivisa della 0.1 |
| JW-008 | Ricerca e modifica mirata con approvazione | 0.2 | Tool `search_files`, `edit_file`; test frammento unico/ambiguo |
| JW-009 | GUI rinnovata, editor, diff, temi e export | 0.2 | Frontend e test funzioni pure; collaudo browser separato JW-021 |
| JW-010 | GUI IT/EN con selettore e catalogo centralizzato | 0.3 | `locales.json`, runtime i18n, test parità/chiavi/non modifica contenuti |
| JW-011 | Lingua dei nuovi turni e principali errori API | 0.3 | Lingua persistita nella chat; test inglese/italiano e lingua non supportata |
| JW-012 | Roadmap persistente e regole di ripresa | 0.3 | Questo file e `AGENTS.md` |

## Implementato, da collaudare nel browser

| ID | Attività | Cosa è presente | Prova ancora necessaria |
| --- | --- | --- | --- |
| JW-013 | Recupero workspace/chat dopo ricaricamento | Preferenze locali e caricamento sessione esistente | Ricaricare pagina, verificare progetto/chat e modello corretti |
| JW-014 | Bozze del messaggio per chat | Session storage della scheda; svuotamento dopo invio | Cambiare chat, ricaricare, inviare, verificare che la bozza inviata non ricompaia |
| JW-015 | Riconnessione realtime | Tentativi progressivi fino a 30 s e polling di ripiego | Interrompere/ripristinare rete; verificare assenza di stream duplicati |

Queste tre attività hanno codice e controlli statici, ma non vengono equiparate a interazioni browser collaudate.

## Prossime attività, in ordine

| ID | Priorità | Stato | Lavoro | Criterio di completamento |
| --- | --- | --- | --- | --- |
| JW-020 | P0 | Completato per smoke CI | Build/avvio Docker effettivi, health, non-root, volume scrivibile e marker preservato al riavvio; run 34343263897. Prova completa dati personali sul server ancora separata |
| JW-021 | P0 | Da collaudare | GUI desktop/mobile IT/EN | Flusso completo chat→tool→approvazione→editor; temi, zoom, tastiera, selettore lingua; richiede prova browser |
| JW-022 | P0 | Bloccato | Ollama e modello reali sul server | Misurare caricamento, token/s, contesto, qualità tool e conflitti con altri servizi; manca accesso al server |
| JW-023 | P1 | Da collaudare in browser | Snapshot e ripristino implementati nella 0.4 | Test filesystem: 30 copie, riavvio, isolamento e conflitti. GUI IT/EN con confronto e caricamento nell’editor; salvataggio esplicito |
| JW-024 | P1 | Completato | Letture per caratteri e ricerca selettiva | Ripresa Unicode tramite start_char; limite adattato al profilo; snippet centrato, max 5 risultati per file e 40 per tool; test dedicati |
| JW-025 | P1 | Implementato, GUI da collaudare | Ricerca e archiviazione chat | HTTP: archivia/ripristina, cerca nel testo, impedisce invii su chat archiviata |
| JW-026 | P1 | Completato per questa release | Separazione frontend | Moduli sessioni/eventi, cronologia editor, strumenti progetto e controllo richieste; test avvio moduli e risposte obsolete. App principale ancora migliorabile |
| JW-027 | P2 | Completato | SQLite e migrazione | Transazioni, import JSON una volta, rollback testato, vecchi JSON preservati, export per downgrade; singolo processo obbligatorio |
| JW-028 | P2 | Completato | Repository dell’utente | Import della 0.5 in https://github.com/vince87/jenny-web; commit iniziale del proprietario e attribuzioni preservati |
| JW-029 | P2 | Completato, immagine Docker da collaudare | Git locale read-only | Stato/diff/staging/log con timeout; test repository reale e diff esterno bloccato; Git incluso nel Dockerfile |
| JW-030 | P3 | Implementato, Docker da collaudare | Runner isolato opzionale | Coda approvata, lease monouso, worker host separato; rete assente, sorgente read-only, copia temporanea, limiti. Contratto e coda testati; nessun container eseguito qui |
| JW-031 | P3 | Bloccato | GitHub/PR/integrazioni remote | Dipende da JW-028 e autorizzazioni alle specifiche azioni |
| JW-032 | P1 | Implementato, GUI da collaudare | Allegati testuali | Max 5 / 12000 byte, selezione e rimozione, file aperto o dispositivo; contenuto esplicitamente aggiunto al turno, nessuna scrittura workspace |
| JW-033 | P1 | Completato, modello reale da collaudare | Profili Ollama | Server/leggero/bilanciato/esteso per chat; test parametri nativi e assenza di modifica dei default condivisi |
| JW-034 | P1 | Implementato, GUI da collaudare | Contesto visibile | Barra con stima dell'ultima richiesta, budget e turni esclusi; token input misurati separati |
| JW-035 | P1 | Completato, GUI da collaudare | Istruzioni progetto | JENNY.md max 6000 caratteri, cronologia/conflitti, snapshot nei nuovi turni; test API e prompt |
| JW-036 | P2 | Completato, GUI da collaudare | Revisione multifile | Max 8 file / 256 KiB complessivi; selezione per file, rifiuti, conflitti e risultati parziali testati; nessuna promessa di atomicità multifile |
| JW-037 | P1 | Completato, ambiente reale da collaudare | Diagnostica | Prova scrittura dati/workspace, endpoint, modello e tools; indicazioni IT/EN; integrazione HTTP verificata |
| JW-038 | P2 | Completato | Export e ripristino | Export chat GUI; backup offline completo con checksum, binari, cartelle vuote, storia e SQLite; restore solo cartella nuova, test traversal/corruzione/overwrite |
| JW-039 | P2 | Implementato, browser da collaudare | Accessibilità e mobile | Focus visibile, skip link, dialog nativi, etichette, movimento ridotto, controlli mobile; avvio moduli verificato su DOM simulato, non test visuale |

I **14 interventi di sviluppo autorizzati** (JW-024/025/026/027/029/030 e JW-032…039) hanno ora un'implementazione nella 0.5. La colonna stato separa le verifiche locali dai collaudi esterni. Nessuna di queste righe implica che il prodotto sia già pronto per uso quotidiano.

## Prossimo avvio del lavoro

1. Verificare checkout e release corrente; leggere questo file.
2. Se sono disponibili Docker/browser/server, affrontare JW-020/021/022 prima di ampliare le funzioni.
3. Lo sviluppo autorizzato di questa tranche è implementato. Priorità successiva: collaudo integrato JW-020/021/022 e JW-030, poi correggere i problemi emersi. Non aggiungere nuove funzioni per mascherare queste verifiche mancanti.
4. Aggiungere test per i nuovi rischi e per i bug scoperti, non duplicati meccanici dell'implementazione.
5. Aggiornare stati, evidenze, note di release e validazione. Creare un nuovo archivio completo identificabile.

## Decisioni da preservare

- Niente compatibilità upstream completa obbligatoria; mantenere provenienza e valutare correzioni selettive.
- Il runner è opzionale, approvato manualmente e separato dal server web; nessun Docker socket montato in Jenny. Il modello dispone di 6 tool filesystem, non di una shell.
- Il selettore lingua traduce la GUI. Non traduce o riscrive file, nomi scelti dall'utente e conversazioni passate. Le risposte future seguono la lingua inviata al server; la qualità dipende dal modello.
- Il catalogo canonico è `web/public/locales.json`; rigenerare `i18n.js` con `npm --prefix web run build:i18n`.
- I dati di runtime e `.env` non entrano in Git né negli archivi sorgenti.
- I provider nei test sono simulati: non usarli come prova delle prestazioni del modello reale.

## Debito tecnico noto dopo la 0.5

- Un processo per directory dati: l’entrypoint usa un lock esclusivo. Dopo un arresto forzato, verificare che Jenny sia fermo prima di rimuovere `.jenny-active` (vedere BACKUP-WEB.md).
- Backup offline limitato a 128 MiB / 20000 file; nessuna snapshot coerente con altri programmi che scrivono nel workspace. Per progetti più grandi usare backup di volume a servizi fermi.
- Il worker accetta due ricette fisse; richiede immagini già presenti e percorsi host corretti. Il worker e il browser devono ancora essere provati realmente.
- Git rifiuta worktree collegati, configurazioni include e object alternates. Non esegue fetch, push, hook o diff esterni.
- Le modifiche multifile sono sequenziali: mostrare e controllare i risultati parziali. Nessun rollback automatico del gruppo.
- Non sono stati eseguiti benchmark: i profili sono impostazioni, non promesse di prestazioni.
