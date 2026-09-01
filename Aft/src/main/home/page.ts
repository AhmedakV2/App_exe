import { FAVICON_ENDPOINT, SEARCH_ENDPOINT } from './search'

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
        --ui: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
        --mono: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
        --step: 90ms linear;
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
        font: 450 13.5px / 1.5 var(--ui);
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
        max-width: 520px;
        margin-top: -6vh;
      }

      .brand {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 9px;
        margin-bottom: 22px;
        color: var(--faint);
      }

      .brand span {
        font: 650 19px var(--ui);
        letter-spacing: 0.09em;
        color: var(--text);
      }

      .omni {
        display: flex;
        align-items: center;
        gap: 11px;
        height: 44px;
        padding: 0 16px;
        background: var(--field);
        border: var(--hair) solid var(--line);
        border-radius: var(--r);
        transition:
          border-color var(--step),
          background-color var(--step);
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

      #field {
        flex: 1;
        min-width: 0;
        height: 100%;
        border: 0;
        outline: none;
        background: transparent;
        font: 450 14px var(--ui);
      }

      #field::placeholder {
        color: var(--faint);
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 8px;
        margin-top: 12px;
      }

      .slot {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        height: 78px;
        padding: 0 8px;
        background: var(--panel);
        border: var(--hair) solid var(--line);
        border-radius: var(--r);
        color: var(--muted);
        cursor: pointer;
        transition:
          background-color var(--step),
          border-color var(--step),
          color var(--step);
      }

      .slot:hover {
        background: var(--raised);
        border-color: var(--edge);
        color: var(--text);
      }

      .slot.empty {
        background: transparent;
        color: var(--faint);
      }

      .slot.empty:hover {
        background: var(--panel);
      }

      .badge {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        background: var(--field);
        border: var(--hair) solid var(--line);
        border-radius: 6px;
        font: 600 12px var(--mono);
        text-transform: uppercase;
        color: var(--muted);
      }

      .badge img {
        display: none;
        width: 17px;
        height: 17px;
        border-radius: 3px;
        object-fit: contain;
      }

      .badge.ready span {
        display: none;
      }

      .badge.ready img {
        display: block;
      }

      .label {
        max-width: 100%;
        overflow: hidden;
        font: 500 11px var(--ui);
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .drop {
        position: absolute;
        top: 4px;
        right: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 17px;
        height: 17px;
        padding: 0;
        border: 0;
        border-radius: 4px;
        background: transparent;
        color: var(--faint);
        opacity: 0;
        cursor: pointer;
        transition:
          opacity var(--step),
          color var(--step),
          background-color var(--step);
      }

      .slot:hover .drop {
        opacity: 1;
      }

      .drop:hover {
        background: var(--hover);
        color: var(--text);
      }

      .adder {
        display: none;
        gap: 8px;
        margin-top: 8px;
      }

      .adder.on {
        display: flex;
      }

      #link {
        flex: 1;
        min-width: 0;
        height: 34px;
        padding: 0 12px;
        background: var(--field);
        border: var(--hair) solid var(--line);
        border-radius: var(--r-sm);
        outline: none;
        font: 450 13px var(--ui);
        transition: border-color var(--step);
      }

      #link:focus {
        border-color: var(--edge);
      }

      #link::placeholder {
        color: var(--faint);
      }

      #save {
        flex: 0 0 auto;
        height: 34px;
        padding: 0 16px;
        background: var(--raised);
        border: var(--hair) solid var(--line);
        border-radius: var(--r-sm);
        color: var(--muted);
        font: 550 12px var(--ui);
        cursor: pointer;
        transition:
          background-color var(--step),
          border-color var(--step),
          color var(--step);
      }

      #save:hover {
        background: var(--hover);
        border-color: var(--edge);
        color: var(--text);
      }
    </style>
  </head>
  <body>
    <main>
      <div class="brand">
        <svg width="21" height="21" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
          <path d="M212 60 L300 60 L458 428 L352 428 L258 188 L182 348 L250 348 L296 398 L258 398 L222 428 L54 428 Z" />
        </svg>
      </div>

      <form id="form" autocomplete="off">
        <div class="omni">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="11" cy="11" r="7"></circle>
            <path d="M20 20l-3.6-3.6"></path>
          </svg>
          <input id="field" type="text" placeholder="Ara ya da adres yaz" spellcheck="false" />
        </div>
      </form>

      <div class="grid" id="grid"></div>

      <form class="adder" id="adder" autocomplete="off">
        <input id="link" type="text" placeholder="Kısa yol adresi" spellcheck="false" />
        <button id="save" type="submit">Ekle</button>
      </form>
    </main>
    <script>
      (function () {
        var SEARCH = '${SEARCH_ENDPOINT}'
        var MIRROR = '${FAVICON_ENDPOINT}'
        var KEY = 'aft:home:links'
        var SLOTS = 5
        var form = document.getElementById('form')
        var field = document.getElementById('field')
        var grid = document.getElementById('grid')
        var adder = document.getElementById('adder')
        var link = document.getElementById('link')

        function read() {
          try {
            var raw = window.localStorage.getItem(KEY)
            var parsed = raw ? JSON.parse(raw) : []
            if (!Array.isArray(parsed)) return []
            return parsed
              .filter(function (item) {
                return item && typeof item.u === 'string' && typeof item.t === 'string'
              })
              .slice(0, SLOTS)
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

        function resolve(text) {
          var value = text.trim()
          if (!value) return ''
          if (/^(localhost|[0-9]{1,3}(\\.[0-9]{1,3}){3})(:[0-9]+)?(\\/|$)/i.test(value)) {
            return 'http://' + value
          }
          if (/^(?!javascript:|data:)[a-z][a-z0-9+.-]*:(\\/\\/|[^0-9])/i.test(value)) return value
          if (/^[^\\s/?#]+\\.[^\\s/?#]{2,}/.test(value)) return 'https://' + value
          return SEARCH + encodeURIComponent(value)
        }

        function labelOf(url, fallback) {
          try {
            var host = new URL(url).host.replace(/^www\\./i, '')
            return host || fallback
          } catch (err) {
            return fallback
          }
        }

        function icon(path, size) {
          var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
          svg.setAttribute('width', String(size))
          svg.setAttribute('height', String(size))
          svg.setAttribute('viewBox', '0 0 24 24')
          svg.setAttribute('fill', 'none')
          svg.setAttribute('stroke', 'currentColor')
          svg.setAttribute('stroke-width', '2')
          svg.setAttribute('stroke-linecap', 'round')
          var line = document.createElementNS('http://www.w3.org/2000/svg', 'path')
          line.setAttribute('d', path)
          svg.appendChild(line)
          return svg
        }

        function badgeOf(item) {
          var badge = document.createElement('div')
          badge.className = 'badge'

          var letter = document.createElement('span')
          letter.textContent = item.t.slice(0, 1)
          badge.appendChild(letter)

          var origin = ''
          var host = ''
          try {
            var parsed = new URL(item.u)
            origin = parsed.origin
            host = parsed.host
          } catch (err) {
            return badge
          }
          if (!host || origin === 'null') return badge

          var img = document.createElement('img')
          img.alt = ''
          var tried = 0
          img.addEventListener('load', function () {
            if (img.naturalWidth > 0) badge.className = 'badge ready'
          })
          img.addEventListener('error', function () {
            tried += 1
            if (tried === 1) img.src = MIRROR + encodeURIComponent(host)
            else img.remove()
          })
          img.src = origin + '/favicon.ico'
          badge.appendChild(img)
          return badge
        }

        function filled(item, index) {
          var slot = document.createElement('div')
          slot.className = 'slot'
          slot.title = item.u

          var badge = badgeOf(item)

          var label = document.createElement('div')
          label.className = 'label'
          label.textContent = item.t

          var drop = document.createElement('button')
          drop.className = 'drop'
          drop.type = 'button'
          drop.appendChild(icon('M6 6l12 12M18 6L6 18', 11))
          drop.addEventListener('click', function (event) {
            event.stopPropagation()
            var items = read()
            items.splice(index, 1)
            write(items)
            paint()
          })

          slot.appendChild(badge)
          slot.appendChild(label)
          slot.appendChild(drop)
          slot.addEventListener('click', function () {
            window.location.href = item.u
          })
          return slot
        }

        function blank() {
          var slot = document.createElement('div')
          slot.className = 'slot empty'
          slot.appendChild(icon('M12 5v14M5 12h14', 15))
          slot.addEventListener('click', function () {
            adder.className = 'adder on'
            link.focus()
          })
          return slot
        }

        function paint() {
          var items = read()
          grid.textContent = ''
          items.forEach(function (item, index) {
            grid.appendChild(filled(item, index))
          })
          for (var i = items.length; i < SLOTS; i += 1) grid.appendChild(blank())
          if (items.length >= SLOTS) adder.className = 'adder'
        }

        form.addEventListener('submit', function (event) {
          event.preventDefault()
          var url = resolve(field.value)
          if (url) window.location.href = url
        })

        adder.addEventListener('submit', function (event) {
          event.preventDefault()
          var text = link.value.trim()
          var url = resolve(text)
          if (!url) return
          var items = read()
          if (items.length >= SLOTS) return
          items.push({ u: url, t: labelOf(url, text) })
          write(items)
          link.value = ''
          adder.className = 'adder'
          paint()
          field.focus()
        })

        field.addEventListener('keydown', function (event) {
          if (event.key === 'Escape') field.value = ''
        })

        link.addEventListener('keydown', function (event) {
          if (event.key !== 'Escape') return
          link.value = ''
          adder.className = 'adder'
          field.focus()
        })

        paint()
        field.focus()
      })()
    </script>
  </body>
</html>
`
}
