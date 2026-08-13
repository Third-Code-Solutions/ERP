import type { Metadata } from 'next'
import { getVendorConfirmationView } from '@/lib/vendor-confirmation-client'
import { VendorConfirmationForm } from './vendor-confirmation-form'

export const metadata: Metadata = {
  title: 'Supplier order review | ABI OPS',
  robots: { index: false, follow: false },
}

interface PageProps {
  params: Promise<{ token: string }>
}

function formatPHP(cents: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

function formatDate(value: string | null): string {
  if (!value) return 'Not specified'
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeZone: 'Asia/Manila',
  }).format(new Date(value))
}

function formatQuantity(quantityMicros: number, quantity: number): string {
  if (quantityMicros === quantity * 1_000_000) return String(quantity)
  return (quantityMicros / 1_000_000).toLocaleString('en-PH', {
    maximumFractionDigits: 6,
  })
}

function stateLabel(state: string): string {
  if (state === 'accepted') return 'Accepted'
  if (state === 'declined') return 'Declined'
  if (state === 'changes_requested') return 'Changes requested'
  return 'Awaiting response'
}

export default async function VendorConfirmationPage({ params }: PageProps) {
  const { token } = await params
  const result = await getVendorConfirmationView(token)

  if (!result.ok || !result.data) {
    return (
      <StateCard
        title="Supplier review unavailable"
        body={result.error ?? 'This confirmation link is not available.'}
      />
    )
  }

  const view = result.data
  const isPending = view.state === 'pending'

  return (
    <section className="vendor-confirmation-page">
      <div className="vendor-confirmation-intro">
        <p className="vendor-confirmation-kicker">Supplier review</p>
        <h2>Review {view.poNumber}</h2>
        <p>
          Confirm this order for <strong>{view.projectName}</strong>. Your
          response goes directly to the project team.
        </p>
      </div>

      <div className="vendor-confirmation-layout">
        <div className="vendor-confirmation-summary">
          <section className="vendor-confirmation-card">
            <div className="vendor-confirmation-card-head">
              <div>
                <p className="vendor-confirmation-card-kicker">Order context</p>
                <h3>{view.vendorName}</h3>
              </div>
              <span className="vendor-confirmation-state">
                {stateLabel(view.state)}
              </span>
            </div>
            <dl className="vendor-confirmation-facts">
              <div>
                <dt>Project</dt>
                <dd>{view.projectName}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{view.projectLocation || 'Not specified'}</dd>
              </div>
              <div>
                <dt>Delivery date</dt>
                <dd>{formatDate(view.deliveryDate)}</dd>
              </div>
              <div>
                <dt>Link valid until</dt>
                <dd>{formatDate(view.expiresAt)}</dd>
              </div>
            </dl>
            {view.notes && (
              <p className="vendor-confirmation-notes">
                <strong>Order note:</strong> {view.notes}
              </p>
            )}
          </section>

          <section className="vendor-confirmation-card">
            <div className="vendor-confirmation-card-head">
              <div>
                <p className="vendor-confirmation-card-kicker">Items</p>
                <h3>What is being ordered</h3>
              </div>
              <span className="vendor-confirmation-count">
                {view.lines.length} {view.lines.length === 1 ? 'line' : 'lines'}
              </span>
            </div>
            <div className="vendor-confirmation-lines-wrap">
              <table className="vendor-confirmation-lines">
                <thead>
                  <tr>
                    <th scope="col">Description</th>
                    <th scope="col">Qty</th>
                    <th scope="col">Unit price</th>
                    <th scope="col">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {view.lines.map((line) => (
                    <tr key={line.id}>
                      <th scope="row">
                        {line.description}
                        {line.unit && <small>{line.unit}</small>}
                      </th>
                      <td>{formatQuantity(line.quantityMicros, line.quantity)}</td>
                      <td>{formatPHP(line.unitCostCents)}</td>
                      <td>{formatPHP(line.lineTotalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="vendor-confirmation-totals">
              <div>
                <dt>Subtotal</dt>
                <dd>{formatPHP(view.subtotalCents)}</dd>
              </div>
              <div>
                <dt>VAT</dt>
                <dd>{formatPHP(view.vatCents)}</dd>
              </div>
              <div>
                <dt>Withholding tax</dt>
                <dd>− {formatPHP(view.withholdingTaxCents)}</dd>
              </div>
              <div className="vendor-confirmation-total">
                <dt>Total</dt>
                <dd>{formatPHP(view.totalCents)}</dd>
              </div>
            </dl>
          </section>
        </div>

        <aside className="vendor-confirmation-card vendor-confirmation-decision-card">
          <p className="vendor-confirmation-card-kicker">Your response</p>
          {isPending ? (
            <>
              <h3>Choose what happens next</h3>
              <p className="vendor-confirmation-muted">
                Accept when everything is correct. Request changes or decline
                when the project team needs a clear follow-up.
              </p>
              <VendorConfirmationForm token={token} />
            </>
          ) : (
            <div className="vendor-confirmation-readonly" aria-live="polite">
              <h3>{stateLabel(view.state)}</h3>
              <p>
                This order already has a supplier response. Contact the project
                team if anything needs to be revisited.
              </p>
            </div>
          )}
        </aside>
      </div>

      <style>{styles}</style>
    </section>
  )
}

function StateCard({ title, body }: { title: string; body: string }) {
  return (
    <section className="vendor-confirmation-state-card">
      <p className="vendor-confirmation-kicker">ABI OPS</p>
      <h2>{title}</h2>
      <p>{body}</p>
      <style>{styles}</style>
    </section>
  )
}

const styles = `
  .vendor-confirmation-page,
  .vendor-confirmation-state-card {
    max-width: 1120px;
    margin: 0 auto;
    color: #14213d;
    font-family: 'Cabinet Grotesk', 'Satoshi', var(--font-sans), sans-serif;
  }
  .vendor-confirmation-intro { max-width: 760px; margin: 0 0 28px; }
  .vendor-confirmation-kicker,
  .vendor-confirmation-card-kicker {
    margin: 0 0 8px;
    color: #a45a2a;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .16em;
    text-transform: uppercase;
  }
  .vendor-confirmation-intro h2,
  .vendor-confirmation-state-card h2 {
    max-width: 48rem;
    margin: 0;
    font-size: clamp(2rem, 4vw, 3.5rem);
    line-height: 1.04;
    letter-spacing: -.04em;
  }
  .vendor-confirmation-intro p:last-child,
  .vendor-confirmation-state-card > p:last-child {
    margin: 14px 0 0;
    color: #525866;
    font-size: 15px;
    line-height: 1.65;
  }
  .vendor-confirmation-layout {
    display: grid;
    grid-template-columns: minmax(0, 7fr) minmax(320px, 5fr);
    gap: 20px;
    align-items: start;
  }
  .vendor-confirmation-summary { display: grid; gap: 20px; min-width: 0; }
  .vendor-confirmation-card {
    border: 1px solid #d9dee7;
    border-radius: 14px;
    background: rgba(255,255,255,.96);
    box-shadow: 0 12px 32px rgba(15,45,74,.06);
    padding: 24px;
  }
  .vendor-confirmation-card-head {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
    margin-bottom: 18px;
  }
  .vendor-confirmation-card h3 { margin: 0; font-size: 21px; letter-spacing: -.02em; }
  .vendor-confirmation-state,
  .vendor-confirmation-count {
    flex: 0 0 auto;
    border: 1px solid #d9dee7;
    border-radius: 999px;
    padding: 6px 10px;
    color: #525866;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .05em;
    text-transform: uppercase;
  }
  .vendor-confirmation-facts,
  .vendor-confirmation-totals { margin: 0; display: grid; gap: 1px; }
  .vendor-confirmation-facts { grid-template-columns: 1fr 1fr; background: #e8ebf0; }
  .vendor-confirmation-facts > div,
  .vendor-confirmation-totals > div { background: #fff; padding: 12px; }
  .vendor-confirmation-facts dt,
  .vendor-confirmation-totals dt { color: #6b7280; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; }
  .vendor-confirmation-facts dd,
  .vendor-confirmation-totals dd { margin: 4px 0 0; font-size: 14px; font-weight: 600; }
  .vendor-confirmation-notes { margin: 16px 0 0; color: #525866; font-size: 13px; line-height: 1.55; }
  .vendor-confirmation-lines-wrap { overflow-x: auto; }
  .vendor-confirmation-lines { width: 100%; border-collapse: collapse; font-size: 13px; }
  .vendor-confirmation-lines th,
  .vendor-confirmation-lines td { border-bottom: 1px solid #e8ebf0; padding: 11px 8px; text-align: right; white-space: nowrap; }
  .vendor-confirmation-lines th:first-child,
  .vendor-confirmation-lines td:first-child { text-align: left; }
  .vendor-confirmation-lines thead th { color: #6b7280; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; }
  .vendor-confirmation-lines tbody th { font-weight: 600; white-space: normal; min-width: 190px; }
  .vendor-confirmation-lines tbody th small { display: block; margin-top: 3px; color: #6b7280; font-weight: 400; }
  .vendor-confirmation-totals { max-width: 340px; margin: 18px 0 0 auto; background: #e8ebf0; }
  .vendor-confirmation-totals > div { display: flex; justify-content: space-between; gap: 16px; }
  .vendor-confirmation-totals dd { margin: 0; font-variant-numeric: tabular-nums; }
  .vendor-confirmation-totals .vendor-confirmation-total { border-top: 2px solid #0f2d4a; color: #0f2d4a; font-size: 17px; }
  .vendor-confirmation-decision-card { position: sticky; top: 20px; }
  .vendor-confirmation-muted { margin: 10px 0 22px; color: #525866; font-size: 13px; line-height: 1.55; }
  .vendor-confirmation-form { display: grid; gap: 16px; }
  .vendor-confirmation-field { display: grid; gap: 7px; }
  .vendor-confirmation-field label,
  .vendor-confirmation-fieldset legend { color: #14213d; font-size: 12px; font-weight: 700; }
  .vendor-confirmation-field input,
  .vendor-confirmation-field textarea {
    width: 100%; box-sizing: border-box; border: 1px solid #cfd5df; border-radius: 9px;
    background: #fff; color: #14213d; padding: 11px 12px; font: inherit; font-size: 14px;
  }
  .vendor-confirmation-field input:focus,
  .vendor-confirmation-field textarea:focus,
  .vendor-confirmation-decision:focus-visible { outline: 3px solid rgba(224,123,42,.35); outline-offset: 2px; border-color: #e07b2a; }
  .vendor-confirmation-field textarea { min-height: 112px; resize: vertical; }
  .vendor-confirmation-fieldset { margin: 0; padding: 0; border: 0; }
  .vendor-confirmation-fieldset legend { margin-bottom: 9px; }
  .vendor-confirmation-decisions { display: grid; gap: 8px; }
  .vendor-confirmation-decision {
    display: grid; gap: 3px; width: 100%; border: 1px solid #cfd5df; border-radius: 10px;
    background: #fff; color: #14213d; padding: 12px; text-align: left; cursor: pointer;
    font: inherit; font-size: 14px; font-weight: 700;
  }
  .vendor-confirmation-decision small { color: #6b7280; font-size: 11px; font-weight: 400; line-height: 1.4; }
  .vendor-confirmation-decision.is-selected { border-color: #0f2d4a; box-shadow: inset 3px 0 #e07b2a; background: #f7f9fb; }
  .vendor-confirmation-decision:disabled { cursor: wait; opacity: .6; }
  .vendor-confirmation-error { margin: 0; border: 1px solid #efb6ae; border-radius: 9px; background: #fff5f3; color: #8a2222; padding: 10px 12px; font-size: 13px; line-height: 1.45; }
  .vendor-confirmation-submit-note { margin: 0; color: #6b7280; font-size: 11px; line-height: 1.5; }
  .vendor-confirmation-readonly,
  .vendor-confirmation-success,
  .vendor-confirmation-state-card { border: 1px solid #d9dee7; border-radius: 14px; background: #fff; padding: 28px; }
  .vendor-confirmation-readonly p,
  .vendor-confirmation-success p,
  .vendor-confirmation-state-card p { color: #525866; font-size: 14px; line-height: 1.6; }
  .vendor-confirmation-success { margin-top: 12px; border-color: #a7d6ba; background: #f4fbf6; }
  .vendor-confirmation-success h2 { margin: 0; font-size: 24px; letter-spacing: -.03em; }
  .vendor-confirmation-success p:last-child { margin-bottom: 0; }
  .vendor-confirmation-state-card { max-width: 640px; margin-top: 24px; }
  @media (max-width: 760px) {
    .vendor-confirmation-layout { grid-template-columns: 1fr; }
    .vendor-confirmation-decision-card { position: static; }
  }
  @media (max-width: 520px) {
    .vendor-confirmation-card { padding: 18px; }
    .vendor-confirmation-facts { grid-template-columns: 1fr; }
    .vendor-confirmation-card-head { display: grid; }
    .vendor-confirmation-state, .vendor-confirmation-count { justify-self: start; }
  }
`
