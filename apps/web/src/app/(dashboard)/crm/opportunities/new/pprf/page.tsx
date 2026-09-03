import type { Metadata } from 'next'
import { randomUUID } from 'node:crypto'
import { redirect } from 'next/navigation'
import { can, requireUserProfile } from '@third-code-erp/auth'
import { PprfIntakeForm } from '@/components/proposal/pprf-intake-form'

export const metadata: Metadata = { title: 'New PPRF intake' }

export default async function NewPprfIntakePage() {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'pprf.submit') || !can(profile.role, 'account.create')) {
    redirect('/crm/accounts?error=forbidden')
  }

  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">CRM · PPRF intake</p>
        <h1 className="page-title">Start a qualified opportunity</h1>
        <p className="page-subtitle">
          Create the client, opportunity, PPRF, and independent Finance review tracks in one auditable submission.
        </p>
      </div>
      <div className="card" style={{ maxWidth: 900 }}>
        <div style={{ padding: 18 }}>
          <PprfIntakeForm submissionId={randomUUID()} />
        </div>
      </div>
    </div>
  )
}
