// Cartesio · interfaccia principale (pattern, playlist, mixer, plugin, file)
// ===== Audio → funzione: modello sinusoidale (McAulay–Quatieri) + rumore per bande =====
const A2F = {K:48, N:2048, HOP:512, SR:22050, NB:16};
A2F.edges = Array.from({length:A2F.NB + 1}, (_, i) => 90 * (10500 / 90) ** (i / A2F.NB));
function fftIP(re, im) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a), h = len >> 1; for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let j = 0; j < h; j++) { const p = i + j, q = p + h, vr = re[q] * cr - im[q] * ci, vi = re[q] * ci + im[q] * cr; re[q] = re[p] - vr; im[q] = im[p] - vi; re[p] += vr; im[p] += vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } } }
function resample(x, from, to) { if (from === to) return x; const r = from / to, y = new Float32Array(Math.floor(x.length / r)); // con un piccolo filtro anti-alias
  const k = Math.max(1, Math.round(r)); for (let i = 0; i < y.length; i++) { const c = i * r; let s = 0, n = 0; for (let j = -k; j <= k; j++) { const p = Math.round(c) + j; if (p >= 0 && p < x.length) { s += x[p]; n++; } } y[i] = s / (n || 1); } return y; }
function* a2fGen(x, sr) {
  const {K, N, HOP, NB, edges} = A2F;
  const win = Float64Array.from({length:N}, (_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / N)), ws = win.reduce((a, b) => a + b, 0), w2 = win.reduce((a, b) => a + b * b, 0);
  const frames = Math.ceil(x.length / HOP) + 2, A = [...Array(K)].map(() => new Float32Array(frames)), F = [...Array(K)].map(() => new Float32Array(frames)), B = [...Array(NB)].map(() => new Float32Array(frames));
  const re = new Float64Array(N), im = new Float64Array(N), mag = new Float64Array(N / 2), mask = new Uint8Array(N / 2); let prev = new Array(K).fill(null);
  for (let j = 0; j < frames; j++) {
    const c = j * HOP - N / 2; for (let i = 0; i < N; i++) { const k = c + i; re[i] = (k >= 0 && k < x.length ? x[k] : 0) * win[i]; im[i] = 0; } fftIP(re, im);
    for (let b = 0; b < N / 2; b++) mag[b] = Math.hypot(re[b], im[b]);
    const pk = []; for (let b = 2; b < N / 2 - 1; b++) if (mag[b] > mag[b - 1] && mag[b] >= mag[b + 1] && mag[b] > 1e-5) { const l = Math.log(mag[b - 1] + 1e-12), m = Math.log(mag[b]), r = Math.log(mag[b + 1] + 1e-12), d = .5 * (l - r) / (l - 2 * m + r || 1e-9); pk.push({b, f:(b + d) * sr / N, a:2 * Math.exp(m - .25 * (l - r) * d) / ws}); }
    pk.sort((p, q) => q.a - p.a); const top = pk.slice(0, K), used = new Array(K).fill(false), cur = new Array(K).fill(null);
    for (const p of top) { let bi = -1, bd = 1e9; for (let k = 0; k < K; k++) if (!used[k] && prev[k]) { const dd = Math.abs(prev[k].f - p.f); if (dd < Math.max(25, .04 * p.f) && dd < bd) { bd = dd; bi = k; } } if (bi >= 0) { used[bi] = true; cur[bi] = p; p.ok = 1; } }
    for (const p of top) if (!p.ok) { let k = -1; for (let i = 0; i < K; i++) if (!used[i] && !prev[i]) { k = i; break; } if (k < 0) k = used.findIndex(u => !u); if (k >= 0) { used[k] = true; cur[k] = p; } }
    for (let k = 0; k < K; k++) { if (cur[k]) { A[k][j] = cur[k].a; F[k][j] = cur[k].f; } else { A[k][j] = 0; F[k][j] = prev[k] ? prev[k].f : 0; } }
    prev = cur;
    mask.fill(0); for (const p of top) for (let d = -3; d <= 3; d++) if (p.b + d >= 0 && p.b + d < N / 2) mask[p.b + d] = 1;
    for (let q = 0; q < NB; q++) { const b0 = Math.max(1, Math.floor(edges[q] * N / sr)), b1 = Math.min(N / 2 - 1, Math.ceil(edges[q + 1] * N / sr)); let e = 0, cnt = 0, tot = 0;
      for (let b = b0; b < b1; b++) { tot++; if (!mask[b]) { e += mag[b] ** 2; cnt++; } } B[q][j] = cnt ? Math.sqrt(2 * (e * tot / cnt) / (N * w2) / .111) : 0; }
    yield {j, frames, mag, top, N};
  }
  for (let k = 0; k < K; k++) { let nx = 0; for (let j = frames - 1; j >= 0; j--) { if (A[k][j] > 0) nx = F[k][j]; else F[k][j] = nx || F[k][j]; } }
  return {A, F, B, frames, R:sr / HOP, dur:x.length / sr};
}
function a2fAnalyze(x, sr) { const g = a2fGen(x, sr); let s; do s = g.next(); while (!s.done); return s.value; }
function a2fProgram(r, name) {
  const {K, NB, edges} = A2F, q = v => Math.round(v * 1e4), fq = v => v < 400 ? Math.round(v * 10) / 10 : Math.round(v);
  const lists = (M, f) => '[' + M.map(row => '[' + Array.from(row, f).join(',') + ']').join(',') + ']';
  const C = edges.slice(0, NB).map((e, i) => Math.round(Math.sqrt(e * edges[i + 1]))), W = edges.slice(0, NB).map((e, i) => Math.round(edges[i + 1] - e));
  return ['// "' + name + '" convertito in matematica · ' + r.dur.toFixed(1) + ' s',
    '// ' + K + ' sinusoidi: A[k] ampiezze, F[k] frequenze in Hz, aggiornate R volte al secondo',
    '// ' + NB + ' bande di rumore: B[b] intensità, centro C[b] Hz, larghezza W[b] Hz',
    'R = ' + +r.R.toFixed(4), 'C = [' + C.join(',') + ']', 'W = [' + W.join(',') + ']',
    'A = ' + lists(r.A, q), 'F = ' + lists(r.F, fq), 'B = ' + lists(r.B, q),
    's(k) = tab(A[k], tR)·sin(2π·frac(integ(F[k], tR)/R))', 'n(b) = tab(B[b], tR)·rumore(W[b], t, 1000b)·sin(2π·frac(C[b]·t))',
    'livello = 0.0001', 'f = livello·(Σ_{k=1}^{' + K + '} s(k) + Σ_{b=1}^{' + NB + '} n(b))'].join('\n');
}
function a2fCompare(x, sr, r) {
  const {HOP} = A2F, mo = new Float32Array(r.frames), or = new Float32Array(r.frames); let d = 0, n = 0;
  for (let j = 0; j < r.frames; j++) {
    let s = 0; for (const a of r.A) s += a[j] * a[j] / 2; for (const b of r.B) s += b[j] * b[j] * .111; mo[j] = Math.sqrt(s);
    let e = 0, c = 0; for (let i = j * HOP - HOP / 2; i < j * HOP + HOP / 2; i++) if (i >= 0 && i < x.length) { e += x[i] * x[i]; c++; } or[j] = Math.sqrt(e / (c || 1));
    if (or[j] > .005) { d += Math.abs(20 * Math.log10((mo[j] + 1e-6) / or[j])); n++; }
  }
  return {mo, or, diff:n ? d / n : 0};
}

