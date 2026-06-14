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

export interface RawNode {
  id: string
  type: string
  title: string | null
  refTable: string
  refId: string
  projectId: string | null
}
export interface RawLink {
  source: string
  target: string
  type: string
}
interface GraphNode extends SimulationNodeDatum, RawNode {
  degree: number
}
interface GraphLink {
  source: string | GraphNode
  target: string | GraphNode
  type: string
}

export interface SelectedNode {
  refTable: string
  refId: string
  title: string | null
  type: string
  projectId: string | null
}

interface Camera {
  x: number
  y: number
  k: number
}
interface Tooltip {
  x: number
  y: number
  title: string
  type: string
  degree: number
}

interface Props {
  nodes: RawNode[]
  links: RawLink[]
  visibleTypes: Set<string>
  query: string
  groupByType: boolean
  fitNonce: number
  onSelect: (n: SelectedNode) => void
  onNavigate: (n: SelectedNode) => void
}

function radius(n: GraphNode): number {
  return 2.6 + Math.sqrt(n.degree) * 1.7
}

// Bright palette tuned for the dark "AI brain" canvas (conducting.ai-style).
const NODE_COLOR: Record<string, string> = {
  project: '#6ea8ff',
  account: '#22d3ee',
  employee: '#c084fc',
  opportunity: '#fbbf24',
  document: '#94a3b8',
  bom: '#4ade80',
  purchase_order: '#e879f9',
  invoice: '#fb7185',
  task: '#38bdf8',
}
const nodeColor = (t: string): string => NODE_COLOR[t] ?? '#94a3b8'

function withAlpha(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}

/**
 * High-performance interactive knowledge graph (canvas + d3-force).
 * Data-driven: parent controls which types are visible, search highlight,
 * and force layout (free vs. clustered-by-type). Single click selects a node;
 * double click opens its record. DPR-aware, reduced-motion friendly.
 */
