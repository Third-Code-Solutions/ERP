'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRef, useState, type CSSProperties } from 'react'
import { useGSAP } from '@gsap/react'
import { track } from '@vercel/analytics'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

import { landingFaqs } from './third-code-content'
import styles from './third-code-landing.module.css'

gsap.registerPlugin(ScrollTrigger, useGSAP)

type IconName =
  | 'arrow'
  | 'brain'
  | 'check'
  | 'cube'
  | 'layers'
  | 'lock'
  | 'search'
  | 'spark'

type Capability = {
  id: string
  title: string
  description: string
  detail: string
  icon: IconName
}

type WorkflowCard = {
  title: string
  description: string
  items: string[]
  stage: string
}

type TeamPriority = {
  quote: string
  role: string
  context: string
}

const capabilities: Capability[] = [
  {
    id: 'find',
    title: 'Find anything',
    description: 'Search every approved record from one calm command surface.',
    detail:
      'Projects, drawings, RFQs, purchase orders, claims, invoices, tasks, and decisions stay connected to their source.',
    icon: 'search',
  },
  {
    id: 'understand',
    title: 'Understand context',
    description: 'See why a number changed—not only what changed.',
    detail:
      'Cortex connects owners, dependencies, documents, approvals, and history into a permission-aware operating graph.',
    icon: 'brain',
  },
  {
    id: 'act',
    title: 'Move work forward',
    description: 'Turn answers into reviewable next actions.',
    detail:
      'Draft follow-ups, procurement actions, billing packets, and schedules while people retain final approval.',
    icon: 'spark',
  },
  {
    id: 'prove',
    title: 'Prove every decision',
    description: 'Trace every change back to its source and approver.',
    detail:
      'Tenant isolation, citations, provenance, and append-only audit history keep operations defensible.',
    icon: 'lock',
  },
]

const workflowCards: WorkflowCard[] = [
  {
    stage: 'Win',
    title: 'Turn pipeline into a controlled handoff.',
    description:
      'Account, KYC, opportunity, proposal, inspection, and commercial history move together when work is awarded.',
    items: ['Role-scoped pipeline', 'SLA and approval gates', 'No re-entry at handoff'],
  },
  {
    stage: 'Plan',
    title: 'Build scope, cost, and procurement from one record.',
    description:
      'Drawings, takeoffs, BOMs, rate cards, RFQs, and purchase orders stay linked from estimate to delivery.',
    items: ['Drawing-to-BOM workflow', 'Supplier comparisons', 'Approval-ready purchase orders'],
  },
  {
    stage: 'Deliver',
    title: 'Keep site execution visible without status theater.',
    description:
      'Tasks, progress, photos, permits, deliveries, variation orders, and punchlists form one live project history.',
    items: ['Daily work queues', 'Progress and cost signals', 'Client-ready reporting'],
  },
  {
    stage: 'Close',
    title: 'Finish with billing, turnover, and warranty intact.',
    description:
      'Claims, invoices, retention, compliance documents, handover records, and warranty issues remain searchable.',
    items: ['PH-ready billing controls', 'Turnover completeness', 'Warranty continuity'],
  },
]

const teamPriorities: TeamPriority[] = [
  {
    quote: 'Show me what needs attention now, then let me open the evidence.',
    role: 'Owner and leadership',
    context: 'Portfolio health, margin risk, approvals, and forecast',
  },
  {
    quote: 'Keep my estimating judgment. Remove the repetitive reconstruction.',
    role: 'Commercial and estimating',
    context: 'Scope, historical rates, BOM review, and audit',
  },
  {
    quote: 'Give the site one source for today—not another place to report yesterday.',
    role: 'Project delivery',
    context: 'Tasks, materials, progress, blockers, and handover',
  },
  {
    quote: 'Make every payable, claim, and exception traceable before month-end.',
    role: 'Finance and compliance',
    context: 'Billing, retention, VAT, BIR records, and approvals',
  },
]

const proofItems = [
  'CRM',
  'Estimating',
  'BOM',
  'Procurement',
  'Projects',
  'Billing',
  'Compliance',
  'Warranty',
  'Cortex AI',
]

