import {
  safeNonNegativeCentavosStringSchema,
  safeSignedCentavosStringSchema,
  STAGE_LEGACY_MAP,
  STAGE_TRANSITIONS,
  type OpportunityStage,
} from '@third-code-erp/shared-types'

import { getStageTransitionReasonKind } from '@/components/pipeline/stage-transition-action'

export type OpportunityPanelDestinationKind =
  | 'submit'
  | 'lost'
  | 'regression'

interface TransitionFormDataOptions {
  projectId: string
  opportunityId: string
  destination: OpportunityStage
  reason?: string
}

interface ActionResult {
  error?: string
}

interface ActionCallbacks {
  onStart: () => void
  onError: (message: string) => void
  onSuccess: () => void
}

interface OpportunityPanelActionSubmitter {
  submit: (
    execute: () => Promise<ActionResult | void>,
    callbacks: ActionCallbacks
  ) => Promise<boolean>
}

const CREATE_FIELDS = [
  'opportunity_type',
  'area_sqm',
  'closing_date',
] as const

export function isOpportunityStage(value: string): value is OpportunityStage {
  return value in STAGE_TRANSITIONS
}

function copyNonBlankString(
  source: FormData,
  destination: FormData,
  name: string
): void {
  const value = source.get(name)
  if (typeof value === 'string' && value.trim().length > 0) {
    destination.set(name, value.trim())
  }
}

function copyCanonicalCentavosString(
  source: FormData,
  destination: FormData,
  name: 'tcv_cents' | 'gp_cents'
): void {
  const value = source.get(name)
  if (value === null || (typeof value === 'string' && value.trim() === '')) {
    return
  }
  if (typeof value !== 'string') {
    throw new Error(`${name === 'tcv_cents' ? 'TCV' : 'GP'} must be text.`)
  }

  const hasCanonicalSyntax =
    name === 'tcv_cents'
      ? /^(0|[1-9]\d*)$/.test(value)
      : /^(0|-?[1-9]\d*)$/.test(value)
  const result = hasCanonicalSyntax
    ? name === 'tcv_cents'
      ? safeNonNegativeCentavosStringSchema.safeParse(value)
      : safeSignedCentavosStringSchema.safeParse(value)
    : { success: false as const }
  if (!result.success) {
    throw new Error(
      name === 'tcv_cents'
        ? 'TCV must be a canonical non-negative centavo amount.'
        : 'GP must be a canonical signed centavo amount.'
    )
  }
  destination.set(name, value)
}

export function getOpportunityPanelDestinations(
  stage: string
): OpportunityStage[] {
  if (!isOpportunityStage(stage)) return []

  const currentCanonicalStage = STAGE_LEGACY_MAP[stage]
  const seenCanonicalStages = new Set<OpportunityStage>([currentCanonicalStage])

  return STAGE_TRANSITIONS[stage].filter((destination) => {
    const canonicalDestination = STAGE_LEGACY_MAP[destination]
    if (seenCanonicalStages.has(canonicalDestination)) return false
    seenCanonicalStages.add(canonicalDestination)
    return true
  })
}

export function classifyOpportunityPanelDestination(
  source: string,
  destination: string
): OpportunityPanelDestinationKind | null {
  if (!isOpportunityStage(source) || !isOpportunityStage(destination)) {
    return null
  }
  if (!getOpportunityPanelDestinations(source).includes(destination)) {
    return null
  }

  return (
    getStageTransitionReasonKind(STAGE_LEGACY_MAP[source], destination) ??
    'submit'
  )
}

export function buildOpportunityTransitionFormData(
  controls: FormData,
  options: TransitionFormDataOptions
): FormData {
  const command = new FormData()
  command.set('project_id', options.projectId)
  command.set('opportunity_id', options.opportunityId)
  command.set('new_stage', options.destination)

  copyCanonicalCentavosString(controls, command, 'tcv_cents')
  copyCanonicalCentavosString(controls, command, 'gp_cents')
  copyNonBlankString(controls, command, 'closing_date')

  const reason = options.reason?.trim()
  if (reason) command.set('reason', reason)
  return command
}

export function buildOpportunityCreateFormData(
  controls: FormData,
  projectId: string
): FormData {
  const command = new FormData()
  command.set('project_id', projectId)
  command.set('stage', 'opportunity_creation')
  for (const field of CREATE_FIELDS) copyNonBlankString(controls, command, field)
  copyCanonicalCentavosString(controls, command, 'tcv_cents')
  copyCanonicalCentavosString(controls, command, 'gp_cents')

  const closingDate = command.get('closing_date')
  if (
    typeof closingDate === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(closingDate)
  ) {
    command.set('closing_date', `${closingDate}T00:00:00+08:00`)
  }
  return command
}

export function createOpportunityPanelActionSubmitter(
  unexpectedErrorMessage: string
): OpportunityPanelActionSubmitter {
  let isPending = false

  return {
    async submit(execute, callbacks) {
      if (isPending) return false

      isPending = true
      callbacks.onStart()
      try {
        const result = await execute()
        if (result?.error) {
          callbacks.onError(result.error)
        } else {
          callbacks.onSuccess()
        }
      } catch {
        callbacks.onError(unexpectedErrorMessage)
      } finally {
        isPending = false
      }
      return true
    },
  }
}
