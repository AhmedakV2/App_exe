# AFT — Proje Dokümantasyonu

Bu belge, depodaki tüm kaynak dosyaların ne işe yaradığını, hangi modülde hangi sınıf ve
fonksiyonun ne yaptığını dosya dosya anlatır. Kod tabanı `Aft/src` altında toplam ~28.000
satır TypeScript/TSX içerir.

---

## 1. Genel Bakış

**AFT**, Electron üzerine kurulu bir **web otomasyon ve test stüdyosu**dur. Uygulama kendi
içinde bir tarayıcı penceresi barındırır ve bu pencerede açılan sayfa üzerinde:

1. **Keşif (Discovery)** — Chrome DevTools Protocol (CDP) ile sayfadaki tüm DOM ağacını,
   iframe'leri, shadow DOM köklerini ve erişilebilirlik (AX) verisini tarayıp bir
   `ElementGraph` çıkarır.
2. **Kimlik (Identity)** — Her elemana, sayfa değişse bile tekrar bulunabilmesini sağlayan
   çok stratejili bir "descriptor" (parmak izi) üretir; kırılan seçicileri otomatik onarır
   (self-healing).
3. **Kayıt (Record)** — Kullanıcının sayfadaki gerçek etkileşimlerini dinler, gürültüyü
   temizler ve çalıştırılabilir senaryo adımlarına dönüştürür.
4. **Oynatma (Playback)** — Kaydedilen/elle yazılan senaryoyu adım adım çalıştırır,
   doğrulamaları (assertion) işletir, hata anında bağlam paketi ve ekran görüntüsü toplar.
5. **Veri (Data)** — Koşum sonuçlarını yerel SQLite veritabanına yazar, sağlık metrikleri
   üretir, dış sisteme gönderim için bir outbox kuyruğu işletir.
6. **Regresyon (Regression)** — Donmuş fixture sayfalarından oluşan bir havuz üzerinde
   keşif motorunun kalitesini ölçer ve baseline ile karşılaştırır.

Arayüz dili Türkçedir; kod içi metinler, komutlar ve etiketler Türkçe yazılmıştır.

---

## 2. Teknoloji Yığını

| Katman | Teknoloji |
|---|---|
| Masaüstü kabuk | Electron 39 (`BaseWindow` + iki `WebContentsView`) |
| Derleme | electron-vite 5, Vite 7, electron-builder 26 |
| Dil | TypeScript 5.9 (üç ayrı tsconfig: root / node / web) |
| Arayüz | React 19 + saf CSS (harici UI kütüphanesi yok) |
| Veritabanı | `node:sqlite` (`DatabaseSync`) — harici bağımlılık yok |
| Otomasyon | Chrome DevTools Protocol, `webContents.debugger` üzerinden |
| Lint / Format | ESLint 9 (electron-toolkit config), Prettier 3 |

Üretim bağımlılıkları yalnızca üç paket: `@electron-toolkit/preload`,
`@electron-toolkit/utils`, `electron-updater`. Kalan her şey devDependency.

---

## 3. Mimari ve Veri Akışı

```
┌──────────────────────── Electron BaseWindow ────────────────────────┐
│                                                                     │
│  chatView (WebContentsView)          targetView (WebContentsView)   │
│  ├─ React arayüzü (renderer)         ├─ Otomasyonun hedefi          │
│  ├─ preload/index.ts köprüsü         ├─ sandbox: true               │
│  └─ Tüm paneller, sayfalar           └─ persist:aft-agent partition │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
        │  IPC (contextBridge)                     ▲  CDP (debugger)
        ▼                                          │
┌─────────────────────── Main Process ──────────────────────────────┐
│  bridge/  ← IPC kanalları (identity, playback, data, record)      │
│  browser/ ← BrowserController: keşif + eylem orkestrasyonu        │
│  discovery/ ← Transport, DiscoveryEngine, ElementGraph            │
│  model/   ← Snapshot şeması, ModelIndex, projeksiyon              │
│  identity/← Descriptor üretimi, strateji zinciri, healing         │
│  action/  ← ActionEngine, actionability, girdi, navigasyon        │
│  record/  ← Recorder, NoiseFilter, StepFactory, Editor            │
│  scenario/← PlaybackEngine, StepExecutor, AssertionEngine         │
│  data/    ← SQLite şeması, Indexer, Outbox, Retention             │
│  regression/ ← Fixture havuzu, harness, baseline                  │
│  home/    ← aft://home/ özel şeması ve ana sayfa                  │
└───────────────────────────────────────────────────────────────────┘
```

**Tipik akış:** Renderer bir eylem gönderir → `preload` üzerinden IPC →
`BrowserController.execute()` → `DiscoveryEngine.scan()` ile taze `ElementGraph` →
`IdentityService` ile hedef çözümleme → `ActionEngine.execute()` ile CDP eylemi →
`ActionOutcome` geri döner → arayüz konsolu ve öğe listesi güncellenir.

---

## 4. Dizin Haritası

```
App_exe/
├── .gitattributes, .idea/          → IDE ve git ayarları
└── Aft/                            → Uygulamanın kökü
    ├── package.json                → 20+ npm script (build, verify, regression…)
    ├── electron.vite.config.ts     → 9 ayrı main giriş noktası tanımlar
    ├── electron-builder.yml        → win/mac/linux paketleme
    ├── tsconfig{,.node,.web}.json  → Proje referanslı üçlü yapı
    ├── build/, resources/          → İkonlar, mac entitlements
    ├── scenarios/ornek.scenario.json → Örnek senaryo dosyası
    └── src/
        ├── main/                   → Electron ana süreç (~22.000 satır)
        ├── preload/                → contextBridge API yüzeyleri
        └── renderer/               → React arayüzü (~4.000 satır)
```

---

## 5. Main Process — Modül Modül

### 5.1 `src/main/index.ts` (759 satır) — Uygulama Kabuğu

Uygulamanın giriş noktası. Çerçevesiz (`frame: false`) bir `BaseWindow` açar ve içine iki
`WebContentsView` yerleştirir: `chatView` (React arayüzü) ve `targetView` (otomasyon hedefi).

**Yerleşim / pencere fonksiyonları**

| Fonksiyon | Görevi |
|---|---|
| `preloadPath()` | `.mjs` yoksa `.js` preload dosyasına düşer |
| `visibleArea()` | Pencere maksimize ise çalışma alanı taşmalarını kırpar |
| `fallbackStage(area)` | Sahne kutusu bildirilmemişse 40px çerçeveli varsayılan alan |
| `stageBounds(area)` | Renderer'ın bildirdiği oransal kutuyu piksele çevirir |
| `layout()` | `chatView`'i tüm alana, `targetView`'i sahne kutusuna oturtur |
| `readBox(value)` | IPC'den gelen kutuyu doğrular, 0–1 aralığına sıkıştırır |
| `setStage(value)` | Kutu gerçekten değiştiyse yeniden yerleşim tetikler |
| `applyStageVisible()` | Modal açıkken veya sahne gizliyken hedef görünümü kapatır |
| `setModal(open)` / `setStageShown(open)` | Sahne görünürlüğünü yöneten iki bağımsız anahtar |
| `setChrome(color)` | `#rrggbb` doğrulaması yapıp pencere arka planını boyar |
| `scheduleLayout()` / `pushState()` | `setImmediate` ile tekilleştirilmiş (debounce) yerleşim ve durum yayını |
| `snapshotState()` | `BrowserState` üretir: url, başlık, geri/ileri, yükleniyor, panel durumları |

**Odak ve panel yönetimi**

`focusChat()`, `focusTerminal()`, `focusTerminalOnLoad()` — sayfa yüklendiğinde odağı
terminale döndürür, ancak kullanıcı sayfa içinde tıklamışsa (`pageHold`) müdahale etmez.
`setChat(open)`, `setTerminal(open, focus)` panelleri açar/kapar.

**Ayarlar penceresi**

`openSettings()` ikinci bir `BrowserWindow` açar (`?view=settings` sorgusuyla aynı React
paketini yükler), konum/boyutu `settingsSpot` ve `settingsSize` içinde hatırlar.
`closeSettings()`, `setSettings(open)`, `settingsAlive()` yardımcılarıyla yönetilir.

**Tercih senkronizasyonu**

`publishPrefs(value)` renderer'dan gelen tema/otomatik terminal tercihlerini alır, ayarlar
penceresine iletir ve `setHomeTheme()` ile ana sayfa temasını değiştirip `repaintHome()`
çağırır. `patchPrefs(patch)` ters yönde çalışır (ayarlar → ana arayüz).

**Panel sürükleme**

