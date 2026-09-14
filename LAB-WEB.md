# Laboratorio persistente

Il plugin **Lab** (`@sandbox`) usa dalla 0.10 il worker containerizzato incluso nel profilo Compose `lab`. Solo admin. Ogni comando richiede approvazione e viene eseguito nel container non-root, con root read-only, capability rimosse e nessun Docker socket. Non è una VM o un audit contro codice ostile.

Preparazione, sul server, dalla nuova cartella sorgente:

```sh
docker compose --profile lab up -d --build
```

Impostare prima `JENNY_WORKER_TOKEN` nel `.env` con un valore casuale di almeno 24 caratteri. Non serve Node sull'host. Il profilo è esplicito: il normale `docker compose up` continua ad avviare soltanto Jenny. Il worker host precedente resta disponibile per installazioni personalizzate, ma non va eseguito insieme al profilo `lab`.

La prima esecuzione copia il workspace in una directory privata del volume `jenny-labs`. I comandi successivi riusano quel progetto, `.venv`, dipendenze e HOME dedicata. Gli originali arrivano dal volume `jenny-workspaces` montato in sola lettura: non vengono risincronizzati automaticamente e non ricevono modifiche dal Lab. Per trasferire modifiche all'originale usare i normali tool di editing con revisione. La coda e i risultati si vedono nel pannello Plugin, scegliendo Laboratorio persistente.

Esempi di comandi nel Lab:

```sh
python3 -m venv .venv
.venv/bin/python -m compileall -q .
node --test
git diff
```

La rete del worker è una rete Compose `internal`: può contattare soltanto Jenny per acquisire e completare i job, non Internet o la LAN. Il pulsante Web non controlla la rete dei comandi del Lab. Nessun token GitHub dell'host o dell'app è copiato nel Lab; repository privati richiedono il connettore GitHub e importazione dei file tramite workspace. Non inserire token nei comandi registrati.

Limiti: 60 secondi per comando, 1 CPU, 1 GiB RAM, 128 processi, 32000 byte di output. Dipendenze lunghe possono richiedere più comandi. Il volume persistente non ha una quota disco applicativa: monitorare lo spazio Docker. Comandi interrotti non vengono ritentati automaticamente e possono lasciare modifiche parziali nel Lab.

Backup: fermare i comandi e salvare separatamente il volume `jenny-labs`. NON è incluso nel backup Jenny di dati/workspace. Non usare `docker volume prune` come procedura di pulizia: potrebbe rimuovere altri dati. Riferimento: [volumi Docker](https://docs.docker.com/engine/storage/volumes/).
