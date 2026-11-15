'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { landingCapabilities, landingControls, landingCortexChapters } from './abi-ops-content'
import { Brain3D, type BrainLabel } from './abi-brain'
import type { BrainController } from './abi-brain-scene'
import ui from './abi-ops-ui.module.css'
import styles from './abi-ops-cortex.module.css'

const LAST_CHAPTER = landingCortexChapters.length - 1
/** The timeline runs a little past either end so the story eases in and out. */
const MIN_CHAPTER = -0.6
const MAX_CHAPTER = LAST_CHAPTER + 0.6
const NARROW_QUERY = '(max-width: 959px)'

/** Sample records pinned to the memory network; ranges are on the brain's timeline. */
const BRAIN_LABELS: readonly BrainLabel[] = [
  { id: 'rec-po', from: -0.3, to: 0.95, title: 'PO-0412', detail: 'Purchase order, Supplier B', tone: 'gold' },
  { id: 'rec-claim', from: -0.1, to: 0.95, title: 'Claim 07', detail: 'Progress billing, 35%', tone: 'gold' },
  { id: 'rec-vo', from: 0.1, to: 0.95, title: 'VO-018', detail: 'Variation order, ceiling', tone: 'gold' },
  { id: 'query', from: 1.55, to: 2.6, title: 'Your question', detail: 'Why did margin slip on Level 14?', tone: 'gold' },
  { id: 'role', from: 1.75, to: 2.6, title: 'Hidden by role', detail: 'Not a finance record', tone: 'red' },
  { id: 'lock', from: 1.75, to: 2.6, title: 'Another tenant', detail: 'Row-level security', tone: 'red' },
  { id: 'cite-1', from: 2.75, to: 3.7, title: '[1] Claim 07', detail: 'Retention and VAT applied', tone: 'gold' },
  { id: 'cite-2', from: 2.95, to: 3.7, title: '[2] PO-0412', detail: 'Supplier B, +3.7% vs lowest', tone: 'gold' },
  { id: 'cite-3', from: 3.15, to: 3.7, title: '[3] VO-018', detail: 'Ceiling variation, +7.7%', tone: 'gold' },
  { id: 'cite-4', from: 3.35, to: 3.9, title: '[4] BOM line', detail: 'Ceiling tile, 599 m²', tone: 'gold' },
  { id: 'gate', from: 3.7, to: 4.7, title: 'Approval gate', detail: 'Drafted by Cortex, approved by a person', tone: 'green' },
  { id: 'chain', from: 4.75, to: 5.6, title: 'Hash chain', detail: 'Each entry commits to the last', tone: 'blue' },
]

/** Where the viewport's reading line sits along the chapter list, as a float. */
function readChapter(steps: readonly HTMLElement[], isNarrow: boolean): number {
  if (steps.length < 2) return 0
  const line = window.innerHeight * (isNarrow ? 0.74 : 0.5)
  const centers = steps.map((step) => {
    const box = step.getBoundingClientRect()
    return box.top + box.height / 2
  })
  const first = centers[0] ?? 0
  if (line <= first) {
    const span = (centers[1] ?? first + 1) - first || 1
    return Math.max(MIN_CHAPTER, (line - first) / span)
  }
  for (let k = 0; k < centers.length - 1; k += 1) {
    const a = centers[k] ?? 0
    const b = centers[k + 1] ?? a + 1
    if (line < b) return k + (line - a) / (b - a || 1)
  }
  const end = centers[centers.length - 1] ?? 0
  const span = end - (centers[centers.length - 2] ?? end - 1) || 1
  return Math.min(MAX_CHAPTER, LAST_CHAPTER + (line - end) / span)
}

