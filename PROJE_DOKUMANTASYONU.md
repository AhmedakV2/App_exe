# AFT — Proje Dokümantasyonu

Bu belge depodaki kaynak kodun tamamını dosya dosya anlatır: hangi modülde hangi sınıf ve
fonksiyon ne yapar, katmanlar birbirine nasıl bağlanır, veri diskte nasıl durur. Kod tabanı
`Aft/src` altında **175 dosyada ~32.600 satır** TypeScript/TSX içerir.

---

## 1. Genel Bakış

**AFT**, Electron üzerine kurulu bir **web otomasyon ve test stüdyosu**dur. Uygulama kendi
içinde bir tarayıcı görünümü barındırır ve o görünümde açılan sayfa üzerinde altı işi yapar:

1. **Keşif (Discovery)** — Chrome DevTools Protocol (CDP) ile DOM ağacını, iframe'leri,
   shadow DOM köklerini ve erişilebilirlik (AX) verisini tarayıp bir `ElementGraph` çıkarır.
2. **Kimlik (Identity)** — Her elemana, sayfa yeniden derlense bile tekrar bulunabilmesini
   sağlayan çok stratejili bir "descriptor" üretir; kırılan seçicileri onarır (self-healing).
3. **Kayıt (Record)** — Kullanıcının sayfadaki gerçek etkileşimlerini dinler, gürültüyü
   temizler ve çalıştırılabilir senaryo adımlarına dönüştürür.
4. **Oynatma (Playback)** — Senaryoyu adım adım koşar, doğrulamaları işletir, hata anında
   bağlam paketi ve ekran görüntüsü toplar.
5. **Veri (Data)** — Koşum sonuçlarını yerel SQLite veritabanına yazar, sağlık metrikleri
   üretir, dış sisteme gönderim için bir outbox kuyruğu işletir.
6. **Regresyon (Regression)** — Donmuş fixture sayfalarından oluşan bir havuz üzerinde keşif
   motorunun kalitesini ölçer ve baseline ile karşılaştırır.

Arayüz dili Türkçedir; kod içindeki kullanıcıya görünen metinler, komutlar ve etiketler de
Türkçe yazılmıştır. Kaynak kodda yorum satırı bulunmaz; isimlendirme açıklayıcı tutulur.

---

## 2. Teknoloji Yığını

| Katman | Teknoloji |
|---|---|
| Masaüstü kabuk | Electron 39 (`BaseWindow` + iki `WebContentsView`) |
| Derleme | electron-vite 5, Vite 7, electron-builder 26 |
| Dil | TypeScript 5.9 (üç tsconfig: root / node / web) |
| Arayüz | React 19 + saf CSS (harici UI kütüphanesi yok) |
| Veritabanı | `node:sqlite` (`DatabaseSync`) — harici bağımlılık yok |
| Otomasyon | Chrome DevTools Protocol, `webContents.debugger` üzerinden |
| Lint / Format | ESLint 9 (electron-toolkit config), Prettier 3 |

Üretim bağımlılıkları yalnızca dört paket: `@electron-toolkit/preload`,
`@electron-toolkit/utils`, `@fontsource-variable/inter`, `electron-updater`. Kalan her şey
devDependency. Otomasyon için Puppeteer/Playwright kullanılmaz; CDP doğrudan sürülür.

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
│  index.ts    ← pencere kabuğu, kısayollar, IPC kökü               │
│  shell/      ← saf yerleşim geometrisi ve preload yolu            │
│  bridge/     ← IPC kanalları (identity, playback, data, record)   │
│  browser/    ← BrowserController: keşif + eylem orkestrasyonu     │
│  discovery/  ← Transport, DiscoveryEngine, ElementGraph           │
│  model/      ← Snapshot şeması, ModelIndex, projeksiyon           │
│  identity/   ← Descriptor üretimi, strateji zinciri, healing      │
│  action/     ← ActionEngine, actionability, girdi, navigasyon     │
│  record/     ← Recorder, NoiseFilter, StepFactory, Editor         │
│  scenario/   ← PlaybackEngine, StepExecutor, AssertionEngine      │
│  data/       ← SQLite şeması, Indexer, Outbox, Retention          │
│  regression/ ← Fixture havuzu, harness, baseline                  │
│  home/       ← aft://home/ özel şeması ve ana sayfa               │
│  harness.ts  ← doğrulama betiklerinin ortak kabuğu                │
└───────────────────────────────────────────────────────────────────┘
```

**Katman yönü tek yönlüdür:** `discovery` → `model` → `identity` → `action`. `record` ve
`scenario` bu zincirin üstünde durur, `bridge` hepsini IPC'ye açar.

**Tipik akış:** Renderer bir eylem gönderir → `preload` üzerinden IPC →
`BrowserController.execute()` → `DiscoveryEngine.scan()` ile taze `ElementGraph` →
`IdentityService` ile hedef çözümleme → `ActionEngine.execute()` ile CDP eylemi →
`ActionOutcome` geri döner → arayüz konsolu ve öğe listesi güncellenir.

---

## 4. Dizin Haritası

```
App_exe/
├── .gitattributes, .idea/            → IDE ve git ayarları
├── PROJE_DOKUMANTASYONU.md           → Bu belge
└── Aft/                              → Uygulamanın kökü
    ├── package.json                  → build, verify ve regresyon betikleri
    ├── electron.vite.config.ts       → 9 ayrı main giriş noktası
    ├── electron-builder.yml          → win/mac/linux paketleme
    ├── tsconfig{,.node,.web}.json    → Proje referanslı üçlü yapı
    ├── eslint.config.mjs, .prettierrc.yaml
    ├── build/, resources/            → İkonlar, mac entitlements
    ├── scenarios/ornek.scenario.json → Örnek senaryo dosyası
    └── src/
        ├── main/                     → Electron ana süreç (~22.400 satır, 125 dosya)
        ├── preload/                  → contextBridge API yüzeyleri (365 satır)
        └── renderer/                 → React arayüzü (~9.900 satır, 40 dosya)
```

---

## 5. Main Process — Modül Modül

### 5.1 `src/main/index.ts` (873 satır) — Uygulama Kabuğu

Uygulamanın giriş noktası. Çerçevesiz (`frame: false`) bir `BaseWindow` açar ve içine iki
`WebContentsView` yerleştirir: `chatView` (React arayüzü) ve `targetView` (otomasyon hedefi).
İsteğe bağlı üçüncü bir görünüm (`devtoolsView`) inceleme paneli için eklenir.

**Yerleşim**

| Fonksiyon | Görevi |
|---|---|
| `layout()` | `chatView`'i tüm alana, `targetView`'i sahne kutusuna oturtur; inceleme paneli açıksa `splitStage()` ile ikiye böler |
| `setStage(value)` | Renderer'ın bildirdiği oransal kutuyu doğrular, gerçekten değiştiyse yerleşimi tetikler |
| `applyStageVisible()` | Modal açıkken veya sahne gizliyken hedef görünümü kapatır |
| `setModal(open)` / `setStageShown(open)` | Sahne görünürlüğünü yöneten iki bağımsız anahtar |
| `setChrome(color)` | `#rrggbb` doğrulaması yapıp pencere arka planını boyar |
| `scheduleLayout()` / `pushState()` | `setImmediate` ile tekilleştirilmiş yerleşim ve durum yayını |
| `snapshotState()` | `BrowserState` üretir: url, başlık, geri/ileri, yükleniyor, panel durumları |

Saf geometri hesapları bu dosyada değil, `shell/geometry.ts` içindedir (bkz. 5.2).

**İnceleme paneli** — `openDevtools()` ayrı bir `WebContentsView` açıp
`setDevToolsWebContents()` ile hedefe bağlar, `closeDevtools()` söker,
`setDevtoolsSplit(value)` bölme oranını 0.15–0.80 aralığında tutar.

**Odak ve panel yönetimi** — `focusChat()`, `focusTerminal()`, `focusTerminalOnLoad()`
sayfa yüklendiğinde odağı terminale döndürür, kullanıcı sayfa içinde tıklamışsa (`pageHold`)
müdahale etmez. `setChat(open)`, `setTerminal(open, focus)` panelleri açar/kapar.

**Ayarlar penceresi** — `openSettings()` ikinci bir `BrowserWindow` açar (`?view=settings`
sorgusuyla aynı React paketini yükler), konum ve boyutu `settingsSpot` / `settingsSize`
içinde hatırlar. `closeSettings()`, `setSettings(open)`, `settingsAlive()` yardımcıdır.

**Açılış ekranı** — `openSplash()` markalı bir açılış penceresi gösterir; `reveal()` ana
pencere hazır olduğunda (en az `SPLASH_MIN_MS`, en çok `SPLASH_MAX_MS`) geçiş yapar.

