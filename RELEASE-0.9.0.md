# Jenny Web 0.9.0

- Pulsanti ON/OFF dei plugin nella chat, senza aprire il catalogo; collegamento dedicato per GitHub/MCP non configurati.
- Prompt delle capacità effettive e ricerca Web pianificata dal modello anche senza @. Fino a tre query diverse, rivalutate sui risultati; nessuna conferma ripetuta mentre Web è acceso. Risultati tecnici separati dal messaggio, fonti cliccabili.
- Compressione dei turni vecchi e memoria per progetto/utente, visibile, modificabile e disattivabile. Lo storico originale non viene cancellato.
- Plugin Lab: copia di sviluppo persistente, Python/venv, Node, Git e gh, comandi approvati e volumi separati. Richiede build Dockerfile.lab e worker aggiornato; non si installa da solo sul server domestico.

Test locali: 74 test, 72 passati, 2 esclusi su Windows. Browser con account e provider fittizi: Web ON/OFF, ricerca senza conferma e senza JSON nel messaggio, fonti, memoria salvata e riletta dopo reload. Qualità del planner/riassunto sul modello reale da verificare. Consultare LAB-WEB.md e MEMORY-WEB.md; fare backup prima dell'aggiornamento.
