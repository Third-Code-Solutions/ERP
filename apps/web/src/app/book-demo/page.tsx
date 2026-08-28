import type { Metadata } from 'next'
import Link from 'next/link'
import { DemoRequestForm } from './demo-request-form'
import styles from './book-demo.module.css'

export const metadata: Metadata = {
  title: 'Book a demo',
  description:
    'See how ABI OPS connects construction pipeline, project delivery, cost, and evidence.',
}

export default function BookDemoPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="ABI OPS home">
          <span className={styles.brandMark}>A</span>
          <span>
            <strong>ABI OPS</strong>
            <small>Actuate Builders</small>
          </span>
        </Link>
        <Link className={styles.workspaceLink} href="/auth/login">
          Open workspace
        </Link>
      </header>

      <section className={styles.hero} aria-labelledby="book-demo-title">
        <div>
          <p className={styles.eyebrow}>A working conversation, not a sales script</p>
          <h1 id="book-demo-title">See your operation in one connected record.</h1>
          <p className={styles.lead}>
            Tell us how your company sells, delivers, buys, bills, and hands over work.
            We&apos;ll tailor a walkthrough around the gaps that cost your team time and certainty.
          </p>
          <ul className={styles.points}>
            <li>Pipeline to turnover, connected by the same project record</li>
            <li>Cost, approvals, documents, and field evidence in context</li>
            <li>Built for construction and project-driven teams in the Philippines</li>
          </ul>
        </div>
        <aside className={styles.panel} aria-labelledby="request-title">
          <div className={styles.panelHeading}>
            <p className={styles.eyebrow}>Request a walkthrough</p>
            <h2 id="request-title">Book your demo</h2>
            <p>We usually respond within one business day.</p>
          </div>
          <DemoRequestForm />
        </aside>
      </section>
    </main>
  )
}
