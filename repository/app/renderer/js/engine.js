// Cartesio · linguaggio matematico (LaTeX / Desmos / testo libero → JavaScript). Usato dalla pagina e dal motore audio.
// ===== Linguaggio matematico di Cartesio: LaTeX / Desmos / testo libero -> JS =====
const TAU = Math.PI * 2;
const frac_ = x => ((x / TAU) % 1 + 1) % 1;
const gammaF = z => { if (z < .5) return Math.PI / (Math.sin(Math.PI * z) * gammaF(1 - z)); z -= 1; const g = [0.99999999999980993,676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7]; let a = g[0]; const t = z + 7.5; for (let i = 1; i < 9; i++) a += g[i] / (z + i); return Math.sqrt(TAU) * t ** (z + .5) * Math.exp(-t) * a; };
const flat = a => a.flat(Infinity);
const gcd2 = (a, b) => { a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b)); while (b) [a, b] = [b, a % b]; return a; };
const H = Object.assign(Object.create(null), Object.fromEntries(Object.getOwnPropertyNames(Math).map(k => [k, Math[k]])), {
  sq: x => (Math.sin(x) >= 0 ? 1 : -1), saw: x => 2 * frac_(x) - 1, tri: x => 1 - 4 * Math.abs(frac_(x) - .5),
  noise: () => Math.random() * 2 - 1, clamp: (v, a = -1, b = 1) => Math.min(b, Math.max(a, v)),
  mod: (a, b) => ((a % b) + b) % b, step: x => (x >= 0 ? 1 : 0), heaviside: x => (x >= 0 ? 1 : 0),
  seq: (i, ...a) => (a = flat(a), a.length ? a[((Math.floor(i) % a.length) + a.length) % a.length] : NaN),
  every: (b, p = 1, ph = 0) => { const m = (((b - ph) % p) + p) % p; return m < 1e-6 || p - m < 1e-6 ? 1 : 0; },
  pulse: (b, p = 1, w = .5) => ((((b % p) + p) % p) < w ? 1 : 0),
  euclid: (i, k, n) => { i = Math.floor(i); return ((((i * k) % n) + n) % n) < k ? 1 : 0; },
  rnd: i => { const h = Math.sin(Math.floor(i) * 12.9898 + 78.233) * 43758.5453; return h - Math.floor(h); },
  ln: Math.log, log: Math.log10, lg: Math.log10, logb: (b, x) => Math.log(x) / Math.log(b),
  sec: x => 1 / Math.cos(x), csc: x => 1 / Math.sin(x), cot: x => 1 / Math.tan(x),
  arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan, arcsinh: Math.asinh, arccosh: Math.acosh, arctanh: Math.atanh,
  arsinh: Math.asinh, arcosh: Math.acosh, artanh: Math.atanh, sgn: Math.sign, frac: x => x - Math.floor(x),
  gcd: (...a) => flat(a).reduce(gcd2), lcm: (...a) => flat(a).reduce((x, y) => Math.abs(x * y) / gcd2(x, y)),
  gamma: gammaF, fact: n => (Number.isInteger(n) && n >= 0 && n < 171 ? (() => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; })() : gammaF(n + 1)),
  nCr: (n, k) => H.fact(n) / (H.fact(k) * H.fact(n - k)), nPr: (n, k) => H.fact(n) / H.fact(n - k), choose: (n, k) => H.nCr(n, k),
  sinc: x => (x === 0 ? 1 : Math.sin(x) / x), sigmoid: x => 1 / (1 + Math.exp(-x)), lerp: (a, b, u) => a + (b - a) * u,
  smoothstep: (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); },
  root: (n, x) => (x < 0 && n % 2 ? -((-x) ** (1 / n)) : x ** (1 / n)),
  max: (...a) => Math.max(...flat(a)), min: (...a) => Math.min(...flat(a)), total: (...a) => flat(a).reduce((s, v) => s + v, 0),
  mean: (...a) => { a = flat(a); return a.reduce((s, v) => s + v, 0) / a.length; }, length: a => (Array.isArray(a) ? a.length : 1),
  at: (a, i) => (Array.isArray(a) ? a[(i + .5 | 0) - 1] : NaN),
  sum: (a, b, f) => { let s = 0; for (let k = Math.ceil(a), n = 0; k <= b && n < 10000; k++, n++) s += f(k); return s; },
  prod: (a, b, f) => { let s = 1; for (let k = Math.ceil(a), n = 0; k <= b && n < 10000; k++, n++) s *= f(k); return s; },
  round: (x, d = 0) => { const p = 10 ** d; return Math.round(x * p) / p; },
  square: x => (Math.sin(x) >= 0 ? 1 : -1), sawtooth: x => 2 * frac_(x) - 1, triangle: x => 1 - 4 * Math.abs(frac_(x) - .5),
  pi: Math.PI, 'π': Math.PI, e: Math.E, tau: TAU, 'τ': TAU, phi: (1 + Math.sqrt(5)) / 2, 'φ': (1 + Math.sqrt(5)) / 2, inf: Infinity
});
// ---- estensioni del linguaggio: musica, ritmo, inviluppi, sintesi, bit, liste, matematica ----
{ const SC = {major:[0,2,4,5,7,9,11], minor:[0,2,3,5,7,8,10], penta:[0,2,4,7,9], minpenta:[0,3,5,7,10], blues:[0,3,5,6,7,10], dorian:[0,2,3,5,7,9,10], phrygian:[0,1,3,5,7,8,10],
    lydian:[0,2,4,6,7,9,11], mixolydian:[0,2,4,5,7,9,10], locrian:[0,1,3,5,6,8,10], harmonic:[0,2,3,5,7,8,11], melodic:[0,2,3,5,7,9,11], whole:[0,2,4,6,8,10], chromatic:[0,1,2,3,4,5,6,7,8,9,10,11]};
  const deg = (i, st) => { i = Math.round(i); const n = st.length, o = Math.floor(i / n); return st[((i % n) + n) % n] + 12 * o; };
  const quant = (x, st) => { const o = Math.floor(x / 12), r = x - 12 * o; let best = st[0], bd = 99; for (const v of [...st, st[0] + 12]) { const d = Math.abs(r - v); if (d < bd) { bd = d; best = v; } } return best + 12 * o; };
  let PR = null; const primes = () => { if (PR) return PR; const N = 120000, c = new Uint8Array(N); PR = []; for (let i = 2; i < N; i++) if (!c[i]) { PR.push(i); for (let j = i * i; j < N; j += i) c[j] = 1; } return PR; };
  const erf = x => { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + .3275911 * x); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x)); };
  const L_ = a => (Array.isArray(a) ? a : [a]);
  Object.assign(H, {
    // altezze e scale (semitoni, 0 = radice)
    mtof: m => 440 * 2 ** ((m - 69) / 12), ftom: f => 69 + 12 * Math.log2(f / 440), semi: n => 2 ** (n / 12),
    scale: (i, ...st) => deg(i, (st = flat(st)).length ? st : SC.major), quant: (x, ...st) => quant(x, (st = flat(st)).length ? st : SC.major),
    ...Object.fromEntries(Object.entries(SC).map(([k, v]) => [k, i => deg(i, v)])),
    // accordi (liste = più note insieme)
    triad: (r, q = 0) => [r, r + (q < 0 ? 3 : 4), r + 7], chmaj: r => [r, r + 4, r + 7], chmin: r => [r, r + 3, r + 7], chdim: r => [r, r + 3, r + 6], chaug: r => [r, r + 4, r + 8],
    sus2: r => [r, r + 2, r + 7], sus4: r => [r, r + 5, r + 7], chmaj7: r => [r, r + 4, r + 7, r + 11], chmin7: r => [r, r + 3, r + 7, r + 10], chdom7: r => [r, r + 4, r + 7, r + 10],
    power: r => [r, r + 7, r + 12], octaves: (r, n = 2) => Array.from({length:Math.max(1, Math.min(8, n))}, (_, k) => r + 12 * k),
    // ritmo
    phasor: (b, p = 1) => (((b / p) % 1) + 1) % 1, lfo: (b, f = 1, ph = 0) => Math.sin(TAU * (f * b + ph)), chance: (i, p = .5, s = 0) => (hash_(i + 1013 * s) < p ? 1 : 0),
    euclid: (i, k, n, r = 0) => { i = Math.floor(i) + Math.floor(r); return ((((i * k) % n) + n) % n) < k ? 1 : 0; }, bar: b => Math.floor(b / 4), beatin: b => (((b % 4) + 4) % 4),
    gate: (b, p = 1, w = .5) => ((((b % p) + p) % p) < w * p ? 1 : 0),
    // inviluppi (t = secondi dall'inizio della nota)
    decay: (t, d = .3) => Math.exp(-t / d), ad: (t, a = .005, d = .3) => (t < a ? t / a : Math.exp(-(t - a) / d)), perc: (t, d = .2) => (1 - Math.exp(-t / .002)) * Math.exp(-t / d),
    adsr: (t, a = .01, d = .1, sl = .7, len = .5, r = .2) => (t < a ? t / a : t < a + d ? 1 - (1 - sl) * (t - a) / d : t < len ? sl : sl * Math.exp(-(t - len) / r)),
    swell: (t, a = .5) => Math.min(1, (t / a) ** 2),
    // sintesi (x = fase in radianti)
    pwm: (x, w = .5) => (frac_(x) < w ? 1 : -1), fm: (x, r = 2, i = 1) => Math.sin(x + i * Math.sin(r * x)), am: (x, r = 2, d = .5) => Math.sin(x) * (1 - d + d * Math.sin(r * x)),
    harm: (x, n = 8) => { let v = 0; for (let k = 1; k <= Math.min(64, n); k++) v += Math.sin(k * x) / k; return v * 2 / Math.PI; },
    odd: (x, n = 8) => { let v = 0; for (let k = 1; k <= Math.min(64, n); k++) v += Math.sin((2 * k - 1) * x) / (2 * k - 1); return v * 4 / Math.PI; },
    supersaw: (x, n = 7, dt = .01) => { let v = 0; for (let k = 0; k < n; k++) v += 2 * frac_(x * (1 + dt * (k - (n - 1) / 2))) - 1; return v / n; },
    fold: v => 1 - 4 * Math.abs(((((v + 1) / 4) % 1) + 1) % 1 - .5), clip: (v, a = -1, b = 1) => Math.min(b, Math.max(a, v)),
    crush: (v, bits = 4) => { const q = 2 ** Math.max(1, bits) / 2; return Math.round(v * q) / q; }, quantize: (v, st = .25) => Math.round(v / st) * st,
    // bit (stile bytebeat)
    band: (a, b) => a & b, bor: (a, b) => a | b, bxor: (a, b) => a ^ b, shl: (a, n) => a << n, shr: (a, n) => a >> n, bit: (i, k) => (Math.floor(i) >> k) & 1,
    // matematica
    erf, erfc: x => 1 - erf(x), deg: x => x * 180 / Math.PI, rad: x => x * Math.PI / 180, wrap: (v, a = 0, b = 1) => a + ((((v - a) % (b - a)) + (b - a)) % (b - a)),
    map: (v, a, b, c, d) => c + (v - a) * (d - c) / (b - a), between: (x, a, b) => (x >= a && x <= b ? 1 : 0), mix: (a, b, u) => a + (b - a) * u,
    easein: u => u * u, easeout: u => 1 - (1 - u) * (1 - u), easeinout: u => (u = Math.min(1, Math.max(0, u)), u * u * (3 - 2 * u)),
    besselj: (n, x) => { let s = 0, t = (x / 2) ** n / gammaF(n + 1); for (let k = 0; k < 40; k++) { s += t; t *= -(x * x / 4) / ((k + 1) * (k + 1 + n)); } return s; },
    beta: (a, b) => gammaF(a) * gammaF(b) / gammaF(a + b), isprime: n => { n = Math.floor(n); if (n < 2) return 0; for (let d = 2; d * d <= n; d++) if (n % d === 0) return 0; return 1; },
    prime: k => primes()[Math.max(0, Math.floor(k) - 1)] ?? NaN, fib: n => Math.round(((1 + Math.sqrt(5)) / 2) ** Math.floor(n) / Math.sqrt(5)),
    chaos: (i, r = 3.9, x0 = .5) => { let x = x0; for (let k = 0, n = Math.min(5000, Math.max(0, Math.floor(i))); k < n; k++) x = r * x * (1 - x); return x; },
    // liste
    range: (a, b, st = 1) => { const r = []; if (st === 0) return r; for (let v = a, n = 0; (st > 0 ? v <= b + 1e-9 : v >= b - 1e-9) && n < 4096; v += st, n++) r.push(+v.toFixed(10)); return r; },
    rev: a => L_(a).slice().reverse(), sort: a => L_(a).slice().sort((p, q) => p - q), rotate: (a, k = 1) => { a = L_(a); const n = a.length, s = ((Math.floor(k) % n) + n) % n; return a.slice(s).concat(a.slice(0, s)); },
    repeat: (a, n = 2) => { a = L_(a); let r = []; for (let k = 0; k < Math.min(64, n); k++) r = r.concat(a); return r; },
    shuffle: (a, seed = 0) => { a = L_(a).slice(); for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(hash_(k * 7.31 + seed * 131.7) * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; },
    first: a => L_(a)[0], last: a => { a = L_(a); return a[a.length - 1]; }, count: a => L_(a).length,
    median: (...a) => { a = flat(a).sort((p, q) => p - q); const n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : NaN; },
    std: (...a) => { a = flat(a); const m = a.reduce((p, q) => p + q, 0) / a.length; return Math.sqrt(a.reduce((p, q) => p + (q - m) ** 2, 0) / a.length); },
  }); }