`startDrag(axis)` 16 ms'lik bir `setInterval` başlatır; `sendPointer()` her tikte gerçek
imleç konumunu oransal olarak renderer'a yollar. Böylece panel yeniden boyutlandırma,
`targetView` fare olaylarını yutsa bile çalışır. `stopDrag()` 30 sn güvenlik sınırı,
pencere blur'u veya `mouseUp` ile devreye girer.

**Kısayollar** — `bindShortcuts(wc)`: `F11` tam ekran, `F12` inceleme, `Ctrl+K` / `Alt+F12`
terminal, `Ctrl+P` komut paleti, `Ctrl+L` adres çubuğu odağı, `Ctrl+H` kayıtta imleç
adımlarını açar/kapatır. Hem uygulama arayüzüne hem de kaydedilen sayfaya bağlandığı için
odak nerede olursa olsun çalışır.

**Olay bağlama** — `bindPageFocus()`, `bindWindowEvents()`, `bindTargetEvents()`.
Sonuncusu yeni pencere açma isteklerini engelleyip aynı görünümde yükler
(`setWindowOpenHandler` → `deny`), navigasyon olaylarında `controller.sync()` çağırır.

**Başlangıç** — `createWindow()` pencereyi kurar, `BrowserController`'ı oluşturur ve
köprüleri sırayla mount eder: `mountIdentity` → `mountPlayback` → `mountData` →
`mountRecord`. Pencere kapanırken ters sırada unmount edilir.

**IPC kayıtları** (`app.whenReady` içinde): `aft:execute`, `aft:scan`, `aft:coverage`,
`aft:vision`, `aft:nav`, `aft:window`, `aft:chat`, `aft:terminal`, `aft:drag`, `aft:stage`,
`aft:modal`, `aft:stage-shown`, `aft:settings`, `aft:prefs`, `aft:prefs-patch`,
`aft:chrome`, `aft:state`.

`respond(handler)` tüm `invoke` cevaplarını tek biçime sokar: başarı/hata, sonuç metni,
sayfa durumu ve `vision` bayrağı.

### 5.2 `src/main/atomic.ts` — Güvenli Dosya Yazımı

- `writeFileAtomic(path, data)` — geçici dosyaya yazıp `rename` ile atomik takas yapar.
- `quarantine(path)` — bozuk dosyayı silmez, zaman damgalı bir ada taşıyıp yolunu döner.
- `tempName(path)` — çakışmayan geçici dosya adı üretir.

### 5.3 `src/main/home/` — Yerleşik Ana Sayfa

Uygulama, `aft://home/` adresinde kendi ana sayfasını sunar.

- **`search.ts`** — `HOME_SCHEME`, `HOME_URL`, Google arama ve favicon uç noktaları.
  - `searchUrl(query)` — sorguyu Google arama adresine çevirir.
  - `isHomeUrl(raw)` — adresin ana sayfa olup olmadığını kontrol eder.
  - `resolveInput(input)` — kullanıcı girdisini adrese ya da aramaya dönüştürür;
    `javascript:` ve `data:` şemalarını açıkça reddeder, localhost ve IP kalıplarını tanır.
- **`index.ts`** — `registerHomeScheme()` şemayı ayrıcalıklı olarak kaydeder (uygulama
  hazır olmadan önce çağrılmalı), `mountHome(partition)` ilgili session'a protokol
  işleyicisi bağlar, `setHomeTheme(next)` tema değişimini bildirir.
- **`page.ts` (579 satır)** — `SKINS` içinde dört tema paleti (`grafit`, `gece`, `kagit`,
  `orman`). `skinOf(theme)` paleti seçer, `homePage(theme)` tam HTML sayfasını string
  olarak üretir: marka başlığı, arama kutusu, beş kısayol yuvası ve kısayol ekleme formu.
  Kısayollar `localStorage`'da saklanır, site ikonları Google favicon servisinden çekilir.

### 5.4 `src/main/discovery/` — Sayfa Keşif Motoru

Bu modül, sayfayı CDP üzerinden okuyup `ElementGraph` üretir.

**`Transport.ts`** — CDP bağlantısının tek sahibi.
- `Transport.start()` — debugger'ı bağlar, oto-attach kurar, alt hedefleri takip eder.
- `send<T>(method, params, sessionId)` — 15 sn zaman aşımlı komut gönderimi.
- `trySend<T>()` — hata yutan varyant.
- `on(method, fn)` — olay aboneliği, kaldırma fonksiyonu döner.
- `enableDomains(sessionId)` — gereken CDP domainlerini açar.
- `stats()` / `resetStats()` — protokol çağrı sayacı (koşum metriklerinde kullanılır).
- `ProtocolError` — metod ve session bilgisini taşıyan hata sınıfı.

**`FrameRegistry.ts`** — iframe ağacını izler. `refresh()` çerçeve ağacını yeniden okur,
`walk()` ağacı dolaşır, `link()` üst-alt ilişkisini kurar, `resolveOwners()` çerçeve sahibi
elemanları eşler. `ordered()` derinlik sırasına göre çerçeveleri verir; bağlanamayan
çerçeveler `failedSessions` olarak sayılır.

**`StabilityWaiter.ts`** — Sayfanın "durulmasını" bekler. Sayfaya `aft_probe` adlı izole
bir dünyada mutasyon sayacı enjekte eder (`PROBE_SOURCE`), `read()` ile okur,
`waitForQuiet()` belirtilen süre boyunca değişim olmamasını bekler. Sürekli hareketli
sayfalar için `RESTLESS_LIMIT` sonrası bekleme süresini kısaltır. Ayrıca `scrollBy()` /
`scrollTo()` yardımcılarını sağlar. `delay(ms)` modülün dışa açtığı basit bekleme.

**`SnapshotCollector.ts`** — `DOMSnapshot.captureSnapshot` çıktısını çözer.
`captureSession()` bir oturumun tüm dokümanlarını toplar; `decodeDoc()` sıkıştırılmış
string tablosunu, `decodeAttrs()` / `decodeStyle()` öznitelik ve stil dizilerini,
`stringMap()` / `intMap()` / `boolSet()` seyrek (rare) veri yapılarını açar.

**`AxCollector.ts`** — `collectAx()` erişilebilirlik ağacını toplar, `toInfo()` rol, ad,
açıklama, değer ve durum bayraklarını `AxInfo` yapısına indirger.

**`GraphBuilder.ts`** — Snapshot + AX verisini birleştirip `GraphNode` listesi üretir.
`buildGraph()` ana giriş, `emitDoc()` doküman başına düğüm yayar (8 ms'lik bütçeyle olay
döngüsüne yer bırakır), `toGraphNode()` tek düğümü kurar, `hostStep()` shadow DOM
sıçramasını kaydeder, `toView()` doküman koordinatını görünüm koordinatına çevirir.
`detectBlindSpots()` erişilemeyen bölgeleri (kapalı shadow, çapraz kaynak çerçeve,
bağlanamayan oturum vb.) tespit eder.

**`Classify.ts`** — Düğümleri sınıflandırır.
- `applyGeometry(node, vp, margin)` — görünürlük ve görünüm alanı içindelik.
- `OcclusionIndex` — 128px'lik hücre ızgarası ile üst üste binme sorgusu (`occludes()`).
- `applyOcclusion(nodes, index, budget)` — bütçe sınırlı örtüşme kontrolü.
- `applyInteractivity(node)` — etiket, rol ve olay dinleyicisine göre etkileşim kararı.
- `ambiguous(node)` — kararsız düğümleri işaretler.
- `probeListeners(tp, nodes, budget)` — 16 eş zamanlı `getEventListeners` sondası ile
  kararsız düğümlerin gerçekten dinleyicisi olup olmadığını ölçer.

**`ElementGraph.ts`** — Tarama sonucunun taşıyıcısı ve sorgu yüzeyi.
`get(key)`, `at(index)`, `elements()`, `interactive()`, `indexed()`, `shadowRoots()`,
`find(predicate)`, `parent()`, `children()`, `ancestors()` gezinme fonksiyonlarını;
`project(kind)` tüketiciye göre daraltılmış aday listesini; `toPageState()` arayüzün
kullandığı sade `PageElement[]` biçimini üretir.

**`DiscoveryEngine.ts`** — Tarama orkestrasyonu.
`scan(options)` çağrıları bir kuyruğa dizilir. `run()` içindeki akış:
1. Transport başlat, çerçeveleri tazele, her oturuma sonda kur.
2. `waitForQuiet()` ile sayfayı durult.
3. **Önbellek imzası** (url + mutasyon sayısı + kaydırma + seviye + profil) değişmediyse
   önceki grafiği `reused: true` işaretiyle döndür.
4. `pass()` ile ilk geçiş; **seviye ≥ 2** ise `lazyPasses()` (kaydırarak tembel yüklenen
   içeriği açar), **seviye ≥ 3** ise `expandPasses()` (menü/akordeon tıklayarak genişletir).
