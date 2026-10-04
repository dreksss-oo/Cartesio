// ===== DSP degli effetti (AudioWorklet) =====
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const bq = () => ({b0:1,b1:0,b2:0,a1:0,a2:0,x1:0,x2:0,y1:0,y2:0});
function bqSet(f, type, fr, g, q) {
  const sr = sampleRate; fr = Math.min(sr * .45, Math.max(10, fr)); const A = 10 ** (g / 40), w = TAU * fr / sr, cs = Math.cos(w), sn = Math.sin(w); let b0, b1, b2, a0, a1, a2;
  if (type === 'peak') { const al = sn / (2 * Math.max(.05, q)); b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }
  else { const sA = 2 * Math.sqrt(A) * (sn / 2 * Math.SQRT2);
    if (type === 'low') { b0 = A * ((A + 1) - (A - 1) * cs + sA); b1 = 2 * A * ((A - 1) - (A + 1) * cs); b2 = A * ((A + 1) - (A - 1) * cs - sA); a0 = (A + 1) + (A - 1) * cs + sA; a1 = -2 * ((A - 1) + (A + 1) * cs); a2 = (A + 1) + (A - 1) * cs - sA; }
    else { b0 = A * ((A + 1) + (A - 1) * cs + sA); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - sA); a0 = (A + 1) - (A - 1) * cs + sA; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - sA; } }
  f.b0 = b0 / a0; f.b1 = b1 / a0; f.b2 = b2 / a0; f.a1 = a1 / a0; f.a2 = a2 / a0;
}
const bqRun = (f, x) => { const y = f.b0 * x + f.b1 * f.x1 + f.b2 * f.x2 - f.a1 * f.y1 - f.a2 * f.y2; f.x2 = f.x1; f.x1 = x; f.y2 = f.y1; f.y1 = y; return y; };
function mkFX(type) {
  const sr = sampleRate;
  if (type === 'dist') return {proc(L, R, n, v, P, b) {
    const f = P.curva, m = clamp01(v.mix), o = v.out;
    for (let i = 0; i < n; i++) { const a = L[i], c = R[i]; let ya, yc; try { ya = +f(a, b); yc = +f(c, b); } catch { ya = a; yc = c; }
      if (!(Math.abs(ya) < 8)) ya = 0; if (!(Math.abs(yc) < 8)) yc = 0; L[i] = a + (ya * o - a) * m; R[i] = c + (yc * o - c) * m; } }};
  if (type === 'rev') {
    const sc = sr / 44100, mk = len => ({b:new Float32Array(Math.max(1, Math.round(len * sc))), i:0, f:0});
    const CT = [1116,1188,1277,1356,1422,1491,1557,1617], AT = [556,441,341,225];
    const cL = CT.map(mk), cR = CT.map(t => mk(t + 23)), aL = AT.map(mk), aR = AT.map(t => mk(t + 23));
    const comb = (c, x, fb, d) => { const y = c.b[c.i]; c.f = y * (1 - d) + c.f * d; c.b[c.i] = x + c.f * fb; if (++c.i >= c.b.length) c.i = 0; return y; };
    const ap = (a, x) => { const y = a.b[a.i]; a.b[a.i] = x + y * .5; if (++a.i >= a.b.length) a.i = 0; return y - x; };
    return {proc(L, R, n, v) {
      const fb = .7 + .28 * clamp01(v.size), d = .4 * clamp01(v.damp), m = clamp01(v.mix);
      for (let i = 0; i < n; i++) { const x = (L[i] + R[i]) * .015; let oL = 0, oR = 0;
        for (let k = 0; k < 8; k++) { oL += comb(cL[k], x, fb, d); oR += comb(cR[k], x, fb, d); }
        for (let k = 0; k < 4; k++) { oL = ap(aL[k], oL); oR = ap(aR[k], oR); }
        L[i] = L[i] * (1 - m) + oL * 3 * m; R[i] = R[i] * (1 - m) + oR * 3 * m; } }};
  }
  if (type === 'delay') {
    const N = sr * 4 | 0, bl = new Float32Array(N), br = new Float32Array(N); let w = 0;
    return {proc(L, R, n, v, P, b, bpm) {
      const d = Math.max(1, Math.min(N - 1, Math.round(v.time * 60 / bpm * sr) || 1)), fb = Math.max(0, Math.min(.97, v.fb)), m = clamp01(v.mix), pp = clamp01(v.pp);
      for (let i = 0; i < n; i++) { let r = w - d; if (r < 0) r += N; const dl = bl[r], dr = br[r], iL = L[i], iR = R[i];
        bl[w] = iL * (1 - pp * .5) + iR * pp * .5 + (dl * (1 - pp) + dr * pp) * fb; br[w] = iR * (1 - pp) + (dr * (1 - pp) + dl * pp) * fb;
        if (++w >= N) w = 0; L[i] = iL + dl * m; R[i] = iR + dr * m; } }};
  }
  if (type === 'eq') {
    const F = [bq(), bq(), bq(), bq(), bq(), bq()]; let key = '';
    return {proc(L, R, n, v) {
      const k = [v.lf, v.lg, v.mf, v.mg, v.mq, v.hf, v.hg].join();
      if (k !== key) { key = k; for (const c of [0, 3]) { bqSet(F[c], 'low', v.lf, v.lg); bqSet(F[c + 1], 'peak', v.mf, v.mg, v.mq); bqSet(F[c + 2], 'high', v.hf, v.hg); } }
      for (let i = 0; i < n; i++) { L[i] = bqRun(F[2], bqRun(F[1], bqRun(F[0], L[i]))); R[i] = bqRun(F[5], bqRun(F[4], bqRun(F[3], R[i]))); } }};
  }
  if (type === 'comp') { let env = 0, g = 1, gt = 1;
    return {proc(L, R, n, v) {
      const ra = Math.max(1, v.ratio), aa = 1 - Math.exp(-1 / (Math.max(.1, v.att) * .001 * sr)), ar = 1 - Math.exp(-1 / (Math.max(1, v.rel) * .001 * sr)), mk = 10 ** (v.gain / 20);
      for (let i = 0; i < n; i++) {
        const x = Math.max(Math.abs(L[i]), Math.abs(R[i])); env += (x - env) * (x > env ? aa : ar);
        if ((i & 7) === 0) { const over = 20 * Math.log10(env + 1e-9) - v.thr; gt = mk * (over > 0 ? 10 ** (-over * (1 - 1 / ra) / 20) : 1); }
        g += (gt - g) * .2; L[i] *= g; R[i] *= g; } }};
  }
  if (type === 'chorus') {
    const N = Math.ceil(sr * .06), bl = new Float32Array(N), br = new Float32Array(N); let w = 0, ph = 0;
    const rd = (bf, d) => { let p = w - d; if (p < 0) p += N; const i0 = Math.floor(p), f = p - i0, i1 = i0 + 1 >= N ? 0 : i0 + 1; return bf[i0] * (1 - f) + bf[i1] * f; };
    return {proc(L, R, n, v) {
      const inc = TAU * Math.max(0, v.rate) / sr, dep = Math.max(0, Math.min(20, v.depth)) * sr / 1000, base = .012 * sr, m = clamp01(v.mix);
      for (let i = 0; i < n; i++) { bl[w] = L[i]; br[w] = R[i]; const yl = rd(bl, base + dep * (.5 + .5 * Math.sin(ph))), yr = rd(br, base + dep * (.5 + .5 * Math.cos(ph)));
        L[i] = L[i] * (1 - m) + yl * m; R[i] = R[i] * (1 - m) + yr * m; if (++w >= N) w = 0; ph += inc; if (ph > TAU) ph -= TAU; } }};
  }
  if (type === 'phaser') {
    const zl = new Float64Array(6), zr = new Float64Array(6); let ph = 0, fl = 0, fr = 0, a = 0;
    return {proc(L, R, n, v) {
      const inc = TAU * Math.max(0, v.rate) / sr, dep = clamp01(v.depth), fb = Math.max(-.95, Math.min(.95, v.fb)), m = clamp01(v.mix);
      for (let i = 0; i < n; i++) {
        if ((i & 15) === 0) { const f = 200 * 10 ** (1.3 * dep * (.5 + .5 * Math.sin(ph))), tn = Math.tan(Math.PI * Math.min(f, sr * .45) / sr); a = (tn - 1) / (tn + 1); }
        let xl = L[i] + fb * fl, xr = R[i] + fb * fr;
        for (let k = 0; k < 6; k++) { const yl = a * xl + zl[k]; zl[k] = xl - a * yl; xl = yl; const yr = a * xr + zr[k]; zr[k] = xr - a * yr; xr = yr; }
        fl = xl; fr = xr; L[i] = L[i] * (1 - m * .5) + xl * m * .5; R[i] = R[i] * (1 - m * .5) + xr * m * .5; ph += inc; if (ph > TAU) ph -= TAU; } }};
  }
  return {proc() {}};
}

