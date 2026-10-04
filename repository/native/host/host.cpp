// cartesio-host — ponte nativo per i plugin VST3/VST2 di Cartesio.
// Protocollo TCP (127.0.0.1:<porta>): header 12 byte {u32 tipo, u32 seq, u32 lunghezza} + payload.
//  1 load {u32 id, utf8 path} → 101 {i32 ok, utf8 nome|errore}   2 unload {u32 id}   3 editor {u32 id}
//  4 proc {u32 n, u32 k, u32 ids[k], f32 L[n], f32 R[n]} → 104 {f32 L[n], f32 R[n]}   5 prepare {f64 sr, u32 blocco}
// Thread: il thread principale (UI) carica/scarica/apre gli editor; il thread di rete fa solo l'audio.
#define INIT_CLASS_IID
#include <winsock2.h>
#include <windows.h>
#include <tlhelp32.h>
#include <shellapi.h>
#include <ole2.h>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <map>
#include <string>
#include <vector>
#include "pluginterfaces/base/ipluginbase.h"
#include "pluginterfaces/base/ibstream.h"
#include "pluginterfaces/gui/iplugview.h"
#include "pluginterfaces/gui/iplugviewcontentscalesupport.h"
#include "pluginterfaces/vst/ivstcomponent.h"
#include "pluginterfaces/vst/ivstaudioprocessor.h"
#include "pluginterfaces/vst/ivsteditcontroller.h"
#include "pluginterfaces/vst/ivsthostapplication.h"
#include "pluginterfaces/vst/ivstmessage.h"
#include "pluginterfaces/vst/ivstattributes.h"
#include "pluginterfaces/vst/ivstparameterchanges.h"
#include "pluginterfaces/vst/ivstprocesscontext.h"
#include "pluginterfaces/vst/ivstevents.h"
#include "pluginterfaces/vst/vstspeaker.h"
using namespace Steinberg; using namespace Steinberg::Vst;

// ---------- utilità ----------
static void logf(const char* fmt, ...) { char b[1024]; va_list a; va_start(a, fmt); int n = vsnprintf(b, sizeof b - 2, fmt, a); va_end(a);
  if (n < 0) return; if (n > (int)sizeof b - 2) n = sizeof b - 2; b[n++] = '\n'; DWORD w; WriteFile(GetStdHandle(STD_ERROR_HANDLE), b, n, &w, nullptr); }
static std::wstring W(const std::string& s) { int n = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, nullptr, 0); std::wstring w(n ? n - 1 : 0, 0); if (n) MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, &w[0], n); return w; }
static std::string U8(const std::wstring& w) { int n = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), -1, nullptr, 0, nullptr, nullptr); std::string s(n ? n - 1 : 0, 0); if (n) WideCharToMultiByte(CP_UTF8, 0, w.c_str(), -1, &s[0], n, nullptr, nullptr); return s; }
static std::string errStr(DWORD e) { wchar_t b[512] = {0}; FormatMessageW(FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS, nullptr, e, 0, b, 511, nullptr);
  std::string s = U8(b); while (!s.empty() && (s.back() == '\n' || s.back() == '\r' || s.back() == '.')) s.pop_back(); return s; }
static int peMachine(const std::wstring& p) { HANDLE f = CreateFileW(p.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING, 0, nullptr); if (f == INVALID_HANDLE_VALUE) return -1;
  unsigned char b[4096]; DWORD r = 0; ReadFile(f, b, sizeof b, &r, nullptr); CloseHandle(f); if (r < 64 || b[0] != 'M' || b[1] != 'Z') return 0;
  uint32_t o; memcpy(&o, b + 0x3c, 4); if (o + 6 > r) return 0; uint16_t m; memcpy(&m, b + o + 4, 2); return m; }
#ifdef _WIN64
static const int MY_MACHINE = 0x8664; static const wchar_t* ARCH_DIR = L"x86_64-win"; static const char* WRONG_ARCH = "plugin a 32 bit: serve la versione a 64 bit";
#else
static const int MY_MACHINE = 0x14c; static const wchar_t* ARCH_DIR = L"x86-win"; static const char* WRONG_ARCH = "plugin a 64 bit: va caricato dal ponte a 64 bit";
#endif

// ---------- stato globale ----------
static CRITICAL_SECTION gLock, gSendLock; static SOCKET gSock = INVALID_SOCKET; static HWND gMsgWnd = nullptr, gOwner = nullptr;
static HWND gParent = nullptr;   // finestra di Cartesio: gli editor dei plugin diventano sue finestre figlie
static double gSr = 48000; static int gBlock = 1024; static DWORD gMainThread = 0;
static bool sendAll(const void* p, int n) { const char* c = (const char*)p; while (n > 0) { int k = send(gSock, c, n, 0); if (k <= 0) return false; c += k; n -= k; } return true; }
static void reply(uint32_t t, uint32_t q, const void* p, uint32_t n, const void* p2 = nullptr, uint32_t n2 = 0) {
  uint32_t h[3] = {t, q, n + n2}; EnterCriticalSection(&gSendLock); sendAll(h, 12); if (n) sendAll(p, n); if (n2) sendAll(p2, n2); LeaveCriticalSection(&gSendLock); }

// ---------- oggetti VST3 lato host ----------
#define REFCOUNT std::atomic<uint32> rc{1}; uint32 PLUGIN_API addRef() override { return ++rc; } uint32 PLUGIN_API release() override { uint32 r = --rc; if (!r) delete this; return r; }
#define STATIC_REF uint32 PLUGIN_API addRef() override { return 1000; } uint32 PLUGIN_API release() override { return 1000; }
struct MemStream : IBStream { REFCOUNT std::vector<char> d; int64 pos = 0;
  tresult PLUGIN_API queryInterface(const TUID i, void** o) override { QUERY_INTERFACE(i, o, FUnknown::iid, IBStream) QUERY_INTERFACE(i, o, IBStream::iid, IBStream) *o = nullptr; return kNoInterface; }
  tresult PLUGIN_API read(void* b, int32 n, int32* r) override { int32 k = (int32)std::max<int64>(0, std::min<int64>(n, (int64)d.size() - pos)); if (k) memcpy(b, d.data() + pos, k); pos += k; if (r) *r = k; return kResultOk; }
  tresult PLUGIN_API write(void* b, int32 n, int32* w) override { if (n < 0) return kInvalidArgument; if (pos + n > (int64)d.size()) d.resize(pos + n); memcpy(d.data() + pos, b, n); pos += n; if (w) *w = n; return kResultOk; }
  tresult PLUGIN_API seek(int64 p, int32 m, int64* r) override { int64 np = m == kIBSeekSet ? p : m == kIBSeekCur ? pos + p : (int64)d.size() + p; if (np < 0) return kInvalidArgument; pos = np; if (r) *r = pos; return kResultOk; }
  tresult PLUGIN_API tell(int64* p) override { if (p) *p = pos; return kResultOk; } };