5. `mergeResults()` ile geçişleri birleştir, `assignIndexes()` ile sıra numarası ver.
6. Dinleyici sondası + örtüşme kontrolü uygula, `CoverageSummary` üret.

**Tarama seviyeleri:** `0` hızlı/AX'siz, `1` AX dahil tek geçiş (varsayılan), `2` tembel
yükleme geçişleri, `3` genişletme geçişleri.

**`scheduler.ts`** — `yieldToLoop()`, `chunk()`, `chunkOver()`: uzun döngüleri 8 ms'lik
dilimlere bölüp arayüzün donmasını engeller.

**`types.ts`** — `ScanLevel`, `GraphNode`, `Rect`, `Point`, `ShadowStep`, `AxInfo`,
`BlindSpot`, `Viewport`, `CoverageSummary`, `ScanOptions`, `SCAN_PROFILES`
(`agent` / `record` / `playback` profilleri), `STYLE_KEYS`, `Candidate`, `Projection`.

### 5.5 `src/main/model/` — Kalıcı Eleman Modeli

`ElementGraph` uçucudur; `model` katmanı onu sürümlenmiş, serileştirilebilir bir şemaya
(`elementmodel/2.0.0`) çevirir.

- **`schema.ts`** — `ElementModel`, `FrameModel`, `GraphSnapshot`, `Geometry`,
  `Visibility`, `Accessibility`, `Interactivity`, `FramePath`, `ShadowPath` tipleri;
  `TEST_ATTRIBUTES` listesi (data-testid vb.), metin/öznitelik kırpma sınırları.
- **`serialize.ts`** — `toSnapshot(graph)` ana dönüştürücü; `toElementModel()`,
  `toFrameModel()`, `toBlindSpotModel()` alt dönüştürücüler; `buildIdentity()`,
  `buildFramePath()`, `buildShadowPath()`, `buildGeometry()`, `buildVisibility()`,
  `buildAccessibility()`, `buildInteractivity()`, `rankSiblings()` yardımcıları.
- **`ModelIndex.ts` (277 satır)** — Bir snapshot üzerinde **9 ayrı arama indeksi** kurar:
  ref, ordinal, çerçeve, öznitelik-değer, normalize metin, erişilebilir ad, imza, etiket ve
  128px konum hücresi. Sorgular: `byAttr()`, `byText()`, `byName()`, `bySignatureToken()`,
  `byTag()`, `near(element, radius)`, `query(predicate)`. Gezinme: `parent()`, `children()`,
  `ancestors()`, `siblings()`, `descendants()`, `closestForm()`, `indexInParent()`,
  `typeOrdinal()`, `testAttribute()`.
- **`projection.ts`** — Tüketiciye göre eleman listesini daraltır. `project(index, kind)`
  ve `projectScoped(index, refs)`; `suppressContainers()` iç içe aynı kutuya sahip
  kapsayıcıları eler, `applyBudget()` token bütçesine göre kırpar, `estimateTokens()`
  maliyet tahmini yapar. `PROJECTION_DEFAULTS` üç tüketici için farklı sınırlar tutar.
- **`ModelStore.ts`** — Snapshot deposu. Bellekte son 2 snapshot'ı tutar
  (`MEMORY_WINDOW`), gerisini gzip'lenmiş `.snapshot.json.gz` olarak diske taşır
  (`spill()`), `get()` / `index()` ile geri okur, `prune(maxAgeMs)` eskileri siler.
- **`hash.ts`** — `hash32()` FNV-1a, `token()` kısa string, `digest(parts)` birleşik özet.
- **`migrate.ts`** — Sürüm göçü altyapısı: `registerMigration()`, `migrationPath()`,
  `migrate(raw)`, `isReadable(version)`, `MigrationError`.
- **`validate.ts`** — `validateSnapshot()` bağlantı, geometri ve etkileşim tutarlılığını
  denetler; `assertSnapshot()` hata varsa `ModelValidationError` fırlatır.

### 5.6 `src/main/identity/` — Eleman Kimliği ve Kendini Onarma

Projenin en özgün parçası. Bir elemanı, sayfa yeniden derlendiğinde bile bulabilmek için
**yedi strateji** üretir ve oylama ile karar verir.

**`strategies.ts`** — Strateji zinciri ve ağırlıkları:

| Strateji | Ne yapar |
|---|---|
| `test-attribute` | `data-testid` benzeri öznitelikler — en yüksek ağırlık |
| `element-id` | `id` özniteliği |
| `form-field` | Form içindeki `name` / etiket kombinasyonu |
| `accessible-name` | AX ağacındaki erişilebilir ad + rol |
| `text` | Normalize edilmiş metin içeriği |
| `structure` | Etiket + yapısal yol imzası |
| `neighborhood` | 220px yarıçaptaki komşu elemanların imzası |

Her stratejinin `extract(element, index)` (parmak izi çıkar) ve
`match(payload, index)` (aday bul) metodu vardır. `strategyByKind(kind)` tek strateji döner.

**`dynamic.ts`** — Kararsız değerleri ayıklar: `isVolatileAttribute()`,
`isDynamicValue()` (UUID, hex blob, uzun sayı, framework öneki, CSS-module hash'i,
styled-components sınıfı, Tailwind arbitrary değer kalıpları), `isStableIdentifier()`,
`stableClasses()`, `entropy()`, `normalizeText()`, `isMeaningfulText()`.

**`signature.ts`** — Bağlam imzaları (hepsi `WeakMap` ile memoize edilir):
`structuralPath()` (6 seviye derinlik), `ancestorSignature()` (4 seviye),
`neighborSignature()` (en yakın 4 komşu), `nearestLabel()`, `formSignature()`,
`urlPattern()` (sayısal segmentleri maskeler), `stableAnchor()`, `labelOf()`.

**`DescriptorBuilder.ts`** — `build(ref, index)` / `fromElement(element, index)` ile
`Descriptor` üretir: hedef bilgisi, tüm strateji yükleri, bağlam ve yakalama koşulları.
`scopeOf(descriptor)` geçmiş istatistiklerinin gruplanacağı kapsamı (url kalıbı) verir.

**`Scoring.ts`** — Güven skoru hesabı. Üç bileşen ağırlıklandırılır:
oy payı **%74**, bağlam **%17**, geometri **%9**.
`combine()`, `anchorScore()`, `contextScore()`, `geometryScore()`, `resolveState()`
(`exact` / `low-confidence` / `not-found`), `describeState()`, `qualityOf()`
(`strong` ≥ 0.72, `fair` ≥ 0.48, altı `weak`).

**`Resolver.ts`** — Çözümleme motoru. Tüm stratejileri çalıştırır (`vote()`), adayları
kovalara (`Bucket`) toplar, `rank()` ile sıralar. `pinned()` güçlü stratejilerin tek başına
karar verip veremeyeceğini, `staleNote()` sessiz kalan stratejileri raporlar.
`DescriptorVersionError` desteklenmeyen descriptor sürümünde fırlar.

**`Healing.ts`** — Kendini onarma. `Healer.propose()` çözümleme sonucuna göre yeni bir
descriptor önerir; `decide()` kararı verir:
- güven ≥ **0.7** → `auto` (otomatik uygula),
- 0.4–0.7 arası → `approval` (kullanıcı onayı bekler),
- < **0.4** veya kritik strateji (`test-attribute`/`element-id`) kaybı → `blocked`.
`apply()`, `reject()`, `queue()`, `pendingFor()`, `clear()` kuyruğu yönetir.

**`HistoryStore.ts`** — Strateji başarı geçmişi. Kapsam × strateji bazında isabet oranı
tutar; `DECAY = 0.94` ile eskiyi zayıflatır, `multiplier()` ile 0.55–1.25 arası bir ağırlık
çarpanı üretir. Böylece belirli bir sitede işe yaramayan strateji zamanla geri plana düşer.
`record()`, `stats()`, `reset()`, `flush()` (1.5 sn gecikmeli toplu yazım).

**`DescriptorStore.ts`** — Descriptor kataloğu (`catalog.json`). `load()`, `save()`,
`replace()`, `get()`, `remove()`, `all()`, `byUrlPattern()`, `weak()`, `summaries()`,
`flush()` (1.2 sn gecikmeli). Bozuk dosyayı `quarantine()` ile karantinaya alır ve
`faults()` üzerinden raporlar.

**`IdentityService.ts`** — Modülün dış yüzü. `index(graph)` (WeakMap önbellekli),
`captureByRef()`, `captureByOrdinal()`, `captureFromIndex()`, `resolve()`, `resolveOn()`,
`approve()`, `reject()`, `pendingApprovals()`, `statsFor()`.

### 5.7 `src/main/action/` — Eylem Yürütme