export function CortexGraphCanvas({
  nodes,
  links,
  visibleTypes,
  query,
  groupByType,
  fitNonce,
  onSelect,
  onNavigate,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simRef = useRef<Simulation<GraphNode, GraphLink> | null>(null)
  const nodesRef = useRef<GraphNode[]>([])
  const linksRef = useRef<GraphLink[]>([])
  const adjRef = useRef<Map<string, Set<string>>>(new Map())
  const posRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const camRef = useRef<Camera>({ x: 0, y: 0, k: 1 })
  const hoverRef = useRef<string | null>(null)
  const queryRef = useRef<string>('')
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 })
  const rafRef = useRef<number>(0)

  const [tooltip, setTooltip] = useState<Tooltip | null>(null)

  queryRef.current = query.trim().toLowerCase()

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
    const q = queryRef.current
    const neighbors = hover ? adj.get(hover) : undefined

    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)
    ctx.translate(cam.x, cam.y)
    ctx.scale(cam.k, cam.k)

    // edges — luminous on dark
    ctx.lineWidth = 0.7 / cam.k
    for (const l of linksRef.current) {
      const s = l.source as GraphNode
      const t = l.target as GraphNode
      if (s.x == null || s.y == null || t.x == null || t.y == null) continue
      const active = hover != null && (s.id === hover || t.id === hover)
      ctx.strokeStyle = active
        ? 'rgba(186,230,253,0.55)'
        : hover != null
          ? 'rgba(148,163,184,0.05)'
          : 'rgba(148,163,184,0.16)'
      ctx.beginPath()
      ctx.moveTo(s.x, s.y)
      ctx.lineTo(t.x, t.y)
      ctx.stroke()
    }

    // nodes — glow halo + bright core, conducting.ai style
    const showLabels = cam.k > 1.1
    for (const n of nodesRef.current) {
      if (n.x == null || n.y == null) continue
      const r = radius(n)
      const col = nodeColor(n.type)
      const isHover = n.id === hover
      const isNeighbor = neighbors != null && neighbors.has(n.id)
      const matches = q !== '' && (n.title ?? '').toLowerCase().includes(q)
      const dim = (hover != null && !isHover && !isNeighbor) || (q !== '' && !matches)
      const focus = isHover || matches

      // glow halo
      ctx.beginPath()
      ctx.arc(n.x, n.y, r * (focus ? 2.8 : 2.1), 0, Math.PI * 2)
      ctx.fillStyle = withAlpha(col, dim ? 0.04 : focus ? 0.32 : 0.16)
      ctx.fill()

      // core
      ctx.globalAlpha = dim ? 0.28 : 1
      ctx.beginPath()
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
      ctx.fillStyle = col
      ctx.fill()
      if (focus) {
        ctx.lineWidth = 1.4 / cam.k
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'
        ctx.stroke()
      }

      if ((showLabels || focus || isNeighbor) && n.title) {
        ctx.globalAlpha = dim ? 0.3 : 0.95
        ctx.fillStyle = focus ? '#f8fafc' : '#cbd5e1'
        ctx.font = `${focus ? 600 : 400} ${10 / cam.k}px Inter, system-ui, sans-serif`
        ctx.fillText(n.title.slice(0, 30), n.x + r + 2 / cam.k, n.y + 3 / cam.k)
      }
      ctx.globalAlpha = 1
    }
    ctx.restore()
  }, [])

  // --- camera helpers -------------------------------------------------------
  const fitView = useCallback(() => {
    const ns = nodesRef.current.filter((n) => n.x != null && n.y != null)
    const { w, h } = sizeRef.current
    if (ns.length === 0 || w === 0) return
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const n of ns) {
      minX = Math.min(minX, n.x!)
      minY = Math.min(minY, n.y!)
      maxX = Math.max(maxX, n.x!)
      maxY = Math.max(maxY, n.y!)
    }
    const pad = 40
    const gw = Math.max(1, maxX - minX)
    const gh = Math.max(1, maxY - minY)
    const k = Math.min(4, Math.max(0.2, Math.min((w - pad * 2) / gw, (h - pad * 2) / gh)))
    camRef.current = {
      k,
      x: w / 2 - ((minX + maxX) / 2) * k,
      y: h / 2 - ((minY + maxY) / 2) * k,
    }
    draw()
  }, [draw])

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
    draw()
  }, [draw])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => resize())
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [resize])

  // --- build / rebuild simulation on data, filter, or layout change ---------
  const filterKey =
    [...visibleTypes].sort().join(',') + '|' + groupByType + '|' + nodes.length + ':' + links.length

  useEffect(() => {
    // snapshot last positions for continuity
    for (const n of nodesRef.current) {
      if (n.x != null && n.y != null) posRef.current.set(n.id, { x: n.x, y: n.y })
    }

    const { w, h } = sizeRef.current
    const cx = (w || 800) / 2
    const cy = (h || 520) / 2

    const visNodes: GraphNode[] = nodes
      .filter((n) => visibleTypes.has(n.type))
      .map((n) => {
        const prev = posRef.current.get(n.id)
        return { ...n, degree: 0, x: prev?.x ?? cx + (Math.random() - 0.5) * 60, y: prev?.y ?? cy + (Math.random() - 0.5) * 60 }
      })
    const idSet = new Set(visNodes.map((n) => n.id))
    const byId = new Map(visNodes.map((n) => [n.id, n]))
    const visLinks: GraphLink[] = links
      .filter((l) => idSet.has(l.source) && idSet.has(l.target))
      .map((l) => ({ source: l.source, target: l.target, type: l.type }))

    const adj = new Map<string, Set<string>>()
    for (const n of visNodes) adj.set(n.id, new Set())
    for (const l of visLinks) {
      const s = l.source as string
      const t = l.target as string
      byId.get(s)!.degree++
      byId.get(t)!.degree++
      adj.get(s)?.add(t)
      adj.get(t)?.add(s)
    }
    adjRef.current = adj
    nodesRef.current = visNodes
    linksRef.current = visLinks

    // type cluster centers for grouped layout
    const types = [...new Set(visNodes.map((n) => n.type))]
    const centers = new Map<string, { x: number; y: number }>()
    const ring = Math.min(w || 800, h || 520) * 0.33
    types.forEach((t, i) => {
      const a = (i / Math.max(1, types.length)) * Math.PI * 2 - Math.PI / 2
      centers.set(t, { x: cx + Math.cos(a) * ring, y: cy + Math.sin(a) * ring })
    })

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    simRef.current?.stop()
    const sim = forceSimulation<GraphNode>(visNodes)
      .force(
        'link',
        forceLink<GraphNode, GraphLink>(visLinks)
          .id((d) => d.id)
          .distance(groupByType ? 28 : 38)
          .strength(groupByType ? 0.2 : 0.5)
      )
      .force('charge', forceManyBody<GraphNode>().strength(groupByType ? -50 : -95))
      .force('collide', forceCollide<GraphNode>().radius((d) => radius(d) + 1.5))
      .alphaDecay(reduced ? 0.2 : 0.0228)
      .stop()

    if (groupByType) {
      sim
        .force('x', forceX<GraphNode>((d) => centers.get(d.type)?.x ?? cx).strength(0.22))
        .force('y', forceY<GraphNode>((d) => centers.get(d.type)?.y ?? cy).strength(0.22))
    } else {
      sim
        .force('center', forceCenter(cx, cy))
        .force('x', forceX(cx).strength(0.03))
        .force('y', forceY(cy).strength(0.03))
    }

    simRef.current = sim
    sim.alpha(0.9)

    let stopped = false
    const loop = () => {
      if (stopped) return
      const s = simRef.current
      if (s && s.alpha() > s.alphaMin()) s.tick()
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      stopped = true
      cancelAnimationFrame(rafRef.current)
      sim.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, draw])

  // redraw on query change (highlight only — no sim rebuild)
  useEffect(() => {
    draw()
  }, [query, draw])

  // external fit trigger
  useEffect(() => {
    if (fitNonce > 0) fitView()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitNonce])

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
      const r = radius(n) + 4
      const d = (n.x - x) ** 2 + (n.y - y) ** 2
      if (d < r * r && d < bestD) {
        bestD = d
        best = n
      }
    }
    return best
  }
  const toSelected = (n: GraphNode): SelectedNode => ({
    refTable: n.refTable,
    refId: n.refId,
    title: n.title,
    type: n.type,
    projectId: n.projectId,
  })

  const dragRef = useRef({ mode: 'none' as 'none' | 'pan' | 'node', node: null as GraphNode | null, moved: false, lastX: 0, lastY: 0 })
  const clickRef = useRef({ id: '', t: 0 })

  const localXY = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function onPointerDown(e: React.PointerEvent) {
    canvasRef.current?.setPointerCapture(e.pointerId)
    const { x, y } = localXY(e)
    const n = nodeAt(x, y)
    dragRef.current = { mode: n ? 'node' : 'pan', node: n, moved: false, lastX: x, lastY: y }
    if (n) {
      simRef.current?.alphaTarget(0.3)
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
        if (n && n.title) setTooltip({ x, y, title: n.title, type: n.type, degree: n.degree })
        else setTooltip(null)
        draw()
      } else if (n && tooltip) {
        setTooltip((tt) => (tt ? { ...tt, x, y } : tt))
      }
      return
    }
    drag.moved = true
    setTooltip(null)
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
        // click vs double-click disambiguation
        const now = e.timeStamp
        if (clickRef.current.id === drag.node.id && now - clickRef.current.t < 320) {
          onNavigate(toSelected(drag.node))
          clickRef.current = { id: '', t: 0 }
        } else {
          clickRef.current = { id: drag.node.id, t: now }
          onSelect(toSelected(drag.node))
        }
      }
      drag.node.fx = null
      drag.node.fy = null
      simRef.current?.alphaTarget(0)
    }
    dragRef.current = { mode: 'none', node: null, moved: false, lastX: 0, lastY: 0 }
    canvasRef.current?.releasePointerCapture(e.pointerId)
  }
  function onPointerLeave() {
    hoverRef.current = null
    setTooltip(null)
    draw()
  }
  function onWheel(e: React.WheelEvent) {
    const { x, y } = localXY(e)
    const cam = camRef.current
    const k = Math.min(6, Math.max(0.15, cam.k * Math.exp(-e.deltaY * 0.0015)))
    cam.x = x - ((x - cam.x) * k) / cam.k
    cam.y = y - ((y - cam.y) * k) / cam.k
    cam.k = k
    setTooltip(null)
    draw()
  }
  function zoom(factor: number) {
    const cam = camRef.current
    const { w, h } = sizeRef.current
    const k = Math.min(6, Math.max(0.15, cam.k * factor))
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
        onPointerLeave={onPointerLeave}
        onWheel={onWheel}
      />
      {tooltip && (
        <div className="cortex-graph-tip" style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}>
          <span className="cortex-dot" style={{ background: nodeColor(tooltip.type) }} aria-hidden />
          <strong>{tooltip.title}</strong>
          <span className="cortex-graph-tip__meta">{tooltip.degree} link{tooltip.degree === 1 ? '' : 's'}</span>
        </div>
      )}
      <div className="cortex-graph-zoom">
        <button type="button" aria-label="Zoom in" onClick={() => zoom(1.3)}>+</button>
        <button type="button" aria-label="Zoom out" onClick={() => zoom(1 / 1.3)}>−</button>
        <button type="button" aria-label="Fit to view" onClick={fitView} title="Fit to view">⤢</button>
      </div>
      <div className="cortex-graph-hint">Click to inspect · double-click to open · scroll to zoom</div>
    </div>
  )
}