**Tercih senkronizasyonu** — `publishPrefs(value)` renderer'dan gelen tema ve otomatik
terminal tercihlerini alır, ayarlar penceresine iletir, `setHomeTheme()` ile ana sayfa
temasını değiştirip `repaintHome()` çağırır. `patchPrefs(patch)` ters yönde çalışır.

**Panel sürükleme** — `startDrag(axis)` 16 ms'lik bir `setInterval` başlatır; `sendPointer()`
her tikte gerçek imleç konumunu oransal olarak renderer'a yollar. Böylece panel yeniden
boyutlandırma, `targetView` fare olaylarını yutsa bile çalışır. `stopDrag()` 30 sn güvenlik
sınırı, pencere blur'u veya `mouseUp` ile devreye girer.

**Kısayollar** — `bindShortcuts(wc)`: `F11` tam ekran, `F12` inceleme, `Ctrl+K` / `Alt+F12`
terminal, `Ctrl+P` komut paleti, `Ctrl+L` adres çubuğu odağı, `Ctrl+H` kayıtta imleç
adımlarını açar/kapatır. Hem uygulama arayüzüne hem de kaydedilen sayfaya bağlandığı için
odak nerede olursa olsun çalışır.

**Olay bağlama** — `bindPageFocus()`, `bindWindowEvents()`, `bindTargetEvents()`. Sonuncusu
yeni pencere açma isteklerini engelleyip aynı görünümde yükler (`setWindowOpenHandler` →
`deny`), navigasyon olaylarında `controller.sync()` çağırır.

**Başlangıç** — `createWindow()` pencereyi kurar, `BrowserController`'ı oluşturur ve
köprüleri sırayla mount eder: `mountIdentity` → `mountPlayback` → `mountData` →
`mountRecord`. Pencere kapanırken ters sırada unmount edilir.

**IPC kökü** — 4 `invoke` (`aft:execute`, `aft:scan`, `aft:coverage`, `aft:vision`) ve
15 `send` kanalı (`aft:nav`, `aft:window`, `aft:chat`, `aft:terminal`, `aft:drag`,
`aft:stage`, `aft:stage-shown`, `aft:modal`, `aft:settings`, `aft:prefs`, `aft:prefs-patch`,
`aft:chrome`, `aft:devtools`, `aft:devtools-split`, `aft:state`). `respond(handler)` tüm
`invoke` cevaplarını tek biçime sokar: başarı/hata, sonuç metni, sayfa durumu, `vision`
bayrağı.

### 5.2 `src/main/shell/` — Kabuk Yardımcıları

Kabuk dosyasından ayrılmış, durum tutmayan iki modül.

- **`geometry.ts`** — `visibleArea(win)` pencere maksimize ise çalışma alanı taşmalarını
  kırpar; `stageBounds(area, box)` oransal sahne kutusunu piksele çevirir, kutu yoksa 40 px
  çerçeveli varsayılana düşer; `splitStage(stage, ratio)` sahneyi sayfa ve inceleme paneli
  olarak böler; `readBox(value)` IPC'den gelen kutuyu doğrulayıp 0–1 aralığına sıkıştırır;
  `sameBox(a, b)` gereksiz yeniden yerleşimi engeller.
- **`paths.ts`** — `preloadPath(mainDir)` `.mjs` preload yoksa `.js` dosyasına düşer. Çağıran
  tarafın `__dirname`'ini parametre alır; böylece paket bölünmesi (chunk) yol çözümlemesini
  bozmaz.

### 5.3 `src/main/harness.ts` — Doğrulama Kabuğu

Sekiz doğrulama/koşum betiğinin ortak iskeleti tek dosyada toplanmıştır:
`expect(name, ok, detail)` kontrol satırını (`GECTI` / `KALDI`) yazar ve biriktirir,
`step(name)` ilerleme satırı basar, `verdict()` toplam/başarısız özetini yazıp çıkış kodunu
üretir, `runEntry(main, announce)` `app.whenReady()` bağlamasını, hata yakalamayı ve
`window-all-closed` davranışını kurar.

### 5.4 `src/main/atomic.ts` — Güvenli Dosya Yazımı

- `writeFileAtomic(path, data)` — geçici dosyaya yazıp `rename` ile atomik takas yapar.
- `quarantine(path)` — bozuk dosyayı silmez, zaman damgalı bir ada taşıyıp yolunu döner.

### 5.5 `src/main/home/` — Yerleşik Ana Sayfa

Uygulama, `aft://home/` adresinde kendi ana sayfasını sunar.

- **`search.ts`** — `HOME_SCHEME`, `HOME_HOST`, `HOME_URL`, arama ve favicon uç noktaları.
  `isHomeUrl(raw)` adresin ana sayfa olup olmadığını, `resolveInput(input)` kullanıcı
  girdisini adrese ya da aramaya çevirir; `javascript:` ve `data:` şemalarını açıkça
  reddeder, localhost ve IP kalıplarını tanır.
- **`index.ts`** — `registerHomeScheme()` şemayı ayrıcalıklı olarak kaydeder (uygulama hazır
  olmadan önce çağrılmalı), `mountHome(partition)` ilgili session'a protokol işleyicisi
  bağlar, `setHomeTheme(next)` tema değişimini bildirir.
- **`page.ts` (579 satır)** — `SKINS` içinde dört tema paleti (`grafit`, `gece`, `kagit`,
  `orman`). `homePage(theme)` tam HTML sayfasını string olarak üretir: marka başlığı, arama
  kutusu, beş kısayol yuvası ve kısayol ekleme formu. Kısayollar `localStorage`'da saklanır.

### 5.6 `src/main/discovery/` — Sayfa Keşif Motoru (2.302 satır)

**`Transport.ts`** — CDP bağlantısının tek sahibi. `start()` debugger'ı bağlar, oto-attach
kurar, alt hedefleri takip eder; `send<T>(method, params, sessionId)` 15 sn zaman aşımlı
komut gönderir; `trySend<T>()` hata yutan varyanttır; `on(method, fn)` olay aboneliği açar;
`enableDomains(sessionId)` gereken CDP domainlerini açar; `stats()` / `resetStats()` protokol
çağrı sayacını yönetir. `ProtocolError` metod ve session bilgisini taşır.

**`FrameRegistry.ts`** — iframe ağacını izler. `refresh()` çerçeve ağacını yeniden okur,
`walk()` dolaşır, `link()` üst-alt ilişkisini kurar, `resolveOwners()` çerçeve sahibi
elemanları eşler, `ordered()` derinlik sırasına göre çerçeveleri verir. Bağlanamayan
çerçeveler `failedSessions` olarak sayılır.

**`StabilityWaiter.ts`** — Sayfanın durulmasını bekler. `aft_probe` izole dünyasına mutasyon
sayacı enjekte eder, `read()` ile okur, `waitForQuiet()` belirtilen süre boyunca değişim
olmamasını bekler. Sürekli hareketli sayfalarda `RESTLESS_LIMIT` sonrası beklemeyi kısaltır.
`scrollBy()` / `scrollTo()` yardımcıları ve dışa açık `delay(ms)` buradadır.

**`SnapshotCollector.ts`** — `DOMSnapshot.captureSnapshot` çıktısını çözer. `captureSession()`
bir oturumun tüm dokümanlarını toplar; `decodeDoc()`, `decodeAttrs()`, `decodeStyle()`,
`stringMap()`, `intMap()`, `boolSet()` sıkıştırılmış tabloları açar.

**`AxCollector.ts`** — `collectAx()` erişilebilirlik ağacını toplar, `toInfo()` rol, ad,
açıklama, değer ve durum bayraklarını `AxInfo` yapısına indirger.

**`GraphBuilder.ts`** — Snapshot + AX verisini birleştirip `GraphNode` listesi üretir.
`buildGraph()` ana giriş; `emitDoc()` doküman başına düğüm yayar (8 ms'lik bütçeyle olay
döngüsüne yer bırakır); `toGraphNode()` tek düğümü kurar; `hostStep()` shadow DOM sıçramasını
kaydeder; `toView()` doküman koordinatını görünüm koordinatına çevirir. `detectBlindSpots()`
erişilemeyen bölgeleri (kapalı shadow, çapraz kaynak çerçeve, bağlanamayan oturum) tespit
eder.

**`Classify.ts`** — Düğümleri sınıflandırır: `applyGeometry(node, vp, margin)` görünürlük ve
görünüm alanı içindelik; `OcclusionIndex` 128 px'lik hücre ızgarasıyla üst üste binme sorgusu;
`applyOcclusion(nodes, index, budget)` bütçe sınırlı örtüşme kontrolü; `applyInteractivity()`
etiket, rol ve olay dinleyicisine göre etkileşim kararı; `ambiguous(node)` kararsızları
işaretler; `probeListeners(tp, nodes, budget)` 16 eş zamanlı `getEventListeners` sondasıyla
kararsız düğümlerin gerçekten dinleyicisi olup olmadığını ölçer.