**`types.ts`** — 14 eylem türü (`click`, `double-click`, `right-click`, `hover`, `type`,
`clear-type`, `press-key`, `scroll`, `select-option`, `upload`, `navigate`, `wait`,
`refresh`), 10 hata kodu, `ActionRequest`, `ActionOutcome`, `ActionabilityOptions`
(8 sn zaman aşımı, 60 ms poll), `NavigationOptions`, `NAVIGATION_GRACE`.

**`Coordinates.ts`** — Koordinat dönüşümleri: `docToView()`, `viewToDoc()`, `viewToPage()`,
`pageToView()`, `viewToScreen()`, `centerOf()`, `probePoints()` (merkez tutmazsa denenecek
alternatif noktalar), `insideViewport()`, `scrollDelta()`, `sameRect()`, `clampPoint()`.

**`Actionability.ts`** — Bir elemanın tıklanabilir olup olmadığını sayfa içine enjekte
edilen `PROBE_FN` ile ölçer: görünür mü, etkin mi, konumu sabit mi (animasyon bitti mi),
üstü açık mı. `wait()` koşullar sağlanana kadar bekler, `require()` sağlanmazsa hata
fırlatır, `describe(report)` insan okur bir sebep metni üretir.

**`InputDispatcher.ts`** — İki modda çalışır:
- **`real-input`** — CDP `Input.dispatchMouseEvent` / `dispatchKeyEvent` ile gerçek
  fare ve klavye olayları. `move()`, `click()`, `doubleClick()`, `scroll()`, `typeText()`,
  `press()`.
- **`direct-call`** — Elemanın kendi metodunu çağırır (`CLICK_FN`, `SET_VALUE_FN`,
  `SELECT_FN`, `SCROLL_BY_FN`, `FOCUS_INTO_FN`…). `directClick()`, `directSetValue()`,
  `selectOption()`, `setFiles()`, `readValue()`, `readScrollTop()`.

`NAMED_KEYS` ve `MODIFIER_KEYS` tabloları ile `parseCombo()` (`Ctrl+Shift+A` gibi
kombinasyonlar), `printable()`, `codeOf()`, `isPressableKey()`.

**`NavigationWaiter.ts`** — Eylem sonrası navigasyonu izler. Uçuştaki istekleri sayar
(`inflight`), `EventSource`/`WebSocket`/`Media` gibi akış türlerini ağ boşluğu hesabından
dışlar. `observe()` bir eylemi sarmalayıp `NavigationReport` üretir
(`none` / `document` / `in-document`), `waitForIdle()` ağın durulmasını bekler.

**`DialogManager.ts`** — `Page.javascriptDialogOpening` olaylarını yakalayıp politikaya
göre (`accept` / `dismiss`) yanıtlar; dosya seçici isteklerini (`expectFiles()`,
`awaitChooser()`) ve indirmeleri (`trackStart()`, `trackProgress()`) izler.
`consumeDialogs()` / `consumeDownloads()` biriken kayıtları tüketir.

**`ActionEngine.ts` (600 satır)** — Tüm eylemleri seri bir kuyrukta yürütür.
`execute(request)` girişi; `perform()` içinde:
1. `locate()` — descriptor / ref / ordinal ile hedefi bulur,
2. `actionabilityFor()` — kalan süreye göre hazırlık koşullarını ayarlar,
3. `dispatch()` — türe göre `clickLike()`, `doubleClick()`, `pressOn()`, `scrollOn()`,
   `focusOn()`, `type()`, `select()`, `upload()`, `navigate()`, `scrollPage()`, `refresh()`,
4. `navigationFor()` — eylem türüne özel navigasyon toleransı,
5. `done()` — `ActionOutcome` üretir; diyalog/indirme kayıtlarını iliştirir.

`fallbackToDirect` açıkken gerçek girdi başarısız olursa doğrudan çağrıya düşer.
`directOnly()` ve `fileInput()` bazı eylemleri zorunlu olarak doğrudan çağrıya yönlendirir.

**`errors.ts`** — `ActionError`, `classify(error)` (bilinmeyen hataları kodlanmış hataya
çevirir), `describeCode(code)` (Türkçe açıklama).

### 5.8 `src/main/browser/` — Tarayıcı Denetleyici

**`BrowserController.ts`** — `DiscoveryEngine`, `ActionEngine` ve `Overlay`'i tek bir
yüzeyde birleştirir.
- `attach()` / `start()` / `dispose()` — yaşam döngüsü.
- `scan(level)` — tarama, `PageState` döner.
- `setVision(on)` — sayfa üzerine numaralı kutucuk katmanı çizer/kaldırır.
- `execute(action)` — `AgentAction`'ı (`toRequest()` ile) `ActionRequest`'e çevirip
  yürütür, `report()` ile insan okunur sonuç üretir.
- `dispatch(request)` — ham `ActionRequest` yolu (senaryo oynatma bunu kullanır).
- `scanGraph()` — profil destekli grafik taraması.
- Navigasyon: `back()`, `forward()`, `reload()`, `stop()`, `home(url)`, `canGoBack()`,
  `canGoForward()`, `isLoading()`, `url()`, `title()`.
- `sync()` — 260 ms gecikmeli, tekilleştirilmiş yeniden tarama.
- `setDescriptorResolver()` — kimlik modülüyle bağı kurar.

**`Overlay.ts`** — `aft_overlay` izole dünyasında sayfaya bir `<div>` katmanı enjekte edip
her etkileşimli elemanın üstüne sıra numarasını çizer. `draw(graph)`, `clear(graph)`.
Aynı içerik iki kez çizilmez (`drawn` haritası).

**`InteractionWatcher.ts` (778 satır)** — Kayıt modunun gözü. `aft_record` izole dünyasına
büyük bir IIFE enjekte eder; bu betik `mousedown`, `click`, `dblclick`, `contextmenu`,
`input`, `change`, `keydown`, `wheel`, `scroll` olaylarını dinler, her etkileşim için
elemanın etiketini, özniteliklerini, metnini ve konumunu toplayıp bir kuyruğa yazar.
Ana süreç 500 ms'de bir `drain()` ile kuyruğu boşaltır.
- `start(sink)` / `stop()` — dinlemeyi başlatır/durdurur.
- `install(sessionId)` — her çerçeveye betiği kurar, `Runtime.addBinding` ile geri kanal açar.
- `hydrate()` / `resolve()` — sayfadan gelen kaydı gerçek `backendNodeId`'ye bağlar.
- `mark(highlight)` / `clearMarks()` — kayıt sırasında elemanı vurgular.
- `rememberProbe()` / `claim()` — aynı elemanın tekrar tekrar çözümlenmesini önler.

**`types.ts`** — `PageElement`, `PageState`, `ActionName`, `AgentAction`, `ExecuteResult`,
`FrameInfo`, `ScanReport`, `StageBox`, `PointerSpot`, `DragAxis`, `NavKind`,
`WindowAction`, `BrowserState`, `AppPrefs`. (Bu dosya `tsconfig.web.json` içine dahil
edildiği için renderer da doğrudan bu tipleri kullanır.)

### 5.9 `src/main/record/` — Kayıt Motoru

**`types.ts`** — `RawInteraction` (sayfadan gelen ham olay), `RecordIntent` (normalize
edilmiş niyet), `RecordedStep`, `RecordSession`, `RecordOptions` (`DEFAULT_RECORD`),
`StepAdvice`, `TargetOption`, `RecordNotice`, `RecordHost` arayüzü, `EditRequest`,
`AssertionSpec`, `ScenarioMeta`.

**`Normalizer.ts`** — `normalize(raw, options)` ham olayı `RecordIntent`'e çevirir; kök
etiketleri (`body`, `html`) eler. `needsElement(kind)`, `addressable(element)`,
`sourceKey(raw)` (aynı elemandan gelen olayları eşlemek için anahtar), `labelOf(element)`.

**`NoiseFilter.ts`** — Kaydın gürültüsünü temizleyen kural motoru. `suppress()` şunları yapar:
- Etkileşim sonrası otomatik adres değişimini **düşürür**,
- Ardışık kaydırmaları **birleştirir**,
- Çift tıklamanın öncesindeki tekil tıklamaları **siler**,
- Yazma öncesi odak tıklamasını **siler**, ardışık yazmaları **birleştirir**,
- Açılır liste açma tıklamasını **siler**,
- Dosya seçici tıklamasını **siler**,
- Aynı eleman üzerinde tekrarlanan tıklamayı ve tekrar eden tuşu **düşürür**.

**`Quality.ts`** — Adım kalitesi değerlendirmesi. `assess()` bir hedefin ne kadar sağlam
olduğunu ölçer, `probe()` alternatif stratejileri dener, `alternatives()` kullanıcıya
sunulacak hedef seçeneklerini üretir, `blocked()` / `degraded()` / `plain()` tavsiye
nesneleri döner. `QUERY_SCORES` sorgu türlerine puan verir (test-id en yüksek).

