import React from 'react'

export interface PprfReadOnlyValues {
  site_address: string
  floor_area_sqm: string
  landlord_contact: string
  as_built_available: 'yes' | 'no' | 'partial'
  scope_notes: string
  project_type: string
  expected_start_date: string
  budget_range: string
}

const AS_BUILT_LABELS: Record<PprfReadOnlyValues['as_built_available'], string> = {
  yes: 'Yes',
  partial: 'Partial',
  no: 'No',
}

/**
 * The latest PPRF version as plain text, for roles that cannot submit one
 * (Finance reviews the KYC tracks from this evidence).
 */
export function PprfReadOnly({
  version,
  submittedAt,
  values,
}: {
  version: number
  submittedAt: string | null
  values: PprfReadOnlyValues
}) {
  const rows: Array<[string, string]> = [
    ['Site address', values.site_address],
    ['Floor area (sqm)', values.floor_area_sqm],
    ['Landlord contact', values.landlord_contact],
    ['As-built available', AS_BUILT_LABELS[values.as_built_available]],
    ['Project type', values.project_type],
    ['Expected start date', values.expected_start_date],
    ['Budget range', values.budget_range],
    ['Scope notes', values.scope_notes],
  ]

  return (
    <section aria-label={`PPRF version ${version}`}>
      <p className="muted" style={{ margin: '0 0 10px', fontSize: 12.5 }}>
        PPRF v{version} (latest){submittedAt ? ` · submitted ${submittedAt}` : ''}. Your role can read it but not
        submit a new version.
      </p>
      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'minmax(120px, 180px) 1fr', gap: '8px 14px', fontSize: 13 }}>
        {rows.map(([label, value]) => (
          <React.Fragment key={label}>
            <dt style={{ color: 'var(--color-neutral-500)' }}>{label}</dt>
            <dd style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{value || '—'}</dd>
          </React.Fragment>
        ))}
      </dl>
    </section>
  )
}
