# Login locale — fase di sviluppo

Obiettivo: username/password per uso personale in LAN, account creati dall'amministratore, nessuna registrazione pubblica, email, MFA o infrastruttura di identità esterna.

## Fase 1 presente nella 0.6.2

`web/auth/accounts.cjs` è un componente backend indipendente, non collegato alle route HTTP correnti:

- Database SQLite account distinto dalle chat, nomi unici normalizzati, ruoli admin/utente.
- Primo amministratore inizializzabile una sola volta; creazione utenti con sessione amministratore.
- Password con salt casuale e scrypt N=131072/r=8/p=1; confronto costante, nessuna password in chiaro salvata o esposta. Coda hash serializzata e limitata per contenere la memoria.
- Sessioni casuali, rappresentate solo da hash nella memoria del server, durata predefinita 8 ore. Riavviare richiede nuovo login.
- Logout, disabilitazione account e cambio password revocano le sessioni interessate.
- Test con database reali temporanei: credenziali errate, privilegi, duplicati, persistenza, scadenza, revoca e assenza di password in chiaro.

Riferimento hashing: [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Non è un audit di sicurezza e non rende l'app multiutente.

## Fase 2 da implementare prima di attivare il login

1. Aggiungere proprietà/isolamento server-side per workspace, file, cronologia, chat, streaming, export, plugin e job. Non fidarsi di un user ID inviato dal browser.
2. Preparare migrazione offline con backup, assegnazione esplicita dei dati precedenti al primo amministratore e test di rollback. Gli attuali dati restano intatti fino a quel momento.
3. Collegare login/logout/me e gestione account alla GUI IT/EN; cookie HttpOnly/SameSite, origine/CSRF, semplice limite ai tentativi. HTTPS se disponibile; HTTP ammesso solo con rischio documentato per LAN fidata.
4. Gestire il primo admin localmente sul server senza password nella cronologia comandi o credenziali predefinite. Definire ripristino password amministrativo locale.
5. Separare la credenziale tecnica del worker dal login browser. Limitare accesso a plugin MCP LAN/terminale, mantenere Ollama e SearXNG condivisi e ordinare la coda delle richieste.
6. Testare con utenti A/B tutte le route (anche identificativi alterati), cache/bozze browser dopo cambio account, richieste concorrenti, riavvio e backup.

Solo dopo si rimuove il login a token. Non impostare variabili di login sperimentali: non esiste ancora un interruttore per attivarlo. `JENNY_TOKEN` resta necessario per il servizio corrente.