**`StepFactory.ts`** — Adım nesnesi üretimi. `stepId()`, `descriptorTarget()`,
`steadyTarget()`, `build()` (ana adım), `waitStep()` (`waitMs` süresini yazar),
`waitTitle()`, `hoverTitle()`, `assertStep()`, `assertion()`,
`assertionOptions()`, `scrollTitle()`. `KIND_LABELS` ve `ASSERTION_LABELS` Türkçe adım
başlıklarını üretir.

**`Editor.ts`** — Kayıt sonrası düzenleme. `edit(session, request)` tek giriş noktası;
alt işlemler: `remove`, `move`, `retitle`, `retext`, `retarget` (alternatif hedefe geç),
`insertWait` (100 ms – 300 sn arası), `insertAssert`, `retime`, `tolerate`
(hata toleransı bayrağı), `clear`. `renumber()` sıra numaralarını tazeler.

**`Composer.ts`** — `compose(session, meta)` kayıt oturumunu tam bir `Scenario` nesnesine
dönüştürür. `sessionId(url, startedAt)`, `defaultTitle(session)` (URL host'undan başlık).

**`Recorder.ts` (602 satır)** — Kayıt orkestrasyonu.
- `start(overrides)` / `pause()` / `resume()` / `stop()` / `discard()` — oturum yaşam döngüsü.
- `accept(batch)` — watcher'dan gelen ham olay yığınını kuyruğa alır.
- `consume(raw)` — normalize eder, `NoiseFilter`'dan geçirir, `merge()` veya `commit()` eder.
- `commit(session, intent)` — elemanı `locate()` ile bulur, descriptor üretir, kaliteyi
  ölçer, alternatifleri hesaplar ve adımı `append()` eder.
- `warm(delayMs)` — kullanıcı etkileşimi beklerken önden tarama yapıp gecikmeyi düşürür.
- `notice()` / `emit()` — arayüze uyarı ve güncelleme yayınlar.
- `applyEdit()`, `describe(meta)`, `compose(meta)`, `settle()`.

**`fixture.ts`** — `RECORD_PAGE`, `RECORD_FRAME_PAGE`, `RECORD_RESULT_PAGE`: kayıt
doğrulama testlerinin kullandığı gömülü HTML sayfaları (özel eleman `AftKutu` ile shadow
DOM senaryosu dahil).

**`verify.ts` (379 satır)** — `npm run record:verify` ile çalışan uçtan uca kayıt testi.
Fixture sunucusu açar, gerçek bir pencere kurar, olayları tetikler ve `expect()` ile
kontrol listesi üretir; `verdict()` çıkış kodunu belirler.

### 5.10 `src/main/scenario/` — Senaryo ve Oynatma

**`types.ts` (425 satır)** — Tüm senaryo veri modeli:
`Scenario`, `ScenarioStep`, `StepTarget` (4 tür: `descriptor`, `inline-descriptor`,
`query`, `ordinal`), `StepQuery` (5 sorgu türü), `Assertion` (12 doğrulama türü),
`StepCondition` (koşullu adım), `ExpectedState`, `ScenarioDefaults`, `StepResult`,
`RunResult`, `RunMetrics`, `LogEntry`, `PlaybackOptions`, `FailureContext`,
`PlaybackHost` arayüzü.

**`validate.ts` (438 satır)** — `parseScenario()`, `validateScenario()` (hata ve uyarı
listesi üretir), `assertScenario()` (hata varsa `ScenarioError`), `migrate.ts` ile birlikte
sürüm göçünü yönetir.

**`ScenarioStore.ts`** — `.scenario.json` dosyalarının deposu. `load()`, `read()`,
`write()`, `remove()`, `get()`, `all()`, `entries()`.

**`TargetResolver.ts`** — Adım hedefini gerçek elemana bağlar.
`byDescriptor()` (kimlik modülünü kullanır, gerekirse healing tetikler),
`byQuery()` (test-id / id / alan adı / erişilebilir ad / metin ile arar, `nth` desteği),
`byOrdinal()` (sıra numarasıyla — en kırılgan yol). `count()` eşleşen aday sayısını verir.
`matchQuery(query, index)` dışa açık yardımcı.

**`AssertionEngine.ts`** — Doğrulama yürütücüsü. `evaluate(assertion, index, allowLow)`
her doğrulama türünü işler (metin eşitliği/içermesi, görünürlük, etkinlik, öznitelik,
adet, url, başlık…). `matches(value, pattern)` joker karakter desteği sağlar.

**`StateVerifier.ts`** — Adım sonrası sayfa durumunu doğrular.
`expectedFromCapture(descriptor)` kayıt anındaki koşullardan beklenen durumu üretir,
`verifyState()` url kalıbı, başlık, minimum etkileşimli eleman ve maksimum kör nokta
kriterlerini kontrol eder.

**`StepExecutor.ts` (412 satır)** — Tek bir adımın yürütülmesi.
`run(step, order, ctx)`: `retries + 1` kez dener, her denemede `attempt()` çağırır,
başarısızsa `capture()` ile hata bağlam paketi üretir. `condition(step, ctx)` koşullu
adımları değerlendirir (`previous-passed`, `previous-failed`, `assertion-passes`…).
`targeted()` hedefli adımları, `plain()` hedefsiz adımları işler; `graphFor()` gereken
tarama profilini seçer. Yardımcılar: `profileFor()`, `needsElements()`, `absolute()`,
`withTimeout()`.

**`FlowController.ts`** — Adım akışını yönetir. `run()` üst seviye, `sequence()` sıralı
yürütme, `group()` grup adımlarını (iç içe adım listeleri) işler, `skip()` koşulu
sağlanmayanları atlar, `cancel()` iptal bayrağını kaldırır. `select(steps, only)` yalnızca
belirli adımları koşar, `count()` toplam adım sayar, `flatten()` ağacı düzleştirir.

**`AssertionEngine`, `RunLog.ts`** — `RunLog` 5000 girişlik dairesel günlük tutar;
`push()`, `resolution()` (çözümleme izini formatlar), `assertion()`, `state()`.
`renderLog(entries)` metin çıktısı üretir.

**`FailureContext.ts`** — Hata anı paketi. `buildContext(input)` url, başlık, kapsam,
kör noktalar, 400 elemana kadar döküm (`dumpElements()`), çözümleme izi, doğrulama
kayıtları ve ekran görüntüsünü tek nesnede toplar. `ContextStore` bunları
`.context.json.gz` olarak diske yazar; `write()`, `read()`, `list()`, `refs()`,
`prune(retentionMs)`.

**`PlaybackEngine.ts`** — Koşum orkestrasyonu. `run(scenario, overrides, onProgress)`:
senaryoyu doğrular, ayarları birleştirir (`merge()`), `prepare()` ve `preflight()` ile
başlangıç adresini açar, `FlowController`'ı çalıştırır, metrikleri toplar, `RunResult`
üretir ve `reportDir` tanımlıysa rapor yazar. `cancel()`, `last()`, `isRunning()`.

**`Metrics.ts`** — `emptyMetrics()`, `aggregate()` (adım ağacını gezip toplam süre, geçen,
kalan, ortalama güven, faz süreleri), `collectFailures()`, `mean()`, `round()`.

**`Consistency.ts`** — Aynı senaryonun birden çok koşumunu karşılaştırır.
`compareRuns(runs)` adım bazında durum ve güven tutarlılığını ölçer
(`CONFIDENCE_SPREAD_LIMIT = 0.1`), `renderConsistency(report)` tablo üretir.

**`Reporter.ts`** — `renderText(run)` hizalanmış metin raporu,
`writeReport(run, dir)` rapor dosyalarını diske yazar.

**`run.ts` / `verify.ts` / `fixture.ts`** — `npm run playback` ve `npm run playback:verify`
girişleri; `PLAYBACK_PAGE`, `PLAYBACK_SCENARIO` gömülü fixture'ları.

### 5.11 `src/main/data/` — Kalıcı Veri Katmanı

**`driver.ts`** — `node:sqlite` sarmalayıcı. `openDatabase(path)` `DataDriver` döner:
`exec()`, `run()`, hazırlanmış ifade önbelleği (`statement()`), `userVersion()`,
`journalMode()`, `fault()`, `close()`. WAL ve foreign_keys pragmaları uygulanır.
`MEMORY_PATH` (`:memory:`) test için. `DriverError` hata sınıfı.

**`schema.ts`** — `SCHEMA_STATEMENTS` ile tablolar: `scenario_index`, `run`, `run_step`,
`failure_context`, `outbox`. Ham satırları tip güvenli satırlara çeviren
`toRunRow()`, `toStepRow()`, `toContextRow()`; `flag()`/`bool()`/`parseList()` yardımcıları.

**`migrate.ts`** — `registerDataMigration()`, `migrateData(driver)`,
`isReadableData(version)`, `DataMigrationError`. Şema sürümü `DATA_USER_VERSION = 1`.

**`Indexer.ts` (432 satır)** — Koşum sonuçlarını veritabanına yazar ve sorgular.
- `recordRun(run, input)` — koşumu, tüm adımları (`collect()` ile ağacı düzleştirerek) ve
  hata bağlamlarını tek işlemde yazar.
- `upsertScenario()`, `rebuildScenarioIndex()`, `removeScenario()`, `scenarios()`.
- `runs(query)`, `runCount()`, `run(id)`, `steps(runId)`, `contexts(runId)`,
  `detail(runId)`, `removeRun(id)`.
- `fragile(limit)` — `FRAGILE_STEPS` sorgusuyla en sık başarısız / en düşük güvenli
  adımları çıkarır (kırılgan adım raporu).
- `health()` — `HEALTH_SUMMARY` ile genel sağlık özeti.
- `reconcile(present)` — diskteki bağlam dosyalarıyla veritabanını eşitler.
- `counts()` — tablo başına satır sayısı.

**`Outbox.ts`** — Dış sisteme gönderim kuyruğu. `enqueue()`, `claim(limit)`,
`markSending()`, `markSent()`, `markFailed()`, `summary()`, `flush(limit)`.
`backoffFor(attempts)` üstel geri çekilme üretir (30 sn adım, 1 saat tavan,
`MAX_ATTEMPTS = 8`). `NullTransport` varsayılan boş taşıyıcıdır.

**`Retention.ts`** — `sweep(policy)` süresi dolmuş koşumları ve dosyalarını temizler
(`expired()`, `dropFiles()`).

**`DataStore.ts`** — Sürücü, şema ve göçü tek nesnede toplar; `stats()` genel sayıları,
`migration()` göç sonucunu döner.

**`verify.ts`** — `npm run data:verify` ile çalışan veri katmanı doğrulaması.

### 5.12 `src/main/regression/` — Regresyon Havuzu

Keşif motorunun kalitesini ölçmek için **27 donmuş fixture sayfası** üzerinden koşan bir
ölçüm çerçevesi.

**`pool.ts`** — `POOL` sabiti; yedi kategoride vakalar:
`classic-html` (portal, haber, doküman, tablo, eski yerleşim), `spa` (dashboard, ticaret,
kanban, router, modal, lazy), `shadow-dom` (açık/iç içe/kapalı/form), `nested-iframe`
(tek/üç seviye/çapraz kaynak/ödeme), `virtual-list` (grid, feed, tree, log),
`multi-step-form` (sihirbaz, doğrulama, yükleme, koşullu alanlar).
`caseById()`, `casesByKind()`, `poolCoverage()`.

**`FixtureServer.ts`** — Yerel statik HTTP sunucusu; `safeJoin()` ile dizin taşması
(path traversal) engellenir.

**`ElectronHarness.ts`** — Gerçek `WebContentsView` üzerinde `goto()`, `scan()`, `reset()`
sağlayan koşum ortamı; `withTimeout()` ile takılmaları keser.

**`CaseRunner.ts`** — Tek vakayı ölçer: `measure()` tarama metriklerini toplar,
`applyCoverage()` kapsam sayılarını işler, `capture()` örnek descriptor'lar üretir,
`resolveAll()` bunları yeniden çözümleyip kimlik doğruluğunu ölçer, `check()` beklentileri
karşılaştırır.

**`Metrics.ts`** — `isFalsePositive(element)` (çok küçük/anlamsız elemanlar),
`countFalsePositives()`, `ratio()`, `mean()`, `percentile()`, `aggregate()`.

**`PoolRunner.ts`** — Tüm havuzu koşar, ilerleme geri çağrısı yayınlar,
`BaselineStore` ile karşılaştırır.

**`BaselineStore.ts`** — Referans ölçüm dosyası. `write()` yeni baseline yazar,
`compare(results, maxDelta)` gerilemeleri tespit eder. Sayım metriklerinde **%5**, süre
metriklerinde **%35** tolerans uygulanır.

**`Reporter.ts`** — `renderText(run)` ve `writeReport(run, dir)`.

**`run.ts` / `smoke.ts` / `repeat-verify.ts`** — Sırasıyla `npm run regression`,
`npm run smoke` ve `npm run repeat:verify` girişleri. `repeat-verify` aynı sayfanın iki
sürümü arasında descriptor'ların hâlâ doğru elemanı bulup bulmadığını sınar.

### 5.13 `src/main/bridge/` — IPC Köprüsü

Her alan için bir kanal sınıfı; hepsi aynı deseni izler: `register()` IPC işleyicilerini
kurar, `guard()` her çağrıyı `ChannelResult<T>` (`{ ok, message, data }`) biçimine sarar,
`dispose()` işleyicileri kaldırır.

| Dosya | Sorumluluk |
|---|---|
| `IdentityChannel.ts` | 10 kanal: yakalama, çözümleme, projeksiyon, doğrulama, katalog, onaylar, istatistik. `lookup(descriptorId)` `ActionEngine`'e descriptor çözücü sağlar. 7 günlük snapshot saklama. |
| `PlaybackChannel.ts` | 10 kanal: senaryo CRUD, koşum, iptal, son sonuç, bağlam listesi. Koşum bitince `index()` ile veritabanına yazar. 14 günlük bağlam saklama. |
| `DataChannel.ts` | 11 kanal: koşum listesi/detayı, rapor, senaryo indeksi, sağlık, kırılgan adımlar, outbox, flush, reconcile, sweep, istatistik. `syncScenarios()` disk ile indeksi eşitler. |
| `RecordChannel.ts` | 10 kanal: başlat/durdur/duraklat/sürdür/durum/düzenle/açıkla/ayar/kaydet/at. `view(session)` oturumu arayüzün beklediği `RecordView`'a çevirir; 120 ms debounce ile güncelleme yayınlar. |
| `PlaybackAdapter.ts` | `BrowserController`'ı `PlaybackHost` arayüzüne uyarlar (`prepare`, `execute`, `scan`, `screenshot`, `protocolCalls`). |
| `RecordAdapter.ts` | `BrowserController` + `InteractionWatcher`'ı `RecordHost` arayüzüne uyarlar; navigasyon olaylarını da ham etkileşim olarak üretir. |
| `mount*.ts` | `mountIdentity`, `mountPlayback`, `mountData`, `mountRecord` ve karşıt `unmount*` fonksiyonları; tekil (singleton) kanal örneklerini yönetir. |
| `types.ts`, `playback-types.ts`, `data-types.ts`, `record-types.ts` | Kanal adları ve yük (payload) tipleri. Son ikisi renderer tarafından da import edilir. |

### 5.14 `src/main/verify.ts` — Uçtan Uca Doğrulama

`npm run verify` ile çalışır. Geçici bir `userData` dizini oluşturur, fixture sunucusu
açar, gerçek pencere kurar, tüm köprüleri mount eder ve kayıt → kaydetme → oynatma →
raporlama zincirini baştan sona sınar. Sonuçları `GECTI` / `KALDI` satırları olarak yazar
ve çıkış kodu üretir.

---

## 6. Preload Katmanı — `src/preload/`

Dört ayrı API yüzeyi `contextBridge` ile renderer'a açılır. Her `.ts` dosyasının yanında
karşılık gelen bir `.d.ts` global tip bildirimi vardır.

| Global | Dosya | İçerik |
|---|---|---|
| `window.aft` | `index.ts` | `execute`, `setVision`, `scan`, `coverage`, `nav`, `window`, `setChat`, `setTerminal`, `startDrag`, `endDrag`, `setStage`, `setModal`, `setStageShown`, `setSettings`, `publishPrefs`, `patchPrefs`, `setChrome`, `requestState` + olay abonelikleri: `onState`, `onFocusUrl`, `onFocusTerminal`, `onPointer`, `onPrefs`, `onPrefsPatch`, `onDragEnd` |
| `window.aftIdentity` | `identity.ts` | `capture`, `resolve`, `project`, `validate`, `list`, `remove`, `approvals`, `approve`, `reject`, `stats` |
| `window.aftPlayback` | `playback.ts` | `list`, `get`, `save`, `remove`, `validate`, `run`, `cancel`, `last`, `contexts`, `context`, `onProgress` |
| `window.aftRecord` | `record.ts` | `start`, `stop`, `pause`, `resume`, `state`, `edit`, `describe`, `options`, `save`, `discard`, `onUpdate`, `onNotice` |
| `window.aftData` | `data.ts` | `runs`, `run`, `report`, `scenarios`, `health`, `fragile`, `outbox`, `flush`, `reconcile`, `sweep`, `stats` |

Tüm abonelik fonksiyonları, aboneliği kaldıran bir fonksiyon döner — React `useEffect`
temizliği ile doğrudan uyumlu.

---

## 7. Renderer — React Arayüzü

### 7.1 `main.tsx`

Giriş noktası. `?view=settings` sorgusu varsa `SettingsWindow`, aksi halde `App` bileşenini
mount eder.

### 7.2 `App.tsx` (767 satır) — Uygulama Kabuğu

Altı sayfalı bir kabuk yönetir: `browser`, `scenarios`, `results`, `identity`, `coverage`,
`data`. Sol tarafta ikon rayı, üstte başlık çubuğu + adres kutusu, altta durum çubuğu.

**Kalıcılık yardımcıları** — `readSize()`/`storeSize()`, `readFlag()`/`storeFlag()`,
`readPage()`, `readDock()`: panel boyutları, açık sayfa ve dock sekmesi `localStorage`'da
saklanır. `sameBox()` gereksiz sahne bildirimi engeller, `part(value, total)` oransal
değer üretir.

**Önemli state'ler** — `state` (main'den gelen `BrowserState`), `page`, `listOpen`,
`drag`, `urlFocused`/`urlDraft`, `recording`, `playing`, `library` (kütüphane revizyonu —
alt bileşenleri tazelemek için sayaç), `runRequest`, `theme`, `autoTerm`/`autoBack`,
panel boyutları, `space` (ölçülen çalışma alanı), `stageEl`.