struct AttrList : IAttributeList { REFCOUNT std::map<std::string, int64> ints; std::map<std::string, double> flts; std::map<std::string, std::u16string> strs; std::map<std::string, std::vector<char>> bins;
  tresult PLUGIN_API queryInterface(const TUID i, void** o) override { QUERY_INTERFACE(i, o, FUnknown::iid, IAttributeList) QUERY_INTERFACE(i, o, IAttributeList::iid, IAttributeList) *o = nullptr; return kNoInterface; }
  tresult PLUGIN_API setInt(AttrID id, int64 v) override { ints[id] = v; return kResultOk; }
  tresult PLUGIN_API getInt(AttrID id, int64& v) override { auto it = ints.find(id); if (it == ints.end()) return kResultFalse; v = it->second; return kResultOk; }
  tresult PLUGIN_API setFloat(AttrID id, double v) override { flts[id] = v; return kResultOk; }
  tresult PLUGIN_API getFloat(AttrID id, double& v) override { auto it = flts.find(id); if (it == flts.end()) return kResultFalse; v = it->second; return kResultOk; }
  tresult PLUGIN_API setString(AttrID id, const TChar* s) override { strs[id] = s ? std::u16string((const char16_t*)s) : u""; return kResultOk; }
  tresult PLUGIN_API getString(AttrID id, TChar* s, uint32 bytes) override { auto it = strs.find(id); if (it == strs.end() || bytes < 2) return kResultFalse;
    uint32 n = std::min<uint32>((uint32)it->second.size(), bytes / 2 - 1); memcpy(s, it->second.data(), n * 2); s[n] = 0; return kResultOk; }
  tresult PLUGIN_API setBinary(AttrID id, const void* d, uint32 n) override { bins[id].assign((const char*)d, (const char*)d + n); return kResultOk; }
  tresult PLUGIN_API getBinary(AttrID id, const void*& d, uint32& n) override { auto it = bins.find(id); if (it == bins.end()) return kResultFalse; d = it->second.data(); n = (uint32)it->second.size(); return kResultOk; } };
struct HostMessage : IMessage { REFCOUNT std::string id; AttrList* attrs = new AttrList; ~HostMessage() { attrs->release(); }
  tresult PLUGIN_API queryInterface(const TUID i, void** o) override { QUERY_INTERFACE(i, o, FUnknown::iid, IMessage) QUERY_INTERFACE(i, o, IMessage::iid, IMessage) *o = nullptr; return kNoInterface; }
  FIDString PLUGIN_API getMessageID() override { return id.c_str(); } void PLUGIN_API setMessageID(FIDString s) override { id = s ? s : ""; }
  IAttributeList* PLUGIN_API getAttributes() override { return attrs; } };
struct HostApp : IHostApplication { STATIC_REF
  tresult PLUGIN_API queryInterface(const TUID i, void** o) override { QUERY_INTERFACE(i, o, FUnknown::iid, IHostApplication) QUERY_INTERFACE(i, o, IHostApplication::iid, IHostApplication) *o = nullptr; return kNoInterface; }
  tresult PLUGIN_API getName(String128 n) override { const char16_t* s = u"Cartesio"; int i = 0; for (; s[i]; i++) n[i] = s[i]; n[i] = 0; return kResultOk; }
  tresult PLUGIN_API createInstance(TUID cid, TUID iid, void** o) override {
    if (FUnknownPrivate::iidEqual(cid, IMessage::iid) || FUnknownPrivate::iidEqual(iid, IMessage::iid)) { *o = static_cast<IMessage*>(new HostMessage); return kResultOk; }
    if (FUnknownPrivate::iidEqual(cid, IAttributeList::iid) || FUnknownPrivate::iidEqual(iid, IAttributeList::iid)) { *o = static_cast<IAttributeList*>(new AttrList); return kResultOk; }
    *o = nullptr; return kResultFalse; } } gHostApp;
struct ParamQueue : IParamValueQueue { STATIC_REF ParamID pid = 0; int n = 0; int32 off[64]; ParamValue val[64];
  tresult PLUGIN_API queryInterface(const TUID i, void** o) override { QUERY_INTERFACE(i, o, FUnknown::iid, IParamValueQueue) QUERY_INTERFACE(i, o, IParamValueQueue::iid, IParamValueQueue) *o = nullptr; return kNoInterface; }
  ParamID PLUGIN_API getParameterId() override { return pid; } int32 PLUGIN_API getPointCount() override { return n; }
  tresult PLUGIN_API getPoint(int32 i, int32& o, ParamValue& v) override { if (i < 0 || i >= n) return kResultFalse; o = off[i]; v = val[i]; return kResultOk; }
  tresult PLUGIN_API addPoint(int32 o, ParamValue v, int32& i) override { if (n && off[n - 1] == o) { val[n - 1] = v; i = n - 1; return kResultOk; } if (n >= 64) return kResultFalse; off[n] = o; val[n] = v; i = n++; return kResultOk; } };
struct ParamChanges : IParameterChanges { STATIC_REF std::vector<ParamQueue> q; int n = 0; ParamChanges() { q.resize(512); }
  tresult PLUGIN_API queryInterface(const TUID i, void** o) override { QUERY_INTERFACE(i, o, FUnknown::iid, IParameterChanges) QUERY_INTERFACE(i, o, IParameterChanges::iid, IParameterChanges) *o = nullptr; return kNoInterface; }
  int32 PLUGIN_API getParameterCount() override { return n; } IParamValueQueue* PLUGIN_API getParameterData(int32 i) override { return i >= 0 && i < n ? &q[i] : nullptr; }
  IParamValueQueue* PLUGIN_API addParameterData(const ParamID& id, int32& idx) override { for (int i = 0; i < n; i++) if (q[i].pid == id) { idx = i; return &q[i]; }
    if (n >= (int)q.size()) return nullptr; q[n].pid = id; q[n].n = 0; idx = n; return &q[n++]; }
  void clear() { n = 0; } };

// ---------- VST2 (ABI pubblico di AEffect) ----------
struct AEffect; typedef intptr_t (*Disp)(AEffect*, int32_t, int32_t, intptr_t, void*, float); typedef void (*ProcR)(AEffect*, float**, float**, int32_t);
struct AEffect { int32_t magic; Disp dispatcher; ProcR process; void (*setParameter)(AEffect*, int32_t, float); float (*getParameter)(AEffect*, int32_t);
  int32_t numPrograms, numParams, numInputs, numOutputs, flags; intptr_t resvd1, resvd2; int32_t initialDelay, realQualities, offQualities; float ioRatio;
  void* object; void* user; int32_t uniqueID, version; ProcR processReplacing; void* processDoubleReplacing; char future[56]; };
typedef AEffect* (*VstMain)(Disp);
struct ERect { int16_t top, left, bottom, right; };

// ---------- plugin ----------
struct Plugin; static std::map<uint32_t, Plugin*> gPlugs; static void edSize(Plugin* p);
static LRESULT CALLBACK EdProc(HWND, UINT, WPARAM, LPARAM);
static void sizeWindow(HWND h, int w, int ht) { RECT r{0, 0, w, ht}; DWORD st = GetWindowLong(h, GWL_STYLE), ex = GetWindowLong(h, GWL_EXSTYLE); AdjustWindowRectEx(&r, st, FALSE, ex);
  SetWindowPos(h, nullptr, 0, 0, r.right - r.left, r.bottom - r.top, SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE); }
