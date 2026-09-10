# Jenny Web — istruzioni di lavoro nel repository

Prima di riprendere, leggere `ROADMAP.md`, `README-WEB.md` e `VALIDAZIONE-WEB.md`.
La roadmap è il registro canonico di lavoro svolto, verifiche mancanti e prossime attività.

- Lavorare sulla derivazione web (`web/`, Docker, documentazione). Dalla 0.6.2 il desktop inutilizzato è rimosso su richiesta dell'utente; conservarne la storia Git e mantenere soltanto i servizi condivisi necessari.
- Conservare licenza, NOTICE e provenienza Jenny. Non inviare modifiche al repository upstream.
- Ollama è il provider prioritario; preservare l'alternativa OpenAI-compatible.
- GUI italiana e inglese: nuovi testi nel catalogo `web/public/locales.json`. Rigenerare `i18n.js`; non modificare manualmente il bundle generato. Non tradurre il contenuto dei file o messaggi dell'utente attraverso scansioni globali del DOM.
- Le scritture dell'agente richiedono revisione e approvazione. Preservare confini workspace, controllo dei conflitti e cronologia tool.
- Runtime Node 24; SQLite è la fonte corrente delle chat. Leggere BACKUP-WEB.md prima di modificare migrazione, lock, export o ripristino. Il worker Docker è opzionale e separato: leggere RUNNER-WEB.md.
- Comando di verifica: `node --test web/test/*.test.cjs`. Eseguire controlli aggiuntivi solo per rischi concreti. I test simulati dei provider non verificano modelli reali.
- Non indicare come collaudati Docker, GPU, browser o modelli se la prova non è stata eseguita. Separare implementato da verificato nella roadmap.
- Aggiornare la roadmap per ID a fine lavoro, aggiungendo evidenza e stato reale; indicare sempre il prossimo passo concreto.
- Aggiornare versione, note di release e validazione. Consegna richiesta dall'utente: commit e push su vince87/jenny-web, verifica CI; niente ZIP salvo richiesta esplicita.
- Non includere `.env`, credenziali, directory dati/workspace o dipendenze scaricate negli archivi sorgenti.
