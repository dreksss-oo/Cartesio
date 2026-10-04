# cartesio-host

Ponte nativo per i plugin VST3/VST2 (Win32, C++17, nessuna dipendenza oltre alle interfacce VST3 MIT).

```bash
./build.sh   # crea bin/cartesio-host.exe (x64) e bin/cartesio-host32.exe (x86)
```

Avvio: `cartesio-host.exe <porta>` — ascolta su `127.0.0.1:<porta>`; lo avvia automaticamente Cartesio. Gli eventuali crash vengono annotati nel log `%APPDATA%\Cartesio\cartesio-host.log`.