**`ElementGraph.ts`** — Tarama sonucunun taşıyıcısı ve sorgu yüzeyi. `get(key)`, `at(index)`,
`elements()`, `interactive()`, `indexed()`, `shadowRoots()`, `find(predicate)`, `parent()`,
`children()`, `ancestors()` gezinme; `project(kind)` tüketiciye göre daraltılmış aday listesi;
`toPageState()` arayüzün kullandığı sade `PageElement[]` biçimi.

**`DiscoveryEngine.ts`** — Tarama orkestrasyonu. `scan(options)` çağrıları kuyruğa dizilir.
`run()` akışı:

1. Transport başlat, çerçeveleri tazele, her oturuma sonda kur.
2. `waitForQuiet()` ile sayfayı durult.
3. **Önbellek imzası** (url + mutasyon sayısı + kaydırma + seviye + profil) değişmediyse
   önceki grafiği `reused: true` işaretiyle döndür.
4. `pass()` ile ilk geçiş; seviye ≥ 2 ise `lazyPasses()` (kaydırarak tembel içeriği açar),
   seviye ≥ 3 ise `expandPasses()` (menü/akordeon tıklayarak genişletir).
5. `mergeResults()` ile geçişleri birleştir, `assignIndexes()` ile sıra numarası ver.
6. Dinleyici sondası + örtüşme kontrolü uygula, `CoverageSummary` üret.

**Tarama seviyeleri:** `0` hızlı/AX'siz, `1` AX dahil tek geçiş (varsayılan), `2` tembel
yükleme geçişleri, `3` genişletme geçişleri. `SCAN_PROFILES` üç tüketici profili tanımlar:
`agent`, `record`, `playback`.

**`scheduler.ts`** — `yieldToLoop()`, `chunk()`, `chunkOver()`: uzun döngüleri 8 ms'lik
dilimlere bölüp arayüzün donmasını engeller.

**`types.ts`** — `ScanLevel`, `GraphNode`, `Rect`, `Point`, `ShadowStep`, `AxInfo`,
`BlindSpot`, `Viewport`, `CoverageSummary`, `ScanOptions`, `Candidate`, `Projection`,
`STYLE_KEYS` ve `scanOptions(profile, overrides)`.

### 5.7 `src/main/model/` — Kalıcı Eleman Modeli (1.262 satır)

`ElementGraph` uçucudur; `model` katmanı onu sürümlenmiş, serileştirilebilir bir şemaya
(`elementmodel/2.0.0`) çevirir.

- **`schema.ts`** — `ElementModel`, `FrameModel`, `GraphSnapshot`, `Geometry`, `Visibility`,
  `Accessibility`, `Interactivity`, `FramePath`, `ShadowPath` tipleri; `TEST_ATTRIBUTES`
  listesi, metin/öznitelik kırpma sınırları (`TEXT_CAP`, `ATTR_CAP`),
  `SUPPORTED_MODEL_VERSIONS`.
- **`serialize.ts`** — `toSnapshot(graph)` ana dönüştürücü; `buildIdentity()`,
  `buildFramePath()`, `buildShadowPath()`, `buildGeometry()`, `buildVisibility()`,
  `buildAccessibility()`, `buildInteractivity()`, `rankSiblings()` yardımcıları.
- **`ModelIndex.ts` (277 satır)** — Bir snapshot üzerinde **dokuz arama indeksi** kurar: ref,
  ordinal, çerçeve, öznitelik-değer, normalize metin, erişilebilir ad, imza, etiket ve 128 px
  konum hücresi. Sorgular: `byAttr()`, `byText()`, `byName()`, `bySignatureToken()`,
  `byTag()`, `near(element, radius)`, `query(predicate)`. Gezinme: `parent()`, `children()`,
  `ancestors()`, `siblings()`, `descendants()`, `closestForm()`, `indexInParent()`,
  `typeOrdinal()`, `testAttribute()`, `addressable()`.
- **`projection.ts`** — `project(index, kind)` tüketiciye göre eleman listesini daraltır;
  `suppressContainers()` iç içe aynı kutuya sahip kapsayıcıları eler, `applyBudget()` token
  bütçesine göre kırpar, `estimateTokens()` maliyet tahmini yapar.
- **`ModelStore.ts`** — Snapshot deposu. Bellekte son iki snapshot'ı tutar (`MEMORY_WINDOW`),
  gerisini gzip'li `.snapshot.json.gz` olarak diske taşır (`spill()`), `get()` / `index()` ile
  geri okur, `prune(maxAgeMs)` eskileri siler. Okuma yolunda `assertSnapshot()` sürüm ve
  tutarlılık denetimi yapar; bozuk dosya sessizce atlanır.
- **`hash.ts`** — `digest(parts)` birleşik özet üretir (FNV-1a tabanlı).
- **`validate.ts`** — `validateSnapshot()` bağlantı, geometri ve etkileşim tutarlılığını
  denetleyip `ValidationReport` üretir; `assertSnapshot()` hata varsa `ModelValidationError`
  fırlatır.

### 5.8 `src/main/identity/` — Eleman Kimliği ve Kendini Onarma (1.632 satır)

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
| `neighborhood` | 220 px yarıçaptaki komşu elemanların imzası |

Her stratejinin `extract(element, index)` (parmak izi çıkar) ve `match(payload, index)`
(aday bul) metodu vardır. `strategyByKind(kind)` tek strateji döner.

**`dynamic.ts`** — Kararsız değerleri ayıklar: `isDynamicValue()` (UUID, hex blob, uzun sayı,
framework öneki, CSS-module hash'i, styled-components sınıfı, Tailwind arbitrary değer
kalıpları), `stableClasses()`, `entropy()`, `normalizeText()`, `isMeaningfulText()`.

**`signature.ts`** — Bağlam imzaları (hepsi `WeakMap` ile memoize edilir): `structuralPath()`
(6 seviye), `ancestorSignature()` (4 seviye), `neighborSignature()` (en yakın 4 komşu),
`nearestLabel()`, `formSignature()`, `urlPattern()` (sayısal segmentleri maskeler),
`stableAnchor()`, `labelOf()`.

**`DescriptorBuilder.ts`** — `build(ref, index)` / `fromElement(element, index)` ile
`Descriptor` üretir: hedef bilgisi, tüm strateji yükleri, bağlam ve yakalama koşulları.
`scopeOf(descriptor)` geçmiş istatistiklerinin gruplanacağı kapsamı (url kalıbı) verir.

**`Scoring.ts`** — Güven skoru hesabı. Üç bileşen ağırlıklandırılır: oy payı **%74**, bağlam
**%17**, geometri **%9**. `combine()`, `anchorScore()`, `contextScore()`, `geometryScore()`,
`resolveState()` (`exact` / `low-confidence` / `not-found`), `qualityOf()` (`strong` ≥ 0.72,
`fair` ≥ 0.48, altı `weak`).

**`Resolver.ts`** — Çözümleme motoru. Tüm stratejileri çalıştırır (`vote()`), adayları
kovalara toplar, `rank()` ile sıralar. `pinned()` güçlü stratejilerin tek başına karar verip
veremeyeceğini, `staleNote()` sessiz kalan stratejileri raporlar.

**`Healing.ts`** — Kendini onarma. `Healer.propose()` çözümleme sonucuna göre yeni descriptor
önerir; `decide()` kararı verir: güven ≥ **0.7** → `auto`, 0.4–0.7 → `approval` (kullanıcı
onayı bekler), < **0.4** veya kritik strateji (`test-attribute` / `element-id`) kaybı →
`blocked`. `apply()`, `reject()`, `queue()`, `pendingFor()`, `clear()` kuyruğu yönetir.

**`HistoryStore.ts`** — Strateji başarı geçmişi. Kapsam × strateji bazında isabet oranı tutar;
`DECAY = 0.94` ile eskiyi zayıflatır, `multiplier()` ile 0.55–1.25 arası ağırlık çarpanı
üretir. Böylece belirli bir sitede işe yaramayan strateji zamanla geri plana düşer.
`record()`, `stats()`, `reset()`, `flush()` (1.5 sn gecikmeli toplu yazım).

**`DescriptorStore.ts`** — Descriptor kataloğu (`catalog.json`). `load()`, `save()`,
`replace()`, `get()`, `remove()`, `all()`, `byUrlPattern()`, `weak()`, `summaries()`,
`flush()` (1.2 sn gecikmeli). Bozuk dosyayı `quarantine()` ile karantinaya alır, `faults()`
üzerinden raporlar.

**`IdentityService.ts`** — Modülün dış yüzü. `index(graph)` (WeakMap önbellekli),
`captureByRef()`, `captureByOrdinal()`, `captureFromIndex()`, `resolve()`, `resolveOn()`,
`approve()`, `reject()`, `pendingApprovals()`, `statsFor()`.

