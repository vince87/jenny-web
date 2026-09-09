# Validazione Jenny Web 0.7.0

Suite locale Node 24: **65 test, 63 superati, 2 POSIX esclusi su Windows, zero fallimenti**. Copertura aggiunta: primo avvio chiuso, cookie/CSRF/origine, tentativi login, isolamento A/B di file/chat/export/plugin/worker, revoca SSE, password/logout/disabilitazione/riavvio, recupero password e backup/ripristino completo multiutente. Una precedente esecuzione ha incontrato una porta effimera vietata da Fetch: corretto l'allocatore del fixture di integrazione; suite rieseguita.

Browser desktop con dati fittizi locali: login admin IT, lista utenti, logout; login utente normale EN, assenza gestione utenti, logout. Layout login osservato. Non verificati cambio password/creazione utenti tramite interazione browser, mobile, più schede simultanee o flusso completo agente su modello reale: queste funzioni hanno controlli HTTP/statici dove indicato.

[CI Docker 34388617707](https://github.com/vince87/jenny-web/actions/runs/34388617707), revisione `a9c6ebf`: **65/65 test superati, zero fallimenti o esclusioni**. Build Linux, worker reale non-root/offline/source read-only, inizializzazione offline di account fittizio, login/accesso workspace/logout prima e dopo riavvio e persistenza riusciti. Le revisioni successive di questa release aggiornano soltanto documentazione. Non è stato aggiornato il server domestico; nessun modello reale eseguito in questo collaudo.

## Evidenza storica 0.6.2

Pulizia e formattazione: suite locale su Node 24 con 60 test, 58 superati e 2 POSIX esclusi su Windows; zero fallimenti. Inclusi due test del nuovo componente account con hash reali e database temporanei. Login non collegato alle route: questi test non verificano ancora isolamento HTTP multiutente o GUI login.

[CI Docker 34374416759](https://github.com/vince87/jenny-web/actions/runs/34374416759), revisione `c3a5944`: **60 test eseguiti e superati, zero falliti/esclusi**, build, worker reale, Compose e persistenza riusciti. Formattazione verificata con `npm run format:check`. Le modifiche successive riguardano configurazione repository e documentazione, non logica applicativa.

## Evidenza storica 0.6.1

2026-09-09: **58 test locali, 56 superati, 2 POSIX esclusi su Windows, zero fallimenti**. Quattro nuovi test coprono SearXNG/configurazione ambiente, parsing, rete e assenza di fallback. Richiesta read-only al SearXNG indicato: HTTP 200, JSON con 14 risultati. La raggiungibilità dal container sul server resta da verificare. Nessuna impostazione del server SearXNG è stata modificata.

## Validazione precedente 0.6.0

Esito definitivo 0.6.1: [CI Docker 34344372991](https://github.com/vince87/jenny-web/actions/runs/34344372991), revisione `d0fafeb`: **58/58 test superati, zero falliti/esclusi**, build, worker reale, Compose e persistenza riusciti. Anche il nuovo adapter Jenny è stato provato in sola lettura contro il SearXNG dell'utente: 5 risultati normalizzati correttamente. I commit successivi aggiornano solo questa evidenza documentale.

2026-09-09, Windows / Node 24.14.0: **54 test, 52 superati, 2 POSIX esclusi, zero fallimenti**. Test plugin, revoca e approvazioni, MCP HTTP JSON/SSE/paginazione/cleanup, isolamento terminale, protezioni URL e indicatore thinking.

Docker reale su GitHub Actions: build, Compose, health, utente non-root e persistenza dopo riavvio riusciti. Il worker esegue realmente un comando: verifica rete limitata a loopback, sorgenti e root read-only, scritture temporanee senza modifica dell'originale. [Run con smoke test Docker riuscito](https://github.com/vince87/jenny-web/actions/runs/34343068821). Quel run NON verifica la suite: i test erano esclusi dall'immagine. La CI corretta monta esplicitamente i test e ne richiede la presenza; l'esito completo è riportato separatamente sotto.

Prova esterna read-only: lettura di example.com riuscita; DuckDuckGo risponde HTTP 202 anti-bot. Ricerca Brave implementata ma non verificata con chiave reale. MCP testato contro server HTTP simulato, non un servizio terzo. Pagina iniziale caricata in browser, nuovo pulsante visibile nell'albero accessibile; nessun collaudo interattivo completo. Gli altri test UI usano DOM simulato. Nessun accesso al server di casa.

## Validazione storica 0.5.0 (non attribuire questi risultati alla 0.6)

La validazione definitiva della **0.6** è [il run 34343263897](https://github.com/vince87/jenny-web/actions/runs/34343263897), revisione `cfdac9a`: **54 test eseguiti, 54 superati, zero falliti, zero esclusi**, più smoke terminale Docker e Compose riusciti. Le modifiche successive a questa verifica riguardano solo la documentazione.

---

Esecuzione UTC: 2026-09-08T22:52:43.722968+00:00

**47 test superati, zero falliti.** Runtime Node 24.19.0. Comando: `node --test web/test/*.test.cjs`.

## Evidenza effettiva

- Server HTTP reale con autenticazione, origini, chat e tool; filesystem temporaneo reale.
- Letture Unicode limitate e ripresa di righe enormi; snippet ricerca centrati.
- SQLite: import legacy una volta, salvataggio, rollback transazione, riapertura ed export per downgrade senza modificare il database.
- Backup reale compresso: SQLite, cronologia file, binari e cartelle vuote; ripristino verificato, rifiuto di traversal, checksum errato e destinazione già esistente.
- Istruzioni progetto e allegati nel prompt; ricerca/archiviazione/ripristino chat via HTTP.
- Multifile: approvazione selettiva, rifiuto, conflitto, risultati parziali e monouso.
- Git reale: stato, diff e log su repository temporaneo; programma diff esterno configurato non eseguito.
- Runner: conferma richiesta, lease monouso, percorsi/ricette e parametri di isolamento controllati. Nessun Docker eseguito.
- Profili Ollama: parametri trasmessi attraverso adapter nativo simulato, senza alterare default condivisi.
- Frontend: cataloghi IT/EN, riferimenti e caricamento dei moduli nell’ordine HTML su DOM simulato, collegamento dei controlli e rifiuto di risposte obsolete. Non è una prova browser.
- Entry point reale in un processo Node separato: secondo avvio rifiutato, SIGTERM e rilascio lock verificati.
- Sintassi JavaScript, riferimenti locali agli asset e `git diff --check`.

## Prove non eseguite

Docker assente: nessuna build/avvio dell’immagine né esecuzione delle ricette del worker. Nessun modello Ollama reale, benchmark hardware o collaudo visuale/interattivo in browser. La migrazione a Node 24 e l’installazione di Git nel Dockerfile devono essere collaudate sull’host. I provider nei test sono simulati.

La roadmap separa questi limiti dai 14 interventi implementati. Non qualificare la release come pronta per produzione.

## Output della suite

```text
✔ History: retention, restart, isolation and conflict-safe restoration (269.146496ms)
✔ IT/EN: cataloghi completi, fallback e scelta lingua esplicita (1.803604ms)
✔ Il runtime generato coincide con il catalogo canonico (0.653437ms)
✔ Markup: tutte le chiavi annotate e i riferimenti dinamici hanno traduzione (3.97927ms)
✔ Localizzazione esplicita: non riscrive contenuto di file o chat (0.214524ms)
✔ Bundle disponibile anche come script browser senza dipendenze (1.783033ms)
✔ HTTP: pagina reale, asset, health, autenticazione e origini (91.454165ms)
✔ File: creazione, lettura, modifica, conflitto e separazione workspace (56.201558ms)
✔ Confini filesystem: traversal, .git, symlink, binari, limite dimensioni (34.999539ms)
✔ Chat semplice e modalità senza tool (13.314531ms)
✔ Agente: lettura automatica, scrittura bloccata, approvazione e continuazione (59.157803ms)
✔ Rifiuto: nessun file scritto e decisione comunicata al modello (53.376692ms)
✔ Approvazione obsoleta: preserva una modifica manuale intervenuta nel frattempo (50.140513ms)
✔ Stop di approvazione pendente: nessuna modifica e transcript valido (58.065197ms)
✔ Tool sconosciuto e JSON malformato producono errori gestiti (25.716853ms)
✔ Persistenza: conversazioni e approvazioni recuperate senza eseguire scritture (29.033613ms)
✔ Riavvio durante un turno: marca errore e chiude i tool senza ripeterli (4.608872ms)
✔ Stop durante la richiesta LLM abortisce il turno senza scrivere file (26.270259ms)
✔ Envelope tool non valido termina in errore controllato (9.022423ms)
✔ Conflitto tra due salvataggi concorrenti: un solo vincitore (12.103571ms)
✔ Ricerca e modifica mirata: frammento unico, diff approvato e resto invariato (71.701945ms)
✔ Edit ambiguo non produce proposta né modifica (33.792101ms)
✔ Eventi SSE autenticati: snapshot e aggiornamento del titolo (12.141478ms)
✔ Lingua inglese: errori API, titolo iniziale e istruzione modello (37.183658ms)
✔ History HTTP: authenticated list, preview and editor restore (24.865177ms)
✔ Workspace instructions, attachments and archive/search are integrated in HTTP turns (46.789462ms)
✔ Multi-file approval makes separate decisions, respects conflicts and cannot be reused (68.788611ms)
✔ OpenAI SSE: chunk spezzati, Unicode, tool frammentati e usage (46.096466ms)
✔ OpenAI SSE incompleto non autorizza alcun tool (15.711741ms)
✔ Ollama nativo: opzioni, tools, thinking, metriche e round trip approvazione (70.94391ms)
✔ Ollama senza tools: errore chiaro prima della generazione (4.152682ms)
✔ Ollama serializza inferenze concorrenti (105.920254ms)
✔ Budget contesto elimina solo turni completi e conserva i risultati tool (0.467957ms)
✔ Diff ricostruisce entrambi i file e highlighter neutralizza HTML (1.386163ms)
✔ Vecchie sessioni 0.1: risultati orfani adattati senza alterare il salvataggio (0.142935ms)
✔ Ollama: annullamento di una richiesta in coda non avvia una seconda inferenza (87.707716ms)
✔ Bounded Unicode reads can resume giant lines without loss; search centers matches (81.487671ms)
✔ SQLite imports legacy once and transaction failures roll back (5.214566ms)
✔ Full backup restores SQLite, history, binary files and empty directories; unsafe restores fail (37.834166ms)
✔ Git view reports real changes and never invokes configured external diff (38.79049ms)
✔ Runner requires approval and single-use lease; Docker command restricts network and mounts (4.259684ms)
✔ Request generations reject stale responses across files and workspace switches (0.343619ms)
✔ Ollama profiles are per request and leave server defaults unchanged (0.234925ms)
✔ Frontend modules load in HTML order and bind controls without missing IDs (10.018642ms)
✔ Native Ollama applies independent profile settings on the wire (6.544455ms)
✔ Legacy downgrade export closes pending tool calls without changing SQLite (107.874932ms)
✔ Server entrypoint rejects concurrent data use and releases its lock on shutdown (3156.960873ms)
ℹ tests 47
ℹ suites 0
ℹ pass 47
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 3563.030997

```
