# Jenny Web 0.9.1

Pubblicata su GitHub con CI Docker riuscita: [75/75 test, worker, Lab e Compose](https://github.com/vince87/jenny-web/actions/runs/34449551600). Menu e attivazione/disattivazione Web verificati nel browser locale.

- Scelta della ricerca nel normale tool calling, senza inferenza preliminare per ogni messaggio.
- Callback Ollama opzionale: corretti i falsi errori di connessione nelle chiamate interne senza streaming UI.
- Limiti ricerca/pagine e rifiuto query duplicate; fonti e stato dalle operazioni reali.
- Menu a discesa dei plugin accanto al modello, con caselle ON/OFF.

75 test locali: 73 passati, due POSIX esclusi su Windows. Test con provider simulati, non collaudo Gemma4 reale. Codice consegnato con commit/push GitHub; nessuno ZIP richiesto.