static DWORD parentPid();
static HWND makeWindow(const std::string& title, int w, int h, bool resizable, void* user) {
  bool child = gParent && IsWindow(gParent);
  DWORD st = child ? WS_POPUP | WS_CLIPCHILDREN : WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX | WS_CLIPCHILDREN | (resizable ? WS_THICKFRAME | WS_MAXIMIZEBOX : 0);
  RECT r{0, 0, std::max(w, 120), std::max(h, 60)}; AdjustWindowRectEx(&r, st, FALSE, 0);
  // creata già sullo schermo di Cartesio (fuori schermo alcuni plugin non trovano il monitor/DPI e restano grigi)
  POINT o0{120, 120}; if (child) ClientToScreen(gParent, &o0);
  HWND hw = CreateWindowExW(child ? WS_EX_TOOLWINDOW : 0, L"CartesioPlug", W(title).c_str(), st, child ? o0.x : CW_USEDEFAULT, child ? o0.y : CW_USEDEFAULT, r.right - r.left, r.bottom - r.top, child ? gParent : nullptr, nullptr, GetModuleHandle(nullptr), nullptr);
  SetWindowLongPtr(hw, GWLP_USERDATA, (LONG_PTR)user); return hw; }

struct Plugin { std::string name; HWND wnd = nullptr; uint32_t id = 0; int px = 0, py = 0, pvis = 0; virtual ~Plugin() {}
  virtual void setup() = 0; virtual void process(float* L, float* R, int n) = 0; virtual void openEditor() = 0; virtual void closeEditor() = 0; virtual void idle() {} virtual void onSize(int, int) {} virtual void wantSize(int, int) {} virtual int latency() { return 0; }
  virtual std::string getState() { return ""; } virtual bool setState(const std::string&) { return false; } };

// moduli VST3 condivisi tra istanze dello stesso file
struct Module { HMODULE h; IPluginFactory* f; int refs; }; static std::map<std::wstring, Module> gMods;
static void unrefModule(const std::wstring& p) { auto it = gMods.find(p); if (it == gMods.end() || --it->second.refs > 0) return;
  it->second.f->release(); typedef bool (*ExitF)(); if (auto ex = (ExitF)GetProcAddress(it->second.h, "ExitDll")) ex(); FreeLibrary(it->second.h); gMods.erase(it); }

struct Vst3 : Plugin, IComponentHandler, IPlugFrame {
  std::wstring mod; IComponent* comp = nullptr; IAudioProcessor* proc = nullptr; IEditController* ctl = nullptr; bool sepCtl = false;
  IConnectionPoint *cpC = nullptr, *cpE = nullptr; IPlugView* view = nullptr; bool active = false, resizing = false;
  std::vector<BusInfo> ib, ob; std::vector<std::vector<std::vector<float>>> iStore, oStore; std::vector<std::vector<float*>> iPtr, oPtr;
  std::vector<AudioBusBuffers> iBus, oBus; ParamChanges inCh, outCh; ProcessContext pctx{};
  CRITICAL_SECTION pl; std::vector<std::pair<ParamID, ParamValue>> toProc, toCtl;
  Vst3() { InitializeCriticalSection(&pl); } ~Vst3() { DeleteCriticalSection(&pl); }
  // IComponentHandler / IPlugFrame (vivono quanto il plugin)
  tresult PLUGIN_API queryInterface(const TUID i, void** o) override { QUERY_INTERFACE(i, o, FUnknown::iid, IComponentHandler) QUERY_INTERFACE(i, o, IComponentHandler::iid, IComponentHandler)
    QUERY_INTERFACE(i, o, IPlugFrame::iid, IPlugFrame) *o = nullptr; return kNoInterface; }
  uint32 PLUGIN_API addRef() override { return 1000; } uint32 PLUGIN_API release() override { return 1000; }
  tresult PLUGIN_API beginEdit(ParamID) override { return kResultOk; } tresult PLUGIN_API endEdit(ParamID) override { return kResultOk; }
  tresult PLUGIN_API performEdit(ParamID id, ParamValue v) override { EnterCriticalSection(&pl); toProc.push_back({id, v}); LeaveCriticalSection(&pl); return kResultOk; }
  tresult PLUGIN_API restartComponent(int32 f) override { if (f & (kIoChanged | kLatencyChanged)) PostMessage(gMsgWnd, WM_APP + 20, 0, 0); return kResultOk; }
  tresult PLUGIN_API resizeView(IPlugView* v, ViewRect* r) override { if (!wnd || !r || resizing) return kResultFalse; resizing = true;
    sizeWindow(wnd, r->getWidth(), r->getHeight()); RECT c; GetClientRect(wnd, &c); ViewRect nr(0, 0, c.right, c.bottom); v->onSize(&nr); resizing = false; edSize(this); return kResultOk; }

