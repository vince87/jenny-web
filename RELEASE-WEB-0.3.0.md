# Jenny Web 0.3.0 — IT / EN e continuità del lavoro

## Cambiamenti

- Selettore Italiano/English nella barra principale, senza ricaricare la pagina e con preferenza ricordata.
- Catalogo centralizzato per testi statici, stati, comandi, etichette accessibili, placeholder e suggerimenti. Bundle browser/Node generato da un'unica fonte.
- Lingua trasmessa ai nuovi turni e conservata nella conversazione. Titolo iniziale localizzato. I messaggi già scritti e il codice dei file restano invariati.
- Errori API dell'app localizzati tramite Accept-Language. Diagnostica esterna e risultati grezzi dei tool mantengono il testo originale del servizio.
- Recupero di workspace e chat selezionati dopo ricaricamento; bozze dei messaggi separate per chat nella scheda.
- Riconnessione del canale eventi con tentativi progressivi e polling di ripiego.
- Correzione della pubblicazione del conteggio file quando una risposta arriva dopo il cambio workspace.
- ROADMAP.md con attività storiche, prossime priorità, criteri di completamento e prove bloccate. AGENTS.md impone di leggerla e aggiornarla a ogni ripresa.

## Verifica

Vedere VALIDAZIONE-WEB.md per risultati effettivi. La GUI bilingue ha controlli di copertura del catalogo, coerenza del markup, funzioni pure e integrazione server; non è stata collaudata interattivamente in un browser. Ripristino preferenze/bozze e riconnessione richiedono ancora quella prova. Docker e modello reale restano non verificati.

## Prossima priorità

JW-020/021/022 se diventa disponibile l'ambiente di collaudo; altrimenti JW-023: snapshot dei file e ripristino con controllo conflitti. Tutto il resto è ordinato in ROADMAP.md.
