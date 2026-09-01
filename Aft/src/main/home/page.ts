import { SEARCH_ENDPOINT } from './search'

interface HomeSkin {
  bg: string
  panel: string
  raised: string
  field: string
  hover: string
  line: string
  edge: string
  text: string
  muted: string
  faint: string
}

const SKINS: Record<string, HomeSkin> = {
  grafit: {
    bg: '#0b0c0e',
    panel: '#1a1c20',
    raised: '#212429',
    field: '#101115',
    hover: '#2b2f36',
    line: '#292c33',
    edge: '#3b4048',
    text: '#eef0f4',
    muted: '#adb4bf',
    faint: '#767d89'
  },
  gece: {
    bg: '#050912',
    panel: '#111a28',
    raised: '#182333',
    field: '#08101b',
    hover: '#22314a',
    line: '#1e2b3e',
    edge: '#2f4260',
    text: '#e9f1fd',
    muted: '#aab9d0',
    faint: '#6f819c'
  },
  kagit: {
    bg: '#eef0f4',
    panel: '#ffffff',
    raised: '#f5f7fa',
    field: '#ffffff',
    hover: '#e9edf3',
    line: '#dfe3ea',
    edge: '#c6ccd6',
    text: '#101319',
    muted: '#4b5462',
    faint: '#7b8391'
  },
  orman: {
    bg: '#060f0b',
    panel: '#14211a',
    raised: '#1b2c23',
    field: '#0b1510',
    hover: '#24382c',
    line: '#1f3327',
    edge: '#35523f',
    text: '#e9f6ee',
    muted: '#adc8b8',
    faint: '#718f7d'
  }
}

export function skinOf(theme: string): HomeSkin {
  return SKINS[theme] ?? SKINS.grafit
}

