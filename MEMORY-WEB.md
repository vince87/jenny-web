# Contesto e memoria

Il budget è stimato in byte, non con il tokenizer del modello. Quando i turni non entrano più, Jenny riassume estratti dei messaggi vecchi e conserva gli ultimi turni completi, incluse coppie chiamata/risultato tool. Con memoria automatica attiva, il riepilogo parte anche ogni otto turni non ancora compressi, conservando almeno gli ultimi quattro quando il budget lo consente. Un singolo turno troppo grande può ancora richiedere meno testo o più contesto.

Durante il riepilogo compare «Comprimo il contesto…»; l'indicatore mostra quanti messaggi sono stati riassunti. Il modello riceve estratti limitati e il precedente riepilogo: possono andare persi dettagli o esserci errori. Se il riassuntore non risponde, è usato un estratto dichiaratamente incompleto. Messaggi originali e risultati tool restano nel database e nell'export della chat.

**Memoria progetto** apre le note condivise tra le chat dello stesso progetto e account. Sono aggiornate dalla compressione, non a ogni messaggio: una chat breve non produce automaticamente memoria. Le modifiche concorrenti non vengono sovrascritte con una revisione obsoleta. Puoi correggere le note, disattivare aggiornamento/uso condiviso oppure cancellarle (che disattiva anche gli aggiornamenti automatici). I riepiloghi interni delle singole chat restano parte del loro contesto: cancellare la memoria progetto non cancella chat o riepiloghi della chat.

La memoria è reference data, non un prompt privilegiato. È conservata nei metadata del database personale e inclusa nel backup completo; non è mescolata con altri utenti o progetti. L'export di una singola chat contiene il suo riepilogo, non tutta la memoria dei progetti.
