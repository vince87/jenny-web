# Jenny Web

Assistente locale di coding nel browser, con Ollama, workspace, approvazioni, ricerca SearXNG, MCP HTTP e terminale Docker isolato.

- [Avvio, configurazione e funzioni](README-WEB.md)
- [Backup e ripristino](BACKUP-WEB.md)
- [Worker terminale](RUNNER-WEB.md)
- [Roadmap](ROADMAP.md) e [verifiche effettive](VALIDAZIONE-WEB.md)
- [Pulizia del desktop e prima fase login](RELEASE-WEB-0.6.2.md)

## Sviluppo

Node 24. `npm start` avvia il server, `npm test` esegue la suite. Non servono dipendenze npm per l'esecuzione.

Per formattare: `npm ci`, poi `npm run format`. Prettier è una dipendenza di solo sviluppo, non inclusa nell'immagine Docker. Le traduzioni vanno modificate in `web/public/locales.json` e rigenerate con `node web/scripts/build-i18n.cjs`.

`web/` contiene backend, GUI browser e test. `services/` contiene solo i 15 moduli upstream necessari al filesystem e al registro strumenti. Electron, GUI desktop, installer, sidecar Python e risorse inutilizzate sono rimossi da questa versione.

## Provenienza

Derivato da [SaltyPretz3l/jenny](https://github.com/SaltyPretz3l/jenny), baseline `46ab97a98f740975c36732f335cca1d43847dca1`. Licenza MIT e attribuzioni conservate. La versione completa precedente alla pulizia rimane nella [release 0.6.1](https://github.com/vince87/jenny-web/releases/tag/v0.6.1) e nella cronologia Git; nessun sorgente upstream è stato eliminato dalla cronologia.
