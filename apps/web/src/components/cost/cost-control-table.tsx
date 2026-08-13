import type { ProjectCostControlRow } from '@/lib/operations/project-cost-control'

function money(currency: string, cents: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

export function CostControlTable({
  rows,
  currency = 'PHP',
}: {
  rows: ProjectCostControlRow[]
  currency?: string
}) {
  if (rows.length === 0) {
    return (
      <div className="card-empty">
        No approved budget, PO commitment, or posted supplier-bill evidence is
        linked to a BOM line yet.
      </div>
    )
  }

  return (
    <div className="finance-table-shell cost-control-table-shell">
      <table className="data-table cost-control-table">
        <caption className="sr-only">
          Cost control by Cost Code and BOM line. Committed and actual values
          are not added together.
        </caption>
        <thead>
          <tr>
            <th>Cost Code</th>
            <th>BOM line</th>
            <th className="num">Budget</th>
            <th className="num">Committed</th>
            <th className="num">Actual</th>
            <th className="num">Remaining</th>
            <th className="num">Variance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>
                <strong>{row.code}</strong>
                <span className="finance-cell-detail">{row.name}</span>
              </td>
              <td>
                {row.bomLineCode || row.bomLineDescription ? (
                  <>
                    <strong>{row.bomLineCode || 'BOM line'}</strong>
                    <span className="finance-cell-detail">
                      {row.bomLineDescription || 'Description unavailable'}
                    </span>
                  </>
                ) : (
                  <span className="cost-control-unassigned">Unassigned</span>
                )}
              </td>
              <td className="num finance-money">
                {money(currency, row.baselineCents)}
              </td>
              <td className="num finance-money">
                {money(currency, row.committedCents)}
              </td>
              <td className="num finance-money">
                {money(currency, row.actualCents)}
              </td>
              <td
                className={`num finance-money ${
                  row.remainingCents < 0 ? 'budget-negative-text' : ''
                }`}
              >
                {money(currency, row.remainingCents)}
              </td>
              <td
                className={`num finance-money ${
                  row.varianceCents > 0 ? 'budget-negative-text' : ''
                }`}
              >
                {money(currency, row.varianceCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
