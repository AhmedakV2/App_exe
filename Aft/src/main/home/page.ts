import { SEARCH_ENDPOINT } from './search'

interface HomeSkin {
  bg: string
  panel: string
  field: string
  line: string
  text: string
  muted: string
  accent: string
  accentInk: string
  glow: string
}

const SKINS: Record<string, HomeSkin> = {
  grafit: {
    bg: '#0b0c0e',
    panel: '#1a1c20',
    field: '#101115',
    line: '#292c33',
    text: '#eef0f4',
    muted: '#adb4bf',
    accent: '#ff7a29',
    accentInk: '#17130d',
    glow: 'rgba(255, 122, 41, 0.16)'
  },
  gece: {
    bg: '#050912',
    panel: '#111a28',
    field: '#08101b',
    line: '#1e2b3e',
    text: '#e9f1fd',
    muted: '#aab9d0',
    accent: '#4aa8ff',
    accentInk: '#04121f',
    glow: 'rgba(74, 168, 255, 0.16)'
  },
  kagit: {
    bg: '#eef0f4',
    panel: '#ffffff',
    field: '#ffffff',
    line: '#dfe3ea',
    text: '#101319',
    muted: '#4b5462',
    accent: '#3355e0',
    accentInk: '#ffffff',
    glow: 'rgba(51, 85, 224, 0.1)'
  },
  orman: {
    bg: '#060f0b',
    panel: '#14211a',
    field: '#0b1510',
    line: '#1f3327',
    text: '#e9f6ee',
    muted: '#adc8b8',
    accent: '#4fd18b',
    accentInk: '#05120a',
    glow: 'rgba(79, 209, 139, 0.15)'
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
        --field: ${skin.field};
        --line: ${skin.line};
        --text: ${skin.text};
        --muted: ${skin.muted};
        --accent: ${skin.accent};
        --accent-ink: ${skin.accentInk};
        --glow: ${skin.glow};
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
        padding: 32px;
        color: var(--text);
        background: var(--bg);
        background-image: radial-gradient(circle at 50% 26%, var(--glow), transparent 62%);
        font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
        -webkit-font-smoothing: antialiased;
      }

      main {
        width: 100%;
        max-width: 620px;
        margin-top: -6vh;
      }

      .mark {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        font-size: 34px;
        font-weight: 600;
        letter-spacing: 0.22em;
        text-indent: 0.22em;
      }

      .dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--accent);
      }

      .tag {
        margin: 10px 0 30px;
        color: var(--muted);
        font-size: 13px;
        letter-spacing: 0.04em;
        text-align: center;
      }

      form {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 8px 8px 16px;
        border: 1px solid var(--line);
        border-radius: 14px;
        background: var(--field);
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }

      form:focus-within {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--glow);
      }

      svg {
        flex: none;
        color: var(--muted);
      }

      input {
        flex: 1;
        min-width: 0;
        height: 40px;
        border: 0;
        outline: 0;
        background: transparent;
        color: var(--text);
        font-family: inherit;
        font-size: 15px;
      }

      input::placeholder {
        color: var(--muted);
        opacity: 0.75;
      }

      button {
        flex: none;
        height: 40px;
        padding: 0 20px;
        border: 0;
        border-radius: 10px;
        background: var(--accent);
        color: var(--accent-ink);
        font-family: inherit;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
      }

      button:hover {
        filter: brightness(1.08);
      }

      .hint {
        margin-top: 14px;
        color: var(--muted);
        font-size: 12px;
        text-align: center;
        opacity: 0.85;
      }

      .recent {
        display: none;
        margin-top: 28px;
      }

      .recent.on {
        display: block;
      }

      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
        color: var(--muted);
        font-size: 11px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .head span {
        cursor: default;
      }

      .head a {
        color: var(--muted);
        cursor: pointer;
        text-decoration: none;
      }

      .head a:hover {
        color: var(--accent);
      }

      .list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .chip {
        max-width: 260px;
        overflow: hidden;
        padding: 7px 14px;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: var(--panel);
        color: var(--text);
        font-family: inherit;
        font-size: 13px;
        font-weight: 400;
        white-space: nowrap;
        text-overflow: ellipsis;
        cursor: pointer;
      }

      .chip:hover {
        border-color: var(--accent);
        filter: none;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="mark"><span class="dot"></span>AFT</div>
      <p class="tag">Test tarayıcısı</p>
      <form id="form" autocomplete="off">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="11" cy="11" r="7"></circle>
          <path d="M20 20l-3.6-3.6"></path>
        </svg>
        <input id="field" type="text" placeholder="Ara ya da adres yaz" spellcheck="false" />
        <button type="submit">Ara</button>
      </form>
      <p class="hint">Adres yazarsan doğrudan açılır, kelime yazarsan aranır.</p>
      <section class="recent" id="recent">
        <div class="head">
          <span>Son aramalar</span>
          <a id="clear">temizle</a>
        </div>
        <div class="list" id="list"></div>
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
          recent.className = items.length ? 'recent on' : 'recent'
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
