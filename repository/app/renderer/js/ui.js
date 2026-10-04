// Cartesio · menu (File, Gestione plugin, Impostazioni), impostazioni, esportazione audio (WAV/MP3/FLAC/OGG), metronomo
const T_ = s => (window.T ? window.T(s) : s);

// ===== Impostazioni =====
const S_DEF = {lang:'auto', zoom:1, metOn:false, metVol:.6, metSound:'soft', metAccent:true, follow:true, snap:1, undo:60, autosave:true, confirm:true, poll:1500, dev:'', buf:0, sr:0, extLat:4096,
  exp:{fmt:'wav', range:'song', reps:4, sr:48000, bits:24, kbps:320, okbps:192, ch:2, tail:2, norm:'-0.1', dither:true, fade:0}};
var CS = (() => { try { const o = JSON.parse(localStorage.getItem('cartesio.settings') || '{}'); return {...S_DEF, ...o, exp:{...S_DEF.exp, ...(o.exp || {})}}; } catch { return JSON.parse(JSON.stringify(S_DEF)); } })();
window.CS = CS; try { CS.lang = localStorage.getItem('cartesio.lang') || CS.lang; } catch {}
const saveS = () => { try { localStorage.setItem('cartesio.settings', JSON.stringify(CS)); } catch {} };
function applyS() {
  if (window.cartesio && cartesio.setZoom) cartesio.setZoom(CS.zoom); else document.body.style.zoom = CS.zoom;
  PL.snap = +CS.snap; $('#snap').value = String(CS.snap);
  $('#metroBtn').classList.toggle('on', !!CS.metOn); sendMetro(); if (typeof node !== 'undefined' && node) sendProj(true);
}
function sendMetro() { if (typeof node !== 'undefined' && node) node.port.postMessage({type:'metro', on:!!CS.metOn, vol:+CS.metVol, sound:CS.metSound, accent:!!CS.metAccent}); }

// ===== stile =====
document.head.insertAdjacentHTML('beforeend', `<style>
#menubar{grid-area:menu;display:flex;align-items:center;gap:1px;padding:0 8px;border-bottom:1px solid var(--line);background:#fafafa}#menubar button{border:0;background:none;padding:3px 10px;font-weight:500;border-radius:5px}#menubar button:hover,#menubar button.open{background:#f0f0f0}
.dd{position:fixed;z-index:9000;background:#fff;border:1px solid #d6d6d6;border-radius:9px;box-shadow:0 12px 34px rgba(0,0,0,.12);padding:5px;min-width:220px}
.dd .it{display:flex;justify-content:space-between;gap:18px;padding:7px 10px;border-radius:6px;cursor:default;white-space:nowrap}.dd .it:hover{background:#f2f2f2}.dd .it kbd{color:#999;font:11px var(--mono,monospace)}
.dd .sep{height:1px;background:#ececec;margin:4px 6px}.dd .hd{padding:6px 10px 2px;color:#999;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
#metroBtn.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.form{padding:12px 16px 16px;display:grid;grid-template-columns:auto 1fr;gap:9px 14px;align-items:center;overflow:auto}.form .sec{grid-column:1/-1;margin-top:8px;color:#999;font-size:11px;text-transform:uppercase;letter-spacing:.06em;border-top:1px solid #eee;padding-top:10px}
.form .sec:first-child{margin-top:0;border:0;padding-top:0}.form label{color:#555}.form select,.form input[type=text]{width:100%}.form .note{grid-column:2;color:#999;font-size:11px;margin-top:-5px}
.prog{grid-column:1/-1;height:8px;background:#eee;border-radius:4px;overflow:hidden}.prog i{display:block;height:100%;width:0;background:var(--ink);transition:width .15s}
.form .act{grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end;align-items:center}.form .act .st{flex:1;color:#777;font-size:12px}
</style>`);

// ===== menu =====
let ddOpen = null;
function closeDD() { if (ddOpen) { ddOpen.el.remove(); ddOpen.btn.classList.remove('open'); ddOpen = null; } }
function openDD(btn, items) { closeDD(); const d = el('div', 'dd'), r = btn.getBoundingClientRect();
  for (const it of items) { if (it === '-') { d.append(el('div', 'sep')); continue; } if (it.hd) { const h = el('div', 'hd'); h.textContent = it.hd; d.append(h); continue; }
    const e = el('div', 'it'); e.innerHTML = '<span></span><kbd></kbd>'; e.firstChild.textContent = it.t; e.lastChild.textContent = it.k || ''; e.onmousedown = ev => ev.preventDefault(); e.onclick = () => { closeDD(); it.f(); }; d.append(e); }
  d.style.left = r.left + 'px'; d.style.top = r.bottom + 4 + 'px'; document.body.append(d); btn.classList.add('open'); ddOpen = {el:d, btn}; }