function ProductIcon({ name }: { name: IconName }) {
  const sharedProps = {
    'aria-hidden': true,
    fill: 'none',
    height: 20,
    viewBox: '0 0 24 24',
    width: 20,
  }

  switch (name) {
    case 'arrow':
      return (
        <svg {...sharedProps}>
          <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      )
    case 'brain':
      return (
        <svg {...sharedProps}>
          <path d="M9.5 5.1A3.5 3.5 0 0 0 6 8.6v.2a3.8 3.8 0 0 0 .2 7.5A3.5 3.5 0 0 0 9.5 20m5-14.9A3.5 3.5 0 0 1 18 8.6v.2a3.8 3.8 0 0 1-.2 7.5A3.5 3.5 0 0 1 14.5 20M9.5 4v16m5-16v16M6 9.5h3.5m5 0H18M6.2 16h3.3m5 0h3.3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
        </svg>
      )
    case 'check':
      return (
        <svg {...sharedProps}>
          <path d="m5 12 4 4 10-10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        </svg>
      )
    case 'cube':
      return (
        <svg {...sharedProps}>
          <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 9 8-4.5M12 12 4 7.5M12 12v9" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.5" />
        </svg>
      )
    case 'layers':
      return (
        <svg {...sharedProps}>
          <path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
        </svg>
      )
    case 'lock':
      return (
        <svg {...sharedProps}>
          <path d="M7 10V8a5 5 0 0 1 10 0v2m-9 0h8a2 2 0 0 1 2 2v7H6v-7a2 2 0 0 1 2-2Zm4 4v2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
        </svg>
      )
    case 'search':
      return (
        <svg {...sharedProps}>
          <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.6" />
          <path d="m15.5 15.5 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
        </svg>
      )
    case 'spark':
      return (
        <svg {...sharedProps}>
          <path d="M12 2.5c.8 5.2 2.3 6.7 7.5 7.5-5.2.8-6.7 2.3-7.5 7.5-.8-5.2-2.3-6.7-7.5-7.5 5.2-.8 6.7-2.3 7.5-7.5ZM19 16.5c.3 1.8.7 2.2 2.5 2.5-1.8.3-2.2.7-2.5 2.5-.3-1.8-.7-2.2-2.5-2.5 1.8-.3 2.2-.7 2.5-2.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.4" />
        </svg>
      )
  }
}