// ===== Audio esterno → funzione (con visualizzazione della trasformazione) =====
function audioEnv(ch) { // inviluppo del suono convertito, per disegnarlo nelle clip
  if (ch._aek === ch.sound) return ch._ae; ch._aek = ch.sound; ch._ae = null;
  if (!/tab\(A\[k\]/.test(ch.sound || '')) return null;
  try {
    const get = n => JSON.parse((ch.sound.match(new RegExp('^' + n + ' = (\\[.*\\])$', 'm')) || [])[1]);
    const A = get('A'), B = get('B'), R = +ch.sound.match(/^R = ([\d.]+)$/m)[1], n = A[0].length, env = new Float32Array(n); let mx = 1e-9;
    for (let j = 0; j < n; j++) { let s = 0; for (const a of A) s += a[j] * a[j] / 2; for (const b of B) s += b[j] * b[j] * .111; env[j] = Math.sqrt(s); mx = Math.max(mx, env[j]); }
    for (let j = 0; j < n; j++) env[j] /= mx; ch._ae = {env, R};
  } catch {}
  return ch._ae;
}
const nextFrame = () => new Promise(r => requestAnimationFrame(r));
// fotogrammi della conversione: massimo 60 al secondo (stessa durata su qualsiasi schermo); nel tour ne disegna 1 su 3
let cvLast = 0, cvN = 0;
const convFrame = async () => { for (;;) { const t = await nextFrame(); if (t - cvLast >= 15.5) { cvLast = t; return; } } };
async function convertWithViz(x, sr, name) {
  const M = $('#conv'); M.hidden = false; $('#convName').textContent = name; $('#convGo').hidden = true; $('#convFormula').textContent = ''; $('#convStat').textContent = '';
  await convFrame();
  const [g, w, h] = fitCanvas($('#convCv')), say = t => $('#convStep').textContent = t, stat = t => $('#convStat').textContent = t;
  const top = 22, wh = h * .22, mid = top + wh / 2, sy = top + wh + 36, sh = h - sy - 14, LF = Math.log(11000 / 60);
  const fy = f => sy + sh - Math.log(Math.max(60, Math.min(11000, f)) / 60) / LF * sh;
  g.font = 'italic 12px Cambria Math, Georgia, serif'; g.fillStyle = '#9a9a9a'; g.fillText('il suono originale nel tempo', 8, 14); g.fillText('le sue frequenze nel tempo (60 Hz → 11 kHz)', 8, sy - 10);
  // 1 · onda
  say('1 · Ascolto il suono');
  const cols = Math.floor(w), per = x.length / cols, mm = []; let pk = 1e-6;
  for (let i = 0; i < cols; i++) { let lo = 0, hi = 0; for (let k = Math.floor(i * per), e = Math.floor((i + 1) * per); k < e; k++) { const v = x[k]; if (v < lo) lo = v; if (v > hi) hi = v; } mm.push([lo, hi]); pk = Math.max(pk, -lo, hi); }
  const st = Math.ceil(cols / 45);
  for (let i = 0; i < cols; i += st) { g.fillStyle = '#c9c9c9'; for (let k = i; k < Math.min(cols, i + st); k++) g.fillRect(k, mid - mm[k][1] / pk * wh / 2, 1, Math.max(1, (mm[k][1] - mm[k][0]) / pk * wh / 2)); stat('campioni letti ' + Math.min(x.length, Math.round((i + st) * per)).toLocaleString('it')); await convFrame(); }
  // 2 · Fourier
  say('2 · Lo scompongo in frequenze — trasformata di Fourier');
  const gen = a2fGen(x, sr), est = Math.ceil(x.length / A2F.HOP) + 2, every = Math.max(1, Math.round(est / 210)); let s, n = 0;
  while (!(s = gen.next()).done) {
    const {j, frames, mag, top: tp, N} = s.value, cx = j / frames * w, cw = Math.max(1, w / frames + .6);
    for (let py = 0; py < sh; py += 2) { const f = 60 * Math.exp((1 - py / sh) * LF), b = Math.min(N / 2 - 1, Math.round(f * N / sr)), v = Math.min(1, Math.max(0, (Math.log10(mag[b] + 1e-9) + 2.4) / 2.8)); if (v > .03) { g.fillStyle = 'rgba(20,20,20,' + (v * .32).toFixed(3) + ')'; g.fillRect(cx, sy + py, cw, 2); } }
    g.fillStyle = '#141414'; for (const p of tp) if (p.f > 60 && p.f < 11000) g.fillRect(cx, fy(p.f) - .7, 1.4, 1.4);
    if (++n % every === 0) { stat('fotogramma ' + (j + 1) + ' / ' + frames + ' · ' + tp.length + ' picchi trovati'); await convFrame(); }
  }
  const r = s.value;
  // 3 · funzioni
  say('3 · Ogni picco diventa una curva: ' + A2F.K + ' sinusoidi + ' + A2F.NB + ' bande di rumore');
  g.fillStyle = 'rgba(255,255,255,.66)'; g.fillRect(0, sy - 2, w, sh + 4);
  const fx = 'f(t) = Σ A_k(t)·sin(2π∫F_k dt) + Σ B_b(t)·rumore_b(t)';
  for (let k = 0; k < A2F.K; k++) {
    const A = r.A[k], F = r.F[k]; let am = 0; for (const v of A) am = Math.max(am, v);
    g.strokeStyle = 'rgba(20,20,20,' + (.3 + .65 * Math.min(1, am * 8)).toFixed(2) + ')'; g.lineWidth = 1.1; g.beginPath(); let pen = false;
    for (let j = 0; j < r.frames; j++) { if (A[j] <= 0 || F[j] < 60) { pen = false; continue; } const px = j / r.frames * w, py = fy(F[j]); pen ? g.lineTo(px, py) : g.moveTo(px, py); pen = true; }
    g.stroke(); $('#convFormula').textContent = fx.slice(0, Math.round(fx.length * (k + 1) / A2F.K));
    stat('sinusoide ' + (k + 1) + ' / ' + A2F.K + ' · ' + ((k + 1) * 2 * r.frames).toLocaleString('it') + ' numeri scritti'); await convFrame(); await convFrame();
  }
  // 4 · confronto
  say('4 · Confronto — grigio: il suono originale · nero: la matematica');
  const cmp = a2fCompare(x, sr, r); let mx = 1e-6; for (const v of cmp.or) mx = Math.max(mx, v, ...[]);
  g.fillStyle = '#fff'; g.fillRect(0, top - 2, w, wh + 6); g.fillStyle = '#d6d6d6';
  for (let j = 0; j < r.frames; j++) { const px = j / r.frames * w, v = cmp.or[j] / mx * wh / 2; g.fillRect(px, mid - v, Math.max(1, w / r.frames + .5), 2 * v); }
  const seg = Math.ceil(r.frames / 40);
  for (let j0 = 0; j0 < r.frames; j0 += seg) {
    g.strokeStyle = '#141414'; g.lineWidth = 1.4;
    for (const sg of [1, -1]) { g.beginPath(); for (let j = Math.max(0, j0 - 1); j < Math.min(r.frames, j0 + seg); j++) { const px = j / r.frames * w, py = mid - sg * cmp.mo[j] / mx * wh / 2; j > Math.max(0, j0 - 1) ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke(); }
    await convFrame();
  }
  const nums = (2 * A2F.K + A2F.NB) * r.frames;
  stat('differenza media di volume ' + cmp.diff.toFixed(1) + ' dB · ' + nums.toLocaleString('it') + ' numeri · ' + r.dur.toFixed(1) + ' s di suono');
  const src = a2fProgram(r, name);
  $('#convGo').hidden = false; await new Promise(res => { $('#convGo').onclick = res; }); M.hidden = true;
  return {r, src};
}
async function audioSamples(file) {
  const buf = await new OfflineAudioContext(1, 1, A2F.SR).decodeAudioData(await file.arrayBuffer()), x = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < x.length; i++) x[i] += d[i] / buf.numberOfChannels; }
  return {x, sr:buf.sampleRate};
}
async function audioToPattern(x, sr, name, beat, tr) {
  if (!await ask('Convertire "' + name + '" in una funzione?\nCartesio ricrea il suono con ' + A2F.K + ' sinusoidi e ' + A2F.NB + ' bande di rumore, scritte nel suo linguaggio.')) { toast('Nell\'arrangiamento entrano solo funzioni'); return; }
  { let pk = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > pk) pk = a; }   // via il silenzio iniziale: il suono parte sul primo campione della clip
    const th = Math.max(1e-4, pk * .02); let i0 = 0; while (i0 < x.length && Math.abs(x[i0]) < th) i0++; i0 = Math.max(0, i0 - Math.round(.001 * sr)); if (i0 > 0 && i0 < x.length) x = x.subarray(i0); }
  if (x.length > 120 * sr) x = x.subarray(0, 120 * sr);
  const {r, src} = await convertWithViz(x, sr, name);
  const f = bpmFn(); let b = 0, s = 0; while (s < r.dur && b < 256) { s += .25 * 60 / bpmAt(f, beat + b + .125); b += .25; }
  const p = mkPat(name.replace(/\.[^.]+$/, '')); p.bars = Math.max(1, Math.min(64, Math.ceil(b / 4)));
  p.channels = [mkCh({name:p.name, sound:src, comp:'// il suono convertito parte all\'inizio della clip e dura ' + r.dur.toFixed(1) + ' s\ny = {x < ' + +b.toFixed(3) + ': 0}', a:.001, d:1, s:1, r:.01, vol:.9})];
  state.patterns.push(p); state.clips.push({id:nid(), p:p.id, tr, s:beat, l:p.bars * 4, o:0});
  state.selPat = p.id; renderPats(); renderRack(); plChanged(); toast('"' + name + '" adesso è matematica');
}
function bindAudioDrop() {
  const w = $('#plwrap');
  w.addEventListener('dragover', e => { if ([...e.dataTransfer.items].some(i => i.kind === 'file')) { e.preventDefault(); w.classList.add('drop'); } });
  w.addEventListener('dragleave', () => w.classList.remove('drop'));
  w.addEventListener('drop', async e => {
    e.preventDefault(); w.classList.remove('drop'); const f = e.dataTransfer.files[0]; if (!f) return;
    if (!(/^audio\//.test(f.type) || /\.(wav|mp3|ogg|flac|aiff?|m4a)$/i.test(f.name))) return toast('Trascina qui un file audio');
    const p = plPos(e); try { const {x, sr} = await audioSamples(f); await audioToPattern(x, sr, f.name, Math.max(0, snapF(p.b)), p.tr); } catch (er) { notice('Impossibile leggere il file: ' + er.message); }
  });
}

// ===== Import: audio → funzione del suono, MIDI → funzione di composizione =====
const r3 = v => +(+v).toFixed(3), r2 = v => +(+v).toFixed(2);
const fnum = v => { v = r3(v); return v < 0 ? '−' + -v : '' + v; };
const NOTE = m => ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
function fitDecay(ts, vs) { // ln(v) = c − d·t  → d
  const P = ts.map((t, i) => [t, Math.log(Math.max(vs[i], 1e-9))]); if (P.length < 3) return 0;
  const n = P.length, mt = P.reduce((s, p) => s + p[0], 0) / n, mv = P.reduce((s, p) => s + p[1], 0) / n;
  let num = 0, den = 0; for (const [t, v] of P) { num += (t - mt) * (v - mv); den += (t - mt) ** 2; }
  return den ? Math.max(0, -num / den) : 0;
}
function detectF0(x, i0, sr) {
  const W = 2048, tmin = Math.floor(sr / 2000), tmax = Math.min(Math.floor(sr / 30), W - 1);
  if (i0 < 0 || i0 + W + tmax >= x.length) return {f:0, c:0};
  const nsdf = new Float32Array(tmax + 2);
  for (let t = tmin; t <= tmax + 1; t++) { let ac = 0, m = 0; for (let i = 0; i < W; i++) { const a = x[i0 + i], b = x[i0 + i + t]; ac += a * b; m += a * a + b * b; } nsdf[t] = m ? 2 * ac / m : 0; }
  let best = 0; for (let t = tmin; t <= tmax; t++) best = Math.max(best, nsdf[t]);
  let t = tmin; while (t <= tmax && nsdf[t] > 0) t++;            // salta il primo lobo
  for (; t <= tmax; t++) if (nsdf[t] >= .9 * best && nsdf[t] >= nsdf[t - 1] && nsdf[t] >= nsdf[t + 1]) {
    const a = nsdf[t - 1], b = nsdf[t], c = nsdf[t + 1], d = (a - c) / (2 * (a - 2 * b + c) || 1);
    return {f:sr / (t + (isFinite(d) ? d : 0)), c:b};
  }
  return {f:0, c:0};
}
function analyzeAudio(x, sr, name) {
  let peak = 0; for (const v of x) peak = Math.max(peak, Math.abs(v)); if (!peak) throw new Error('il file è silenzioso');
  let s0 = 0; while (s0 < x.length && Math.abs(x[s0]) < peak * .05) s0++;
  x = x.subarray(Math.max(0, s0 - 16), Math.min(x.length, s0 + 3 * sr));
  const hop = Math.round(sr * .005), E = [];
  for (let i = 0; i + hop <= x.length; i += hop) { let s = 0; for (let j = 0; j < hop; j++) s += x[i + j] ** 2; E.push(Math.sqrt(s / hop)); }
  let pk = 0; E.forEach((e, i) => { if (e > E[pk]) pk = i; }); const tPeak = pk * hop / sr, dur = x.length / sr;
  const F = []; for (let k = 0; k < 8; k++) { const t = tPeak + .03 + k * Math.min(.2, (dur - tPeak - .15) / 8); if (t + .1 < dur) F.push(detectF0(x, Math.round(t * sr), sr)); }
  const ok = F.filter(f => f.c > .7 && f.f > 25), fs = ok.map(f => f.f).sort((p, q) => p - q), fmed = fs[fs.length >> 1];
  const near = fs.filter(f => Math.abs(f / fmed - 1) < .06);
  let tonal = near.length >= 2 && near.length >= F.length / 2;
  if (tonal) { // un colpo con la frequenza che crolla o che muore subito è percussivo (kick, tom…)
    const {FV} = zcTrack(x, sr, pk * hop), med = a => { a = [...a].sort((p, q) => p - q); return a[a.length >> 1]; };
    const glide = FV.length >= 6 ? med(FV.slice(0, 3)) / med(FV.slice(Math.floor(FV.length * 2 / 3))) : 1;
    const ts = [], vs = []; for (let i = pk; i < E.length && E[i] > E[pk] * .01; i++) { ts.push((i - pk) * hop / sr); vs.push(E[i]); }
    if (glide > 1.3 || fitDecay(ts, vs) > 10) tonal = false;
  }
  if (tonal) return tonalModel(x, sr, fmed, tPeak, dur, name);
  const r = percModel(x, sr, E, hop, pk, dur, name);
  // se non trova un corpo ma il suono ha comunque un'altezza chiara, meglio il modello intonato
  if (r.noBody && near.length >= 2) return tonalModel(x, sr, fmed, tPeak, dur, name);
  return r;
}
function tonalModel(x, sr, f0, tPeak, dur, name) {
  const K = Math.max(1, Math.min(16, Math.floor(Math.min(9000, sr / 2.2) / f0))), Wn = Math.max(512, Math.round(4 * sr / f0)), step = .02;
  const win = Float32Array.from({length:Wn}, (_, i) => .5 - .5 * Math.cos(TAU * i / (Wn - 1))), ws = win.reduce((a, b) => a + b, 0);
  const T = [], A = [...Array(K)].map(() => []), PH = [...Array(K)].map(() => []);
  for (let t = 0; t + Wn / sr < Math.min(dur, 2.5); t += step) {
    const i0 = Math.round(t * sr); T.push(t);
    for (let k = 1; k <= K; k++) { const w = TAU * k * f0 / sr; let s = 0, c = 0; for (let i = 0; i < Wn; i++) { const v = x[i0 + i] * win[i]; s += v * Math.sin(w * (i0 + i)); c += v * Math.cos(w * (i0 + i)); } A[k - 1].push(2 * Math.hypot(s, c) / ws); PH[k - 1].push(Math.atan2(c, s)); }
  }
  if (T.length < 3) return percModel(x, sr, null, 0, 0, dur, name, true);
  const mx = A.map(a => Math.max(...a)), top = Math.max(...mx), fi = A[0].indexOf(mx[0]);
  const terms = [];
  for (let k = 1; k <= K; k++) {
    const a = mx[k - 1] / top; if (a < .01) continue;
    const j = A[k - 1].indexOf(mx[k - 1]), ts = [], vs = [];
    for (let i = j; i < T.length && A[k - 1][i] > mx[k - 1] * .02; i++) { ts.push(T[i] - T[j]); vs.push(A[k - 1][i]); }
    const d = fitDecay(ts, vs); let ph = PH[k - 1][fi] - k * PH[0][fi]; ph = ((ph % TAU) + TAU + Math.PI) % TAU - Math.PI;
    terms.push({k, a, d, ph});
  }
  const midi = Math.round(69 + 12 * Math.log2(f0 / 440)), cents = Math.round(1200 * Math.log2(f0 / 440) - (midi - 69) * 100);
  const term = ({k, a, d, ph}) => r3(a) + (d > .05 ? 'e^{−' + r2(d) + 't}' : '') + '·sin(' + (k > 1 ? k : '') + 'x' + (Math.abs(ph) > .01 ? (ph < 0 ? ' − ' : ' + ') + r2(Math.abs(ph)) : '') + ')';
  const sound = '// clonato da "' + name + '" · suono intonato\n// f0 ≈ ' + r2(f0) + ' Hz (' + NOTE(midi) + (cents ? (cents > 0 ? ' +' : ' ') + cents + ' cent' : '') + ') · ' + terms.length + ' armoniche, ognuna con il suo decadimento\nf = ' + terms.map(term).join('\n  + ');
  return {sound, kind:'tonal', root:midi, adsr:{a:Math.max(.001, Math.min(.5, r3(tPeak))), d:1, s:1, r:.08}, info:'suono intonato · ' + NOTE(midi) + ' · ' + terms.length + ' armoniche'};
}
function zcTrack(x, sr, i0) { // passa-basso + attraversamenti dello zero → frequenza istantanea del corpo
  const lp = new Float32Array(x.length); let y1 = 0, y2 = 0; const al = 1 - Math.exp(-TAU * 900 / sr);
  for (let i = 0; i < x.length; i++) { y1 += (x[i] - y1) * al; y2 += (y1 - y2) * al; lp[i] = y2; }
  const zc = []; for (let i = i0 + 1; i < Math.min(x.length, i0 + .5 * sr); i++) if (lp[i - 1] < 0 && lp[i] >= 0) zc.push((i - 1 + lp[i - 1] / (lp[i - 1] - lp[i])) / sr);
  const FT = [], FV = [], t0 = i0 / sr; for (let i = 1; i < zc.length; i++) { const f = 1 / (zc[i] - zc[i - 1]); if (f > 20 && f < 2500) { FT.push((zc[i] + zc[i - 1]) / 2 - t0); FV.push(f); } }
  return {lp, FT, FV};
}
function hp4k(x, sr) { // passa-alto a 4 kHz di 4° ordine (due biquad RBJ)
  const w = TAU * 4000 / sr, al = Math.sin(w) / (2 * Math.SQRT1_2), c = Math.cos(w), a0 = 1 + al, b0 = (1 + c) / 2 / a0, b1 = -(1 + c) / a0, a1 = -2 * c / a0, a2 = (1 - al) / a0;
  let y = Float32Array.from(x); for (let p = 0; p < 2; p++) { let x1 = 0, x2 = 0, y1 = 0, y2 = 0; const o = new Float32Array(y.length); for (let i = 0; i < y.length; i++) { const v = b0 * y[i] + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = y[i]; y2 = y1; y1 = v; o[i] = v; } y = o; }
  return y;
}
function nsdfAt(x, i0, W, T) { let ac = 0, m = 0; for (let i = 0; i < W; i++) { const a = x[i0 + i], b = x[i0 + i + T]; ac += a * b; m += a * a + b * b; } return m ? 2 * ac / m : 0; }
const TANH_H = (() => { const t = []; for (let D = 1; D <= 40; D *= 1.08) { let b1 = 0, r2 = 0; for (let k = 0; k < 720; k++) { const th = k / 720 * TAU, v = Math.tanh(D * Math.sin(th)) / Math.tanh(D); b1 += v * Math.sin(th); r2 += v * v; } b1 *= 2 / 720; r2 /= 720; t.push([D, Math.sqrt(Math.max(0, 2 * r2 / (b1 * b1) - 1))]); } return t; })();
function driveOf(x, sr, i0, f, len) { // quanta distorsione c'è: energia oltre la fondamentale → guadagno di tanh equivalente
  const per = sr / f, N = Math.round(Math.max(1, Math.floor(len * f)) * per); if (i0 + N >= x.length) return 0;
  // tolgo il decadimento del volume (altrimenti sembrerebbe distorsione)
  const per2 = Math.round(per), env = new Float32Array(N); for (let n = 0; n < N; n++) { let q = 0, c = 0; for (let j = -per2 >> 1; j < per2 >> 1; j++) { const v = x[i0 + n + j]; if (v !== undefined) { q += v * v; c++; } } env[n] = Math.sqrt(q / (c || 1)) || 1e-9; }
  let re = 0, im = 0, e = 0; for (let n = 0; n < N; n++) { const v = x[i0 + n] / env[n], w = TAU * f * n / sr; re += v * Math.cos(w); im += v * Math.sin(w); e += v * v; }
  const a1 = 2 * Math.hypot(re, im) / N; if (!a1) return 0; const h = Math.sqrt(Math.max(0, 2 * (e / N) / (a1 * a1) - 1));
  if (h < .12) return 0; let best = TANH_H[0]; for (const r of TANH_H) if (Math.abs(r[1] - h) < Math.abs(best[1] - h)) best = r; return best[0];
}
function percModel(x, sr, E, hop, pk, dur, name) {
  if (!E) { E = []; hop = Math.round(sr * .005); for (let i = 0; i + hop <= x.length; i += hop) { let s = 0; for (let j = 0; j < hop; j++) s += x[i + j] ** 2; E.push(Math.sqrt(s / hop)); } pk = 0; E.forEach((e, i) => { if (e > E[pk]) pk = i; }); }
  const t0 = pk * hop / sr, i0 = pk * hop;
  // inviluppo
  let ts = [], vs = []; for (let i = pk; i < E.length && E[i] > E[pk] * .01; i++) { ts.push((i - pk) * hop / sr); vs.push(E[i]); }
  const a = Math.max(1, fitDecay(ts, vs));
  const {lp, FT, FV} = zcTrack(x, sr, i0);
  let le = 0, he = 0; for (let i = i0; i < Math.min(x.length, i0 + .3 * sr); i++) { le += lp[i] ** 2; he += (x[i] - lp[i]) ** 2; }
  const hasBody = FV.length >= 4 && Math.sqrt(le / (he || 1e-12)) > .6;
  let n = 0, dn = 1;
  if (!hasBody) { // niente corpo: è quasi tutto rumore (hat, shaker…)
    let hpE = [], ht = []; for (let i = pk; i < E.length && i < pk + 200; i++) { let s = 0; for (let j = 0; j < hop; j++) { const k = i * hop + j; if (k < x.length) s += (x[k] - lp[k]) ** 2; } hpE.push(Math.sqrt(s / hop)); ht.push((i - pk) * hop / sr); }
    const nPk = Math.max(...hpE, 0); n = Math.min(2, nPk / (E[pk] || 1) * 1.5);
    let hts = [], hvs = []; const hm = hpE.indexOf(nPk); for (let i = hm; i < hpE.length && hpE[i] > nPk * .02; i++) { hts.push(ht[i] - ht[hm]); hvs.push(hpE[i]); }
    dn = Math.max(1, fitDecay(hts, hvs));
  } else { // c'è un corpo: il rumore vero (click, fruscio) sta sopra i 4 kHz, dove corpo e distorsione non arrivano quasi
    const hp = hp4k(x, sr), nv = [], nt = [];
    for (let k = pk; k < E.length && k < pk + 60; k++) { let q = 0; for (let j = 0; j < hop; j++) q += hp[k * hop + j] ** 2; nv.push(Math.sqrt(q / hop) / .9 / (E[pk] || 1)); nt.push((k - pk) * hop / sr); }
    const nPk = Math.max(0, ...nv.slice(0, 6)); if (nPk > .15) { n = Math.min(1, nPk); const hm = nv.indexOf(nPk), ts2 = [], vs2 = []; for (let i = hm; i < nv.length && nv[i] > nPk * .05; i++) { ts2.push(nt[i] - nt[hm]); vs2.push(nv[i]); } dn = Math.max(10, fitDecay(ts2, vs2)); }
  }
  const lines = ['// clonato da "' + name + '" · colpo percussivo'];
  let body = '0', drive = 0;
  if (hasBody) {
    const late = FV.slice(Math.floor(FV.length * 2 / 3)).sort((p, q) => p - q), Fe = late[late.length >> 1], F0 = Math.max(...FV.slice(0, 3));
    const kq = (() => { const gt = [], gv = []; FT.forEach((t, i) => { if (FV[i] - Fe > (F0 - Fe) * .05) { gt.push(t); gv.push(FV[i] - Fe); } }); return Math.max(5, fitDecay(gt, gv)); })();
    const ts = F0 / Fe > 1.15 ? Math.max(.12, Math.log(Math.max(1.01, (F0 - Fe) / (.01 * Fe))) / kq) : .05;
    drive = driveOf(x, sr, i0 + Math.round(ts * sr), Fe, Math.min(.15, dur - ts - .05));
    if (F0 / Fe > 1.15) {
      const gt = [], gv = []; FT.forEach((t, i) => { if (FV[i] - Fe > (F0 - Fe) * .05) { gt.push(t); gv.push(FV[i] - Fe); } });
      const k = Math.max(5, fitDecay(gt, gv));
      lines.push('// la frequenza scende da ' + Math.round(F0) + ' a ' + Math.round(Fe) + ' Hz (fase = integrale della frequenza)', 'F(t) = ' + r2(Fe) + 't + ' + r2(F0 - Fe) + '/' + r2(k) + '·(1 − e^{−' + r2(k) + 't})');
    } else lines.push('// corpo a ' + Math.round(Fe) + ' Hz', 'F(t) = ' + r2(Fe) + 't');
    body = drive > 1.15 ? 'tanh(' + r2(drive) + 'sin(2π·F(t)))' : 'sin(2π·F(t))';
    if (drive > 1.15) lines.push('// saturazione misurata sul suono: tanh con guadagno ' + r2(drive));
  }
  lines.push('// volume che si spegne', 'A(t) = e^{−' + r2(a) + 't}');
  if (n > .03) lines.push('// componente di rumore', 'N(t) = ' + r3(n) + 'e^{−' + r2(dn) + 't}·noise()');
  const parts = []; if (body !== '0') parts.push('A(t)·' + body); if (n > .03) parts.push('N(t)'); if (!parts.length) parts.push('A(t)·noise()');
  lines.push('f = ' + parts.join(' + '));
  return {noBody:!hasBody, sound:lines.join('\n'), kind:'perc', adsr:{a:.001, d:1, s:1, r:.02}, info:'colpo percussivo' + (hasBody ? ' con corpo tonale' + (drive > 1.15 ? ' saturato' : '') : '') + (n > .03 ? ' + rumore' : '')};
}
async function cloneAudioFile(file) {
  const buf = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await file.arrayBuffer());
  const x = new Float32Array(buf.length); for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < x.length; i++) x[i] += d[i] / buf.numberOfChannels; }
  return analyzeAudio(x, buf.sampleRate, file.name);
}
// ---- MIDI ----
function parseMidi(ab) {
  const d = new DataView(ab), u8 = new Uint8Array(ab); let p = 0;
  const str = n => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(u8[p + i]); p += n; return s; };
  const vlq = () => { let v = 0, b; do { b = u8[p++]; v = (v << 7) | (b & 127); } while (b & 128); return v; };
  if (str(4) !== 'MThd') throw new Error('non è un file MIDI');
  const hl = d.getUint32(p); p += 4; const ntr = d.getUint16(p + 2), div = d.getUint16(p + 4); p += hl;
  const tpq = div & 0x8000 ? 480 : div; let tempo = 0; const notes = [];
  for (let t = 0; t < ntr && p < u8.length; t++) {
    if (str(4) !== 'MTrk') break; const len = d.getUint32(p); p += 4; const end = p + len; let tick = 0, rs = 0; const on = new Map();
    while (p < end) {
      tick += vlq(); let st = u8[p]; if (st & 128) p++; else st = rs;
      if (st === 0xFF) { const ty = u8[p++], l = vlq(); if (ty === 0x51 && !tempo) tempo = (u8[p] << 16) | (u8[p + 1] << 8) | u8[p + 2]; p += l; if (ty === 0x2F) break; continue; }
      if (st === 0xF0 || st === 0xF7) { p += vlq(); continue; }
      rs = st; const ty = st & 0xF0, ch = st & 15;
      if (ty === 0x90 || ty === 0x80) { const n = u8[p++], v = u8[p++], key = ch * 128 + n;
        if (ty === 0x90 && v > 0) { if (!on.has(key)) on.set(key, []); on.get(key).push(tick); }
        else if (on.has(key) && on.get(key).length) notes.push({s:on.get(key).shift() / tpq, e:tick / tpq, m:n, ch}); }
      else p += ty === 0xC0 || ty === 0xD0 ? 1 : 2;
    }
    p = end;
  }
  return {tempo:tempo ? 60e6 / tempo : 0, notes};
}
function midiToFunction(ab, name, root = 60) {
  const {tempo, notes: all} = parseMidi(ab);
  let notes = all.filter(n => n.ch !== 9); if (!notes.length) notes = all; if (!notes.length) throw new Error('nessuna nota nel file');
  const off = Math.floor(Math.min(...notes.map(n => n.s)) / 4) * 4;
  notes = notes.map(n => ({...n, s:n.s - off, e:n.e - off})).filter(n => n.s < 256).sort((a, b) => a.s - b.s || a.m - b.m);
  const slots = []; let dropped = 0;
  for (const n of notes) { let j = slots.findIndex(sl => sl.end <= n.s + 1e-6); if (j < 0) { if (slots.length >= 8) { dropped++; continue; } slots.push({end:0, notes:[]}); j = slots.length - 1; } slots[j].notes.push(n); slots[j].end = n.e; }
  const L = Math.min(256, Math.ceil(Math.max(...notes.map(n => n.e)) / 4) * 4);
  const lines = ['// importato da "' + name + '" · ' + (notes.length - dropped) + ' note · ' + L / 4 + ' battute' + (tempo ? ' · ' + r2(tempo) + ' BPM' : ''), '// y = 0 è ' + NOTE(root) + ', ogni intervallo  a ≤ x < b  è una nota (in semitoni)'];
  slots.forEach((sl, j) => {
    const parts = sl.notes.map(n => { const e = n.e - Math.min(.02, (n.e - n.s) * .2); return r3(n.s) + ' ≤ x < ' + r3(e) + ': ' + (n.m - root); });
    lines.push('V' + (j + 1) + '(x) = {' + parts.join(',\n  ') + '}');
  });
  lines.push('y = ' + (slots.length === 1 ? 'V1(x)' : '[' + slots.map((_, j) => 'V' + (j + 1) + '(x)').join(', ') + ']'));
  return {comp:lines.join('\n'), bars:L / 4, tempo, voices:slots.length, count:notes.length - dropped, dropped};
}

