// Ponte verso i host nativi: cartesio-host.exe (plugin a 64 bit) e cartesio-host32.exe (plugin a 32 bit, avviato solo se serve).
// Pagina ↔ porte Electron ↔ TCP locale. Porta libera scelta dal sistema, riavvio automatico, quarantena dei plugin che fanno cadere il host, log su file.
const net = require('net'), {spawn} = require('child_process'), fs = require('fs'), path = require('path'), os = require('os');
const CODES = {0xC0000135:'manca una DLL di sistema', 0xC000007B:'DLL con architettura sbagliata (32/64 bit)', 0xC0000005:'crash per accesso alla memoria (di solito un plugin)',
  0xC0000409:'crash (stack danneggiato, di solito un plugin)', 0xC00000FD:'crash (stack overflow)', 0xC0000374:'crash (heap danneggiato, di solito un plugin)', 0xC000013A:'interrotto'};
const describe = (code, sig) => { if (code == null) return 'terminato' + (sig ? ' (' + sig + ')' : ''); const u = code >>> 0;
  return 'codice ' + (u > 0xFFFF ? '0x' + u.toString(16).toUpperCase() : u) + (CODES[u] ? ': ' + CODES[u] : u === 1 ? ': porta occupata o avvio fallito' : ''); };
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const u32 = (...v) => { const b = Buffer.alloc(4 * v.length); v.forEach((x, i) => b.writeUInt32LE(x >>> 0, 4 * i)); return b; };
function archOf(p) { try { if (fs.statSync(p).isDirectory()) return fs.existsSync(path.join(p, 'Contents', 'x86_64-win')) || !fs.existsSync(path.join(p, 'Contents', 'x86-win')) ? 'x64' : 'x86';
  const fd = fs.openSync(p, 'r'), b = Buffer.alloc(4096); fs.readSync(fd, b, 0, 4096, 0); fs.closeSync(fd); const o = b.readUInt32LE(0x3c); return o < 4090 && b.readUInt16LE(o + 4) === 0x14c ? 'x86' : 'x64'; } catch { return 'x64'; } }

