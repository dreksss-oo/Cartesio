const { app, BrowserWindow, Menu, ipcMain, MessageChannelMain, dialog, utilityProcess, session } = require('electron');
const startHost = require('./bridge/hostbridge');
const fs = require('fs'), fsp = fs.promises, path = require('path');
// i dati della vecchia versione (Curva) passano a Cartesio: progetto salvato, impostazioni, libreria plugin
try { const ud = app.getPath('userData'), old = path.join(app.getPath('appData'), 'Curva'); if (!fs.existsSync(ud) && fs.existsSync(old)) fs.cpSync(old, ud, {recursive:true}); } catch {}
// scansione plugin: cartelle standard, sola lettura dei metadati, cache per data di modifica
async function scan(_e, userDirs) {
  const env = process.env, pf = env.ProgramFiles || 'C:\\Program Files', pf86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', la = env.LOCALAPPDATA || '';
  const roots = [[path.join(pf, 'Common Files', 'VST3'), 'VST3'], [path.join(pf86, 'Common Files', 'VST3'), 'VST3'], [path.join(la, 'Programs', 'Common', 'VST3'), 'VST3'],
    [path.join(pf, 'Common Files', 'CLAP'), 'CLAP'], [path.join(la, 'Programs', 'Common', 'CLAP'), 'CLAP'],
    [path.join(pf, 'VSTPlugins'), 'VST2'], [path.join(pf, 'Steinberg', 'VSTPlugins'), 'VST2'], [path.join(pf, 'Common Files', 'VST2'), 'VST2'], [path.join(pf86, 'VSTPlugins'), 'VST2'], [path.join(pf86, 'Steinberg', 'VSTPlugins'), 'VST2']];
  const R = userDirs && userDirs.length ? userDirs.map(d => [d, '*']) : roots;
  const cf = path.join(app.getPath('userData'), 'plugins-cache-v2.json'); let cache = {}; try { cache = JSON.parse(await fsp.readFile(cf, 'utf8')); } catch {}
  const found = [], next = {}; let cached = 0, skipped = 0;
  const walk = async (dir, fmt, depth) => { let ents; try { ents = await fsp.readdir(dir, {withFileTypes:true}); } catch { return; }
    await Promise.all(ents.map(async e => { const p = path.join(dir, e.name), low = e.name.toLowerCase();
      const f2 = fmt !== '*' ? fmt : low.endsWith('.vst3') ? 'VST3' : low.endsWith('.clap') ? 'CLAP' : low.endsWith('.dll') ? 'VST2' : low.endsWith('.aaxplugin') ? 'AAX' : null; if (fmt === '*' && !f2 && !e.isDirectory()) return;
      const hit = f2 === 'VST3' ? low.endsWith('.vst3') : f2 === 'CLAP' ? low.endsWith('.clap') : f2 === 'AAX' ? low.endsWith('.aaxplugin') : f2 === 'VST2' && low.endsWith('.dll');
      if (hit) { let st; try { st = await fsp.stat(p); } catch { return; } const key = p + '|' + st.mtimeMs;
        if (cache[key]) { next[key] = cache[key]; cached++; } else { const info = {name:e.name.replace(/\.(vst3|clap|dll|aaxplugin)$/i, ''), vendor:'', format:f2 || fmt, path:p, kind:'?'};
          if ((f2 || fmt) === 'VST3' && e.isDirectory()) try { const mi = JSON.parse(await fsp.readFile(path.join(p, 'Contents', 'moduleinfo.json'), 'utf8')); const c = (mi.Classes || []).find(c => c.Category === 'Audio Module Class') || {};
            info.name = c.Name || mi.Name || info.name; info.vendor = c.Vendor || (mi['Factory Info'] || {}).Vendor || ''; info.kind = /Instrument|Synth/i.test((c['Sub Categories'] || []).join('|')) ? 'instrument' : 'fx'; } catch {}
          if (/synth|instrument|piano|drum|sampler|keys/i.test(info.name) && info.kind === '?') info.kind = 'instrument';
          // architettura: il ponte è a 64 bit, i plugin a 32 bit non si possono caricare
          try { if (e.isDirectory()) info.arch = fs.existsSync(path.join(p, 'Contents', 'x86_64-win')) ? 'x64' : fs.existsSync(path.join(p, 'Contents', 'x86-win')) ? 'x86' : '';
            else { const fd = await fsp.open(p, 'r'), b = Buffer.alloc(4096); await fd.read(b, 0, 4096, 0); await fd.close(); const o = b.readUInt32LE(0x3c); const mc = o < 4090 ? b.readUInt16LE(o + 4) : 0; info.arch = mc === 0x8664 ? 'x64' : mc === 0x14c ? 'x86' : ''; } } catch {}
          next[key] = info; }
        return; }
      if (e.isDirectory() && depth < 4) await walk(p, fmt, depth + 1); })); };
  await Promise.all(R.map(([d, f]) => walk(d, f, 0)));
  fsp.writeFile(cf, JSON.stringify(next)).catch(() => {});
  for (const v of Object.values(next)) { if (v.kind === 'instrument') { skipped++; continue; } found.push(v); }
  const best = new Map(), rank = p => p.arch === 'x64' ? 2 : p.arch === 'x86' ? 0 : 1;   // stesso plugin in 32 e 64 bit: tieni il 64
  for (const p of found) { const k = p.format + p.name.toLowerCase(), o = best.get(k); if (!o || rank(p) > rank(o)) best.set(k, p); }
  const list = [...best.values()].sort((a, b) => a.name.localeCompare(b.name));
  return {list, cached, skipped};
}
// rete di sicurezza: un errore nel processo principale va nel log, non in una finestra che blocca tutto
process.on('uncaughtException', e => { try { fs.appendFileSync(path.join(app.getPath('userData'), 'cartesio-host.log'), new Date().toISOString() + ' ERRORE main: ' + (e && e.stack || e) + '\n'); } catch {} });
// ponte audio in un processo dedicato (utilityProcess); se non parte, ripiega sul processo principale
function startBridge(w) {
  const dirs = [path.dirname(process.execPath), __dirname, path.join(__dirname, '..'), path.join(__dirname, '..', 'native', 'host', 'bin')], logDir = app.getPath('userData');
  let hwnd = ''; try { const b = w.getNativeWindowHandle(); hwnd = (b.length >= 8 ? b.readBigUInt64LE(0) : BigInt(b.readUInt32LE(0))).toString(); } catch {}
  let child = null, stopped = false, inner = () => {};
  try {
    const ctl = new MessageChannelMain(), aud = new MessageChannelMain();
    child = utilityProcess.fork(path.join(__dirname, 'bridge', 'bridgeproc.js'), [], {serviceName:'Cartesio ponte audio', stdio:'ignore'});
    w.webContents.postMessage('host-ports', null, [ctl.port2, aud.port2]);
    child.postMessage({dirs, logDir, hwnd}, [ctl.port1, aud.port1]);
    child.on('exit', () => { if (!stopped && !w.isDestroyed()) setTimeout(() => { if (!stopped && !w.isDestroyed()) inner = startBridge(w); }, 800); });
  } catch (e) {
    inner = startHost({MessageChannelMain, sendPorts: ports => w.webContents.postMessage('host-ports', null, ports), dirs, logDir, hwnd});
  }
  return () => { stopped = true; inner(); try { child && child.kill(); } catch {} };
}
app.whenReady().then(() => {
  ipcMain.on('read-src', (e, n) => { e.returnValue = /^[a-z]+\.js$/.test(n) ? fs.readFileSync(path.join(__dirname, 'renderer', 'js', n), 'utf8') : ''; });
  Menu.setApplicationMenu(null); ipcMain.handle('scan-plugins', scan);
  ipcMain.handle('save-file', async (e, o) => { let p = o.path; if (!p) { const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), {defaultPath:o.name, filters:o.filters}); if (r.canceled || !r.filePath) return null; p = r.filePath; }
    fs.writeFileSync(p, typeof o.data === 'string' ? o.data : Buffer.from(o.data)); return p; });
  ipcMain.handle('open-file', async (e, o) => { const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {properties:['openFile'], filters:o.filters}); if (r.canceled || !r.filePaths[0]) return null;
    return {path:r.filePaths[0], text:fs.readFileSync(r.filePaths[0], 'utf8')}; });
  ipcMain.handle('pick-folders', async () => (await dialog.showOpenDialog({title:'Cartelle dei plugin', properties:['openDirectory', 'multiSelections']})).filePaths);
  const w = new BrowserWindow({ width: 1440, height: 880, minWidth: 1100, minHeight: 640, backgroundColor: '#ffffff', title: 'Cartesio', show: false, webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false } });
  w.once('ready-to-show', () => { w.show(); w.focus(); });
  // alla chiusura: prima si leggono e salvano le impostazioni dei plugin, poi si chiude (massimo 3 s)
  let closing = false; w.on('close', e => { if (closing) return; e.preventDefault(); closing = true; w.webContents.send('before-close'); setTimeout(() => { if (!w.isDestroyed()) w.destroy(); }, 3000); });
  ipcMain.on('can-close', () => { if (!w.isDestroyed()) w.destroy(); });
  w.on('focus', () => w.webContents.focus());
  let stopHost = () => {};
  w.webContents.on('did-finish-load', () => { stopHost(); stopHost = startBridge(w); });
  app.on('before-quit', () => stopHost());
  w.loadFile(path.join(__dirname, 'renderer', 'index.html'));
});
app.on('window-all-closed', () => app.quit());
