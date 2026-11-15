'use client'

import Link from 'next/link'
import { track } from '@vercel/analytics'

import { BuildingArt, StrokeStage, artClasses, useArtOnView } from './abi-ops-art'
import { AbiLogo } from './abi-ops-logo'
import ui from './abi-ops-ui.module.css'
import styles from './abi-ops-footer.module.css'

export function LandingFooter() {
  const { ref: skylineRef, art } = useArtOnView<HTMLDivElement>()

  return (
    <footer className={styles.footer}>
      <div className={ui.container}>
        <section aria-labelledby="cta-heading" className={styles.cta}>
          <p className={styles.eyebrow}>
            <span aria-hidden="true">(</span> Start guided setup{' '}
            <span aria-hidden="true">)</span>
          </p>
          <h2 className={styles.ctaTitle} id="cta-heading">
            One operating record. Every project under control.
          </h2>
          <p className={styles.ctaLead}>
            Build an operating system your team can understand on day one.
          </p>
          <div className={styles.ctaActions}>
            <Link
              className={`${ui.button} ${ui.buttonLight}`}
              data-analytics="footer-guided-setup"
              href="/auth/signup"
              onClick={() => track('Guided Setup CTA', { placement: 'closing' })}
            >
              Start guided setup
              <span aria-hidden="true">↗</span>
            </Link>
            <Link
              className={styles.ctaLink}
              href="/auth/login"
              onClick={() => track('Workspace CTA', { placement: 'closing' })}
            >
              Open workspace
            </Link>
          </div>
        </section>

        <div className={styles.columns}>
          <div className={styles.brandBlock}>
            <Link aria-label="ABI OPS home" className={styles.brand} href="/">
              <AbiLogo />
              <span>
                <strong>ABI OPS</strong>
                <small>Actuate Builders Inc.</small>
              </span>
            </Link>
            <p>AI-native operations software for construction and complex project teams.</p>
          </div>
          <nav aria-label="Platform" className={styles.group}>
            <p className={styles.groupTitle}>Platform</p>
            <a href="#platform">Overview</a>
            <a href="#cortex">Cortex</a>
            <a href="#workflows">Workflows</a>
          </nav>
          <nav aria-label="Access" className={styles.group}>
            <p className={styles.groupTitle}>Access</p>
            <Link href="/auth/login">Open workspace</Link>
            <Link href="/auth/signup">Start guided setup</Link>
          </nav>
          <nav aria-label="Trust" className={styles.group}>
            <p className={styles.groupTitle}>Trust</p>
            <a href="#trust">Security</a>
            <a href="#trust">Compliance</a>
            <a href="#questions">Questions</a>
          </nav>
        </div>
      </div>

      <div className={styles.skyline} ref={skylineRef}>
        {art ? (
          <StrokeStage isInstant viewBox={art.ART_VIEWBOX}>
            {(hatchId) => (
              <>
                <path
                  className={artClasses.ground}
                  d={art.ART_GROUND.d}
                  pathLength={1}
                />
                {art.artBuildings.map((building) => (
                  <g
                    key={building.tx}
                    transform={`translate(${building.tx} ${building.ty})`}
                  >
                    <BuildingArt building={building} hatchId={hatchId} />
                  </g>
                ))}
              </>
            )}
          </StrokeStage>
        ) : null}
      </div>

      <div className={ui.container}>
        <div className={styles.bottom}>
          <p>
            <span>&copy; 2026 Actuate Builders Inc.</span>{' '}
            <span>ABI OPS, built for work that compounds.</span>
          </p>
          <a className={styles.top} href="#main-content">
            Back to top <span aria-hidden="true">↑</span>
          </a>
        </div>
      </div>
    </footer>
  )
}
