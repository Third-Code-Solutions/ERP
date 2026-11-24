import type { AppRole } from '@third-code-erp/auth'
import type {
  OpportunityKycTrackAction,
  OpportunityKycTrackStatus,
} from '@third-code-erp/shared-types'

export interface KycTrackNotification {
  recipientRoles: AppRole[]
  subject: string
  body: string
}

/**
 * Who hears about a review-track change. Approval goes to Sales and Finance;
 * a flag or rejection also reaches Sales, who must act on it (answer Finance,
 * or resubmit the PPRF); other steps stay with owner and admin. The reviewer's
 * notes are not copied into the message: they are on the linked PPRF page.
 */
export function kycTrackNotification(input: {
  action: OpportunityKycTrackAction
  status: OpportunityKycTrackStatus
  trackLabel: string
  accountName: string | null
}): KycTrackNotification {
  const statusText = input.status.replace('_', ' ')
  const subject = `${input.trackLabel} ${statusText}`
  const lead = `${input.accountName ? `${input.accountName}: ` : ''}${input.trackLabel} is now ${statusText}.`

  if (input.action === 'approve') {
    return { recipientRoles: ['sales', 'finance'], subject, body: lead }
  }
  if (input.action === 'reject') {
    return {
      recipientRoles: ['owner', 'admin', 'sales'],
      subject,
      body: `${lead} Resubmit the PPRF to reopen the review.`,
    }
  }
  if (input.action === 'flag') {
    return {
      recipientRoles: ['owner', 'admin', 'sales'],
      subject,
      body: `${lead} Finance will review the flag; open the PPRF page for the reason.`,
    }
  }
  return { recipientRoles: ['owner', 'admin'], subject, body: lead }
}