### 5.9 `src/main/action/` — Eylem Yürütme (2.110 satır)

**`types.ts`** — 14 eylem türü (`click`, `double-click`, `right-click`, `hover`, `type`,
`clear-type`, `press-key`, `scroll`, `select-option`, `upload`, `navigate`, `wait`,
`refresh`), 10 hata kodu, `ActionRequest`, `ActionOutcome`, `ActionabilityOptions` (8 sn
zaman aşımı, 60 ms poll), `NavigationOptions`, `NAVIGATION_GRACE`, `InputMode`.

**`Coordinates.ts`** — `PROBE_STEPS` (merkez tutmazsa denenecek dokuz oransal nokta),
`centerOf()`, `sameRect()`, `clampPoint()`.

**`Actionability.ts`** — Bir elemanın tıklanabilir olup olmadığını sayfaya enjekte edilen
`PROBE_FN` ile ölçer: görünür mü, etkin mi, konumu sabit mi (animasyon bitti mi), üstü açık
mı. `wait()` koşullar sağlanana kadar bekler, `require()` sağlanmazsa hata fırlatır,
`describe(report)` insan okur bir sebep metni üretir.

**`InputDispatcher.ts` (502 satır)** — İki modda çalışır:

- **`real-input`** — CDP `Input.dispatchMouseEvent` / `dispatchKeyEvent` ile gerçek fare ve
  klavye olayları: `move()`, `click()`, `doubleClick()`, `scroll()`, `typeText()`, `press()`.
- **`direct-call`** — Elemanın kendi metodunu çağırır (`CLICK_FN`, `SET_VALUE_FN`,
  `SELECT_FN`, `SCROLL_BY_FN`, `FOCUS_INTO_FN`): `directClick()`, `directSetValue()`,
  `selectOption()`, `setFiles()`, `readValue()`, `readScrollTop()`.

`NAMED_KEYS` ve `MODIFIER_KEYS` tabloları ile `parseCombo()` (`Ctrl+Shift+A`), `printable()`,
`codeOf()`, `isPressableKey()`.

**`NavigationWaiter.ts`** — Eylem sonrası navigasyonu izler. Uçuştaki istekleri sayar,
`EventSource`/`WebSocket`/`Media` gibi akış türlerini ağ boşluğu hesabından dışlar.
`observe()` bir eylemi sarmalayıp `NavigationReport` üretir (`none` / `document` /
`in-document`), `waitForIdle()` ağın durulmasını bekler.

**`DialogManager.ts`** — `Page.javascriptDialogOpening` olaylarını politikaya göre
(`accept` / `dismiss`) yanıtlar; dosya seçici isteklerini (`expectFiles()`, `awaitChooser()`)
ve indirmeleri (`trackStart()`, `trackProgress()`) izler. `consumeDialogs()` /
`consumeDownloads()` biriken kayıtları tüketir.

**`ActionEngine.ts` (627 satır)** — Tüm eylemleri seri bir kuyrukta yürütür.
`execute(request)` girişi; `perform()` içinde:

1. `locate()` — descriptor / ref / ordinal ile hedefi bulur,
2. `actionabilityFor()` — kalan süreye göre hazırlık koşullarını ayarlar,
3. `dispatch()` — türe göre `clickLike()`, `doubleClick()`, `pressOn()`, `scrollOn()`,
   `focusOn()`, `type()`, `select()`, `upload()`, `navigate()`, `scrollPage()`, `refresh()`,
4. `navigationFor()` — eylem türüne özel navigasyon toleransı,
5. `done()` — `ActionOutcome` üretir, diyalog ve indirme kayıtlarını iliştirir.

`fallbackToDirect` açıkken gerçek girdi başarısız olursa doğrudan çağrıya düşer.
`directOnly()` ve `fileInput()` bazı eylemleri zorunlu olarak doğrudan çağrıya yönlendirir.

**`errors.ts`** — `ActionError` (Türkçe mesaj tablosuyla) ve `classify(error)` bilinmeyen
hataları kodlanmış hataya çevirir.

### 5.10 `src/main/browser/` — Tarayıcı Denetleyici (1.360 satır)

**`BrowserController.ts`** — `DiscoveryEngine`, `ActionEngine` ve `Overlay`'i tek yüzeyde
birleştirir. `attach()` / `start()` / `dispose()` yaşam döngüsü; `scan(level)` tarama ve
`PageState`; `setVision(on)` sayfa üzerine numaralı kutucuk katmanı; `execute(action)`
`AgentAction`'ı `ActionRequest`'e çevirip yürütür ve `report()` ile insan okunur sonuç üretir;
`dispatch(request)` ham yol (senaryo oynatma bunu kullanır); `scanGraph()` profil destekli
tarama; navigasyon (`back`, `forward`, `reload`, `stop`, `home`, `canGoBack`, `canGoForward`,
`isLoading`, `url`, `title`); `sync()` 260 ms gecikmeli tekilleştirilmiş yeniden tarama;
`setDescriptorResolver()` kimlik modülüyle bağı kurar.

**`Overlay.ts`** — `aft_overlay` izole dünyasında sayfaya bir `<div>` katmanı enjekte edip her
etkileşimli elemanın üstüne sıra numarasını çizer (`draw`, `clear`). Aynı içerik iki kez
çizilmez.

**`recordScript.ts` (445 satır)** — Kayıt modunun sayfa tarafı. `aft_record` izole dünyasında
çalışacak IIFE metnini, ayarlanabilir imleç bekleme süresini işleyen `sourceFor(tuning)`
fonksiyonunu ve kuyruk boşaltma ifadesini (`DRAIN`) barındırır. Betik `mousedown`, `click`,
`dblclick`, `contextmenu`, `input`, `change`, `keydown`, `wheel`, `scroll` olaylarını dinler;
her etkileşim için elemanın etiketini, özniteliklerini, metnini ve konumunu bir kuyruğa yazar.

**`InteractionWatcher.ts` (400 satır)** — Kayıt modunun ana süreç tarafı. Betiği her çerçeveye
kurar ve 500 ms'de bir kuyruğu boşaltır. `start(sink)` / `stop()` dinlemeyi yönetir;
`install(sessionId)` betiği kurup `Runtime.addBinding` ile geri kanal açar; `hydrate()` /
`resolve()` sayfadan gelen kaydı gerçek `backendNodeId`'ye bağlar; `mark(highlight)` /
`clearMarks()` kayıt sırasında elemanı vurgular; `rememberProbe()` / `claim()` aynı elemanın
tekrar tekrar çözümlenmesini önler.

**`types.ts`** — `PageElement`, `PageState`, `AgentAction`, `ExecuteResult`, `ScanReport`,
`StageBox`, `DragAxis`, `NavKind`, `WindowAction`, `BrowserState`, `AppPrefs`. Bu dosya
`tsconfig.web.json` içine dahil edildiği için renderer da doğrudan bu tipleri kullanır.

### 5.11 `src/main/record/` — Kayıt Motoru (2.514 satır)

**`types.ts`** — `RawInteraction` (sayfadan gelen ham olay), `RecordIntent` (normalize edilmiş
niyet), `RecordedStep`, `RecordSession`, `RecordOptions` (`DEFAULT_RECORD`), `StepAdvice`,
`TargetOption`, `RecordNotice`, `RecordHost` arayüzü, `EditRequest`, `AssertionSpec`,
`ScenarioMeta`.

**`Normalizer.ts`** — `normalize(raw, options)` ham olayı `RecordIntent`'e çevirir; kök
etiketleri (`body`, `html`) eler. `sourceKey(raw)` aynı elemandan gelen olayları eşlemek için
anahtar üretir, `labelOf(element)` etiket metnini çıkarır.

**`NoiseFilter.ts`** — Kaydın gürültüsünü temizleyen kural motoru. `suppress()` şunları yapar:
etkileşim sonrası otomatik adres değişimini **düşürür**, ardışık kaydırmaları **birleştirir**,
çift tıklamanın öncesindeki tekil tıklamaları **siler**, yazma öncesi odak tıklamasını
**siler**, ardışık yazmaları **birleştirir**, açılır liste açma tıklamasını **siler**, dosya
seçici tıklamasını **siler**, aynı eleman üzerinde tekrarlanan tıklamayı ve tekrar eden tuşu
**düşürür**.

**`Quality.ts`** — Adım kalitesi değerlendirmesi. `assess()` bir hedefin ne kadar sağlam
olduğunu ölçer, `probe()` alternatif stratejileri dener, `alternatives()` kullanıcıya
sunulacak hedef seçeneklerini üretir, `blocked()` / `degraded()` / `plain()` tavsiye nesneleri
döner, `optionTarget()` açılır liste seçeneklerini hedefe çevirir. `QUERY_SCORES` sorgu
türlerine puan verir (test-id en yüksek).

