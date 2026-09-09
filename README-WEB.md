# Jenny Web 0.5.0 — Ollama workbench IT/EN

Webapp di coding per Linux/Docker, derivata da [Jenny di SaltyPretz3l](https://github.com/SaltyPretz3l/jenny). Chat, workspace, editor e agente con approvazioni. Il runtime non usa Electron, VNC, Python o dipendenze npm esterne.

**Questa release privilegia Ollama.** L'API OpenAI-compatible rimane disponibile per LocalAI e altri server.

## Avvio rapido: Ollama che hai già

Dalla cartella estratta:

```sh
./start-web.sh
```

Lo script controlla Docker e Compose, crea `.env` con un token casuale se non esiste e avvia la build. Non sovrascrive una configurazione esistente, non scarica modelli e non cambia il tuo Ollama.

La configurazione iniziale cerca Ollama sul server Linux attraverso `http://host.docker.internal:11434`. Ollama deve ascoltare su un'interfaccia raggiungibile dai container: se è limitato a `127.0.0.1` dell'host, il solo alias Docker non basta. Se Ollama è su un altro host usa il suo indirizzo LAN; se è un container sulla stessa rete usa nome servizio e porta interna.

Per aprire Jenny da telefono o PC nella LAN modifica `.env`:

```dotenv
JENNY_BIND=0.0.0.0
LLM_PROVIDER=ollama
LLM_BASE_URL=http://host.docker.internal:11434
```

Poi:

```sh
docker compose up -d --build
```

Apri `http://IP_DEL_SERVER:3000`. Nella schermata **Connessione** incolla il valore `JENNY_TOKEN` presente in `.env`, scegli un modello già installato e inizia una chat. Il bind iniziale `127.0.0.1` consente invece solo l'accesso locale al server.

Il token Jenny resta nel session storage della scheda. L'eventuale chiave LLM resta sul server. Non pubblicare `.env` nel repository. Per reti non fidate usa HTTPS dietro reverse proxy; il servizio è progettato per un solo utente fidato.

## Novità della 0.5

Sono implementati i 14 interventi della tranche: contesto limitato, chat archiviate e ricercabili, frontend separato in moduli, SQLite, Git read-only, runner opzionale, allegati, profili, indicatore contesto, istruzioni progetto, approvazioni multifile, diagnostica, backup e accessibilità.

- **Strumenti progetto** apre istruzioni, diagnostica, Git, test isolati e export.
- **JENNY.md** contiene fino a 6000 caratteri di indicazioni per i nuovi turni. La modifica passa attraverso cronologia e controllo conflitti. Il testo scelto viene conservato nella sessione e non riletto a metà turno.
- **Allega testo** prende fino a 5 file UTF-8, per un massimo totale di 12000 byte. Puoi aggiungere anche il file aperto e rimuovere singoli allegati. Non vengono caricati nel workspace; il contenuto entra nella chat. Il messaggio con allegati resta limitato a 16000 caratteri. La selezione non inviata è temporanea nella pagina, separata per chat.
- **Profili Ollama:** server usa `.env`; leggero 4096/1024 token e keep-alive 5m; bilanciato 8192/2048 e 10m; esteso 16384/4096 e 10m. Si applicano alla chat senza cambiare le impostazioni degli altri turni. Gli altri parametri restano quelli del server. Sono impostazioni da misurare sul proprio hardware.
- **Contesto stimato** mostra l'ultima richiesta, il budget input e i turni esclusi. I token misurati dal provider sono mostrati separatamente. La barra non è una previsione esatta del messaggio ancora da inviare.
- **Chat archiviate** mantiene i dati e impedisce nuovi invii finché non ripristini la chat. La ricerca comprende titolo e contenuto; l'export non cancella nulla.
- **Modifiche multifile:** il modello può proporre fino a 8 file, 256 KiB complessivi. Confrontali e seleziona quelli da applicare. Il salvataggio è sequenziale: ogni file può riuscire, essere rifiutato o andare in conflitto. I risultati restano nella chat; non esiste un rollback automatico del gruppo.
- **Git** offre stato, diff, staging e cronologia. Non esegue fetch/push/hook. Richiede un repository `.git` ordinario; linked worktree, include di configurazione e object alternates non sono supportati.
- **Test isolati** richiede il worker separato descritto in `RUNNER-WEB.md`. Nessun Docker socket nel server web e nessun terminale al modello.
- **Backup completo** e downgrade: `BACKUP-WEB.md`. L'export dal browser contiene le chat; l'utility offline include anche workspace e cronologia file.

Per aggiornare: fare prima un backup a Jenny fermo. La migrazione importa i vecchi JSON in SQLite una sola volta e li conserva. **Serve Node 24**; anche il Dockerfile passa a Node 24 e include Git. Un solo processo per directory dati, protetto da lock nell'entrypoint.

## Lingue e continuità

La GUI offre italiano e inglese dal selettore in alto, con preferenza conservata nel browser. La lingua scelta viene inviata anche ai nuovi turni del modello. File, messaggi precedenti e nomi personali restano integri; le diagnostiche grezze dei provider possono mantenere la lingua originale.

Workspace e ultima chat vengono ricordati nel browser. Le bozze del messaggio sono separate per chat e conservate nella stessa scheda fino all'invio. La connessione eventi tenta di ripristinarsi con attese progressive, mantenendo il polling di ripiego. Questi flussi richiedono ancora un collaudo interattivo.

`ROADMAP.md` registra attività concluse, stato delle verifiche, priorità e criteri di completamento. `AGENTS.md` indica come riprendere il lavoro e aggiornare il registro. La 0.4 ha aggiunto la cronologia file; la 0.5 implementa gli interventi autorizzati. La priorità successiva è il collaudo integrato nell’ambiente reale.

Per modificare le traduzioni, aggiornare `web/public/locales.json` e rigenerare il runtime:

```sh
npm --prefix web run build:i18n
```

## Cosa cambia nella 0.2

- GUI ridisegnata, tema chiaro/scuro, pannelli ridimensionabili e viste chat/file sui dispositivi più piccoli.
- Risposte progressive dal modello al browser; ripiego sul controllo periodico se il canale eventi si interrompe.
- Editor con numeri di riga, indentazione, scorciatoie, anteprima con evidenziazione sintattica di base e salvataggi protetti da conflitti.
- Ricerca testuale e per nome nel workspace, con apertura del risultato alla riga indicata.
- Revisione per righe aggiunte/rimosse o confronto completo prima/dopo.
- Blocchi di codice nella chat con copia; titoli e paragrafi Markdown di base. Nessuna esecuzione di HTML generato.
- Esportazione JSON e rinomina delle conversazioni.
- API nativa Ollama, verifica delle capacità del modello, modelli caricati e VRAM riportata da Ollama, tempi e token/s quando disponibili.
- I cinque tool della 0.2: elenco, lettura per intervalli, ricerca, modifica mirata e scrittura completa.
- Budget del contesto per Ollama e inferenze serializzate nella singola istanza Jenny.
- Correzione della cronologia dei tool e tolleranza alle sessioni storiche incomplete della 0.1.

## Ollama: impostazioni iniziali

| Variabile | Predefinito | Effetto |
| --- | --- | --- |
| `LLM_PROVIDER` | `ollama` | Usa `/api/chat`, `/api/tags`, `/api/show`, `/api/ps` |
| `LLM_BASE_URL` | `http://host.docker.internal:11434` in Docker | Server Ollama; sono accettati anche suffissi `/v1` o `/api` |
| `LLM_MODEL` | vuoto | Modello selezionabile dalla schermata |
| `LLM_STREAMING` | `true` | Streaming nativo NDJSON; `false` per risposte complete |
| `LLM_TIMEOUT_MS` | `300000` | Timeout totale della richiesta, caricamento incluso |
| `OLLAMA_NUM_CTX` | `8192` | Finestra di contesto richiesta |
| `OLLAMA_NUM_PREDICT` | `2048` | Limite dell'output, non superiore a metà contesto |
| `OLLAMA_TEMPERATURE` | `0.2` | Impostazione iniziale per risposte di coding |
| `OLLAMA_KEEP_ALIVE` | `10m` | Permanenza del modello in memoria dopo la richiesta |
| `OLLAMA_THINK` | `auto` | Non forza il thinking; override solo se il modello dichiara supporto |

I valori sono configurabili in `.env`; applicali con `docker compose up -d`. Nessun benchmark sul tuo hardware è stato eseguito: non sono una promessa di velocità o di occupazione VRAM.

Per ridurre l'impegno di memoria parti da `OLLAMA_NUM_CTX=4096` e `OLLAMA_NUM_PREDICT=1024`. Per più contesto prova 16384/4096 solo dopo aver verificato memoria e supporto del modello. Non viene forzata una quantizzazione o una modalità GPU.

`OLLAMA_THINK` accetta `auto`, `false`, `true`, `low`, `medium`, `high`: valori e utilità dipendono dal modello. Non viene inviato a modelli che non dichiarano la capacità `thinking`. Se un modello non dichiara `tools`, Jenny blocca la modalità Agente con un messaggio chiaro; puoi disattivarla e continuare in chat.

La serializzazione riguarda le richieste partite da questa istanza Jenny, non altri client di Ollama. Un modello tenuto in memoria per 10 minuti può contendere VRAM ad altri tuoi servizi: riduci `keep_alive` se preferisci liberarla prima.

Il budget usa una **stima in byte**, non il tokenizer del modello. Riserva spazio all'output, elimina dal prompt soltanto turni precedenti interi e conserva la chat completa. Il numero dei turni esclusi è visibile nel dettaglio delle metriche. Se il turno corrente è già troppo grande, viene fermato con indicazione di leggere meno righe o aumentare il contesto. Non viene generato un riassunto automatico e il modello non vede i turni esclusi.

## Se vuoi avviare anche un nuovo Ollama

Questa opzione è separata dal collegamento al tuo Ollama esistente:

```sh
# Prepara prima .env con token, come nell'avvio rapido.
docker compose -f compose.yaml -f compose.ollama.yaml up -d --build
# Sostituisci NOME_MODELLO con un modello che vuoi installare:
docker compose -f compose.yaml -f compose.ollama.yaml exec ollama ollama pull NOME_MODELLO
```

Il modello scaricato è conservato nel volume `ollama-models`. Non viene pubblicata la porta Ollama sull'host. Il file opzionale parte su CPU; per una GPU NVIDIA con NVIDIA Container Toolkit già configurato:

```sh
docker compose -f compose.yaml -f compose.ollama.yaml -f compose.gpu.yaml up -d --build
```

Usa la stessa combinazione di file anche per logs/down/aggiornamenti. L'immagine opzionale usa `ollama/ollama:latest`; puoi fissare un tag o digest con `OLLAMA_IMAGE` in `.env`. Questa integrazione Docker non è stata avviata nell'ambiente di sviluppo.

## LocalAI / altro endpoint OpenAI-compatible

```dotenv
LLM_PROVIDER=openai
LLM_BASE_URL=http://host.docker.internal:8888/v1
LLM_API_KEY=
LLM_STREAMING=true
```

Le opzioni `OLLAMA_*` non si applicano a questo provider. Se il server non accetta streaming imposta `LLM_STREAMING=false`. Se `/models` manca, puoi digitare il nome del modello. La GUI indica separatamente l'accessibilità del server e la disponibilità del modello.

## Workspace e dati

| Volume / directory | Uso |
| --- | --- |
| `jenny-data` → `/data` | SQLite, cronologia file e JSON legacy conservati |
| `jenny-workspaces` → `/workspaces` | Progetti, ciascuno in una sottocartella |

Per usare directory reali sul server sostituisci il volume dei workspace con:

```yaml
volumes:
  - jenny-data:/data
  - /docker/stacks/jenny-web/workspaces:/workspaces
```

Esempio progetto: `/docker/stacks/jenny-web/workspaces/mio-progetto`. I nomi workspace usano lettere, numeri, `-`, `_`. Il processo gira come UID/GID 1000: assegna a quell'utente i permessi della sola cartella dedicata. Non montare il filesystem intero o il Docker socket.

Fai backup di entrambi i volumi. `docker compose down` li mantiene; `down -v` li elimina. Per aggiornare dalla 0.1 conserva `.env` e gli stessi nomi progetto/volumi; scegli esplicitamente `LLM_PROVIDER=openai` se il vecchio endpoint era LocalAI.

Le letture dell'agente sono automatiche nel workspace della conversazione. Ogni `write_file`, `edit_file` o `write_files` aspetta approvazione, con revisione del file verificata al momento del salvataggio. Il pulsante manuale **Salva** applica direttamente la modifica richiesta nell'editor. Nessun comando shell è disponibile al modello.

## Scorciatoie

| Tasti | Azione |
| --- | --- |
| Ctrl/Cmd + Invio | Invia il messaggio |
| Ctrl/Cmd + S | Salva il file modificato |
| Ctrl/Cmd + P | Cerca nel progetto |
| Tab nell'editor | Inserisce due spazi |
| Frecce sul separatore | Ridimensiona il pannello file |

## Sviluppo e test

Node.js 24 o superiore; nessun `npm install` necessario:

```sh
node web/server.cjs
node --test web/test/*.test.cjs
```

L'avvio senza Docker usa `127.0.0.1:3000`, `./web-data`, `./workspaces` e Ollama locale sulla porta 11434. Per caricare `.env`: `node --env-file=.env web/server.cjs`, adattando l'endpoint a `127.0.0.1` anziché al nome Docker. Il bind standalone è `HOST`; un bind di rete richiede il token.

Non usare gli script npm nella radice: appartengono al prodotto desktop originale. Gli ingressi web sono in `web/`. Il formattatore è stato usato solo durante lo sviluppo, non è una dipendenza runtime.

## Verifica e limiti

La release ha **47 test superati** di integrazione su HTTP reale, filesystem temporaneo e provider simulati sia OpenAI SSE sia Ollama NDJSON. Sono verificati anche contesto, frammenti Unicode, tool in streaming, approvazioni, rifiuti, conflitti, stop e conservazione della cronologia.

**Non verificati qui:** avvio Docker, prestazioni/qualità di un modello reale, interazione in un browser e resa visuale sui dispositivi. Il runtime di test e l’immagine usano Node 24. Nessun URL pubblico è stato creato.

Limiti: un utente fidato e un processo Node per i dati; editor leggero; file di testo fino a 256 KiB; ricerca limitata a 400 file/100 cartelle/100 risultati GUI (40 per il tool)/3 secondi, massimo 5 corrispondenze di contenuto per file; 12 passaggi LLM e 8 tool per risposta. La ricerca ignora le directory di dipendenze/build più comuni e può segnalare risultati incompleti. Non è un IDE completo, un ambiente multiutente o una sandbox contro processi ostili sull'host. Niente terminale al modello, Git push/PR, MCP o download modelli dalla GUI. L’esecuzione di test è opzionale e manuale tramite il worker isolato.

Se il server si arresta durante una scrittura, controlla il file prima di riprovare. Le proposte in attesa restano pendenti; i turni interrotti non vengono rieseguiti automaticamente. Durante la prima migrazione i JSON illeggibili vengono conservati e segnalati nei log; non vengono importati. Dopo la migrazione le chat correnti risiedono in SQLite.

## Provenienza

Baseline Jenny: `46ab97a98f740975c36732f335cca1d43847dca1`. Licenza MIT e NOTICE preservati. Il pacchetto comprende l'intero sorgente originale, ma il runtime web riutilizza solo servizi indipendenti dal desktop. Dettagli storici in `ANALISI-JENNY-WEB.md`, cambiamenti attuali in `RELEASE-WEB-0.5.0.md`.

Riferimenti del protocollo: [Ollama chat](https://docs.ollama.com/api/chat), [tool calling](https://docs.ollama.com/capabilities/tool-calling), [modelli disponibili](https://docs.ollama.com/api/tags), [modelli caricati](https://docs.ollama.com/api/ps).

## Cronologia file (0.4)

Il pulsante **Cronologia file** confronta il contenuto aperto con una copia precedente. **Carica nell’editor** prepara il ripristino: controllalo e premi **Salva** per applicarlo. Le modifiche non salvate richiedono conferma prima di essere sostituite. Se il file è cambiato sul server, il normale controllo dei conflitti blocca il salvataggio.

Ogni sovrascrittura tramite Jenny conserva prima il contenuto precedente in `/data/file-history` (standalone: `web-data/file-history`). Sono mantenute al massimo 30 copie per percorso: quelle più vecchie vengono eliminate. Includere questa cartella nel backup dei dati. Non esiste ancora un limite complessivo di spazio. La prima creazione non ha una versione precedente. Le modifiche fatte da programmi esterni non vengono monitorate e il ripristino non elimina file.

Se la copia non può essere salvata, Jenny blocca la scrittura. Una copia può restare anche quando la scrittura successiva fallisce: rappresenta il contenuto letto prima del tentativo, non un registro di operazioni riuscite. Non sostituisce un backup esterno. La GUI della cronologia attende collaudo interattivo.

## Letture per il modello

`read_file` conserva il limite 400 righe e aggiunge `start_char` e `max_chars` (massimo 12000). L’agente limita ulteriormente la risposta in funzione del profilo: il valore predefinito è al massimo 8000 caratteri. `nextStartChar` consente di continuare anche una singola riga enorme senza spezzare un carattere Unicode; `truncated` segnala esplicitamente l’omissione. Per la pagina successiva mantenere lo stesso intervallo di righe. Le normali letture dell’editor restano complete fino a 256 KiB.

Il troncamento della ricerca indica che non tutti i risultati sono stati restituiti. Gli snippet sono centrati vicino alla corrispondenza, non all’inizio della riga. Nessuna di queste scelte sostituisce il tokenizer del modello.