const NOVEC = new Set(['max','min','total','mean','length','at','tab','integ','seq','gcd','lcm','sum','prod','noise','__range','scale','quant','triad','chmaj','chmin','chdim','chaug','sus2','sus4','chmaj7','chmin7','chdom7','power','octaves','range','rev','sort','rotate','repeat','shuffle','first','last','count','median','std']);
const ICACHE = new WeakMap(), hash_ = i => { const h = Math.sin(Math.floor(i) * 12.9898 + 78.233) * 43758.5453; return h - Math.floor(h); };
// tab(L, u): lista letta in posizione continua u (interpolazione lineare) · integ(L, u): integrale da 0 a u · rumore(r, t, s): rumore liscio con banda r Hz
H.tab = (L, u) => { if (!Array.isArray(L)) return NaN; const n = L.length; if (!(u >= 0) || u > n - 1) return 0; const j = u | 0, q = u - j; return j + 1 < n ? L[j] + (L[j + 1] - L[j]) * q : L[j]; };
H.integ = (L, u) => { if (!Array.isArray(L)) return NaN; let C = L.__c; if (!C) { C = new Float64Array(L.length); for (let j = 1; j < L.length; j++) C[j] = C[j - 1] + (L[j - 1] + L[j]) / 2; Object.defineProperty(L, '__c', {value:C}); }
  const n = L.length; if (!(u > 0)) return 0; if (u >= n - 1) return C[n - 1] + L[n - 1] * (u - n + 1); const j = u | 0, q = u - j; return C[j] + L[j] * q + (L[j + 1] - L[j]) * q * q / 2; };
