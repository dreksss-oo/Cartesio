// Processo separato per il ponte audio: l'audio dei plugin non passa più dal processo principale di Electron (che gestisce finestre e interfaccia)
const os = require('os'), startHost = require('./hostbridge');
try { os.setPriority(os.constants.priority.PRIORITY_HIGH); } catch {}
let stop = () => {};
process.parentPort.once('message', e => { stop = startHost({ports:e.ports, dirs:e.data.dirs, logDir:e.data.logDir, hwnd:e.data.hwnd}); });
process.on('uncaughtException', () => {});