**`StepFactory.ts`** — Adım nesnesi üretimi: `stepId()`, `steadyTarget()`, `build()` (ana
adım), `waitStep()`, `waitTitle()`, `hoverTitle()`, `scrollTitle()`, `assertStep()`,
`assertion()`, `assertionOptions()`. `KIND_LABELS` ve `ASSERTION_LABELS` Türkçe adım
başlıklarını üretir.

**`Editor.ts`** — Kayıt sonrası düzenleme. `edit(session, request)` tek giriş noktası; alt
işlemler: `remove`, `move`, `retitle`, `retext`, `retarget` (alternatif hedefe geç),
`insertWait` (100 ms – 300 sn), `insertAssert`, `retime`, `tolerate` (hata toleransı
bayrağı), `clear`. `renumber()` sıra numaralarını tazeler.

**`Composer.ts`** — `compose(session, meta)` kayıt oturumunu tam bir `Scenario` nesnesine
dönüştürür; `sessionId(url, startedAt)` ve `defaultTitle(session)` yardımcıdır.

**`Recorder.ts` (613 satır)** — Kayıt orkestrasyonu. `start(overrides)` / `pause()` /
`resume()` / `stop()` / `discard()` oturum yaşam döngüsü; `accept(batch)` watcher'dan gelen ham
olay yığınını kuyruğa alır; `consume(raw)` normalize eder, `NoiseFilter`'dan geçirir, `merge()`
veya `commit()` eder; `commit(session, intent)` elemanı `locate()` ile bulur, descriptor
üretir, kaliteyi ölçer, alternatifleri hesaplar ve adımı `append()` eder; `warm(delayMs)`
kullanıcı etkileşimi beklerken önden tarama yapıp gecikmeyi düşürür; `notice()` / `emit()`
arayüze uyarı ve güncelleme yayınlar; ayrıca `applyEdit()`, `describe(meta)`, `compose(meta)`,
`settle()`.

**`fixture.ts`** — `RECORD_PAGE`, `RECORD_FRAME_PAGE`, `RECORD_RESULT_PAGE`: kayıt doğrulama
testlerinin kullandığı gömülü HTML sayfaları (özel eleman `AftKutu` ile shadow DOM senaryosu
dahil).

**`verify.ts` (373 satır)** — `npm run record:verify` girişi. Fixture sunucusu açar, gerçek bir
pencere kurar, olayları tetikler ve `harness.ts` üzerinden kontrol listesi üretir.

### 5.12 `src/main/scenario/` — Senaryo ve Oynatma (3.887 satır)

**`types.ts` (427 satır)** — Tüm senaryo veri modeli: `Scenario`, `ScenarioStep`, `StepTarget`
(4 tür: `descriptor`, `inline-descriptor`, `query`, `ordinal`), `StepQuery` (5 sorgu türü),
`Assertion` (12 doğrulama türü), `StepCondition` (koşullu adım), `ExpectedState`,
`ScenarioDefaults`, `StepResult`, `RunResult`, `RunMetrics`, `LogEntry`, `PlaybackOptions`,
`FailureContext`, `PlaybackHost` arayüzü, `SUPPORTED_SCENARIO_VERSIONS`.

**`validate.ts` (453 satır)** — `parseScenario()` ham JSON'u göçten geçirip doğrular;
`validateScenario()` hata ve uyarı listesi üretir; `assertScenario()` hata varsa
`ScenarioError` fırlatır.

**`migrate.ts`** — `migrateScenario(payload)` sürüm alanını normalize eder, desteklenmeyen
sürümde `ScenarioMigrationError` fırlatır.

**`ScenarioStore.ts`** — `.scenario.json` dosyalarının deposu ve klasör ağacı. `load()`,
`read()`, `write()`, `remove()`, `get()`, `all()`, `entries()`, `folders()`, klasör ekleme /
yeniden adlandırma / silme ve senaryo taşıma işlemleri.

**`TargetResolver.ts`** — Adım hedefini gerçek elemana bağlar: `byDescriptor()` (kimlik
modülünü kullanır, gerekirse healing tetikler), `byQuery()` (test-id / id / alan adı /
erişilebilir ad / metin ile arar, `nth` desteği), `byOrdinal()` (sıra numarasıyla — en kırılgan
yol). `matchQuery(query, index)` dışa açık yardımcıdır.

**`AssertionEngine.ts`** — Doğrulama yürütücüsü. `evaluate(assertion, index, allowLow)` her
doğrulama türünü işler (metin eşitliği/içermesi, görünürlük, etkinlik, öznitelik, adet, url,
başlık). `matches(value, pattern)` joker karakter desteği sağlar.

**`StateVerifier.ts`** — Adım sonrası sayfa durumunu doğrular. `expectedFromCapture(descriptor)`
kayıt anındaki koşullardan beklenen durumu üretir; `verifyState()` url kalıbı, başlık, minimum
etkileşimli eleman ve maksimum kör nokta kriterlerini kontrol eder.

**`StepExecutor.ts` (421 satır)** — Tek bir adımın yürütülmesi. `run(step, order, ctx)`
`retries + 1` kez dener, her denemede `attempt()` çağırır, başarısızsa `capture()` ile hata
bağlam paketi üretir. `condition(step, ctx)` koşullu adımları değerlendirir
(`previous-passed`, `previous-failed`, `assertion-passes`). `targeted()` hedefli adımları,
`plain()` hedefsiz adımları işler; `graphFor()` gereken tarama profilini seçer. Yardımcılar:
`absolute()`, `withTimeout()`.

**`FlowController.ts`** — Adım akışını yönetir. `run()` üst seviye, `sequence()` sıralı
yürütme, `group()` iç içe adım listelerini işler, `skip()` koşulu sağlanmayanları atlar,
`cancel()` iptal bayrağını kaldırır. `select(steps, only)` yalnızca belirli adımları koşar,
`flatten()` ağacı düzleştirir.

**`RunLog.ts`** — 5.000 girişlik dairesel günlük: `push()`, `resolution()` (çözümleme izini
formatlar), `assertion()`, `state()`. `renderLog(entries)` metin çıktısı üretir.

**`FailureContext.ts`** — Hata anı paketi. `buildContext(input)` url, başlık, kapsam, kör
noktalar, 400 elemana kadar döküm, çözümleme izi, doğrulama kayıtları ve ekran görüntüsünü tek
nesnede toplar. `ContextStore` bunları `.context.json.gz` olarak diske yazar: `write()`,
`read()`, `list()`, `refs()`, `prune(retentionMs)`.

**`PlaybackEngine.ts`** — Koşum orkestrasyonu. `run(scenario, overrides, onProgress)` senaryoyu
doğrular, ayarları birleştirir (`merge()`), `prepare()` ve `preflight()` ile başlangıç adresini
açar, `FlowController`'ı çalıştırır, metrikleri toplar, `RunResult` üretir ve `reportDir`
tanımlıysa rapor yazar. `cancel()`, `last()`, `isRunning()`.

**`Metrics.ts`** — `emptyMetrics()`, `aggregate()` (adım ağacını gezip toplam süre, geçen,
kalan, ortalama güven, faz süreleri), `collectFailures()`, `mean()`, `round()`.

**`Consistency.ts`** — Aynı senaryonun birden çok koşumunu karşılaştırır. `compareRuns(runs)`
adım bazında durum ve güven tutarlılığını ölçer (güven yayılımı sınırı 0.1),
`renderConsistency(report)` tablo üretir.

**`Reporter.ts`** — `renderText(run)` hizalanmış metin raporu, `writeReport(run, dir)` rapor
dosyalarını diske yazar.

**`run.ts` (164 satır) / `verify.ts` (275 satır) / `fixture.ts`** — `npm run playback` ve
`npm run playback:verify` girişleri; `PLAYBACK_PAGE`, `PLAYBACK_RESULT_PAGE`,
`PLAYBACK_SCENARIO` gömülü fixture'ları.

### 5.13 `src/main/data/` — Kalıcı Veri Katmanı (1.739 satır)

**`driver.ts`** — `node:sqlite` sarmalayıcı. `openDatabase(path)` bir `DataDriver` döner:
`exec()`, `run()`, hazırlanmış ifade önbelleği (`statement()`), `userVersion()`,
`journalMode()`, `transaction()`, `fault()`, `close()`. WAL ve foreign_keys pragmaları
uygulanır. `DriverError` hata sınıfıdır.

**`schema.ts`** — Tablolar: `scenario_index`, `run`, `run_step`, `failure_context`, `outbox`.
`createSchema(driver)` şemayı kurar; `toRunRow()`, `toStepRow()`, `toContextRow()`,
`toScenarioRow()`, `toOutboxItem()` ham satırları tip güvenli satırlara çevirir; `flag()`
yardımcıdır.