addEventListener('mousedown', e => { if (ddOpen && !ddOpen.el.contains(e.target) && !ddOpen.btn.contains(e.target)) closeDD(); }, true);
$('#menubar').onclick = e => { const b = e.target.closest('button'); if (!b) return; if (ddOpen && ddOpen.btn === b) return closeDD();
  if (b.dataset.m === 'file') openDD(b, [
    {t:'Nuovo', k:'Ctrl+N', f:() => $('#new').click()}, {t:'Apri…', k:'Ctrl+O', f:openProj}, '-',
    {t:'Salva', k:'Ctrl+S', f:() => saveProj(false)}, {t:'Salva con nome…', k:'Ctrl+Maiusc+S', f:() => saveProj(true)}, '-', {hd:'Esporta audio'},
    {t:'MP3', f:() => openExport('mp3')}, {t:'WAV', k:'Ctrl+E', f:() => openExport('wav')}, {t:'FLAC', f:() => openExport('flac')}, {t:'OGG', f:() => openExport('ogg')}, '-',
    {t:'Demo', f:() => $('#demo').click()}]);
  else if (b.dataset.m === 'plug') { closeDD(); $('#plugBtn').click(); }
  else if (b.dataset.m === 'set') { closeDD(); openSettings(); } };

// ===== file =====
let curPath = null; const baseName = p => (p || '').split(/[\\/]/).pop();
async function saveProj(as) {
  await pullStates(); const data = serialize(), ex = allExt(), ok = ex.filter(f => f.state).length;
  if (window.cartesio && cartesio.saveFile) { const r = await cartesio.saveFile({path:as ? null : curPath, name:baseName(curPath) || 'progetto.cartesio', data, filters:[{name:'Cartesio', extensions:['cartesio']}]}); if (!r) return; curPath = r; }
  else download(new Blob([data], {type:'application/json'}), 'progetto.cartesio');
  toast(ex.length && ok < ex.length ? 'Salvato, ma ' + (ex.length - ok) + ' plugin su ' + ex.length + ' senza impostazioni (ponte attivo?)' : '✓ ' + (baseName(curPath) || 'progetto.cartesio')); }
async function openProj() {
  if (!(window.cartesio && cartesio.openFile)) return $('#file').click();
  if (CS.confirm && !(await ask('Nuovo progetto? Le modifiche non salvate andranno perse.'))) return;
  const r = await cartesio.openFile({filters:[{name:'Cartesio', extensions:['cartesio', 'curva', 'json']}]}); if (!r) return;
  try { stop(); load(JSON.parse(r.text)); refreshAll(); changed(); curPath = r.path; } catch (er) { notice('Impossibile aprire: ' + er.message); } }
$('#new').addEventListener('click', () => { curPath = null; });

// ===== impostazioni =====
function mkWin(id, title, w) { let x = $('#' + id); if (x) return x; x = el('div', 'win'); x.id = id; x.hidden = true; x.style.cssText = 'left:auto;right:24px;top:58px;width:' + w + 'px;max-height:calc(100% - 80px)';
  x.innerHTML = '<div class="wt"><span class="wtt"></span><button class="wx">&times;</button></div><div class="form"></div>'; x.querySelector('.wtt').textContent = title; $('#main').append(x); initWin(x); return x; }
