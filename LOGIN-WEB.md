# Login locale e multiutente — 0.7.0

Accesso con nome utente e password per uso personale in LAN. Nessuna API key da incollare nel browser, registrazione pubblica, email, MFA o identità esterna. Massimo 20 account: un amministratore iniziale e utenti normali creati dalla GUI.

## Primo avvio o aggiornamento dalla 0.6

Fermare il worker e fare prima un backup completo: BACKUP-WEB.md. Conservare la stessa cartella/nome progetto Compose, i volumi e il proprio `.env`: una cartella diversa può creare volumi nuovi e far sembrare mancanti i dati.

Dalla cartella del progetto aggiornato, in un terminale interattivo:

```sh
docker compose build jenny-web
docker compose stop jenny-web
docker compose run --rm --no-deps --entrypoint node jenny-web web/scripts/account.cjs init admin --adopt-existing
docker compose up -d jenny-web
```

Scegliere la password ai due prompt: non viene mostrata né inserita nella cronologia comandi o nel `.env`. Il nome `admin` è modificabile. `--adopt-existing` assegna esplicitamente chat, workspace e plugin precedenti al primo amministratore, senza spostare o cancellare file. Assegnazione e account sono creati nella stessa transazione SQLite. Il comando rifiuta una seconda inizializzazione e non funziona mentre Jenny usa i dati.

Aprire Jenny e accedere. **Account → Utenti** crea/disattiva/riattiva gli altri account; **Cambia password** modifica la propria password; **Esci** termina la sessione. Senza primo admin la pagina mostra le istruzioni e le risorse private restano inaccessibili. Non esiste registrazione via rete.

Senza Docker, con Jenny fermo:

```sh
node web/scripts/account.cjs init admin --adopt-existing
node web/server.cjs
```

Usare lo stesso `DATA_DIR` per entrambi. Il CLI non carica automaticamente `.env`; Node 24 può farlo con `--env-file=.env`.

## Configurazione

- `JENNY_TOKEN` non è più usato per accedere e può essere rimosso.
- `JENNY_COOKIE_SECURE=false` per HTTP in LAN; `true` solo con accesso browser HTTPS. Abilitarlo su HTTP LAN impedisce il login.
- `JENNY_WORKER_TOKEN`: segreto casuale separato, almeno 24 caratteri, solo per il worker opzionale. Impostare lo stesso valore sul server e sul worker aggiornato. Non è una password utente e non concede accesso alle chat. Vedere RUNNER-WEB.md.
- Ollama e SearXNG restano condivisi e configurati in `.env`. Conservare `SEARXNG_BASE_URL=http://192.168.10.250:8081` e consenso LAN se corrispondono alla propria installazione.

## Dati e permessi

Il primo admin continua a usare le directory precedenti. Gli altri utenti hanno archivi in `/data/.users/ID` e workspace in `/workspaces/.users/ID`, con ID assegnati dal server. Account e hash sono in `/data/accounts.sqlite`.

Chat, streaming, file, cronologia, istruzioni, Git read-only, export e credenziali plugin sono separati. Due utenti possono avere progetti omonimi. L'amministrazione gestisce account, non legge chat altrui; chi controlla il server e i volumi può comunque leggerle.

Terminale/runner e MCP su reti private sono riservati all'admin. Gli utenti normali possono usare Web e MCP pubblici. SearXNG LAN è un'eccezione amministrativa fissa, non un permesso generale di navigare in LAN. Coda Ollama condivisa, massimo due turni attivi per account. Non ci sono quote disco o isolamento di processo per utente: usare account fidati.

## Password e sessioni essenziali

Hash scrypt con salt casuale (N=131072, r=8, p=1), non cifratura reversibile. Cookie HttpOnly/SameSite=Strict, controllo origine/CSRF, massimo 10 tentativi login al minuto per indirizzo. Sessioni di 8 ore, solo in memoria: al riavvio serve un nuovo login. Cambio password revoca tutti gli accessi dell'account; disattivazione revoca accessi e interrompe turni in esecuzione o attesa. Operazioni già approvate/inviate a servizi esterni non possono essere annullate retroattivamente.

Le credenziali di sessione non vengono salvate nelle preferenze browser; bozze e preferenze personali vengono pulite al cambio account e le altre schede rimandate al login. Dati già letti/scaricati non sono revocabili. Su HTTP password e messaggi viaggiano senza cifratura: usare solo LAN fidata o HTTPS. Non esporre direttamente Jenny a Internet: non è un servizio pubblico né un audit di sicurezza.

## Recupero password dal server

```sh
docker compose stop jenny-web
docker compose run --rm --no-deps --entrypoint node jenny-web web/scripts/account.cjs reset-password admin
docker compose up -d jenny-web
```

Sostituire `admin` con il nome dell'account. La nuova password viene chiesta senza mostrarla; chat e file non vengono eliminati. Nessun recupero via email.

## Backup e rollback

Il backup offline comprende account e tutti gli archivi `.users`; proteggerlo perché contiene materiale privato e possibili credenziali plugin in chiaro. Il ripristino crea una directory nuova mantenendo i proprietari; verificato con login e file.

Per tornare alla 0.6 usare una copia del backup precedente e ripristinare il token richiesto da quella versione. Le versioni precedenti non comprendono i nuovi account: non puntarle ai volumi multiutente aspettandosi la stessa separazione.

Se hai creato manualmente account sperimentali con il modulo inattivo 0.6.2, l'assenza di proprietà legacy viene rifiutata: conservare il backup e risolvere esplicitamente l'assegnazione, senza cancellare il database.