  std::string load(const std::wstring& path) {
    std::wstring dll = path; DWORD at = GetFileAttributesW(path.c_str()); if (at == INVALID_FILE_ATTRIBUTES) return "file non trovato";
    if (at & FILE_ATTRIBUTE_DIRECTORY) { std::wstring base = path.substr(path.find_last_of(L"\\/") + 1), dir = path + L"\\Contents\\" + ARCH_DIR + L"\\";
      dll = dir + base; if (GetFileAttributesW(dll.c_str()) == INVALID_FILE_ATTRIBUTES) { WIN32_FIND_DATAW fd; HANDLE fh = FindFirstFileW((dir + L"*.vst3").c_str(), &fd);
        if (fh == INVALID_HANDLE_VALUE) return std::string("nel pacchetto VST3 manca la versione ") + (MY_MACHINE == 0x8664 ? "a 64 bit" : "a 32 bit"); dll = dir + fd.cFileName; FindClose(fh); } }
    int m = peMachine(dll); if (m > 0 && m != MY_MACHINE) return WRONG_ARCH;
    auto it = gMods.find(dll);
    if (it == gMods.end()) { HMODULE h = LoadLibraryExW(dll.c_str(), nullptr, LOAD_WITH_ALTERED_SEARCH_PATH);
      if (!h) { DWORD e = GetLastError(); return "Windows non riesce a caricare la DLL (errore " + std::to_string(e) + ": " + errStr(e) + ")"; }
      typedef bool (*InitF)(); if (auto in = (InitF)GetProcAddress(h, "InitDll")) if (!in()) { FreeLibrary(h); return "il plugin non si è inizializzato (InitDll)"; }
      typedef IPluginFactory* (PLUGIN_API *GPF)(); auto gpf = (GPF)GetProcAddress(h, "GetPluginFactory"); IPluginFactory* f = gpf ? gpf() : nullptr;
      if (!f) { FreeLibrary(h); return "non è un plugin VST3 valido (manca GetPluginFactory)"; }
      IPluginFactory3* f3 = nullptr; if (f->queryInterface(IPluginFactory3::iid, (void**)&f3) == kResultOk && f3) { f3->setHostContext(&gHostApp); f3->release(); }
      it = gMods.emplace(dll, Module{h, f, 0}).first; }
    it->second.refs++; mod = dll; IPluginFactory* f = it->second.f;
    PClassInfo ci{}; bool found = false; for (int32 i = 0; i < f->countClasses(); i++) { PClassInfo c; if (f->getClassInfo(i, &c) == kResultOk && !strcmp(c.category, kVstAudioEffectClass)) { ci = c; found = true; break; } }
    if (!found) return "nessun effetto audio in questo VST3";
    name = ci.name;
    if (f->createInstance(ci.cid, IComponent::iid, (void**)&comp) != kResultOk || !comp) return "il plugin ha rifiutato di creare il componente";
    if (comp->initialize(&gHostApp) != kResultOk) return "il plugin non si è inizializzato";
    if (comp->queryInterface(IAudioProcessor::iid, (void**)&proc) != kResultOk || !proc) return "il componente non elabora audio";
    if (proc->canProcessSampleSize(kSample32) != kResultOk) return "il plugin non supporta l'audio a 32 bit float";
    if (comp->queryInterface(IEditController::iid, (void**)&ctl) != kResultOk || !ctl) { ctl = nullptr; TUID cc;
      if (comp->getControllerClassId(cc) == kResultOk && f->createInstance(cc, IEditController::iid, (void**)&ctl) == kResultOk && ctl) {
        sepCtl = true; if (ctl->initialize(&gHostApp) != kResultOk) { ctl->release(); ctl = nullptr; sepCtl = false; } } }
    if (ctl) { ctl->setComponentHandler(this);
      if (sepCtl && comp->queryInterface(IConnectionPoint::iid, (void**)&cpC) == kResultOk && ctl->queryInterface(IConnectionPoint::iid, (void**)&cpE) == kResultOk && cpC && cpE) { cpC->connect(cpE); cpE->connect(cpC); }
      MemStream* s = new MemStream; if (comp->getState(s) == kResultOk) { s->seek(0, IBStream::kIBSeekSet, nullptr); ctl->setComponentState(s); } s->release(); }
    // bus: principale stereo attivo, gli altri (sidechain ecc.) spenti ma con buffer validi
    int nI = comp->getBusCount(kAudio, kInput), nO = comp->getBusCount(kAudio, kOutput); if (nO < 1) return "il plugin non ha uscite audio";
    std::vector<SpeakerArrangement> ia(nI), oa(nO);
    for (int i = 0; i < nI; i++) { proc->getBusArrangement(kInput, i, ia[i]); } for (int i = 0; i < nO; i++) { proc->getBusArrangement(kOutput, i, oa[i]); }
    if (nI) ia[0] = SpeakerArr::kStereo; oa[0] = SpeakerArr::kStereo; proc->setBusArrangements(nI ? ia.data() : nullptr, nI, oa.data(), nO);
    for (int i = 0; i < nI; i++) comp->activateBus(kAudio, kInput, i, i == 0); for (int i = 0; i < nO; i++) comp->activateBus(kAudio, kOutput, i, i == 0);
    for (int i = 0; i < comp->getBusCount(kEvent, kInput); i++) comp->activateBus(kEvent, kInput, i, false);
    ib.resize(nI); ob.resize(nO); for (int i = 0; i < nI; i++) comp->getBusInfo(kAudio, kInput, i, ib[i]); for (int i = 0; i < nO; i++) comp->getBusInfo(kAudio, kOutput, i, ob[i]);
    setup(); return ""; }
  void alloc(std::vector<BusInfo>& bi, std::vector<std::vector<std::vector<float>>>& st, std::vector<std::vector<float*>>& pt, std::vector<AudioBusBuffers>& bb) {
    st.assign(bi.size(), {}); pt.assign(bi.size(), {}); bb.assign(bi.size(), AudioBusBuffers());
    for (size_t b = 0; b < bi.size(); b++) { int c = std::max(0, (int)bi[b].channelCount); st[b].assign(c, std::vector<float>(gBlock, 0.f)); pt[b].resize(std::max(c, 1));
      for (int k = 0; k < c; k++) pt[b][k] = st[b][k].data(); bb[b].numChannels = c; bb[b].silenceFlags = 0; bb[b].channelBuffers32 = pt[b].data(); } }
  int lat = 0; int latency() override { return lat; }
  void setup() override { if (active) { proc->setProcessing(false); comp->setActive(false); active = false; }
    ProcessSetup ps{kRealtime, kSample32, gBlock, gSr}; proc->setupProcessing(ps);
    alloc(ib, iStore, iPtr, iBus); alloc(ob, oStore, oPtr, oBus);
    comp->setActive(true); proc->setProcessing(true); active = true; lat = (int)proc->getLatencySamples();
    pctx = ProcessContext(); pctx.sampleRate = gSr; pctx.tempo = 120; pctx.timeSigNumerator = 4; pctx.timeSigDenominator = 4; pctx.state = ProcessContext::kTempoValid | ProcessContext::kTimeSigValid; }
  void process(float* L, float* R, int n) override { if (!active) return;
    inCh.clear(); outCh.clear(); EnterCriticalSection(&pl); for (auto& p : toProc) { int32 i; if (auto q = inCh.addParameterData(p.first, i)) q->addPoint(0, p.second, i); } toProc.clear(); LeaveCriticalSection(&pl);
    if (!iBus.empty()) { auto& in = iStore[0]; for (size_t c = 0; c < in.size(); c++) { float* d = in[c].data();
        if (in.size() == 1) for (int i = 0; i < n; i++) d[i] = 0.5f * (L[i] + R[i]); else if (c < 2) memcpy(d, c ? R : L, n * 4); else memset(d, 0, n * 4); }
      for (size_t b = 1; b < iStore.size(); b++) for (auto& ch : iStore[b]) memset(ch.data(), 0, n * 4); }
    ProcessData d; d.processMode = kRealtime; d.symbolicSampleSize = kSample32; d.numSamples = n; d.numInputs = (int32)iBus.size(); d.numOutputs = (int32)oBus.size();
    d.inputs = iBus.empty() ? nullptr : iBus.data(); d.outputs = oBus.data(); d.inputParameterChanges = &inCh; d.outputParameterChanges = &outCh; d.processContext = &pctx;
    if (proc->process(d) != kResultOk) return;
    pctx.projectTimeSamples += n;
    auto& out = oStore[0]; if (out.size() >= 2) { memcpy(L, out[0].data(), n * 4); memcpy(R, out[1].data(), n * 4); } else if (out.size() == 1) { memcpy(L, out[0].data(), n * 4); memcpy(R, out[0].data(), n * 4); }
    if (outCh.n && ctl) { EnterCriticalSection(&pl); for (int i = 0; i < outCh.n; i++) if (outCh.q[i].n) toCtl.push_back({outCh.q[i].pid, outCh.q[i].val[outCh.q[i].n - 1]}); LeaveCriticalSection(&pl); } }
  // stato: "C3S1" + u32 len + stato componente + u32 len + stato controller
  std::string getState() override { MemStream* a = new MemStream; MemStream* b = new MemStream; std::string out;
    if (comp->getState(a) == kResultOk) { if (ctl) ctl->getState(b); uint32_t la = (uint32_t)a->d.size(), lb = (uint32_t)b->d.size();
      out.assign("C3S1", 4); out.append((char*)&la, 4); out.append(a->d.data(), la); out.append((char*)&lb, 4); out.append(b->d.data(), lb); }
    a->release(); b->release(); return out; }
  bool setState(const std::string& st) override { if (st.size() < 12 || st.compare(0, 4, "C3S1")) return false; uint32_t la, lb; memcpy(&la, st.data() + 4, 4); if (8ull + la + 4 > st.size()) return false;
    memcpy(&lb, st.data() + 8 + la, 4); if (12ull + la + lb > st.size()) return false;
    MemStream* a = new MemStream; a->d.assign(st.data() + 8, st.data() + 8 + la); EnterCriticalSection(&gLock); tresult r = comp->setState(a); LeaveCriticalSection(&gLock);
    if (ctl) { a->pos = 0; ctl->setComponentState(a); if (lb) { MemStream* b = new MemStream; b->d.assign(st.data() + 12 + la, st.data() + 12 + la + lb); ctl->setState(b); b->release(); } }
    a->release(); return r == kResultOk; }
  void idle() override { if (!ctl) return; std::vector<std::pair<ParamID, ParamValue>> v; EnterCriticalSection(&pl); v.swap(toCtl); LeaveCriticalSection(&pl); for (auto& p : v) ctl->setParamNormalized(p.first, p.second); }
  void openEditor() override { if (wnd) { if (gParent) edSize(this); else { ShowWindow(wnd, SW_RESTORE); SetForegroundWindow(wnd); } return; }
    if (!ctl) { logf("%s: nessuna interfaccia grafica", name.c_str()); return; }
    view = ctl->createView(ViewType::kEditor); if (!view) { logf("%s: il plugin non ha un editor", name.c_str()); return; }
    if (view->isPlatformTypeSupported(kPlatformTypeHWND) != kResultTrue) { view->release(); view = nullptr; logf("%s: editor non compatibile con Windows", name.c_str()); return; }
    if (gParent) { IPlugViewContentScaleSupport* cs = nullptr; if (view->queryInterface(IPlugViewContentScaleSupport::iid, (void**)&cs) == kResultOk && cs) { cs->setContentScaleFactor(GetDpiForWindow(gParent) / 96.f); cs->release(); } }
    ViewRect r; view->getSize(&r); wnd = makeWindow(name, r.getWidth(), r.getHeight(), view->canResize() == kResultTrue, (Plugin*)this);
    view->setFrame(this); if (view->attached(wnd, kPlatformTypeHWND) != kResultOk) { logf("%s: attached() fallito", name.c_str()); view->setFrame(nullptr); view->release(); view = nullptr; DestroyWindow(wnd); wnd = nullptr; return; }
    if (view->getSize(&r) == kResultOk) { resizing = true; sizeWindow(wnd, r.getWidth(), r.getHeight()); resizing = false; }
    if (gParent) edSize(this); else { ShowWindow(wnd, SW_SHOW); SetForegroundWindow(wnd); } }
  void onSize(int w, int h) override { if (!view || resizing) return; ViewRect r(0, 0, w, h); resizing = true; if (view->checkSizeConstraint(&r) == kResultTrue && (r.getWidth() != w || r.getHeight() != h)) sizeWindow(wnd, r.getWidth(), r.getHeight()); view->onSize(&r); resizing = false; }
  void wantSize(int w, int h) override { if (!view || !wnd || view->canResize() != kResultTrue) { edSize(this); return; } ViewRect r(0, 0, w, h); view->checkSizeConstraint(&r);
    resizing = true; sizeWindow(wnd, r.getWidth(), r.getHeight()); view->onSize(&r); resizing = false; edSize(this); }
  void closeEditor() override { if (view) { view->removed(); view->setFrame(nullptr); view->release(); view = nullptr; } if (wnd) { HWND h = wnd; wnd = nullptr; DestroyWindow(h); } }
  void destroy() { closeEditor(); if (active) { proc->setProcessing(false); comp->setActive(false); active = false; }
    if (cpC && cpE) { cpC->disconnect(cpE); cpE->disconnect(cpC); } if (cpC) cpC->release(); if (cpE) cpE->release();
    if (ctl) { ctl->setComponentHandler(nullptr); if (sepCtl) ctl->terminate(); ctl->release(); }
    if (proc) proc->release(); if (comp) { comp->terminate(); comp->release(); } if (!mod.empty()) unrefModule(mod); }
};