export function homePage(theme: string): string {
  const skin = skinOf(theme)

  return `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AFT</title>
    <style>
      :root {
        --bg: ${skin.bg};
        --panel: ${skin.panel};
        --raised: ${skin.raised};
        --field: ${skin.field};
        --hover: ${skin.hover};
        --line: ${skin.line};
        --edge: ${skin.edge};
        --text: ${skin.text};
        --muted: ${skin.muted};
        --faint: ${skin.faint};

        --hair: 1px;
        --r: 8px;
        --r-sm: 5px;
        --sp-2: 8px;
        --sp-3: 14px;
        --sp-4: 18px;
        --fs-micro: 11px;
        --fs-meta: 12px;
        --fs-body: 13.5px;
        --track: 0.1em;
        --ui: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
        --mono: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        height: 100%;
        margin: 0;
      }

      body {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 28px;
        background: var(--bg);
        color: var(--text);
        font: 450 var(--fs-body) / 1.5 var(--ui);
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
      }

      button,
      input {
        font: inherit;
        color: inherit;
      }

      main {
        width: 100%;
        max-width: 540px;
        margin-top: -5vh;
      }

      .brand {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 9px;
        color: var(--muted);
      }

      .brand span {
        font: 650 22px var(--ui);
        letter-spacing: 0.06em;
        color: var(--text);
      }

      .note {
        margin: 7px 0 var(--sp-4);
        font: 650 var(--fs-micro) var(--ui);
        letter-spacing: var(--track);
        text-transform: uppercase;
        color: var(--faint);
        text-align: center;
      }

      .panel {
        background: var(--panel);
        border: var(--hair) solid var(--line);
        border-radius: var(--r);
      }

      .panel-head {
        display: flex;
        align-items: center;
        gap: var(--sp-2);
        height: 38px;
        padding: 0 var(--sp-3);
        border-bottom: var(--hair) solid var(--line);
      }

      .panel-title {
        display: flex;
        align-items: center;
        gap: var(--sp-2);
        font: 650 var(--fs-micro) var(--ui);
        letter-spacing: var(--track);
        text-transform: uppercase;
        color: var(--muted);
      }

      .panel-title::before {
        content: '';
        width: 3px;
        height: 12px;
        border-radius: 2px;
        background: var(--edge);
      }

      .push {
        flex: 1;
      }

      .meta {
        font: 500 var(--fs-micro) var(--mono);
        color: var(--faint);
      }

      .panel-body {
        display: flex;
        flex-direction: column;
        gap: var(--sp-2);
        padding: var(--sp-3);
      }

      form {
        display: flex;
        align-items: center;
        gap: var(--sp-2);
      }

      .omni {
        display: flex;
        align-items: center;
        gap: 9px;
        flex: 1;
        min-width: 0;
        height: 34px;
        padding: 0 var(--sp-3);
        background: var(--field);
        border: var(--hair) solid var(--line);
        border-radius: var(--r-sm);
        transition:
          border-color 90ms linear,
          background-color 90ms linear;
      }

      .omni:hover {
        border-color: var(--edge);
      }

      .omni:focus-within {
        border-color: var(--edge);
        background: var(--panel);
      }

      .omni svg {
        flex: 0 0 auto;
        color: var(--faint);
      }

      input {
        flex: 1;
        min-width: 0;
        height: 100%;
        border: 0;
        outline: none;
        background: transparent;
        font: 450 var(--fs-body) var(--ui);
      }

      input::placeholder {
        color: var(--faint);
      }

      .go {
        flex: 0 0 auto;
        height: 34px;
        padding: 0 var(--sp-4);
        background: var(--raised);
        border: var(--hair) solid var(--line);
        border-radius: var(--r-sm);
        color: var(--muted);
        font: 550 var(--fs-meta) var(--ui);
        cursor: pointer;
        transition:
          color 90ms linear,
          background-color 90ms linear,
          border-color 90ms linear;
      }

      .go:hover {
        background: var(--hover);
        border-color: var(--edge);
        color: var(--text);
      }

      .hint {
        margin: 0;
        font: 450 var(--fs-meta) var(--ui);
        color: var(--faint);
      }

      .split {
        display: none;
        margin-top: 6px;
        padding-top: var(--sp-3);
        border-top: var(--hair) solid var(--line);
      }

      .split.on {
        display: block;
      }

      .split-head {
        display: flex;
        align-items: center;
        margin-bottom: 9px;
        font: 650 var(--fs-micro) var(--ui);
        letter-spacing: var(--track);
        text-transform: uppercase;
        color: var(--muted);
      }

      .link {
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--faint);
        font: 650 var(--fs-micro) var(--ui);
        letter-spacing: var(--track);
        text-transform: uppercase;
        cursor: pointer;
        transition: color 90ms linear;
      }

      .link:hover {
        color: var(--text);
      }

      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
      }

      .chip {
        max-width: 240px;
        overflow: hidden;
        padding: 4px 9px;
        background: var(--field);
        border: var(--hair) solid var(--line);
        border-radius: 4px;
        color: var(--muted);
        font: 500 var(--fs-micro) var(--mono);
        white-space: nowrap;
        text-overflow: ellipsis;
        cursor: pointer;
        transition:
          color 90ms linear,
          background-color 90ms linear,
          border-color 90ms linear;
      }

      .chip:hover {
        background: var(--hover);
        border-color: var(--edge);
        color: var(--text);
      }
    </style>
  </head>
  <body>
    <main>
      <div class="brand">
        <svg width="24" height="24" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
          <path d="M212 60 L300 60 L458 428 L352 428 L258 188 L182 348 L250 348 L296 398 L258 398 L222 428 L54 428 Z" />
        </svg>
        <span>AFT</span>
      </div>
      <p class="note">Test tarayıcısı</p>

      <section class="panel">
        <div class="panel-head">
          <span class="panel-title">Başlangıç</span>
          <span class="push"></span>
          <span class="meta">aft://home</span>
        </div>
        <div class="panel-body">
          <form id="form" autocomplete="off">
            <div class="omni">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <circle cx="11" cy="11" r="7"></circle>
                <path d="M20 20l-3.6-3.6"></path>
              </svg>
              <input id="field" type="text" placeholder="Ara ya da adres yaz" spellcheck="false" />
            </div>
            <button class="go" type="submit">Ara</button>
          </form>
          <p class="hint">Adres yazarsan doğrudan açılır, kelime yazarsan aranır.</p>
          <div class="split" id="recent">
            <div class="split-head">
              <span>Son aramalar</span>
              <span class="push"></span>
              <button class="link" type="button" id="clear">Temizle</button>
            </div>
            <div class="chips" id="list"></div>
          </div>
        </div>
      </section>
    </main>
    <script>
      (function () {
        var SEARCH = '${SEARCH_ENDPOINT}'
        var KEY = 'aft:home:recent'
        var LIMIT = 6
        var form = document.getElementById('form')
        var field = document.getElementById('field')
        var recent = document.getElementById('recent')
        var list = document.getElementById('list')
        var clear = document.getElementById('clear')

        function read() {
          try {
            var raw = window.localStorage.getItem(KEY)
            var parsed = raw ? JSON.parse(raw) : []
            if (!Array.isArray(parsed)) return []
            return parsed
              .filter(function (item) {
                return typeof item === 'string' && item.length > 0
              })
              .slice(0, LIMIT)
          } catch (err) {
            return []
          }
        }

        function write(items) {
          try {
            window.localStorage.setItem(KEY, JSON.stringify(items))
          } catch (err) {
            return
          }
        }

        function paint() {
          var items = read()
          list.textContent = ''
          items.forEach(function (item) {
            var chip = document.createElement('button')
            chip.type = 'button'
            chip.className = 'chip'
            chip.textContent = item
            chip.addEventListener('click', function () {
              go(item)
            })
            list.appendChild(chip)
          })
          recent.className = items.length ? 'split on' : 'split'
        }

        function remember(text) {
          var items = read().filter(function (item) {
            return item !== text
          })
          items.unshift(text)
          write(items.slice(0, LIMIT))
        }

        function resolve(text) {
          var value = text.trim()
          if (!value) return ''
          if (/^(localhost|[0-9]{1,3}(\\.[0-9]{1,3}){3})(:[0-9]+)?(\\/|$)/i.test(value)) {
            return 'http://' + value
          }
          if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value
          if (/^[^\\s/?#]+\\.[^\\s/?#]{2,}/.test(value)) return 'https://' + value
          return SEARCH + encodeURIComponent(value)
        }

        function go(text) {
          var url = resolve(text)
          if (!url) return
          remember(text.trim())
          window.location.href = url
        }

        form.addEventListener('submit', function (event) {
          event.preventDefault()
          go(field.value)
        })

        field.addEventListener('keydown', function (event) {
          if (event.key === 'Escape') field.value = ''
        })

        clear.addEventListener('click', function () {
          write([])
          paint()
        })

        paint()
        field.focus()
      })()
    </script>
  </body>
</html>
`
}
