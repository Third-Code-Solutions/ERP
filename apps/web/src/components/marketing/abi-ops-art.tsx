'use client'

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'

import type { ArtBuilding, StrokeCode } from './abi-ops-skyline-art'
import styles from './abi-ops-art.module.css'

type ArtModule = typeof import('./abi-ops-skyline-art')
type CssVars = CSSProperties & Record<`--${string}`, string | number>

const STROKE_CLASS: Record<StrokeCode, string | undefined> = {
  o: styles.o,
  l: styles.l,
  d: styles.d,
  t: styles.t,
  h: styles.h,
  g: styles.g,
  u: styles.u,
  m: styles.m,
}

const PREFETCH_MARGIN = '900px 0px'
const REVEAL_MARGIN = '0px 0px -12% 0px'

let artRequest: Promise<ArtModule> | null = null

/** The artwork is ~70 KB of path data, so it loads only when a drawing nears view. */
export function loadArt(): Promise<ArtModule> {
  artRequest ??= import('./abi-ops-skyline-art')
  return artRequest
}

/**
 * Prefetches the artwork shortly before the element scrolls in, and reports it
 * once the element is actually in view so the draw-on starts on screen.
 */
export function useArtOnView<T extends Element>() {
  const ref = useRef<T>(null)
  const [art, setArt] = useState<ArtModule | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    let isActive = true

    const prefetch = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        prefetch.disconnect()
        void loadArt()
      },
      { rootMargin: PREFETCH_MARGIN },
    )
    const reveal = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        reveal.disconnect()
        loadArt().then(
          (module) => {
            if (isActive) setArt(module)
          },
          () => undefined,
        )
      },
      { rootMargin: REVEAL_MARGIN },
    )
    prefetch.observe(element)
    reveal.observe(element)
    return () => {
      isActive = false
      prefetch.disconnect()
      reveal.disconnect()
    }
  }, [])

  return { ref, art }
}

function HatchPattern({ id }: { id: string }) {
  return (
    <defs>
      <pattern
        height="7"
        id={id}
        patternTransform="rotate(45)"
        patternUnits="userSpaceOnUse"
        width="7"
      >
        <line className={styles.hatchLine} x1="0" x2="0" y1="0" y2="7" />
      </pattern>
    </defs>
  )
}

export const strokeClass = (code: StrokeCode): string =>
  `${styles.st} ${STROKE_CLASS[code] ?? ''}`

export function BuildingArt({
  building,
  hatchId,
}: {
  building: ArtBuilding
  hatchId: string
}) {
  return (
    <>
      <path className={styles.fill} d={building.fill} />
      <path
        className={styles.hatchFill}
        d={building.hatch}
        fill={`url(#${hatchId})`}
      />
      {building.strokes.map(([code, d, delay, duration], index) => (
        <path
          className={strokeClass(code)}
          d={d}
          key={index}
          pathLength={1}
          style={{ '--d': `${delay}ms`, '--dur': `${duration}ms` } as CssVars}
        />
      ))}
    </>
  )
}

/**
 * An SVG that keeps its strokes a constant screen width at any size (the
 * template does the same by feeding the viewBox-to-pixel ratio to --k) and
 * flips from pending to built one frame after mounting so strokes draw on.
 */
export function StrokeStage({
  viewBox,
  className,
  label,
  mode = 'view',
  isInstant = false,
  isComplete = false,
  shouldBuild = true,
  children,
}: {
  viewBox: { x: number; y: number; width: number; height: number }
  className?: string
  label?: string
  mode?: 'view' | 'stage'
  isInstant?: boolean
  isComplete?: boolean
  /** Hold the drawing back until this is true, for art below the fold. */
  shouldBuild?: boolean
  children: (hatchId: string) => ReactNode
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [isBuilt, setIsBuilt] = useState(false)
  const hatchId = `hatch-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const update = () => {
      const { width } = svg.getBoundingClientRect()
      if (width > 0) svg.style.setProperty('--k', String(viewBox.width / width))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(svg)
    return () => observer.disconnect()
  }, [viewBox.width])

  useEffect(() => {
    if (!shouldBuild) return
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setIsBuilt(true))
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [shouldBuild])

  return (
    <svg
      aria-hidden={label ? undefined : true}
      aria-label={label}
      className={`${styles.dw} ${className ?? ''}`}
      data-complete={isComplete}
      data-instant={isInstant}
      data-mode={mode}
      data-state={isBuilt ? 'built' : 'pending'}
      focusable="false"
      ref={svgRef}
      role={label ? 'img' : undefined}
      style={{ '--k': viewBox.width / 1376 } as CssVars}
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
    >
      <HatchPattern id={hatchId} />
      {children(hatchId)}
    </svg>
  )
}

export const artClasses = {
  ground: `${styles.st} ${styles.o}`,
  bldg: styles.bldg,
  lift: styles.lift,
  fill: styles.fill,
  hatchFill: styles.hatchFill,
  label: styles.lbl,
} as const
