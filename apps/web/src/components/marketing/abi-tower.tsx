'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

import type { TowerController, TowerHover } from './abi-tower-scene'
import styles from './abi-tower.module.css'

export type TowerStatus = 'loading' | 'ready' | 'unsupported'

export interface TowerLabel {
  readonly id: string
  /** Build progress range, 0 to 4, in which the label shows. */
  readonly from: number
  readonly to: number
  readonly title: string
  readonly detail: string
}

const LAZY_MARGIN = '700px 0px'

/**
 * The Blender tower in WebGL. three.js and the model load on demand; the
 * fallback (the 2D drawing) shows until the scene is ready and stays if this
 * browser cannot render WebGL.
 */
export function Tower3D({
  mode,
  stage = 0,
  labels = [],
  fallback,
  isLazy = false,
  hasReplay = false,
  caption,
  onStatusChange,
}: {
  mode: 'intro' | 'stage'
  stage?: number
  labels?: readonly TowerLabel[]
  fallback: ReactNode
  isLazy?: boolean
  hasReplay?: boolean
  caption?: string
  onStatusChange?: (status: TowerStatus) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const controllerRef = useRef<TowerController | null>(null)
  const labelRefs = useRef<Record<string, HTMLElement | null>>({})
  const stageRef = useRef(stage)
  const [status, setStatus] = useState<TowerStatus>('loading')
  const [hover, setHover] = useState<TowerHover | null>(null)
  const [floors, setFloors] = useState(0)
  const [reason, setReason] = useState<string | null>(null)

  stageRef.current = stage

  useEffect(() => {
    onStatusChange?.(status)
  }, [status, onStatusChange])

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return
    const abort = new AbortController()
    let lazy: IntersectionObserver | null = null
    const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    async function boot() {
      if (!host || !canvas) return
      try {
        const scene = await import('./abi-tower-scene')
        if (abort.signal.aborted) return
        if (!scene.canRenderWebGL()) {
          setReason('WebGL is unavailable')
          setStatus('unsupported')
          return
        }
        const created = await scene.createTowerScene({
          signal: abort.signal,
          canvas,
          host,
          mode,
          isReducedMotion: isReduced,
          labels: labelRefs.current,
          labelSpecs: labels.map(({ id, from, to }) => ({ id, from, to })),
          onHover: setHover,
          onProgress: (progress) => setFloors(progress.floors),
        })
        if (abort.signal.aborted) {
          created.dispose()
          return
        }
        controllerRef.current = created
        created.setStage(stageRef.current)
        setStatus('ready')
      } catch (error) {
        if (abort.signal.aborted) return
        // Rendering is an enhancement: keep the drawing if the scene fails, and
        // say why on the element so a blank result is diagnosable.
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setReason(error instanceof Error ? error.message : 'The 3D scene failed to start')
          setStatus('unsupported')
        }
      }
    }

    if (isLazy) {
      lazy = new IntersectionObserver(
        ([entry]) => {
          if (!entry?.isIntersecting) return
          lazy?.disconnect()
          void boot()
        },
        { rootMargin: LAZY_MARGIN },
      )
      lazy.observe(host)
    } else {
      void boot()
    }

    const visibility = new IntersectionObserver(([entry]) => {
      controllerRef.current?.setActive(Boolean(entry?.isIntersecting))
    })
    visibility.observe(host)

    return () => {
      abort.abort()
      lazy?.disconnect()
      visibility.disconnect()
      controllerRef.current?.dispose()
      controllerRef.current = null
    }
    // labels is a module constant at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, isLazy])

  useEffect(() => {
    if (status === 'ready') controllerRef.current?.setStage(stage)
  }, [stage, status])

  const isReady = status === 'ready'

  return (
    <div
      className={styles.host}
      data-reason={reason ?? undefined}
      data-status={status}
      ref={hostRef}
    >
      <div className={styles.fallback} data-hidden={isReady}>
        {fallback}
      </div>
      <canvas
        aria-label="Interactive 3D model of a tower rising floor by floor. Drag to turn it."
        className={styles.canvas}
        data-ready={isReady}
        ref={canvasRef}
        role="img"
      />
      {labels.map((label) => (
        <div
          aria-hidden="true"
          className={styles.label}
          data-on="false"
          key={label.id}
          ref={(node) => {
            labelRefs.current[label.id] = node
          }}
        >
          <span className={styles.dot} />
          <span className={styles.card}>
            <strong>{label.title}</strong>
            <span>{label.detail}</span>
          </span>
        </div>
      ))}
      {status === 'unsupported' ? (
        <p className={styles.notice} role="status">
          The 3D tower needs WebGL. Turn on hardware acceleration in your browser to see it build.
        </p>
      ) : null}
      {hover ? (
        <div
          aria-hidden="true"
          className={styles.tip}
          style={{ transform: `translate3d(${hover.x + 14}px, ${hover.y + 14}px, 0)` }}
        >
          <strong>Level {hover.floor} of 26</strong>
          <span>{hover.areaM2.toLocaleString('en-US')} m² floor plate</span>
        </div>
      ) : null}
      {isReady ? (
        <p aria-hidden="true" className={styles.caption}>
          {caption ?? 'Floors'} {String(floors).padStart(2, '0')} / 26
        </p>
      ) : null}
      {isReady && hasReplay ? (
        <button
          aria-label="Replay the build"
          className={styles.replay}
          onClick={() => controllerRef.current?.replay()}
          type="button"
        >
          <span aria-hidden="true">↻</span>
        </button>
      ) : null}
    </div>
  )
}
