# Jenny Web 0.6.1 — SearXNG da .env

Provider e connessione di ricerca sono configurabili nel `.env` di Jenny. Aggiungere o aggiornare, preservando tutte le altre impostazioni:

```dotenv
WEB_SEARCH_PROVIDER=searxng
SEARXNG_BASE_URL=http://192.168.10.250:8081
SEARXNG_ALLOW_PRIVATE=true
```

Aggiornamento da Git (fare prima backup come descritto in BACKUP-WEB.md):

```sh
git pull --ff-only
docker compose up -d --build
```

Ricaricare la pagina e installare/attivare Web nel catalogo. Nessuna chiave Brave richiesta. Il `.env` esistente non viene sostituito: aggiungere le nuove righe manualmente. Mantenere progetto Compose e volumi; non usare `down -v`.

- SearXNG riceve la query con `format=json`. Endpoint, query e risultati validati; massimo 5 risultati di lunghezza limitata.
- Selezionando SearXNG non si inviano ricerche a provider alternativi quando il server fallisce.
- Consenso LAN limitato all'endpoint di ricerca configurato; web_read mantiene il blocco di indirizzi privati. Redirect del motore non seguiti.
- GUI con provider effettivamente configurato; chiave Brave nascosta quando non serve. `BRAVE_SEARCH_API_KEY` può essere impostata in `.env` per l'alternativa Brave e prevale sulla chiave legacy GUI.
- SearXNG deve abilitare JSON in `search.formats` di `settings.yml`. [API ufficiale](https://docs.searxng.org/dev/search_api.html). Il server indicato ha risposto HTTP 200/JSON alla prova read-only; non sono state modificate impostazioni remote.

Test e limiti in VALIDAZIONE-WEB.md. Nessun cambiamento ai limiti desktop/MCP/terminale della 0.6.
