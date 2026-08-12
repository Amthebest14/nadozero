import { useEffect, useRef, useState } from 'react'
import { shortAddr, type PortfolioSummary } from '../lib/nado'
import { usd } from '../lib/format'
import { LOGO_BLADE_PATH, LOGO_GRADIENT } from './Logo'

const W = 840
const H = 440
const SCALE = 2 // draw at 2x so the downloaded PNG is crisp

const MINT = '#3ee0b0'
const RED = '#ff6b81'

/**
 * The real NadoZero mark, drawn from the same path Logo.tsx renders — Path2D
 * takes SVG path strings directly, so this is pixel-for-pixel the same shape
 * as the sidebar icon, not a redrawn approximation. `badge` draws it the way
 * the sidebar does: a soft glow + rounded dark tile behind the mark.
 */
function drawLogo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, badge = true) {
  ctx.save()

  if (badge) {
    const r = size * 0.28
    const glow = ctx.createRadialGradient(x + size / 2, y + size / 2, 0, x + size / 2, y + size / 2, size * 1.1)
    glow.addColorStop(0, 'rgba(62,224,176,0.35)')
    glow.addColorStop(1, 'rgba(62,224,176,0)')
    ctx.fillStyle = glow
    ctx.fillRect(x - size * 0.4, y - size * 0.4, size * 1.8, size * 1.8)

    ctx.fillStyle = '#0a1512'
    ctx.beginPath()
    ctx.roundRect(x, y, size, size, r)
    ctx.fill()
  }

  // inset the mark within its tile — matches the sidebar's icon padding
  const inset = badge ? size * 0.16 : 0
  ctx.translate(x + inset, y + inset)
  const markSize = size - inset * 2
  ctx.scale(markSize / 100, markSize / 100)

  const grad = ctx.createLinearGradient(10, 5, 90, 95)
  grad.addColorStop(0, LOGO_GRADIENT[0])
  grad.addColorStop(1, LOGO_GRADIENT[1])
  ctx.fillStyle = grad
  for (let i = 0; i < 3; i++) {
    ctx.fill(new Path2D(LOGO_BLADE_PATH))
    ctx.translate(50, 50)
    ctx.rotate((2 * Math.PI) / 3)
    ctx.translate(-50, -50)
  }
  ctx.restore()
}

