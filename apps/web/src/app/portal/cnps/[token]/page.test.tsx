import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { readSurvey } = vi.hoisted(() => ({ readSurvey: vi.fn() }))
vi.mock('@third-code-erp/database', () => ({
  db: { select: () => ({ from: () => {
    const query = { innerJoin: () => query, where: () => query, limit: readSurvey }
    return query
  } }) },
}))
vi.mock('./actions', () => ({ submitCnpsRating: vi.fn() }))
import CnpsPortalPage from './page'
import PortalLayout from '../../layout'

describe('CNPS portal truth and company identity', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React)
    readSurvey.mockResolvedValue([{
      survey_id: 'survey', tenant_id: 'tenant', ticket_id: 'ticket',
      responded_at: null, score: null, ticket_number: 'WT-123',
      legal_name: 'Independent Builder Ltd.', workspace_name: 'Builder workspace',
    }])
  })
  afterEach(() => vi.unstubAllGlobals())

  it('does not treat the caller-controlled success flag as a saved response', async () => {
    const page = await CnpsPortalPage({ params: Promise.resolve({ token: 'link' }), searchParams: Promise.resolve({ ok: '1' }) })
    const markup = renderToStaticMarkup(page)
    expect(markup).toContain('Submit rating')
    expect(markup).not.toContain('has been recorded')
    expect(markup).toContain('Independent Builder Ltd.')
    expect(markup).not.toContain('Actuate Builders Inc.')
  })

  it('shows saved responses and rejects absent links', async () => {
    readSurvey.mockResolvedValueOnce([{ responded_at: new Date(), ticket_number: 'WT-123' }])
    expect(renderToStaticMarkup(await CnpsPortalPage({ params: Promise.resolve({ token: 'link' }), searchParams: Promise.resolve({}) }))).toContain('has been recorded')
    readSurvey.mockResolvedValueOnce([])
    expect(renderToStaticMarkup(await CnpsPortalPage({ params: Promise.resolve({ token: 'link' }), searchParams: Promise.resolve({ ok: '1' }) }))).toContain('Link not recognised')
  })

  it('uses workspace name when legal identity is absent', async () => {
    readSurvey.mockResolvedValueOnce([{ responded_at: null, ticket_number: 'WT-123', legal_name: null, workspace_name: 'Independent workspace' }])
    expect(renderToStaticMarkup(await CnpsPortalPage({ params: Promise.resolve({ token: 'link' }), searchParams: Promise.resolve({}) }))).toContain('Independent workspace')
  })

  it('keeps the shared shell product-branded without naming a seller', () => {
    const markup = renderToStaticMarkup(<PortalLayout>Survey</PortalLayout>)
    expect(markup).toContain('ABI OPS')
    expect(markup).toContain('your project team')
    expect(markup).not.toContain('Actuate Builders Inc.')
  })
})
