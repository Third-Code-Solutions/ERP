import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const directory = dirname(fileURLToPath(import.meta.url))
const landingSource = readFileSync(
  resolve(directory, 'third-code-landing.tsx'),
  'utf8'
)
const landingStyles = readFileSync(
  resolve(directory, 'third-code-landing.module.css'),
  'utf8'
)
const landingContent = readFileSync(
  resolve(directory, 'third-code-content.ts'),
  'utf8'
)

describe('Third Code ERP public landing contract', () => {
  it('keeps wide, readable hero math and exactly two primary hero actions', () => {
    expect(landingStyles).toContain('max-width: 72rem')
    expect(landingStyles).toContain('font-size: clamp(3rem, 5vw, 5.5rem)')
    expect(
      landingSource.match(/className=\{styles\.heroLine\}/g)
    ).toHaveLength(3)
    expect(landingSource).toContain('Start guided setup')
    expect(landingSource).toContain('Open workspace')
    expect(landingSource).toContain('priority')
    expect(landingSource).not.toMatch(/SECTION\s+0?\d|QUESTION\s+0?\d/)
  })

  it('keeps the dense bento and responsive overflow safeguards', () => {
    expect(landingStyles).toContain('grid-template-columns: repeat(12')
    expect(landingStyles).toContain('grid-template-rows: repeat(2')
    expect(landingStyles).toContain('grid-auto-flow: dense')
    expect(landingStyles).toContain('overflow-x: hidden')
    expect(landingStyles).toContain('@media (max-width: 700px)')
    expect(landingStyles).toContain('.inlineImage {')
    expect(landingStyles).toContain('display: none')
  })

  it('keeps reviewable interaction and answerable SEO content', () => {
    expect(landingSource).toContain('aria-expanded={isActive}')
    expect(landingSource).toContain('aria-live="polite"')
    expect(landingSource).toContain('<details')
    expect(landingSource).toContain('aria-label="Previous team priority"')
    expect(landingSource).toContain('aria-label="Next team priority"')
    expect(landingSource).toContain('disabled={priorityIndex === 0}')
    expect(landingSource).toContain(
      'disabled={priorityIndex === teamPriorities.length - 1}'
    )
    expect((landingContent.match(/question:/g) ?? [])).toHaveLength(5)
    expect(landingSource).toContain('permission-aware')
    expect(landingSource).toContain('Human-approved actions')
    expect(landingContent).toContain('human approval')
  })

  it('keeps Cortex preview read-only and source-oriented', () => {
    expect(landingSource).toContain('aria-label="Cortex query preview"')
    expect(landingSource).toContain('aria-pressed={activeCortexQuery === query.id}')
    expect(landingSource).toContain('Read-only')
    expect(landingSource).toContain('currentCortexQuery.sources.map')
    expect(landingStyles).toContain('.cortexDemo {')
    expect(landingStyles).toContain('.cortexQuery[aria-pressed=\'true\']')
  })
})