// ===== Interfaccia v3 =====
const $ = s => document.querySelector(s);
const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
const NN = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'], noteName = m => NN[m % 12] + (Math.floor(m / 12) - 1);
const SOUNDS = [
 {name:'Seno',sound:'sin(x)'},{name:'Quadra',sound:'sq(x)',s:.6},{name:'Sega',sound:'saw(x)'},{name:'Triangolo',sound:'tri(x)'},
 {name:'Parabola',sound:'(x - π)^2'},{name:'Armonici',sound:'sin(x) + sin(2x)/2 + sin(3x)/3'},
 {name:'Organo',sound:'sin(x) + 0.5sin(2x) + 0.25sin(4x) + 0.12sin(8x)',a:.02,s:.9},
 {name:'Rumore',sound:'noise()',a:.001,d:.05,s:0,r:.02},{name:'Rullante',sound:'0.7noise() + 0.3sin(x)',a:.001,d:.18,s:0,r:.05},
 {name:'Pluck',sound:'saw(x)e^{-8t} + 0.2sin(x)',a:.002,d:.3,s:.2,r:.15},{name:'Campana FM',sound:'sin(x + 4e^{-3t}sin(3x))',a:.002,d:1.2,s:0,r:.8},
 {name:'Acid',sound:'tanh(5saw(x)e^{-5t})',a:.002,d:.25,s:.3,r:.08},{name:'Wobble',sound:'tanh(sin(x)(1 + 6(0.5 + 0.5sin(6πt))))',s:.9}];
const DEF_CH = {ins:0,sound:'sin(x)',comp:'',unit:'semitoni',root:57,oct:0,vol:.7,pan:0,a:.005,d:.2,s:.7,r:.15};
const KNOBS = [['vol','Volume',0,1,.01],['pan','Pan',-1,1,.01],['oct','Ottava',-3,3,1],['a','Attacco',.001,1,.001],['d','Decadimento',.01,2,.01],['s','Sostegno',0,1,.01],['r','Rilascio',.005,2,.005]];
const TRACKS = 80, TH = 30, RUL = 22, TW = 84;
const NINS = 12;
const mkMixer = () => [{name:'Master',vol:.8,pan:0,mute:false,fx:[]}, ...Array.from({length:NINS}, (_, i) => ({name:'Insert ' + (i + 1),vol:1,pan:0,mute:false,fx:[]}))];
const mkFx = (type, p = {}) => ({id:nid(), type, on:true, p:{...Object.fromEntries(FXDEF[type].p.map(([k, , d]) => [k, d])), ...p}});
const state = {bpm:'130',mode:'pat',patterns:[],clips:[],selPat:null,tmute:[],mixer:mkMixer()};
let selIns = 0, selFx = 0, meterPk = [], meterLv = [], meterEls = [], fxVals = [];
let uid = 1; const nid = () => uid++;
const patById = id => state.patterns.find(p => p.id === id), curPat = () => patById(state.selPat);
const chById = id => { for (const p of state.patterns) for (const c of p.channels) if (c.id === id) return [c, p]; return [null, null]; };
const mkPat = name => ({id:nid(), name:name || 'Pattern ' + (state.patterns.length + 1), bars:1, channels:[]});
const mkCh = (o = {}) => Object.assign({}, DEF_CH, o, {id:nid(), mute:false, solo:false, name:o.name || 'Canale'});
const strip_ = (k, v) => k.startsWith('_') ? undefined : v;
const songEnd = () => Math.ceil(Math.max(0, ...state.clips.map(c => c.s + c.l)) / 4) * 4;
const win = {sound:null, comp:null};

function newProject() { uid = 1; Object.assign(state, {bpm:'130',mode:'pat',patterns:[],clips:[],tmute:[],mixer:mkMixer()}); selIns = 0; selFx = 0; const p = mkPat('Pattern 1'); state.patterns.push(p); state.selPat = p.id; }
function demo() {
  newProject(); const S = n => SOUNDS.find(s => s.name === n), C = (name, snd, o) => { const s = {...S(snd)}; delete s.name; return mkCh({...s, ...o, name}); };
  const beat = state.patterns[0]; beat.name = 'Battito';
  beat.channels = [
    C('Kick', 'Seno', {unit:'ottave', root:45, a:.001, d:.35, s:0, r:.04, vol:.95, comp:'// un salto di 4.7 ottave che ricade in modo esponenziale\nK(d) = 4.7e^{-12d} - 2.2\ny = {x mod 1 < 1/2: K(x mod 1)}'}),
    C('Rullante', 'Rullante', {unit:'ottave', root:50, vol:.5, comp:'y = {⌊x⌋ mod 2 = 1: 1.2e^{-20(x mod 1)}}'}),
    C('Hat', 'Rumore', {root:72, vol:.22, pan:.25, comp:'y = {x mod 1 ≥ 1/2: 0}'})];
  const bass = mkPat('Basso'); bass.bars = 4;
  bass.channels = [C('Basso', 'Acid', {root:33, vol:.55, comp:'// radici degli accordi: La, Fa, Do, Sol (in semitoni)\nr(n) = seq(n, 0, -4, 3, -2)\ny = {x mod 0.5 < 0.4: r(x/4) + 12(x mod 1 ≥ 0.5)}'})];
  const arp = mkPat('Arpeggio'); arp.bars = 4;
  arp.channels = [C('Arpeggio', 'Pluck', {root:69, vol:.35, pan:-.2, comp:'c(n) = seq(n, 0, -4, 3, -2)\n// terza minore sul La, maggiore sugli altri\nt3(n) = seq(n, 3, 4, 4, 4)\ny = {x mod 0.25 < 0.2: c(x/4) + seq(4x, 0, t3(x/4), 7, 12, 7, t3(x/4))}'})];
  const des = mkPat('Desmos originale');
  des.channels = [C('Desmos', 'Seno', {unit:'ottave', root:45, a:.002, d:.1, s:1, r:.05, vol:.7, comp:'K(d) = 4.7e^{-12d} - 2.2\ny = {⌊x⌋ mod 4 = 3: K(2x mod 1), x mod 1 < 1/2: K(x mod 1), -1.25}'})];
  const pad = mkPat('Accordi'); pad.bars = 4;
  pad.channels = [mkCh({name:'Pad', sound:'// serie di Fourier: armoniche che calano come 1/k²\nf = Σ_{k=1}^{6} sin(kx)/k²', root:57, vol:.22, pan:.1, a:.25, d:.5, s:.8, r:.4,
    comp:'// una lista = un accordo (triade sulla radice di ogni battuta)\nr(n) = seq(n, 0, -4, 3, -2)\nt3(n) = seq(n, 3, 4, 4, 4)\ny = {x mod 4 < 3.75: r(x/4) + [0, t3(x/4), 7]}'})];
  state.patterns.push(bass, arp, des, pad);
  state.clips = [{id:nid(),p:arp.id,tr:2,s:0,l:64,o:0},{id:nid(),p:beat.id,tr:0,s:16,l:48,o:0},{id:nid(),p:bass.id,tr:1,s:16,l:48,o:0},{id:nid(),p:des.id,tr:3,s:64,l:16,o:0},{id:nid(),p:pad.id,tr:4,s:16,l:48,o:0}];
  const M = state.mixer, F = mkFx, route = (p, name, i) => { const c = p.channels.find(c => c.name === name); if (c) c.ins = i; };
  M[1].name = 'Kick'; M[1].fx = [F('dist', {curva:'tanh(2.5s)', out:'0.9'}), F('eq', {lg:'3', mf:'400', mg:'-3'})];
  M[2].name = 'Snare'; M[2].fx = [F('eq', {hg:'3'}), F('rev', {size:'0.6', mix:'0.22'})];
  M[3].name = 'Hat'; M[3].fx = [F('eq', {lf:'400', lg:'-12'})];
  M[4].name = 'Basso'; M[4].fx = [F('comp', {thr:'-20', ratio:'5'}), F('dist', {curva:'s + 0.4sin(3s)', mix:'0.5'})];
  M[5].name = 'Arpeggio'; M[5].fx = [F('delay', {time:'3/4', fb:'0.45', mix:'0.25 + 0.15sin(πb/16)'}), F('chorus')];
  M[6].name = 'Pad'; M[6].fx = [F('phaser', {rate:'0.2'}), F('rev', {size:'0.85', damp:'0.5', mix:'0.35'})];
  M[0].fx = [F('eq', {lg:'1.5', hg:'1.5'}), F('comp', {thr:'-10', ratio:'3', att:'10', rel:'150', gain:'2'})];
  route(beat, 'Kick', 1); route(beat, 'Rullante', 2); route(beat, 'Hat', 3); route(bass, 'Basso', 4); route(arp, 'Arpeggio', 5); route(pad, 'Pad', 6); route(des, 'Desmos', 1);
  state.mode = 'song'; state.selPat = beat.id;
}

// ---- Tempo ----
const bpmFn = () => { try { return compileProg(state.bpm, 'b'); } catch { return null; } };
function bpmAt(f, b) { let v = f ? +f(b) : 128; return isFinite(v) ? Math.min(400, Math.max(20, v)) : 128; }
function beatsToSec(beats, patL) { const f = bpmFn(), st = 1 / 16; let s = 0; for (let b = 0; b < beats; b += st) { const bb = b + st / 2; s += st * 60 / bpmAt(f, patL ? bb % patL : bb); } return s; }