function row(f, label, ctl, note) { const l = el('label'); l.textContent = label; f.append(l, ctl); if (note) { const n = el('div', 'note'); n.textContent = note; f.append(n); } return ctl; }
function sel(opts, val, on) { const s = el('select'); for (const [v, t] of opts) { const o = el('option'); o.value = v; o.textContent = t; s.append(o); } s.value = String(val); s.onchange = () => on(s.value); return s; }
const yesno = (v, on) => sel([['1', 'Sì'], ['0', 'No']], v ? '1' : '0', x => on(x === '1'));
function openSettings() { const w = mkWin('wSet2', 'Impostazioni', 430), f = w.querySelector('.form'); f.innerHTML = '';
  const sec = t => { const d = el('div', 'sec'); d.textContent = t; f.append(d); }, set = (k, cast = x => x) => v => { CS[k] = cast(v); saveS(); applyS(); };
  sec('Generale');
  const L = window.CARTESIO_LANGS || {it:'Italiano', en:'English'};
  row(f, 'Lingua', sel([['auto', 'Automatica (sistema)'], ...Object.entries(L)], CS.lang, v => { CS.lang = v; saveS(); try { localStorage.setItem('cartesio.lang', v); } catch {} flushSave(); location.reload(); }));
  row(f, 'Salvataggio automatico', yesno(CS.autosave, set('autosave')));
  row(f, 'Chiedi conferma', yesno(CS.confirm, set('confirm')));
  row(f, 'Passi di annullamento', sel([[20, '20'], [60, '60'], [100, '100'], [200, '200']], CS.undo, set('undo', Number)));
  sec('Interfaccia');
  row(f, 'Scala interfaccia', sel([[.8, '80%'], [.9, '90%'], [1, '100%'], [1.1, '110%'], [1.25, '125%'], [1.5, '150%']], CS.zoom, set('zoom', Number)));
  row(f, 'Segui la testina', yesno(CS.follow, set('follow')));
  row(f, 'Snap predefinito', sel([...$('#snap').options].map(o => [o.value, o.textContent]), CS.snap, set('snap', Number)));
  sec('Audio');
  const devSel = row(f, 'Dispositivo di uscita', sel([['', 'Predefinito di sistema']], CS.dev, async v => { CS.dev = v; saveS(); try { if (typeof ctx !== 'undefined' && ctx && ctx.setSinkId) await ctx.setSinkId(v); } catch (e) { toast(e.message); } }));
  listOutputs().then(L => { for (const d of L) { const o = el('option'); o.value = d.deviceId; o.textContent = d.label || ('Uscita ' + (devSel.options.length)); devSel.append(o); } devSel.value = CS.dev; if (devSel.value !== CS.dev) devSel.value = ''; });
  row(f, 'Dimensione buffer', sel([[0, 'Automatico'], [128, '128 campioni'], [256, '256 campioni'], [512, '512 campioni'], [1024, '1024 campioni'], [2048, '2048 campioni']], CS.buf, v => { CS.buf = +v; saveS(); info(); }));
  row(f, 'Frequenza di campionamento', sel([[0, 'Automatica'], [44100, '44.1 kHz'], [48000, '48 kHz'], [88200, '88.2 kHz'], [96000, '96 kHz']], CS.sr, v => { CS.sr = +v; saveS(); info(); }));
  const inf = el('span'); inf.style.color = '#888'; const rb = el('button'); rb.textContent = 'Riavvia audio'; rb.onclick = () => { flushSave(); location.reload(); };
  const box = el('div'); box.style.cssText = 'display:flex;gap:10px;align-items:center'; box.append(rb, inf); row(f, '', box);
  function info() { const c = typeof ctx !== 'undefined' && ctx; const want = (CS.buf !== AUD0.buf || CS.sr !== AUD0.sr) ? (CS.buf || 'auto') + ' / ' + (CS.sr ? CS.sr / 1000 + ' kHz' : 'auto') : '';
    inf.textContent = (c ? T_('Latenza effettiva') + ': ' + Math.round(((c.baseLatency || 0) + (c.outputLatency || 0)) * 1000) + ' ms · ' + c.sampleRate / 1000 + ' kHz' : '') + (want ? ' → ' + want + ' (' + T_('Riavvia audio') + ')' : ''); }
  info();
  row(f, 'Margine plugin esterni', sel([[2048, '2048 (≈43 ms)'], [4096, '4096 (≈85 ms)'], [8192, '8192 (≈170 ms)']], CS.extLat, set('extLat', Number)));
  row(f, 'Lettura plugin ogni', sel([[1000, '1 s'], [1500, '1,5 s'], [3000, '3 s'], [5000, '5 s']], CS.poll, set('poll', Number)));
  sec('Metronomo');
  const vol = el('input'); vol.type = 'range'; vol.min = 0; vol.max = 1; vol.step = .01; vol.value = CS.metVol; vol.oninput = () => { CS.metVol = +vol.value; saveS(); sendMetro(); };
  row(f, 'Volume metronomo', vol);
  row(f, 'Suono metronomo', sel([['soft', 'Morbido'], ['wood', 'Legno'], ['click', 'Click']], CS.metSound, set('metSound')));
  row(f, 'Accento sul primo battito', yesno(CS.metAccent, set('metAccent')));
  showWin(w); }

