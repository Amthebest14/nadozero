import { useEffect, useRef, useState } from 'react'
import { shortAddr, type PortfolioSummary } from '../lib/nado'
import { usd } from '../lib/format'

const W = 840
const H = 440
const SCALE = 2 // draw at 2x so the downloaded PNG is crisp

const MINT = '#3ee0b0'
const RED = '#ff6b81'

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

  // wordmark
  ctx.font = '600 24px "Space Grotesk", sans-serif'
  ctx.fillStyle = '#f1f5f9'
  ctx.fillText('Nado', 36, 56)
  ctx.fillStyle = MINT
  ctx.fillText('Zero', 36 + ctx.measureText('Nado').width, 56)

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
            className="rounded-lg border border-ink-600 px-4 py-2 text-[12.5px] font-medium text-slate-300 hover:border-slate-500"
          >
            {linkCopied ? 'Link copied ✓' : 'Copy profile link'}
          </button>
          <button
            onClick={download}
            className="rounded-lg bg-gradient-to-b from-mint-300 to-mint-500 px-4 py-2 text-[12.5px] font-semibold text-ink-950"
          >
            Download PNG
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-ink-700 px-4 py-2 text-[12.5px] text-slate-500 hover:text-slate-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
