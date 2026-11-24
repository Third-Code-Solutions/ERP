import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  detail: vi.fn(),
}))

vi.mock('@third-code-erp/auth', async (original) => ({
  ...(await original<typeof import('@third-code-erp/auth')>()),
  requireUserProfile: mocks.profile,
}))
vi.mock('@/lib/account-queries', () => ({ getAccountDetail: mocks.detail }))
vi.mock('@/components/accounts/kyc-review-form', () => ({
  KycReviewForm: ({ currentStatus }: { currentStatus?: string }) => (
    <div data-testid="kyc-review-form" data-status={currentStatus} />
  ),
}))
vi.mock('@/components/accounts/add-kyc-artifact-form', () => ({
  AddKycArtifactForm: () => <div data-testid="add-kyc-artifact-form" />,
}))

import AccountDetailPage from './page'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222'
const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333'

function detail(kycStatus: string) {
  return {
    account: {
      id: ACCOUNT_ID,
      name: 'Acme Builders',
      industry: 'general_contractor',
      kyc_status: kycStatus,
      kyc_notes: null,
      primary_email: null,
      primary_phone: null,
      billing_address: null,
      created_at: new Date('2026-09-01T00:00:00Z'),
    },
    contactRows: [],
    kycRows: [
      {
        id: 'a1',
        artifact_type: 'bir_2303',
        document_id: DOCUMENT_ID,
        file_name: 'bir-2303.pdf',
        uploaded_at: new Date('2026-09-02T00:00:00Z'),
      },
      {
        id: 'a2',
        artifact_type: 'other',
        document_id: null,
        file_name: null,
        uploaded_at: new Date('2026-09-03T00:00:00Z'),
      },
    ],
    oppRows: [],
    projectRows: [],
  }
}

async function render(role: string, kycStatus: string): Promise<string> {
  mocks.profile.mockResolvedValue({ tenantId: TENANT_ID, role })
  mocks.detail.mockResolvedValue(detail(kycStatus))
  const page = await AccountDetailPage({ params: Promise.resolve({ id: ACCOUNT_ID }) })
  return renderToStaticMarkup(page)
}

describe('AccountDetailPage KYC', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('links an attached document by name and labels a metadata-only row', async () => {
    const markup = await render('finance', 'pending')

    expect(mocks.detail).toHaveBeenCalledWith(TENANT_ID, ACCOUNT_ID)
    expect(markup).toContain(`href="/api/documents/${DOCUMENT_ID}"`)
    expect(markup).toContain('>bir-2303.pdf</a>')
    expect(markup).toContain('Metadata only')
  })

  it.each(['pending', 'flagged', 'rejected'])('shows Finance the review form for a %s account', async (status) => {
    const markup = await render('finance', status)

    expect(markup).toContain('data-testid="kyc-review-form"')
    expect(markup).toContain(`data-status="${status}"`)
  })

  it.each(['approved', 'not_required'])('shows no review form for a %s account', async (status) => {
    const markup = await render('finance', status)

    expect(markup).not.toContain('data-testid="kyc-review-form"')
  })

  it('never shows the review form to a role without account.kyc_review', async () => {
    const markup = await render('sales', 'rejected')

    expect(markup).not.toContain('data-testid="kyc-review-form"')
  })
})