**`migrate.ts`** — `migrateData(driver)` boş veritabanında şemayı kurup `DATA_USER_VERSION`
(=1) damgasını atar, sürüm uyuşmazlığında `DataMigrationError` fırlatır. Sonuç
`DataMigrationResult` olarak `from`, `to`, `applied`, `created` alanlarını taşır.

**`Indexer.ts` (432 satır)** — Koşum sonuçlarını veritabanına yazar ve sorgular:

- `recordRun(run, input)` — koşumu, tüm adımları (`collect()` ile ağacı düzleştirerek) ve hata
  bağlamlarını tek işlemde yazar.
- `upsertScenario()`, `rebuildScenarioIndex()`, `removeScenario()`, `scenarios()`.
- `runs(query)`, `runCount()`, `run(id)`, `steps(runId)`, `contexts(runId)`, `detail(runId)`,
  `removeRun(id)`.
- `fragile(limit)` — en sık başarısız / en düşük güvenli adımları çıkarır.
- `health()` — genel sağlık özeti.
- `reconcile(present)` — diskteki bağlam dosyalarıyla veritabanını eşitler.
- `counts()` — tablo başına satır sayısı.

**`Outbox.ts`** — Dış sisteme gönderim kuyruğu: `enqueue()`, `claim(limit)`, `markSending()`,
`markSent()`, `markFailed()`, `summary()`, `flush(limit)`. `backoffFor(attempts)` üstel geri
çekilme üretir (30 sn adım, 1 saat tavan, en fazla 8 deneme). `NullTransport` varsayılan boş
taşıyıcıdır; `FileTransport` kayıtları diske yazan somut taşıyıcıdır.

**`Retention.ts`** — `sweep(policy)` süresi dolmuş koşumları ve dosyalarını temizler
(`expired()`, `dropFiles()`); kuyrukta bekleyen koşumlara dokunmaz.

**`DataStore.ts`** — Sürücü, şema ve göçü tek nesnede toplar; `stats()` genel sayıları,
`migration()` göç sonucunu döner.

**`verify.ts` (317 satır)** — `npm run data:verify` girişi; göç, indeksleme, uzlaştırma,
kuyruk, saklama politikası, atomik yazma ve indeks kaybı dayanıklılığı senaryolarını sınar.

### 5.14 `src/main/regression/` — Regresyon Havuzu (1.744 satır)

Keşif motorunun kalitesini ölçmek için **28 donmuş fixture sayfası** üzerinden koşan bir ölçüm
çerçevesi. Fixture dosyaları depoda tutulmaz; `--fixtures=<dizin>` ile yol verilir.

**`pool.ts`** — `POOL` sabiti; altı kategoride vakalar: `classic-html` (portal, haber, doküman,
tablo, eski yerleşim), `spa` (dashboard, ticaret, kanban, router, modal, lazy), `shadow-dom`
(açık/iç içe/kapalı/form), `nested-iframe` (tek/üç seviye/çapraz kaynak/ödeme), `virtual-list`
(grid, feed, tree, log), `multi-step-form` (sihirbaz, doğrulama, yükleme, koşullu alanlar).
`poolCoverage()` kategori dağılımını verir.

**`FixtureServer.ts`** — Yerel statik HTTP sunucusu; `safeJoin()` ile dizin taşması (path
traversal) engellenir.

**`ElectronHarness.ts`** — Gerçek `WebContentsView` üzerinde `goto()`, `scan()`, `reset()`
sağlayan koşum ortamı; `withTimeout()` ile takılmaları keser.

**`CaseRunner.ts`** — Tek vakayı ölçer: `measure()` tarama metriklerini toplar,
`applyCoverage()` kapsam sayılarını işler, `capture()` örnek descriptor'lar üretir,
`resolveAll()` bunları yeniden çözümleyip kimlik doğruluğunu ölçer, `check()` beklentileri
karşılaştırır.

**`Metrics.ts`** — `countFalsePositives()`, `ratio()`, `mean()`, `aggregate()`, `round()`,
`emptyMetrics()`.

**`PoolRunner.ts`** — Tüm havuzu koşar, ilerleme geri çağrısı yayınlar, `BaselineStore` ile
karşılaştırır.

**`BaselineStore.ts`** — Referans ölçüm dosyası. `write()` yeni baseline yazar,
`compare(results, maxDelta)` gerilemeleri tespit eder. Sayım metriklerinde **%5**, süre
metriklerinde **%35** tolerans uygulanır.

**`Reporter.ts`** — `renderText(run)` ve `writeReport(run, dir)`.

**`run.ts` (125 satır) / `smoke.ts` (238 satır) / `repeat-verify.ts` (242 satır)** — Sırasıyla
`npm run regression`, `npm run smoke` ve `npm run repeat:verify` girişleri. `repeat-verify`
aynı sayfanın iki sürümü arasında descriptor'ların hâlâ doğru elemanı bulup bulmadığını sınar.

### 5.15 `src/main/bridge/` — IPC Köprüsü (1.730 satır)

Her alan için bir kanal sınıfı; hepsi aynı deseni izler: `register()` IPC işleyicilerini kurar,
paylaşılan `guard()` her çağrıyı `ChannelResult<T>` (`{ ok, message, data }`) biçimine sarar,
`dispose()` işleyicileri kaldırır.

| Dosya | Sorumluluk |
|---|---|
| `guard.ts` | Dört kanalın ortak hata sarmalayıcısı |
| `IdentityChannel.ts` | 11 kanal: yakalama, çözümleme, projeksiyon, doğrulama, katalog, onaylar, istatistik. `lookup(descriptorId)` `ActionEngine`'e descriptor çözücü sağlar. 7 günlük snapshot saklama. |
| `PlaybackChannel.ts` | 14 kanal: senaryo CRUD, klasör işlemleri, koşum, iptal, son sonuç, bağlam listesi. Koşum bitince `index()` ile veritabanına yazar. 14 günlük bağlam saklama. |
| `DataChannel.ts` | 11 kanal: koşum listesi/detayı, rapor, senaryo indeksi, sağlık, kırılgan adımlar, outbox, flush, reconcile, sweep, istatistik. `syncScenarios()` disk ile indeksi eşitler. |
| `RecordChannel.ts` | 10 kanal: başlat/durdur/duraklat/sürdür/durum/düzenle/açıkla/ayar/kaydet/at. Oturumu arayüzün beklediği `RecordView`'a çevirir; 120 ms debounce ile güncelleme yayınlar. |
| `PlaybackAdapter.ts` | `BrowserController`'ı `PlaybackHost` arayüzüne uyarlar (`prepare`, `execute`, `scan`, `screenshot`, `protocolCalls`). |
| `RecordAdapter.ts` | `BrowserController` + `InteractionWatcher`'ı `RecordHost` arayüzüne uyarlar; navigasyon olaylarını da ham etkileşim olarak üretir. |
| `mount.ts`, `mountPlayback.ts`, `mountData.ts`, `mountRecord.ts` | `mountIdentity`, `mountPlayback`, `mountData`, `mountRecord` ve karşıt `unmount*` fonksiyonları; tekil kanal örneklerini yönetir. `recordChannel()` aktif kayıt kanalını verir. |
| `types.ts`, `playback-types.ts`, `data-types.ts`, `record-types.ts` | Kanal adları ve yük tipleri. Renderer da bu dosyaları doğrudan import eder. |

### 5.16 `src/main/verify.ts` (418 satır) — Uçtan Uca Doğrulama

`npm run verify` ile çalışır. Geçici bir `userData` dizini oluşturur, fixture sunucusu açar,
gerçek pencere kurar, tüm köprüleri mount eder ve **kayıt → düzenleme → kaydetme → oynatma →
raporlama → hata bağlamı** zincirini baştan sona sınar. Kontrol satırlarını `harness.ts`
üzerinden `GECTI` / `KALDI` olarak yazar ve çıkış kodu üretir.

---

## 6. Preload Katmanı — `src/preload/` (365 satır)

Beş ayrı API yüzeyi `contextBridge` ile renderer'a açılır. Her `.ts` dosyasının yanında
karşılık gelen bir `.d.ts` global tip bildirimi vardır.

