import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
}

export class FixtureServer {
  private server: Server | null = null
  private port = 0

  constructor(private readonly root: string) {}

  async start(): Promise<string> {
    if (this.server) return this.origin()

    const root = resolve(this.root)
    const server = createServer((request, response) => {
      const target = safeJoin(root, request.url ?? '/')
      if (!target) {
        response.writeHead(403).end()
        return
      }

      stat(target)
        .then((info) => {
          const file = info.isDirectory() ? join(target, 'index.html') : target
          response.writeHead(200, {
            'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
            'cache-control': 'no-store'
          })
          createReadStream(file)
            .on('error', () => response.destroy())
            .pipe(response)
        })
        .catch(() => response.writeHead(404).end())
    })

    await new Promise<void>((done, fail) => {
      server.once('error', fail)
      server.listen(0, '127.0.0.1', () => {
        server.removeListener('error', fail)
        done()
      })
    })

    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Fixture sunucusu baslatilamadi')

    this.server = server
    this.port = address.port
    return this.origin()
  }

  origin(): string {
    if (!this.port) throw new Error('Fixture sunucusu calismyor')
    return 'http://127.0.0.1:' + this.port
  }

  urlFor(location: string): string {
    return this.origin() + '/' + location.replace(/^\/+/, '')
  }

  async stop(): Promise<void> {
    const server = this.server
    if (!server) return
    this.server = null
    this.port = 0
    await new Promise<void>((done) => server.close(() => done()))
  }
}

function safeJoin(root: string, url: string): string | null {
  const path = decodeURIComponent(url.split('?')[0] ?? '/')
  const target = resolve(join(root, normalize(path)))
  return target === root || target.startsWith(root + sep) ? target : null
}
