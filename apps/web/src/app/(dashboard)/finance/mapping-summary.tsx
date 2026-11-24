import React from 'react'

interface MappingSummaryProps {
  mappings: ReadonlyArray<{ key: string; label: string }>
  accounts: ReadonlyArray<{ id: string; code: string; name: string }>
  /** system key to ledger account id */
  current: Readonly<Record<string, string>>
}

/** Read-only view of the control-account mappings for roles that cannot edit. */
export function MappingSummary({
  mappings,
  accounts,
  current,
}: MappingSummaryProps) {
  return (
    <dl className="payable-evidence-list">
      {mappings.map((mapping) => {
        const account = accounts.find(
          (candidate) => candidate.id === current[mapping.key]
        )
        return (
          <div key={mapping.key}>
            <dt>{mapping.label}</dt>
            <dd>
              {account ? `${account.code} · ${account.name}` : 'Not mapped yet'}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