function drawCard(ctx: CanvasRenderingContext2D, address: string, s: PortfolioSummary) {
  ctx.scale(SCALE, SCALE)

  // backdrop
  ctx.fillStyle = '#060c0a'
  ctx.beginPath()
  ctx.roundRect(0, 0, W, H, 24)
  ctx.fill()

  // ambient glow, echoing the app's aurora
  const glow = ctx.createRadialGradient(W - 140, 60, 0, W - 140, 60, 380)
  glow.addColorStop(0, 'rgba(62,224,176,0.14)')
  glow.addColorStop(1, 'rgba(62,224,176,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  ctx.strokeStyle = 'rgba(62,224,176,0.28)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(1, 1, W - 2, H - 2, 23)
  ctx.stroke()

  // faint oversized watermark of the mark, tucked in the corner — quiet, not competing with the numbers
  ctx.save()
  ctx.globalAlpha = 0.05
  drawLogo(ctx, W - 210, H - 210, 260, false)
  ctx.restore()

  // mark + wordmark
  drawLogo(ctx, 36, 26, 30)
  ctx.font = '600 21px "Space Grotesk", sans-serif'
  ctx.fillStyle = '#f1f5f9'
  const wordX = 36 + 30 + 12
  ctx.fillText('Nado', wordX, 47)
  ctx.fillStyle = MINT
  ctx.fillText('Zero', wordX + ctx.measureText('Nado').width, 47)

  // verified badge, right-aligned
  ctx.font = '500 13px "Space Grotesk", sans-serif'
  const badge = '✓ verified on-chain'
  ctx.fillStyle = MINT
  ctx.fillText(badge, W - 36 - ctx.measureText(badge).width, 52)

  // trader line
  ctx.font = '500 15px "JetBrains Mono", monospace'
  ctx.fillStyle = '#94a3b8'
  ctx.fillText(`${shortAddr(address)}  ·  Nado (Ink L2)`, 36, 92)

  // headline PnL
  ctx.font = '600 12px "Space Grotesk", sans-serif'
  ctx.fillStyle = '#64748b'
  ctx.fillText('3 0 D   P N L', 36, 148)
  const pnl = s.pnlMonth
  ctx.font = '700 62px "Space Grotesk", sans-serif'
  ctx.fillStyle = pnl >= 0 ? MINT : RED
  ctx.fillText(usd(pnl, { compact: true, sign: true }), 33, 210)

  // stat row
  const stats: [string, string][] = [
    ['ACCOUNT VALUE', usd(s.accountValue, { compact: true })],
    ['7D VOLUME', usd(s.volWeek, { compact: true })],
    ['ALL-TIME PNL', usd(s.pnlAll, { compact: true, sign: true })],
  ]
  stats.forEach(([label, value], i) => {
    const x = 36 + i * 180
    ctx.font = '600 10px "Space Grotesk", sans-serif'
    ctx.fillStyle = '#64748b'
    ctx.fillText(label, x, 258)
    ctx.font = '600 20px "Space Grotesk", sans-serif'
    ctx.fillStyle = '#e2e8f0'
    ctx.fillText(value, x, 284)
  })

  // 7d equity curve
  const curve = s.curve
  if (curve.length >= 2) {
    const left = 36
    const right = W - 36
    const top = 318
    const bottom = 392
    const min = Math.min(...curve)
    const max = Math.max(...curve)
    const span = max - min || 1
    const pts = curve.map((v, i) => [
      left + (i / (curve.length - 1)) * (right - left),
      bottom - ((v - min) / span) * (bottom - top),
    ])

    const fill = ctx.createLinearGradient(0, top, 0, bottom)
    fill.addColorStop(0, 'rgba(62,224,176,0.22)')
    fill.addColorStop(1, 'rgba(62,224,176,0)')
    ctx.beginPath()
    ctx.moveTo(pts[0][0], bottom)
    for (const [x, y] of pts) ctx.lineTo(x, y)
    ctx.lineTo(pts[pts.length - 1][0], bottom)
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.fill()

    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    for (const [x, y] of pts) ctx.lineTo(x, y)
    ctx.strokeStyle = MINT
    ctx.lineWidth = 2.5
    ctx.lineJoin = 'round'
    ctx.stroke()

    ctx.font = '500 10px "Space Grotesk", sans-serif'
    ctx.fillStyle = '#475569'
    ctx.fillText('7d account value', left, top - 8)
  }

  // footer
  ctx.font = '500 12px "Space Grotesk", sans-serif'
  ctx.fillStyle = '#64748b'
  ctx.fillText('nadozero.vercel.app', 36, H - 20)
  const src = 'every number derived from Nado public archive'
  ctx.fillStyle = '#475569'
  ctx.fillText(src, W - 36 - ctx.measureText(src).width, H - 20)
}

export function PnlCard({
  address,
  summary,
  onClose,
}: {
  address: string
  summary: PortfolioSummary
  onClose: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [linkCopied, setLinkCopied] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    // wait for the page's webfonts so the canvas doesn't render fallback fonts
    document.fonts.ready.then(() => {
      if (cancelled) return
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx) drawCard(ctx, address, summary)
    })
    return () => {
      cancelled = true
    }
  }, [address, summary])

  const download = () => {
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `nadozero-${shortAddr(address).replace('…', '-')}.png`
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${location.origin}/?trader=${address}`)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 1600)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-[880px] rounded-2xl border border-ink-700/70 bg-ink-900/95 p-5 shadow-2xl">
        <canvas
          ref={canvasRef}
          width={W * SCALE}
          height={H * SCALE}
          style={{ width: '100%', aspectRatio: `${W}/${H}` }}
          className="rounded-xl"
        />
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={copyLink}
            className="rounded-lg border border-ink-600 px-4 py-2 text-sm font-medium text-slate-300 hover:border-slate-500"
          >
            {linkCopied ? 'Link copied ✓' : 'Copy profile link'}
          </button>
          <button
            onClick={download}
            className="rounded-lg bg-gradient-to-b from-mint-300 to-mint-500 px-4 py-2 text-sm font-semibold text-ink-950"
          >
            Download PNG
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-ink-700 px-4 py-2 text-sm text-slate-500 hover:text-slate-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
