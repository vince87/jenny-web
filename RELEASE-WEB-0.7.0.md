# Jenny Web 0.7.0 — login locale e multiutente

Tranche raggruppata: login username/password IT/EN, gestione utenti dall'account admin, cambio password/logout, recupero locale, separazione di chat/file/cronologia/export/plugin, backup completo multiutente e worker con credenziale dedicata.

La pulizia del desktop della 0.6.2 è mantenuta; nessuna riscrittura integrale in Python. SearXNG resta configurabile nel .env, incluso l'endpoint LAN previsto `http://192.168.10.250:8081`.

## Aggiornamento necessario

**Prima fare backup, poi seguire [LOGIN-WEB.md](https://github.com/vince87/jenny-web/blob/v0.7.0/LOGIN-WEB.md)** per creare il primo amministratore dal terminale del server. Il vecchio JENNY_TOKEN non consente più l'accesso. Il primo admin adotta esplicitamente i dati precedenti senza spostarli; gli altri account partono con archivi propri.

Conservare cartella/nome progetto Compose, volumi e .env. Aggiornare insieme l'eventuale worker e impostare JENNY_WORKER_TOKEN separato. Nessuna password predefinita, nessuna registrazione pubblica. Su HTTP usare soltanto LAN fidata.

## Verifiche e limiti

Suite locale: 65 test, 63 passati, 2 POSIX riservati a Linux. CI Docker [34388617707](https://github.com/vince87/jenny-web/actions/runs/34388617707): **65/65 superati, zero esclusi**, login Compose prima/dopo riavvio, persistenza e worker isolato reale riusciti. Login/admin/logout IT e login utente/logout EN verificati nel browser desktop con dati fittizi. Evidenza Docker aggiornata in [VALIDAZIONE-WEB.md](https://github.com/vince87/jenny-web/blob/v0.7.0/VALIDAZIONE-WEB.md).

Terminale e MCP LAN solo admin; Web e MCP pubblici disponibili agli utenti. Mancano ancora parità desktop, terminale PTY, MCP stdio/OAuth e collaudo completo sul server dell'utente. Il login essenziale non rende questa applicazione adatta all'esposizione pubblica.