export function ThirdCodeLanding() {
  const root = useRef<HTMLElement>(null)
  const [activeCapability, setActiveCapability] = useState('find')
  const [priorityIndex, setPriorityIndex] = useState(0)

  useGSAP(
    () => {
      const media = gsap.matchMedia()

      media.add(
        {
          desktop: '(min-width: 960px)',
          reduceMotion: '(prefers-reduced-motion: reduce)',
        },
        (context) => {
          const reduceMotion = Boolean(context.conditions?.reduceMotion)
          const desktop = Boolean(context.conditions?.desktop)

          if (reduceMotion) {
            gsap.set('[data-hero-media], [data-stack-card]', {
              clearProps: 'all',
            })
            return
          }

          gsap.fromTo(
            '[data-hero-media]',
            { autoAlpha: 0.72, scale: 0.88, y: 56 },
            {
              autoAlpha: 1,
              duration: 1.2,
              ease: 'power3.out',
              scale: 1,
              y: 0,
            }
          )

          gsap.to('[data-hero-media]', {
            autoAlpha: 0.32,
            ease: 'none',
            scale: 1.04,
            scrollTrigger: {
              end: 'bottom top',
              scrub: 0.8,
              start: '55% 45%',
              trigger: '[data-hero]',
            },
          })

          if (desktop) {
            const cards = gsap.utils.toArray<HTMLElement>('[data-stack-card]')
            cards.forEach((card, index) => {
              gsap.to(card, {
                ease: 'none',
                scale: 1 - (cards.length - index - 1) * 0.018,
                scrollTrigger: {
                  end: 'bottom 24%',
                  endTrigger: '[data-stack]',
                  pin: true,
                  pinSpacing: index === cards.length - 1,
                  scrub: 0.55,
                  start: `top ${18 + index * 3}%`,
                  trigger: card,
                },
              })
            })
          }
        }
      )

      return () => media.revert()
    },
    { scope: root }
  )

  const currentPriority = teamPriorities[priorityIndex] ?? teamPriorities[0]!

  function movePriority(direction: -1 | 1) {
    setPriorityIndex((current) => {
      const next = current + direction
      if (next < 0) return teamPriorities.length - 1
      if (next >= teamPriorities.length) return 0
      return next
    })
  }

  return (
    <main className={styles.page} ref={root}>
      <a className={styles.skipLink} href="#main-content">
        Skip to main content
      </a>

      <nav aria-label="Primary navigation" className={styles.nav}>
        <Link aria-label="Third Code ERP home" className={styles.brand} href="/">
          <span aria-hidden="true" className={styles.brandMark}>
            TC
          </span>
          <span className={styles.brandCopy}>
            <strong>Third Code ERP</strong>
            <small>Built for work that compounds</small>
          </span>
        </Link>

        <div className={styles.navLinks}>
          <a href="#platform">Platform</a>
          <a href="#cortex">Cortex AI</a>
          <a href="#workflows">Workflows</a>
          <a href="#trust">Trust</a>
        </div>

        <div className={styles.navActions}>
          <Link className={styles.textLink} href="/auth/login">
            Sign in
          </Link>
          <Link
            className={styles.navCta}
            data-analytics="nav-guided-setup"
            href="/auth/signup"
            onClick={() => track('Guided Setup CTA', { placement: 'navigation' })}
          >
            Start guided setup
          </Link>
        </div>
      </nav>

      <div id="main-content">
        <section className={styles.hero} data-hero>
          <div className={styles.heroGlow} />
          <div className={styles.heroCopy}>
            <p className={styles.heroKicker}>
              Construction intelligence, without enterprise software overhead
            </p>
            <h1>
              <span className={styles.heroLine}>Run every project</span>
              <span className={styles.heroLine}>
                <span aria-hidden="true" className={styles.inlineImage}>
                  <Image
                    alt=""
                    fill
                    sizes="(max-width: 700px) 72px, 118px"
                    src="/images/third-code-erp-hero.png"
                  />
                </span>{' '}
                with an AI brain
              </span>{' '}
              <span className={styles.heroLine}>that remembers.</span>
            </h1>
            <p className={styles.heroLead}>
              Third Code ERP connects pipeline, estimates, procurement, delivery,
              billing, compliance, and company knowledge—so teams see what matters
              and why.
            </p>
            <div className={styles.heroActions}>
              <Link
                className={styles.primaryButton}
                data-analytics="hero-guided-setup"
                href="/auth/signup"
                onClick={() => track('Guided Setup CTA', { placement: 'hero' })}
              >
                Start guided setup
                <ProductIcon name="arrow" />
              </Link>
              <Link
                className={styles.secondaryButton}
                href="/auth/login"
                onClick={() => track('Workspace CTA', { placement: 'hero' })}
              >
                Open workspace
              </Link>
            </div>
            <p className={styles.heroNote}>
              Multi-tenant. Permission-aware. Designed for Philippine construction
              and adaptable operating teams.
            </p>
          </div>

          <div className={styles.heroMedia} data-hero-media>
            <div className={styles.heroImageFrame}>
              <Image
                alt="Architectural plans, fit-out materials, and a connected operations graph in a construction workspace"
                fill
                fetchPriority="high"
                loading="eager"
                sizes="(max-width: 900px) 100vw, 58vw"
                src="/images/third-code-erp-hero.png"
              />
            </div>
            <div className={styles.mediaSignal}>
              <span className={styles.signalDot} />
              <div>
                <small>Cortex source chain</small>
                <strong>14 linked records · verified now</strong>
              </div>
            </div>
          </div>
        </section>

        <div aria-hidden="true" className={styles.proofRail}>
          <div className={styles.proofTrack}>
            {[...proofItems, ...proofItems].map((item, index) => (
              <span key={`${item}-${index}`}>
                {item}
                <i />
              </span>
            ))}
          </div>
        </div>

        <section className={styles.chapter} id="platform">
          <div className={styles.chapterIntro}>
            <p className={styles.chapterKicker}>One operating record</p>
            <h2>Less software to manage. More business to understand.</h2>
            <p>
              Purpose-built depth for construction, with configurable structure for
              teams that sell, plan, deliver, bill, and support complex work.
            </p>
          </div>

          <div className={styles.bentoGrid}>
            <article className={`${styles.bentoCard} ${styles.brainCard}`} id="cortex">
              <div className={styles.cardHeader}>
                <span className={styles.cardIcon}>
                  <ProductIcon name="brain" />
                </span>
                <span>Permissioned company intelligence</span>
              </div>
              <h3>Ask the business. Open the evidence.</h3>
              <p>
                Cortex reasons across live ERP records, relationships, documents,
                history, and approvals while staying inside each user&apos;s access.
              </p>
              <div aria-label="Example Cortex relationship graph" className={styles.graphVisual}>
                <span className={styles.graphNode}>Project</span>
                <span className={styles.graphNode}>BOM</span>
                <span className={styles.graphNode}>PO</span>
                <span className={styles.graphNode}>Claim</span>
                <span className={styles.graphNode}>Invoice</span>
                <svg aria-hidden="true" viewBox="0 0 640 210">
                  <path d="M112 108C170 20 250 30 300 94S430 178 528 105" />
                  <path d="M112 108c70 58 136 64 188-14s142-82 228 11" />
                  <path d="M300 94v88" />
                </svg>
              </div>
              <ul className={styles.inlineChecklist}>
                <li><ProductIcon name="check" /> Source citations</li>
                <li><ProductIcon name="check" /> Human-approved actions</li>
                <li><ProductIcon name="check" /> Provenance and freshness</li>
              </ul>
            </article>

            <article className={`${styles.bentoCard} ${styles.operationsCard}`}>
              <div className={styles.cardHeader}>
                <span className={styles.cardIcon}>
                  <ProductIcon name="layers" />
                </span>
                <span>Connected operations</span>
              </div>
              <h3>From first conversation to final warranty.</h3>
              <div className={styles.operationFlow}>
                {['Win', 'Estimate', 'Buy', 'Build', 'Bill', 'Support'].map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </article>

            <article className={`${styles.bentoCard} ${styles.complianceCard}`} id="trust">
              <div className={styles.cardHeader}>
                <span className={styles.cardIcon}>
                  <ProductIcon name="lock" />
                </span>
                <span>Controls built into the work</span>
              </div>
              <h3>PH-ready compliance without the end-of-month archaeology.</h3>
              <div className={styles.complianceList}>
                <span>VAT and retention</span>
                <span>BIR 2307 support</span>
                <span>Tenant isolation</span>
                <span>Hash-chained audit</span>
              </div>
            </article>
          </div>
        </section>

        <section className={`${styles.chapter} ${styles.capabilityChapter}`}>
          <div className={styles.chapterIntro}>
            <p className={styles.chapterKicker}>Cortex in the flow of work</p>
            <h2>Search is useful. Context is transformative.</h2>
          </div>

          <ul className={styles.accordion}>
            {capabilities.map((capability) => {
              const isActive = activeCapability === capability.id
              return (
                <li key={capability.id}>
                  <button
                    aria-expanded={isActive}
                    className={`${styles.accordionItem} ${isActive ? styles.accordionItemActive : ''}`}
                    onClick={() => setActiveCapability(capability.id)}
                    onFocus={() => setActiveCapability(capability.id)}
                    onMouseEnter={() => setActiveCapability(capability.id)}
                    type="button"
                  >
                    <span className={styles.accordionIcon}>
                      <ProductIcon name={capability.icon} />
                    </span>
                    <span className={styles.accordionTitle}>{capability.title}</span>
                    <span className={styles.accordionBody}>
                      <strong>{capability.description}</strong>
                      <span>{capability.detail}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        <section className={`${styles.chapter} ${styles.workflowChapter}`} id="workflows">
          <div className={styles.workflowIntro}>
            <p className={styles.chapterKicker}>A continuous project record</p>
            <h2>Each handoff carries its decisions with it.</h2>
            <p>
              The next team starts with context, not another spreadsheet and a
              meeting to reconstruct what happened.
            </p>
          </div>

          <div className={styles.workflowStack} data-stack>
            {workflowCards.map((card, index) => (
              <article
                className={styles.workflowCard}
                data-stack-card
                key={card.stage}
                style={{ '--card-index': index } as CSSProperties}
              >
                <div className={styles.workflowStage}>
                  <strong>{card.stage}</strong>
                </div>
                <div>
                  <h3>{card.title}</h3>
                  <p>{card.description}</p>
                </div>
                <ul>
                  {card.items.map((item) => (
                    <li key={item}><ProductIcon name="check" />{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className={`${styles.chapter} ${styles.priorityChapter}`}>
          <div className={styles.priorityMedia}>
            <Image
              alt=""
              fill
              sizes="(max-width: 900px) 100vw, 44vw"
              src="/images/third-code-erp-hero.png"
            />
          </div>
          <div className={styles.priorityContent}>
            <p className={styles.chapterKicker}>What operating teams need</p>
            <div aria-live="polite" className={styles.priorityQuote}>
              <blockquote>“{currentPriority.quote}”</blockquote>
              <p>
                <strong>{currentPriority.role}</strong>
                <span>{currentPriority.context}</span>
              </p>
            </div>
            <div className={styles.carouselControls}>
              <span>
                {priorityIndex + 1} / {teamPriorities.length}
              </span>
              <div>
                <button aria-label="Previous team priority" onClick={() => movePriority(-1)} type="button">
                  <ProductIcon name="arrow" />
                </button>
                <button aria-label="Next team priority" onClick={() => movePriority(1)} type="button">
                  <ProductIcon name="arrow" />
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className={`${styles.chapter} ${styles.faqChapter}`} id="questions">
          <div className={styles.faqIntro}>
            <p className={styles.chapterKicker}>Clear before complex</p>
            <h2>Questions operating teams ask first.</h2>
            <p>
              Direct answers. No implementation theater, hidden autonomy, or
              compliance claims without review.
            </p>
          </div>
          <div className={styles.faqList}>
            {landingFaqs.map((item) => (
              <details key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className={styles.ctaSection}>
          <div className={styles.ctaNoise} />
          <p>Build an ERP your team can understand on day one.</p>
          <h2>One company brain. Every project under control.</h2>
          <div className={styles.ctaActions}>
            <Link
              className={styles.ctaPrimary}
              data-analytics="footer-guided-setup"
              href="/auth/signup"
              onClick={() => track('Guided Setup CTA', { placement: 'closing' })}
            >
              Start guided setup
              <ProductIcon name="arrow" />
            </Link>
            <Link
              className={styles.ctaSecondary}
              href="/auth/login"
              onClick={() => track('Workspace CTA', { placement: 'closing' })}
            >
              Sign in to workspace
            </Link>
          </div>
        </section>
      </div>

      <footer className={styles.footer}>
        <div>
          <Link className={styles.footerBrand} href="/">
            <span aria-hidden="true" className={styles.brandMark}>TC</span>
            <span>
              <strong>Third Code ERP</strong>
              <small>Third Code Solutions Inc.</small>
            </span>
          </Link>
          <p>
            AI-native operations software for construction and complex project teams.
          </p>
        </div>
        <div className={styles.footerLinks}>
          <div>
            <strong>Platform</strong>
            <a href="#platform">Overview</a>
            <a href="#cortex">Cortex AI</a>
            <a href="#workflows">Workflows</a>
          </div>
          <div>
            <strong>Access</strong>
            <Link href="/auth/login">Sign in</Link>
            <Link href="/auth/signup">Create account</Link>
            <Link href="/auth/signup">Get started</Link>
          </div>
          <div>
            <strong>Trust</strong>
            <a href="#trust">Security</a>
            <a href="#trust">Compliance</a>
            <a href="#trust">Data controls</a>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <span>© 2026 Third Code Solutions Inc.</span>
          <span>Designed and engineered in the Philippines.</span>
        </div>
      </footer>
    </main>
  )
}