// ---- Audio ----
let aL, aR, liveNv = 0, ctx, node, analyser, ready = null, playing = false, curB = -1, headDirty = true, procURL;
const getURL = () => procURL || (procURL = URL.createObjectURL(new Blob([srcText('engine.js'), '\n', srcText('processor.js')], {type:'text/javascript'})));
// testo dei moduli del motore audio: nell'app lo legge il processo principale, nel browser una richiesta sincrona
function srcText(n) { if (window.cartesio && cartesio.readSrc) return cartesio.readSrc(n); const x = new XMLHttpRequest(); x.open('GET', 'js/' + n, false); x.send(); return x.responseText; }
// limitatore di sicurezza dopo il master (evita il clipping digitale)
function buildOut(ac) { const comp = ac.createDynamicsCompressor(); comp.threshold.value = -1; comp.knee.value = 0; comp.ratio.value = 20; comp.attack.value = .001; comp.release.value = .1; return {comp, mg:comp}; }
const projData = loop => JSON.parse(JSON.stringify({bpm:state.bpm,mode:state.mode,selPat:state.selPat,patterns:state.patterns,clips:state.clips,tmute:state.tmute,end:songEnd(),mixer:state.mixer,lat:(window.CS && CS.extLat) || 4096}, (k, v) => k === 'state' ? undefined : strip_(k, v)));
function ensureCtx() {
  if (ready) { if (ctx.state === 'suspended') ctx.resume(); return ready; }
  ctx = new AudioContext(window.audioOpts ? audioOpts() : {latencyHint:'interactive'});
  return ready = ctx.audioWorklet.addModule(getURL()).then(() => {
    const o = buildOut(ctx);
    node = new AudioWorkletNode(ctx, 'cartesio', {numberOfInputs:0, outputChannelCount:[2], processorOptions:{proj:projData()}});
    node.connect(o.comp); analyser = ctx.createAnalyser(); analyser.fftSize = 1024; o.mg.connect(analyser); analyser.connect(ctx.destination);
    const sp = ctx.createChannelSplitter(2); o.mg.connect(sp); aL = ctx.createAnalyser(); aR = ctx.createAnalyser(); aL.fftSize = aR.fftSize = 512; sp.connect(aL, 0); sp.connect(aR, 1);
    setTimeout(hostLink, 0); node.port.onmessage = e => { const d = e.data; if (d.nv !== undefined) liveNv = d.nv; if (d.pk) d.pk.forEach((v, i) => meterPk[i] = Math.max(meterPk[i] || 0, v)); if (playing) { curB = d.b; headDirty = true; } };
  });
}
let spT; function sendProj(now) { clearTimeout(spT); const f = () => node && node.port.postMessage({type:'proj', proj:projData()}); now ? f() : spT = setTimeout(f, 40); }
async function play() {
  if (state.mode === 'song' && !songEnd()) return toast('Arrangiamento vuoto: piazza un pattern nella playlist');
  await ensureCtx(); sendProj(true); const b0 = state.mode === 'song' ? PL.start || 0 : 0; node.port.postMessage({type:'play', b:b0}); playing = true; curB = b0; $('#play').classList.add('on');
}
function stop() { if (node) node.port.postMessage({type:'stop'}); playing = false; curB = -1; headDirty = true; $('#play').classList.remove('on'); }
async function preview(ch, dur = .5) { await ensureCtx(); sendProj(true); node.port.postMessage({type:'note', ch:ch.id, dur}); }
const UNDO = {past:[], future:[], cur:null, busy:false};
function flushSave() { clearTimeout(changed.t); changed.t = 0; const s = serialize(); if (!UNDO.busy && UNDO.cur !== null && s !== UNDO.cur) { UNDO.past.push(UNDO.cur); while (UNDO.past.length > ((window.CS && CS.undo) || 60)) UNDO.past.shift(); UNDO.future.length = 0; } if (!UNDO.busy) UNDO.cur = s; if (!window.CS || CS.autosave) try { localStorage.setItem('cartesio.project', s); } catch {} }
function changed(audio = true) { if (audio) sendProj(); clearTimeout(changed.t); changed.t = setTimeout(flushSave, 400); }
function resetUndo() { UNDO.past = []; UNDO.future = []; UNDO.cur = serialize(); }
function undoRedo(redo) { if (changed.t) flushSave(); const from = redo ? UNDO.future : UNDO.past, to = redo ? UNDO.past : UNDO.future; if (!from.length) return toast(redo ? 'Niente da ripetere' : 'Niente da annullare');
  to.push(UNDO.cur); const s = from.pop(); UNDO.busy = true; const ki = selIns, kf = selFx;
  try { load(JSON.parse(s)); selIns = Math.min(ki, state.mixer.length - 1); selFx = kf; $('#bpm').value = state.bpm; $('#bpm').classList.toggle('bad', !bpmFn()); $('#master').value = state.mixer[0].vol;
    $('#mPat').classList.toggle('on', state.mode === 'pat'); $('#mSong').classList.toggle('on', state.mode === 'song');
    for (const w of ['#wComp', '#wSound', '#wFx']) if ($(w)) $(w).hidden = true; win.comp = win.sound = null;
    renderPats(); renderRack(); layoutPl(); renderMixer(); hostSync(); hostApplyAll(); sendProj(true); headDirty = true; UNDO.cur = s; try { localStorage.setItem('cartesio.project', s); } catch {} }
  finally { UNDO.busy = false; } }
async function exportWav() {
  const end = songEnd(), p = curPat(); if (state.mode === 'song' && !end) return toast('Arrangiamento vuoto');
  if (allExt().length) toast('I plugin VST3 non vengono applicati all\'export (per ora)');
  const btn = $('#exp'); btn.textContent = 'Rendering…'; btn.disabled = true;
  try {
    const sec = state.mode === 'song' ? beatsToSec(end) + 2 : beatsToSec(p.bars * 16, p.bars * 4), sr = 44100;
    const oc = new OfflineAudioContext(2, Math.ceil(sec * sr), sr); await oc.audioWorklet.addModule(getURL());
    const o = buildOut(oc), nd = new AudioWorkletNode(oc, 'cartesio', {numberOfInputs:0, outputChannelCount:[2], processorOptions:{proj:projData(), play:{b:0, loop:false}}});
    nd.connect(o.comp); o.mg.connect(oc.destination);
    download(wav(await oc.startRendering()), (state.mode === 'pat' ? p.name : 'song') + '.wav');
  } catch (e) { notice('Errore esportazione: ' + e.message); }
  btn.textContent = 'Esporta WAV'; btn.disabled = false;
}

