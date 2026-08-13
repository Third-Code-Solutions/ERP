'use client'

import { useRef, useState, useEffect, useCallback } from 'react'

interface SignaturePadProps {
  width?: number
  height?: number
  onChange?: (hasInk: boolean) => void
  // External "reset" trigger
  resetKey?: number
}

/**
 * Pure HTML5-canvas signature pad. No external libs. Captures mouse
 * and touch input, exposes a getDataUrl() via a forwarded ref through
 * the `data-pad` attribute (read by the parent on submit). Empty-state
 * notification through `onChange` so the submit button can stay disabled
 * until at least one stroke exists.
 */
export function SignaturePad({
  width = 480,
  height = 180,
  onChange,
  resetKey,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [hasInk, setHasInk] = useState(false)

  // Reset on resetKey change.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
    onChange?.(false)
  }, [resetKey, onChange])

  // Initial paint (white background so PNG export looks like paper).
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#0f2d4a' // ABI OPS navy
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  const pointFromEvent = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()
      const isTouch = 'touches' in e
      const clientX = isTouch ? e.touches[0]?.clientX ?? 0 : e.clientX
      const clientY = isTouch ? e.touches[0]?.clientY ?? 0 : e.clientY
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      }
    },
    []
  )

  function start(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const p = pointFromEvent(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    setDrawing(true)
  }

  function move(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!drawing) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const p = pointFromEvent(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    if (!hasInk) {
      setHasInk(true)
      onChange?.(true)
    }
  }

  function end() {
    setDrawing(false)
  }

  function clear() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
    onChange?.(false)
  }

  return (
    <div className="signature-pad-wrap">
      <canvas
        ref={canvasRef}
        data-pad="signature"
        width={width * 2}
        height={height * 2}
        style={{
          width,
          height,
          border: '1px dashed var(--color-border-strong)',
          borderRadius: 'var(--radius-md, 6px)',
          background: '#ffffff',
          touchAction: 'none',
          cursor: 'crosshair',
          display: 'block',
        }}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
        aria-label="Signature drawing area"
        role="img"
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12 }}>
        <span style={{ color: 'var(--color-neutral-500)' }}>
          {hasInk ? 'Looks good — click Sign below.' : 'Draw your signature above.'}
        </span>
        <button
          type="button"
          onClick={clear}
          style={{
            background: 'transparent',
            border: 0,
            color: 'var(--color-navy-700)',
            fontSize: 12,
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          Clear
        </button>
      </div>
    </div>
  )
}

/** Read the data URL from the rendered pad. Used inside a submit handler. */
export function getSignatureDataUrl(container?: HTMLElement | null): string | null {
  const canvas = (container ?? document).querySelector<HTMLCanvasElement>('canvas[data-pad="signature"]')
  if (!canvas) return null
  return canvas.toDataURL('image/png')
}
