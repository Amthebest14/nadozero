import { useEffect, useRef, useState } from 'react'

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Animates a displayed number toward `target` whenever it changes — but only
 * tweens between two REAL values. The first time a value appears (arriving
 * from `undefined`, e.g. a query resolving) it's shown immediately with no
 * count-up from zero — counting a $3M figure up from nothing on first paint
 * reads as a gimmick, not a live number. Only refreshes (a real value
 * changing to another real value) animate, which is what actually
 * communicates "this is live data," not a canned intro effect.
 */
export function useCountUp(target: number | undefined, durationMs = 600): number | undefined {
  const [display, setDisplay] = useState<number | undefined>(target)
  const fromRef = useRef<number | undefined>(target)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (target === undefined) return
    const from = fromRef.current
    if (from === undefined || from === target || prefersReducedMotion()) {
      fromRef.current = target
      setDisplay(target)
      return
    }
    const start = performance.now()
    cancelAnimationFrame(rafRef.current)
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - (1 - t) ** 3
      setDisplay(from + (target - from) * eased)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = target
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, durationMs])

  return display
}