const ih_ = i => { let h = Math.imul(i | 0, 0x27d4eb2d) ^ 0x165667b1; h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
H.rumore = (r, t, s = 0) => { const v = r * t + s, i = Math.floor(v), q = v - i; return (2 * ih_(i) - 1) * (1 - q) + (2 * ih_(i + 1) - 1) * q; };
const KW = new Set(['mod','if','se','else','otherwise','altrimenti','and','or','not']);
const GREEK = {alpha:'α',beta:'β',gamma:'γ',delta:'δ',epsilon:'ε',varepsilon:'ε',zeta:'ζ',eta:'η',theta:'θ',vartheta:'θ',iota:'ι',kappa:'κ',lambda:'λ',mu:'μ',nu:'ν',xi:'ξ',rho:'ρ',sigma:'σ',upsilon:'υ',phi:'φ',varphi:'φ',chi:'χ',psi:'ψ',omega:'ω',pi:'π',tau:'τ',Gamma:'Γ',Delta:'Δ',Theta:'Θ',Lambda:'Λ',Xi:'Ξ',Phi:'Φ',Psi:'Ψ',Omega:'Ω'};
const ERR = m => { const e = new Error(m); e.cartesio = true; return e; };

// --- 1. normalizzazione LaTeX / unicode ---
function grp(s, i) { if (s[i] !== '{') { const m = /^\s*(\\[A-Za-z]+|.)/.exec(s.slice(i)); return m ? [m[1], i + m[0].length] : ['', i]; } let d = 1, j = i + 1; while (j < s.length && d) { if (s[j] === '{') d++; else if (s[j] === '}') d--; j++; } return [s.slice(i + 1, j - 1), j]; }
function normalize(s) {
  s = String(s).replace(/\r/g, '');
  // ambiente cases
  s = s.replace(/\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g, (_, b) => '{' + b.split(/\\\\/).filter(r => r.trim()).map(r => { const [v, c = ''] = r.split('&'); const cc = c.replace(/\\text\{\s*(if|se)\s*\}|\bif\b|\bse\b/g, '').replace(/\\text\{([^}]*)\}/g, '$1').trim(); return /^(otherwise|altrimenti|else|)$/.test(cc.replace(/[,.]/g, '').trim()) ? v : cc + ':' + v; }).join(',') + '}');
  for (let k = 0; k < 20 && /\\[dt]?frac|\\sqrt/.test(s); k++) {
    s = s.replace(/\\[dt]?frac\s*/, m => '\u0001');
    let i = s.indexOf('\u0001');
    if (i >= 0) { const [a, j] = grp(s, i + 1), [b, k2] = grp(s, j); s = s.slice(0, i) + '((' + a + ')/(' + b + '))' + s.slice(k2); continue; }
    i = s.search(/\\sqrt/); if (i < 0) break; let j = i + 5, n = null;
    if (s[j] === '[') { const e = s.indexOf(']', j); n = s.slice(j + 1, e); j = e + 1; }
    const [a, k3] = grp(s, j); s = s.slice(0, i) + (n ? 'root(' + n + ',' + a + ')' : '√(' + a + ')') + s.slice(k3);
  }
  s = s.replace(/\\left|\\right|\\big|\\Big|\\bigg|\\displaystyle/g, '').replace(/\\[{]/g, '{').replace(/\\[}]/g, '}')
    .replace(/\\operatorname\{([^}]*)\}|\\mathrm\{([^}]*)\}|\\mathit\{([^}]*)\}/g, (_, a, b, c) => a || b || c)
    .replace(/\\text\{([^}]*)\}/g, ' $1 ').replace(/\\[,;:! ]/g, ' ').replace(/\\(?:cdot|times|ast)/g, '*').replace(/\\div/g, '/')
    .replace(/\\(?:leq?|leqslant)\b/g, '≤').replace(/\\(?:geq?|geqslant)\b/g, '≥').replace(/\\(?:neq?)\b/g, '≠').replace(/\\lt\b/g, '<').replace(/\\gt\b/g, '>')
    .replace(/\\lfloor/g, '⌊').replace(/\\rfloor/g, '⌋').replace(/\\lceil/g, '⌈').replace(/\\rceil/g, '⌉')
    .replace(/\\sum/g, 'Σ').replace(/\\prod/g, 'Π').replace(/\\infty/g, '∞').replace(/\\(?:land|wedge)\b/g, ' and ').replace(/\\(?:lor|vee)\b/g, ' or ').replace(/\\(?:lnot|neg)\b/g, ' not ')
    .replace(/\\(?:mid|vert)\b/g, '|').replace(/\\bmod\b/g, ' mod ').replace(/\\pmod\s*\{([^}]*)\}/g, ' mod ($1)').replace(/\\([A-Za-z]+)/g, (_, w) => GREEK[w] || w);
  s = s.replace(/([A-Za-zα-ω0-9])_\{([\w.]+)\}/g, '$1_$2');
  const SUP = {'⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9','⁻':'-','⁺':'+','ⁿ':'n','ˣ':'x'};
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺ⁿˣ]+/g, m => '^(' + [...m].map(c => SUP[c]).join('') + ')');
  const FR = {'½':'(1/2)','⅓':'(1/3)','⅔':'(2/3)','¼':'(1/4)','¾':'(3/4)','⅕':'(1/5)','⅙':'(1/6)','⅛':'(1/8)'};
  s = s.replace(/[½⅓⅔¼¾⅕⅙⅛]/g, c => FR[c]).replace(/[−–]/g, '-').replace(/[·×⋅∙]/g, '*').replace(/÷/g, '/').replace(/∑/g, 'Σ').replace(/∏/g, 'Π')
    .replace(/∧/g, ' and ').replace(/∨/g, ' or ').replace(/¬/g, ' not ').replace(/\*\*/g, '^');
  return s;
}