// ---- File ----
const serialize = () => JSON.stringify({app:'cartesio', v:3, ...state}, strip_, 1);
function load(o) {
  if (!o || o.v !== 3 || !Array.isArray(o.patterns) || !o.patterns.length) throw new Error('file non valido (serve un progetto Cartesio)');
  Object.assign(state, {bpm:String(o.bpm ?? '130'), mode:o.mode === 'song' ? 'song' : 'pat', clips:o.clips || [], tmute:o.tmute || []});
  state.patterns = o.patterns.map(p => ({...p, channels:p.channels.map(c => Object.assign({}, DEF_CH, c))}));
  uid = Math.max(0, ...state.patterns.flatMap(p => [p.id, ...p.channels.map(c => c.id)]), ...state.clips.map(c => c.id), ...(o.mixer || []).flatMap(m => (m.fx || []).map(f => +f.id || 0))) + 1;
  state.selPat = patById(o.selPat) ? o.selPat : state.patterns[0].id;
  const M = mkMixer(); (o.mixer || []).forEach((s, i) => { if (M[i]) M[i] = {...M[i], ...s, fx:(s.fx || []).filter(f => FXDEF[f.type] || f.type === 'ext')}; }); if (!o.mixer && o.master != null) M[0].vol = o.master; state.mixer = M; selIns = 0; selFx = 0;
}
function download(blob, name) { const a = el('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
function wav(buf) {
  const nc = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate, ab = new ArrayBuffer(44 + len * nc * 2), v = new DataView(ab);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0,'RIFF'); v.setUint32(4, 36 + len * nc * 2, true); ws(8,'WAVE'); ws(12,'fmt '); v.setUint32(16,16,true); v.setUint16(20,1,true);
  v.setUint16(22,nc,true); v.setUint32(24,sr,true); v.setUint32(28,sr*nc*2,true); v.setUint16(32,nc*2,true); v.setUint16(34,16,true);
  ws(36,'data'); v.setUint32(40, len * nc * 2, true);
  const d = [...Array(nc)].map((_, i) => buf.getChannelData(i)); let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < nc; c++) { const s = Math.max(-1, Math.min(1, d[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return new Blob([ab], {type:'audio/wav'});
}
let toastT; function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }

// ---- Curve ----
function fitCanvas(c) { const w = c.clientWidth, h = c.clientHeight, r = devicePixelRatio || 1; c.width = Math.max(1, Math.round(w * r)); c.height = Math.max(1, Math.round(h * r)); const g = c.getContext('2d'); g.setTransform(r,0,0,r,0,0); return [g, w, h]; }
function sizeCanvas(c, w, h) { const r = devicePixelRatio || 1; w = Math.max(1, w); h = Math.max(1, h); c.width = Math.round(w * r); c.height = Math.round(h * r); c.style.width = w + 'px'; c.style.height = h + 'px'; const g = c.getContext('2d'); g.setTransform(r,0,0,r,0,0); return g; }
function compY(ch) { if (!ch.comp || !ch.comp.trim()) return {Y:null, err:''}; try { return {Y:compileProg(ch.comp, 'x'), err:''}; } catch (e) { return {Y:null, err:e.message}; } }
const yVals = (Y, x) => { let v; try { v = Y(x); } catch { return [NaN]; } if (!Array.isArray(v)) v = [v]; return v.slice(0, 8).map(a => { a = +a; return isFinite(a) ? a : NaN; }); };
function sampleY(Y, x0, x1, N) { const S = []; let n = 1; for (let i = 0; i <= N; i++) { const v = yVals(Y, x0 + (x1 - x0) * i / N); n = Math.max(n, v.length); S.push(v); } return {S, n}; }
function chRange(ch, L) {
  const k = ch.comp + '|' + L; if (ch._rk === k) return ch._r; const {Y} = compY(ch); let lo = Infinity, hi = -Infinity;
  if (Y) for (let i = 0; i <= 400; i++) for (const v of yVals(Y, i / 400 * L)) if (v === v) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if (hi - lo < 1e-6) { lo -= 1; hi += 1; } ch._rk = k; return ch._r = [lo, hi];
}
function headX(p) {
  if (!playing || curB < 0) return -1; const L = p.bars * 4;
  if (state.mode === 'pat') return p.id === state.selPat ? curB % L : -1;
  const c = state.clips.find(c => c.p === p.id && curB >= c.s && curB < c.s + c.l && !state.tmute.includes(c.tr));
  return c ? ((curB - c.s + c.o) % L + L) % L : -1;
}
function strokeCurve(g, Y, x0, x1, N, X, Yp) {
  const {S, n} = sampleY(Y, x0, x1, N);
  for (let j = 0; j < n; j++) {
    g.beginPath(); let pen = false;
    for (let i = 0; i <= N; i++) { const v = S[i][j]; if (v === undefined || v !== v) { pen = false; continue; } const px = X(x0 + (x1 - x0) * i / N), py = Yp(v); pen ? g.lineTo(px, py) : g.moveTo(px, py); pen = true; }
    g.stroke();
  }
}
function niceStep(r) { const p = 10 ** Math.floor(Math.log10(r)), n = r / p; return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p; }
function drawStrip(c, ch, p) {
  const [g, w, h] = fitCanvas(c), L = p.bars * 4, X = x => x / L * w;
  for (let b = 1; b < L; b++) { g.fillStyle = b % 4 ? '#f1f1f1' : '#dcdcdc'; g.fillRect(Math.round(X(b)), 0, 1, h); }
  const {Y, err} = compY(ch);
  if (Y) { const [lo, hi] = chRange(ch, L); g.strokeStyle = ch.mute ? '#c4c4c4' : '#141414'; g.lineWidth = 1.4; g.lineJoin = 'round'; strokeCurve(g, Y, 0, L, w * 2, X, v => 4 + (hi - v) / (hi - lo) * (h - 8)); }
  else { g.fillStyle = err ? '#ff3b30' : '#b0b0b0'; g.font = 'italic 12px Cambria Math, Georgia, serif'; g.textBaseline = 'middle'; g.fillText(err ? 'errore: ' + err : 'y = …   (clicca per comporre)', 8, h / 2); }
  const hx = headX(p); if (hx >= 0) { g.fillStyle = '#ff3b30'; g.fillRect(X(hx), 0, 1.5, h);
    if (Y) { const [lo, hi] = chRange(ch, L); for (const v of yVals(Y, hx)) if (v === v) { g.fillStyle = '#141414'; g.beginPath(); g.arc(X(hx), 4 + (hi - v) / (hi - lo) * (h - 8), 3.2, 0, TAU); g.fill(); } } }
}

// ---- Piano cartesiano (composizione) ----
function drawPlane() {
  const [ch, p] = chById(win.comp); if (!ch || $('#wComp').hidden) return;
  const c = $('#cplane'), [g, w, h] = fitCanvas(c), L = p.bars * 4, {Y, err} = compY(ch);
  $('#cerr').textContent = err;
  const x0 = -L * .045, x1 = L * 1.035; let lo = 0, hi = 0;
  if (Y) { const [a, b] = chRange(ch, L); lo = Math.min(0, a); hi = Math.max(0, b); }
  if (hi - lo < 2) { const m = (hi + lo) / 2; lo = m - 1; hi = m + 1; }
  const pad = (hi - lo) * .14; lo -= pad; hi += pad;
  const X = x => (x - x0) / (x1 - x0) * w, Yp = y => (hi - y) / (hi - lo) * h, ox = X(0), oy = Yp(0);
  const ys = niceStep((hi - lo) / 7), xs = L <= 8 ? 1 : L <= 16 ? 2 : 4;
  g.fillStyle = '#f3f3f3'; for (let x = 0; x <= x1; x += .5) g.fillRect(Math.round(X(x)), 0, 1, h);
  for (let y = Math.ceil(lo / ys) * ys; y <= hi; y += ys) g.fillRect(0, Math.round(Yp(y)), w, 1);
  g.fillStyle = '#e1e1e1'; for (let x = 0; x <= x1; x += 4) g.fillRect(Math.round(X(x)), 0, 1, h);
  g.fillStyle = '#fbfbfb'; g.fillRect(X(L), 0, w - X(L), h);
  // assi con frecce
  g.strokeStyle = '#9c9c9c'; g.fillStyle = '#9c9c9c'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(0, oy); g.lineTo(w - 2, oy); g.moveTo(ox, h); g.lineTo(ox, 2); g.stroke();
  g.beginPath(); g.moveTo(w - 1, oy); g.lineTo(w - 9, oy - 4); g.lineTo(w - 9, oy + 4); g.fill();
  g.beginPath(); g.moveTo(ox, 1); g.lineTo(ox - 4, 9); g.lineTo(ox + 4, 9); g.fill();
  g.font = 'italic 15px Cambria Math, Georgia, serif'; g.fillStyle = '#8a8a8a'; g.fillText('x', w - 16, oy - 10); g.fillText('y', ox + 8, 16);
  g.font = '11px Cambria Math, Georgia, serif'; g.fillStyle = '#9a9a9a'; g.textAlign = 'center';
  for (let x = xs; x <= L; x += xs) g.fillText(x, X(x), Math.min(h - 4, oy + 15));
  g.textAlign = 'right'; for (let y = Math.ceil(lo / ys) * ys; y <= hi; y += ys) if (Math.abs(y) > 1e-9) g.fillText(+y.toFixed(3), ox - 6, Yp(y) + 4);
  g.textAlign = 'left';
  if (Y) { g.strokeStyle = '#141414'; g.lineWidth = 2.6; g.lineJoin = 'round'; g.lineCap = 'round'; strokeCurve(g, Y, 0, L, Math.round(w * 2.5), X, Yp); }
  const hx = headX(p);
  if (hx >= 0) {
    g.fillStyle = 'rgba(20,20,20,.06)'; g.fillRect(X(hx) - 1, 0, 2, h);
    const vs = Y ? yVals(Y, hx) : [NaN];
    if (vs[0] === vs[0]) { g.font = 'italic 12px Cambria Math, Georgia, serif'; g.fillStyle = '#141414'; g.textAlign = 'left'; g.fillText('(' + hx.toFixed(2) + ', ' + vs[0].toFixed(2) + ')', Math.min(w - 110, X(hx) + 11), Math.max(14, Yp(vs[0]) - 10)); }
    for (const v of vs) { g.beginPath(); g.arc(X(hx), v === v ? Yp(v) : oy, 6.5, 0, TAU); if (v === v) { g.fillStyle = '#141414'; g.fill(); } else { g.strokeStyle = '#141414'; g.lineWidth = 1.5; g.stroke(); } }
  }
}
function drawSoundPlot() {
  const [ch] = chById(win.sound); if (!ch || $('#wSound').hidden) return; const C = getC(ch);
  $('#serr').textContent = C.err;
  const [g, w, h] = fitCanvas($('#splot'));
  g.fillStyle = '#f3f3f3'; for (let i = 1; i < 4; i++) { g.fillRect(i * w / 4, 0, 1, h); g.fillRect(0, i * h / 4, w, 1); }
  g.fillStyle = '#c9c9c9'; g.fillRect(0, h / 2, w, 1);
  const wv = (x, t) => { let v; try { v = (+C.w(x, t) - C.mean) * C.g; } catch { v = 0; } return isFinite(v) ? Math.max(-1.2, Math.min(1.2, v)) : 0; };
  [[.6,'#ededed'],[.3,'#dddddd'],[.12,'#c2c2c2'],[0,'#141414']].forEach(([t, col]) => {
    g.strokeStyle = col; g.lineWidth = t ? 1.2 : 2.4; g.beginPath();
    for (let i = 0; i <= w; i++) { const y = h / 2 - wv(i / w * TAU, t) * (h / 2 - 12); i ? g.lineTo(i, y) : g.moveTo(i, y); } g.stroke();
  });
  g.fillStyle = '#9a9a9a'; g.font = 'italic 11px Cambria Math, Georgia, serif'; g.fillText('0', 4, h - 5); g.fillText('π', w / 2 + 3, h - 5); g.fillText('2π', w - 18, h - 5); g.fillText('t = 0 · 0.12 · 0.3 · 0.6 s', 6, 13);
}
function drawThumb(c, o, w, h) {
  const g = sizeCanvas(c, w, h), C = getC(o); g.strokeStyle = '#141414'; g.lineWidth = 1.2; g.beginPath();
  for (let i = 0; i <= w; i++) { let v; try { v = (+C.w(i / w * TAU, 0) - C.mean) * C.g; } catch { v = 0; } v = isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0; const y = h / 2 - v * (h / 2 - 2); i ? g.lineTo(i, y) : g.moveTo(i, y); }
  g.stroke();
}

// ---- Finestre ----
let zTop = 10;
function initWin(w) {
  w.addEventListener('mousedown', () => w.style.zIndex = ++zTop);
  w.querySelector('.wt').addEventListener('mousedown', e => {
    if (e.target.closest('button,input,select')) return; e.preventDefault();
    const r = w.getBoundingClientRect(), m = $('#main').getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
    const mv = ev => { w.style.left = Math.max(0, Math.min(m.width - 120, ev.clientX - m.left - ox)) + 'px'; w.style.top = Math.max(0, Math.min(m.height - 34, ev.clientY - m.top - oy)) + 'px'; };
    const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
    addEventListener('mousemove', mv); addEventListener('mouseup', up);
  });
  w.querySelector('.wx').onclick = () => { w.hidden = true; if (w.id === 'wComp') win.comp = null; if (w.id === 'wSound') win.sound = null; renderRack(); };
}
function showWin(w) {
  w.hidden = false; w.style.zIndex = ++zTop; const m = $('#main');
  if (w.offsetLeft + w.offsetWidth > m.clientWidth) w.style.left = Math.max(0, m.clientWidth - w.offsetWidth - 10) + 'px';
  if (w.offsetTop + 60 > m.clientHeight) w.style.top = '10px';
}
function openRack() { renderRack(); showWin($('#wRack')); renderRack(); }
function openComp(ch) {
  win.comp = ch.id; const w = $('#wComp'); showWin(w);
  $('#compName').textContent = ch.name; $('#ctext').value = ch.comp; $('#cunit').value = ch.unit; $('#croot').value = ch.root;
  $('#croot').disabled = ch.unit === 'hz'; drawPlane(); renderRack(); $('#ctext').focus();
}
function openSound(ch) {
  win.sound = ch.id; showWin($('#wSound'));
  $('#sName').textContent = ch.name; $('#sname').value = ch.name; $('#stext').value = ch.sound;
  for (const [k] of KNOBS) { $('#k_' + k).value = ch[k]; $('#v_' + k).textContent = fmt(k, ch[k]); }
  drawSoundPlot(); renderRack();
}
const fmt = (k, v) => k === 'oct' ? (v > 0 ? '+' : '') + v : k === 'pan' ? (v == 0 ? 'C' : v < 0 ? 'L' + Math.round(-v * 100) : 'R' + Math.round(v * 100)) : (+v).toFixed(v < .1 && v > 0 ? 3 : 2);

// ---- Pattern & channel rack ----
let strips = [];
function renderPats() {
  const P = $('#pats'); P.innerHTML = '';
  for (const p of state.patterns) {
    const it = el('div', 'pat' + (p.id === state.selPat ? ' sel' : ''));
    it.append(el('span', 'dot'), el('span', 'pn', p.name), el('span', 'cnt', p.channels.length || ''));
    it.onclick = () => { selectPat(p.id); openRack(); }; P.append(it);
  }
  $('#patsel').textContent = curPat()?.name || '';
}
function selectPat(id) { state.selPat = id; renderPats(); renderRack(); drawPl(); changed(); }
function renderRack() {
  const p = curPat(), R = $('#rows'); R.innerHTML = ''; strips = []; if (!p) return;
  $('#rackPat').textContent = p.name; if (document.activeElement !== $('#pname')) $('#pname').value = p.name; $('#pbars').value = p.bars;
  for (const ch of p.channels) {
    const row = el('div', 'row');
    const led = el('div', 'led' + (ch.mute ? '' : ' on') + (ch.solo ? ' solo' : '')); led.title = 'Clic: muto · Destro: solo';
    led.onclick = () => { ch.mute = !ch.mute; renderRack(); drawPl(); changed(); };
    led.oncontextmenu = e => { e.preventDefault(); ch.solo = !ch.solo; renderRack(); changed(); };
    const sb = el('button', 'sblk' + (win.sound === ch.id ? ' act' : '')), cv = el('canvas'); sb.title = 'Funzione del suono f(x, t)';
    sb.append(cv, el('span', '', ch.name)); sb.onclick = () => { openSound(ch); preview(ch, .45); };
    const cs = el('canvas', 'cstrip' + (win.comp === ch.id ? ' act' : '')); cs.title = 'Funzione di composizione y(x)'; cs.onclick = () => openComp(ch);
    const x = el('button', 'x', '✕'); x.title = 'Elimina';
    x.onclick = () => { p.channels = p.channels.filter(c => c !== ch); if (win.comp === ch.id) $('#wComp').querySelector('.wx').click(); if (win.sound === ch.id) $('#wSound').querySelector('.wx').click(); renderRack(); renderPats(); drawPl(); changed(); };
    const isel = el('select', 'ins'); isel.title = 'Insert del mixer da cui esce'; state.mixer.forEach((s, i) => isel.append(new Option(i ? i + '' : 'M', i))); isel.value = ch.ins || 0;
    isel.onchange = () => { ch.ins = +isel.value; changed(); };
    row.append(led, sb, cs, isel, x); R.append(row); drawThumb(cv, ch, 30, 14); strips.push([cs, ch]);
  }
  drawStrips();
}
function drawStrips() { const p = curPat(); if (p && !$('#wRack').hidden) strips.forEach(([c, ch]) => drawStrip(c, ch, p)); }

// ---- Arrangiamento ----
const PL = {ppb:22, tool:'draw', snap:1, start:0};
const plBeats = () => Math.max(256, Math.ceil((songEnd() + 64) / 16) * 16);
const PV = {w:1, h:1}, plView = () => { const w = $('#plwrap'); return {sx:w.scrollLeft, sy:w.scrollTop, vw:PV.w, vh:PV.h}; };
function layoutPl() { const W = plBeats() * PL.ppb, H = TRACKS * TH, wr = $('#plwrap'); sizeCanvas($('#ruler'), W, RUL); sizeCanvas($('#trk'), TW, H);
  const cell = $('#plcell'); cell.style.width = W + 'px'; cell.style.height = H + 'px';
  PV.w = Math.max(1, Math.min(W, wr.clientWidth - TW)); PV.h = Math.max(1, Math.min(H, wr.clientHeight - RUL));
  const v = $('#plview'); v.style.width = PV.w + 'px'; v.style.height = PV.h + 'px'; sizeCanvas($('#pl'), PV.w, PV.h); sizeCanvas($('#plo'), PV.w, PV.h); drawTrk(); drawPl(); }
const songHead = () => playing && state.mode === 'song' && curB >= 0 ? curB : -1;
const songMark = () => state.mode === 'song' ? (playing && curB >= 0 ? curB : PL.start) : -1;   // testina visibile anche da fermo
function drawRuler() {
  const c = $('#ruler'), g = c.getContext('2d'), W = plBeats() * PL.ppb, bp = 4 * PL.ppb, ev = bp >= 30 ? 1 : bp >= 15 ? 2 : 4;
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, RUL); g.fillStyle = '#e2e2e2'; g.fillRect(0, RUL - 1, W, 1);
  g.font = '10px Consolas, monospace'; g.textBaseline = 'middle';
  for (let bar = 0; bar * bp < W; bar++) { const x = bar * bp; g.fillStyle = '#cfcfcf'; g.fillRect(x, RUL - 7, 1, 6); if (bar % ev === 0) { g.fillStyle = '#7a7a7a'; g.fillText(bar + 1, x + 3, 9); } }
  const e = songEnd(); if (e) { g.fillStyle = '#141414'; g.fillRect(e * PL.ppb - 1, 0, 2, RUL); }
  const hd = songMark(); if (hd >= 0) { const x = hd * PL.ppb; g.fillStyle = '#ff3b30'; g.beginPath(); g.moveTo(x - 5, RUL - 9); g.lineTo(x + 5, RUL - 9); g.lineTo(x, RUL - 2); g.fill(); }
}
function drawTrk() {
  const g = $('#trk').getContext('2d'); g.font = '11px Segoe UI, system-ui'; g.textBaseline = 'middle';
  for (let i = 0; i < TRACKS; i++) {
    const y = i * TH, m = state.tmute.includes(i); g.fillStyle = i % 2 ? '#fafafa' : '#fff'; g.fillRect(0, y, TW, TH); g.fillStyle = '#ececec'; g.fillRect(0, y + TH - 1, TW, 1);
    g.beginPath(); g.arc(13, y + TH / 2, 4.5, 0, TAU); g.lineWidth = 1.5; g.strokeStyle = '#141414'; g.stroke(); if (!m) { g.fillStyle = '#141414'; g.fill(); }
    g.fillStyle = m ? '#b5b5b5' : '#141414'; g.fillText('Traccia ' + (i + 1), 25, y + TH / 2);
  }
  g.fillStyle = '#d9d9d9'; g.fillRect(TW - 1, 0, 1, TRACKS * TH);
}
function drawPl() {
  drawRuler();
  const cv = $('#pl'), g = cv.getContext('2d'), pp = PL.ppb, W = plBeats() * pp, {sx, sy, vw, vh} = plView(), dr = devicePixelRatio || 1;
  g.setTransform(dr, 0, 0, dr, -sx * dr, -sy * dr);
  const t0 = Math.max(0, Math.floor(sy / TH)), t1 = Math.min(TRACKS - 1, Math.floor((sy + vh) / TH));
  for (let i = t0; i <= t1; i++) { g.fillStyle = i % 2 ? '#fafafa' : '#fff'; g.fillRect(sx, i * TH, vw, TH); g.fillStyle = '#efefef'; g.fillRect(sx, i * TH + TH - 1, vw, 1); }
  for (let b = Math.floor(sx / pp); b * pp <= Math.min(W, sx + vw); b++) { if (pp < 9 && b % 4) continue; g.fillStyle = b % 16 === 0 ? '#cdcdcd' : b % 4 === 0 ? '#e0e0e0' : '#f3f3f3'; g.fillRect(b * pp, sy, 1, vh); }
  g.font = '600 10px Segoe UI, system-ui'; g.textBaseline = 'middle';
  for (const c of state.clips) {
    const p = patById(c.p); if (!p) continue;
    const x = c.s * pp, y = c.tr * TH + 2, w = c.l * pp, h = TH - 4, sel = p.id === state.selPat, mut = state.tmute.includes(c.tr), L = p.bars * 4;
    if (x > sx + vw || x + w < sx || c.tr < t0 || c.tr > t1) continue; const pa = Math.max(0, Math.floor(sx - x)), pb = Math.min(w, sx + vw - x);
    g.save(); g.beginPath(); g.roundRect(x + .5, y + .5, w - 1, h - 1, 3); g.fillStyle = '#fff'; g.fill(); g.clip();
    g.fillStyle = sel ? '#141414' : '#ededed'; g.fillRect(x, y, w, 11); g.fillStyle = sel ? '#fff' : '#141414'; g.fillText(p.name, x + 4, y + 6);
    g.fillStyle = '#dcdcdc'; for (let k = Math.floor(c.o / L) + 1; ; k++) { const bx = c.s - c.o + k * L; if (bx >= c.s + c.l) break; if (bx > c.s) g.fillRect(bx * pp, y + 11, 1, h - 11); }
    g.strokeStyle = mut ? '#cfcfcf' : sel ? '#141414' : '#707070'; g.lineWidth = 1;
    for (const ch of p.channels) {
      const ae = audioEnv(ch); if (ae) { const sb = 60 / bpmAt(bpmFn(), c.s), my = y + 11 + (h - 11) / 2; g.fillStyle = mut ? '#cfcfcf' : sel ? '#141414' : '#707070';
        for (let px = pa & ~1; px < pb; px += 2) { const j = ((px / pp + c.o) * sb) * ae.R, v = ae.env[j | 0] || 0; if (v > .01) { const hh = v * (h - 14) / 2; g.fillRect(x + px, my - hh, 1.2, 2 * hh); } } continue; }
      const {Y} = compY(ch); if (!Y) continue; const [lo, hi] = chRange(ch, L);
      const pts = []; let nc = 1; for (let px = Math.max(0, pa - 2); px <= pb + 1.5; px += 1.5) { const v = yVals(Y, ((px / pp + c.o) % L + L) % L); nc = Math.max(nc, v.length); pts.push([px, v]); }
      for (let j = 0; j < nc; j++) { g.beginPath(); let pen = false; for (const [px, vs] of pts) { const v = vs[j]; if (v === undefined || v !== v) { pen = false; continue; } const py = y + 13 + (hi - v) / (hi - lo) * (h - 15); pen ? g.lineTo(x + px, py) : g.moveTo(x + px, py); pen = true; } g.stroke(); }
    }
    g.restore(); g.lineWidth = sel ? 1.6 : 1; g.strokeStyle = mut ? '#bdbdbd' : '#141414'; g.beginPath(); g.roundRect(x + .5, y + .5, w - 1, h - 1, 3); g.stroke();
  }
  drawPlHead();
}
// livello della testina: si ridisegna a ogni fotogramma, ma solo la parte visibile e solo le clip sotto la testina
function drawPlHead() {
  const cv = $('#plo'), g = cv.getContext('2d'), pp = PL.ppb, {sx, sy, vw, vh} = plView(), dr = devicePixelRatio || 1;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.setTransform(dr, 0, 0, dr, -sx * dr, -sy * dr);
  const hd0 = songHead();
  if (hd0 >= 0 && hd0 * pp >= sx - 4 && hd0 * pp <= sx + vw + 4) for (const c of state.clips) {
    if (!(hd0 > c.s && hd0 < c.s + c.l)) continue; const p = patById(c.p); if (!p) continue;
    const x = c.s * pp, y = c.tr * TH + 2, h = TH - 4, L = p.bars * 4; if (y + h < sy || y > sy + vh) continue;
    g.fillStyle = 'rgba(20,20,20,.05)'; g.fillRect(x, y + 11, (hd0 - c.s) * pp, h - 11);
    for (const ch of p.channels) { if (audioEnv(ch)) continue; const {Y} = compY(ch); if (!Y) continue; const [lo, hi] = chRange(ch, L);
      for (const v of yVals(Y, ((hd0 - c.s + c.o) % L + L) % L)) if (v === v) { g.fillStyle = '#141414'; g.beginPath(); g.arc(hd0 * pp, y + 13 + (hi === lo ? 0 : (hi - v) / (hi - lo)) * (h - 17), 2.6, 0, TAU); g.fill(); } } }
  const hd = songMark(); if (hd >= 0) { if (playing) for (let i = 6; i > 0; i--) { g.fillStyle = 'rgba(255,59,48,' + (.07 * (7 - i) / 7) + ')'; g.fillRect((hd - i * .09) * pp, sy, 2, vh); }
    g.fillStyle = '#ff3b30'; g.fillRect(hd * pp, sy, 1.5, vh); }
}
let pdrag = null;
const snapR = b => Math.round(b / PL.snap) * PL.snap, snapF = b => Math.floor(b / PL.snap) * PL.snap;
function plPos(e) { const r = $('#plcell').getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; return {x, b:x / PL.ppb, tr:Math.max(0, Math.min(TRACKS - 1, Math.floor(y / TH)))}; }
const plHit = p => [...state.clips].reverse().find(c => c.tr === p.tr && p.b >= c.s && p.b < c.s + c.l);
function plChanged() { layoutPl(); changed(); }
function bindPl() {
  const C = $('#pl'); C.oncontextmenu = e => e.preventDefault();
  C.onmousedown = e => {
    const p = plPos(e), hit = plHit(p);
    if (e.button === 2) { if (hit) { state.clips = state.clips.filter(c => c !== hit); plChanged(); } return; }
    if (e.button !== 0) return;
    if (PL.tool === 'cut') {
      if (!hit) return; const cut = snapR(p.b);
      if (cut > hit.s + 1e-6 && cut < hit.s + hit.l - 1e-6) { state.clips.push({id:nid(), p:hit.p, tr:hit.tr, s:cut, l:hit.s + hit.l - cut, o:hit.o + cut - hit.s}); hit.l = cut - hit.s; plChanged(); }
      return;
    }
    if (hit) { if (hit.p !== state.selPat) selectPat(hit.p); pdrag = (hit.s + hit.l) * PL.ppb - p.x < 7 ? {c:hit, mode:'len'} : {c:hit, mode:'move', off:p.b - hit.s}; }
    else { const pt = curPat(); if (!pt) return; const c = {id:nid(), p:pt.id, tr:p.tr, s:snapF(p.b), l:pt.bars * 4, o:0}; state.clips.push(c); pdrag = {c, mode:'move', off:p.b - c.s}; drawPl(); }
  };
  C.ondblclick = e => { const hit = plHit(plPos(e)); if (hit) { selectPat(hit.p); openRack(); } };
  C.onmousemove = e => { if (pdrag) return; const p = plPos(e), h = plHit(p); C.style.cursor = PL.tool === 'cut' ? (h ? 'col-resize' : 'default') : h && (h.s + h.l) * PL.ppb - p.x < 7 ? 'ew-resize' : h ? 'grab' : 'copy'; };
  addEventListener('mousemove', e => { if (!pdrag) return; const p = plPos(e), c = pdrag.c; if (pdrag.mode === 'move') { c.s = Math.max(0, snapR(p.b - pdrag.off)); c.tr = p.tr; } else c.l = Math.max(PL.snap, snapR(p.b) - c.s); drawPl(); });
  addEventListener('mouseup', () => { if (pdrag) { pdrag = null; plChanged(); } if (document.activeElement?.tagName === 'BUTTON') document.activeElement.blur(); });
  $('#trk').onmousedown = e => { const r = e.target.getBoundingClientRect(), i = Math.floor((e.clientY - r.top) / TH); state.tmute = state.tmute.includes(i) ? state.tmute.filter(x => x !== i) : [...state.tmute, i]; drawTrk(); drawPl(); changed(); };
  let scrollQ = 0; $('#plwrap').addEventListener('scroll', () => { if (!scrollQ) scrollQ = requestAnimationFrame(() => { scrollQ = 0; drawPl(); }); }, {passive:true});
  let roQ = 0; new ResizeObserver(() => { if (!roQ) roQ = requestAnimationFrame(() => { roQ = 0; layoutPl(); }); }).observe($('#plwrap'));
  // testina della song: clic o trascinamento sul righello, come in ogni DAW
  let rdrag = false, rLast = 0;
  const rulerB = e => { const r = $('#ruler').getBoundingClientRect(), b = Math.max(0, (e.clientX - r.left) / PL.ppb); return e.altKey ? b : snapR(b); };
  const seek = (b, force) => { PL.start = b; if (state.mode !== 'song') { setMode('song'); return; }
    if (playing && node && (force || performance.now() - rLast > 45)) { rLast = performance.now(); node.port.postMessage({type:'play', b}); curB = b; }
    headDirty = true; drawRuler(); drawPlHead(); };
  $('#ruler').onmousedown = e => { if (e.button !== 0) return; e.preventDefault(); rdrag = true; seek(rulerB(e), true); };
  addEventListener('mousemove', e => { if (rdrag) seek(rulerB(e)); });
  addEventListener('mouseup', e => { if (rdrag) { rdrag = false; seek(rulerB(e), true); } });
  $('#plwrap').addEventListener('wheel', e => { if (!e.ctrlKey) return; e.preventDefault(); PL.ppb = Math.max(6, Math.min(80, PL.ppb * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); $('#zoom').value = PL.ppb; layoutPl(); }, {passive:false});
}

// ---- Mixer ----
const dbs = v => (v <= 0 ? '−∞' : (20 * Math.log10(v)).toFixed(1));
function renderMixer(namesOnly) {
  const S = $('#strips'); if (!S) return;
  if (namesOnly) { S.querySelectorAll('.mname').forEach((e, i) => e.textContent = state.mixer[i].name); return; }
  S.innerHTML = ''; meterEls = [];
  state.mixer.forEach((s, i) => {
    const d = el('div', 'mstrip' + (i === selIns ? ' sel' : '') + (i === 0 ? ' mst' : '')); d.onmousedown = e => { if (e.target.tagName !== 'INPUT' && selIns !== i) { selIns = i; selFx = 0; renderMixer(); } };
    d.append(el('div', 'mnum', i ? i + '' : 'M'), el('div', 'mname', s.name), el('div', 'mfx', s.fx.map(f => f.type === 'ext' ? 'VST' : FXDEF[f.type].short).join(' ') || '·'));
    const row = el('div', 'mrow'), met = el('div', 'meter'), bar = el('div', 'mbar'); met.append(bar); meterEls[i] = bar;
    const f = el('input', 'fader'), vl = el('div', 'mval', dbs(s.vol)); Object.assign(f, {type:'range', min:0, max:1.25, step:.01, value:s.vol}); f.title = 'Volume (doppio clic: 0 dB)';
    f.oninput = () => { s.vol = +f.value; vl.textContent = dbs(s.vol); if (i === 0) $('#master').value = s.vol; changed(); }; f.ondblclick = () => { s.vol = 1; f.value = 1; vl.textContent = dbs(1); changed(); };
    row.append(met, f);
    const pan = el('input', 'mpan'); Object.assign(pan, {type:'range', min:-1, max:1, step:.01, value:s.pan}); pan.title = 'Pan (doppio clic: centro)';
    pan.oninput = () => { s.pan = +pan.value; changed(); }; pan.ondblclick = () => { s.pan = 0; pan.value = 0; changed(); };
    const led = el('div', 'led' + (s.mute ? '' : ' on')); led.title = 'Muto'; led.onclick = () => { s.mute = !s.mute; renderMixer(); changed(); };
    d.append(row, vl, pan, led); S.append(d);
  });
  renderFxPanel();
}
function renderFxPanel() {
  const s = state.mixer[selIns]; $('#insname').value = s.name; $('#insname').disabled = selIns === 0; $('#mixSub').textContent = s.name;
  const Sl = $('#slots'); Sl.innerHTML = ''; if (selFx >= s.fx.length) selFx = Math.max(0, s.fx.length - 1);
  if (!s.fx.length) Sl.append(el('div', 'hint', 'Nessun effetto: aggiungine uno qui sotto.'));
  s.fx.forEach((f, i) => {
    const r = el('div', 'slot' + (i === selFx ? ' sel' : '')); r.title = 'Clic: apri il plugin'; r.onclick = () => { selFx = i; renderFxPanel(); if (f.type === 'ext') { if (hostOk) openPlugWin(f); else toast(hostWhy); } else openFx(selIns, i); };
    const led = el('div', 'led' + (f.on ? ' on' : '')); led.title = 'Attiva/disattiva'; led.onclick = e => { e.stopPropagation(); f.on = !f.on; renderFxPanel(); changed(); };
    const mv = d => { const j = i + d; if (j < 0 || j >= s.fx.length) return; [s.fx[i], s.fx[j]] = [s.fx[j], s.fx[i]]; selFx = j; renderMixer(); changed(); };
    r.append(el('span', 'snum', i + 1 + ''), led, el('span', 'sn', f.type === 'ext' ? f.name + (f.err ? ' ⚠' : '') + '  · ' + (/\.dll$/i.test(f.path || '') ? 'VST2' : 'VST3') : FXDEF[f.type].name));
    for (const [t, fn, ti] of [['↑', () => mv(-1), 'Sposta su'], ['↓', () => mv(1), 'Sposta giù'], ['✕', () => { s.fx.splice(i, 1); hostSync(); renderMixer(); changed(); }, 'Rimuovi']]) { const b = el('button', 'x', t); b.title = ti; b.onclick = e => { e.stopPropagation(); fn(); }; r.append(b); }
    Sl.append(r);
  });
  $('#fxedit').innerHTML = '<div class="hint">Clicca un effetto per aprire il suo plugin.</div>'; fxVals = [];
}
function updVals() {
  const b = Math.max(curB, 0);
  for (const [sp, f, k, def] of fxVals) { let v; try { v = +compileProg(String(f.p[k] ?? '').trim() || def, 'b')(b); } catch { v = NaN; } sp.textContent = isFinite(v) ? '= ' + +v.toFixed(3) : '—'; }
}
function drawCurve(f) {
  const c = $('#dcurve'); if (!c) return; const [g, w, h] = fitCanvas(c), X = s => (s + 1.5) / 3 * w, Y = v => h / 2 - v / 1.5 * (h / 2);
  g.fillStyle = '#f2f2f2'; for (const v of [-1, -.5, .5, 1]) { g.fillRect(X(v), 0, 1, h); g.fillRect(0, Y(v), w, 1); }
  g.fillStyle = '#bdbdbd'; g.fillRect(0, Y(0), w, 1); g.fillRect(X(0), 0, 1, h);
  g.strokeStyle = '#d0d0d0'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(X(-1.5), Y(-1.5)); g.lineTo(X(1.5), Y(1.5)); g.stroke(); g.setLineDash([]);
  let F; try { F = compileProg(String(f.p.curva || '').trim() || 'tanh(3s)', 's,b'); } catch { return; }
  g.strokeStyle = '#141414'; g.lineWidth = 2.2; g.beginPath(); let pen = false;
  for (let i = 0; i <= w; i++) { const s = -1.5 + 3 * i / w; let v; try { v = +F(s, Math.max(curB, 0)); } catch { v = NaN; } if (!isFinite(v)) { pen = false; continue; } const y = Math.max(-2, Math.min(h + 2, Y(v))); pen ? g.lineTo(i, y) : g.moveTo(i, y); pen = true; }
  g.stroke(); g.font = 'italic 12px Cambria Math, Georgia, serif'; g.fillStyle = '#8a8a8a'; g.fillText('s', w - 12, Y(0) - 6); g.fillText('f(s)', X(0) + 6, 13);
}

// ---- Dialoghi interni (i dialoghi nativi in Electron bloccano la tastiera dopo la chiusura) ----
function ask(text, okOnly) {
  return new Promise(res => {
    const m = $('#modal'); $('#mtext').textContent = text; $('#mno').hidden = !!okOnly; m.hidden = false; $('#myes').focus();
    const done = v => { m.hidden = true; $('#myes').onclick = $('#mno').onclick = null; m.onkeydown = null; res(v); };
    $('#myes').onclick = () => done(true); $('#mno').onclick = () => done(false);
    m.onkeydown = e => { e.stopPropagation(); if (e.key === 'Escape') done(false); if (e.key === 'Enter') { e.preventDefault(); done(true); } };
  });
}
const notice = t => ask(t, true);

// ---- Import ----
async function importAudio(file) {
  const [ch] = chById(win.sound); if (!ch || !file) return; toast('Analizzo "' + file.name + '"…');
  try {
    const r = await cloneAudioFile(file);
    ch.sound = r.sound; Object.assign(ch, r.adsr); if (r.root) ch.root = r.root;
    if (/^Canale \d+$/.test(ch.name)) ch.name = file.name.replace(/\.[^.]+$/, '');
    openSound(ch); if (win.comp === ch.id) openComp(ch); renderRack(); changed(); toast('Clonato: ' + r.info); preview(ch, 1);
  } catch (e) { notice('Impossibile clonare il file: ' + e.message); }
}
async function importMidi(file) {
  const [ch, p] = chById(win.comp); if (!ch || !file) return;
  try {
    const r = midiToFunction(await file.arrayBuffer(), file.name, 60);
    ch.comp = r.comp; ch.unit = 'semitoni'; ch.root = 60; p.bars = Math.max(1, Math.min(64, r.bars));
    if (r.tempo && await ask('Il MIDI è a ' + +r.tempo.toFixed(2) + ' BPM. Impostare bpm(b) = ' + +r.tempo.toFixed(2) + '?')) { state.bpm = String(+r.tempo.toFixed(2)); $('#bpm').value = state.bpm; }
    openComp(ch); renderRack(); drawPl(); changed();
    toast('Importate ' + r.count + ' note in ' + r.voices + (r.voices > 1 ? ' voci' : ' voce') + (r.dropped ? ' (' + r.dropped + ' oltre le 8 voci ignorate)' : ''));
  } catch (e) { notice('Impossibile leggere il MIDI: ' + e.message); }
}
function dropZone(w, fn, test) {
  w.addEventListener('dragover', e => { e.preventDefault(); w.classList.add('drop'); });
  w.addEventListener('dragleave', e => { if (!w.contains(e.relatedTarget)) w.classList.remove('drop'); });
  w.addEventListener('drop', e => { e.preventDefault(); w.classList.remove('drop'); const f = e.dataTransfer.files[0]; if (f && test(f)) fn(f); else if (f) toast('Formato non adatto a questa finestra'); });
}

// ---- Avvio ----
function setMode(m) { state.mode = m; $('#mPat').classList.toggle('on', m === 'pat'); $('#mSong').classList.toggle('on', m === 'song'); if (playing) { stop(); play(); } changed(); }
function refreshAll() {
  $('#bpm').value = state.bpm; $('#bpm').classList.toggle('bad', !bpmFn()); $('#master').value = state.mixer[0].vol;
  setMode(state.mode); renderPats(); renderRack(); layoutPl(); renderMixer(); hostSync(); hostApplyAll(); resetUndo();
  for (const w of ['#wComp', '#wSound']) $(w).hidden = true; win.comp = win.sound = null; headDirty = true;
}
function init() {
  try { const s = localStorage.getItem('cartesio.project'); s ? load(JSON.parse(s)) : newProject(); } catch { newProject(); }
  document.querySelectorAll('.win').forEach(initWin); bindPl();
  // finestra suono
  const K = $('#knobs');
  for (const [k, lab, mn, mx, st] of KNOBS) {
    const row = el('div', 'kv'), r = el('input'), b = el('span'); Object.assign(r, {type:'range', min:mn, max:mx, step:st}); r.id = 'k_' + k; b.id = 'v_' + k;
    r.oninput = () => { const [ch] = chById(win.sound); if (!ch) return; ch[k] = +r.value; b.textContent = fmt(k, ch[k]); changed(); };
    r.onchange = () => { const [ch] = chById(win.sound); if (ch && k !== 'vol' && k !== 'pan') preview(ch, .5); };
    row.append(el('span', '', lab), r, b); K.append(row);
  }
  for (const sp of SOUNDS) { const b = el('button', 'chip', sp.name); b.title = sp.sound; b.onclick = () => { const [ch] = chById(win.sound); if (!ch) return; for (const k of ['sound','a','d','s','r']) ch[k] = sp[k] ?? DEF_CH[k]; openSound(ch); changed(); preview(ch, .5); }; $('#chips').append(b); }
  $('#stext').oninput = () => { const [ch] = chById(win.sound); if (!ch) return; ch.sound = $('#stext').value; drawSoundPlot(); renderRack(); changed(); };
  $('#sname').oninput = () => { const [ch] = chById(win.sound); if (!ch) return; ch.name = $('#sname').value; $('#sName').textContent = ch.name; if (win.comp === ch.id) $('#compName').textContent = ch.name; renderRack(); changed(false); };
  $('#sprev').onclick = () => { const [ch] = chById(win.sound); ch && preview(ch, .7); };
  // finestra composizione
  for (let m = 12; m <= 96; m++) $('#croot').append(new Option(noteName(m) + (m === 57 ? '  (220 Hz)' : ''), m));
  $('#ctext').oninput = () => { const [ch] = chById(win.comp); if (!ch) return; ch.comp = $('#ctext').value; drawPlane(); drawStrips(); drawPl(); changed(); };
  $('#ctext').onkeydown = e => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); $('#cplay').click(); } if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); } };
  $('#cunit').onchange = () => { const [ch] = chById(win.comp); if (!ch) return; ch.unit = $('#cunit').value; $('#croot').disabled = ch.unit === 'hz'; changed(); };
  $('#croot').onchange = () => { const [ch] = chById(win.comp); if (!ch) return; ch.root = +$('#croot').value; changed(); preview(ch, .4); };
  $('#cplay').onclick = () => { const [, p] = chById(win.comp); if (!p) return; if (state.selPat !== p.id) selectPat(p.id); if (state.mode !== 'pat') setMode('pat'); playing ? (stop(), play()) : play(); };
  for (const [sym, txt] of [['{ : }','{x mod 1 < 1/2: 0}'],['if / otherwise',' if  \n  otherwise'],['⌊x⌋','⌊x⌋'],['mod',' mod '],['eˣ','e^{ }'],['|x|','|x|'],['√','√( )'],['Σ','Σ_{k=1}^{8} '],['[ accordo ]','[0, 4, 7]'],['π','π'],['≤','≤'],['≥','≥'],['K(d)=','\nK(d) = ']]) { const b = el('button', 'chip', sym); b.onclick = () => { $('#ctext').focus(); document.execCommand('insertText', false, txt); }; $('#csym').append(b); }
  // rack
  $('#addch').onclick = () => { const p = curPat(); if (!p) return; const ch = mkCh({name:'Canale ' + (p.channels.length + 1)}); p.channels.push(ch); renderRack(); renderPats(); changed(); openComp(ch); };
  $('#pname').oninput = () => { const p = curPat(); if (p) { p.name = $('#pname').value; renderPats(); $('#rackPat').textContent = p.name; drawPl(); changed(false); } };
  $('#pbars').onchange = () => { const p = curPat(); if (!p) return; p.bars = Math.max(1, Math.min(64, +$('#pbars').value | 0 || 1)); $('#pbars').value = p.bars; renderRack(); drawPlane(); drawPl(); changed(); };
  $('#clonepat').onclick = () => { const p = curPat(); if (!p) return; const q = JSON.parse(JSON.stringify(p, strip_)); q.id = nid(); q.name = p.name + ' copia'; q.channels.forEach(c => c.id = nid()); state.patterns.splice(state.patterns.indexOf(p) + 1, 0, q); selectPat(q.id); openRack(); };
  $('#delpat').onclick = async () => {
    const p = curPat(); if (!p || !await ask('Eliminare "' + p.name + '" e le sue clip?')) return;
    state.patterns = state.patterns.filter(x => x !== p); state.clips = state.clips.filter(c => c.p !== p.id);
    if (!state.patterns.length) state.patterns.push(mkPat('Pattern 1')); $('#wComp').hidden = $('#wSound').hidden = true; win.comp = win.sound = null; selectPat(state.patterns[0].id); plChanged();
  };
  $('#addpat').onclick = $('#patplus').onclick = () => { const p = mkPat(); state.patterns.push(p); selectPat(p.id); openRack(); };
  $('#prevpat').onclick = () => { const i = state.patterns.indexOf(curPat()); selectPat(state.patterns[(i - 1 + state.patterns.length) % state.patterns.length].id); };
  $('#nextpat').onclick = () => { const i = state.patterns.indexOf(curPat()); selectPat(state.patterns[(i + 1) % state.patterns.length].id); };
  $('#patsel').onclick = openRack; $('#rackBtn').onclick = () => $('#wRack').hidden ? openRack() : ($('#wRack').hidden = true);
  // trasporto & file
  $('#play').onclick = () => playing ? stop() : play(); $('#stop').onclick = stop;
  $('#mPat').onclick = () => setMode('pat'); $('#mSong').onclick = () => setMode('song');
  $('#bpm').oninput = () => { state.bpm = $('#bpm').value; $('#bpm').classList.toggle('bad', !bpmFn()); headDirty = true; changed(); };
  $('#master').oninput = () => { state.mixer[0].vol = +$('#master').value; if (!$('#wMix').hidden) renderMixer(); changed(); };
  $('#plugBtn').onclick = () => { const w = $('#wPlug'); if (w.hidden) { showWin(w); renderDirs(); } else w.hidden = true; }; $('#plugScan').onclick = scanPlugins; $('#plugAddDir').onclick = addDirs; $('#addfxBtn').onclick = openPick; $('#plugQ').oninput = () => window._plugs && renderPlugins(window._plugs);
  $('#mixBtn').onclick = () => { const w = $('#wMix'); if (w.hidden) { showWin(w); renderMixer(); } else w.hidden = true; };
  $('#insname').oninput = () => { if (selIns) { state.mixer[selIns].name = $('#insname').value; renderMixer(true); changed(false); } };
  for (const [t, d] of Object.entries(FXDEF)) $('#addfx').append(new Option(d.name, t));
  $('#addfx').onchange = () => { const t = $('#addfx').value; if (!t) return; const s = state.mixer[selIns]; if (s.fx.length >= 8) return toast('Massimo 8 effetti per insert'); s.fx.push(mkFx(t)); selFx = s.fx.length - 1; $('#addfx').value = ''; renderMixer(); changed(); openFx(selIns, selFx); };
  $('#tDraw').onclick = () => { PL.tool = 'draw'; $('#tDraw').classList.add('on'); $('#tCut').classList.remove('on'); };
  $('#tCut').onclick = () => { PL.tool = 'cut'; $('#tCut').classList.add('on'); $('#tDraw').classList.remove('on'); };
  $('#snap').onchange = () => PL.snap = +$('#snap').value;
  $('#zoom').oninput = () => { PL.ppb = +$('#zoom').value; layoutPl(); };
  $('#new').onclick = async () => { if ((window.CS && !CS.confirm) || await ask('Nuovo progetto? Le modifiche non salvate andranno perse.')) { stop(); newProject(); refreshAll(); openRack(); changed(); } };
  $('#demo').onclick = async () => { if ((window.CS && !CS.confirm) || await ask('Caricare il progetto demo?')) { stop(); demo(); refreshAll(); openRack(); changed(); } };
  $('#save').onclick = async () => { await pullStates(); download(new Blob([serialize()], {type:'application/json'}), 'progetto.cartesio'); const ex = allExt(), ok = ex.filter(f => f.state).length;
    if (ex.length) toast(ok === ex.length ? 'Salvato con le impostazioni di tutti i ' + ok + ' plugin ✓' : 'Salvato, ma ' + (ex.length - ok) + ' plugin su ' + ex.length + ' senza impostazioni (ponte attivo?)'); };
  $('#open').onclick = () => $('#file').click();
  $('#file').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { stop(); load(JSON.parse(await f.text())); refreshAll(); changed(); } catch (er) { notice('Impossibile aprire: ' + er.message); } e.target.value = ''; };
  $('#exp').onclick = exportWav;
  $('#impAudio').onclick = () => $('#faudio').click(); $('#faudio').onchange = e => { importAudio(e.target.files[0]); e.target.value = ''; };
  $('#impMidi').onclick = () => $('#fmidi').click(); $('#fmidi').onchange = e => { importMidi(e.target.files[0]); e.target.value = ''; };
  dropZone($('#wSound'), importAudio, f => /^audio\//.test(f.type) || /\.(wav|mp3|ogg|flac|aiff?|m4a)$/i.test(f.name));
  dropZone($('#wComp'), importMidi, f => /\.midi?$/i.test(f.name));
  document.addEventListener('keydown', e => {
    const t = e.target, typing = t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && t.type !== 'range');
    if (!$('#modal').hidden) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.code === 'KeyZ' || e.code === 'KeyY')) { const txt = t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['range', 'checkbox', 'button'].includes(t.type));
      if (txt) return; e.preventDefault(); undoRedo(e.code === 'KeyY' || e.shiftKey); return; }   // nei campi di testo vale l'annulla del testo
    if (e.key === 'Escape') { const ws = [...document.querySelectorAll('.win:not([hidden])')].sort((a, b) => +b.style.zIndex - +a.style.zIndex); if (ws[0]) ws[0].querySelector('.wx').click(); return; }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Space') { e.preventDefault(); playing ? stop() : play(); }
  });
  const sc = $('#scope'), r = devicePixelRatio || 1; sc.width = 160 * r; sc.height = 34 * r; $('#xy').width = $('#xy').height = 34 * r; bindAudioDrop();
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { drawStrips(); drawPlane(); drawSoundPlot(); layoutPl(); }, 80); });
  refreshAll(); openRack();
  (function loop() {
    requestAnimationFrame(loop);
    if (headDirty) {
      headDirty = false; const p = curPat(), b = playing ? Math.max(curB, 0) : state.mode === 'song' ? PL.start : 0;
      if (state.mode === 'pat' && p) { const x = b % (p.bars * 4); $('#time').textContent = `${Math.floor(x / 4) + 1}:${Math.floor(x % 4) + 1}:${Math.floor(x % 1 * 4) + 1}`; }
      else $('#time').textContent = `${Math.floor(b / 4) + 1}:${Math.floor(b % 4) + 1}:${Math.floor(b % 1 * 4) + 1}`;
      $('#bpmv').textContent = '= ' + bpmAt(bpmFn(), state.mode === 'pat' && p ? b % (p.bars * 4) : b).toFixed(1);
      drawStrips(); drawPlane(); if (!playing) drawPl(); else if (state.mode === 'song') { drawRuler(); drawPlHead(); if (++plTick % 20 === 0) drawPl(); } updVals();
    }
    if (!$('#wMix').hidden) meterEls.forEach((bar, i) => { meterLv[i] = Math.max(meterPk[i] || 0, (meterLv[i] || 0) * .9); meterPk[i] = 0; const db = 20 * Math.log10(meterLv[i] + 1e-9); bar.style.height = Math.max(0, Math.min(100, (db + 60) / 66 * 100)) + '%'; bar.classList.toggle('hot', meterLv[i] > .99); });
    drawScope();
  })();
}
let liveT = 0, plTick = 0;
function drawXY() {
  const c = $('#xy'); if (!c) return; const g = c.getContext('2d'), w = c.width, h = c.height; g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ececec'; g.fillRect(w / 2, 0, 1, h); g.fillRect(0, h / 2, w, 1);
  if (aL) { const l = new Float32Array(aL.fftSize), r = new Float32Array(aR.fftSize); aL.getFloatTimeDomainData(l); aR.getFloatTimeDomainData(r);
    g.strokeStyle = 'rgba(20,20,20,.75)'; g.lineWidth = devicePixelRatio || 1; g.beginPath(); for (let i = 0; i < l.length; i += 2) { const px = w / 2 + (l[i] - r[i]) * w * .4, py = h / 2 - (l[i] + r[i]) * h * .4; i ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke(); }
  const now = performance.now(); if (now - liveT > 250) { liveT = now; const sr = ctx ? ctx.sampleRate : 44100, ev = liveNv * sr;
    $('#liveStat').textContent = liveNv ? '⨍ ' + liveNv + (liveNv === 1 ? ' funzione attiva' : ' funzioni attive') + ' · ' + (ev / 1e6).toLocaleString('it', {maximumFractionDigits:1}) + ' milioni di calcoli al secondo' : 'in attesa: premi ▶ e guarda la matematica suonare'; }
}
function drawScope() { drawXY();
  const c = $('#scope'), g = c.getContext('2d'), w = c.width, h = c.height; g.clearRect(0, 0, w, h); g.fillStyle = '#ececec'; g.fillRect(0, h / 2, w, 1);
  if (!analyser) return; const d = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(d);
  g.strokeStyle = '#141414'; g.lineWidth = 1.2 * (devicePixelRatio || 1); g.beginPath();
  for (let i = 0; i < w; i++) { const y = h / 2 - d[Math.floor(i / w * d.length)] * h * .45; i ? g.lineTo(i, y) : g.moveTo(i, y); } g.stroke();
}



// ===== Ponte verso i plugin VST3 del PC =====
let hostCtl = null, hostAud = null, hostOk = false, hostWhy = 'ponte non avviato (solo nell\'app)', hostLoaded = new Map(), hostPending = new Set(), stReq = new Map(), stSeq = 0;
setTimeout(() => { if (!hostCtl) { hostWhy = window.cartesio ? 'Cartesio non ha ricevuto il collegamento dal processo principale' : 'disponibile solo nell\'app (exe)'; updHostUI(); } }, 6000);
window.addEventListener('message', e => { if (!e.data || !e.data.cartesioHost) return; hostCtl = e.ports[0]; hostAud = e.ports[1]; hostCtl.onmessage = ev => onHost(ev.data); hostLink(); });
function hostLink() { if (node && hostAud) { node.port.postMessage({type:'hostPort', port:hostAud}, [hostAud]); hostAud = null; } if (ctx && hostCtl && hostOk) hostCtl.postMessage({t:'prepare', sr:ctx.sampleRate, block:256}); }
const allExt = () => state.mixer.flatMap(s => s.fx.filter(f => f.type === 'ext'));
function hostSync() { if (!hostCtl || !hostOk) return; const ids = new Set(allExt().map(f => f.id));
  const want = new Map(allExt().map(f => [f.id, f.path]));
  for (const [id, path] of hostLoaded) if (want.get(id) !== path) { closePlugWin(id, true); hostCtl.postMessage({t:'unload', id}); hostLoaded.delete(id); hostPending.delete(id); }
  for (const f of allExt()) if (!hostLoaded.has(f.id)) { f._ready = false; hostCtl.postMessage({t:'load', id:f.id, path:f.path}); hostLoaded.set(f.id, f.path); hostPending.add(f.id); } }
// stato interno dei plugin (bande, frequenze, dB…): salvato nel progetto come f.state e ripristinato al caricamento
// ===== editor dei plugin dentro Cartesio: la finestra del plugin è figlia di quella di Cartesio e segue un riquadro della pagina =====
const plugWins = new Map();
function openPlugWin(f) { let P = plugWins.get(f.id);
  if (!P) { const w = el('div', 'win pwin'), n = plugWins.size; w.innerHTML = '<div class="wt"><span class="wtt"></span><button class="wx">&times;</button></div><div class="pbody"></div><div class="pfoot"><div class="pgrip"></div></div>';
    w.querySelector('.wtt').textContent = f.name; w.style.left = 80 + 28 * n + 'px'; w.style.top = 40 + 28 * n + 'px'; $('#main').append(w); initWin(w);
    w.querySelector('.wx').onclick = () => closePlugWin(f.id); P = {w, body:w.querySelector('.pbody'), last:''}; plugWins.set(f.id, P);
    // ridimensionamento dal angolo (se il plugin lo permette, si adatta; altrimenti torna alla sua misura)
    w.querySelector('.pgrip').onmousedown = e => { e.preventDefault(); e.stopPropagation(); const d = devicePixelRatio || 1, r0 = P.body.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY; let q = 0;
      const mv = ev => { const nw = Math.max(160, r0.width + ev.clientX - x0), nh = Math.max(80, r0.height + ev.clientY - y0); if (!q) q = requestAnimationFrame(() => { q = 0; hostCtl.postMessage({t:'edresize', id:f.id, w:Math.round(nw * d), h:Math.round(nh * d)}); }); };
      const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); }; addEventListener('mousemove', mv); addEventListener('mouseup', up); }; }
  showWin(P.w); hostCtl.postMessage({t:'editor', id:f.id}); }
