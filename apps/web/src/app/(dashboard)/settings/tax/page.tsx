import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { formatBps } from '@third-code-erp/shared-types'
import { loadTaxSettings, taxSettingsEnabled, type TaxProfileSummary } from './tax-settings'

export const metadata: Metadata = { title: 'Tax rates' }

const approvedAtFormat = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Manila',
})

function BackLink() {
  return (
    <p className="mt-6 text-sm">
      <Link href="/settings" className="font-semibold text-[var(--color-navy-700)] underline underline-offset-4">
        Back to settings
      </Link>
    </p>
  )
}

function InForceProfile({ profile }: { profile: TaxProfileSummary }) {
  const fields: Array<[string, string]> = [
    ['Code', profile.code],
    ['Name', profile.name],
    ['Valid from', profile.validFrom],
    ['Valid to', profile.validTo ?? 'Open-ended'],
    ['Prepared by', profile.preparedBy],
    ['Approved by', profile.approvedBy ?? 'Not recorded'],
    ['Approved at', profile.approvedAt ? approvedAtFormat.format(profile.approvedAt) : 'Not recorded'],
  ]
  return (
    <section aria-labelledby="tax-profile-heading" className="card mt-6">
      <div className="card-header"><h2 id="tax-profile-heading" className="card-title">Profile in force</h2></div>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 p-6 text-sm">
        {fields.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-[var(--color-neutral-600)]">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export default async function TaxSettingsPage() {
  if (!taxSettingsEnabled()) return notFound()
  const profile = await requireUserProfile()
  requireCapability(profile, 'finance.read')
  const settings = await loadTaxSettings(profile.tenantId, new Date())

  if (settings.state === 'conflict') {
    return (
      <div className="max-w-[860px]">
        <div className="page-header">
          <h1 className="page-title">Tax rates</h1>
          <p className="page-subtitle">Effective rates as of {settings.asOf} (Manila)</p>
        </div>
        <div role="alert" className="card p-6 text-sm">
          <p className="font-semibold">More than one active tax profile covers {settings.asOf}.</p>
          <p className="mt-2">Profiles: {settings.profileCodes.join(', ')}.</p>
          <p className="mt-2">Invoices and purchase orders cannot be created until only one active profile covers this date.</p>
        </div>
        <BackLink />
      </div>
    )
  }

  const { rates, inForce, upcoming, lastEnded } = settings
  const source =
    rates.source === 'profile'
      ? `Tax profile ${rates.profileCode}`
      : lastEnded
        ? `System default (profile ${lastEnded.code} ended on ${lastEnded.validTo})`
        : 'System default'
  const rows: Array<[string, string]> = [
    ['VAT', formatBps(rates.vatBps)],
    ['EWT', formatBps(rates.ewtBps)],
    ['Retention', formatBps(rates.retentionBps)],
    ['VAT-registered', rates.vatRegistered ? 'Yes' : 'No'],
  ]

  return (
    <div className="max-w-[860px]">
      <div className="page-header">
        <h1 className="page-title">Tax rates</h1>
        <p className="page-subtitle">Effective rates as of {rates.asOf} (Manila)</p>
      </div>

      <section aria-labelledby="tax-rates-heading" className="card">
        <div className="card-header"><h2 id="tax-rates-heading" className="card-title">Rates used for new invoices and purchase orders</h2></div>
        <div className="overflow-x-auto p-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th scope="col" className="pb-2">Rate</th>
                <th scope="col" className="pb-2 text-right">Value</th>
                <th scope="col" className="pb-2 pl-6">Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, value]) => (
                <tr key={label} className="border-t">
                  <td className="py-2">{label}</td>
                  <td className="py-2 text-right font-mono">{value}</td>
                  <td className="py-2 pl-6">{source}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-sm text-[var(--color-neutral-600)]">
            Rates are locked and cannot be edited here until the owner decides the open tax policy questions.
          </p>
        </div>
      </section>

      {inForce && <InForceProfile profile={inForce} />}

      {upcoming.length > 0 && (
        <section aria-labelledby="tax-upcoming-heading" className="card mt-6">
          <div className="card-header"><h2 id="tax-upcoming-heading" className="card-title">Upcoming</h2></div>
          <ul className="space-y-1 p-6 text-sm">
            {upcoming.map((next) => (
              <li key={next.id}>{next.code}, starts {next.validFrom}</li>
            ))}
          </ul>
        </section>
      )}

      <BackLink />
    </div>
  )
}