// --- 2. token ---
function tokenize(s) {
  const T = []; let i = 0, sp = true;
  const idc = c => /[A-Za-z\u00C0-\u024Fα-ωΑ-Ω]/.test(c) && c !== 'Σ' && c !== 'Π';
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { sp = true; i++; continue; }
    let m;
    if ((m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i)))) { T.push({t:'num', v:m[1], sp}); i += m[1].length; }
    else if (idc(c)) { let j = i + 1; while (j < s.length && (idc(s[j]) || /[\d_]/.test(s[j]))) j++; const v = s.slice(i, j); T.push({t:KW.has(v) ? 'kw' : 'id', v, sp}); i = j; }
    else if ((m = /^(<=|>=|==|!=|&&|\|\||\.\.\.|=>)/.exec(s.slice(i)))) { T.push({t:'op', v:{'<=':'≤','>=':'≥','!=':'≠','==':'=','&&':'and','||':'or'}[m[1]] || m[1], sp}); i += m[1].length; }
    else if ('+-*/^%!()[]{},:;<>=|?⌊⌋⌈⌉√ΣΠ∞≤≥≠¶_'.includes(c)) { T.push({t:'op', v:c, sp}); i++; }
    else throw ERR('simbolo non riconosciuto «' + c + '»');
    sp = false;
  }
  T.push({t:'end', v:'', sp:true}); return T;
}

