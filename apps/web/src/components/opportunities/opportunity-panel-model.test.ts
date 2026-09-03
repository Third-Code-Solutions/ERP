import { describe, expect, it, vi } from 'vitest'

import { createStageTransitionSubmitter } from '@/components/pipeline/stage-transition-action'

import {
  buildOpportunityCreateFormData,
  buildOpportunityTransitionFormData,
  classifyOpportunityPanelDestination,
  createOpportunityPanelActionSubmitter,
  getOpportunityPanelDestinations,
} from './opportunity-panel-model'

describe('OpportunityPanel canonical stage projection', () => {
  it('projects legacy edges through canonical identity without duplicate moves', () => {
    expect(getOpportunityPanelDestinations('opportunity_creation')).toEqual([
      'scoping',
      'closed_lost',
    ])
    expect(getOpportunityPanelDestinations('resubmission')).toEqual([
      'bom_submission',
      'closed_lost',
    ])
    expect(getOpportunityPanelDestinations('negotiation')).toEqual([
      'contract',
      'bom_submission',
      'lost',
    ])
    expect(getOpportunityPanelDestinations('unrecognized')).toEqual([])
  })

  it('routes Lost and real regression edges to distinct required-reason flows', () => {
    expect(
      classifyOpportunityPanelDestination('negotiation', 'lost')
    ).toBe('lost')
    expect(
      classifyOpportunityPanelDestination('negotiation', 'bom_submission')
    ).toBe('regression')
    expect(
      classifyOpportunityPanelDestination('resubmission', 'bom_submission')
    ).toBe('regression')
    expect(
      classifyOpportunityPanelDestination('negotiation', 'contract')
    ).toBe('submit')
  })

  it('rejects destinations that are not projected shared edges', () => {
    expect(
      classifyOpportunityPanelDestination('lead', 'won')
    ).toBeNull()
    expect(
      classifyOpportunityPanelDestination('not-a-stage', 'lost')
    ).toBeNull()
    expect(
      classifyOpportunityPanelDestination('lead', 'not-a-stage')
    ).toBeNull()
  })
})

describe('OpportunityPanel form contracts', () => {
  it('builds the exact atomic stage command and preserves signed GP', () => {
    const controls = new FormData()
    controls.set('tcv_cents', '1500000')
    controls.set('gp_cents', '-25000')
    controls.set('closing_date', '2026-10-15')
    controls.set('ignored', 'not forwarded')

    const command = buildOpportunityTransitionFormData(controls, {
      projectId: '22222222-2222-4222-8222-222222222222',
      opportunityId: '11111111-1111-4111-8111-111111111111',
      destination: 'lost',
      reason: '  Client selected another contractor.  ',
    })

    expect(Object.fromEntries(command.entries())).toEqual({
      project_id: '22222222-2222-4222-8222-222222222222',
      opportunity_id: '11111111-1111-4111-8111-111111111111',
      new_stage: 'lost',
      tcv_cents: '1500000',
      gp_cents: '-25000',
      closing_date: '2026-10-15',
      reason: 'Client selected another contractor.',
    })
  })

  it('omits blank optional transition values', () => {
    const controls = new FormData()
    controls.set('tcv_cents', '')
    controls.set('gp_cents', '   ')
    controls.set('closing_date', '')

    const command = buildOpportunityTransitionFormData(controls, {
      projectId: 'project-id',
      opportunityId: 'opportunity-id',
      destination: 'contract',
    })

    expect(Object.fromEntries(command.entries())).toEqual({
      project_id: 'project-id',
      opportunity_id: 'opportunity-id',
      new_stage: 'contract',
    })
  })

  it('forces creation stage and preserves exact bounded centavo strings', () => {
    const controls = new FormData()
    controls.set('stage', 'negotiation')
    controls.set('closing_date', '2026-10-15')
    controls.set('tcv_cents', '9007199254740991')
    controls.set('gp_cents', '-9007199254740991')

    const command = buildOpportunityCreateFormData(controls, 'project-id')

    expect(command.get('project_id')).toBe('project-id')
    expect(command.get('stage')).toBe('opportunity_creation')
    expect(command.get('closing_date')).toBe('2026-10-15T00:00:00+08:00')
    expect(command.get('tcv_cents')).toBe('9007199254740991')
    expect(command.get('gp_cents')).toBe('-9007199254740991')
  })

  it.each(['1.00', '1e3', '01', '-1', '9007199254740992'])(
    'rejects non-canonical TCV %s before create submission',
    (value) => {
      const controls = new FormData()
      controls.set('tcv_cents', value)

      expect(() =>
        buildOpportunityCreateFormData(controls, 'project-id')
      ).toThrow('TCV must be a canonical non-negative centavo amount.')
    }
  )

  it.each(['1.00', '1e3', '01', '-0', '9007199254740992', '-9007199254740992'])(
    'rejects non-canonical GP %s before transition submission',
    (value) => {
      const controls = new FormData()
      controls.set('gp_cents', value)

      expect(() =>
        buildOpportunityTransitionFormData(controls, {
          projectId: 'project-id',
          opportunityId: 'opportunity-id',
          destination: 'contract',
        })
      ).toThrow('GP must be a canonical signed centavo amount.')
    }
  )

  it('preserves exact bounded transition cents without number coercion', () => {
    const controls = new FormData()
    controls.set('tcv_cents', '9007199254740991')
    controls.set('gp_cents', '-9007199254740991')

    const command = buildOpportunityTransitionFormData(controls, {
      projectId: 'project-id',
      opportunityId: 'opportunity-id',
      destination: 'contract',
    })

    expect(command.get('tcv_cents')).toBe('9007199254740991')
    expect(command.get('gp_cents')).toBe('-9007199254740991')
  })
})

