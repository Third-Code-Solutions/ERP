'use client'

import { useRef, type PointerEvent } from 'react'

import {
  DOOR_SPAN,
  GRID_X,
  GRID_Y,
  PLAN_VIEWBOX,
  planFcus,
  planRooms,
  planStats,
  planWalls,
  roomAreaM2,
  unitsToMm,
  wallSegments,
  type PlanOpening,
  type PlanWall,
} from './abi-ops-plan-data'
import styles from './abi-ops-plan.module.css'

const GRID_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const
const TILE = 15
const OFFICE = planRooms.find((room) => room.id === 'office')

const formatMm = (units: number): string =>
  unitsToMm(units).toLocaleString('en-US')

const wallPath = (wall: PlanWall, [from, to]: [number, number]): string =>
  wall.orient === 'h'
    ? `M${from} ${wall.c}H${to}`
    : `M${wall.c} ${from}V${to}`

function DoorSymbol({ wall, opening }: { wall: PlanWall; opening: PlanOpening }) {
  const swing = opening.swing ?? 1
  const end = opening.at + DOOR_SPAN
  const d =
    wall.orient === 'v'
      ? `M${wall.c} ${opening.at}H${wall.c + swing * DOOR_SPAN}M${wall.c + swing * DOOR_SPAN} ${opening.at}A${DOOR_SPAN} ${DOOR_SPAN} 0 0 ${swing > 0 ? 1 : 0} ${wall.c} ${end}`
      : `M${opening.at} ${wall.c}V${wall.c + swing * DOOR_SPAN}M${opening.at} ${wall.c + swing * DOOR_SPAN}A${DOOR_SPAN} ${DOOR_SPAN} 0 0 ${swing > 0 ? 0 : 1} ${end} ${wall.c}`
  return <path className={styles.detail} d={d} />
}

function WindowSymbol({ wall, opening }: { wall: PlanWall; opening: PlanOpening }) {
  const end = opening.at + opening.span
  return (
    <>
      {[-3, 0, 3].map((offset) => (
        <path
          className={styles.window}
          d={
            wall.orient === 'h'
              ? `M${opening.at} ${wall.c + offset}H${end}`
              : `M${wall.c + offset} ${opening.at}V${end}`
          }
          key={offset}
        />
      ))}
    </>
  )
}

function DimensionH({ x1, x2, y, text }: { x1: number; x2: number; y: number; text: string }) {
  const ticks = [x1, x2].map((x) => `M${x - 4} ${y + 4}L${x + 4} ${y - 4}`).join('')
  return (
    <g>
      <path className={styles.dim} d={`M${x1} ${y}H${x2}${ticks}`} />
      <text className={styles.lbl} textAnchor="middle" x={(x1 + x2) / 2} y={y - 7}>
        {text}
      </text>
    </g>
  )
}

function DimensionV({ x, y1, y2, text }: { x: number; y1: number; y2: number; text: string }) {
  const ticks = [y1, y2].map((y) => `M${x - 4} ${y + 4}L${x + 4} ${y - 4}`).join('')
  const mid = (y1 + y2) / 2
  return (
    <g>
      <path className={styles.dim} d={`M${x} ${y1}V${y2}${ticks}`} />
      <text
        className={styles.lbl}
        textAnchor="middle"
        transform={`rotate(-90 ${x - 8} ${mid})`}
        x={x - 8}
        y={mid}
      >
        {text}
      </text>
    </g>
  )
}

interface PlanTag {
  readonly x: number
  readonly y: number
  readonly text: string
  readonly isChip?: boolean
}

const planTags: readonly PlanTag[] = [
  { x: 262, y: 238, text: `Ceiling ${planStats.ceilingArea.toFixed(1)} m²` },
  { x: 560, y: 345, text: `FCU × ${planStats.fcuCount}` },
  { x: 792, y: 176, text: `Partition ${planStats.partitionLength.toFixed(1)} lm` },
  { x: 250, y: 112, text: `Doors × ${planStats.doorCount}` },
  { x: 262, y: 470, text: 'Draft BOM, for estimator review', isChip: true },
]

const CHAR_WIDTH = 6.2
const TAG_PAD = 16

function Tag({ tag }: { tag: PlanTag }) {
  const width = tag.text.length * CHAR_WIDTH + TAG_PAD
  return (
    <g transform={`translate(${tag.x} ${tag.y})`}>
      <g className={`${styles.tag} ${tag.isChip ? styles.tagChip : ''}`}>
        <circle r={3.5} />
        <path d="M3.5 0H12" />
        <rect height={20} rx={3} width={width} x={12} y={-10} />
        <text x={12 + TAG_PAD / 2} y={3.5}>
          {tag.text}
        </text>
      </g>
    </g>
  )
}