static intptr_t hostCb(AEffect* e, int32_t op, int32_t idx, intptr_t val, void* ptr, float);
struct Vst2 : Plugin { HMODULE h = nullptr; AEffect* e = nullptr; bool on = false; std::vector<std::vector<float>> ib, ob; std::vector<float*> ip, op;
  intptr_t D(int32_t op, int32_t i = 0, intptr_t v = 0, void* p = nullptr, float o = 0) { return e->dispatcher(e, op, i, v, p, o); }
  std::string load(const std::wstring& path, HMODULE mod) { h = mod;
    VstMain vm = (VstMain)GetProcAddress(h, "VSTPluginMain"); if (!vm) vm = (VstMain)GetProcAddress(h, "main"); if (!vm) return "questa DLL non è un plugin VST2 (né VST3)";
    e = vm(hostCb); if (!e || e->magic != 0x56737450) { e = nullptr; return "il plugin VST2 non si è creato"; }
    e->user = this; if (e->flags & (1 << 8)) return "è uno strumento: qui si caricano solo effetti";
    if (!(e->flags & (1 << 4)) || !e->processReplacing) return "plugin VST2 troppo vecchio (manca processReplacing)";
    D(0); char nm[256] = {0}; D(45, 0, 0, nm); name = nm[0] ? nm : U8(path.substr(path.find_last_of(L"\\/") + 1));
    if (name.size() > 4 && !_stricmp(name.c_str() + name.size() - 4, ".dll")) name.resize(name.size() - 4);
    setup(); return ""; }
  void setup() override { if (on) { D(72); D(12, 0, 0); on = false; }
    D(10, 0, 0, nullptr, (float)gSr); D(11, 0, gBlock);
    ib.assign(std::max(e->numInputs, 0), std::vector<float>(gBlock, 0.f)); ob.assign(std::max(e->numOutputs, 0), std::vector<float>(gBlock, 0.f));
    ip.clear(); op.clear(); for (auto& v : ib) ip.push_back(v.data()); for (auto& v : ob) op.push_back(v.data()); ip.push_back(nullptr); op.push_back(nullptr);
    D(12, 0, 1); D(71); on = true; }
  void process(float* L, float* R, int n) override { if (!on || ob.empty()) return;
    for (size_t c = 0; c < ib.size(); c++) { if (ib.size() == 1) for (int i = 0; i < n; i++) ib[0][i] = 0.5f * (L[i] + R[i]); else if (c < 2) memcpy(ib[c].data(), c ? R : L, n * 4); else memset(ib[c].data(), 0, n * 4); }
    e->processReplacing(e, ip.data(), op.data(), n);
    memcpy(L, ob[0].data(), n * 4); memcpy(R, ob[ob.size() > 1 ? 1 : 0].data(), n * 4); }
  void openEditor() override { if (wnd) { if (gParent) edSize(this); else { ShowWindow(wnd, SW_RESTORE); SetForegroundWindow(wnd); } return; } if (!(e->flags & 1)) { logf("%s: nessun editor", name.c_str()); return; }
    ERect* r = nullptr; D(13, 0, 0, &r); int w = r ? r->right - r->left : 400, ht = r ? r->bottom - r->top : 300;
    wnd = makeWindow(name, w, ht, false, (Plugin*)this); D(14, 0, 0, wnd);
    r = nullptr; D(13, 0, 0, &r); if (r && r->right > r->left) sizeWindow(wnd, r->right - r->left, r->bottom - r->top);
    if (gParent) edSize(this); else { ShowWindow(wnd, SW_SHOW); SetForegroundWindow(wnd); } }
  void idle() override { if (wnd) D(19); }
  int latency() override { return e ? std::max(0, e->initialDelay) : 0; }
  // stato: "C2C1" + chunk del plugin, oppure "C2P1" + valori dei parametri
  std::string getState() override { if (!e) return ""; std::string out;
    if (e->flags & (1 << 5)) { void* ptr = nullptr; intptr_t n = D(23, 0, 0, &ptr); if (n > 0 && ptr) { out.assign("C2C1", 4); out.append((const char*)ptr, (size_t)n); return out; } }
    out.assign("C2P1", 4); for (int i = 0; i < e->numParams; i++) { float v = e->getParameter(e, i); out.append((char*)&v, 4); } return out; }
  bool setState(const std::string& st) override { if (!e || st.size() < 4) return false;
    if (!st.compare(0, 4, "C2C1")) { std::vector<char> b(st.begin() + 4, st.end()); EnterCriticalSection(&gLock); D(24, 0, (intptr_t)b.size(), b.data()); LeaveCriticalSection(&gLock); return true; }
    if (!st.compare(0, 4, "C2P1")) { int n = (int)((st.size() - 4) / 4); for (int i = 0; i < n && i < e->numParams; i++) { float v; memcpy(&v, st.data() + 4 + 4 * i, 4); e->setParameter(e, i, v); } return true; }
    return false; }
  void closeEditor() override { if (wnd) { D(15); HWND x = wnd; wnd = nullptr; DestroyWindow(x); } }
  void destroy() { closeEditor(); if (e) { if (on) { D(72); D(12, 0, 0); } D(1); e = nullptr; } if (h) FreeLibrary(h); }
};
static intptr_t hostCb(AEffect* e, int32_t op, int32_t idx, intptr_t val, void* ptr, float) {
  Vst2* p = e ? (Vst2*)e->user : nullptr;
  switch (op) { case 1: return 2400; case 6: return 1; case 16: return (intptr_t)gSr; case 17: return gBlock; case 23: return GetCurrentThreadId() == gMainThread ? 1 : 2;
    case 32: strcpy((char*)ptr, "Cartesio"); return 1; case 33: strcpy((char*)ptr, "Cartesio"); return 1; case 34: return 1;
    case 37: { const char* s = (const char*)ptr; if (!s) return 0; return !strcmp(s, "sizeWindow") || !strcmp(s, "sendVstTimeInfo") ? 1 : 0; }
    case 15: if (p && p->wnd) { sizeWindow(p->wnd, idx, (int)val); edSize(p); return 1; } return 0;
    default: return 0; } }

