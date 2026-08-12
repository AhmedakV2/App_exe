export const SMOKE_PAGE = `<!doctype html>
<html lang="tr">
<head><meta charset="utf-8"><title>AFT Smoke</title>
<style>
body { margin: 0; font: 14px sans-serif; }
.box { padding: 8px; }
#hidden-under { position: fixed; left: 40px; top: 520px; width: 160px; height: 40px; }
#cover { position: fixed; left: 0; top: 500px; width: 400px; height: 90px; background: #123456; }
</style>
</head>
<body>
<div class="box">
  <button data-testid="primary-action" id="primary">Gonder</button>
  <button id="secondary">Iptal</button>
  <p id="result">bekliyor</p>
</div>

<form id="login" action="/session" method="post" class="box">
  <label for="user">Kullanici</label>
  <input id="user" name="username" type="text">
  <label for="pass">Parola</label>
  <input id="pass" name="password" type="password">
  <select id="city" name="city">
    <option value="ank">Ankara</option>
    <option value="ist">Istanbul</option>
  </select>
</form>

<button id="hidden-under">Kapali dugme</button>
<div id="cover"></div>

<div class="box"><canvas id="board" width="200" height="80"></canvas></div>
<div class="box"><iframe id="inner" src="inner.html" width="360" height="140"></iframe></div>

<div id="host-a" class="box"></div>
<div id="late" class="box"></div>

<script>
document.getElementById('primary').addEventListener('click', function () {
  document.getElementById('result').textContent = 'tiklandi';
});

var hostA = document.getElementById('host-a').attachShadow({ mode: 'open' });
hostA.innerHTML = '<button data-testid="shadow-action">Shadow dugme</button><div id="host-b"></div>';
var hostB = hostA.querySelector('#host-b').attachShadow({ mode: 'open' });
hostB.innerHTML = '<button data-testid="deep-action">Derin dugme</button>';

setTimeout(function () {
  document.getElementById('late').innerHTML = '<button id="late-action">Gec gelen</button>';
}, 120);
</script>
</body>
</html>`

export const SMOKE_FRAME = `<!doctype html>
<html lang="tr">
<head><meta charset="utf-8"><title>Ic cerceve</title></head>
<body>
  <button data-testid="frame-action">Cerceve dugmesi</button>
  <input id="frame-input" name="note" type="text">
</body>
</html>`