**Kritik fonksiyonlar**

| Fonksiyon | Görevi |
|---|---|
| `reportStage()` | Sahne `div`'inin ekrandaki oransal kutusunu ölçüp main'e bildirir; `ResizeObserver` ile bağlanır |
| `report(entry)` | Alt sayfalardan gelen bildirimleri terminale yazar |
| `runAction(action)` | `window.aft.execute()` çağırır, sonucu konsola aktarır |
| `toggleVision()` | Görüş katmanını açıp kapatır, iyimser güncelleme yapar |
| `onUrlFocus/Blur/KeyDown` | Adres çubuğu davranışı; `Enter` ile `go_to_url` |
| `beginDrag(axis, event)` | Panel sürüklemeyi başlatır (chat / terminal / record eksenleri) |
| `onPlayBusy(running)` | Koşum başlayınca terminali otomatik açar, bitince tercihe göre kapatır |
| `pick(item)` | Ray tıklamasını sayfa veya dock geçişine çevirir |
| `requestRun(scenarioId)` | Senaryolar sayfasından koşum isteğini oynatma paneline taşır |
| `status` | Durum rozetini hesaplar: kayıtta / koşumda / yükleniyor / hazır |

### 7.3 `SettingsWindow.tsx`

Ayrı pencerede açılan ayar paneli: tema seçimi, otomatik terminal davranışı ve kısayol
listesi (`SHORTCUTS`). Değişiklikleri `window.aft.patchPrefs()` ile ana arayüze yollar.

