import type { Metadata } from 'next'
import { requireUserProfile, can } from '@buildops/auth'
import { redirect } from 'next/navigation'
import { NewAccountForm } from '@/components/accounts/new-account-form'

export const metadata: Metadata = { title: 'New account' }

export default async function NewAccountPage() {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'account.create')) {
    redirect('/crm/accounts?error=forbidden')
  }

  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">CRM</p>
        <h1 className="page-title">New account</h1>
        <p className="page-subtitle">
          Create a client account. KYC artifacts (AFS, BIR 2303, VAT, suppliers, clients)
          can be uploaded from the account detail after creation.
        </p>
      </div>
      <div className="card" style={{ maxWidth: 720 }}>
        <div style={{ padding: 20 }}>
          <NewAccountForm />
        </div>
      </div>
    </div>
  )
}