function PlanLinework({ isLens = false }: { isLens?: boolean }) {
  return (
    <>
      {isLens ? (
        <>
          {planRooms
            .filter((room) => room.hasCeiling)
            .map((room) => (
              <rect
                className={styles.roomFill}
                height={room.h}
                key={room.id}
                width={room.w}
                x={room.x}
                y={room.y}
              />
            ))}
          {OFFICE ? (
            <path
              className={styles.ceilingGrid}
              d={[
                ...Array.from(
                  { length: OFFICE.w / TILE + 1 },
                  (_, i) => `M${OFFICE.x + i * TILE} ${OFFICE.y}V${OFFICE.y + OFFICE.h}`,
                ),
                ...Array.from(
                  { length: OFFICE.h / TILE + 1 },
                  (_, i) => `M${OFFICE.x} ${OFFICE.y + i * TILE}H${OFFICE.x + OFFICE.w}`,
                ),
              ].join('')}
            />
          ) : null}
        </>
      ) : (
        <>
          {GRID_X.map((x, index) => (
            <g key={x}>
              <path className={styles.guide} d={`M${x} 36V528`} />
              <circle className={styles.detail} cx={x} cy={24} r={11} />
              <text className={styles.lbl} textAnchor="middle" x={x} y={27.5}>
                {GRID_LETTERS[index]}
              </text>
            </g>
          ))}
          {GRID_Y.map((y, index) => (
            <g key={y}>
              <path className={styles.guide} d={`M36 ${y}H1166`} />
              <circle className={styles.detail} cx={24} cy={y} r={11} />
              <text className={styles.lbl} textAnchor="middle" x={24} y={y + 3.5}>
                {index + 1}
              </text>
            </g>
          ))}
          {[95, 210, 330, 440].flatMap((y) =>
            [285, 380, 475, 570, 665].map((x) => (
              <rect className={styles.desk} height={26} key={`${x}-${y}`} width={70} x={x} y={y} />
            )),
          )}
        </>
      )}

      {planWalls.map((wall) => (
        <g key={`${wall.orient}-${wall.c}-${wall.from}`}>
          {wallSegments(wall).map((segment) => (
            <path
              className={wall.isInterior ? styles.wallInner : styles.wallOuter}
              d={wallPath(wall, segment)}
              key={segment.join('-')}
            />
          ))}
          {wall.openings.map((opening) =>
            opening.kind === 'door' ? (
              <DoorSymbol key={opening.at} opening={opening} wall={wall} />
            ) : (
              <WindowSymbol key={opening.at} opening={opening} wall={wall} />
            ),
          )}
        </g>
      ))}

      {GRID_X.flatMap((x) =>
        GRID_Y.map((y) => (
          <rect className={styles.column} height={10} key={`${x}-${y}`} width={10} x={x - 5} y={y - 5} />
        )),
      )}

      <path className={styles.detail} d="M100 140H200V166H100ZM70 470H230V492H70Z" />
      <path
        className={styles.detail}
        d="M990 90h40v40h-40zM1050 90h40v40h-40zM990 90l40 40M1030 90l-40 40M1050 90l40 40M1090 90l-40 40M990 340h120v130H990z"
      />
      <path
        className={styles.guide}
        d={Array.from({ length: 9 }, (_, i) => `M990 ${356 + i * 14}H1110`).join('')}
      />

      {planFcus.map((fcu) => (
        <g className={isLens ? styles.fcuLens : styles.fcu} key={`${fcu.x}-${fcu.y}`}>
          <rect height={22} width={22} x={fcu.x - 11} y={fcu.y - 11} />
          <path d={`M${fcu.x - 11} ${fcu.y - 11}l22 22M${fcu.x + 11} ${fcu.y - 11}l-22 22`} />
        </g>
      ))}

      {planRooms.map((room) => (
        <g key={room.id}>
          <text
            className={styles.lblRoom}
            textAnchor="middle"
            x={room.x + room.w / 2}
            y={room.y + room.h / 2 + room.labelDy}
          >
            {room.name.toUpperCase()}
          </text>
          <text
            className={styles.lblMinor}
            textAnchor="middle"
            x={room.x + room.w / 2}
            y={room.y + room.h / 2 + room.labelDy + 16}
          >
            {roomAreaM2(room).toFixed(1)} m²
          </text>
        </g>
      ))}

      {isLens ? null : (
        <>
          {GRID_X.slice(0, -1).map((x, index) => (
            <DimensionH
              key={x}
              text={formatMm(180)}
              x1={x}
              x2={GRID_X[index + 1] ?? x}
              y={532}
            />
          ))}
          <DimensionH text={formatMm(1080)} x1={60} x2={1140} y={560} />
          <DimensionV text={formatMm(440)} x={1178} y1={60} y2={500} />
          <text className={styles.lblMinor} x={60} y={584}>
            LEVEL 14 · OFFICE FIT-OUT · DIMENSIONS IN MM
          </text>
        </>
      )}

      {isLens ? planTags.map((tag) => <Tag key={tag.text} tag={tag} />) : null}
    </>
  )
}

export function BlueprintPlan() {
  const figureRef = useRef<HTMLDivElement>(null)

  function moveLens(event: PointerEvent<HTMLDivElement>) {
    const figure = figureRef.current
    if (!figure) return
    const box = figure.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) return
    figure.dataset.drift = 'false'
    figure.style.setProperty('--lx', `${((event.clientX - box.left) / box.width) * 100}%`)
    figure.style.setProperty('--ly', `${((event.clientY - box.top) / box.height) * 100}%`)
  }

  const viewBox = `0 0 ${PLAN_VIEWBOX.width} ${PLAN_VIEWBOX.height}`

  return (
    <div
      className={styles.figure}
      data-drift="true"
      onPointerDown={moveLens}
      onPointerMove={moveLens}
      ref={figureRef}
    >
      <svg
        aria-label="Level plan of an office fit-out, drawn in outline"
        className={`${styles.layer} ${styles.base}`}
        preserveAspectRatio="xMidYMid slice"
        role="img"
        viewBox={viewBox}
      >
        <PlanLinework />
      </svg>
      <svg
        aria-hidden="true"
        className={`${styles.layer} ${styles.lens}`}
        preserveAspectRatio="xMidYMid slice"
        viewBox={viewBox}
      >
        <PlanLinework isLens />
      </svg>
    </div>
  )
}
