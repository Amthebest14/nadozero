/**
 * NadoZero mark: three identical blades rotated 120° around a center —
 * reads as a vortex (Nado = tornado), a "0" (the shape + negative center),
 * and a copy/mirror motif (one shape, duplicated and rotated) all at once.
 */
export function Logo({ size = 32 }: { size?: number }) {
  const blade = 'M50,40 C39,38 30,29 30,16 C30,6 39,1 47,7 C52,11 53,22 50,40 Z'
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="shrink-0">
      <defs>
        <linearGradient id="nz-logo-grad" x1="10" y1="5" x2="90" y2="95" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6ef0c8" />
          <stop offset="100%" stopColor="#12a67c" />
        </linearGradient>
      </defs>
      <g fill="url(#nz-logo-grad)">
        <path d={blade} />
        <path d={blade} transform="rotate(120 50 50)" />
        <path d={blade} transform="rotate(240 50 50)" />
      </g>
    </svg>
  )
}