// ===== audio: scheda, buffer, frequenza =====
function audioOpts() { const o = {latencyHint:CS.buf ? CS.buf / (CS.sr || 48000) : 'interactive'}; if (CS.sr) o.sampleRate = CS.sr; if (CS.dev) o.sinkId = CS.dev; return o; }
window.audioOpts = audioOpts; const AUD0 = {buf:CS.buf, sr:CS.sr};
async function listOutputs() { try { return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications'); } catch { return []; } }

// ===== metronomo =====
$('#metroBtn').onclick = () => { CS.metOn = !CS.metOn; saveS(); applyS(); if (CS.metOn && window.ensureCtx) ensureCtx().then(sendMetro); };
{ const op = window.play; window.play = async (...a) => { const r = await op(...a); sendMetro(); return r; }; }

// ===== segui la testina =====
(function follow() { requestAnimationFrame(follow); if (!CS.follow || !playing || state.mode !== 'song' || curB < 0) return;
  const w = $('#plwrap'), x = curB * PL.ppb, vw = PV.w; if (x > w.scrollLeft + vw * .92 || x < w.scrollLeft) w.scrollLeft = Math.max(0, x - vw * .08); })();

// ===== scorciatoie =====
addEventListener('keydown', e => { if (!(e.ctrlKey || e.metaKey) || e.altKey) return; const k = e.code;
  if (k === 'KeyS') { e.preventDefault(); saveProj(e.shiftKey); } else if (k === 'KeyO') { e.preventDefault(); openProj(); }
  else if (k === 'KeyN') { e.preventDefault(); $('#new').click(); } else if (k === 'KeyE') { e.preventDefault(); openExport(CS.exp.fmt); } }, true);

// ===== esportazione =====
const FMT = {wav:'WAV', mp3:'MP3', flac:'FLAC', ogg:'OGG'};
let expBusy = false;
function openExport(fmt) { const w = mkWin('wExp', 'Esportazione audio', 440), f = w.querySelector('.form'); if (fmt) CS.exp.fmt = fmt; const E = CS.exp; f.innerHTML = '';
  const R = {}, put = (k, lbl, ctl) => { R[k] = [f.lastChild, row(f, lbl, ctl)]; R[k][0] = R[k][1].previousSibling; return ctl; }, upd = k => v => { E[k] = isNaN(+v) || v === '' ? v : +v; saveS(); vis(); };
  put('fmt', 'Formato', sel(Object.entries(FMT), E.fmt, upd('fmt')));
  put('range', 'Cosa esportare', sel([['song', 'Song intera'], ['pat', 'Pattern corrente']], E.range, upd('range')));
  put('reps', 'Ripetizioni', sel([1, 2, 4, 8, 16].map(n => [n, '× ' + n]), E.reps, upd('reps')));
  put('sr', 'Frequenza di campionamento', sel([[44100, '44.1 kHz'], [48000, '48 kHz'], [88200, '88.2 kHz'], [96000, '96 kHz']], E.sr, upd('sr')));
  put('bits', 'Profondità di bit', sel([[16, '16 bit'], [24, '24 bit'], [32, '32 bit float']], E.bits, upd('bits')));
  put('kbps', 'Bitrate', sel([128, 160, 192, 224, 256, 320].map(n => [n, n + ' kbps']), E.kbps, upd('kbps')));
  put('okbps', 'Bitrate', sel([96, 128, 160, 192, 256, 320].map(n => [n, n + ' kbps']), E.okbps, upd('okbps')));
  put('ch', 'Canali', sel([[2, 'Stereo'], [1, 'Mono']], E.ch, upd('ch')));
  put('tail', 'Coda finale', sel([0, 1, 2, 4, 8].map(n => [n, n + ' s']), E.tail, upd('tail')));
  put('fade', 'Dissolvenza finale', sel([0, .5, 1, 2, 4].map(n => [n, n ? n + ' s' : 'No']), E.fade, upd('fade')));
  put('norm', 'Normalizza', sel([['off', 'No'], ['-0.1', '−0.1 dBFS'], ['-1', '−1 dBFS'], ['-3', '−3 dBFS']], E.norm, v => { E.norm = v; saveS(); }));
  put('dither', 'Dither', yesno(E.dither, v => { E.dither = v; saveS(); }));
  const nm = el('input'); nm.type = 'text'; nm.value = (state.mode === 'pat' ? curPat().name : (baseName(curPath).replace(/\.(cartesio|curva)$/, '') || 'song')); put('name', 'Nome file', nm);
  const pr = el('div', 'prog'); pr.innerHTML = '<i></i>'; f.append(pr);
  const act = el('div', 'act'); act.innerHTML = '<span class="st"></span><button class="cl">Chiudi</button><button class="go on">Avvia esportazione</button>'; f.append(act);
  const st = act.querySelector('.st'), bar = pr.firstChild, go = act.querySelector('.go');
  act.querySelector('.cl').onclick = () => { w.hidden = true; };
  function vis() { const F = E.fmt, show = (k, on) => { R[k][0].hidden = R[k][1].hidden = !on; };
    show('reps', E.range === 'pat'); show('sr', F !== 'ogg'); show('bits', F === 'wav' || F === 'flac'); show('kbps', F === 'mp3'); show('okbps', F === 'ogg');
    show('dither', (F === 'wav' || F === 'flac') && +E.bits === 16);
    if (F === 'mp3' && +E.sr > 48000) { E.sr = 48000; R.sr[1].value = '48000'; } if (F === 'flac' && +E.bits === 32) { E.bits = 24; R.bits[1].value = '24'; }
    for (const o of R.sr[1].options) o.disabled = F === 'mp3' && +o.value > 48000; for (const o of R.bits[1].options) o.disabled = F === 'flac' && o.value === '32'; }
  vis();
  go.onclick = async () => { if (expBusy) return; expBusy = true; go.disabled = true; bar.style.width = '0';
    const P = (x, t) => { bar.style.width = Math.round(x * 100) + '%'; if (t) st.textContent = T_(t); };
    try { const blob = await doExport({...E}, P); P(1, 'Esportazione completata'); const name = (nm.value.trim() || 'song') + '.' + E.fmt;
      if (window.cartesio && cartesio.saveFile) { const buf = new Uint8Array(await blob.arrayBuffer()); const p = await cartesio.saveFile({path:null, name, data:buf, filters:[{name:FMT[E.fmt], extensions:[E.fmt]}]}); if (p) st.textContent = T_('Esportazione completata') + ' · ' + baseName(p); }
      else download(blob, name); }
    catch (er) { st.textContent = T_('Errore esportazione: ') + er.message; }
    expBusy = false; go.disabled = false; };
  showWin(w); }

async function doExport(o, P) {
  const p = curPat(), song = o.range === 'song', end = songEnd(); if (song && !end) throw new Error(T_('Arrangiamento vuoto'));
  if (allExt().length) toast('I plugin VST3 non vengono applicati all\'export (per ora)');
  const sr = o.fmt === 'ogg' ? 48000 : +o.sr, sec = (song ? beatsToSec(end) : beatsToSec(p.bars * 4 * o.reps, p.bars * 4)) + +o.tail, len = Math.ceil(sec * sr);
  P(0, 'Rendering…'); const oc = new OfflineAudioContext(2, len, sr); await oc.audioWorklet.addModule(getURL());
  const pd = projData(); pd.mode = song ? 'song' : 'pat';
  const out = buildOut(oc), nd = new AudioWorkletNode(oc, 'cartesio', {numberOfInputs:0, outputChannelCount:[2], processorOptions:{proj:pd, play:{b:0, loop:false}}});
  nd.connect(out.comp); out.mg.connect(oc.destination);
  const step = Math.max(.25, sec / 50); for (let t = step; t < sec; t += step) oc.suspend(t).then(() => { P(t / sec * .75); oc.resume(); });
  const buf = await oc.startRendering(); let L = buf.getChannelData(0), R = buf.getChannelData(1);
  if (+o.ch === 1) { const M = new Float32Array(L.length); for (let i = 0; i < M.length; i++) M[i] = (L[i] + R[i]) * .5; L = R = M; }
  const fl = Math.min(L.length, Math.round(+o.fade * sr)); if (fl) for (let i = 0; i < fl; i++) { const g = Math.cos(i / fl * Math.PI / 2) ** 2, j = L.length - fl + i; L[j] *= g; if (R !== L) R[j] *= g; }
  if (o.norm !== 'off') { let pk = 0; for (const C of (R === L ? [L] : [L, R])) for (let i = 0; i < C.length; i++) { const a = Math.abs(C[i]); if (a > pk) pk = a; }
    if (pk > 1e-6) { const g = 10 ** (+o.norm / 20) / pk; for (const C of (R === L ? [L] : [L, R])) for (let i = 0; i < C.length; i++) C[i] *= g; } }
  const ch = +o.ch === 1 ? [L] : [L, R]; P(.8, 'Codifica ' + FMT[o.fmt] + '…'); await new Promise(r => setTimeout(r, 30));
  if (o.fmt === 'wav') return encWav(ch, sr, +o.bits, o.dither);
  if (o.fmt === 'flac') return encFlac(ch, sr, +o.bits, o.dither, P);
  if (o.fmt === 'mp3') return encMp3(ch, sr, +o.kbps, P);
  return encOgg(ch, +o.okbps, P);
}

// --- campioni interi (con dither TPDF a 16 bit) ---
function toInt(C, bits, dither) { const n = C.length, out = new Int32Array(n), mx = 2 ** (bits - 1) - 1, mn = -mx - 1, d = dither && bits === 16;
  for (let i = 0; i < n; i++) { let v = C[i] * mx; if (d) v += Math.random() - Math.random(); v = Math.round(v); out[i] = v > mx ? mx : v < mn ? mn : v; } return out; }

// --- WAV ---
function encWav(ch, sr, bits, dither) { const nc = ch.length, n = ch[0].length, fl = bits === 32, bps = bits / 8, data = n * nc * bps, b = new ArrayBuffer(44 + data), v = new DataView(b);
  const s = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  s(0, 'RIFF'); v.setUint32(4, 36 + data, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, fl ? 3 : 1, true); v.setUint16(22, nc, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * nc * bps, true); v.setUint16(32, nc * bps, true); v.setUint16(34, bits, true); s(36, 'data'); v.setUint32(40, data, true);
  let o = 44; if (fl) { for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) { v.setFloat32(o, ch[c][i], true); o += 4; } }
  else { const I = ch.map(C => toInt(C, bits, dither)); for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) { const x = I[c][i]; if (bits === 16) v.setInt16(o, x, true); else { v.setUint8(o, x & 255); v.setUint8(o + 1, (x >> 8) & 255); v.setUint8(o + 2, (x >> 16) & 255); } o += bps; } }
  return new Blob([b], {type:'audio/wav'}); }

