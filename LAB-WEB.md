# Laboratorio persistente

Il plugin **Lab** (`@sandbox`) usa il worker host separato di RUNNER-WEB.md. Solo admin. Ogni comando richiede approvazione e viene eseguito in un container non-root, root read-only, senza capability e senza Docker socket. Non è una VM o un audit contro codice ostile.

Preparazione, sul server, dalla nuova cartella sorgente:

```sh
docker build -f Dockerfile.lab -t jenny-lab:local .
```

Aggiornare anche il worker (`web/scripts/runner-worker.cjs`) e avviarlo come descritto in RUNNER-WEB.md con Node 24, WORKSPACES_DIR, JENNY_URL e JENNY_WORKER_TOKEN. Poi attivare **Lab** dalla chat. Il normale aggiornamento di Jenny non avvia un worker né configura Docker sull'host.

La prima esecuzione copia il workspace in `/lab/project`. I comandi successivi riusano quel progetto, `.venv`, dipendenze e HOME `/lab/.home`. Un volume nominato `jenny-lab-<hash>` è distinto per radice personale e workspace; non viene cancellato al termine del comando. I file originali sono disponibili read-only in `/source`: non vengono risincronizzati automaticamente e non ricevono modifiche dal Lab. Per aggiornare una copia usare un comando esplicito approvato; per trasferire modifiche all'originale usare i normali tool di editing con revisione. La coda e i risultati si vedono nel pannello Plugin, scegliendo Laboratorio persistente.

Esempi di comandi nel Lab:

```sh
python3 -m venv .venv
.venv/bin/python -m compileall -q .
node --test
git diff
```

La rete è disabilitata per default. Per installare dipendenze da Internet esportare **nel processo worker** `JENNY_LAB_NETWORK=bridge` e riavviarlo; la variabile è documentata anche nel `.env.example`, ma il worker host non legge automaticamente il `.env` Compose. **Bridge consente anche accesso alla LAN:** usare soltanto codice fidato o un host con filtro egress adeguato. Il pulsante Web non controlla la rete dei comandi del Lab. Nessun token GitHub dell'host o dell'app è copiato nel Lab; repository privati richiedono il connettore GitHub e importazione dei file tramite workspace. Non inserire token nei comandi registrati.

Limiti: 55 secondi per comando, 1 CPU, 1 GiB RAM, 128 processi, 32000 byte di output. Dipendenze lunghe possono richiedere più comandi. Il volume persistente non ha una quota disco applicativa: monitorare lo spazio Docker. Comandi interrotti non vengono ritentati automaticamente e possono lasciare modifiche parziali nel Lab.

Backup: fermare i comandi e salvare separatamente i volumi `jenny-lab-*`. NON sono inclusi nel backup Jenny di dati/workspace. Non usare `docker volume prune` come procedura di pulizia: potrebbe rimuovere altri dati. Rimuovere un laboratorio solo dopo aver identificato e salvato il volume esatto. Riferimento: [volumi Docker](https://docs.docker.com/engine/storage/volumes/).
