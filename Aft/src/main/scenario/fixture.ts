export const PLAYBACK_PAGE = `<!doctype html>
<html lang="tr">
<head><meta charset="utf-8"><title>AFT Playback Formu</title>
<style>
body { margin: 0; font: 14px sans-serif; }
.box { padding: 10px; }
label { display: inline-block; width: 120px; }
</style>
</head>
<body>
<h1 id="baslik">Kayit Formu</h1>

<form id="kayit" class="box" action="tamam.html" method="get">
  <p><label for="ad">Ad</label><input id="ad" name="ad" type="text"></p>
  <p><label for="eposta">Eposta</label><input id="eposta" name="eposta" type="text"></p>
  <p><label for="sehir">Sehir</label>
    <select id="sehir" name="sehir">
      <option value="ank">Ankara</option>
      <option value="ist">Istanbul</option>
      <option value="izm">Izmir</option>
    </select>
  </p>
  <p><label for="sozlesme">Sozlesme</label><input id="sozlesme" name="sozlesme" type="checkbox"></p>
  <p>
    <button data-testid="gonder" id="gonder" type="submit">Gonder</button>
    <button data-testid="temizle" id="temizle" type="reset">Temizle</button>
    <button data-testid="pasif" id="pasif" type="button" disabled>Pasif</button>
  </p>
</form>

<p id="durum" class="box">form bekliyor</p>
<div id="gec" class="box"></div>

<script>
document.getElementById('sozlesme').addEventListener('change', function () {
  document.getElementById('durum').textContent = this.checked ? 'sozlesme onaylandi' : 'form bekliyor';
});

setTimeout(function () {
  document.getElementById('gec').innerHTML = '<span data-testid="gec-yazi">gec gelen icerik</span>';
}, 120);
</script>
</body>
</html>`

export const PLAYBACK_RESULT_PAGE = `<!doctype html>
<html lang="tr">
<head><meta charset="utf-8"><title>AFT Playback Sonuc</title></head>
<body>
<h1 id="baslik">Kayit Tamam</h1>
<p id="sonuc">kayit alindi</p>
<p id="ozet"></p>
<button data-testid="geri" id="geri" onclick="location.href='index.html'">Geri don</button>
<script>
var params = new URLSearchParams(location.search);
document.getElementById('ozet').textContent = (params.get('ad') || '') + ' / ' + (params.get('sehir') || '');
</script>
</body>
</html>`

export const PLAYBACK_SCENARIO = `{
  "version": "scenario/1.0.0",
  "id": "aft-playback-fixture",
  "title": "Kayit formu akisi",
  "description": "Faz 6 bitis kriteri icin elle yazilmis referans senaryo",
  "baseUrl": "http://127.0.0.1/",
  "defaults": {
    "scanLevel": 1,
    "stepTimeoutMs": 20000,
    "retries": 1,
    "stopOnFailure": true,
    "verifyState": true,
    "allowLowConfidence": false
  },
  "steps": [
    {
      "id": "acilis",
      "kind": "navigate",
      "title": "Formu ac",
      "url": "index.html"
    },
    {
      "id": "baslik-dogrula",
      "kind": "assert",
      "title": "Baslik dogrulamasi",
      "assert": "title-contains",
      "expected": "Playback Formu"
    },
    {
      "id": "hazirlik",
      "kind": "group",
      "title": "Form alanlari",
      "steps": [
        {
          "id": "gonder-var",
          "kind": "assert",
          "title": "Gonder dugmesi var",
          "assert": "element-exists",
          "target": { "testId": "gonder" }
        },
        {
          "id": "gonder-tek",
          "kind": "assert",
          "title": "Gonder dugmesi tek",
          "assert": "element-count",
          "target": { "testId": "gonder" },
          "count": 1
        },
        {
          "id": "pasif-dugme",
          "kind": "assert",
          "title": "Pasif dugme devredisi",
          "assert": "attribute-equals",
          "target": { "testId": "pasif" },
          "attribute": "disabled",
          "expected": ""
        },
        {
          "id": "ad-yaz",
          "kind": "clear-type",
          "title": "Ad alanini doldur",
          "target": { "fieldName": "ad" },
          "text": "Ahmet"
        },
        {
          "id": "eposta-yaz",
          "kind": "clear-type",
          "title": "Eposta alanini doldur",
          "target": { "elementId": "eposta" },
          "text": "ahmet@ornek.test"
        },
        {
          "id": "sehir-sec",
          "kind": "select-option",
          "title": "Sehir sec",
          "target": { "fieldName": "sehir" },
          "optionValue": "ist"
        },
        {
          "id": "sozlesme-isaretle",
          "kind": "click",
          "title": "Sozlesmeyi isaretle",
          "target": { "fieldName": "sozlesme" }
        },
        {
          "id": "sozlesme-dogrula",
          "kind": "assert",
          "title": "Sozlesme isaretli",
          "assert": "element-checked",
          "target": { "fieldName": "sozlesme" },
          "expected": "true"
        },
        {
          "id": "durum-dogrula",
          "kind": "assert",
          "title": "Durum metni guncellendi",
          "assert": "text-equals",
          "target": { "elementId": "durum" },
          "expected": "sozlesme onaylandi"
        }
      ]
    },
    {
      "id": "ad-degeri",
      "kind": "assert",
      "title": "Ad degeri dogrulamasi",
      "assert": "value-equals",
      "target": { "fieldName": "ad" },
      "expected": "Ahmet"
    },
    {
      "id": "gonder-tikla",
      "kind": "click",
      "title": "Formu gonder",
      "target": { "testId": "gonder" },
      "condition": { "kind": "previous-passed" }
    },
    {
      "id": "gecis-bekle",
      "kind": "wait",
      "title": "Sayfa gecisini bekle"
    },
    {
      "id": "sonuc-adres",
      "kind": "assert",
      "title": "Sonuc adresi",
      "assert": "url-matches",
      "expected": "*tamam.html*"
    },
    {
      "id": "sonuc-metni",
      "kind": "assert",
      "title": "Sonuc metni",
      "assert": "text-equals",
      "target": { "elementId": "sonuc" },
      "expected": "kayit alindi"
    },
    {
      "id": "ozet-metni",
      "kind": "assert",
      "title": "Ozet metni",
      "assert": "text-contains",
      "target": { "elementId": "ozet" },
      "expected": "Ahmet"
    },
    {
      "id": "form-yok",
      "kind": "assert",
      "title": "Form artik yok",
      "assert": "element-absent",
      "target": { "testId": "gonder" }
    },
    {
      "id": "geri-don",
      "kind": "click",
      "title": "Forma geri don",
      "target": { "name": "Geri don" }
    },
    {
      "id": "geri-dogrula",
      "kind": "assert",
      "title": "Form yeniden acildi",
      "assert": "element-exists",
      "target": { "testId": "gonder" }
    }
  ]
}
`
