# Jenny Web 0.8.0

CI Docker [34394123882](https://github.com/vince87/jenny-web/actions/runs/34394123882): 70/70 test passati, gh installato, worker isolato e Compose login/riavvio/persistenza riusciti.

- Prompt dedicati Web/GitHub/MCP/Terminale e selettore @ nella chat.
- Ricerca esplicita prima della risposta, usando il provider configurato nel .env; stato di ricerca visibile e fonti reali nel contesto.
- Stato dei plugin e verifica connessioni; scoperta e chiamata strumenti MCP dalla GUI.
- GitHub personale in lettura e scrittura approvata, con gh nel Dockerfile e operazioni limitate al repository configurato.

Validazione locale: 70 test, 68 superati, 2 POSIX esclusi su Windows. Modelli reali, nuova GUI e operazioni GitHub remote da collaudare; nessun aggiornamento automatico del server domestico. Consultare PLUGINS-WEB.md per capacità e limiti e LOGIN-WEB.md se si aggiorna da una versione precedente alla 0.7.