// --- FLAC (predittori fissi + codifica Rice) ---
const P2 = Array.from({length:41}, (_, i) => 2 ** i);
class BW { constructor(n) { this.b = new Uint8Array(n); this.p = 0; this.a = 0; this.n = 0; }
  grow(k) { if (this.p + k > this.b.length) { const x = new Uint8Array(Math.max(this.b.length * 2, this.p + k + 1024)); x.set(this.b); this.b = x; } }
  w(v, n) { if (n > 24) { this.w(Math.floor(v / P2[24]), n - 24); v %= P2[24]; n = 24; } this.a = this.a * P2[n] + v; this.n += n; if (this.n >= 8) { this.grow(4); while (this.n >= 8) { this.n -= 8; const by = Math.floor(this.a / P2[this.n]); this.b[this.p++] = by; this.a -= by * P2[this.n]; } } }
  zeros(n) { while (n > 24) { this.w(0, 24); n -= 24; } if (n) this.w(0, n); }
  align() { if (this.n) this.w(0, 8 - this.n); } }
const CRC8 = new Uint8Array(256), CRC16 = new Uint16Array(256);
for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 128 ? ((c << 1) ^ 7) & 255 : (c << 1) & 255; CRC8[i] = c; let d = i << 8; for (let k = 0; k < 8; k++) d = d & 0x8000 ? ((d << 1) ^ 0x8005) & 0xffff : (d << 1) & 0xffff; CRC16[i] = d; }
async function encFlac(ch, sr, bits, dither, P) {
  const nc = ch.length, n = ch[0].length, I = ch.map(C => toInt(C, bits, dither)), BS = 4096, w = new BW(n * nc * bits / 8 + 4096);
  for (const c of 'fLaC') w.w(c.charCodeAt(0), 8);
  w.w(1, 1); w.w(0, 7); w.w(34, 24); w.w(BS, 16); w.w(BS, 16); w.w(0, 24); w.w(0, 24); w.w(sr, 20); w.w(nc - 1, 3); w.w(bits - 1, 5); w.w(Math.floor(n / P2[32]), 4); w.w(n % P2[32], 32);
  for (let i = 0; i < 16; i++) w.w(0, 8);
  const res = new Int32Array(BS);
  for (let f = 0, s0 = 0; s0 < n; f++, s0 += BS) {
    const bs = Math.min(BS, n - s0), fs = w.p;
    w.w(0x3FFE, 14); w.w(0, 1); w.w(0, 1); w.w(7, 4); w.w(0, 4); w.w(nc - 1, 4); w.w(bits === 16 ? 4 : 6, 3); w.w(0, 1);
    if (f < 0x80) w.w(f, 8); else if (f < 0x800) { w.w(0xC0 | (f >> 6), 8); w.w(0x80 | (f & 63), 8); } else if (f < 0x10000) { w.w(0xE0 | (f >> 12), 8); w.w(0x80 | ((f >> 6) & 63), 8); w.w(0x80 | (f & 63), 8); }
    else { w.w(0xF0 | (f >> 18), 8); w.w(0x80 | ((f >> 12) & 63), 8); w.w(0x80 | ((f >> 6) & 63), 8); w.w(0x80 | (f & 63), 8); }
    w.w(bs - 1, 16); let c8 = 0; for (let i = fs; i < w.p; i++) c8 = CRC8[c8 ^ w.b[i]]; w.w(c8, 8);
    for (let c = 0; c < nc; c++) { const x = I[c].subarray(s0, s0 + bs); let best = -1, bestSum = Infinity;
      for (let o = 0; o <= 4 && o < bs; o++) { let sum = 0; for (let i = o; i < bs; i++) { const r = o === 0 ? x[i] : o === 1 ? x[i] - x[i - 1] : o === 2 ? x[i] - 2 * x[i - 1] + x[i - 2] : o === 3 ? x[i] - 3 * x[i - 1] + 3 * x[i - 2] - x[i - 3] : x[i] - 4 * x[i - 1] + 6 * x[i - 2] - 4 * x[i - 3] + x[i - 4]; sum += r < 0 ? -r : r; } if (sum < bestSum) { bestSum = sum; best = o; } }
      const o = best, cnt = bs - o, mean = cnt ? bestSum / cnt : 0, k = mean > 1 ? Math.min(30, Math.floor(Math.log2(mean))) : 0;
      const estFixed = cnt * (k + 1) + bestSum * 2 / P2[k] + o * bits + 10, estVerb = bs * bits;
      if (k > 14 || estFixed >= estVerb) { w.w(0, 1); w.w(1, 6); w.w(0, 1); for (let i = 0; i < bs; i++) w.w(x[i] < 0 ? x[i] + P2[bits] : x[i], bits); continue; }
      w.w(0, 1); w.w(8 + o, 6); w.w(0, 1); for (let i = 0; i < o; i++) w.w(x[i] < 0 ? x[i] + P2[bits] : x[i], bits);
      w.w(0, 2); w.w(0, 4); w.w(k, 4);
      for (let i = o; i < bs; i++) { const r = o === 0 ? x[i] : o === 1 ? x[i] - x[i - 1] : o === 2 ? x[i] - 2 * x[i - 1] + x[i - 2] : o === 3 ? x[i] - 3 * x[i - 1] + 3 * x[i - 2] - x[i - 3] : x[i] - 4 * x[i - 1] + 6 * x[i - 2] - 4 * x[i - 3] + x[i - 4];
        const u = r >= 0 ? 2 * r : -2 * r - 1, q = Math.floor(u / P2[k]); w.zeros(q); w.w(1, 1); if (k) w.w(u - q * P2[k], k); } }
    w.align(); let c16 = 0; for (let i = fs; i < w.p; i++) c16 = ((c16 << 8) & 0xffff) ^ CRC16[(c16 >> 8) ^ w.b[i]]; w.w(c16, 16);
    if (f % 64 === 0) { P(.8 + .2 * s0 / n); await new Promise(r => setTimeout(r)); } }
  return new Blob([w.b.subarray(0, w.p)], {type:'audio/flac'}); }