function closePlugWin(id, quiet) { const P = plugWins.get(id); if (!P) return; plugWins.delete(id); P.w.remove(); if (!quiet && hostCtl) hostCtl.postMessage({t:'edclose', id}); pullStates(); }
(function plugPlace() { requestAnimationFrame(plugPlace); if (!hostCtl) return; const d = devicePixelRatio || 1, modal = !$('#modal').hidden;
  for (const [id, P] of plugWins) { const r = P.body.getBoundingClientRect(), vis = !P.w.hidden && !modal && r.width > 0, x = Math.round(r.left * d), y = Math.round(r.top * d), k = x + ',' + y + ',' + vis;
    if (k !== P.last) { P.last = k; hostCtl.postMessage({t:'place', id, x, y, vis}); } } })();
function hostApplyAll() { if (!hostCtl || !hostOk) return; for (const f of allExt()) if (hostLoaded.get(f.id) === f.path && !hostPending.has(f.id) && !f._ready) { if (f.state) hostCtl.postMessage({t:'setState', id:f.id, data:f.state}); f._ready = true; } }
function pullStates(ms = 1500) { if (!hostCtl || !hostOk) return Promise.resolve(false);
  const fs = allExt().filter(f => f._ready && !f.err); if (!fs.length) return Promise.resolve(false); let changedAny = false;
  return Promise.all(fs.map(f => new Promise(res => { const req = ++stSeq, t = setTimeout(() => { stReq.delete(req); res(); }, ms);
    stReq.set(req, m => { clearTimeout(t); if (m.ok && m.data && m.data !== f.state) { f.state = m.data; changedAny = true; } res(); }); hostCtl.postMessage({t:'getState', id:f.id, req}); })))
    .then(() => { if (changedAny) changed(false); return changedAny; }); }
