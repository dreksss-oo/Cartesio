// Lingue di Cartesio: l'interfaccia è scritta in italiano; per le altre lingue i testi vengono tradotti al volo
// (pagina, suggerimenti, messaggi e testi disegnati). Lingua automatica dal sistema, modificabile in Impostazioni.
// migrazione dai vecchi nomi (Curva) ai nuovi (Cartesio)
try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('curva3.')) { const n = 'cartesio.' + k.slice(7); if (localStorage.getItem(n) == null) localStorage.setItem(n, localStorage.getItem(k)); } } } catch {}
(function () {
  const pref = (() => { try { return localStorage.getItem('cartesio.lang') || 'auto'; } catch { return 'auto'; } })();
  const LS = window.CARTESIO_LANGS || {it:1, en:1}, nl = (navigator.language || 'it').toLowerCase().split('-')[0], sys = LS[nl] ? (nl === 'nb' || nl === 'nn' ? 'no' : nl) : (nl === 'nb' || nl === 'nn' ? 'no' : 'en');
  const LANG = pref === 'auto' || !LS[pref] ? sys : pref; const LD = (window.CARTESIO_L10N || {})[LANG] || null;
  window.CARTESIO_LANG = LANG; document.documentElement.lang = LANG;

  // testi interi (esatti, senza spazi ai bordi)
  const EN = {
    'Salva':'Save', 'Nuovo':'New', 'Apri':'Open', 'Demo':'Demo', 'Elimina':'Delete', 'Annulla':'Cancel', 'Clona':'Clone', 'Stop':'Stop',
    'Rack':'Rack', 'Mixer':'Mixer', 'Plugin':'Plugins', 'Master':'Master', 'Pattern':'Pattern', 'Zoom':'Zoom', 'Snap':'Snap', 'Beat':'Beat',
    'Battuta':'Bar', 'Battute':'Bars', 'Suono':'Sound', 'Composizione':'Composition', 'Tempo':'Tempo', 'Arrangiamento':'Arrangement', 'ottave':'octaves', 'semitoni':'semitones',
    'Impostazioni':'Settings', 'Lingua':'Language', 'Automatica (sistema)':'Automatic (system)',
    'Gestione plugin':'Plugin manager', 'Channel rack':'Channel rack', 'Apri il channel rack':'Open the channel rack', 'Nuovo pattern':'New pattern', 'Nuovo progetto':'New project',
    'Mostra/nascondi channel rack':'Show/hide channel rack', 'Mostra/nascondi il mixer':'Show/hide mixer', 'Play (Spazio)':'Play (Space)',
    'Playlist · Arrangiamento':'Playlist · Arrangement', 'PLAYLIST · ARRANGIAMENTO':'PLAYLIST · ARRANGEMENT', '✎ Disegna':'✎ Draw', '✂ Taglia':'✂ Cut', '▶ Ascolta':'▶ Listen', '▶ Suona pattern':'▶ Play pattern',
    '⤓ Clona da audio…':'⤓ Clone from audio…', '⤓ Importa MIDI…':'⤓ Import MIDI…', '+ Aggiungi effetto':'+ Add effect', '+ aggiungi effetto…':'+ add effect…', '+ Cartella…':'+ Folder…',
    'Aggiungi un canale':'Add a channel', 'Esporta WAV':'Export WAV', 'Guida al linguaggio':'Language guide', 'Cerca plugin':'Search plugins', 'cerca…':'search…',
    'Cartelle dei plugin':'Plugin folders', 'I tuoi plugin':'Your plugins', 'Effetti di Cartesio':'Cartesio effects', 'effetti del PC (VST3 · VST2 · CLAP)':'PC effects (VST3 · VST2 · CLAP)',
    'Clicca un effetto per aprire il suo plugin.':'Click an effect to open its plugin.', 'Nessun effetto: aggiungine uno qui sotto.':'No effects: add one below.',
    'Nessuna cartella: aggiungi quelle dove tieni VST3, DLL o CLAP.':'No folders: add the ones where you keep VST3, DLL or CLAP.', 'Prima aggiungi una cartella.':'Add a folder first.',
    'Libreria vuota: apri "Plugin", scegli le cartelle e aggiungi i plugin.':'Empty library: open "Plugins", choose the folders and add the plugins.',
    'Insert del mixer da cui esce':'Mixer insert it goes to', 'Inserisci nell\'arrangiamento':'Insert into the arrangement',
    'Pan (doppio clic: centro)':'Pan (double click: center)', 'Volume (doppio clic: 0 dB)':'Volume (double click: 0 dB)',
    'Il tempo: unica cosa che decide quanto dura un beat':'Tempo: the only thing that decides how long a beat lasts', 'Clic: scrivi una funzione di b':'Click: write a function of b',
    'Clic su un pattern: si apre il suo blocco.':'Click a pattern: its block opens.', 'Nel blocco,':'In the block,', 'aggiunge un canale: a sinistra il suono, a destra la funzione che compone.':'adds a channel: the sound on the left, the composing function on the right.',
    'Clic: piazza il pattern selezionato · trascina: sposta · bordo destro: allunga · doppio clic: apri':'Click: place the selected pattern · drag: move · right edge: stretch · double click: open',
    'Clic su una clip: la divide in due':'Click a clip: split it in two',
    'Analizza un file audio e lo trasforma in una funzione (o trascinalo qui)':'Analyzes an audio file and turns it into a function (or drag it here)',
    'Converte un file MIDI in una funzione (o trascinalo qui)':'Converts a MIDI file into a function (or drag it here)',
    'Trascina le manopole su e giù · doppio clic: valore iniziale · clic sul numero: scrivi una funzione di b (ƒ)':'Drag knobs up and down · double click: default value · click the number: write a function of b (ƒ)',
    'Spazio play/stop · Ctrl+Invio suona il pattern dalla composizione · Esc chiude la finestra · Destro elimina una clip · Ctrl+rotella zoom':'Space play/stop · Ctrl+Enter plays the pattern from the composition · Esc closes the window · Right click deletes a clip · Ctrl+wheel zoom',
    'Lissajous: sinistra contro destra':'Lissajous: left versus right', 'Trasformazione in matematica':'Transformation into mathematics', 'il suono originale nel tempo':'the original sound over time',
    'le sue frequenze nel tempo (60 Hz → 11 kHz)':'its frequencies over time (60 Hz → 11 kHz)', '1 · Ascolto il suono':'1 · Listening to the sound',
    '2 · Lo scompongo in frequenze — trasformata di Fourier':'2 · Splitting it into frequencies — Fourier transform', '4 · Confronto — grigio: il suono originale · nero: la matematica':'4 · Comparison — gray: the original sound · black: the mathematics',
    'Puoi scrivere come preferisci, anche incollando da Desmos o LaTeX:':'Write however you like, even pasting from Desmos or LaTeX:', 'Definizioni su righe separate:':'Definitions on separate lines:',
    'Somme e prodotti:':'Sums and products:', 'Desmos originale':'Original Desmos', 'suona un accordo.':'plays a chord.', '· liste':'· lists', '· moltiplicazione implicita:':'· implicit multiplication:',
    'Massimo 8 effetti per insert':'At most 8 effects per insert', 'Formato non adatto a questa finestra':'Format not suited to this window', 'Trascina qui un file audio':'Drag an audio file here',
    'Arrangiamento vuoto':'Empty arrangement', 'Arrangiamento vuoto: piazza un pattern nella playlist':'Empty arrangement: place a pattern in the playlist',
    'Nell\'arrangiamento entrano solo funzioni':'Only functions go into the arrangement', 'Funziona solo nell\'app (exe)':'Works only in the app (exe)', 'Funziona solo nell\'app (exe).':'Works only in the app (exe).',
    'I plugin VST3 non vengono applicati all\'export (per ora)':'VST3 plugins are not applied on export (for now)', 'Niente da annullare':'Nothing to undo', 'Niente da ripetere':'Nothing to redo',
    'Caricare il progetto demo?':'Load the demo project?', 'Nuovo progetto? Le modifiche non salvate andranno perse.':'New project? Unsaved changes will be lost.',
    'file non valido (serve un progetto Cartesio)':'invalid file (a Cartesio project is needed)', 'il file è silenzioso':'the file is silent', 'nessuna nota nel file':'no notes in the file', 'non è un file MIDI':'not a MIDI file',
    'ponte non avviato (solo nell\'app)':'bridge not started (app only)', 'Ponte VST3: avvio in corso…':'VST3 bridge: starting…', 'disponibile solo nell\'app (exe)':'available only in the app (exe)',
    'CLAP: non ancora supportato dal ponte':'CLAP: not yet supported by the bridge', 'AAX: Avid lo permette solo dentro Pro Tools':'AAX: Avid allows it only inside Pro Tools',
    'Cartesio non ha ricevuto il collegamento dal processo principale':'Cartesio did not receive the link from the main process',
    'Sì':'Yes', 'Dispositivo di uscita':'Output device', 'Predefinito di sistema':'System default', 'Dimensione buffer':'Buffer size', 'Automatico':'Automatic', 'Automatica':'Automatic', 'Riavvia audio':'Restart audio', 'Latenza effettiva':'Actual latency', 'Audio':'Audio', 'Bassa':'Low', 'Media':'Medium', 'Alta (più stabile)':'High (more stable)', 'Morbido':'Soft', 'Legno':'Wood', 'Rendering…':'Rendering…', 'Lettura plugin ogni':'Read plugin settings every', 'Ctrl+Maiusc+S':'Ctrl+Shift+S',
  };
  // pezzi di frasi composte (sostituiti dentro testi più lunghi)
  const FR = [
    [' — composizione y(x)', ' — composition y(x)'], [' — suono f(x, t)', ' — sound f(x, t)'], [' · nuovo canale', ' · new channel'],
    ['Salvato con le impostazioni di tutti i ', 'Saved with the settings of all '], ['Salvato, ma ', 'Saved, but '], [' plugin su ', ' plugins out of '], [' senza impostazioni (ponte attivo?)', ' without settings (bridge running?)'],
    ['Non riesco a caricare "', 'Cannot load "'], ['Aggiunto. Per sentirlo serve il ponte VST3 attivo (', 'Added. To hear it the VST3 bridge must be running ('],
    ['Ponte VST3 non attivo: ', 'VST3 bridge not running: '], ['Errore esportazione: ', 'Export error: '], ['Impossibile aprire: ', 'Cannot open: '], ['Impossibile clonare il file: ', 'Cannot clone the file: '],
    ['Impossibile leggere il MIDI: ', 'Cannot read the MIDI: '], ['Impossibile leggere il file: ', 'Cannot read the file: '], ['Il MIDI è a ', 'The MIDI is at '], ['Importate ', 'Imported '], [' note in ', ' notes in '],
    [' voci', ' voices'], [' voce', ' voice'], ['Analizzo "', 'Analyzing "'], ['" adesso è matematica', '" is now mathematics'], ['Clonato: ', 'Cloned: '], ['" convertito in matematica · ', '" converted to mathematics · '],
    ['" in una funzione?\nCartesio ricrea il suono con ', '" into a function?\nCartesio recreates the sound with '], ['Convertire "', 'Convert "'], [' sinusoidi e ', ' sinusoids and '], [' bande di rumore, scritte nel suo linguaggio.', ' noise bands, written in its language.'],
    ['fotogramma ', 'frame '], [' picchi trovati', ' peaks found'], ['sinusoide ', 'sinusoid '], [' numeri scritti', ' numbers written'], ['campioni letti ', 'samples read '], ['differenza media di volume ', 'average volume difference '],
    ['3 · Ogni picco diventa una curva: ', '3 · Each peak becomes a curve: '], [' plugin trovati · ', ' plugins found · '], ['8 beat · ripetizioni ogni ', '8 beats · repeats every '],
    ['ha fatto chiudere il ponte', 'made the bridge close'], ['riavvia Cartesio per riprovarlo', 'restart Cartesio to retry it'], ['il ponte si è chiuso', 'the bridge closed'], ['lo riavvio…', 'restarting it…'],
    ['il ponte non è partito', 'the bridge did not start'], ['riprovo…', 'retrying…'], ['il ponte continua a chiudersi', 'the bridge keeps closing'], ['Dettagli: ', 'Details: '],
    ['plugin a 32 bit: serve la versione a 64 bit', '32-bit plugin: the 64-bit version is needed'], ['file non trovato', 'file not found'], ['non è un plugin VST3 valido', 'not a valid VST3 plugin'],
    ['Windows non riesce a caricare la DLL', 'Windows cannot load the DLL'], ['è uno strumento: qui si caricano solo effetti', 'it is an instrument: only effects can be loaded here'],
    ['= altezza · dove y non è definita c\'è silenzio, quando torna definita la nota riparte · una lista', '= pitch · where y is undefined there is silence, when it becomes defined again the note restarts · a list'],
    ['= beat del pattern (quanto dura un beat lo decide solo', '= pattern beat (how long a beat lasts is decided only by'],
    ['x = fase dell\'onda (0 → 2π) · t = secondi dall\'inizio della nota · stesso linguaggio della composizione (Desmos, LaTeX, if/otherwise, Σ…)', 'x = wave phase (0 → 2π) · t = seconds since the note started · same language as the composition (Desmos, LaTeX, if/otherwise, Σ…)'],
    ['y = …   (clicca per comporre)', 'y = …   (click to compose)'], ['Funzioni: ', 'Functions: '], ['Operatori: ', 'Operators: '], [', catene', ', chains'], [', and or not, restrizioni', ', and or not, restrictions'],
    ['Codifica ', 'Encoding '], [' · ritmo: ', ' · rhythm: '], [' · altezze: ', ' · pitches: '], [' · accordi: ', ' · chords: '], [' · suono: ', ' · sound: '], [' · inviluppi: ', ' · envelopes: '], [' · liste: ', ' · lists: '], [' · costanti ', ' · constants '], [' · musicali: ', ' · musical: '], [' campioni', ' samples'], ['Uscita ', 'Output '], ['encoder MP3 mancante', 'MP3 encoder missing'], ['OGG non disponibile in questa versione', 'OGG not available in this version'], ['codifica Opus non supportata', 'Opus encoding not supported'],
    ['suono intonato · ', 'pitched sound · '], ['in attesa: premi ▶ e guarda la matematica suonare', 'waiting: press ▶ and watch the math play'], ['errore: ', 'error: '], ['Errore: ', 'Error: '], ['Distorsione / Saturazione', 'Distortion / Saturation'], ['Riverbero', 'Reverb'], ['Compressore', 'Compressor'],
    ['Traccia ', 'Track '], ['Canale ', 'Channel '], ['dimensione 0–1', 'size 0–1'], ['smorzamento 0–1', 'damping 0–1'], ['tempo in beat', 'time in beats'], ['basse Hz', 'low Hz'], ['basse dB', 'low dB'],
    ['medie Hz', 'mid Hz'], ['medie dB', 'mid dB'], ['medie Q', 'mid Q'], ['alte Hz', 'high Hz'], ['alte dB', 'high dB'], ['soglia dB', 'threshold dB'], ['rapporto', 'ratio'], ['attacco ms', 'attack ms'],
    ['rilascio ms', 'release ms'], ['guadagno', 'gain'], ['velocità Hz', 'rate Hz'], ['profondità', 'depth'], ['uscita', 'output'],
  ].sort((a, b) => b[0].length - a[0].length);

  const tr = s => { if (LANG === 'it' || !s || !/[a-zà-ù]/i.test(s)) return s; const t = s.trim(); if (LD && LD[t]) return s.replace(t, LD[t]); if (EN[t]) return s.replace(t, EN[t]);
    let o = s; for (const [a, b] of FR) if (o.includes(a)) o = o.split(a).join(b); return o; };
  window.T = tr;
  if (LANG === 'it') return;

  const SKIP = 'SCRIPT,STYLE,TEXTAREA,CODE,PRE';
  const doNode = n => { if (n.nodeType === 3) { const p = n.parentNode; if (!p || SKIP.includes(p.nodeName) || p.closest && p.closest('[data-noi18n],.cm,.code')) return; const v = tr(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; return; }
    if (n.nodeType !== 1 || SKIP.includes(n.nodeName)) return;
    for (const a of ['title', 'placeholder', 'aria-label']) { const v = n.getAttribute && n.getAttribute(a); if (v) { const w = tr(v); if (w !== v) n.setAttribute(a, w); } }
    if (n.nodeName === 'INPUT' && (n.type === 'button' || n.type === 'submit') && n.value) n.value = tr(n.value);
    for (const c of n.childNodes) doNode(c); };
  const run = () => { doNode(document.body);
    new MutationObserver(ms => { for (const m of ms) { if (m.type === 'characterData') doNode(m.target); else if (m.type === 'attributes') doNode(m.target); else for (const n of m.addedNodes) doNode(n); } })
      .observe(document.body, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['title', 'placeholder', 'aria-label']}); };
  if (document.body) run(); else addEventListener('DOMContentLoaded', run);
  // testi disegnati sui canvas
  const ft = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (s, ...a) { return ft.call(this, typeof s === 'string' ? tr(s) : s, ...a); };
})();

