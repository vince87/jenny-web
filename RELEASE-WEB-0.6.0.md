# Jenny Web 0.6.0

Data: 2026-09-09. Baseline 0.5 preservata; nessuna modifica ai sorgenti desktop originali.

Nuovi moduli: indicatore attività chat, fetch web controllato, ricerca Brave configurabile dalla GUI (fallback DuckDuckGo non garantito), catalogo integrazioni, client MCP HTTP 2025-11-25, comandi shell nel worker Docker separato. Approvazione esplicita per ogni chiamata esterna; revoca verificata prima dell'esecuzione. IT/EN e test aggiornati.

## Aggiornamento sul server

Prima eseguire un backup a servizi fermi come in `BACKUP-WEB.md`. Da una copia Git del repository, senza modifiche locali incompatibili:

```sh
git pull --ff-only
docker compose up -d --build
docker compose logs --tail=80 jenny-web
```

Se si usa un archivio, mantenere nome progetto Compose, `.env` e volumi della 0.5: non usare `down -v`. Non sovrascrivere la configurazione personale. Dopo l'aggiornamento ricaricare completamente la pagina.

Aprire **Plugin, Web e Terminale**, installare Web e configurare la propria chiave Brave Search; aggiungere i server MCP fidati. Attivare **Agente** per usare gli strumenti in chat. Per il terminale preparare il worker come in `RUNNER-WEB.md`: altrimenti i comandi restano in coda.

## Limiti espliciti

- Navigazione testuale; nessun browser JavaScript, login web o download binario.
- Catalogo locale, non marketplace/plugin Electron originali. Nessun controllo desktop originale o PTY.
- MCP limitato a tools via Streamable HTTP 2025-11-25; bearer HTTPS, niente OAuth o stdio.
- Terminale temporaneo offline; risultati a fine esecuzione, nessun write-back. Il worker ha privilegi Docker sull'host e deve essere protetto.
- Credenziali plugin in chiaro nel volume dati protetto e nei backup. Nessuna gestione multiutente.
- Provider nei test simulati: collaudo Ollama e MCP reali sul server ancora necessario. Stato Docker separato in `VALIDAZIONE-WEB.md`.

Riferimenti di implementazione: [MCP HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [Brave Search API](https://api-dashboard.search.brave.com/documentation/services/web-search).