| Global | Dosya | İçerik |
|---|---|---|
| `window.aft` | `index.ts` | `execute`, `setVision`, `scan`, `coverage`, `nav`, `window`, `setChat`, `setTerminal`, `startDrag`, `endDrag`, `setStage`, `setModal`, `setStageShown`, `setSettings`, `setDevtools`, `setDevtoolsSplit`, `publishPrefs`, `patchPrefs`, `setChrome`, `requestState` + abonelikler: `onState`, `onFocusUrl`, `onFocusTerminal`, `onOpenPalette`, `onPointer`, `onPrefs`, `onPrefsPatch`, `onDragEnd` |
| `window.aftIdentity` | `identity.ts` | `capture`, `resolve`, `project`, `validate`, `list`, `remove`, `approvals`, `approve`, `reject`, `stats`, `scan` |
| `window.aftPlayback` | `playback.ts` | `list`, `get`, `save`, `remove`, `move`, `folderAdd`, `folderRename`, `folderRemove`, `validate`, `run`, `cancel`, `last`, `contexts`, `context`, `onProgress` |
| `window.aftRecord` | `record.ts` | `start`, `stop`, `pause`, `resume`, `state`, `edit`, `describe`, `options`, `save`, `discard`, `onUpdate`, `onNotice` |
| `window.aftData` | `data.ts` | `runs`, `run`, `report`, `scenarios`, `health`, `fragile`, `outbox`, `flush`, `reconcile`, `sweep`, `stats` |

Tüm abonelik fonksiyonları, aboneliği kaldıran bir fonksiyon döner — React `useEffect`
temizliğiyle doğrudan uyumludur.

---

## 7. Renderer — React Arayüzü (~9.900 satır)

### 7.1 `main.tsx`

Giriş noktası. `?view=settings` sorgusu varsa `SettingsWindow`, aksi halde `App` bileşenini
mount eder.

### 7.2 `App.tsx` (936 satır) — Uygulama Kabuğu

Yedi sayfalı bir kabuk yönetir: `browser`, `scenarios`, `results`, `stats`, `identity`,
`coverage`, `data`. Solda ikon rayı, üstte başlık çubuğu ve adres kutusu, altta durum çubuğu.

**Önemli state'ler** — `state` (main'den gelen `BrowserState`), `page`, `listOpen`, `drag`,
`recording`, `playing`, `library` (kütüphane revizyon sayacı), `runRequest`, `theme`,
`autoTerm` / `autoBack`, panel boyutları, `space` (ölçülen çalışma alanı), `stageEl`.

**Kritik fonksiyonlar**

| Fonksiyon | Görevi |
|---|---|
| `reportStage()` | Sahne `div`'inin ekrandaki oransal kutusunu ölçüp main'e bildirir; `ResizeObserver` ile bağlanır |
| `report(entry)` | Alt sayfalardan gelen bildirimleri terminale yazar |
| `runAction(action)` | `window.aft.execute()` çağırır, sonucu konsola aktarır |
| `toggleVision()` | Görüş katmanını açıp kapatır, iyimser güncelleme yapar |
| `beginDrag(axis, event)` | Panel sürüklemeyi başlatır (liste / terminal / dock / inceleme eksenleri) |
| `onPlayBusy(running)` | Koşum başlayınca terminali otomatik açar, bitince tercihe göre kapatır |
| `pick(item)` | Ray tıklamasını sayfa veya dock geçişine çevirir |
| `requestRun(scenarioId)` | Senaryolar sayfasından koşum isteğini oynatma paneline taşır |
| `status` | Durum rozetini hesaplar: kayıtta / koşumda / yükleniyor / hazır |

### 7.3 `shell/` — Kabuk Yardımcıları

- **`prefs.ts`** — `PAGE_IDS` / `PageId`, `localStorage` anahtarları, varsayılan ve sınır
  boyutları, `readSize()` / `storeSize()`, `readFlag()` / `storeFlag()`, `readPage()`,
  `readDock()`, `sameBox()`, `part(value, total)`.
- **`nav.ts`** — `NavItem` tipi, `NAV` ray tanımı ve `PAGE_LABELS` başlık sözlüğü.
- **`Brand.tsx`** — Marka SVG'si.
- **`steps.ts`** — `STEP_LABELS` ve `stepDetail(step)`: bir adım sonucunu terminale yazılacak
  ayrıntı satırlarına çevirir (kimlik durumu, doğrulamalar, durum kontrolü, hata kodu, bağlam).

### 7.4 `SettingsWindow.tsx`

Ayrı pencerede açılan ayar paneli: tema seçimi, otomatik terminal davranışı ve kısayol listesi.
Değişiklikleri `window.aft.patchPrefs()` ile ana arayüze yollar.

### 7.5 Sayfalar — `src/renderer/src/pages/`

**`BrowserPage.tsx` (166 satır)** — Ana çalışma alanı düzeni. Solda `ElementList`, ortada
`stage` (main'in `targetView`'i buraya oturur), altta `Console`, sağda iki sekmeli dock:
`RecordPanel` ve `RunPanel`. Panel sürükleme tutamaçlarını bağlar.

**`ScenarioPage.tsx` (916 satır)** — Senaryo düzenleyici kabuğu: sol sütun kütüphane ağacı
(`ScenarioTree`), orta sütun adım listesi (`StepTree`), sağ sütun seçili adımın ayarları
(`StepInspector`). Klasör ekleme/yeniden adlandırma/silme, senaryo taşıma, adım kopyala-yapıştır,
`Del` ile silme, JSON görünümü ve `window.aftPlayback.validate()` ile canlı doğrulama.

Sayfanın saf mantığı ve alt bileşenleri `pages/scenario/` altına ayrılmıştır:

- **`model.ts` (297 satır)** — Adım/senaryo veri işlemleri: `blankTarget()`, `blankStep()`,
  `blankScenario()`, `mapSteps()`, `flatSteps()`, `dropStep()`, `shiftStep()`, `findStep()`,
  `holdsStep()`, `placeStep()`, `cloneStep()`, `valueLabel()`, `valueOf()`, `patchValue()`,
  `intOf()`, `typing()`, pano erişimi (`readClip()` / `writeClip()`) ve adım türü tabloları
  (`ADD_KINDS`, `TARGET_KINDS`, `KIND_TITLES`, `ELEMENT_KINDS`, `TARGETLESS_KINDS`,
  `ELEMENT_ASSERTIONS`, `NUMERIC_KINDS`).
- **`TargetEditor.tsx` (168 satır)** — Hedef düzenleyici: hedefleme türü, etiket, descriptor
  kimliği, sıra numarası ve sorgu alanları.
- **`StepInspector.tsx` (305 satır)** — Adım ayar kartı: taşıma/kopyalama/silme, başlık, değer,
  hedef, zaman aşımı, yeniden deneme, tarama seviyesi, girdi modu, koşul, beklenen durum ve
  doğrulama düzenleme.