### 7.4 Sayfalar — `src/renderer/src/pages/`

**`BrowserPage.tsx`** — Ana çalışma alanı düzeni. Solda `ElementList`, ortada `stage`
(main'in `targetView`'i buraya oturur), altta `Console`, sağda iki sekmeli dock:
`RecordPanel` ve `RunPanel`. Panel sürükleme tutamaçlarını bağlar.

**`ScenarioPage.tsx` (725 satır)** — Senaryo düzenleyici.
- `blankStep(kind, title)` / `blankScenario(baseUrl)` — boş şablonlar.
- `mapSteps()`, `flatSteps()`, `dropStep()`, `shiftStep()` — iç içe adım ağacında
  değişiklik yapan saf yardımcılar.
- Sol sütun senaryo listesi, orta sütun adım listesi, sağ sütun seçili adımın tüm
  ayarları (hedef, zaman aşımı, yeniden deneme, tarama seviyesi, girdi modu, koşul,
  beklenen durum).
- `window.aftPlayback.validate()` ile canlı doğrulama, `save()` / `remove()` ile kalıcılık.

**`ResultPage.tsx` (386 satır)** — Koşum geçmişi. Sayfalı liste (40'lık),
duruma ve senaryoya göre filtre. Seçili koşum için üç sekme: `steps` (adım ağacı),
`contexts` (hata bağlam paketleri, `ContextView` ile), `report` (metin rapor).
Metrik şeridi: adım, geçen, kalan, güven, süre, tarama, kesin eşleşme.

**`IdentityPage.tsx` (437 satır)** — Kimlik sağlığı. Dört sekme:
- `fragile` — en kırılgan adımlar (veritabanı sorgusundan),
- `catalog` — descriptor kataloğu, kalite kademesi rozetiyle; silme ve istatistik,
- `approvals` — onay bekleyen healing önerileri; onayla / reddet,
- `strategies` — kapsam bazında strateji isabet oranları (`Bar` bileşeniyle).
Ayrıca `validate()` ile model doğrulama raporu gösterilir.

**`CoveragePage.tsx`** — Son taramanın kapsam raporu. Seviye seçici (0–3) ve yeniden
tarama düğmesi. Metrikler: düğüm, eleman, etkileşilebilir, görünen alan, shadow kök,
çerçeve, kör nokta, geçiş, süre. İki tablo: erişilemeyen bölgeler ve çerçeve listesi.
Altta şema sürümü, görünüm boyutu, örtüşme ve dinleyici sonda oranları.

**`DataPage.tsx`** — Veri katmanı yönetimi. Metrikler (senaryo, koşum, adım, bağlam,
kuyruk) ve outbox özeti. Üç işlem düğmesi: `flush` (kuyruğu gönder, 50'lik),
`reconcile` (disk ↔ veritabanı eşitle), `sweep` (saklama politikasını uygula).
Senaryo indeksi tablosu ve depo bilgisi.

### 7.5 Parçalar — `src/renderer/src/parts/`

**`Console.tsx` (300 satır)** — Komut terminali. `useConsole` hook'unu tüketir, komut
tamamlama önerileri gösterir (`MAX_SUGGESTIONS = 6`), yukarı/aşağı ok ile geçmişte gezinir,
alta sabitlenmiş kaydırma (`PIN_SLACK = 48`) uygular. `LogRow` tek satırı çizer;
satır türleri: `in` (girdi), `ok`, `err`, `note`.

**`ElementList.tsx`** — Taranan elemanların filtrelenebilir listesi. Her satır tıklandığında
ilgili eyleme dönüşür; numara, etiket, tür, ad ve metin üzerinden arama yapar.

**`RunPanel.tsx` (326 satır)** — Oynatma paneli. Senaryo seçimi, koşum ayarları
(tarama seviyesi, hata anında ekran görüntüsü, düşük güvene izin, hata sonrası devam),
canlı ilerleme (`onProgress` aboneliği), adım listesi ve koşum sonrası metrikler.
`openContext(id)` hata bağlamını açar. `flatten()` iç içe adım sonuçlarını düzleştirir.

**`ContextView.tsx` (254 satır)** — Hata bağlam paketi görüntüleyici. Altı sekme:
`trace` (strateji izi), `candidates` (aday elemanlar ve puanları), `assertions`
(doğrulama sonuçları), `blind` (kör noktalar), `elements` (sayfa eleman dökümü, filtreli),
`shot` (ekran görüntüsü — yalnızca varsa görünür).

**`ShotView.tsx`** — Base64 ekran görüntüsünü yakınlaştırma desteğiyle gösterir.

**`RecordPanel.tsx` (639 satır)** — Kayıt paneli.
- Üst çubuk: başlat / duraklat / sürdür / durdur / at, kayıt vurgusu ve kaydırma
  yakalama anahtarları.
- `StepRow` — her adım için satır: başlık düzenleme, değer düzenleme, hedef seçimi
  (alternatif hedefler arasından), bekleme ekleme (`WAIT_PRESETS = [500, 1000, 3000]`),
  doğrulama ekleme, hata toleransı, yukarı/aşağı taşıma, silme.
- Alt çubuk: senaryo başlığı ve "senaryo olarak kaydet" / "tüm adımları sil".
- `window.aftRecord.onUpdate` ve `onNotice` aboneliğiyle canlı güncellenir.

### 7.6 Ortak Katman

**`ui.tsx`** — Tasarım sistemi bileşenleri: `PageHead`, `Pill`, `Metric`, `Card`, `Empty`,
`Bar`, `Field`, `Toggle`, `TextButton`, `Segmented`. Hepsi `memo` ile sarılıdır. `Tone`
tipi beş renk tonu tanımlar: `ok`, `warn`, `bad`, `flat`, `accent`.

**`icons.tsx` (364 satır)** — `GLYPHS` sözlüğünde 44 satır içi SVG ikon. `Glyph` tek
ikonu, `IconButton` ikon düğmesini (başlık, aktif/pasif, rozet, tehlike varyantı) çizer.

**`themes.ts`** — Dört tema: `grafit`, `gece`, `kagit`, `orman`. `paintTheme(id)` CSS
değişkenlerini `document.documentElement` üzerine yazar, `readTheme()`/`storeTheme()`
`localStorage` ile kalıcılık sağlar, `themeOf(id)` tema nesnesini döner.

**`format.ts`** — Biçimlendirme yardımcıları: `formatMs`, `formatDate`, `formatShortDate`,
`formatClock`, `formatBytes`, `percent`, `ratio`, `shortUrl`, `hostOf`, `toUrl`, `clamp`.

**`commands.ts`** — Terminal komut paleti. 15 eylem komutu:

| Komut | Kullanım | İşlev |
|---|---|---|
| `go` | `go <adres>` | Adrese gider |
| `click` | `click <no>` | Öğeye tıklar |
| `dbclick` | `dbclick <no>` | Çift tıklar |
| `rclick` | `rclick <no>` | Sağ tıklar |
| `type` | `type <no> <metin>` | Alana metin yazar |
| `clear` | `clear <no>` | Alanı temizler |
| `move` | `move <no> [ms]` | İmleci üzerine taşır, verilen süre bekletir |
| `scroll` | `scroll <piksel>` | Sayfayı kaydırır |
| `snap` | `snap` | Yeniden tarar |
| `press` | `press [no] <tuş>` | Tuşa basar |
| `sel` | `sel <no> <değer>` | Açılır listeden seçer |
| `upload` | `upload <no> <dosya...>` | Dosya yükler |
| `wait` | `wait [ms]` | Verilen süre bekler, sayfanın durulmasını gözler |
| `r` | `r` | Sayfayı yeniler |

Ek olarak iki yerleşik komut: `a` (komut listesi) ve `c` (terminali temizle).

**`useConsole.ts`** — Terminal durum yönetimi hook'u. `submit(input)` girdiyi ayrıştırır,
`ACTION_MAP`'ten komutu bulur, `build(args)` ile `AgentAction` üretir ve çalıştırır.
`readOutcome(result)` `ActionOutcome`'u okunabilir ayrıntıya çevirir (hazırlık raporu:
görünür / etkin / kararlı / üstü açık; diyalog ve indirme kayıtları). En fazla 400 satır
(`MAX_LINES`) ve 100 komutluk geçmiş tutar.

**`report.ts`** — Sayfalar arası ortak bildirim tipi (`Report`, `ReportLevel`).

**`assets/base.css`, `assets/main.css`** — Tüm görsel stil; CSS değişkenleri üzerinden
tema desteği.

---

## 8. IPC Kanal Tablosu

| Ön ek | Kanal sayısı | Tür | Sorumlu sınıf |
|---|---|---|---|
| `aft:` (execute, scan, coverage, vision…) | 17 | invoke + send | `main/index.ts` |
| `aft:identity:*` | 10 | invoke | `IdentityChannel` |
| `aft:playback:*` | 10 | invoke | `PlaybackChannel` |
| `aft:record:*` | 10 | invoke | `RecordChannel` |
| `aft:data:*` | 11 | invoke | `DataChannel` |

Main → renderer olayları: `aft:state`, `aft:focus-url`, `aft:focus-terminal`,
`aft:pointer`, `aft:drag-end`, `aft:prefs`, `aft:prefs-patch`,
`aft:playback:progress`, `aft:record:update`, `aft:record:notice`.

---

## 9. Diskteki Veri Düzeni

`app.getPath('userData')` altında:

```
userData/
├── identity/
│   ├── catalog.json          → Descriptor kataloğu
│   ├── history.json          → Strateji başarı geçmişi
│   └── snapshots/            → *.snapshot.json.gz (7 gün saklanır)
├── scenarios/                → *.scenario.json
├── playback/
│   ├── reports/              → Metin koşum raporları
│   └── contexts/             → *.context.json.gz (14 gün saklanır)
└── data/
    └── aft.db                → SQLite (WAL): scenario_index, run,
                                run_step, failure_context, outbox
```

Tüm JSON yazımları `writeFileAtomic()` üzerinden atomiktir; bozuk dosyalar silinmez,
`quarantine()` ile zaman damgalı bir ada taşınır.

---

## 10. Komutlar

```bash
npm install              # Bağımlılıklar
npm run dev              # Geliştirme (electron-vite dev)
npm run build            # typecheck + derleme
npm run build:win        # Windows kurulumu (NSIS)
npm run build:mac        # macOS (dmg)
npm run build:linux      # Linux (AppImage, snap, deb)

npm run lint             # ESLint
npm run format           # Prettier
npm run typecheck        # node + web tsconfig birlikte

npm run verify           # Uçtan uca doğrulama (kayıt → oynatma zinciri)
npm run record:verify    # Kayıt motoru doğrulaması
npm run playback:verify  # Oynatma doğrulaması
npm run data:verify      # Veri katmanı doğrulaması
npm run smoke            # Hızlı duman testi
npm run regression       # Tam regresyon havuzu (27 vaka)
npm run repeat:verify    # Sayfa sürümleri arası descriptor kararlılığı
```

`electron.vite.config.ts` dokuz ayrı main giriş noktası üretir: `index`, `regression`,
`smoke`, `repeat-verify`, `playback`, `playback-verify`, `record-verify`, `verify`,
`data-verify`. Her doğrulama betiği bağımsız bir Electron süreci olarak çalışır.

---

## 11. Kod İstatistikleri

| Bölüm | Yaklaşık satır |
|---|---|
| `src/main/` (toplam) | ~22.000 |
| `src/renderer/` | ~4.000 |
| `src/preload/` | ~400 |
| **Toplam TS/TSX** | **~28.300** |

En büyük dosyalar: `InteractionWatcher.ts` (778), `App.tsx` (767), `main/index.ts` (759),
`ScenarioPage.tsx` (725), `RecordPanel.tsx` (639), `Recorder.ts` (602),
`ActionEngine.ts` (600), `home/page.ts` (579).

---

## 12. Tasarım Gözlemleri

**Güçlü yanlar**

- **Bağımlılık disiplini.** Üretimde yalnızca üç paket var; SQLite için harici modül yerine
  Node'un yerleşik `node:sqlite`'ı kullanılmış. Otomasyon için Puppeteer/Playwright yerine
  doğrudan CDP kullanılması, paket boyutunu ve sürüm bağımlılığını ciddi ölçüde düşürüyor.
- **Katman ayrımı net.** `discovery` → `model` → `identity` → `action` zinciri tek yönlü;
  her katmanın kendi `types.ts` ve `index.ts` barrel dosyası var.
- **Sürümleme her yerde.** `elementgraph/1.0.0`, `elementmodel/2.0.0`, `descriptor/1.0.0`,
  `scenario/1.0.0`, `playbackrun/1.0.0`, `failurecontext/1.0.0`, `record/1.0.0`,
  `regression/1.0.0`, `aftdata/1.0.0` — hepsinin göç altyapısı hazır.
- **Ölçülebilirlik.** Protokol çağrısı, faz süreleri, güven ortalaması, kapsam sayıları;
  hepsi koşum sonucunda kayıtlı. Regresyon havuzu + baseline karşılaştırması motorun
  kalitesini niceliksel takip ediyor.
- **Olay döngüsü nezaketi.** `chunk`/`chunkOver`/`yieldToLoop` ile uzun işlemler dilimlenmiş;
  `setImmediate` debounce'ları arayüzü akıcı tutuyor.

**Dikkat edilmesi gereken noktalar**

- `package.json` içindeki üst düzey alanlar (`name: "desktop"`, `author: "example.com"`,
  `homepage`, `description`) ve `electron-builder.yml` içindeki `appId: com.electron.app`,
  `publish.url: https://example.com/auto-updates` hâlâ şablon değerlerinde. Paketleme
  öncesi güncellenmeli.
- `README.md` electron-vite şablonundan kalma; projenin gerçek amacını anlatmıyor.
- `migrate.ts` dosyalarındaki `STEPS` dizileri boş — göç altyapısı hazır ama henüz
  kayıtlı bir adım yok. İlk şema değişikliğinde doldurulması gerekecek.
- Otomatik test yok; doğrulama tamamen `verify` / `smoke` / `regression` betiklerine
  dayanıyor. Bunlar gerçek Electron süreci gerektirdiği için CI'da headless çalıştırma
  yapılandırması gerekebilir.
- `home/page.ts` içindeki 579 satırlık HTML string'i ayrı bir varlık dosyasına taşınırsa
  bakımı kolaylaşır.

---

*Bu belge, depodaki kaynak kodun tamamı incelenerek hazırlanmıştır.*
