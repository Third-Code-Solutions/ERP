import React from 'react'
import { createRoot } from 'react-dom/client'
import { CortexIndexButton } from '../../src/components/cortex/cortex-index-button'
import '../../src/app/globals.css'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Component gallery root is missing')

const enabled = new URLSearchParams(window.location.search).get('enabled') === 'true'

createRoot(rootElement).render(
  <React.StrictMode>
    <main
      data-testid="local-cortex-index-gallery"
      style={{
        minHeight: '100vh',
        padding: 'clamp(16px, 4vw, 48px)',
        background: 'var(--color-neutral-50)',
      }}
    >
      <section className="cortex-page" aria-label="Cortex indexing control proof">
        <header className="cortex-page__head">
          <div>
            <h1 className="cortex-page__title">Cortex</h1>
            <p className="cortex-page__sub">
              Local browser proof. No tenant, Supabase, or provider is connected.
            </p>
          </div>
          <CortexIndexButton enabled={enabled} />
        </header>
      </section>
    </main>
  </React.StrictMode>
)
