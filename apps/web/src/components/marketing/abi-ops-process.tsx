'use client'

import { useEffect, useRef, useState } from 'react'

import { landingStages } from './abi-ops-content'
import { StageHouse } from './abi-ops-house'
import { Tower3D } from './abi-tower'
import {
  stageRecords,
  type RecordCell,
  type RecordTone,
  type StageRecord,
} from './abi-ops-records'
import ui from './abi-ops-ui.module.css'
import styles from './abi-ops-process.module.css'

const TONE_GLYPH: Record<RecordTone, string> = {
  ok: '✓',
  watch: '!',
  alert: '▲',
  neutral: '',
}

const toneClass = (tone: RecordTone): string =>
  tone === 'ok' ? (ui.toneOk ?? '') : tone === 'watch' ? (ui.toneWatch ?? '') : tone === 'alert' ? (ui.toneAlert ?? '') : ''

/** Each ERP stage maps to a point in the house's construction. */
const HOUSE_STAGE_LABELS = [
  'site secured',
  'massing',
  'structure',
  'facade and detail',
  'built and handed over',
] as const

const pad = (value: number): string => String(value).padStart(2, '0')

function CellText({ cell }: { cell: RecordCell }) {
  const tone = cell.tone ?? 'neutral'
  if (tone === 'neutral') return <>{cell.text}</>
  return (
    <span className={`${styles.status} ${toneClass(tone)}`}>
      <span aria-hidden="true">{TONE_GLYPH[tone]}</span>
      {cell.text}
    </span>
  )
}

function RecordView({ record }: { record: StageRecord }) {
  return (
    <div className={styles.record}>
      <p className={styles.recordCaption}>{record.caption}</p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {record.columns.map((column) => (
                <th
                  className={column.isNumeric ? styles.numeric : undefined}
                  key={column.label}
                  scope="col"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {record.rows.map((row) => (
              <tr key={row[0]?.text}>
                {row.map((cell, index) => (
                  <td
                    className={record.columns[index]?.isNumeric ? `${styles.numeric} ${ui.mono}` : undefined}
                    key={`${cell.text}-${index}`}
                  >
                    <CellText cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className={styles.totals}>
        {record.totals.map((total) => (
          <div className={total.isEmphasis ? styles.totalStrong : undefined} key={total.label}>
            <dt>{total.label}</dt>
            <dd className={ui.mono}>{total.value}</dd>
          </div>
        ))}
      </dl>
      <p className={styles.sample}>Sample record. Figures are illustrative.</p>
    </div>
  )
}

export function ProcessSection() {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isFrameSeen, setIsFrameSeen] = useState(false)
  const stepRefs = useRef<(HTMLLIElement | null)[]>([])
  const frameRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const steps = stepRefs.current.filter((step): step is HTMLLIElement => step !== null)
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const index = steps.indexOf(entry.target as HTMLLIElement)
          if (index >= 0) setActiveIndex(index)
        }
      },
      { rootMargin: '-48% 0px -46% 0px' },
    )
    steps.forEach((step) => observer.observe(step))
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        setIsFrameSeen(true)
        observer.disconnect()
      },
      { threshold: 0.35 },
    )
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  function jumpTo(index: number) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    stepRefs.current[index]?.scrollIntoView({
      behavior: reduce ? 'auto' : 'smooth',
      block: 'center',
    })
  }

  const active = landingStages[activeIndex] ?? landingStages[0]
  if (!active) return null
  const lastStage = landingStages.length - 1

  return (
    <section
      aria-labelledby="workflow-heading"
      className={styles.section}
      id="workflows"
    >
      <div className={ui.container}>
        <p className={ui.label}>
          <span aria-hidden="true">(</span>From award to warranty
          <span aria-hidden="true">)</span>
        </p>
        <h2 className={ui.h2} id="workflow-heading">
          Each handoff carries its decisions with it.
        </h2>
        <p className={ui.lead}>
          The next team starts with context, not another spreadsheet and a meeting to reconstruct
          what happened.
        </p>

        <div className={styles.layout}>
          <aside aria-label="The project drawing, built stage by stage" className={styles.panel}>
            <div className={`${styles.frame} ${ui.dots}`} ref={frameRef}>
              <div className={styles.frameHead}>
                <p className={`${styles.stageCount} ${ui.mono}`}>
                  Stage <b>{pad(activeIndex + 1)}</b> / {pad(landingStages.length)}
                </p>
                <p className={styles.stageName}>{active.title}</p>
              </div>
              <div className={styles.frameBody}>
                <Tower3D
                  caption="Floors"
                  fallback={
                    <StageHouse
                      className={styles.house}
                      label={`A community house drawn at the ${HOUSE_STAGE_LABELS[activeIndex] ?? 'first'} stage`}
                      lastStage={lastStage}
                      shouldBuild={isFrameSeen}
                      stage={activeIndex}
                    />
                  }
                  isLazy
                  mode="stage"
                  stage={activeIndex}
                />
              </div>
              <ol className={styles.ticks}>
                {landingStages.map((stage, index) => (
                  <li key={stage.id}>
                    <button
                      aria-current={index === activeIndex ? 'step' : undefined}
                      aria-label={`Go to stage ${index + 1}: ${stage.title}`}
                      className={`${styles.tick} ${index === activeIndex ? styles.tickOn : ''}`}
                      onClick={() => jumpTo(index)}
                      type="button"
                    >
                      <span className={ui.mono}>{pad(index + 1)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </aside>

          <ol className={styles.steps}>
            {landingStages.map((stage, index) => (
              <li
                className={styles.step}
                data-active={index === activeIndex}
                key={stage.id}
                ref={(node) => {
                  stepRefs.current[index] = node
                }}
              >
                <p className={`${styles.stepNumber} ${ui.mono}`}>
                  {pad(index + 1)} <span aria-hidden="true">/</span> {stage.title}
                </p>
                <h3 className={styles.stepTitle}>{stage.headline}</h3>
                <p className={styles.stepBody}>{stage.body}</p>
                <p className={ui.chip}>{stage.output}</p>
                <RecordView record={stageRecords[stage.id]} />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