// --- MP3 (lamejs) ---
async function encMp3(ch, sr, kbps, P) { if (!window.lamejs) throw new Error('encoder MP3 mancante');
  const nc = ch.length, enc = new lamejs.Mp3Encoder(nc, sr, kbps), I = ch.map(C => Int16Array.from(toInt(C, 16, true))), parts = [], B = 1152 * 20;
  for (let i = 0; i < I[0].length; i += B) { const a = I[0].subarray(i, i + B), r = nc > 1 ? enc.encodeBuffer(a, I[1].subarray(i, i + B)) : enc.encodeBuffer(a); if (r.length) parts.push(new Uint8Array(r));
    if ((i / B) % 20 === 0) { P(.8 + .2 * i / I[0].length); await new Promise(r => setTimeout(r)); } }
  const e = enc.flush(); if (e.length) parts.push(new Uint8Array(e)); return new Blob(parts, {type:'audio/mpeg'}); }

// --- OGG (Opus via WebCodecs, contenitore Ogg) ---
const OCRC = new Uint32Array(256); for (let i = 0; i < 256; i++) { let r = i << 24; for (let k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04C11DB7 : r << 1; OCRC[i] = r >>> 0; }
function oggPage(data, flags, gran, serial, seq) { const segs = []; let l = data.length; while (l >= 255) { segs.push(255); l -= 255; } segs.push(l);
  const p = new Uint8Array(27 + segs.length + data.length), v = new DataView(p.buffer); p.set([79, 103, 103, 83], 0); p[5] = flags;
  v.setUint32(6, gran % P2[32], true); v.setUint32(10, Math.floor(gran / P2[32]), true); v.setUint32(14, serial, true); v.setUint32(18, seq, true); p[26] = segs.length; p.set(segs, 27); p.set(data, 27 + segs.length);
  let c = 0; for (let i = 0; i < p.length; i++) c = ((c << 8) ^ OCRC[((c >>> 24) ^ p[i]) & 255]) >>> 0; v.setUint32(22, c, true); return p; }
async function encOgg(ch, kbps, P) { if (!window.AudioEncoder) throw new Error('OGG non disponibile in questa versione');
  const nc = ch.length, cfg = {codec:'opus', sampleRate:48000, numberOfChannels:nc, bitrate:kbps * 1000};
  if (!(await AudioEncoder.isConfigSupported(cfg)).supported) throw new Error('codifica Opus non supportata');
  const pk = []; let err = null; const enc = new AudioEncoder({output:c => { const d = new Uint8Array(c.byteLength); c.copyTo(d); pk.push(d); }, error:e => { err = e; }}); enc.configure(cfg);
  const n = ch[0].length, F = 960 * 10;
  for (let i = 0; i < n; i += F) { const m = Math.min(F, n - i), d = new Float32Array(m * nc); for (let c = 0; c < nc; c++) d.set(ch[c].subarray(i, i + m), c * m);
    enc.encode(new AudioData({format:'f32-planar', sampleRate:48000, numberOfFrames:m, numberOfChannels:nc, timestamp:Math.round(i / .048), data:d}));
    if ((i / F) % 50 === 0) { P(.8 + .15 * i / n); await new Promise(r => setTimeout(r)); } }
  await enc.flush(); enc.close(); if (err) throw err;
  const pre = 312, serial = (Math.random() * 2 ** 31) >>> 0, head = new Uint8Array(19), hv = new DataView(head.buffer); head.set([79, 112, 117, 115, 72, 101, 97, 100, 1, nc], 0); hv.setUint16(10, pre, true); hv.setUint32(12, 48000, true);
  const ven = new TextEncoder().encode('Cartesio'), tags = new Uint8Array(8 + 4 + ven.length + 4), tv = new DataView(tags.buffer); tags.set(new TextEncoder().encode('OpusTags'), 0); tv.setUint32(8, ven.length, true); tags.set(ven, 12);
  const pages = [oggPage(head, 2, 0, serial, 0), oggPage(tags, 0, 0, serial, 1)]; let g = pre;
  pk.forEach((d, i) => { g += 960; const last = i === pk.length - 1; pages.push(oggPage(d, last ? 4 : 0, last ? pre + n : g, serial, i + 2)); });
  return new Blob(pages, {type:'audio/ogg'}); }

applyS();
