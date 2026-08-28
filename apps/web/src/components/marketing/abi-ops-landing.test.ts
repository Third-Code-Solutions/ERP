import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const directory = dirname(fileURLToPath(import.meta.url))
const landingSource = readFileSync(
  resolve(directory, 'abi-ops-landing.tsx'),
  'utf8'
)
const landingStyles = readFileSync(
  resolve(directory, 'abi-ops-landing.module.css'),
  'utf8'
)
const landingContent = readFileSync(
  resolve(directory, 'abi-ops-content.ts'),
  'utf8'
)

describe('ABI OPS public landing contract', () => {
  it('keeps the ABI OPS identity and clear hero actions', () => {
    expect(landingSource).toContain('ABI OPS home')
    expect(landingSource).toContain('ABI OPS connects pipeline')
    expect(landingSource).toContain('src="/images/abi-ops-hero.png"')
    expect(landingSource).toContain('Book a demo')
    expect(landingSource).toContain('Open workspace')
  })

  it('keeps readable hero sizing and responsive layout safeguards', () => {
    expect(landingStyles).toContain('max-width: 980px')
    expect(landingStyles).toContain('font-size: clamp(3.5rem, 6.1vw, 6.25rem)')
    expect(landingStyles).toContain('grid-template-columns: minmax(0, 1.35fr)')
    expect(landingStyles).toContain('grid-template-rows: minmax(270px, 0.95fr)')
    expect(landingStyles).toContain('@media (max-width: 700px)')
    expect(landingStyles).toContain('.hero h1 {')
    expect(landingStyles).toContain('.proofItems {')
    expect(landingStyles).toContain('overflow: clip')
    expect(landingStyles).toContain('display: none')
  })

  it('keeps accessible reviewable interactions and answerable content', () => {
    expect(landingSource).toContain('aria-expanded={isActive}')
    expect(landingSource).toContain('aria-live="polite"')
    expect(landingSource).toContain('<details')
    expect(landingSource).toContain('aria-label="Previous team priority"')
    expect(landingSource).toContain('aria-label="Next team priority"')
    expect(landingSource).toContain('role="list"')
    expect((landingContent.match(/question:/g) ?? [])).toHaveLength(5)
    expect(landingSource).toContain('permission-aware')
    expect(landingSource).toContain('Human-approved actions')
    expect(landingContent).toContain('human approval')
  })

  it('keeps Cortex source-oriented and human-approved', () => {
    expect(landingSource).toContain('id="cortex"')
    expect(landingSource).toContain('Permissioned company intelligence')
    expect(landingSource).toContain('Source citations')
    expect(landingSource).toContain('Human-approved actions')
    expect(landingSource).toContain('Provenance and freshness')
    expect(landingStyles).toContain('.featureGrid {')
    expect(landingStyles).toContain('.featureCardPrimary {')
  })
})
