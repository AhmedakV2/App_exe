export const RECORD_PAGE = `<!doctype html>
<html lang="tr">
<head><meta charset="utf-8"><title>AFT Kayit Formu</title>
<style>
body { margin: 0; font: 14px sans-serif; }
.box { padding: 10px; }
label { display: inline-block; width: 120px; }
.kart { padding: 8px 12px; border: 1px solid #888; display: inline-block; cursor: pointer; }
iframe { width: 420px; height: 120px; border: 1px solid #ccc; }
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
  <p><button data-testid="gonder" id="gonder" type="submit">Gonder</button></p>
</form>

<div class="box">
  <div class="kart x7f2a9c" id="">Kalici kimligi olmayan kart</div>
</div>

<div class="box"><aft-kutu></aft-kutu></div>

<div class="box"><iframe id="ic" src="ic.html" title="ic cerceve"></iframe></div>

<p id="durum" class="box">form bekliyor</p>

<script>
document.getElementById('sozlesme').addEventListener('change', function () {
  document.getElementById('durum').textContent = this.checked ? 'sozlesme onaylandi' : 'form bekliyor';
});

document.querySelector('.kart').addEventListener('click', function () {
  document.getElementById('durum').textContent = 'kart secildi';
});

class AftKutu extends HTMLElement {
  connectedCallback() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>button{padding:6px 10px}</style>' +
      '<button data-testid="golge-dugme" id="golge">Golge dugmesi</button>';
    root.getElementById('golge').addEventListener('click', function () {
      document.getElementById('durum').textContent = 'golge dugmesi calisti';
    });
  }
}
customElements.define('aft-kutu', AftKutu);
</script>
</body>
</html>`

export const RECORD_FRAME_PAGE = `<!doctype html>
<html lang="tr">
<head><meta charset="utf-8"><title>Ic cerceve</title></head>
<body style="margin:0;font:14px sans-serif">
<button data-testid="cerceve-dugme" id="cerceve">Cerceve dugmesi</button>
<p id="cerceve-durum">bekliyor</p>
<script>
document.getElementById('cerceve').addEventListener('click', function () {
  document.getElementById('cerceve-durum').textContent = 'cerceve dugmesi calisti';
});
</script>
</body>
</html>`

export const RECORD_RESULT_PAGE = `<!doctype html>
<html lang="tr">
<head><meta charset="utf-8"><title>AFT Kayit Sonuc</title></head>
<body>
<h1 id="baslik">Kayit Tamam</h1>
<p id="sonuc">kayit alindi</p>
<p id="ozet"></p>
<script>
var params = new URLSearchParams(location.search);
document.getElementById('ozet').textContent = (params.get('ad') || '') + ' / ' + (params.get('sehir') || '');
</script>
</body>
</html>`