static void destroyPlugin(Plugin* p) { if (auto v = dynamic_cast<Vst3*>(p)) v->destroy(); else if (auto v2 = dynamic_cast<Vst2*>(p)) v2->destroy(); delete p; }
static std::string loadPlugin(const std::string& path8, Plugin*& out) {
  std::wstring path = W(path8); out = nullptr; size_t dot = path.find_last_of(L'.'); std::wstring ext = dot == std::wstring::npos ? L"" : path.substr(dot);
  for (auto& c : ext) c = towlower(c);
  if (ext == L".clap") return "CLAP: non ancora supportato dal ponte";
  if (ext == L".dll") { int m = peMachine(path); if (m > 0 && m != MY_MACHINE) return WRONG_ARCH; if (m == -1) return "file non trovato";
    HMODULE h = LoadLibraryExW(path.c_str(), nullptr, LOAD_WITH_ALTERED_SEARCH_PATH); if (!h) { DWORD e = GetLastError(); return "Windows non riesce a caricare la DLL (errore " + std::to_string(e) + ": " + errStr(e) + ")"; }
    if (GetProcAddress(h, "GetPluginFactory")) { FreeLibrary(h); auto v = new Vst3; std::string e = v->load(path); if (!e.empty()) { destroyPlugin(v); return e; } out = v; return ""; }
    auto v = new Vst2; std::string e = v->load(path, h); if (!e.empty()) { destroyPlugin(v); return e; } out = v; return ""; }
  auto v = new Vst3; std::string e = v->load(path); if (!e.empty()) { destroyPlugin(v); return e; } out = v; return ""; }

// ---------- thread UI ----------
struct Cmd { uint32_t t, q; std::vector<char> p; };
// le finestre dei plugin stanno sopra solo mentre si lavora in Cartesio (o in un plugin)
// posiziona la finestra del plugin sul riquadro di Cartesio (coordinate del client di Cartesio) e la ritaglia ai bordi della finestra
static void applyPlace(Plugin* p) { if (!gParent || !p->wnd) return; POINT o{0, 0}; ClientToScreen(gParent, &o); RECT cr, wr; GetClientRect(gParent, &cr); GetWindowRect(p->wnd, &wr);
  int w = wr.right - wr.left, h = wr.bottom - wr.top, sx = o.x + p->px, sy = o.y + p->py;
  int l = std::max(0, (int)o.x - sx), t = std::max(0, (int)o.y - sy), r = std::min(w, (int)(o.x + cr.right) - sx), b = std::min(h, (int)(o.y + cr.bottom) - sy);
  bool vis = p->pvis && !IsIconic(gParent) && IsWindowVisible(gParent) && r > l && b > t;
  if (vis) SetWindowRgn(p->wnd, (l == 0 && t == 0 && r == w && b == h) ? nullptr : CreateRectRgn(l, t, r, b), TRUE);
  SetWindowPos(p->wnd, nullptr, sx, sy, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | (vis ? SWP_SHOWWINDOW : SWP_HIDEWINDOW)); }
