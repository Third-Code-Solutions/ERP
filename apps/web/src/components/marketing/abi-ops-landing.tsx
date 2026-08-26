'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRef, useState, type CSSProperties } from 'react'
import { useGSAP } from '@gsap/react'
import { track } from '@vercel/analytics'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

import { landingFaqs } from './abi-ops-content'
import styles from './abi-ops-landing.module.css'

gsap.registerPlugin(ScrollTrigger, useGSAP)

type GlyphName = 'arrow' | 'search' | 'context' | 'action' | 'shield' | 'check'

type Capability = {
  id: string
  index: string
  title: string
  description: string
  detail: string
  glyph: Exclude<GlyphName, 'arrow' | 'check'>
}

type WorkflowCard = {
  stage: string
  title: string
  description: string
  items: string[]
}

type TeamPriority = {
  quote: string
  role: string
  context: string
}

const capabilities: Capability[] = [
  {
    id: 'find',
    index: '01',
    title: 'Find the record',
    description: 'Search every approved record from one calm command surface.',
    detail:
      'Projects, drawings, RFQs, purchase orders, claims, invoices, tasks, and decisions stay connected to their source.',
    glyph: 'search',
  },
  {
    id: 'understand',
    index: '02',
    title: 'Understand context',
    description: 'See why a number changed, not only what changed.',
    detail:
      'Cortex connects owners, dependencies, documents, approvals, and history into a permission-aware operating graph.',
    glyph: 'context',
  },
  {
    id: 'act',
    index: '03',
    title: 'Move work forward',
    description: 'Turn answers into reviewable next actions.',
    detail:
      'Draft follow-ups, procurement actions, billing packets, and schedules while people retain final approval.',
    glyph: 'action',
  },
  {
    id: 'prove',
    index: '04',
    title: 'Prove every decision',
    description: 'Trace every change back to its source and approver.',
    detail:
      'Tenant isolation, citations, provenance, and append-only audit history keep operations defensible.',
    glyph: 'shield',
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
    title: 'Keep site execution visible from queue to handover.',
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
    quote: 'Give the site one source for today, not another place to report yesterday.',
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
  'Pipeline',
  'Estimating',
  'BOM',
  'Procurement',
  'Projects',
  'Billing',
  'Compliance',
  'Warranty',
  'Cortex',
]

const glyphs: Record<GlyphName, string> = {
  action: '↗',
  arrow: '→',
  check: '✓',
  context: '◎',
  search: '⌕',
  shield: '◇',
}

function ProductGlyph({ name }: { name: GlyphName }) {
  return (
    <span aria-hidden="true" className={styles.glyph}>
      {glyphs[name]}
    </span>
  )
}

function AbiLogo({ className }: { className?: string }) {
  return (
    <span className={`${styles.logoFrame} ${className ?? ''}`}>
      <Image
        alt=""
        fill
        sizes="(max-width: 700px) 48px, 58px"
        src="/images/abi-mark.png"
      />
    </span>
  )
}

export function AbiOpsLanding() {
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
            gsap.set('[data-hero-media]', {
              clearProps: 'all',
            })
            return
          }

          gsap.fromTo(
            '[data-hero-media]',
            { scale: 1.03, y: 18 },
            {
              duration: 1.15,
              ease: 'power3.out',
              scale: 1,
              y: 0,
            }
          )

          gsap.to('[data-hero-media]', {
            ease: 'none',
            scale: 1.08,
            y: -36,
            scrollTrigger: {
              end: 'bottom top',
              scrub: 0.8,
              start: '55% 45%',
              trigger: '[data-hero]',
            },
          })

          if (!desktop) return
        },
      )

      return () => media.revert()
    },
    { scope: root },
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
        <Link aria-label="ABI OPS home" className={styles.brand} href="/">
          <AbiLogo />
          <span className={styles.brandCopy}>
            <strong>
              ABI <em>OPS</em>
            </strong>
            <small>Actuate Builders</small>
          </span>
        </Link>

        <div className={styles.navLinks}>
          <a href="#platform">Platform</a>
          <a href="#cortex">Cortex</a>
          <a href="#workflows">Workflows</a>
          <a href="#trust">Trust</a>
        </div>

        <div className={styles.navActions}>
          <Link className={styles.textLink} href="/auth/login">
            Open workspace
          </Link>
          <Link
            className={styles.navCta}
            data-analytics="nav-book-demo"
            href="/book-demo"
            onClick={() => track('Book Demo CTA', { placement: 'navigation' })}
          >
            Book a demo
          </Link>
        </div>
      </nav>

      <div id="main-content">
        <section className={styles.hero} data-hero>
          <div className={styles.heroMedia} data-hero-media>
            <Image
              alt="Architectural plans and construction materials arranged in a project workspace"
              fill
              sizes="100vw"
              src="/images/abi-ops-hero.png"
            />
          </div>
          <div aria-hidden="true" className={styles.heroOverlay} />
          <div className={styles.heroInner}>
            <div className={styles.heroRail}>
              <span>Construction operations, connected</span>
              <span>ABI OPS / One record</span>
            </div>

            <div className={styles.heroCopy}>
              <p className={styles.heroKicker}>
                A clearer way to run project-driven work
              </p>
          <h1>
            <span>One operating system.</span>
            {' '}
            <span>
              <em>Every project</em> in view.
            </span>
              </h1>
              <p className={styles.heroLead}>
                ABI OPS connects pipeline, cost, procurement, delivery, billing, and evidence in one operating record.
              </p>
              <div className={styles.heroActions}>
                <Link
                  className={styles.primaryButton}
                  data-analytics="hero-book-demo"
                  href="/book-demo"
                  onClick={() => track('Book Demo CTA', { placement: 'hero' })}
                >
                  Book a demo
                  <ProductGlyph name="arrow" />
                </Link>
                <Link
                  className={styles.secondaryButton}
                  href="/auth/login"
                  onClick={() => track('Workspace CTA', { placement: 'hero' })}
                >
                  Open workspace
                </Link>
              </div>
            </div>

            <div className={styles.heroMeta}>
              <div>
                <span>Record</span>
                <strong>Pipeline to turnover</strong>
              </div>
              <div>
                <span>Controls</span>
                <strong>Approval and evidence</strong>
              </div>
              <div>
                <span>Intelligence</span>
                <strong>Permission-aware Cortex</strong>
              </div>
              <div>
                <span>Built for</span>
                <strong>Philippine project teams</strong>
              </div>
            </div>
          </div>
        </section>

        <div className={styles.proofRail}>
          <div className={styles.proofInner}>
            <span className={styles.proofLabel}>One record across</span>
            <div aria-label="ABI OPS covers" className={styles.proofItems} role="list">
              {proofItems.map((item) => (
                <span key={item} role="listitem">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>

        <section className={styles.statementSection} id="platform">
          <div className={styles.sectionLabel}>The operating record</div>
            <div className={styles.statementLayout}>
              <h2>
                Less software to manage.
                {' '}
                <em>More business to understand.</em>
              </h2>
            <p>
              Purpose-built depth for construction, with configurable structure for teams that sell, plan, deliver, bill, and support complex work.
            </p>
          </div>
        </section>

        <section aria-labelledby="feature-heading" className={styles.featureSection}>
          <div className={styles.featureIntro}>
            <h2 id="feature-heading">One record for work that compounds.</h2>
            <p>
              The context stays with the work. People can act faster without giving up review, ownership, or proof.
            </p>
          </div>

          <div className={styles.featureGrid}>
            <article className={`${styles.featureCard} ${styles.featureCardPrimary}`} id="cortex">
              <div className={styles.cardTopline}>
                <span className={styles.cardGlyph}>
                  <ProductGlyph name="context" />
                </span>
                <span>Permissioned company intelligence</span>
              </div>
              <h3>Ask the business. Open the evidence.</h3>
              <p>
                Cortex reasons across live ERP records, relationships, documents, history, and approvals while staying inside each user&apos;s access.
              </p>
              <div className={styles.featureImage}>
                <Image
                  alt="Construction plans and materials arranged on an active site planning table"
                  fill
                  sizes="(max-width: 960px) 100vw, 52vw"
                  src="/images/abi-ops-operations.png"
                />
                <div className={styles.featureImageCaption}>
                  <span>Source chain</span>
                  <strong>Open the record behind the answer</strong>
                </div>
              </div>
              <ul className={styles.checkList}>
                <li><ProductGlyph name="check" /> Source citations</li>
                <li><ProductGlyph name="check" /> Human-approved actions</li>
                <li><ProductGlyph name="check" /> Provenance and freshness</li>
              </ul>
            </article>

            <article className={`${styles.featureCard} ${styles.featureCardFlow}`}>
              <div className={styles.cardTopline}>
                <span className={styles.cardGlyph}>
                  <ProductGlyph name="action" />
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

            <article className={`${styles.featureCard} ${styles.featureCardTrust}`} id="trust">
              <div className={styles.cardTopline}>
                <span className={styles.cardGlyph}>
                  <ProductGlyph name="shield" />
                </span>
                <span>Controls built into the work</span>
              </div>
              <h3>PH-ready controls before month-end becomes reconstruction.</h3>
              <div className={styles.complianceList}>
                <span>VAT and retention</span>
                <span>BIR 2307 support</span>
                <span>Tenant isolation</span>
                <span>Hash-chained audit</span>
              </div>
            </article>
          </div>
        </section>

        <section aria-labelledby="context-heading" className={styles.capabilitySection}>
          <div className={styles.capabilityIntro}>
            <h2 id="context-heading">
              Search is useful.
              {' '}
              <em>Context changes the work.</em>
            </h2>
            <p>
              Use the same operating record to find an answer, understand its history, and decide what should happen next.
            </p>
          </div>

          <ul className={styles.capabilityGrid}>
            {capabilities.map((capability) => {
              const isActive = activeCapability === capability.id
              return (
                <li key={capability.id}>
                  <button
                    aria-expanded={isActive}
                    className={`${styles.capabilityItem} ${isActive ? styles.capabilityItemActive : ''}`}
                    onClick={() => setActiveCapability(capability.id)}
                    onFocus={() => setActiveCapability(capability.id)}
                    onMouseEnter={() => setActiveCapability(capability.id)}
                    type="button"
                  >
                    <span className={styles.capabilityTopline}>
                      <span>{capability.index}</span>
                      <ProductGlyph name={capability.glyph} />
                    </span>
                    <strong>{capability.title}</strong>
                    {isActive ? (
                      <span className={styles.capabilityBody}>
                        <span>{capability.description}</span>
                        <small>{capability.detail}</small>
                      </span>
                    ) : null}
                    <span aria-hidden="true" className={styles.capabilityToggle}>
                      {isActive ? '−' : '+'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        <section aria-labelledby="workflow-heading" className={styles.workflowSection} id="workflows">
          <div className={styles.workflowLayout}>
            <div className={styles.workflowIntro}>
              <div className={styles.sectionLabel}>From award to warranty</div>
              <h2 id="workflow-heading">Each handoff carries its decisions with it.</h2>
              <p>
                The next team starts with context, not another spreadsheet and a meeting to reconstruct what happened.
              </p>
            </div>

              <div className={styles.workflowStack}>
                {workflowCards.map((card, index) => (
                  <article
                    className={styles.workflowCard}
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
                      <li key={item}><ProductGlyph name="check" />{item}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="priority-heading" className={styles.prioritySection}>
          <div className={styles.priorityMedia}>
            <Image
              alt="Construction plans and handover materials arranged on a finished site"
              fill
              sizes="(max-width: 900px) 100vw, 40vw"
              src="/images/abi-ops-field.png"
            />
          </div>
          <div className={styles.priorityContent}>
            <h2 id="priority-heading">What operating teams need first.</h2>
            <div aria-live="polite" className={styles.priorityQuote}>
              <blockquote>&ldquo;{currentPriority.quote}&rdquo;</blockquote>
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
                  <ProductGlyph name="arrow" />
                </button>
                <button aria-label="Next team priority" onClick={() => movePriority(1)} type="button">
                  <ProductGlyph name="arrow" />
                </button>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="questions-heading" className={styles.faqSection} id="questions">
          <div className={styles.faqLayout}>
            <div className={styles.faqIntro}>
              <h2 id="questions-heading">Questions teams ask first.</h2>
              <p>
                Direct answers. No implementation theater, hidden autonomy, or compliance claims without review.
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
          </div>
        </section>

        <section aria-labelledby="cta-heading" className={styles.ctaSection}>
          <p>Build an operating system your team can understand on day one.</p>
          <h2 id="cta-heading">One operating record. Every project under control.</h2>
          <div className={styles.ctaActions}>
            <Link
              className={styles.ctaPrimary}
              data-analytics="footer-book-demo"
              href="/book-demo"
              onClick={() => track('Book Demo CTA', { placement: 'closing' })}
            >
              Book a demo
              <ProductGlyph name="arrow" />
            </Link>
            <Link
              className={styles.ctaSecondary}
              href="/auth/login"
              onClick={() => track('Workspace CTA', { placement: 'closing' })}
            >
              Open workspace
            </Link>
          </div>
        </section>
      </div>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrandBlock}>
        <Link aria-label="ABI OPS home" className={styles.footerBrand} href="/">
              <AbiLogo className={styles.footerLogo} />
              <span>
                <strong>
                  ABI <em>OPS</em>
                </strong>
                <small>Actuate Builders Inc.</small>
              </span>
            </Link>
            <p>AI-native operations software for construction and complex project teams.</p>
          </div>
          <div className={styles.footerLinks}>
            <div>
              <strong>Platform</strong>
              <a href="#platform">Overview</a>
              <a href="#cortex">Cortex</a>
              <a href="#workflows">Workflows</a>
            </div>
            <div>
              <strong>Access</strong>
              <Link href="/auth/login">Open workspace</Link>
              <Link href="/book-demo">Book a demo</Link>
            </div>
            <div>
              <strong>Trust</strong>
              <a href="#trust">Security</a>
              <a href="#trust">Compliance</a>
              <a href="#questions">Questions</a>
            </div>
          </div>
          <div className={styles.footerBottom}>
            <span>&copy; 2026 Actuate Builders Inc.</span>
            <span>ABI OPS, built for work that compounds.</span>
          </div>
        </div>
      </footer>
    </main>
  )
}
