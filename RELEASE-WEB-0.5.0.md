# Jenny Web 0.5.0 — Workbench locale

Questa release implementa i sei interventi principali e le otto migliorie aggiuntive autorizzate. Lo scopo è rendere il lavoro più controllabile e ridurre gli errori legati a contesto, dati e modifiche.

## Modello e progetti

Letture limitate per caratteri con continuazione Unicode, risultati ricerca più selettivi, allegati testuali scelti per turno, istruzioni JENNY.md, profili Ollama per chat e barra del contesto con stima distinta dai token misurati. Restano disponibili endpoint OpenAI-compatible e modalità senza tool.

## Controllo delle modifiche

Il sesto tool, write_files, raggruppa fino a otto proposte. La GUI richiede la selezione per file e permette il confronto; i conflitti sono verificati singolarmente. I risultati possono essere parziali e sono registrati esplicitamente. Cronologia file e salvataggio manuale sono preservati.

## Dati e continuità

SQLite con import una tantum dei JSON legacy, transazioni e rollback verificato. Ricerca e archiviazione delle chat, export, backup completo offline con checksum e ripristino in una cartella nuova. Disponibile export legacy che chiude le operazioni pendenti per un downgrade controllato. L’entrypoint impedisce processi concorrenti sulla stessa directory dati.

## Strumenti e interfaccia

Git read-only, diagnostica, runner opzionale esterno al container web, moduli frontend separati, focus e accessi da tastiera, controlli mobile e traduzioni italiano/inglese. Le ricette del runner sono Node test e Python compile: non viene aggiunta una shell al modello.

## Compatibilità e prove

Richiede **Node 24**. Dockerfile aggiornato con Git. Le istruzioni di backup e worker sono in BACKUP-WEB.md e RUNNER-WEB.md.

Vedere VALIDAZIONE-WEB.md per l’esecuzione reale dei test. Docker, il modello sul server dell’utente e la resa/interazione nel browser rimangono da collaudare. L’avvio dei moduli frontend è verificato su un DOM simulato: non equivale a quel collaudo.

ROADMAP.md riporta stato e prove per ciascuno dei 14 interventi. Nessun repository remoto è stato creato o modificato. Nessun container di test o modello è stato scaricato.
