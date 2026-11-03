/** Display labels and badge tones for `users.account_status`. */
export const ACCOUNT_STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  invited: 'Invited',
  suspended: 'Suspended',
  disabled: 'Disabled',
}

export const ACCOUNT_STATUS_TONE: Record<string, string> = {
  active: 'stage-badge stage-closed_won',
  invited: 'stage-badge stage-scoping',
  suspended: 'stage-badge stage-closed_lost',
  disabled: 'stage-badge stage-opportunity_creation',
}