// ===== AudioWorklet: suona le funzioni in tempo reale =====
class CurvaProc extends AudioWorkletProcessor {
  constructor(o) {
    super(); const op = (o && o.processorOptions) || {};
    this.voices = new Map(); this.fxs = new Map(); this.bL = []; this.bR = []; this.pk = new Float32Array(1); this.mix = []; this.bpm = 128; this.playing = false; this.b = 0; this.loop = true; this.bps = 0; this.fr = 0; this.blk = 0; this.p = null; this.pv = 0;
    this.port.onmessage = e => { const d = e.data; if (d.type === 'proj') this.setProj(d.proj); else if (d.type === 'play') this.start(d); else if (d.type === 'stop') this.halt(); else if (d.type === 'note') this.note(d); else if (d.type === 'metro') this.met = d; else if (d.type === 'hostPort') { this.hp = d.port; this.hp.onmessage = e => this.hostOut(e.data); if (this.p) this.setMix(this.p.mixer || []); } };
    if (op.proj) this.setProj(op.proj); if (op.play) this.start(op.play);
  }
  setProj(p) {
    this.p = p; this.pats = new Map();
    for (const pat of p.patterns) {
      for (const ch of pat.channels) { try { ch._Y = ch.comp && ch.comp.trim() ? compileProg(ch.comp, 'x') : null; } catch { ch._Y = null; } getC(ch); ch._base = 440 * 2 ** ((ch.root + 12 * ch.oct - 69) / 12); }
      pat._aud = audible(pat); this.pats.set(pat.id, pat);
    }
    try { this.B = compileProg(p.bpm, 'b'); } catch { this.B = null; }
    this.setMix(p.mixer && p.mixer.length ? p.mixer : [{vol:1, pan:0, fx:[]}]);
  }
  setMix(M) {
    const keep = new Map();
    this.mix = M.map(s => ({vol:+s.vol, pan:+s.pan || 0, mute:!!s.mute, last:-1e9, ext:(s.fx || []).filter(f => f.type === 'ext' && f.on !== false).map(f => f.id), fx:(s.fx || []).filter(f => FXDEF[f.type]).map(f => {
      let st = this.fxs.get(f.id); if (!st || st.type !== f.type) st = {type:f.type, d:mkFX(f.type)}; keep.set(f.id, st);
      const P = {}, D = {};
      for (const [k, , def] of FXDEF[f.type].p) { const pr = k === 'curva' ? 's,b' : 'b', src = f.p && f.p[k] != null && String(f.p[k]).trim() ? String(f.p[k]) : def;
        try { P[k] = compileProg(src, pr); } catch { P[k] = compileProg(def, pr); } D[k] = +compileProg(def, pr)(0, 0); }
      return {on:f.on !== false, type:f.type, st, P, D};
    })}));
    for (const [id, st] of this.fxs) if (!keep.has(id)) { /* effetto rimosso */ }
    this.fxs = keep;
    while (this.bL.length < this.mix.length) { this.bL.push(new Float32Array(128)); this.bR.push(new Float32Array(128)); }
    this.pk = new Float32Array(this.mix.length);
    // plugin esterni: anello di ritorno per insert e ritardo uguale per tutti gli altri (compensazione della latenza)
    // latenza fissa del giro verso i plugin: margine ampio = niente buchi; tutto il resto viene ritardato uguale (PDC), quindi niente fuori tempo
    const nl = (this.p && this.p.lat) || 4096; if (this.LAT && nl !== this.LAT) { this.dl = []; this.xr = []; } this.LAT = nl; this.anyExt = !!this.hp && this.mix.some((m, k) => k > 0 && m.ext.length); this.someExt = !!this.hp && this.mix.some(m => m.ext.length); this.xr = this.xr || []; this.dl = this.dl || []; this.ai = this.ai || 0;
    this.mix.forEach((m, k) => { const key = m.ext.join(','); if (!m.ext.length) this.xr[k] = null; else if (!this.xr[k] || this.xr[k].key !== key) this.xr[k] = {key, L:new Float32Array(32768), R:new Float32Array(32768), w:this.LAT, r:0, lat:0, aL:new Float32Array(256), aR:new Float32Array(256)}; });
  }
  click(off, beat) { const m = this.met, sr = sampleRate; if (!this.mr) { this.mr = new Float32Array(65536); this.mp = 0; }
    const acc = m.accent !== false && ((beat % 4) + 4) % 4 === 0, S = {soft:[acc ? 1568 : 1175, .05, 2.76, .18], wood:[acc ? 1046 : 784, .028, 2.48, .5], click:[acc ? 2637 : 1976, .012, 1.5, .3]}[m.sound] || [1175, .05, 2.76, .18];
    const g = (m.vol ?? .6) * .32 * (acc ? 1 : .68), N = Math.round(sr * (S[1] * 7)), d = (this.someExt ? this.LAT : 0) + off, R = this.mr, M = R.length - 1, w1 = TAU * S[0] / sr, w2 = w1 * S[2];
    for (let i = 0; i < N; i++) { const t = i / sr, a = Math.min(1, t / .0015), e1 = Math.exp(-t / S[1]), e2 = Math.exp(-t / (S[1] * .35));
      R[(this.mp + d + i) & M] += g * a * (e1 * Math.sin(w1 * i) + S[3] * e2 * Math.sin(w2 * i)); } }
  hostOut(m) { if (!m) return; if (m.t === 'outAll') { for (const it of m.items) this.hostIn(it); return; } if (m.t === 'out') this.hostIn(m); }
  hostIn(m) { const x = this.xr[m.ins]; if (!x || !m.L) return;
    const lat = Math.max(0, Math.min(this.LAT - 1024, m.lat | 0)); if (lat !== x.lat) { x.r += lat - x.lat; x.lat = lat; }   // compensa la latenza dichiarata dai plugin
    for (let i = 0; i < m.L.length; i++) { x.L[x.w & 32767] = m.L[i]; x.R[x.w & 32767] = m.R[i]; x.w++; } }
  pdc(k, L, R, n) { let d = this.dl[k]; if (!d) d = this.dl[k] = {L:new Float32Array(this.LAT), R:new Float32Array(this.LAT), i:0};
    for (let i = 0; i < n; i++) { const a = L[i], b = R[i]; L[i] = d.L[d.i]; R[i] = d.R[d.i]; d.L[d.i] = a; d.R[d.i] = b; if (++d.i >= this.LAT) d.i = 0; } }
  vals(fx) { const v = {}; for (const [k] of FXDEF[fx.type].p) { if (k === 'curva') continue; let x; try { x = +fx.P[k](this.b); } catch { x = NaN; } v[k] = isFinite(x) ? x : fx.D[k]; } return v; }
  runIns(k, n) {
    const s = this.mix[k], L = this.bL[k], R = this.bR[k];
    if (this.act[k]) s.last = currentTime; else if (k > 0 && !(this.hp && s.ext.length) && (!s.fx.length || currentTime - s.last > 12)) return;
    for (const fx of s.fx) if (fx.on) fx.st.d.proc(L, R, n, this.vals(fx), fx.P, this.b, this.bpm);
    if (this.hp && s.ext.length) { const x = this.xr[k]; x.aL.set(L.subarray(0, n), this.ai); x.aR.set(R.subarray(0, n), this.ai);   // spedito tutto insieme a fine blocco
      const av = x.w - x.r; if (av > this.LAT + 4096) { x.r = x.w - (this.LAT - x.lat); }
      if (x.w - x.r >= n) for (let i = 0; i < n; i++) { L[i] = x.L[x.r & 32767]; R[i] = x.R[x.r & 32767]; x.r++; } else { L.fill(0, 0, n); R.fill(0, 0, n); x.r += n; } }   // in ritardo: silenzio ma resta a tempo
    else if (k > 0 && this.anyExt) this.pdc(k, L, R, n);
    const g = s.mute ? 0 : s.vol, gl = g * Math.min(1, 1 - s.pan), gr = g * Math.min(1, 1 + s.pan), ML = this.bL[0], MR = this.bR[0]; let p2 = 0;
    for (let i = 0; i < n; i++) {
      let a = L[i] * gl, c = R[i] * gr; if (a !== a) a = 0; if (c !== c) c = 0;
      if (k) { ML[i] += a; MR[i] += c; } else { L[i] = a; R[i] = c; }
      const q = a > 0 ? a : -a; if (q > p2) p2 = q;
    }
    if (p2 > this.pk[k]) this.pk[k] = p2;
    if (k) this.act[0] = 1;
  }
  start(d) { this.playing = true; this.b = d.b || 0; this.b0 = this.b; this.loop = d.loop !== false; for (const [k, v] of this.voices) if (!k.startsWith('pv')) this.rel(v); }
  halt() { this.playing = false; for (const v of this.voices.values()) this.rel(v); }
  note(d) {
    let ch = null; for (const pat of this.p.patterns) for (const c of pat.channels) if (c.id === d.ch) ch = c;
    if (!ch) return; const v = {ch, ph:0, t:0, env:0, st:0, on:true, freq:Math.min(ch._base, sampleRate * .45), until:currentTime + d.dur};
    this.arm(v); this.voices.set('pv' + (++this.pv), v);
  }
  arm(v) { const c = v.ch, a = (c.pan + 1) * Math.PI / 4; v.ai = 1 / (Math.max(c.a, .001) * sampleRate); v.di = (1 - c.s) / (Math.max(c.d, .001) * sampleRate); v.gain = c.vol * .8; v.gl = Math.cos(a); v.gr = Math.sin(a); }
  rel(v) { if (!v.on) return; v.on = false; v.ri = Math.max(v.env, 1e-4) / (Math.max(v.ch.r, .005) * sampleRate); }
  control() {
    const p = this.p, seen = ++this.fr; let pat = null, x0 = this.b;
    if (p.mode === 'pat') { pat = this.pats.get(p.selPat); x0 = pat ? this.b % (pat.bars * 4) : this.b; }
    let bpm = 128; if (this.B) { try { bpm = +this.B(x0); } catch {} } bpm = isFinite(bpm) ? Math.min(400, Math.max(20, bpm)) : 128;
    this.bps = bpm / 60 / sampleRate; this.bpm = bpm;
    const act = (key, ch, x) => {
      let y = NaN; if (ch._Y) { try { y = ch._Y(x); } catch {} }
      if (Array.isArray(y)) { const n = Math.min(8, y.length); for (let i = 0; i < n; i++) one(key + '#' + i, ch, +y[i]); } else one(key, ch, +y);
    };
    const one = (key, ch, y) => {
      let v = this.voices.get(key), fq = NaN;
      if (y === y && Math.abs(y) !== Infinity) fq = ch.unit === 'hz' ? y : ch.unit === 'ottave' ? ch._base * 2 ** y : ch._base * 2 ** (y / 12);
      if (fq > 0 && fq < 1e6) {
        if (!v) { v = {ch, ph:0, t:0, env:0, st:0, on:false}; this.voices.set(key, v); }
        v.ch = ch; if (!v.on) { v.on = true; v.st = 0; v.t = 0; } this.arm(v); v.freq = Math.min(fq, sampleRate * .45); v.seen = seen;
      } else if (v) { this.rel(v); v.seen = seen; }
    };
    if (p.mode === 'pat') { if (pat) for (const ch of pat._aud) act('p' + ch.id, ch, x0); }
    else for (const c of p.clips) {
      if (p.tmute.includes(c.tr) || this.b < c.s || this.b >= c.s + c.l) continue;
      const pt = this.pats.get(c.p); if (!pt) continue; const L = pt.bars * 4, x = ((this.b - c.s + c.o) % L + L) % L;
      for (const ch of pt._aud) act(c.id + ':' + ch.id, ch, x);
    }
    for (const [k, v] of this.voices) if (v.seen !== seen && !k.startsWith('pv')) this.rel(v);
  }
  process(_, outs) {
    const o = outs[0], OL = o[0], OR = o[1] || o[0], n = OL.length, sr = sampleRate, dt = 1 / sr;
    if (!this.p) return true;
    const NI = this.mix.length; if (!this.act || this.act.length !== NI) this.act = new Uint8Array(NI); for (let k = 0; k < NI; k++) { this.bL[k].fill(0); this.bR[k].fill(0); } this.act.fill(0);
    for (let s0 = 0; s0 < n; s0 += 16) {
      if (this.playing) this.control();
      const e = Math.min(n, s0 + 16);
      for (const [k, v] of this.voices) {
        if (v.until !== undefined && v.on && currentTime + s0 * dt >= v.until) this.rel(v);
        const C = v.ch._c, S = v.ch.s, inc = TAU * v.freq * dt, ii = v.ch.ins > 0 && v.ch.ins < NI ? v.ch.ins : 0, L = this.bL[ii], R = this.bR[ii]; this.act[ii] = 1;
        for (let i = s0; i < e; i++) {
          if (v.on) { if (v.st === 0) { v.env += v.ai; if (v.env >= 1) { v.env = 1; v.st = 1; } } else if (v.st === 1) { v.env -= v.di; if (v.env <= S) { v.env = S; v.st = 2; } } }
          else { v.env -= v.ri; if (v.env < 0) v.env = 0; }
          if (v.env > 0 && C && C.g) {
            let y; try { y = +C.w(v.ph, v.t); } catch { y = 0; }
            if (y !== y || y === Infinity || y === -Infinity) y = 0;
            y = (y - C.mean) * C.g; if (y > 1) y = 1; else if (y < -1) y = -1;
            const a = y * v.env * v.gain; L[i] += a * v.gl; R[i] += a * v.gr;
          }
          v.ph += inc; if (v.ph >= TAU) v.ph -= TAU; v.t += dt;
        }
        if (!v.on && v.env <= 0) this.voices.delete(k);
      }
      if (this.playing) { const mb0 = this.b;
        this.b += (e - s0) * this.bps;
        if (this.met && this.met.on) { const k0 = this.mwrap ? Math.floor(mb0) : Math.ceil(mb0 - 1e-9); this.mwrap = false; if (k0 < this.b) this.click(s0 + Math.max(0, Math.round((k0 - mb0) / this.bps)), k0); }
        const end = this.p.mode === 'song' ? this.p.end : 0;
        if (end > 0 && this.b >= end) { if (this.loop) { this.b -= end; this.mwrap = true; } else this.halt(); }
      }
    }
    if (this.anyExt) this.pdc(0, this.bL[0], this.bR[0], n);
    for (let k = 1; k < NI; k++) this.runIns(k, n);
    this.runIns(0, n); OL.set(this.bL[0].subarray(0, n)); if (OR !== OL) OR.set(this.bR[0].subarray(0, n));
    if (this.mr) { const R = this.mr, M = R.length - 1; for (let i = 0; i < n; i++) { const j = (this.mp + i) & M, v = R[j]; if (v) { OL[i] += v; if (OR !== OL) OR[i] += v; R[j] = 0; } } this.mp = (this.mp + n) & M; }
    if (this.someExt) { this.ai += n; if (this.ai >= 256) { this.ai = 0; const items = [];   // un solo messaggio per tutti gli insert con plugin
      for (let k = 0; k < NI; k++) { const x = this.xr[k]; if (x && this.mix[k].ext.length) items.push({ins:k, ids:this.mix[k].ext, L:x.aL, R:x.aR}); }
      if (items.length) this.hp.postMessage({t:'procAll', items}); } }
    if (++this.blk % 6 === 0) { this.port.postMessage({b:this.someExt && this.playing ? Math.max(this.b0, this.b - this.LAT * this.bps) : this.b, playing:this.playing, pk:Array.from(this.pk), nv:this.voices.size}); this.pk.fill(0); }
    return true;
  }
}
registerProcessor('cartesio', CurvaProc);
