'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { track } from '@vercel/analytics'

import {
  landingFaqs,
  landingPriorities,
  landingServices,
  type ServiceIcon,
} from './abi-ops-content'
import { CortexSection } from './abi-ops-cortex'
import { LandingFooter } from './abi-ops-footer'
import { AbiLogo } from './abi-ops-logo'
import { Tower3D, type TowerLabel, type TowerStatus } from './abi-tower'
import { BlueprintPlan } from './abi-ops-plan'
import { planStats } from './abi-ops-plan-data'
import { ProcessSection } from './abi-ops-process'
import { PortfolioSkyline } from './abi-ops-skyline'
import ui from './abi-ops-ui.module.css'
import styles from './abi-ops-landing.module.css'

const NAV_LINKS = [
  { href: '#platform', label: 'Platform' },
  { href: '#work', label: 'Portfolio' },
  { href: '#workflows', label: 'Workflow' },
  { href: '#cortex', label: 'Cortex' },
  { href: '#trust', label: 'Trust' },
] as const

const SCROLLED_AT = 8

const HERO_LABELS: readonly TowerLabel[] = [
  {
    id: 'floor',
    from: 1.9,
    to: 4.2,
    title: 'Level 14 fit-out',
    detail: `Draft BOM, ${planStats.fcuCount} FCU`,
  },
  { id: 'crane', from: 0.2, to: 3.4, title: 'Crane on site', detail: 'FCU delivery, PO approved' },
  { id: 'crown', from: 3.85, to: 4.2, title: 'GP 22.0% on plan', detail: 'Handover ready' },
]

const ICON_PATHS: Record<ServiceIcon, string> = {
  estimate: 'M10 6h20l8 8v28H10zM30 6v8h8M16 22h16M16 28h16M16 34h9',
  procure: 'M6 15l18-9 18 9v20l-18 9-18-9zM6 15l18 9 18-9M24 24v20',
  bill: 'M11 5h26v38l-4.3-3.2L28.4 43l-4.4-3.2L19.6 43l-4.3-3.2L11 43zM17 15h14M17 22h14M17 29h8',
}

const pad = (value: number): string => String(value).padStart(2, '0')

function SectionLabel({ children }: { children: string }) {
  return (
    <p className={ui.label}>
      <span aria-hidden="true">(</span>
      {children}
      <span aria-hidden="true">)</span>
    </p>
  )
}