**`ResultPage.tsx` (410 satır)** — Koşum geçmişi. Sayfalı liste (40'lık), duruma ve senaryoya
göre filtre. Seçili koşum için üç sekme: `steps` (adım ağacı), `contexts` (hata bağlam
paketleri, `ContextView` ile), `report` (metin rapor). Metrik şeridi: adım, geçen, kalan,
güven, süre, tarama, kesin eşleşme.

**`StatsPage.tsx` (415 satır)** — İstatistik panosu. 7 / 30 / 90 gün ve tümü aralıkları;
`Charts.tsx` bileşenleriyle eğilim çizgisi, yığın grafiği, halka grafik ve mini grafikler;
koşum başarı oranı, süre dağılımı ve kırılgan adım özetleri.

**`IdentityPage.tsx` (803 satır)** — Kimlik sağlığı. Dört sekme: `fragile` (en kırılgan
adımlar), `catalog` (descriptor kataloğu, kalite kademesi rozetiyle; silme ve istatistik),
`approvals` (onay bekleyen healing önerileri; onayla/reddet), `strategies` (kapsam bazında
strateji isabet oranları). Ayrıca model doğrulama raporu gösterilir.

**`CoveragePage.tsx` (204 satır)** — Son taramanın kapsam raporu. Seviye seçici (0–3) ve
yeniden tarama düğmesi. Metrikler: düğüm, eleman, etkileşilebilir, görünen alan, shadow kök,
çerçeve, kör nokta, geçiş, süre. İki tablo: erişilemeyen bölgeler ve çerçeve listesi.

**`DataPage.tsx` (254 satır)** — Veri katmanı yönetimi. Metrikler (senaryo, koşum, adım,
bağlam, kuyruk) ve outbox özeti. Üç işlem düğmesi: `flush` (kuyruğu gönder), `reconcile`
(disk ↔ veritabanı eşitle), `sweep` (saklama politikasını uygula). Senaryo indeksi tablosu.

### 7.6 Parçalar — `src/renderer/src/parts/`

| Dosya | Satır | Görevi |
|---|---|---|
| `Charts.tsx` | 590 | `Sparkline`, `StackChart`, `TrendChart`, `DonutChart`, `Legend` — bağımlılıksız SVG grafik seti |
| `RunPanel.tsx` | 392 | Oynatma paneli: senaryo seçimi, koşum ayarları, canlı ilerleme, adım listesi, metrikler, hata bağlamı açma |
| `ScenarioTree.tsx` | 299 | Klasör/senaryo ağacı; sürükle-bırak taşıma, bağlam menüsü, kapalı klasörleri `localStorage`'da hatırlama |
| `ContextView.tsx` | 266 | Hata bağlam paketi görüntüleyici; sekmeler: `trace`, `candidates`, `assertions`, `blind`, `elements`, `shot` |
| `Console.tsx` | 254 | Komut terminali; komut tamamlama, geçmişte gezinme, alta sabitlenmiş kaydırma |
| `CommandPalette.tsx` | 147 | `Ctrl+P` komut paleti |
| `DefaultsSheet.tsx` | 134 | Senaryo varsayılanları düzenleme sayfası |
| `StageBar.tsx` | 120 | Sahne üstü araç çubuğu (görüş, tarama seviyesi, yeniden tarama) |
| `PromptSheet.tsx` | 111 | Tek alanlı onay/giriş sayfası (klasör adı, silme onayı) |
| `ElementList.tsx` | 105 | Taranan elemanların filtrelenebilir listesi; satır tıklaması eyleme dönüşür |
| `Drawer.tsx` | 97 | Sağ dock çerçevesi (`record` / `playback` sekmeleri) |
| `StepTree.tsx` | 91 | İç içe adım ağacı listesi |
| `ShotView.tsx` | 53 | Base64 ekran görüntüsünü yakınlaştırma desteğiyle gösterir |
| `Splash.tsx` | 22 | Açılış ekranı içeriği |

**`RecordPanel.tsx` (702 satır, `src/renderer/src/` kökünde)** — Kayıt paneli. Üst çubuk:
başlat / duraklat / sürdür / durdur / at, kayıt vurgusu ve kaydırma yakalama anahtarları.
Her adım satırında başlık ve değer düzenleme, alternatif hedefler arasından seçim, bekleme
ekleme, doğrulama ekleme, hata toleransı, taşıma ve silme. Alt çubuk: senaryo başlığı ve
"senaryo olarak kaydet". `window.aftRecord.onUpdate` ve `onNotice` aboneliğiyle canlı güncellenir.

### 7.7 Ortak Katman

**`ui.tsx`** — Tasarım sistemi bileşenleri: `PageHead`, `Pill`, `Metric`, `Card`, `Empty`,
`Bar`, `Field`, `Toggle`, `TextButton`, `Segmented`, `Menu`. Hepsi `memo` ile sarılıdır.
`Tone` tipi beş renk tonu tanımlar: `ok`, `warn`, `bad`, `flat`, `accent`.

**`icons.tsx` (411 satır)** — `GLYPHS` sözlüğünde satır içi SVG ikonlar. `Glyph` tek ikonu,
`IconButton` ikon düğmesini (başlık, aktif/pasif, rozet, tehlike varyantı) çizer.

**`themes.ts`** — Dört tema: `grafit`, `gece`, `kagit`, `orman`. `paintTheme(id)` CSS
değişkenlerini `document.documentElement` üzerine yazar, `readTheme()` / `storeTheme()`
`localStorage` ile kalıcılık sağlar, `themeOf(id)` tema nesnesini döner.

**`format.ts`** — `formatMs`, `formatDate`, `formatShortDate`, `formatClock`, `formatBytes`,
`percent`, `ratio`, `shortUrl`, `toUrl`, `clamp`.

**`commands.ts`** — Terminal komut paleti:

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
komutu bulur, `AgentAction` üretip çalıştırır. `readOutcome(result)` `ActionOutcome`'u
okunabilir ayrıntıya çevirir (hazırlık raporu: görünür / etkin / kararlı / üstü açık; diyalog
ve indirme kayıtları). En fazla 400 satır ve 100 komutluk geçmiş tutar.

**`report.ts`** — Sayfalar arası ortak bildirim tipi (`Report`, `ReportLevel`).

**`assets/main.css`** — Tüm görsel stil; CSS değişkenleri üzerinden tema desteği.

---

## 8. IPC Kanal Tablosu

| Ön ek | Kanal sayısı | Tür | Sorumlu |
|---|---|---|---|
| `aft:` (execute, scan, coverage, vision) | 4 | invoke | `main/index.ts` |
| `aft:` (nav, window, chat, terminal, drag, stage, stage-shown, modal, settings, prefs, prefs-patch, chrome, devtools, devtools-split, state) | 15 | send | `main/index.ts` |
| `aft:identity:*` | 11 | invoke | `IdentityChannel` |
| `aft:playback:*` | 14 | invoke | `PlaybackChannel` |
| `aft:record:*` | 10 | invoke | `RecordChannel` |
| `aft:data:*` | 11 | invoke | `DataChannel` |

Main → renderer olayları: `aft:state`, `aft:focus-url`, `aft:focus-terminal`,
`aft:open-palette`, `aft:pointer`, `aft:drag-end`, `aft:prefs`, `aft:prefs-patch`,
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
├── scenarios/                → *.scenario.json (klasör ağacı dahil)
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
npm run regression       # Regresyon havuzu (fixture dizini gerektirir)
npm run repeat:verify    # Sayfa sürümleri arası descriptor kararlılığı
npm run playback         # Tek senaryoyu komut satırından koşar
```

`electron.vite.config.ts` dokuz ayrı main giriş noktası üretir: `index`, `regression`,
`smoke`, `repeat-verify`, `playback`, `playback-verify`, `record-verify`, `verify`,
`data-verify`. Her doğrulama betiği bağımsız bir Electron süreci olarak çalışır ve çıkış
koduyla sonuç bildirir.

Başsız (headless) bir ortamda doğrulama betikleri sanal ekran gerektirir:

```bash
xvfb-run -a npx electron --no-sandbox ./out/main/verify.js
```

---

## 11. Kod İstatistikleri

| Bölüm | Dosya | Satır |
|---|---|---|
| `src/main/` | 125 | ~22.400 |
| `src/renderer/` | 40 | ~9.900 |
| `src/preload/` | 10 | 365 |
| **Toplam** | **175** | **~32.600** |

Main süreç modül dağılımı: `scenario` 3.887, `record` 2.514, `discovery` 2.302,
`action` 2.110, `regression` 1.744, `data` 1.739, `bridge` 1.730, `identity` 1.632,
`browser` 1.360, `model` 1.262, `home` 656, `shell` 99.

En büyük dosyalar: `App.tsx` (936), `ScenarioPage.tsx` (916), `main/index.ts` (873),
`IdentityPage.tsx` (803), `RecordPanel.tsx` (702), `ActionEngine.ts` (627),
`Recorder.ts` (613), `Charts.tsx` (590), `home/page.ts` (579), `InputDispatcher.ts` (502).

---

## 12. Sürüm Politikası

Diske yazılan her yapı sürümlenir ve okuma yolunda doğrulanır:

| Sürüm etiketi | Nerede |
|---|---|
| `elementgraph/1.0.0` | Tarama çıktısı |
| `elementmodel/2.0.0` | `GraphSnapshot` |
| `descriptor/1.0.0` | Descriptor kataloğu |
| `scenario/1.0.0` | Senaryo dosyaları |
| `playbackrun/1.0.0` | Koşum sonuçları |
| `failurecontext/1.0.0` | Hata bağlam paketleri |
| `record/1.0.0` | Kayıt oturumu |
| `regression/1.0.0` | Baseline dosyası |
| SQLite `user_version = 1` | Veri katmanı şeması |

Desteklenmeyen sürüm okunduğunda ilgili hata sınıfı fırlatılır (`ModelValidationError`,
`ScenarioMigrationError`, `DataMigrationError`) ve dosya karantinaya alınır; sessiz veri
kaybı olmaz. Şema değiştiğinde göç adımı ilgili `migrate.ts` dosyasına eklenir.

---

## 13. Bilinen Eksikler

- `package.json` üst düzey alanları (`name: "desktop"`, `author: "example.com"`, `homepage`,
  `description`) ve `electron-builder.yml` içindeki `appId: com.electron.app`,
  `publish.url: https://example.com/auto-updates` hâlâ şablon değerlerinde. Paketleme öncesi
  güncellenmeli.
- `Aft/README.md` electron-vite şablonundan kalma; projenin gerçek amacını anlatmıyor.
- Birim testi yok; doğrulama tamamen `verify` / `smoke` / `regression` betiklerine dayanıyor.
  Bunlar gerçek bir Electron süreci gerektirdiği için CI'da `xvfb` yapılandırması gerekir.
- `npm run regression` havuzu, depoda bulunmayan donmuş fixture sayfalarına ihtiyaç duyar;
  `--fixtures=<dizin>` verilmeden koşmaz.
- `home/page.ts` içindeki 579 satırlık HTML string'i ayrı bir varlık dosyasına taşınırsa
  bakımı kolaylaşır.
- Başsız ortamda `verify` içindeki iki `Ctrl+H` kısayol kontrolü ve `record:verify` içindeki
  üç imleç bekleme kontrolü gerçek imleç hareketi gerektirdiği için geçmez; bunlar masaüstü
  ortamında koşulmalıdır.
