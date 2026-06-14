'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
} from 'd3-force'

export interface GraphNode extends SimulationNodeDatum {
  id: string
  type: string
  title: string | null
  refTable: string
  refId: string
  degree: number
}
interface GraphLink {
  source: string | GraphNode
  target: string | GraphNode
  type: string
}
interface GraphPayload {
  nodes: Omit<GraphNode, 'degree'>[]
  links: { source: string; target: string; type: string }[]
}

export interface SelectedNode {
  refTable: string
  refId: string
  title: string | null
  type: string
}

const TYPE_COLOR: Record<string, string> = {
  project: '#1f3864',
  account: '#0e7490',
  employee: '#7c3aed',
  opportunity: '#b45309',
  document: '#475569',
  bom: '#15803d',
  purchase_order: '#9333ea',
  invoice: '#be123c',
  task: '#0369a1',
}
const color = (t: string) => TYPE_COLOR[t] ?? '#64748b'

interface Camera {
  x: number
  y: number
  k: number
}

/**
 * Interactive force-directed knowledge graph (Obsidian / conducting.ai style).
 * Canvas + d3-force physics for speed; zoom (wheel), pan (drag bg), node drag,
 * hover-highlight of a node's neighborhood, click to open. Devicepixel-aware.
 */
export function CortexGraphCanvas({
  onSelect,
}: {
  onSelect: (node: SelectedNode) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simRef = useRef<Simulation<GraphNode, GraphLink> | null>(null)
  const nodesRef = useRef<GraphNode[]>([])
  const linksRef = useRef<GraphLink[]>([])
  const adjRef = useRef<Map<string, Set<string>>>(new Map())
  const camRef = useRef<Camera>({ x: 0, y: 0, k: 1 })
  const hoverRef = useRef<string | null>(null)
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 })
  const rafRef = useRef<number>(0)

  const [status, setStatus] = useState<'loading' | 'empty' | 'error' | 'ready'>('loading')
  const [count, setCount] = useState<{ n: number; e: number }>({ n: 0, e: 0 })

  // --- draw -----------------------------------------------------------------
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { w, h } = sizeRef.current
    const dpr = window.devicePixelRatio || 1
    const cam = camRef.current
    const hover = hoverRef.current
    const adj = adjRef.current

    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)
    ctx.translate(cam.x, cam.y)
    ctx.scale(cam.k, cam.k)

    const neighbors = hover ? adj.get(hover) : undefined

    // edges
    ctx.lineWidth = 0.6 / cam.k
    for (const l of linksRef.current) {
      const s = l.source as GraphNode
      const t = l.target as GraphNode
      if (s.x == null || s.y == null || t.x == null || t.y == null) continue
      const active = hover && (s.id === hover || t.id === hover)
      ctx.strokeStyle = active ? 'rgba(31,56,100,0.55)' : hover ? 'rgba(100,116,139,0.07)' : 'rgba(100,116,139,0.18)'
      ctx.beginPath()
      ctx.moveTo(s.x, s.y)
      ctx.lineTo(t.x, t.y)
      ctx.stroke()
    }

    // nodes
    const showLabels = cam.k > 1.35
    for (const n of nodesRef.current) {
      if (n.x == null || n.y == null) continue
      const r = 2.6 + Math.sqrt(n.degree) * 1.6
      const dim = hover && n.id !== hover && !(neighbors && neighbors.has(n.id))
      ctx.globalAlpha = dim ? 0.2 : 1
      ctx.beginPath()
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
      ctx.fillStyle = color(n.type)
      ctx.fill()
      if (n.id === hover) {
        ctx.lineWidth = 1.4 / cam.k
        ctx.strokeStyle = '#fff'
        ctx.stroke()
      }
      if ((showLabels || n.id === hover || (neighbors && neighbors.has(n.id))) && n.title) {
        ctx.globalAlpha = dim ? 0.3 : 0.9
        ctx.fillStyle = '#0f172a'
        ctx.font = `${10 / cam.k}px Inter, system-ui, sans-serif`
        ctx.fillText(n.title.slice(0, 28), n.x + r + 1.5 / cam.k, n.y + 3 / cam.k)
      }
      ctx.globalAlpha = 1
    }
    ctx.restore()
  }, [])

  // --- size -----------------------------------------------------------------
  const resize = useCallback(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const w = wrap.clientWidth
    const h = wrap.clientHeight
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    sizeRef.current = { w, h }
    const sim = simRef.current
    if (sim) {
      sim.force('center', forceCenter(w / 2, h / 2))
      sim.force('x', forceX(w / 2).strength(0.04))
      sim.force('y', forceY(h / 2).strength(0.04))
    }
    draw()
  }, [draw])

  // --- load + simulate ------------------------------------------------------
  useEffect(() => {
    const controller = new AbortController()
    let stopped = false

    fetch('/api/cortex/graph', { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        return (await res.json()) as GraphPayload
      })
      .then((payload) => {
        if (stopped) return
        if (payload.nodes.length === 0) {
          setStatus('empty')
          return
        }
        // degree + adjacency
        const deg = new Map<string, number>()
        const adj = new Map<string, Set<string>>()
        for (const n of payload.nodes) adj.set(n.id, new Set())
        for (const l of payload.links) {
          deg.set(l.source, (deg.get(l.source) ?? 0) + 1)
          deg.set(l.target, (deg.get(l.target) ?? 0) + 1)
          adj.get(l.source)?.add(l.target)
          adj.get(l.target)?.add(l.source)
        }
        adjRef.current = adj
        const nodes: GraphNode[] = payload.nodes.map((n) => ({ ...n, degree: deg.get(n.id) ?? 0 }))
        const links: GraphLink[] = payload.links.map((l) => ({ ...l }))
        nodesRef.current = nodes
        linksRef.current = links
        setCount({ n: nodes.length, e: links.length })

        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        const sim = forceSimulation<GraphNode>(nodes)
          .force(
            'link',
            forceLink<GraphNode, GraphLink>(links)
              .id((d) => d.id)
              .distance(36)
              .strength(0.5)
          )
          .force('charge', forceManyBody().strength(-90))
          .force('collide', forceCollide<GraphNode>().radius((d) => 3 + Math.sqrt(d.degree) * 1.6))
          .alphaDecay(reduced ? 0.2 : 0.0228)
          .stop()
        simRef.current = sim
        sim.alpha(1)
        setStatus('ready')
        resize()

        const loop = () => {
          if (stopped) return
          const s = simRef.current
          if (s && s.alpha() > s.alphaMin()) s.tick()
          draw()
          rafRef.current = requestAnimationFrame(loop)
        }
        rafRef.current = requestAnimationFrame(loop)
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (!stopped) setStatus('error')
      })

    return () => {
      stopped = true
      controller.abort()
      cancelAnimationFrame(rafRef.current)
      simRef.current?.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- resize observer ------------------------------------------------------
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => resize())
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [resize])

  // --- interaction ----------------------------------------------------------
  const toWorld = (sx: number, sy: number) => {
    const cam = camRef.current
    return { x: (sx - cam.x) / cam.k, y: (sy - cam.y) / cam.k }
  }
  const nodeAt = (sx: number, sy: number): GraphNode | null => {
    const { x, y } = toWorld(sx, sy)
    let best: GraphNode | null = null
    let bestD = Infinity
    for (const n of nodesRef.current) {
      if (n.x == null || n.y == null) continue
      const r = 2.6 + Math.sqrt(n.degree) * 1.6 + 3
      const d = (n.x - x) ** 2 + (n.y - y) ** 2
      if (d < r * r && d < bestD) {
        bestD = d
        best = n
      }
    }
    return best
  }

  const dragRef = useRef<{ mode: 'none' | 'pan' | 'node'; node: GraphNode | null; moved: boolean; lastX: number; lastY: number }>({
    mode: 'none',
    node: null,
    moved: false,
    lastX: 0,
    lastY: 0,
  })

  const localXY = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function onPointerDown(e: React.PointerEvent) {
    canvasRef.current?.setPointerCapture(e.pointerId)
    const { x, y } = localXY(e)
    const n = nodeAt(x, y)
    dragRef.current = { mode: n ? 'node' : 'pan', node: n, moved: false, lastX: x, lastY: y }
    if (n) {
      simRef.current?.alphaTarget(0.3).restart?.()
      simRef.current?.alpha(0.3)
      const w = toWorld(x, y)
      n.fx = w.x
      n.fy = w.y
    }
  }
  function onPointerMove(e: React.PointerEvent) {
    const { x, y } = localXY(e)
    const drag = dragRef.current
    if (drag.mode === 'none') {
      const n = nodeAt(x, y)
      const id = n?.id ?? null
      if (id !== hoverRef.current) {
        hoverRef.current = id
        if (canvasRef.current) canvasRef.current.style.cursor = id ? 'pointer' : 'grab'
        draw()
      }
      return
    }
    drag.moved = true
    if (drag.mode === 'pan') {
      const cam = camRef.current
      cam.x += x - drag.lastX
      cam.y += y - drag.lastY
    } else if (drag.mode === 'node' && drag.node) {
      const w = toWorld(x, y)
      drag.node.fx = w.x
      drag.node.fy = w.y
    }
    drag.lastX = x
    drag.lastY = y
    draw()
  }
  function onPointerUp(e: React.PointerEvent) {
    const drag = dragRef.current
    if (drag.mode === 'node' && drag.node) {
      if (!drag.moved) {
        onSelect({
          refTable: drag.node.refTable,
          refId: drag.node.refId,
          title: drag.node.title,
          type: drag.node.type,
        })
      }
      drag.node.fx = null
      drag.node.fy = null
      simRef.current?.alphaTarget(0)
    }
    dragRef.current = { mode: 'none', node: null, moved: false, lastX: 0, lastY: 0 }
    canvasRef.current?.releasePointerCapture(e.pointerId)
  }
  function onWheel(e: React.WheelEvent) {
    const { x, y } = localXY(e as unknown as React.PointerEvent)
    const cam = camRef.current
    const factor = Math.exp(-e.deltaY * 0.0015)
    const k = Math.min(6, Math.max(0.2, cam.k * factor))
    // zoom toward cursor
    cam.x = x - ((x - cam.x) * k) / cam.k
    cam.y = y - ((y - cam.y) * k) / cam.k
    cam.k = k
    draw()
  }
  function zoom(factor: number) {
    const cam = camRef.current
    const { w, h } = sizeRef.current
    const k = Math.min(6, Math.max(0.2, cam.k * factor))
    cam.x = w / 2 - ((w / 2 - cam.x) * k) / cam.k
    cam.y = h / 2 - ((h / 2 - cam.y) * k) / cam.k
    cam.k = k
    draw()
  }

  return (
    <div className="cortex-graphwrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="cortex-graphcanvas"
        style={{ cursor: 'grab', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
      />
      {status === 'loading' && <div className="cortex-graph-overlay">Loading graph…</div>}
      {status === 'empty' && (
        <div className="cortex-graph-overlay">No records in the graph yet.</div>
      )}
      {status === 'error' && (
        <div className="cortex-graph-overlay" role="alert">
          Could not load the graph.
        </div>
      )}
      {status === 'ready' && (
        <>
          <div className="cortex-graph-meta">
            {count.n} records · {count.e} connections
          </div>
          <div className="cortex-graph-zoom">
            <button type="button" aria-label="Zoom in" onClick={() => zoom(1.3)}>
              +
            </button>
            <button type="button" aria-label="Zoom out" onClick={() => zoom(1 / 1.3)}>
              −
            </button>
          </div>
        </>
      )}
    </div>
  )
}
