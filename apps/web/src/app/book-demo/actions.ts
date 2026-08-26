'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@third-code-erp/database'
import { platformDemoRequests } from '@third-code-erp/database/schema'
import { ORGANIZATION_TYPES } from '@third-code-erp/shared-types'
import { logPlatformAction } from '@/lib/owner-admin'
import { writePlatformAuditLogInTransaction } from '@/lib/platform-audit'

type DemoRequestActionState = {
  message: string
  status: 'error' | 'idle' | 'success'
}

const demoRequestSchema = z.object({
  contactName: z.string().trim().min(2).max(255),
  workEmail: z.string().trim().email().max(255),
  phone: z.string().trim().max(64).optional(),
  jobTitle: z.string().trim().max(120).optional(),
  companyName: z.string().trim().min(2).max(255),
  organizationType: z.enum(ORGANIZATION_TYPES),
  companySize: z.string().trim().max(64).optional(),
  teamSize: z.coerce.number().int().min(1).max(100_000).optional(),
  useCase: z.string().trim().min(10).max(5_000),
  preferredDemoWindow: z.string().trim().max(255).optional(),
  privacyConsent: z.literal('on'),
})

function optionalValue(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function firstValidationMessage(error: z.ZodError): string {
  const issue = error.issues[0]
  return issue?.message ?? 'Please review the form and try again.'
}

export async function submitDemoRequest(
  _previousState: DemoRequestActionState,
  formData: FormData
): Promise<DemoRequestActionState> {
  const traceId = randomUUID()
  const trap = optionalValue(formData.get('website'))
  if (trap) {
    logPlatformAction({
      traceId,
      actorId: null,
      action: 'platform.demo_request.submit',
      outcome: 'rejected',
    })
    // Match the normal acknowledgement so automated submissions receive no
    // signal about the anti-spam control.
    return {
      status: 'success',
      message: 'Thanks — we received your request and will be in touch shortly.',
    }
  }

  const parsed = demoRequestSchema.safeParse({
    contactName: formData.get('contactName'),
    workEmail: optionalValue(formData.get('workEmail'))?.toLowerCase(),
    phone: optionalValue(formData.get('phone')),
    jobTitle: optionalValue(formData.get('jobTitle')),
    companyName: formData.get('companyName'),
    organizationType: formData.get('organizationType'),
    companySize: optionalValue(formData.get('companySize')),
    teamSize: optionalValue(formData.get('teamSize')),
    useCase: formData.get('useCase'),
    preferredDemoWindow: optionalValue(formData.get('preferredDemoWindow')),
    privacyConsent: formData.get('privacyConsent'),
  })
  if (!parsed.success) {
    logPlatformAction({
      traceId,
      actorId: null,
      action: 'platform.demo_request.submit',
      outcome: 'rejected',
    })
    return { status: 'error', message: firstValidationMessage(parsed.error) }
  }

  try {
    const input = parsed.data
    await db.transaction(async (tx) => {
      const [request] = await tx
        .insert(platformDemoRequests)
        .values({
          contact_name: input.contactName,
          work_email: input.workEmail,
          phone: input.phone,
          job_title: input.jobTitle,
          company_name: input.companyName,
          organization_type: input.organizationType,
          company_size: input.companySize,
          team_size: input.teamSize,
          use_case: input.useCase,
          preferred_demo_window: input.preferredDemoWindow,
        })
        .returning({ id: platformDemoRequests.id })
      if (!request) throw new Error('Demo request was not created.')

      await writePlatformAuditLogInTransaction(tx, {
        actorId: null,
        actorEmail: null,
        entityType: 'demo_request',
        entityId: request.id,
        action: 'create',
        details: { source: 'book_demo' },
      })
    })
  } catch (error) {
    console.error('[book-demo:submit]', {
      trace_id: traceId,
      error: error instanceof Error ? error.message : 'unknown error',
    })
    logPlatformAction({
      traceId,
      actorId: null,
      action: 'platform.demo_request.submit',
      outcome: 'failed',
    })
    return {
      status: 'error',
      message: 'We could not save your request. Please try again shortly.',
    }
  }

  logPlatformAction({
    traceId,
    actorId: null,
    action: 'platform.demo_request.submit',
    outcome: 'allowed',
  })
  revalidatePath('/owner')
  return {
    status: 'success',
    message: 'Thanks — we received your request and will be in touch shortly.',
  }
}