export function CortexSection() {
  const [activeIndex, setActiveIndex] = useState(0)
  const [openCapability, setOpenCapability] = useState<string>('find')
  const stepRefs = useRef<(HTMLLIElement | null)[]>([])
  const controllerRef = useRef<BrainController | null>(null)
  const chapterRef = useRef(MIN_CHAPTER)
  const frameRef = useRef(0)

  const update = useCallback(() => {
    const steps = stepRefs.current.filter((step): step is HTMLLIElement => step !== null)
    const isNarrow = window.matchMedia(NARROW_QUERY).matches
    const chapter = readChapter(steps, isNarrow)
    chapterRef.current = chapter
    controllerRef.current?.setChapter(chapter)
    const nearest = Math.min(LAST_CHAPTER, Math.max(0, Math.round(chapter)))
    setActiveIndex((current) => (current === nearest ? current : nearest))
  }, [])

  useEffect(() => {
    const schedule = () => {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = requestAnimationFrame(update)
    }
    schedule()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frameRef.current)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [update])

  const handleReady = useCallback(
    (controller: BrainController | null) => {
      controllerRef.current = controller
      controller?.setChapter(chapterRef.current)
    },
    [],
  )

  function jumpTo(index: number) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    stepRefs.current[index]?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
  }

  return (
    <section aria-labelledby="cortex-title" className={styles.section} id="cortex">
      <div className={ui.container}>
        <header className={styles.head}>
          <p className={`${ui.label} ${styles.label}`}>
            <span aria-hidden="true">(</span>Cortex
            <span aria-hidden="true">)</span>
          </p>
          <h2 className={`${ui.h2} ${styles.title}`} id="cortex-title">
            A company brain that shows its work.
          </h2>
          <p className={`${ui.lead} ${styles.lead}`}>
            Permissioned company intelligence. Cortex turns every record into a connected memory,
            recalls only what you may open, and cites where each answer came from. Scroll to follow
            one question through it.
          </p>
        </header>

        <div className={styles.story}>
          <div className={styles.stage}>
            <div className={styles.stageFrame}>
              <Brain3D labels={BRAIN_LABELS} onReady={handleReady} />
              <ol aria-label="Cortex steps" className={styles.rail}>
                {landingCortexChapters.map((chapter, index) => (
                  <li key={chapter.id}>
                    <button
                      aria-current={index === activeIndex ? 'step' : undefined}
                      className={`${styles.railButton} ${index === activeIndex ? styles.railOn : ''}`}
                      onClick={() => jumpTo(index)}
                      type="button"
                    >
                      <span className={ui.mono}>{chapter.step}</span>
                      <span className={styles.railName}>{chapter.name}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <ol className={styles.chapters}>
            {landingCortexChapters.map((chapter, index) => (
              <li
                className={styles.chapter}
                data-active={index === activeIndex}
                key={chapter.id}
                ref={(node) => {
                  stepRefs.current[index] = node
                }}
              >
                <p className={`${styles.stepNo} ${ui.mono}`}>
                  {chapter.step} <span aria-hidden="true">/</span> {chapter.name}
                </p>
                <h3 className={styles.chapterTitle}>{chapter.title}</h3>
                <p className={styles.chapterBody}>{chapter.body}</p>
                <ul className={styles.details}>
                  {chapter.details.map((detail) => (
                    <li key={detail}>
                      <span aria-hidden="true">→</span>
                      {detail}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className={`${ui.container} ${styles.capabilities}`}>
        <div>
          <p className={`${ui.label} ${styles.label}`}>
            <span aria-hidden="true">(</span>What it does for people
            <span aria-hidden="true">)</span>
          </p>
          <h3 className={styles.capTitle}>Search is useful. Context changes the work.</h3>
          <p className={styles.capLead}>
            Use the same operating record to find an answer, understand its history, and decide
            what should happen next. Every answer opens the record behind it, and people keep the
            final approval.
          </p>
        </div>
        <ul className={styles.accordion}>
          {landingCapabilities.map((capability) => {
            const isOpen = openCapability === capability.id
            return (
              <li key={capability.id}>
                <button
                  aria-controls={`cap-${capability.id}`}
                  aria-expanded={isOpen}
                  className={styles.accordionButton}
                  onClick={() => setOpenCapability(capability.id)}
                  type="button"
                >
                  <span className={`${styles.capIndex} ${ui.mono}`}>{capability.index}</span>
                  <span className={styles.capName}>{capability.title}</span>
                  <span aria-hidden="true" className={styles.capToggle}>
                    {isOpen ? '−' : '+'}
                  </span>
                </button>
                <div className={styles.capBody} hidden={!isOpen} id={`cap-${capability.id}`}>
                  <p>{capability.description}</p>
                  <p>{capability.detail}</p>
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      <div className={`${ui.container} ${styles.trust}`} id="trust">
        <p className={`${ui.label} ${styles.label}`}>
          <span aria-hidden="true">(</span>Controls built into the work
          <span aria-hidden="true">)</span>
        </p>
        <h3 className={styles.trustTitle}>PH-ready controls before month-end becomes reconstruction.</h3>
        <dl className={styles.controls}>
          {landingControls.map((control) => (
            <div key={control.label}>
              <dt className={ui.mono}>{control.value}</dt>
              <dd>{control.label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
