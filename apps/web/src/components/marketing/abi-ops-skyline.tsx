'use client'

import Link from 'next/link'
import { useState, type CSSProperties } from 'react'

import {
  BuildingArt,
  StrokeStage,
  artClasses,
  useArtOnView,
} from './abi-ops-art'
import {
  gpAmount,
  gpErosionPoints,
  gpSignal,
  projectTypes,
  skylineProjects,
  type GpSignal,
  type ProjectType,
  type SkylineProject,
} from './abi-ops-projects'
import { formatPercent, formatPhp } from './abi-ops-records'
import { SKYLINE_ASPECT, skylineSpots } from './abi-ops-skyline-layout'
import type { ArtBuilding } from './abi-ops-skyline-art'
import ui from './abi-ops-ui.module.css'
import styles from './abi-ops-skyline.module.css'

type TypeFilter = 'All' | ProjectType
type CssVars = CSSProperties & Record<`--${string}`, string | number>

const SIGNAL_COPY: Record<GpSignal, { glyph: string; word: string; tone: string }> = {
  ok: { glyph: '✓', word: 'On plan', tone: ui.toneOk ?? '' },
  watch: { glyph: '!', word: 'Watch', tone: ui.toneWatch ?? '' },
  alert: { glyph: '▲', word: 'Alert', tone: ui.toneAlert ?? '' },
}

const DRAWING_PADDING = 18
/** Rough half-width of a name tag, so it can be kept inside the skyline. */
const TAG_CHAR_HALF = 3.6
const TAG_BASE_HALF = 40

const pad = (value: number): string => String(value).padStart(2, '0')

function ProjectDrawing({
  project,
  building,
}: {
  project: SkylineProject
  building: ArtBuilding | undefined
}) {
  if (!building) return null
  const [x, y, width, height] = building.hit
  return (
    <StrokeStage
      className={styles.drawingSvg}
      key={project.id}
      label={`${project.name}, drawn in outline`}
      viewBox={{
        x: x - DRAWING_PADDING,
        y: y - DRAWING_PADDING,
        width: width + DRAWING_PADDING * 2,
        height: height + DRAWING_PADDING * 2,
      }}
    >
      {(hatchId) => (
        <g className={artClasses.bldg} data-active="true" style={{ color: 'var(--color-navy-700)' }}>
          <BuildingArt building={building} hatchId={hatchId} />
        </g>
      )}
    </StrokeStage>
  )
}

function GpSummary({ project }: { project: SkylineProject }) {
  const signal = gpSignal(project)
  const erosion = gpErosionPoints(project)
  if (!signal || erosion === null || project.gpForecast === null) {
    return <dd className={ui.mono}>{formatPercent(project.gpPlan)} planned</dd>
  }
  const copy = SIGNAL_COPY[signal]
  return (
    <dd>
      <span className={ui.mono}>
        {formatPercent(project.gpForecast)} forecast, {formatPercent(project.gpPlan)} plan
      </span>
      <span className={`${ui.chip} ${copy.tone} ${styles.signal}`}>
        <span aria-hidden="true">{copy.glyph}</span>
        {copy.word}
        {erosion > 0 ? `, ${erosion.toFixed(1)} pts` : ''}
      </span>
    </dd>
  )
}

