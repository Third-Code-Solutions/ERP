'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

import type { BrainController } from './abi-brain-scene'
import styles from './abi-brain.module.css'

export type BrainStatus = 'loading' | 'ready' | 'unsupported'

export interface BrainLabel {
  readonly id: string
  /** Chapter range, as on the brain's timeline, in which the label shows. */
  readonly from: number
  readonly to: number
  readonly title: string
  readonly detail: string
  readonly tone?: 'gold' | 'blue' | 'red' | 'green'
}

const LAZY_MARGIN = '800px 0px'

/**
 * The Blender brain in WebGL, driven by a chapter value the parent scrubs with
 * scroll. three.js and the model load on demand; the still render shows until
 * the scene is ready and stays if WebGL is unavailable.
 */
export function Brain3D({
  labels,
  onReady,
}: {
  labels: readonly BrainLabel[]
  onReady?: (controller: BrainController | null) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const controllerRef = useRef<BrainController | null>(null)
  const labelRefs = useRef<Record<string, HTMLElement | null>>({})
  const onReadyRef = useRef(onReady)
  const [status, setStatus] = useState<BrainStatus>('loading')
  const [reason, setReason] = useState<string | null>(null)

  onReadyRef.current = onReady

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return
    const abort = new AbortController()
    const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    async function boot() {
      if (!host || !canvas) return
      try {
        const scene = await import('./abi-brain-scene')
        if (abort.signal.aborted) return
        if (!scene.canRenderWebGL()) {
          setReason('WebGL is unavailable')
          setStatus('unsupported')
          return
        }
        const created = await scene.createBrainScene({
          signal: abort.signal,
          canvas,
          host,
          isReducedMotion: isReduced,
          labels: labelRefs.current,
          labelSpecs: labels.map(({ id, from, to }) => ({ id, from, to })),
        })
        if (abort.signal.aborted) {
          created.dispose()
          return
        }
        controllerRef.current = created
        onReadyRef.current?.(created)
        setStatus('ready')
      } catch (error) {
        if (abort.signal.aborted) return
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setReason(error instanceof Error ? error.message : 'The brain failed to start')
          setStatus('unsupported')
        }
      }
    }

    const lazy = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        lazy.disconnect()
        void boot()
      },
      { rootMargin: LAZY_MARGIN },
    )
    lazy.observe(host)

    const visibility = new IntersectionObserver(([entry]) => {
      controllerRef.current?.setActive(Boolean(entry?.isIntersecting))
    })
    visibility.observe(host)

    return () => {
      abort.abort()
      lazy.disconnect()
      visibility.disconnect()
      controllerRef.current?.dispose()
      controllerRef.current = null
      onReadyRef.current?.(null)
    }
    // labels is a module constant at the call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isReady = status === 'ready'

  return (
    <div
      className={styles.host}
      data-reason={reason ?? undefined}
      data-status={status}
      ref={hostRef}
    >
      <div className={styles.still} data-hidden={isReady}>
        <Image
          alt="A brain drawn from folded cortex, lit from within"
          className={styles.stillImage}
          height={1100}
          sizes="(max-width: 960px) 100vw, 55vw"
          src="/images/abi-brain-still.webp"
          width={1400}
        />
      </div>
      <canvas
        aria-label="Interactive 3D brain showing records becoming memories, connecting, and being recalled. Drag to turn it."
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
          data-tone={label.tone ?? 'blue'}
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
          The 3D brain needs WebGL. Turn on hardware acceleration in your browser to see memories move.
        </p>
      ) : null}
      {isReady ? (
        <p aria-hidden="true" className={styles.hint}>
          Illustrative records. Drag to turn the brain.
        </p>
      ) : null}
    </div>
  )
}
