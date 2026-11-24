import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/(dashboard)/crm/opportunities/[id]/actions', () => ({
  updateOpportunity: vi.fn(),
}))

import { OpportunityEditForm } from './opportunity-edit-form'

const OPPORTUNITY_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '22222222-2222-4222-8222-222222222222'

const values = {
  tcv: '10000.00',
  gp: '2000.00',
  closingDate: '2026-12-01',
  areaSqm: '120',
  opportunityType: 'fit_out',
  remarks: 'Initial remarks',
  repId: '33333333-3333-4333-8333-333333333333',
}

const typeOptions = [
  { value: 'mep', label: 'MEP' },
  { value: 'fit_out', label: 'Fit-out' },
]

describe('OpportunityEditForm', () => {
  it('prefills every editable field behind a labelled control and never submits a stage or probability', () => {
    const markup = renderToStaticMarkup(
      <OpportunityEditForm
        opportunityId={OPPORTUNITY_ID}
        values={values}
        typeOptions={typeOptions}
        reps={[{ id: values.repId, name: 'Marlon Reyes' }]}
        linkableProjects={null}
      />
    )

    expect(markup).toContain(`name="opportunity_id" value="${OPPORTUNITY_ID}"`)
    for (const name of ['tcv', 'gp', 'closing_date', 'area_sqm', 'opportunity_type', 'rep_id', 'remarks']) {
      expect(markup).toContain(`name="${name}"`)
    }
    expect(markup).not.toContain('name="stage"')
    expect(markup).not.toContain('name="probability"')
    expect(markup).not.toContain('name="project_id"')
    expect(markup).toContain('for="opportunity-edit-tcv"')
    expect(markup).toContain('value="10000.00"')
    expect(markup).toContain('Marlon Reyes')
    expect(markup).toContain('Save changes')
  })

  it('offers a one-time project link only when projects can still be linked', () => {
    const markup = renderToStaticMarkup(
      <OpportunityEditForm
        opportunityId={OPPORTUNITY_ID}
        values={values}
        typeOptions={typeOptions}
        reps={[]}
        linkableProjects={[{ id: PROJECT_ID, name: 'Ayala Fit-out' }]}
      />
    )

    expect(markup).toContain('name="project_id"')
    expect(markup).toContain('Ayala Fit-out')
    expect(markup).toContain('Once linked, the project cannot be changed.')
  })
})