describe('OpportunityPanel create submission', () => {
  const callbacks = () => ({
    onStart: vi.fn(),
    onError: vi.fn(),
    onSuccess: vi.fn(),
  })

  it('surfaces returned and rejected failures without false success', async () => {
    const returned = callbacks()
    const rejected = callbacks()
    const submitter = createOpportunityPanelActionSubmitter(
      'Opportunity creation could not be completed. Please try again.'
    )

    await submitter.submit(
      () => Promise.resolve({ error: 'Forbidden' }),
      returned
    )
    await submitter.submit(
      () => Promise.reject(new Error('provider detail')),
      rejected
    )

    expect(returned.onError).toHaveBeenCalledWith('Forbidden')
    expect(returned.onSuccess).not.toHaveBeenCalled()
    expect(rejected.onError).toHaveBeenCalledWith(
      'Opportunity creation could not be completed. Please try again.'
    )
    expect(rejected.onSuccess).not.toHaveBeenCalled()
  })

  it('clears stale error on retry and closes only after success', async () => {
    let error: string | null = 'Previous failure'
    let closeCount = 0
    const handlers = {
      onStart: () => {
        error = null
      },
      onError: (message: string) => {
        error = message
      },
      onSuccess: () => {
        closeCount += 1
      },
    }
    const submitter = createOpportunityPanelActionSubmitter('Unexpected')

    await submitter.submit(
      () => Promise.resolve({ error: 'Create failed.' }),
      handlers
    )
    expect(error).toBe('Create failed.')
    expect(closeCount).toBe(0)

    await submitter.submit(() => Promise.resolve({}), handlers)
    expect(error).toBeNull()
    expect(closeCount).toBe(1)
  })

  it('allows exactly one action while pending', async () => {
    let resolveFirst: ((result: {}) => void) | undefined
    const first = new Promise<{}>((resolve) => {
      resolveFirst = resolve
    })
    const action = vi.fn(() => first)
    const handlers = callbacks()
    const submitter = createOpportunityPanelActionSubmitter('Unexpected')

    const pending = submitter.submit(action, handlers)
    await expect(submitter.submit(action, handlers)).resolves.toBe(false)

    expect(action).toHaveBeenCalledOnce()
    resolveFirst?.({})
    await expect(pending).resolves.toBe(true)
    expect(handlers.onSuccess).toHaveBeenCalledOnce()
  })
})

