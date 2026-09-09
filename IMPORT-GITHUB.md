# Import GitHub — 2026-09-09

Destinazione: https://github.com/vince87/jenny-web (pubblico).
Baseline consegnata: Jenny Web 0.5.0, commit locale `26c1534`.
Origine desktop: SaltyPretz3l/jenny, baseline `46ab97a98f740975c36732f335cca1d43847dca1`.

Sono importati i file sorgenti e gli asset della release completa. README.md presenta la webapp; il README desktop originale è conservato in README-UPSTREAM.md. Licenza MIT originale e attribuzione del proprietario sono entrambe preservate.

I workflow Electron originali sono conservati come documenti in docs/upstream-workflows/*.disabled: non sono pipeline adatte alla derivazione web e non vengono attivati dall’import. Nessun workflow di pubblicazione o deploy viene aggiunto.

Il commit iniziale `a2cea805c9b4c75f5ea83e2090014b9d9f242708` del repository di destinazione resta nella storia. L’import API porta lo snapshot completo della release: gli hash della storia locale precedente sono riferimenti di provenienza, non commit importati su GitHub.

Verifica della release: 47 test superati, dettagli in VALIDAZIONE-WEB.md. Questo import modifica solo documentazione, attribuzioni e posizione dei workflow; non cambia il runtime. Docker, browser e modello reale restano da collaudare.