module.exports = function startHost({ports, MessageChannelMain, sendPorts, dirs, logDir, hwnd}) {
  let C, A; if (ports) [C, A] = ports; else { const ctl = new MessageChannelMain(), aud = new MessageChannelMain(); C = ctl.port1; A = aud.port1; sendPorts([ctl.port2, aud.port2]); }
  C.start(); A.start();
  const logFile = path.join(logDir || os.tmpdir(), 'cartesio-host.log'); try { fs.writeFileSync(logFile, ''); } catch {}
  const log = s => fs.appendFile(logFile, new Date().toISOString() + ' ' + String(s).trimEnd() + '\n', () => {});
  const find = n => dirs.map(d => path.join(d, n)).find(p => fs.existsSync(p));
  const bad = new Map(); let prep = null, stopped = false;   // bad: percorso → motivo
  const loadedMsg = (id, ok, name) => C.postMessage({t:'loaded', id, ok, name});

  function Host(tag, exe, main) {
    const H = {tag, ready: () => !!sock}; let child = null, sock = null, gen = 0, seq = 0, buf = Buffer.alloc(0), crashes = 0, started = 0;
    const loads = new Map(), audio = [], states = new Map();
    const status = (ok, why) => { if (why) log('[' + tag + '] ' + why); if (main) C.postMessage({t:'status', ok, why}); };
    const send = (t, q, p) => { if (!sock) return false; sock.write(Buffer.concat([u32(t, q, p.length), p])); return true; };
    function onData(d) { buf = Buffer.concat([buf, d]);
      while (buf.length >= 12) { const t = buf.readUInt32LE(0), q = buf.readUInt32LE(4), n = buf.readUInt32LE(8); if (buf.length < 12 + n) break;
        const p = Buffer.from(buf.subarray(12, 12 + n)); buf = buf.subarray(12 + n);
        if (t === 101) { const L = loads.get(q); loads.delete(q); if (!L) continue; const ok = p.readInt32LE(0) === 1, name = p.subarray(4).toString('utf8');
          log('[' + tag + '] ' + (ok ? 'caricato: ' : 'rifiutato: ') + L.path + ' → ' + name); loadedMsg(L.id, ok, name); }
        else if (t === 110) C.postMessage({t:'edsize', id:p.readUInt32LE(0), w:p.readUInt32LE(4), h:p.readUInt32LE(8)});
        else if (t === 109) C.postMessage({t:'edclosed', id:p.readUInt32LE(0)});
        else if (t === 107) { const S = states.get(q); states.delete(q); if (S) C.postMessage({t:'state', id:S.id, req:S.req, ok:p.readInt32LE(0) === 1, data:p.subarray(4).toString('base64')}); }
        else if (t === 106) { const cb = audio.shift(); if (!cb) continue; const cnt = cb.cnt, m = cb.n, ab = new ArrayBuffer(n); new Uint8Array(ab).set(p);
          const lat = new Uint32Array(ab, 0, cnt), outs = []; for (let i = 0; i < cnt; i++) outs.push({lat:lat[i], L:new Float32Array(ab, 4 * cnt + 8 * m * i, m), R:new Float32Array(ab, 4 * cnt + 8 * m * i + 4 * m, m)});
          cb(outs); }
        else if (t === 104) { const cb = audio.shift(), m = n / 8, ab = new ArrayBuffer(n); new Uint8Array(ab).set(p);   // un buffer proprio: niente conversioni campione per campione
          cb && cb(new Float32Array(ab, 0, m), new Float32Array(ab, 4 * m, m)); } } }
    function onDeath(info) { for (const S of states.values()) C.postMessage({t:'state', id:S.id, req:S.req, ok:false, data:''}); states.clear(); sock = null; buf = Buffer.alloc(0); const cbs = audio.splice(0); cbs.forEach(cb => cb(null));
      for (const L of loads.values()) { bad.set(L.path, 'ha fatto chiudere il ponte (' + info + ')'); log('quarantena: ' + L.path); loadedMsg(L.id, false, bad.get(L.path)); } loads.clear(); }
    async function launch() {
      if (stopped) return; const my = ++gen; started = Date.now(); let linked = false;
      if (!exe) { status(false, 'manca ' + (main ? 'cartesio-host.exe' : 'cartesio-host32.exe') + ' accanto a Cartesio.exe'); return; }
      let port; try { port = await freePort(); } catch { port = 47000 + Math.floor(Math.random() * 2000); }
      log('[' + tag + '] avvio ' + exe + ' porta ' + port);
      try { child = spawn(exe, [String(port)], {cwd:path.dirname(exe), stdio:['ignore', 'pipe', 'pipe']}); }
      catch (e) { status(false, 'non riesco ad avviare il ponte: ' + e.message); return; }
      child.stdout.on('data', d => log('[' + tag + '] ' + d)); child.stderr.on('data', d => log('[' + tag + '] ' + d));
      child.on('error', e => { if (my === gen) status(false, 'avvio del ponte fallito: ' + e.message + ' (antivirus? controlla la quarantena)'); });
      child.on('exit', (code, sig) => { if (my !== gen) return; const info = describe(code, sig); log('[' + tag + '] uscito: ' + info); onDeath(info); if (stopped) return;
        crashes = Date.now() - started > 30000 ? 1 : crashes + 1;
        if (crashes > 4) { status(false, 'il ponte continua a chiudersi (' + info + '). Dettagli: ' + logFile); return; }
        status(false, (linked ? 'il ponte si è chiuso (' + info + '), lo riavvio…' : 'il ponte non è partito (' + info + '), riprovo…'));
        setTimeout(launch, 400 * crashes); });
      (function connect(tries) { if (my !== gen || stopped) return;
        const s = net.connect(port, '127.0.0.1'); s.setNoDelay(true);
        s.on('connect', () => { if (my !== gen) return s.destroy(); sock = s; linked = true; if (hwnd) { const hb = Buffer.alloc(12); hb.writeBigUInt64LE(BigInt(hwnd), 4); send(10, 0, hb); } if (prep) send(5, 0, prep); status(true, '');
          if (!main) for (const [id, p] of H.want) H.load(id, p); });
        s.on('error', e => { if (sock === s || my !== gen) return; if (tries > 0) setTimeout(() => connect(tries - 1), 300);
          else { status(false, 'il ponte non risponde sulla porta ' + port + ': ' + e.code); try { child.kill(); } catch {} } });
        s.on('close', () => { if (sock === s) { sock = null; try { child.kill(); } catch {} } });
        s.on('data', d => { try { onData(d); } catch (err) { log('[' + tag + '] errore dati: ' + err.stack); } }); })(30);
    }
    H.want = new Map();   // per il host a 32 bit: plugin da ricaricare dopo un riavvio
    H.load = (id, p) => { if (!main) H.want.set(id, p); if (!sock) return; const q = ++seq; loads.set(q, {id, path:p}); log('[' + tag + '] carico: ' + p); send(1, q, Buffer.concat([u32(id), Buffer.from(p, 'utf8')])); };
    H.unload = id => { H.want.delete(id); send(2, 0, u32(id)); };
    H.editor = id => send(3, 0, u32(id));
    H.place = (id, x, y, vis) => { const b = Buffer.alloc(16); b.writeUInt32LE(id, 0); b.writeInt32LE(x | 0, 4); b.writeInt32LE(y | 0, 8); b.writeInt32LE(vis ? 1 : 0, 12); send(11, 0, b); };
    H.edclose = id => send(12, 0, u32(id));
    H.edresize = (id, w, h) => send(13, 0, u32(id, w, h));
    H.getState = (id, req) => { const q = ++seq; if (send(7, q, u32(id))) states.set(q, {id, req}); else C.postMessage({t:'state', id, req, ok:false, data:''}); };
    H.setState = (id, b64) => send(8, 0, Buffer.concat([u32(id), Buffer.from(b64 || '', 'base64')]));
    H.prepare = () => prep && send(5, 0, prep);
    H.proc = (ids, L, R, cb) => { const n = L.length, p = Buffer.concat([u32(n, ids.length, ...ids), Buffer.from(L.buffer, L.byteOffset, 4 * n), Buffer.from(R.buffer, R.byteOffset, 4 * n)]);
      if (!send(4, ++seq, p)) return false; audio.push(cb); return true; };
    // lotto: più catene in una sola richiesta (tipo 6)
    H.procMany = (list, cb) => { if (!sock || !list.length) return false; const n = list[0].L.length, parts = [u32(n, list.length)];
      for (const it of list) parts.push(u32(it.ids.length, ...it.ids));
      for (const it of list) parts.push(Buffer.from(it.L.buffer, it.L.byteOffset, 4 * n), Buffer.from(it.R.buffer, it.R.byteOffset, 4 * n));
      if (!send(6, ++seq, Buffer.concat(parts))) return false; const f = outs => cb(outs); f.cnt = list.length; f.n = n; audio.push(f); return true; };
    H.started = false; H.start = () => { if (!H.started) { H.started = true; launch(); } };
    H.stop = () => { gen++; try { sock && sock.destroy(); } catch {} try { child && child.kill(); } catch {} };
    return H;
  }
  const x64 = Host('64', find('cartesio-host.exe') || find('cartesio-host'), true), x86 = Host('32', find('cartesio-host32.exe'), false), where = new Map();
  x64.start();
  C.on('message', e => { const m = e && e.data; if (!m || typeof m !== 'object') return; try {
    if (m.t === 'load') { if (bad.has(m.path)) return loadedMsg(m.id, false, bad.get(m.path) + ' — riavvia Cartesio per riprovarlo');
      const h = archOf(m.path) === 'x86' ? x86 : x64; where.set(m.id, h); if (h === x86) { h.start(); if (!x86.ready()) x86.want.set(m.id, m.path); } h.load(m.id, m.path); }
    else if (m.t === 'unload') { const h = where.get(m.id) || x64; where.delete(m.id); h.unload(m.id); }
    else if (m.t === 'editor') (where.get(m.id) || x64).editor(m.id);
    else if (m.t === 'place') (where.get(m.id) || x64).place(m.id, m.x, m.y, m.vis);
    else if (m.t === 'edresize') (where.get(m.id) || x64).edresize(m.id, m.w, m.h);
    else if (m.t === 'edclose') (where.get(m.id) || x64).edclose(m.id);
    else if (m.t === 'getState') (where.get(m.id) || x64).getState(m.id, m.req);
    else if (m.t === 'setState' && m.data) (where.get(m.id) || x64).setState(m.id, m.data);
    else if (m.t === 'prepare') { const b = Buffer.alloc(12); b.writeDoubleLE(m.sr, 0); b.writeUInt32LE(m.block, 8); prep = b; x64.prepare(); x86.prepare(); } } catch (err) { log('errore comando: ' + err.stack); } });
  // audio a lotti: tutti gli insert con plugin in un messaggio; ogni catena è spezzata in tratti per host, eseguiti a turni
  const segOf = ids => { const segs = []; for (const id of ids) { const h = where.get(id) || x64; if (!h.ready()) continue; const s = segs[segs.length - 1]; if (s && s.h === h) s.ids.push(id); else segs.push({h, ids:[id]}); } return segs; };
  A.on('message', e => { const m = e && e.data; if (!m || m.t !== 'procAll' || !Array.isArray(m.items)) return; try {
    const items = []; for (const it of m.items) { const L = toF32(it.L), R = toF32(it.R); if (L && R && L.length === R.length && Array.isArray(it.ids)) items.push({ins:it.ins, L, R, lat:0, segs:segOf(it.ids)}); }
    let round = 0; const n0 = items.length ? items[0].L.length : 0;
    const next = () => { const groups = new Map();
      for (const it of items) { const sg = it.segs[round]; if (!sg || it.L.length !== n0) continue; if (!groups.has(sg.h)) groups.set(sg.h, []); groups.get(sg.h).push({it, ids:sg.ids}); }
      if (!groups.size) return A.postMessage({t:'outAll', items:items.map(it => ({ins:it.ins, L:it.L, R:it.R, lat:it.lat}))});
      round++; let pend = groups.size; const done = () => { if (--pend === 0) next(); };
      for (const [h, list] of groups) if (!h.procMany(list.map(g => ({ids:g.ids, L:g.it.L, R:g.it.R})), outs => { if (outs) outs.forEach((o, i) => { const it = list[i].it; it.L = o.L; it.R = o.R; it.lat += o.lat; }); done(); })) done(); };
    next(); } catch (err) { log('errore audio: ' + err.stack); } });
  // audio: la catena viene spezzata in tratti consecutivi per host (di solito uno solo)
  const toF32 = v => v instanceof Float32Array ? v : v && v.buffer ? new Float32Array(v.buffer, v.byteOffset || 0, (v.byteLength || 0) >> 2) : Array.isArray(v) ? Float32Array.from(v) : null;
  A.on('message', e => { const m = e && e.data; if (!m || m.t !== 'proc') return; try {
    const L0 = toF32(m.L), R0 = toF32(m.R); if (!L0 || !R0 || L0.length !== R0.length || !Array.isArray(m.ids)) return; const segs = [];
    for (const id of m.ids) { const h = where.get(id) || x64; if (!h.ready()) continue; const s = segs[segs.length - 1]; if (s && s.h === h) s.ids.push(id); else segs.push({h, ids:[id]}); }
    let L = L0, R = R0, i = 0;   // nessun host pronto: il suono passa pulito invece di sparire
    const step = () => { if (i >= segs.length) return A.postMessage({t:'out', ins:m.ins, L, R}); const s = segs[i++];
      if (!s.h.proc(s.ids, L, R, (l, r) => { if (l) { L = l; R = r; } step(); })) step(); };
    step(); } catch (err) { log('errore audio: ' + err.stack); } });
  return () => { stopped = true; x64.stop(); x86.stop(); };
};