(function poll() { if (!UNDO.busy) pullStates(); setTimeout(poll, (window.CS && CS.poll) || 1500); })();
addEventListener('focus', () => pullStates());   // tornando su Cartesio dopo aver regolato un plugin
if (window.cartesio && window.cartesio.onBeforeClose) window.cartesio.onBeforeClose(async () => { try { await pullStates(1200); flushSave(); } catch {} window.cartesio.canClose(); });
function onHost(m) {
  if (m.t === 'status') { hostOk = m.ok; hostWhy = m.why || ''; if (m.ok) { hostLoaded.clear(); hostPending.clear(); hostLink(); hostSync(); } updHostUI(); }
  if (m.t === 'edclosed') pullStates();
  if (m.t === 'edsize') { const P = plugWins.get(m.id); if (P) { const d = devicePixelRatio || 1; P.body.style.width = m.w / d + 'px'; P.body.style.height = m.h / d + 'px'; P.last = ''; } }   // finestra del plugin chiusa: salva subito
  if (m.t === 'state') { const cb = stReq.get(m.req); stReq.delete(m.req); if (cb) cb(m); }
  if (m.t === 'loaded') { hostPending.delete(m.id); const f = allExt().find(f => f.id === m.id); if (!f) return; f.err = m.ok ? '' : m.name;
    if (m.ok) { if (f.state) hostCtl.postMessage({t:'setState', id:f.id, data:f.state}); f._ready = true; } if (!m.ok) toast('Non riesco a caricare "' + f.name + '": ' + m.name); else if (f._open) { f._open = false; openPlugWin(f); } else if (plugWins.has(f.id)) { plugWins.get(f.id).last = ''; hostCtl.postMessage({t:'editor', id:f.id}); } if (!$('#wMix').hidden) renderMixer(); }
}
function updHostUI() { const e = $('#hostStat'); if (e) e.textContent = hostOk ? 'Ponte VST3 attivo ✓' : 'Ponte VST3 non attivo: ' + hostWhy; if (window._plugs) renderPlugins(window._plugs); }
function addExt(p) {
  const s = state.mixer[selIns]; if (s.fx.length >= 8) return toast('Massimo 8 effetti per insert');
  const f = {id:nid(), type:'ext', on:true, name:p.name, path:p.path, _open:true}; s.fx.push(f); hostSync(); changed(); if (!hostOk) toast('Aggiunto. Per sentirlo serve il ponte VST3 attivo (' + hostWhy + ')');
  showWin($('#wMix')); renderMixer(); toast('"' + p.name + '" → ' + (selIns ? 'Insert ' + selIns : 'Master'));
}

// ===== Plugin interni: finestre con manopole e display (i valori restano funzioni di b) =====
const FXR = {dist:{mix:[0,1],out:[0,2]}, rev:{size:[0,1],damp:[0,1],mix:[0,1]}, delay:{time:[.0625,4,1],fb:[0,.95],mix:[0,1],pp:[0,1]},
  eq:{lf:[20,1000,1],lg:[-18,18],mf:[100,10000,1],mg:[-18,18],mq:[.1,10,1],hf:[1000,20000,1],hg:[-18,18]},
  comp:{thr:[-60,0],ratio:[1,20,1],att:[.1,200,1],rel:[5,2000,1],gain:[0,24]}, chorus:{rate:[.05,8,1],depth:[0,20],mix:[0,1]}, phaser:{rate:[.02,8,1],depth:[0,1],fb:[-.95,.95],mix:[0,1]}};