static void edSize(Plugin* p) { if (!gParent || !p->wnd) return; applyPlace(p); RECT r; GetClientRect(p->wnd, &r); uint32_t v[3] = {p->id, (uint32_t)r.right, (uint32_t)r.bottom}; reply(110, 0, v, 12); }
static int gTop = -1;
static void followParent() { if (!gParent) return; static POINT last{-99999, -99999}; static RECT lr{}; static int li = -1; POINT o{0, 0}; ClientToScreen(gParent, &o); RECT cr; GetClientRect(gParent, &cr); int ic = IsIconic(gParent) || !IsWindowVisible(gParent);
  if (o.x == last.x && o.y == last.y && ic == li && cr.right == lr.right && cr.bottom == lr.bottom) return; last = o; lr = cr; li = ic; for (auto& kv : gPlugs) applyPlace(kv.second); }
static void updateTopmost() { followParent(); if (gParent) return; static DWORD pp = parentPid(); DWORD pid = 0; GetWindowThreadProcessId(GetForegroundWindow(), &pid);
  int want = pid && (pid == pp || pid == GetCurrentProcessId()); if (want == gTop) return; gTop = want;
  for (auto& kv : gPlugs) if (kv.second->wnd) SetWindowPos(kv.second->wnd, want ? HWND_TOPMOST : HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE); }
static void reprepareAll() { EnterCriticalSection(&gLock); for (auto& kv : gPlugs) kv.second->setup(); LeaveCriticalSection(&gLock); }
static LRESULT CALLBACK MsgProc(HWND h, UINT m, WPARAM w, LPARAM l) {
  if (m == WM_TIMER) { for (auto& kv : gPlugs) kv.second->idle(); updateTopmost(); return 0; }
  if (m == WM_APP + 20) { reprepareAll(); return 0; }
  if (m != WM_APP + 1) return DefWindowProcW(h, m, w, l);
  Cmd* c = (Cmd*)l; uint32_t id = 0; if (c->p.size() >= 4) memcpy(&id, c->p.data(), 4);
  if (c->t == 1) { std::string path(c->p.begin() + 4, c->p.end()); logf("carico %s", path.c_str()); Plugin* p = nullptr; std::string err = loadPlugin(path, p);
    if (p) { p->id = id; Plugin* old = nullptr; EnterCriticalSection(&gLock); auto it = gPlugs.find(id); if (it != gPlugs.end()) old = it->second; gPlugs[id] = p; LeaveCriticalSection(&gLock); if (old) destroyPlugin(old); }
    int32_t ok = p ? 1 : 0; std::string msg = p ? p->name : err; logf("%s → %s", ok ? "ok" : "errore", msg.c_str()); reply(101, c->q, &ok, 4, msg.data(), (uint32_t)msg.size()); }
  else if (c->t == 2) { Plugin* p = nullptr; EnterCriticalSection(&gLock); auto it = gPlugs.find(id); if (it != gPlugs.end()) { p = it->second; gPlugs.erase(it); } LeaveCriticalSection(&gLock); if (p) destroyPlugin(p); }
  else if (c->t == 10 && c->p.size() >= 12) { uint64_t h; memcpy(&h, c->p.data() + 4, 8); gParent = (HWND)(uintptr_t)h; logf("finestra di Cartesio: %s", IsWindow(gParent) ? "ok" : "non valida"); if (!IsWindow(gParent)) gParent = nullptr; }
  else if (c->t == 11 && c->p.size() >= 16) { int32_t x, y, vis; memcpy(&x, c->p.data() + 4, 4); memcpy(&y, c->p.data() + 8, 4); memcpy(&vis, c->p.data() + 12, 4);
    auto it = gPlugs.find(id); if (it != gPlugs.end()) { it->second->px = x; it->second->py = y; it->second->pvis = vis; applyPlace(it->second); } }
  else if (c->t == 13 && c->p.size() >= 12) { uint32_t w, h; memcpy(&w, c->p.data() + 4, 4); memcpy(&h, c->p.data() + 8, 4); auto it = gPlugs.find(id); if (it != gPlugs.end()) it->second->wantSize((int)w, (int)h); }
  else if (c->t == 12) { auto it = gPlugs.find(id); if (it != gPlugs.end()) it->second->closeEditor(); }
  else if (c->t == 7) { auto it = gPlugs.find(id); std::string st = it != gPlugs.end() ? it->second->getState() : ""; int32_t ok = st.empty() ? 0 : 1; reply(107, c->q, &ok, 4, st.data(), (uint32_t)st.size()); }
  else if (c->t == 8) { auto it = gPlugs.find(id); if (it != gPlugs.end()) { bool ok = it->second->setState(std::string(c->p.begin() + 4, c->p.end())); logf("stato ripristinato su %s: %s", it->second->name.c_str(), ok ? "ok" : "rifiutato"); } }
  else if (c->t == 3) { auto it = gPlugs.find(id); if (it != gPlugs.end()) { it->second->openEditor(); gTop = -1; updateTopmost(); } else logf("editor: plugin %u non caricato", id); }
  else if (c->t == 5 && c->p.size() >= 12) { double sr; uint32_t b; memcpy(&sr, c->p.data(), 8); memcpy(&b, c->p.data() + 8, 4);
    if (sr > 1000 && b > 0) { gSr = sr; gBlock = (int)std::max<uint32_t>(b, 1024); logf("prepare %.0f Hz, blocco %d", gSr, gBlock); reprepareAll(); } }
  delete c; return 0; }
static LRESULT CALLBACK EdProc(HWND h, UINT m, WPARAM w, LPARAM l) { Plugin* p = (Plugin*)GetWindowLongPtr(h, GWLP_USERDATA);
  if (m == WM_CLOSE && p) { uint32_t id = p->id; p->closeEditor(); reply(109, 0, &id, 4); return 0; }
  if (m == WM_SIZE && p && w != SIZE_MINIMIZED) { p->onSize(LOWORD(l), HIWORD(l)); return 0; }
  return DefWindowProcW(h, m, w, l); }