describe('OpportunityPanel transition submission', () => {
  it('keeps the transition recoverable on returned and rejected failures', async () => {
    let transitionOpen = true
    let visibleError: string | null = null
    const callbacks = {
      onStart: () => {
        visibleError = null
      },
      onError: (message: string) => {
        visibleError = message
      },
      onSuccess: () => {
        transitionOpen = false
      },
    }
    const submitter = createStageTransitionSubmitter()

    await submitter.submit(
      { execute: () => Promise.resolve({ error: 'Atomic transition failed.' }) },
      callbacks
    )
    expect(visibleError).toBe('Atomic transition failed.')
    expect(transitionOpen).toBe(true)

    await submitter.submit(
      { execute: () => Promise.reject(new Error('provider detail')) },
      callbacks
    )
    expect(visibleError).toBe(
      'Opportunity stage transition could not be completed. Please try again.'
    )
    expect(transitionOpen).toBe(true)
  })

  it('requires and trims Lost or regression reason before one exact command', async () => {
    const action = vi.fn((_command: FormData) => Promise.resolve({}))
    const controls = new FormData()
    controls.set('gp_cents', '-25000')
    const submitter = createStageTransitionSubmitter()
    const callbacks = {
      onStart: vi.fn(),
      onError: vi.fn(),
      onSuccess: vi.fn(),
    }
    const execute = (reason?: string) => {
      const command = buildOpportunityTransitionFormData(controls, {
        projectId: 'project-id',
        opportunityId: 'opportunity-id',
        destination: 'lost',
        reason,
      })
      return action(command)
    }

    await expect(
      submitter.submit(
        { execute, reason: '   ', reasonRequired: true },
        callbacks
      )
    ).resolves.toBe(false)
    await expect(
      submitter.submit(
        { execute, reason: 'x'.repeat(1001), reasonRequired: true },
        callbacks
      )
    ).resolves.toBe(false)
    expect(action).not.toHaveBeenCalled()

    await expect(
      submitter.submit(
        {
          execute,
          reason: '  Client selected another contractor.  ',
          reasonRequired: true,
        },
        callbacks
      )
    ).resolves.toBe(true)

    expect(action).toHaveBeenCalledOnce()
    const submitted = action.mock.calls[0]?.[0]
    expect(submitted?.get('reason')).toBe(
      'Client selected another contractor.'
    )
    expect(submitted?.get('gp_cents')).toBe('-25000')
    expect(callbacks.onSuccess).toHaveBeenCalledOnce()
  })

  it('clears stale failure on retry and closes only after actual success', async () => {
    let transitionOpen = true
    let visibleError: string | null = 'Previous failure'
    const callbacks = {
      onStart: () => {
        visibleError = null
      },
      onError: (message: string) => {
        visibleError = message
      },
      onSuccess: () => {
        transitionOpen = false
      },
    }
    const submitter = createStageTransitionSubmitter()

    await submitter.submit(
      { execute: () => Promise.resolve({ error: 'Try again.' }) },
      callbacks
    )
    expect(visibleError).toBe('Try again.')
    expect(transitionOpen).toBe(true)

    await submitter.submit(
      { execute: () => Promise.resolve({}) },
      callbacks
    )
    expect(visibleError).toBeNull()
    expect(transitionOpen).toBe(false)
  })

  it('blocks a second panel transition while the first is pending', async () => {
    let resolveFirst: ((result: {}) => void) | undefined
    const first = new Promise<{}>((resolve) => {
      resolveFirst = resolve
    })
    const action = vi.fn(() => first)
    const submitter = createStageTransitionSubmitter()
    const callbacks = {
      onStart: vi.fn(),
      onError: vi.fn(),
      onSuccess: vi.fn(),
    }

    const pending = submitter.submit({ execute: action }, callbacks)
    await expect(
      submitter.submit({ execute: action }, callbacks)
    ).resolves.toBe(false)
    expect(action).toHaveBeenCalledOnce()

    resolveFirst?.({})
    await expect(pending).resolves.toBe(true)
  })
})
