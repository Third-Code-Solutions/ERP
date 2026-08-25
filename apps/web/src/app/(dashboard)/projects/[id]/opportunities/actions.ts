'use server'

import { requireUserProfile } from '@third-code-erp/auth'

const SALES_PIPELINE_REQUIRED =
  'Create and advance opportunities from the Sales Pipeline board.'

// Project pages represent post-award delivery work. Keeping the former local
// mutations disabled prevents a project-linked form from bypassing the Sales
// lead, KYC, transition, conversion, and audit boundaries.
export async function createOpportunity(_formData: FormData): Promise<{ error: string }> {
  await requireUserProfile()
  return { error: SALES_PIPELINE_REQUIRED }
}

export async function transitionStage(_formData: FormData): Promise<{ error: string }> {
  await requireUserProfile()
  return { error: SALES_PIPELINE_REQUIRED }
}
