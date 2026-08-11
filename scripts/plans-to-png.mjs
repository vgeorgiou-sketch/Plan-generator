/**
 * plans/*.pdf  ->  public/plans/*.png
 *
 * Renders page 1 of every PDF in plans/ to a high-res PNG. Uses pdf.js inside
 * headless Chromium (both already project dependencies) so there is no
 * dependency on pdftoppm / ImageMagick / Ghostscript being installed.
 *
 * Runs automatically before `npm run dev` and `npm run build`, and skips any
 * PNG that is already up to date, so the PNGs never need making by hand.
 *
 *   npm run plans                 # 150 dpi, capped at 5000px wide
 *   npm run plans -- --force      # redo even if up to date
 *   npm run plans -- --dpi 200    # higher
 *   npm run plans -- --max-width 2500
 */
import { createServer } from 'node:http'
import { readFile, readdir, mkdir, writeFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC_DIR = path.join(root, 'plans')
const OUT_DIR = path.join(root, 'public', 'plans')
const PDFJS_DIR = path.join(root, 'node_modules', 'pdfjs-dist', 'build')

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : Number(args[i + 1])
}
const DPI = flag('dpi', 150)
const MAX_WIDTH = flag('max-width', 5000)
const FORCE = args.includes('--force')

/**
 * Whatever the source PDFs are called, they land on stable slugs the data file
 * can reference. First matching rule wins, so lower-ground is tested before
 * ground. Anything unrecognised keeps its own filename.
 */
const SLUG_RULES = [
  [/lower[\s_-]*ground|basement|\blg\b/i, 'lg'],
  [/ground|\bgf\b|level[\s_-]*0/i, 'ground'],
  [/first|\bff\b|level[\s_-]*1/i, 'first'],
  [/upper|fourth|top|roof|level[\s_-]*4/i, 'upper'],
]

const slugFor = (filename) => {
  const stem = path.basename(filename, '.pdf')
  for (const [pattern, slug] of SLUG_RULES) if (pattern.test(stem)) return slug
  return stem.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const RENDER_HTML = `<!doctype html>
<meta charset="utf-8">
<body style="margin:0">
<script type="module">
  import * as pdfjs from '/pdf.min.mjs'
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  window.renderPdf = async (url, dpi, maxWidth) => {
    const doc = await pdfjs.getDocument({ url, isEvalSupported: false }).promise
    const page = await doc.getPage(1)

    // PDF user space is 72 units per inch.
    let scale = dpi / 72
    const unscaled = page.getViewport({ scale: 1 })
    if (unscaled.width * scale > maxWidth) scale = maxWidth / unscaled.width

    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d')

    // Plans are line drawings; anything the page does not paint should be
    // white rather than transparent.
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    await page.render({ canvasContext: ctx, viewport }).promise
    return {
      width: canvas.width,
      height: canvas.height,
      dataUrl: canvas.toDataURL('image/png'),
    }
  }
</script>`

const MIME = { '.mjs': 'text/javascript', '.html': 'text/html', '.pdf': 'application/pdf' }

/**
 * Normally Playwright's own download is used. Some sandboxes ship a Chromium
 * that does not match Playwright's expected build number, so fall back to an
 * explicit binary rather than telling the caller to run `playwright install`.
 */
async function launchChromium() {
  try {
    return await chromium.launch()
  } catch (err) {
    const fallback = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium'].find(
      (p) => p && existsSync(p),
    )
    if (!fallback) throw err
    console.log(`(using ${fallback})`)
    return chromium.launch({ executablePath: fallback })
  }
}

async function main() {
  let pdfs
  try {
    pdfs = (await readdir(SRC_DIR)).filter((f) => f.toLowerCase().endsWith('.pdf')).sort()
  } catch {
    console.error(`No ${path.relative(root, SRC_DIR)}/ directory — put the source PDFs there.`)
    process.exit(1)
  }
  if (!pdfs.length) {
    console.error(`No PDFs in ${path.relative(root, SRC_DIR)}/.`)
    process.exit(1)
  }

  await mkdir(OUT_DIR, { recursive: true })

  // Skip work that is already done, so wiring this into predev/prebuild costs
  // nothing on the runs where the plans have not changed.
  const jobs = []
  for (const pdf of pdfs) {
    const slug = slugFor(pdf)
    const out = path.join(OUT_DIR, `${slug}.png`)
    if (!FORCE) {
      const [src, dst] = await Promise.all([
        stat(path.join(SRC_DIR, pdf)),
        stat(out).catch(() => null),
      ])
      if (dst && dst.mtimeMs >= src.mtimeMs) continue
    }
    jobs.push({ pdf, slug, out })
  }

  if (!jobs.length) {
    console.log(`plans: ${pdfs.length} PNG(s) already up to date.`)
    return
  }

  // pdf.js needs a real origin for its worker, so serve the few files it wants
  // over loopback rather than opening the page from file://.
  const server = createServer(async (req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0])
    try {
      if (url === '/render.html') {
        res.writeHead(200, { 'content-type': 'text/html' }).end(RENDER_HTML)
        return
      }
      const file = url.startsWith('/pdf/')
        ? path.join(SRC_DIR, path.basename(url))
        : path.join(PDFJS_DIR, path.basename(url))
      const body = await readFile(file)
      res.writeHead(200, {
        'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
        'content-length': body.length,
      })
      res.end(body)
    } catch (err) {
      if (!res.headersSent) res.writeHead(404)
      res.end(String(err))
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`

  const browser = await launchChromium()
  const page = await browser.newPage()
  page.on('pageerror', (err) => console.error('  page error:', err.message))
  await page.goto(`${origin}/render.html`)
  await page.waitForFunction(() => typeof window.renderPdf === 'function')

  for (const { pdf, slug, out } of jobs) {
    const result = await page.evaluate(
      ([url, dpi, maxWidth]) => window.renderPdf(url, dpi, maxWidth),
      [`${origin}/pdf/${encodeURIComponent(pdf)}`, DPI, MAX_WIDTH],
    )
    const bytes = Buffer.from(result.dataUrl.split(',')[1], 'base64')
    await writeFile(out, bytes)
    console.log(
      `${pdf} -> public/plans/${slug}.png  ${result.width}x${result.height}px  ` +
        `${(bytes.length / 1e6).toFixed(1)} MB`,
    )
  }

  await browser.close()
  server.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