function ServiceGlyph({ icon }: { icon: ServiceIcon }) {
  return (
    <svg aria-hidden="true" className={styles.serviceIcon} fill="none" viewBox="0 0 48 48">
      <path d={ICON_PATHS[icon]} stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function SiteNav() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  useEffect(() => {
    const update = () => setIsScrolled(window.scrollY > SCROLLED_AT)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])

  useEffect(() => {
    if (!isMenuOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isMenuOpen])

  return (
    <header className={styles.header} data-scrolled={isScrolled || isMenuOpen}>
      <nav aria-label="Primary navigation" className={styles.nav}>
        <Link aria-label="ABI OPS home" className={styles.brand} href="/">
          <AbiLogo />
          <span className={styles.brandCopy}>
            <strong>ABI OPS</strong>
            <small>Actuate Builders</small>
          </span>
        </Link>

        <div className={styles.navLinks}>
          {NAV_LINKS.map((link) => (
            <a href={link.href} key={link.href}>
              {link.label}
            </a>
          ))}
        </div>

        <div className={styles.navActions}>
          <Link className={styles.navLogin} href="/auth/login">
            Open workspace
          </Link>
          <Link
            className={`${ui.button} ${styles.navCta}`}
            data-analytics="nav-guided-setup"
            href="/auth/signup"
            onClick={() => track('Guided Setup CTA', { placement: 'navigation' })}
          >
            Start guided setup
            <span aria-hidden="true">↗</span>
          </Link>
          <button
            aria-controls="mobile-menu"
            aria-expanded={isMenuOpen}
            aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
            className={styles.menuButton}
            onClick={() => setIsMenuOpen((open) => !open)}
            type="button"
          >
            <span aria-hidden="true" className={styles.menuBars} />
          </button>
        </div>
      </nav>

      <div className={styles.menu} hidden={!isMenuOpen} id="mobile-menu">
        {NAV_LINKS.map((link, index) => (
          <a href={link.href} key={link.href} onClick={() => setIsMenuOpen(false)}>
            <span className={ui.mono}>{pad(index + 1)}</span>
            {link.label}
          </a>
        ))}
        <Link className={`${ui.button} ${styles.menuCta}`} href="/auth/signup">
          Start guided setup
        </Link>
      </div>
    </header>
  )
}

function Hero() {
  const [status, setStatus] = useState<TowerStatus>('loading')

  return (
    <section aria-labelledby="hero-title" className={`${styles.hero} ${ui.dots}`} data-hero>
      <div className={styles.heroGrid}>
        <div className={styles.heroCopy}>
          <h1 className={styles.h1} id="hero-title">
            <span className={styles.h1Muted}>One operating system.</span>{' '}
            <span>Every project in view.</span>
          </h1>
          <p className={styles.heroLead}>
            ABI OPS connects pipeline, cost, procurement, delivery, billing, and evidence in one
            operating record.
          </p>
          <div className={styles.heroActions}>
            <Link
              className={ui.button}
              data-analytics="hero-guided-setup"
              href="/auth/signup"
              onClick={() => track('Guided Setup CTA', { placement: 'hero' })}
            >
              Start guided setup
              <span aria-hidden="true">↗</span>
            </Link>
            <Link
              className={ui.textLink}
              href="/auth/login"
              onClick={() => track('Workspace CTA', { placement: 'hero' })}
            >
              Open workspace
              <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <p className={styles.heroHint}>
            {status === 'ready' ? (
              <span>( Drag to turn the tower. Hover a floor )</span>
            ) : (
              <>
                <span className={styles.hintPointer}>( Move across the plan to see the bill of materials )</span>
                <span className={styles.hintTouch}>( Tap the plan to move the lens )</span>
              </>
            )}
          </p>
        </div>
        <div className={styles.heroStage}>
          <Tower3D
            caption="Floors"
            fallback={<BlueprintPlan />}
            hasReplay
            labels={HERO_LABELS}
            mode="intro"
            onStatusChange={setStatus}
          />
        </div>
      </div>
    </section>
  )
}

function Services() {
  return (
    <section aria-labelledby="platform-title" className={styles.services} id="platform">
      <div className={styles.servicesCard}>
        <div className={styles.servicesIntro}>
          <div>
            <SectionLabel>What it runs</SectionLabel>
            <h2 className={styles.servicesTitle} id="platform-title">
              Less software to manage. More business to understand.
            </h2>
          </div>
          <p className={ui.lead}>
            Purpose-built depth for construction, with configurable structure for teams that sell,
            plan, deliver, bill, and support complex work.
          </p>
        </div>
        <ul className={styles.servicesGrid}>
          {landingServices.map((service) => (
            <li key={service.id}>
              <article className={styles.serviceCard}>
                <h3 className={`${styles.serviceHead} ${ui.mono}`}>
                  {service.index} <span aria-hidden="true">/</span> {service.title}
                </h3>
                <ServiceGlyph icon={service.icon} />
                <p>{service.body}</p>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Priorities() {
  const [index, setIndex] = useState(0)
  const current = landingPriorities[index] ?? landingPriorities[0]
  if (!current) return null

  function move(direction: -1 | 1) {
    setIndex((value) => (value + direction + landingPriorities.length) % landingPriorities.length)
  }

  return (
    <section aria-labelledby="priority-heading" className={styles.priorities}>
      <div className={ui.container}>
        <div className={styles.prioritiesHead}>
          <SectionLabel>What each seat needs first</SectionLabel>
          <p className={`${styles.count} ${ui.mono}`}>
            {pad(index + 1)} / {pad(landingPriorities.length)}
          </p>
        </div>
        <h2 className={styles.srOnly} id="priority-heading">
          What operating teams need first
        </h2>
        <figure aria-live="polite" className={styles.quote} key={current.role}>
          <blockquote>&ldquo;{current.quote}&rdquo;</blockquote>
          <figcaption>
            <strong>{current.role}</strong>
            <span>{current.context}</span>
          </figcaption>
        </figure>
        <div className={styles.quoteControls}>
          <button
            aria-label="Previous team priority"
            className={ui.roundButton}
            onClick={() => move(-1)}
            type="button"
          >
            <span aria-hidden="true">←</span>
          </button>
          <button
            aria-label="Next team priority"
            className={ui.roundButton}
            onClick={() => move(1)}
            type="button"
          >
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </section>
  )
}

function Faq() {
  return (
    <section aria-labelledby="questions-heading" className={styles.faq} id="questions">
      <div className={`${ui.container} ${styles.faqGrid}`}>
        <div>
          <SectionLabel>Questions</SectionLabel>
          <h2 className={ui.h2} id="questions-heading">
            Questions teams ask first.
          </h2>
          <p className={ui.lead}>
            Direct answers. No implementation theater, hidden autonomy, or compliance claims
            without review.
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
  )
}

export function AbiOpsLanding() {
  return (
    <main className={ui.page}>
      <a className={styles.skipLink} href="#main-content">
        Skip to main content
      </a>
      <SiteNav />
      <div id="main-content">
        <Hero />
        <Services />
        <PortfolioSkyline />
        <ProcessSection />
        <CortexSection />
        <Priorities />
        <Faq />
      </div>
      <LandingFooter />
    </main>
  )
}
