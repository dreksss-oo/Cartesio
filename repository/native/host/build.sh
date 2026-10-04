#!/usr/bin/env bash
# Compila i ponte-plugin nativi di Cartesio (Windows x64 e x86) con mingw-w64.
# Requisiti: x86_64-w64-mingw32-g++, i686-w64-mingw32-g++, git. Uscita: native/host/bin/
set -euo pipefail; cd "$(dirname "$0")"; mkdir -p bin
[ -d third_party/pluginterfaces ] || git clone --depth 1 https://github.com/steinbergmedia/vst3_pluginterfaces.git third_party/pluginterfaces
for A in x86_64 i686; do O=$([ $A = x86_64 ] && echo cartesio-host.exe || echo cartesio-host32.exe)
  $A-w64-mingw32-g++ -std=c++17 -O2 -municode -mwindows -DUNICODE -D_UNICODE -DWIN32_LEAN_AND_MEAN -Ithird_party host.cpp third_party/pluginterfaces/base/funknown.cpp \
    -o bin/$O -static -static-libgcc -static-libstdc++ -lws2_32 -lole32 -luuid -lshell32
  echo "bin/$O"; done
