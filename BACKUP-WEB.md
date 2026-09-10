# Jenny Web — backup, ripristino e rollback

Dalla 0.9 sono inclusi anche riepiloghi chat e memoria progetto nel database. I volumi Docker separati del laboratorio `jenny-lab-*` NON sono inclusi: fermare i job e farne un backup separato come indicato in LAB-WEB.md.

La 0.5 usa Node 24 e SQLite (`web-data/jenny.sqlite`, `/data/jenny.sqlite` in Docker). Le chat JSON delle versioni precedenti vengono importate una sola volta e lasciate intatte. Dopo la migrazione SQLite è la fonte corrente: modificare i vecchi JSON non aggiorna le chat.

Dalla 0.7 il backup include anche `accounts.sqlite` e le directory nascoste `.users` di tutti gli account. Contiene hash password, chat e possibili credenziali plugin in chiaro: proteggerlo. Il ripristino multiutente è verificato con login e file; l'export browser contiene soltanto le chat dell'utente autenticato. Per tornare alla 0.6 usare una copia del backup precedente all'upgrade: la vecchia versione non comprende i nuovi account.

## Backup completo, standalone

Fermare Jenny **e ogni altro programma che scrive nei workspace**. Il backup legge dati, storia file e workspace, inclusi binari, Git e cartelle vuote. Non segue symlink: se ne trova uno, si ferma esplicitamente. Il file può contenere materiale privato presente nei workspace; conservarlo come un backup personale.

```sh
node web/scripts/backup.cjs create ./web-data ./workspaces ./jenny-backup.jenny.gz
```

Il file di uscita deve essere nuovo e fuori dalle directory sorgenti. Limite: 128 MiB di contenuto / 20000 file / 20000 cartelle. Per progetti più grandi usare un backup dei volumi a servizi fermi. Questa utility non sostituisce un sistema di backup pianificato.

## Con Docker Compose

Dalla cartella del progetto, con una directory `backups` scrivibile dall'UID 1000:

```sh
mkdir -p backups
docker compose stop jenny-web
docker compose run --rm --no-deps -v "$PWD/backups:/backup" --entrypoint node jenny-web web/scripts/backup.cjs create /data /workspaces /backup/jenny-backup.jenny.gz
docker compose up -d jenny-web
```

Il server deve terminare correttamente prima della copia. Il comando `run` riutilizza i volumi di Compose e avvia solo l'utility. Questi comandi sono predisposti ma non sono stati eseguiti con Docker nell'ambiente di sviluppo.

## Ripristino, senza sovrascrivere dati esistenti

```sh
node web/scripts/backup.cjs restore ./jenny-backup.jenny.gz ./jenny-restored
```

Il ripristino verifica formato, percorsi e checksum; rifiuta una destinazione già esistente. Crea `jenny-restored/data` e `jenny-restored/workspaces`. Per provarla standalone:

```sh
DATA_DIR="$PWD/jenny-restored/data" WORKSPACES_DIR="$PWD/jenny-restored/workspaces" node web/server.cjs
```

Con Compose si può eseguire l'utility nel container:

```sh
docker compose run --rm --no-deps -v "$PWD/backups:/backup" --entrypoint node jenny-web web/scripts/backup.cjs restore /backup/jenny-backup.jenny.gz /backup/restored
```

Poi configurare i due bind mount verso `backups/restored/data` e `backups/restored/workspaces`, conservando i volumi originali finché il recupero non è stato controllato. Le proposte pendenti non vengono applicate automaticamente al riavvio.

## Lock di servizio

L'entrypoint e l'utility acquisiscono `.jenny-active` dentro la directory dati. Un secondo avvio o un backup concorrente viene bloccato. L'arresto normale libera il lock. Dopo SIGKILL o spegnimento improvviso può rimanere: **verificare che nessun processo/container Jenny usi quei dati**, quindi rimuovere soltanto quella directory di lock. Non cancellare il database o i file WAL per forzare l'avvio.

## Tornare alla 0.4

La via più semplice è conservare un backup completo precedente all'aggiornamento. Per esportare anche le conversazioni successive nel formato JSON legacy, con Jenny fermo:

```sh
node web/scripts/export-legacy.cjs ./web-data ./sessions-legacy
```

L'utility crea una directory nuova, senza modificare SQLite. Chiude i tool pendenti e rimuove le proposte, affinché la vecchia versione non esegua un'operazione che non comprende. Usare questa directory come `sessions` in una **copia separata** dei dati per la 0.4. La storia file della 0.4 rimane compatibile; i file del workspace vanno recuperati separatamente dal backup scelto.

L'export JSON dal browser contiene le chat, non tutti i file. Il ripristino completo usa il pacchetto `.jenny.gz` e l'utility sopra.

Riferimento implementativo: [SQLite integrato in Node](https://nodejs.org/api/sqlite.html). I test coprono migrazione una tantum, rollback di transazioni e ripristino di dati effettivi.
