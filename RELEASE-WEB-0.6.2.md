# Jenny Web 0.6.2 — sorgenti ripuliti e avvio login

## Pulizia completata

Rimossi 4901 file tracked esclusivi del desktop, comprese GUI Electron, installer, sidecar Python, risorse, tooling e test non usati. I 15 servizi upstream realmente richiesti dalla webapp restano in `services/`. Eliminato anche il vecchio script una tantum `web/scripts/release-06.cjs`, che avrebbe reimpostato la versione 0.6.0.

Licenza e provenienza conservate. Le rimozioni sono recuperabili dalla release/tag 0.6.1 e dalla storia Git. Nessuna cancellazione di dati o configurazioni sul server dell'utente. Prettier uniforma il codice; il nuovo package root contiene solo comandi web e una dipendenza di sviluppo, nessuna dipendenza runtime aggiunta.

## Login: fase 1, non ancora attivo

Introdotto e testato un modulo account separato: hashing password scrypt, admin/utente, creazione account amministrativa, sessioni con scadenza, logout, disabilitazione e cambio password con revoca. **Non ci sono ancora pagina login attiva, migrazione dati o isolamento multiutente. L'accesso della webapp resta invariato con JENNY_TOKEN.** Piano di integrazione in `LOGIN-WEB.md`.

## Aggiornamento

Eseguire prima il backup descritto in `BACKUP-WEB.md`, poi dalla copia Git senza modifiche locali in conflitto:

```sh
git pull --ff-only
docker compose up -d --build
```

Conservare `.env`, progetto Compose e volumi. Non usare `down -v`. Se si usa uno ZIP, estrarre in una cartella sorgente nuova per non lasciare vecchi file desktop; riutilizzare esplicitamente il medesimo progetto Compose e i volumi.

Stato delle prove in `VALIDAZIONE-WEB.md`. Funzioni web della 0.6.1 preservate.