let fxOpen = null, fxT = 0;
const fxVal = (f, k) => { const d = FXDEF[f.type].p.find(q => q[0] === k)[2]; try { return +compileProg(String(f.p[k] ?? '').trim() || d, 'b')(Math.max(curB, 0)); } catch { return +compileProg(d, 'b')(0); } };
const isNum = s => /^\s*-?\d*\.?\d+\s*$/.test(String(s));
function openFx(ins, i) {
  const f = state.mixer[ins].fx[i]; if (!f) return; fxOpen = {ins, i, f}; const W = $('#wFx'); showWin(W);
  $('#fxName').textContent = FXDEF[f.type].name; $('#fxIns').textContent = state.mixer[ins].name;
  const K = $('#knobs2'); K.innerHTML = '';
  for (const [k, lab, def] of FXDEF[f.type].p) {
    if (k === 'curva') { const r = el('div', 'curva'), inp = el('input', 'pexp'); inp.value = f.p.curva ?? def; inp.spellcheck = false;
      inp.oninput = () => { f.p.curva = inp.value; try { compileProg(inp.value || def, 's,b'); inp.classList.remove('bad'); } catch (e) { inp.classList.add('bad'); } changed(); }; r.append(el('span', 'plab', 'f(s) ='), inp); K.append(r); continue; }
    const [mn, mx, lg] = FXR[f.type][k], kn = el('div', 'knob'), cv = el('canvas'), val = el('div', 'kval'); kn.dataset.k = k;
    kn.append(cv, el('div', 'klab', lab), val); K.append(kn);
    const toU = v => lg ? Math.log(v / mn) / Math.log(mx / mn) : (v - mn) / (mx - mn), fromU = u => { u = Math.max(0, Math.min(1, u)); return lg ? mn * (mx / mn) ** u : mn + (mx - mn) * u; };
    const fmt = v => (Math.abs(v) >= 100 ? Math.round(v) : +v.toFixed(Math.abs(v) >= 10 ? 1 : 2)) + '';
    kn.draw = () => { const v = fxVal(f, k), u = Math.max(0, Math.min(1, toU(v))), [g, w, h] = fitCanvas(cv), cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 4, a0 = .75 * Math.PI, a1 = a0 + 1.5 * Math.PI * u;
      g.lineCap = 'round'; g.lineWidth = 3; g.strokeStyle = '#ececec'; g.beginPath(); g.arc(cx, cy, R, a0, a0 + 1.5 * Math.PI); g.stroke();
      g.strokeStyle = '#141414'; g.beginPath(); g.arc(cx, cy, R, a0, a1); g.stroke();
      g.fillStyle = '#fff'; g.strokeStyle = '#d9d9d9'; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, R - 6, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#141414'; g.beginPath(); g.arc(cx + Math.cos(a1) * (R - 11), cy + Math.sin(a1) * (R - 11), 2.4, 0, TAU); g.fill();
      if (!isNum(f.p[k] ?? def)) { g.font = 'italic 11px Cambria Math, Georgia, serif'; g.textAlign = 'center'; g.fillStyle = '#9a9a9a'; g.fillText('ƒ', cx, cy + 4); }
      if (!val.querySelector('input')) val.textContent = fmt(v); };
    cv.onmousedown = e => { e.preventDefault(); const y0 = e.clientY, u0 = toU(fxVal(f, k)); const mv = ev => { f.p[k] = fmt(fromU(u0 + (y0 - ev.clientY) / 160)); kn.draw(); drawFxDisplay(); changed(); }; const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); }; addEventListener('mousemove', mv); addEventListener('mouseup', up); };
    cv.ondblclick = () => { f.p[k] = def; kn.draw(); drawFxDisplay(); changed(); };
    val.title = 'Clic: scrivi una funzione di b'; val.onclick = () => { if (val.querySelector('input')) return; const inp = el('input', 'pexp'); inp.value = f.p[k] ?? def; inp.spellcheck = false; val.textContent = ''; val.append(inp); inp.focus(); inp.select();
      const ok = () => { try { compileProg(inp.value.trim() || def, 'b'); inp.classList.remove('bad'); return true; } catch (e) { inp.classList.add('bad'); inp.title = e.message; return false; } };
      inp.oninput = () => { if (ok()) { f.p[k] = inp.value; drawFxDisplay(); changed(); } }; const close = () => { if (inp.isConnected) { inp.remove(); kn.draw(); } };
      inp.onkeydown = e => { if (e.key === 'Enter') close(); }; inp.onchange = close; inp.onblur = close; };
    kn.draw();
  }
  drawFxDisplay();
}
function drawFxDisplay() {
  if (!fxOpen || $('#wFx').hidden) return; const f = fxOpen.f, c = $('#fxDisp'), [g, w, h] = fitCanvas(c), V = k => fxVal(f, k);
  g.fillStyle = '#f4f4f4'; for (let i = 1; i < 6; i++) g.fillRect(i * w / 6, 0, 1, h); for (let i = 1; i < 4; i++) g.fillRect(0, i * h / 4, w, 1);
  g.strokeStyle = '#141414'; g.lineWidth = 2; g.lineJoin = 'round'; g.font = '10px Consolas, monospace'; g.fillStyle = '#9a9a9a'; const line = pts => { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); };
  if (f.type === 'eq') { const fq = u => 20 * 1000 ** u, Y = db => h / 2 - db / 20 * (h / 2 - 8), bands = [['low', V('lf'), V('lg'), .707], ['peak', V('mf'), V('mg'), V('mq')], ['high', V('hf'), V('hg'), .707]].map(b => bqCo(...b));
    g.fillStyle = '#e4e4e4'; g.fillRect(0, h / 2, w, 1); const pts = []; for (let x = 0; x <= w; x += 2) { const fr = fq(x / w); let db = 0; for (const c of bands) db += bqDb(c, fr); pts.push([x, Y(db)]); } line(pts);
    g.fillStyle = '#141414'; for (const [k1, k2] of [['lf', 'lg'], ['mf', 'mg'], ['hf', 'hg']]) { g.beginPath(); g.arc(Math.log(V(k1) / 20) / Math.log(1000) * w, Y(V(k2)), 4, 0, TAU); g.fill(); }
    g.fillStyle = '#9a9a9a'; ['100', '1k', '10k'].forEach((t, i) => g.fillText(t, Math.log([100, 1000, 10000][i] / 20) / Math.log(1000) * w + 3, h - 4)); }
  else if (f.type === 'comp') { const thr = V('thr'), ra = Math.max(1, V('ratio')), mk = V('gain'), X = d => (d + 60) / 60 * w, Y = d => h - (d + 60) / 60 * h;
    g.strokeStyle = '#d0d0d0'; g.lineWidth = 1; line([[0, h], [w, 0]]); g.strokeStyle = '#141414'; g.lineWidth = 2; const pts = []; for (let d = -60; d <= 0; d += .5) pts.push([X(d), Y(Math.min(0, (d < thr ? d : thr + (d - thr) / ra) + mk))]); line(pts);
    g.fillStyle = '#9a9a9a'; g.fillRect(X(thr), 0, 1, h); g.fillText('soglia ' + thr.toFixed(1) + ' dB · ' + ra.toFixed(1) + ':1', 6, 12); }
  else if (f.type === 'dist') { const F = (() => { try { return compileProg(String(f.p.curva || '').trim() || 'tanh(3s)', 's,b'); } catch { return null; } })(), X = s => (s + 1.5) / 3 * w, Y = v => h / 2 - v / 1.5 * (h / 2);
    g.strokeStyle = '#d0d0d0'; g.lineWidth = 1; line([[X(-1.5), Y(-1.5)], [X(1.5), Y(1.5)]]); g.strokeStyle = '#141414'; g.lineWidth = 2; if (F) { const pts = []; for (let i = 0; i <= w; i += 2) { const s = -1.5 + 3 * i / w; let v = +F(s, Math.max(curB, 0)); if (isFinite(v)) pts.push([i, Math.max(-2, Math.min(h + 2, Y(v)))]); } line(pts); } }
  else if (f.type === 'rev') { const T = .4 + 4 * V('size'), dm = V('damp'), m = V('mix');
    for (let x = 0; x < w; x += 3) { const t = x / w * 5, e = Math.exp(-6.9 * t / T), hh = e * (h - 20) * (.35 + .65 * m) * (.6 + .4 * Math.abs(Math.sin(x * 12.9898) * 43758 % 1)); g.fillStyle = 'rgba(20,20,20,' + (.15 + .7 * e * (1 - dm * .6)).toFixed(2) + ')'; g.fillRect(x, h - 10 - hh, 2, hh); }
    g.fillStyle = '#9a9a9a'; g.fillText('coda ≈ ' + T.toFixed(1) + ' s', 6, 12); }
  else if (f.type === 'delay') { const tb = V('time'), fb = V('fb'), m = V('mix'), pp = V('pp'), X = b => 8 + b / 8 * (w - 16), mid = h / 2;
    g.fillStyle = '#e4e4e4'; g.fillRect(0, mid, w, 1); for (let n = 0; n * tb <= 8 && n < 64; n++) { const a = n ? m * fb ** (n - 1) : 1, side = n && pp > .5 && n % 2 === 0 ? 1 : -1; g.fillStyle = n ? '#141414' : '#9a9a9a'; g.fillRect(X(n * tb) - 1.5, side < 0 ? mid - a * (mid - 10) : mid, 3, a * (mid - 10)); }
    g.fillStyle = '#9a9a9a'; g.fillText('8 beat · ripetizioni ogni ' + tb.toFixed(2) + ' beat', 6, 12); }
  else { const r = V('rate'), d = f.type === 'phaser' ? V('depth') : V('depth') / 20, t0 = performance.now() / 1000, pts = [];
    for (let x = 0; x <= w; x += 2) { const t = t0 + x / w * 4; pts.push([x, h / 2 - Math.sin(TAU * r * t) * d * (h / 2 - 10)]); } line(pts);
    g.fillStyle = '#9a9a9a'; g.fillText('LFO ' + r.toFixed(2) + ' Hz · 4 s', 6, 12); }
}
function bqCo(type, fr, g, q) { const sr = 44100; fr = Math.min(sr * .45, Math.max(10, fr)); const A = 10 ** (g / 40), w = TAU * fr / sr, cs = Math.cos(w), sn = Math.sin(w); let b0, b1, b2, a0, a1, a2;
  if (type === 'peak') { const al = sn / (2 * Math.max(.05, q)); b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }
  else { const sA = 2 * Math.sqrt(A) * (sn / 2 * Math.SQRT2); if (type === 'low') { b0 = A * ((A + 1) - (A - 1) * cs + sA); b1 = 2 * A * ((A - 1) - (A + 1) * cs); b2 = A * ((A + 1) - (A - 1) * cs - sA); a0 = (A + 1) + (A - 1) * cs + sA; a1 = -2 * ((A - 1) + (A + 1) * cs); a2 = (A + 1) + (A - 1) * cs - sA; }
    else { b0 = A * ((A + 1) + (A - 1) * cs + sA); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - sA); a0 = (A + 1) - (A - 1) * cs + sA; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - sA; } }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0]; }
function bqDb([b0, b1, b2, a1, a2], f) { const w = TAU * f / 44100, c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
  const nr = b0 + b1 * c1 + b2 * c2, ni = -(b1 * s1 + b2 * s2), dr = 1 + a1 * c1 + a2 * c2, di = -(a1 * s1 + a2 * s2); return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di)); }
setInterval(() => { if (fxOpen && !$('#wFx').hidden && (playing || ['chorus', 'phaser'].includes(fxOpen.f.type))) { drawFxDisplay(); $('#knobs2').querySelectorAll('.knob').forEach(k => k.draw && k.draw()); } }, 90);

// ===== Gestione plugin: cartelle scelte da te → libreria → aggiungi agli insert =====
const PLIB = (() => { try { return JSON.parse(localStorage.getItem('cartesio.plugins')) || {dirs:[], lib:[]}; } catch { return {dirs:[], lib:[]}; } })();
const savePlib = () => { try { localStorage.setItem('cartesio.plugins', JSON.stringify(PLIB)); } catch {} };
function renderDirs() { const D = $('#plugDirs'); D.innerHTML = ''; if (!PLIB.dirs.length) D.append(el('div', 'hint', 'Nessuna cartella: aggiungi quelle dove tieni VST3, DLL o CLAP.'));
  PLIB.dirs.forEach((d, i) => { const r = el('div', 'prow2'), x = el('button', 'x', '✕'); x.onclick = () => { PLIB.dirs.splice(i, 1); savePlib(); renderDirs(); }; r.append(el('span', 'pfmt', 'cartella'), el('span', '', d), el('span', 'sp'), x); D.append(r); }); }
async function addDirs() { if (!window.cartesio) return toast('Funziona solo nell\'app (exe)'); const ds = await window.cartesio.pickFolders(); for (const d of ds || []) if (!PLIB.dirs.includes(d)) PLIB.dirs.push(d); savePlib(); renderDirs(); if (ds && ds.length) scanPlugins(); }
async function scanPlugins() {
  const S = $('#plugStat'); if (!window.cartesio) { S.textContent = 'Funziona solo nell\'app (exe).'; return; } if (!PLIB.dirs.length) { S.textContent = 'Prima aggiungi una cartella.'; return; }
  S.textContent = 'Cerco…'; const t0 = performance.now(), r = await window.cartesio.scanPlugins(PLIB.dirs); renderPlugins(r);
  S.textContent = r.list.length + ' plugin trovati · ' + Math.round(performance.now() - t0) + ' ms';
}
const inLib = p => PLIB.lib.some(q => q.path === p.path);
const plugWhyNot = p => p.format === 'AAX' ? 'AAX: Avid lo permette solo dentro Pro Tools' : p.format === 'CLAP' ? 'CLAP: non ancora supportato dal ponte' : '';
function renderPlugins(r) {
  const L = $('#plugList'), q = $('#plugQ').value.toLowerCase(); L.innerHTML = ''; window._plugs = r;
  for (const p of r.list.filter(p => (p.name + ' ' + p.vendor).toLowerCase().includes(q))) {
    const row = el('div', 'prow2'), b = el('button', inLib(p) ? 'on' : '', inLib(p) ? '✓ In libreria' : '+ Libreria');
    b.onclick = () => { if (inLib(p)) PLIB.lib = PLIB.lib.filter(x => x.path !== p.path); else PLIB.lib.push({name:p.name, vendor:p.vendor, format:p.format, path:p.path, arch:p.arch || ''}); savePlib(); renderPlugins(r); };
    const why = plugWhyNot(p); row.append(el('span', 'pfmt', p.format + (p.arch === 'x86' ? ' · 32 bit' : '')), el('b', '', p.name), el('span', 'pven', why || p.vendor || ''), el('span', 'sp'), b); if (why) row.classList.add('off'); L.append(row);
  }
}
function openPick() {
  const P = $('#fxPick'); if (!P.hidden) { P.hidden = true; return; } P.innerHTML = ''; P.hidden = false;
  const q = el('input', 'pq'); q.placeholder = 'cerca un effetto…'; P.append(q);
  const body = el('div'); P.append(body);
  const add = fn => { fn(); P.hidden = true; };
  const draw = () => { const t = q.value.toLowerCase(); body.innerHTML = '';
    body.append(el('div', 'lbl', 'Effetti di Cartesio')); const g = el('div', 'pgrid'); body.append(g);
    for (const [k, d] of Object.entries(FXDEF)) if (d.name.toLowerCase().includes(t)) { const c = el('div', 'pick'); c.dataset.t = k; c.append(el('b', '', d.short), el('span', '', d.name)); c.onclick = () => add(() => { $('#addfx').value = k; $('#addfx').onchange(); }); g.append(c); }
    body.append(el('div', 'lbl', 'I tuoi plugin')); const l = el('div', 'plist'); body.append(l);
    const libs = PLIB.lib.filter(p => (p.name + ' ' + p.vendor).toLowerCase().includes(t));
    if (!PLIB.lib.length) l.append(el('div', 'hint', 'Libreria vuota: apri "Plugin", scegli le cartelle e aggiungi i plugin.'));
    for (const p of libs) { const why = plugWhyNot(p), r = el('div', 'pick row' + (why ? ' off' : '')); r.title = why; r.append(el('span', 'pfmt', p.format + (p.arch === 'x86' ? ' · 32 bit' : '')), el('b', '', p.name), el('span', 'pven', why || p.vendor || '')); r.onclick = () => why ? toast(why) : add(() => addExt(p)); l.append(r); } };
  q.oninput = draw; draw(); q.focus();
}


init(); // avvio dopo che tutto il codice è stato caricato
