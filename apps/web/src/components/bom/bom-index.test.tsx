import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BomIndex, currentBomVersions, type BomIndexRow } from './bom-index'

const row: BomIndexRow = {
  id: 'one',
  version: 1,
  label: 'Estimate',
  status: 'draft',
  tcv_cents: 123456,
  total_cost_cents: 100000,
  gp_margin_bps: 1900,
  project_id: 'project-one',
  project_name: 'Example project',
}
describe('BOM workspace', () => {
  it('selects highest non-archived version once per project', () => {
    expect(
      currentBomVersions([
        row,
        { ...row, id: 'two', version: 2 },
        { ...row, id: 'three', version: 3, status: 'archived' },
      ]).map((item) => item.id),
    ).toEqual(['two'])
  })
  it('never produces a null project route', () => {
    const html = renderToStaticMarkup(
      <BomIndex rows={[{ ...row, project_id: null }]} />,
    )
    expect(html).not.toContain('/projects/null')
    expect(html).toContain('0 projects with a current BOM')
  })
  it('shows exact row money without duplicated version pipeline totals', () => {
    const html = renderToStaticMarkup(<BomIndex rows={[row]} />)
    expect(html).toContain('₱1,234.56')
    expect(html).toContain('Open current BOM')
    expect(html).not.toContain('Pipeline TCV')
    expect(html).not.toContain('RAG-priced')
  })
})
