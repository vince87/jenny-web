# Runner opzionale — test isolati

Il modello non ha un terminale. L'utente sceglie una ricetta in **Strumenti progetto → Test isolati**, legge la conferma e approva. Il server registra il job. Un worker separato sul server Docker lo acquisisce con un lease monouso e restituisce il risultato.

Il container web **non riceve il Docker socket**. Il worker è un componente fidato sull'host che dispone di Docker: proteggerne token e account come l'accesso al servizio. Usare un host dedicato per codice non fidato; l'isolamento container non equivale a una macchina virtuale.

## Preparazione sul server

Richiede Node 24 sull'host, Docker e gli stessi workspace dell'app disponibili come directory host. Con un volume Docker nominato usare il suo mountpoint effettivo, oppure predisporre il bind mount dei workspace indicato nel README. I nomi dei progetti devono corrispondere.

Le immagini vanno scaricate esplicitamente prima; il worker non le scarica da solo:

```sh
docker pull node:24-bookworm-slim
docker pull python:3.12-slim
```

Configurare `JENNY_URL`, `JENNY_TOKEN` e `WORKSPACES_DIR` nell'ambiente del worker. Il token è quello del server Jenny; non inserirlo in file da pubblicare. Esempio con token già esportato:

```sh
JENNY_URL=http://127.0.0.1:3000 WORKSPACES_DIR=/docker/stacks/jenny-web/workspaces node web/scripts/runner-worker.cjs
```

Per consumare al massimo un job e terminare:

```sh
JENNY_URL=http://127.0.0.1:3000 WORKSPACES_DIR=/docker/stacks/jenny-web/workspaces node web/scripts/runner-worker.cjs --once
```

Per un servizio persistente configurare questi valori in un file ambiente protetto e usare il proprio supervisore (ad esempio systemd). Non mettere credenziali dentro il workspace.

## Ricette e limiti

- **Node test:** `node --test` nella copia del progetto. Non installa dipendenze.
- **Python compile:** `python -m compileall -q .`; verifica la compilazione, non è una suite di test applicativi.
- Workspace montato in sola lettura e copiato in `/tmp/project`; le scritture restano temporanee.
- Nessuna rete, utente 1000, filesystem container read-only, capability rimosse e no-new-privileges.
- 1 CPU, 512 MiB RAM, 64 processi, 128 MiB temporanei, 55 secondi nel container / 60 secondi nel worker, 32000 byte di output.
- Sorgente limitato a 64 MiB / 10000 elementi / profondità 40; symlink rifiutati.
- Una richiesta attiva per istanza. La GUI aggiorna i risultati con **Aggiorna** e consente di annullare la coda.
- Un job interrotto non viene ripetuto automaticamente. Un job running senza risposta scade dopo due minuti alla successiva lettura della coda. Un container mantiene anche il proprio timeout se il worker si interrompe.
- Viene eseguita la copia del workspace presente all'avvio del worker: evitare modifiche concorrenti mentre si aspetta l'esecuzione.

**Stato di verifica:** coda, lease, rifiuti e argomenti di isolamento sono verificati automaticamente. Docker non è disponibile nell'ambiente di sviluppo: l'esecuzione reale rimane da collaudare. Non usare questa release per eseguire progetti ostili prima di quella verifica.

Riferimento: [opzioni di esecuzione Docker](https://docs.docker.com/engine/containers/run/).