export function PortfolioSkyline() {
  const [filter, setFilter] = useState<TypeFilter>('All')
  const [activeId, setActiveId] = useState(skylineProjects[0]?.id ?? '')
  const [hoverId, setHoverId] = useState<string | null>(null)
  const { ref: stageRef, art } = useArtOnView<HTMLDivElement>()

  const matches = (project: SkylineProject, next: TypeFilter): boolean =>
    next === 'All' || project.type === next
  const visible = skylineProjects.filter((project) => matches(project, filter))
  const activeIndex = Math.max(
    0,
    skylineProjects.findIndex((project) => project.id === activeId),
  )
  const active = skylineProjects[activeIndex]
  const spot = skylineSpots[activeIndex]
  if (!active || !spot) return null

  function chooseFilter(next: TypeFilter) {
    setFilter(next)
    if (active && matches(active, next)) return
    const first = skylineProjects.find((project) => matches(project, next))
    if (first) setActiveId(first.id)
  }

  function step(direction: -1 | 1) {
    if (!active) return
    const index = visible.findIndex((project) => project.id === active.id)
    const next = visible[(index + direction + visible.length) % visible.length]
    if (next) setActiveId(next.id)
  }

  function preview(id: string) {
    setHoverId(id)
    setActiveId(id)
  }

  const half = Math.round(active.name.length * TAG_CHAR_HALF + TAG_BASE_HALF)

  return (
    <section aria-labelledby="work-title" className={styles.section} id="work">
      <div className={ui.container}>
        <div className={styles.head}>
          <div>
            <p className={ui.label}>
              <span aria-hidden="true">(</span>Sample portfolio
              <span aria-hidden="true">)</span>
            </p>
            <h2 className={ui.h2} id="work-title">
              Every project on one skyline
            </h2>
            <p className={ui.lead}>
              Each outline is a project in the pipeline or on site. Hover one to read its numbers,
              or filter the skyline by type and watch it rebuild. Figures are illustrative.
            </p>
          </div>
          <div aria-label="Filter by project type" className={styles.filters} role="group">
            {projectTypes.map((type) => {
              const count = skylineProjects.filter((project) => matches(project, type)).length
              const isOn = filter === type
              return (
                <button
                  aria-pressed={isOn}
                  className={`${styles.filter} ${isOn ? styles.filterOn : ''}`}
                  key={type}
                  onClick={() => chooseFilter(type)}
                  type="button"
                >
                  {type}
                  <span className={ui.mono}>{count}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <p className={styles.swipeHint}>Swipe along the skyline, tap a building</p>

      <div className={styles.scroller}>
        <div className={styles.rail}>
          <div
            className={styles.skyline}
            ref={stageRef}
            style={{ aspectRatio: SKYLINE_ASPECT }}
          >
            {art ? (
              <StrokeStage viewBox={art.ART_VIEWBOX}>
                {(hatchId) => (
                  <>
                    <path
                      className={artClasses.ground}
                      d={art.ART_GROUND.d}
                      pathLength={1}
                      style={{ '--dur': `${art.ART_GROUND.duration}ms` } as CssVars}
                    />
                    {art.artBuildings.map((building, index) => {
                      const project = skylineProjects[index]
                      if (!project) return null
                      return (
                        <g
                          key={project.id}
                          style={{ '--bd': `${building.bd}ms` } as CssVars}
                          transform={`translate(${building.tx} ${building.ty})`}
                        >
                          <g
                            className={artClasses.bldg}
                            data-active={project.id === active.id}
                            data-muted={hoverId !== null && hoverId !== project.id}
                            data-off={!matches(project, filter)}
                            onClick={() => setActiveId(project.id)}
                            onPointerEnter={() => preview(project.id)}
                            onPointerLeave={() => setHoverId(null)}
                          >
                            <rect
                              fill="transparent"
                              height={building.hit[3]}
                              width={building.hit[2]}
                              x={building.hit[0]}
                              y={building.hit[1]}
                            />
                            <g className={artClasses.lift}>
                              <BuildingArt building={building} hatchId={hatchId} />
                            </g>
                          </g>
                        </g>
                      )
                    })}
                  </>
                )}
              </StrokeStage>
            ) : null}

            <div
              aria-hidden="true"
              className={styles.tag}
              style={{ '--cx': `${spot.cx}%`, '--top': `${spot.top}%`, '--half': `${half}px` } as CssVars}
            >
              <div className={styles.tagPill} key={active.id}>
                <span className={ui.mono}>{pad(activeIndex + 1)}</span>
                <span>{active.name}</span>
                <span>↗</span>
              </div>
            </div>
            <div
              aria-hidden="true"
              className={styles.tagTick}
              style={{ '--cx': `${spot.cx}%`, '--top': `${spot.top}%` } as CssVars}
            />
          </div>

          <ol aria-label="Projects on the skyline" className={styles.numbers}>
            {skylineProjects.map((project, index) => {
              const isActive = project.id === active.id
              const isOff = !matches(project, filter)
              return (
                <li key={project.id} style={{ left: `${skylineSpots[index]?.cx ?? 0}%` }}>
                  <button
                    aria-pressed={isActive}
                    className={styles.number}
                    data-off={isOff}
                    disabled={isOff}
                    onClick={() => setActiveId(project.id)}
                    onFocus={() => setActiveId(project.id)}
                    type="button"
                  >
                    <span aria-hidden="true" className={styles.numberTick} />
                    <span className={ui.mono}>{pad(index + 1)}</span>
                    <span className={styles.srOnly}>{project.name}</span>
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      </div>

      <div className={ui.container}>
        <article aria-live="polite" className={styles.detailCard} key={active.id}>
          <div className={styles.drawingWrap}>
            <ProjectDrawing building={art?.artBuildings[activeIndex]} project={active} />
          </div>
          <div className={styles.info}>
            <div className={styles.infoTop}>
              <p className={`${styles.number2} ${ui.mono}`}>
                No. {pad(activeIndex + 1)} / {pad(skylineProjects.length)}
              </p>
              <span className={ui.chip}>{active.type}</span>
            </div>
            <h3 className={styles.name}>{active.name}</h3>
            <p className={styles.where}>
              {active.location} <span aria-hidden="true">·</span> {active.stage}
            </p>
            <p className={styles.summary}>{active.summary}</p>
            <dl className={styles.facts}>
              <div>
                <dt>Floor area</dt>
                <dd className={ui.mono}>{active.areaM2.toLocaleString('en-US')} m²</dd>
              </div>
              <div>
                <dt>Contract value</dt>
                <dd className={ui.mono}>{formatPhp(active.tcv)}</dd>
              </div>
              <div>
                <dt>Gross profit</dt>
                <dd className={ui.mono}>{formatPhp(gpAmount(active))}</dd>
              </div>
              <div>
                <dt>Margin</dt>
                <GpSummary project={active} />
              </div>
            </dl>
            <div className={styles.actions}>
              <Link className={ui.button} href="/auth/login">
                Open in workspace
                <span aria-hidden="true">↗</span>
              </Link>
              <div className={styles.stepper}>
                <button
                  aria-label="Previous project"
                  className={ui.roundButton}
                  onClick={() => step(-1)}
                  type="button"
                >
                  <span aria-hidden="true">←</span>
                </button>
                <button
                  aria-label="Next project"
                  className={ui.roundButton}
                  onClick={() => step(1)}
                  type="button"
                >
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>
  )
}