// ---------- thread di rete (audio) ----------
static bool recvAll(void* p, int n) { char* c = (char*)p; while (n > 0) { int k = recv(gSock, c, n, 0); if (k <= 0) return false; c += k; n -= k; } return true; }
static DWORD WINAPI NetThread(void* ls) { SOCKET LS = (SOCKET)(uintptr_t)ls; gSock = accept(LS, nullptr, nullptr); closesocket(LS);
  if (gSock == INVALID_SOCKET) { logf("accept fallito"); PostThreadMessage(gMainThread, WM_QUIT, 0, 0); return 0; }
  SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_TIME_CRITICAL);
  int one = 1; setsockopt(gSock, IPPROTO_TCP, TCP_NODELAY, (const char*)&one, sizeof one); logf("collegato");
  std::vector<char> p; std::vector<float> L, R, out; std::vector<uint32_t> ids; std::vector<std::vector<uint32_t>> chains;
  for (;;) { uint32_t h[3]; if (!recvAll(h, 12)) break; if (h[2] > (64u << 20)) break; p.resize(h[2]); if (h[2] && !recvAll(p.data(), h[2])) break;
    if (h[0] == 4) { if (p.size() < 8) continue; uint32_t n, k; memcpy(&n, p.data(), 4); memcpy(&k, p.data() + 4, 4); if (p.size() < 8 + 4ull * k + 8ull * n) continue;
      ids.resize(k); memcpy(ids.data(), p.data() + 8, 4 * k); L.resize(n); R.resize(n); memcpy(L.data(), p.data() + 8 + 4 * k, 4 * n); memcpy(R.data(), p.data() + 8 + 4 * k + 4 * n, 4 * n);
      EnterCriticalSection(&gLock);
      for (uint32_t id : ids) { auto it = gPlugs.find(id); if (it == gPlugs.end()) continue; for (uint32_t o = 0; o < n; o += gBlock) it->second->process(L.data() + o, R.data() + o, (int)std::min<uint32_t>(gBlock, n - o)); }
      LeaveCriticalSection(&gLock);
      for (uint32_t i = 0; i < n; i++) { if (!std::isfinite(L[i]) || std::fabs(L[i]) > 64) L[i] = 0; if (!std::isfinite(R[i]) || std::fabs(R[i]) > 64) R[i] = 0; }   // protegge le casse
      reply(104, h[1], L.data(), 4 * n, R.data(), 4 * n); }
    else if (h[0] == 6) { if (p.size() < 8) continue; uint32_t n, cnt; memcpy(&n, p.data(), 4); memcpy(&cnt, p.data() + 4, 4); if (!n || n > 65536 || cnt > 256) continue;
      size_t off = 8; bool okp = true; chains.resize(cnt);
      for (uint32_t i = 0; i < cnt && okp; i++) { if (off + 4 > p.size()) { okp = false; break; } uint32_t k; memcpy(&k, p.data() + off, 4); off += 4;
        if (k > 1024 || off + 4ull * k > p.size()) { okp = false; break; } chains[i].resize(k); memcpy(chains[i].data(), p.data() + off, 4 * k); off += 4 * k; }
      if (!okp || off + 8ull * n * cnt > p.size()) continue;
      out.resize(cnt + 2 * (size_t)n * cnt); float* au = out.data() + cnt; memcpy(au, p.data() + off, 8ull * n * cnt);
      EnterCriticalSection(&gLock);
      for (uint32_t i = 0; i < cnt; i++) { float *Lp = au + 2ull * n * i, *Rp = Lp + n; int lt = 0;
        for (uint32_t id : chains[i]) { auto it = gPlugs.find(id); if (it == gPlugs.end()) continue; lt += it->second->latency();
          for (uint32_t o = 0; o < n; o += gBlock) it->second->process(Lp + o, Rp + o, (int)std::min<uint32_t>(gBlock, n - o)); }
        uint32_t lu = (uint32_t)lt; memcpy(out.data() + i, &lu, 4); }
      LeaveCriticalSection(&gLock);
      for (size_t i = 0; i < 2ull * n * cnt; i++) if (!std::isfinite(au[i]) || std::fabs(au[i]) > 64) au[i] = 0;
      reply(106, h[1], out.data(), (uint32_t)(4 * out.size())); }
    else { Cmd* c = new Cmd{h[0], h[1], p}; PostMessage(gMsgWnd, WM_APP + 1, 0, (LPARAM)c); } }
  logf("Cartesio si è scollegato, chiudo"); PostThreadMessage(gMainThread, WM_QUIT, 0, 0); return 0; }

// ---------- crash: scrive il modulo colpevole nel log ----------
static LONG WINAPI OnCrash(EXCEPTION_POINTERS* x) { void* a = x->ExceptionRecord->ExceptionAddress; HMODULE m = nullptr; wchar_t nm[MAX_PATH] = L"?";
  if (GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT, (LPCWSTR)a, &m)) GetModuleFileNameW(m, nm, MAX_PATH);
  logf("CRASH 0x%08lX in %s", (unsigned long)x->ExceptionRecord->ExceptionCode, U8(nm).c_str()); return EXCEPTION_CONTINUE_SEARCH; }
static DWORD parentPid() { DWORD me = GetCurrentProcessId(), r = 0; HANDLE s = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0); PROCESSENTRY32W e{sizeof e};
  if (Process32FirstW(s, &e)) do { if (e.th32ProcessID == me) { r = e.th32ParentProcessID; break; } } while (Process32NextW(s, &e)); CloseHandle(s); return r; }

int WINAPI wWinMain(HINSTANCE hi, HINSTANCE, PWSTR, int) {
  SetUnhandledExceptionFilter(OnCrash); SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOOPENFILEERRORBOX);
  int argc; wchar_t** argv = CommandLineToArgvW(GetCommandLineW(), &argc); int port = argc > 1 ? _wtoi(argv[1]) : 0; if (port <= 0 || port > 65535) { logf("uso: cartesio-host <porta>"); return 2; }
  SetPriorityClass(GetCurrentProcess(), ABOVE_NORMAL_PRIORITY_CLASS);
  { typedef BOOL (WINAPI *DpiF)(HANDLE); if (auto f = (DpiF)GetProcAddress(GetModuleHandleW(L"user32.dll"), "SetProcessDpiAwarenessContext")) f((HANDLE)(intptr_t)-4); }
  gMainThread = GetCurrentThreadId(); InitializeCriticalSection(&gLock); InitializeCriticalSection(&gSendLock); OleInitialize(nullptr);
  WSADATA wd; WSAStartup(MAKEWORD(2, 2), &wd);
  SOCKET L = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP); sockaddr_in a{}; a.sin_family = AF_INET; a.sin_port = htons((u_short)port); a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  if (L == INVALID_SOCKET || bind(L, (sockaddr*)&a, sizeof a) || listen(L, 1)) { logf("non riesco ad aprire la porta %d (errore %d)", port, WSAGetLastError()); return 1; }
  WNDCLASSW wc{}; wc.lpfnWndProc = MsgProc; wc.hInstance = hi; wc.lpszClassName = L"CartesioHostMsg"; RegisterClassW(&wc);
  WNDCLASSW ec{}; ec.lpfnWndProc = EdProc; ec.hInstance = hi; ec.lpszClassName = L"CartesioPlug"; ec.hCursor = LoadCursor(nullptr, IDC_ARROW); ec.hbrBackground = (HBRUSH)GetStockObject(BLACK_BRUSH);
  ec.hIcon = LoadIcon(nullptr, IDI_APPLICATION); RegisterClassW(&ec);
  gMsgWnd = CreateWindowExW(0, L"CartesioHostMsg", L"", 0, 0, 0, 0, 0, HWND_MESSAGE, nullptr, hi, nullptr); SetTimer(gMsgWnd, 1, 15, nullptr);
  logf("cartesio-host pronto sulla porta %d (%s)", port, MY_MACHINE == 0x8664 ? "64 bit" : "32 bit");
  CreateThread(nullptr, 0, NetThread, (void*)(uintptr_t)L, 0, nullptr);
  MSG msg; while (GetMessageW(&msg, nullptr, 0, 0) > 0) { TranslateMessage(&msg); DispatchMessageW(&msg); }
  TerminateProcess(GetCurrentProcess(), 0); return 0; }