// --- 3. parser -> JS ---
class Parser {
  constructor(toks, env) { this.T = toks; this.i = 0; this.env = env; this.loc = []; this.abs = 0; }
  get p() { return this.T[this.i]; } next() { return this.T[this.i++]; }
  is(v, t) { const p = this.p; return p.v === v && (!t || p.t === t) && (p.t === 'op' || p.t === 'kw'); }
  acc(v) { if (this.is(v)) { this.i++; return true; } return false; }
  kw(...w) { if (this.p.t === 'kw' && w.includes(this.p.v)) { this.i++; return true; } return false; }
  exp(v) { if (!this.acc(v)) throw ERR('manca «' + v + '»' + this.near()); }
  near() { const p = this.p; return p.t === 'end' ? ' alla fine' : ' vicino a «' + p.v + '»'; }
  isLocal(n) { return this.loc.some(s => s.includes(n)); }
  isVar(n) { return this.isLocal(n) || this.env.params.includes(n) || this.env.consts.has(n) || (n in H && typeof H[n] !== 'function' && !this.env.funcs.has(n)); }
  isFn(n) { return !this.isLocal(n) && !this.env.params.includes(n) && !this.env.consts.has(n) && (this.env.funcs.has(n) || typeof H[n] === 'function' || /^log_[\w.]+$/.test(n)); }
  bin(a, o, b) { return this.env.vec ? 'H.B("' + o + '",' + a + ',' + b + ')' : o === 'mod' ? 'H.mod(' + a + ',' + b + ')' : '(' + a + o + b + ')'; }
  known(n) { return this.isVar(n) || this.isFn(n) || /^log_[\w.]+$/.test(n); }
  ref(n) { return this.isLocal(n) || this.env.params.includes(n) || this.env.consts.has(n) ? 'u_' + n : 'H.' + n; }
  call(n, args) { if (/^log_/.test(n)) return 'H.logb(' + n.slice(4) + ',' + args.join(',') + ')'; if (this.env.funcs.has(n) && !this.isLocal(n)) return 'u_' + n + '(' + args.join(',') + ')'; return this.env.vec && !NOVEC.has(n) ? 'H.F(H.' + n + (args.length ? ',' : '') + args.join(',') + ')' : 'H.' + n + '(' + args.join(',') + ')'; }
  split(name) {
    const memo = new Map(), go = i => {
      if (i === name.length) return []; if (memo.has(i)) return memo.get(i); let r = null;
      const d = /^\d+/.exec(name.slice(i)); if (d) { const t = go(i + d[0].length); if (t) r = [{num:d[0]}, ...t]; }
      for (let j = name.length; j > i && !r; j--) { const w = name.slice(i, j); if (!KW.has(w) && this.known(w)) { const t = go(j); if (t) r = [w, ...t]; } }
      memo.set(i, r); return r;
    };
    return this.known(name) ? [name] : go(0);
  }
  startsOp() { const p = this.p; if (p.t === 'num' || p.t === 'id') return true; if (p.t === 'kw') return false; return p.t === 'op' && ('([{√⌊⌈∞ΣΠ'.includes(p.v) || (p.v === '|' && this.abs === 0)); }
  program(top) { const v = this.row(top); if (this.p.t !== 'end') throw ERR('non capisco' + this.near()); return v; }
  row(top) {
    const a = this.ternary();
    if (this.kw('if', 'se')) {
      const c = this.ternary(); let e = 'NaN';
      if (this.kw('else', 'otherwise', 'altrimenti') || this.acc('¶') || (top && this.acc(','))) e = this.row(top);
      return '((' + c + ')?(' + a + '):(' + e + '))';
    }
    this.kw('otherwise', 'altrimenti', 'else'); return a;
  }
  ternary() { const a = this.or(); if (this.acc('?')) { const b = this.row(); this.exp(':'); const c = this.row(); return '((' + a + ')?(' + b + '):(' + c + '))'; } return a; }
  or() { let a = this.and(); while (this.kw('or') || this.acc('or')) a = '(' + a + '||' + this.and() + ')'; return a; }
  and() { let a = this.not(); while (this.kw('and') || this.acc('and')) a = '(' + a + '&&' + this.not() + ')'; return a; }
  not() { if (this.kw('not') || (this.is('!') && this.i++ >= 0)) return '(!' + this.not() + ')'; return this.cmp(); }
  cmp() {
    const xs = [this.add()], ops = []; const M = {'<':'<','>':'>','≤':'<=','≥':'>=','=':'===','≠':'!=='};
    while (this.p.t === 'op' && M[this.p.v]) { ops.push(M[this.next().v]); xs.push(this.add()); }
    if (!ops.length) return xs[0];
    return '(' + ops.map((o, k) => '(' + xs[k] + o + xs[k + 1] + ')').join('&&') + ')';
  }
  add() { let a = this.term(); for (;;) { if (this.acc('+')) a = this.bin(a, '+', this.term()); else if (this.acc('-')) a = this.bin(a, '-', this.term()); else return a; } }
  term() {
    let a = this.unary();
    for (;;) {
      if (this.acc('*')) a = this.bin(a, '*', this.unary());
      else if (this.acc('/')) a = this.bin(a, '/', this.unary());
      else if (this.acc('%') || this.kw('mod')) a = this.bin(a, 'mod', this.unary());
      else if (this.startsOp()) a = this.bin(a, '*', this.power());
      else return a;
    }
  }
  unary() { if (this.acc('-')) return this.bin('0', '-', this.unary()); if (this.acc('+')) return this.unary(); return this.power(); }
  power() { const b = this.postfix(); if (this.acc('^')) return this.bin(b, '**', this.expo()); return b; }
  expo() {
    let e;
    if (this.acc('{')) { e = '(' + this.row() + ')'; this.exp('}'); }
    else if (this.acc('-')) e = '(-' + this.expo() + ')';
    else { e = this.postfix(); while (!this.p.sp && this.startsOp() && !this.is('{')) e = '(' + e + '*' + this.postfix() + ')'; }
    if (this.acc('^')) e = '(' + e + '**' + this.expo() + ')';
    return e;
  }
  postfix() {
    let v = this.primary();
    for (;;) {
      if (this.is('!') && !this.p.sp) { this.i++; v = 'H.fact(' + v + ')'; }
      else if (this.is('[') && !this.p.sp) { this.i++; const k = this.row(); this.exp(']'); v = 'H.at(' + v + ',' + k + ')'; }
      else return v;
    }
  }
  args() { this.exp('('); const a = []; if (!this.acc(')')) { do a.push(this.row()); while (this.acc(',')); this.exp(')'); } return a; }
  fnArg() { let a = this.power(); while (!this.p.sp && this.startsOp() && !(this.p.t === 'id' && this.split(this.p.v) && this.isFn(this.split(this.p.v)[0]))) a = '(' + a + '*' + this.power() + ')'; return a; }
  bigop(op) {
    let v, from;
    if (this.acc('_')) { const br = this.acc('{'); if (this.p.t !== 'id') throw ERR('Σ: serve una variabile, es. Σ_{k=1}^{10}'); v = this.next().v; this.exp('='); from = this.add(); if (br) this.exp('}'); }
    else throw ERR('Σ: scrivi Σ_{k=1}^{n} …  oppure sum(k, 1, n, …)');
    this.exp('^'); const to = this.expo(); this.loc.push([v]); const body = this.term(); this.loc.pop();
    return 'H.' + op + '(' + from + ',' + to + ',(u_' + v + ')=>(' + body + '))';
  }
  primary() {
    const p = this.p;
    if (p.t === 'num') { this.i++; return p.v[0] === '.' ? '0' + p.v : p.v; }
    if (p.t === 'kw' && p.v === 'mod' && this.T[this.i + 1].v === '(') { this.i++; return 'H.mod(' + this.args().join(',') + ')'; }
    if (p.t === 'id') return this.ident();
    if (p.t !== 'op') throw ERR('atteso un valore' + this.near());
    this.i++;
    switch (p.v) {
      case '(': { const v = this.row(); if (this.acc(',')) { const xs = [v]; do xs.push(this.row()); while (this.acc(',')); this.exp(')'); return '[' + xs.join(',') + ']'; } this.exp(')'); return '(' + v + ')'; }
      case '[': { this.env.sawList = true; const xs = []; if (!this.acc(']')) { do xs.push(this.row()); while (this.acc(',')); if (this.acc('...')) { const b = this.row(); this.exp(']'); return 'H.__range(' + xs[0] + ',' + (xs[1] ?? 'null') + ',' + b + ')'; } this.exp(']'); } return '[' + xs.join(',') + ']'; }
      case '{': {
        const pairs = []; let def = null;
        if (!this.acc('}')) { do { const a = this.row(); if (this.acc(':')) pairs.push([a, this.row()]); else def = a; } while (this.acc(',') || this.acc('¶')); this.exp('}'); }
        if (!pairs.length) return def === null ? 'NaN' : '((' + def + ')?1:NaN)';
        return '(' + pairs.map(([c, v]) => '(' + c + ')?(' + v + '):').join('') + (def ?? 'NaN') + ')';
      }
      case '|': { this.abs++; const v = this.row(); this.exp('|'); this.abs--; return 'Math.abs(' + v + ')'; }
      case '⌊': { const v = this.row(); this.exp('⌋'); return 'Math.floor(' + v + ')'; }
      case '⌈': { const v = this.row(); this.exp('⌉'); return 'Math.ceil(' + v + ')'; }
      case '√': return 'Math.sqrt(' + this.power() + ')';
      case '∞': return 'Infinity';
      case 'Σ': return this.bigop('sum');
      case 'Π': return this.bigop('prod');
    }
    throw ERR('non mi aspettavo «' + p.v + '»');
  }
  ident() {
    const name = this.next().v;
    if ((name === 'sum' || name === 'prod') && this.is('(') && !this.isLocal(name) && !this.env.funcs.has(name)) {
      this.i++; if (this.p.t !== 'id') throw ERR(name + '(k, da, a, espressione): manca la variabile'); const v = this.next().v; let from;
      if (this.acc('=')) from = this.row(); else { this.exp(','); from = this.row(); }
      this.exp(','); const to = this.row(); this.exp(','); this.loc.push([v]); const body = this.row(); this.loc.pop(); this.exp(')');
      return 'H.' + name + '(' + from + ',' + to + ',(u_' + v + ')=>(' + body + '))';
    }
    const ps = this.split(name);
    if (!ps) {
      if (name === 't' && !this.env.params.includes('t')) throw ERR('qui il tempo non si scrive: lo decide solo bpm(b)');
      throw ERR('non conosco «' + name + '»');
    }
    const out = []; let k = 0;
    while (k < ps.length) {
      const w = ps[k];
      if (w.num) { out.push(w.num); k++; continue; }
      if (!this.isFn(w)) { out.push(this.ref(w)); k++; continue; }
      if (k < ps.length - 1) { const a = []; k++; while (k < ps.length && (ps[k].num || !this.isFn(ps[k]))) { a.push(ps[k].num || this.ref(ps[k])); k++; } out.push(this.call(w, [a.join('*') || 'NaN'])); continue; }
      k++;
      if (this.acc('^')) { const e = this.expo(); const a = this.is('(') ? this.args() : [this.fnArg()]; out.push('(' + this.call(w, a) + '**' + e + ')'); }
      else if (this.is('(')) out.push(this.call(w, this.args()));
      else if (this.startsOp() || this.is('-')) out.push(this.call(w, [this.is('-') ? this.unary() : this.fnArg()]));
      else throw ERR('la funzione «' + w + '» ha bisogno di un argomento');
    }
    return out.length > 1 ? '(' + out.join('*') + ')' : out[0];
  }
}
const OPS = {'+':(a,b)=>a+b,'-':(a,b)=>a-b,'*':(a,b)=>a*b,'/':(a,b)=>a/b,'**':(a,b)=>a**b,mod:(a,b)=>((a%b)+b)%b};
H.B = (o, a, b) => { const f = OPS[o], A = Array.isArray(a), B = Array.isArray(b); if (!A && !B) return f(a, b); const n = Math.max(A ? a.length : 1, B ? b.length : 1), r = []; for (let i = 0; i < n; i++) r.push(H.B(o, A ? a[i] : a, B ? b[i] : b)); return r; };
H.F = (fn, ...a) => { const i = a.findIndex(Array.isArray); if (i < 0) return fn(...a); return a[i].map(v => { const c = a.slice(); c[i] = v; return H.F(fn, ...c); }); };
H.__range = (a, b, c) => { const st = b === null ? 1 : b - a, r = []; for (let v = a, n = 0; st > 0 ? v <= c + 1e-9 : v >= c - 1e-9; v += st, n++) { if (n > 1000 || !st) break; r.push(v); } return r; };

