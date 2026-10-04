# Architettura

```text
┌──────────── finestra (renderer) ────────────┐        ┌──── processo ponte (utilityProcess) ────┐        ┌──── host nativi ────┐
│ interfaccia (app.js, ui.js)                 │ porte  │ hostbridge.js                          │  TCP   │ cartesio-host.exe   │
│ AudioWorklet: engine.js + processor.js ─────┼───────▶│ instrada ogni insert all'host giusto   ├───────▶│ (x64)               │
│   sintetizza le funzioni, mixer, effetti    │◀───────┤ (64 o 32 bit), riavvio, quarantena     │◀───────┤ cartesio-host32.exe │
└─────────────────────────────────────────────┘        └────────────────────────────────────────┘        └─────────────────────┘
```

- **Motore audio** (`processor.js`, in AudioWorklet): valuta le funzioni compilate da `engine.js`, gestisce voci, mixer e effetti interni.
- **Plugin esterni**: per ogni blocco da 256 campioni il motore invia in un solo messaggio tutti gli insert che contengono plugin; il ponte li inoltra agli host nativi e restituisce l'audio. Un margine fisso (PDC) mantiene tutto a tempo; la latenza dichiarata dai plugin viene compensata.
- **Host nativi** (`native/host/host.cpp`): caricano VST3 e VST2, eseguono l'audio su un thread a priorità massima, mostrano gli editor dei plugin agganciati alla finestra di Cartesio, salvano e ripristinano lo stato dei plugin.
- **Protocollo** (TCP locale): intestazione `{u32 tipo, u32 seq, u32 lunghezza}`; tipi principali: 1 carica, 2 scarica, 3 editor, 5 prepara, 6 audio a lotti, 7/8 stato, 10 finestra madre, 11 posizione, 12 chiudi editor, 13 ridimensiona.