// --- 4. programma: definizioni, righe a tratti, funzione principale ---
const HEAD = /^\s*([A-Za-z_α-ωΑ-Ω][\wα-ωΑ-Ω]*)\s*(?:\(([^()]*)\))?\s*=(?![=<>])([\s\S]*)$/;
const IFW = /(^|[^\wα-ω])(if|se|otherwise|altrimenti|else)(?![\wα-ω])/;
const depth = s => { let d = 0; for (const c of s) { if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) d--; } return d; };
function logicalLines(src) {
  const out = [];
  for (let ln of normalize(src).split(/\n|;/)) {
    ln = ln.replace(/\/\/.*$|#.*$/, '').trim(); if (!ln) continue;
    const prev = out[out.length - 1];
    const cont = prev !== undefined && (depth(prev) > 0 || /[+\-*/^(,{[:=<>≤≥¶]\s*$/.test(prev) || /^[+*/^=<>≤≥:]/.test(ln) || (IFW.test(ln) && !HEAD.test(ln)) || /^(otherwise|altrimenti|else)\b/.test(ln));
    if (cont) out[out.length - 1] = prev + (IFW.test(ln) && IFW.test(prev) && depth(prev) === 0 ? ' ¶ ' : ' ') + ln; else out.push(ln);
  }
  return out;
}
const progCache = new Map();
const DATA_RE = /^\s*\[[\s\d.,+\-eE\[\]]*\]\s*$/;
function compileProg(src, params) {
  const key = params + '\u0001' + src; if (progCache.has(key)) return progCache.get(key);
  const P = params.split(','), defs = [], data = []; let main = null;
  const env0 = () => ({params:P, funcs:new Set(), consts:new Set(), datas:new Set(), vec:false, sawList:false});
  let env = env0();
  for (const ln of logicalLines(src)) {
    const m = HEAD.exec(ln);
    if (m && !KW.has(m[1])) {
      const args = m[2] !== undefined ? m[2].split(',').map(a => a.trim()).filter(Boolean) : null;
      if (m[1] === 'y' || m[1] === 'f' || P.includes(m[1])) { main = m[3]; continue; }
      if (!args && DATA_RE.test(m[3])) { try { data.push([m[1], JSON.parse(m[3])]); continue; } catch {} }   // tabella di numeri: letta una volta sola
      defs.push({name:m[1], args, body:m[3]});
    } else main = ln;
  }
  if (main === null) throw ERR('manca la riga  y = …');
  const build = vec => {
    env = env0(); env.vec = vec; for (const [n] of data) env.consts.add(n), env.datas.add(n);
    for (const d of defs) (d.args ? env.funcs : env.consts).add(d.name);
    const parse = (s, loc) => { const p = new Parser(tokenize(s), env); if (loc) p.loc.push(loc); return p.program(true); };
    let fns = '', cs = '';
    for (const d of defs) {
      try {
        if (d.args) fns += 'function u_' + d.name + '(' + d.args.map(a => 'u_' + a).join(',') + '){return (' + parse(d.body, d.args) + ');}\n';
        else cs += 'u_' + d.name + '=(' + parse(d.body) + ');';
      } catch (e) { throw ERR(d.name + ': ' + e.message); }
    }
    const body = parse(main), vars = [...env.consts].filter(c => !env.datas.has(c));
    return '"use strict";\nconst ' + (data.length ? data.map(([n], i) => 'u_' + n + '=D[' + i + ']').join(',') + ',' : '') + '_=0;\nlet ' + P.map(p => 'u_' + p + '=0').join(',') + (vars.length ? ',' + vars.map(c => 'u_' + c).join(',') : '') + ';\n' + fns +
      'return function(' + P.map((_, i) => 'p' + i).join(',') + '){' + P.map((p, i) => 'u_' + p + '=p' + i + ';').join('') + cs + 'return (' + body + ');};';
  };
  let code = build(false); if (env.sawList || /\.\.\./.test(normalize(main))) code = build(true);
  // le funzioni predefinite diventano costanti locali: accesso molto più veloce che H.nome
  const used = new Set(); code = code.replace(/\bH\.([A-Za-z_α-ωπτφ][\wα-ω]*)/g, (_, n) => { used.add(n); return 'h_' + n; });
  code = code.replace('"use strict";\n', '"use strict";\n' + (used.size ? 'const ' + [...used].map(n => 'h_' + n + '=H[' + JSON.stringify(n) + ']').join(',') + ';\n' : ''));
  let fn; try { fn = new Function('H', 'D', code)(H, data.map(d => d[1])); } catch (e) { throw ERR('sintassi non valida'); }
  const v = P.length > 1 ? fn(1.2, .1) : fn(.37);
  if (typeof v !== 'number' && typeof v !== 'boolean' && !Array.isArray(v)) throw ERR('il risultato non è un numero');
  fn.livello = data.length || defs.some(d => d.name === 'livello');
  if (progCache.size > 400) progCache.clear();
  progCache.set(key, fn); return fn;
}
function getC(o) {
  if (o._ck === o.sound) return o._c;
  let w, err = '';
  try { w = compileProg(o.sound || '0', 'x,t'); } catch (e) { err = e.message; w = () => 0; }
  if (w.livello) { o._c = {w, mean:0, g:1, err}; o._ck = o.sound; return o._c; }   // ampiezza reale: niente normalizzazione
  const a = []; let mean = 0, pk = 0;
  for (const t of [0, .0013, .0037, .0071, .0113, .019, .031, .053, .087, .149, .251]) for (let i = 0; i < 96; i++) { let v; try { v = +w(i / 96 * TAU, t); } catch { v = 0; } if (!isFinite(v)) v = 0; a.push(v); mean += v; }
  mean /= a.length; for (const v of a) pk = Math.max(pk, Math.abs(v - mean));
  o._c = {w, mean, g: pk > 1e-9 ? 1 / pk : 0, err}; o._ck = o.sound; return o._c;
}
const audible = p => { const s = p.channels.some(c => c.solo); return p.channels.filter(c => s ? c.solo : !c.mute); };
// ===== Effetti del mixer (condivisi) =====
const FXDEF = {
  dist:   {name:'Distorsione / Saturazione', short:'DIST', p:[['curva','curva f(s)','tanh(3s)'],['mix','mix 0–1','1'],['out','uscita','1']]},
  rev:    {name:'Riverbero', short:'REV', p:[['size','dimensione 0–1','0.7'],['damp','smorzamento 0–1','0.4'],['mix','mix 0–1','0.25']]},
  delay:  {name:'Delay', short:'DLY', p:[['time','tempo in beat','0.75'],['fb','feedback 0–1','0.4'],['mix','mix 0–1','0.3'],['pp','ping-pong 0–1','1']]},
  eq:     {name:'EQ', short:'EQ', p:[['lf','basse Hz','120'],['lg','basse dB','0'],['mf','medie Hz','1000'],['mg','medie dB','0'],['mq','medie Q','0.9'],['hf','alte Hz','6000'],['hg','alte dB','0']]},
  comp:   {name:'Compressore', short:'COMP', p:[['thr','soglia dB','-18'],['ratio','rapporto','4'],['att','attacco ms','5'],['rel','rilascio ms','120'],['gain','guadagno dB','0']]},
  chorus: {name:'Chorus', short:'CHO', p:[['rate','velocità Hz','0.8'],['depth','profondità ms','4'],['mix','mix 0–1','0.5']]},
  phaser: {name:'Phaser', short:'PHS', p:[['rate','velocità Hz','0.3'],['depth','profondità 0–1','0.8'],['fb','feedback','0.5'],['mix','mix 0–1','0.6']]}
};
