'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createStockMovement } from './actions'

type MovementType = 'transfer' | 'consumption' | 'adjustment'

interface WarehouseOption {
  id: string
  code: string
  name: string
  projectId: string | null
}

interface ProjectOption {
  id: string
  name: string
}

interface ItemOption {
  id: string
  code: string
  description: string
  uomCode: string
}

interface CostCodeOption {
  id: string
  code: string
  name: string
}

interface BalanceOption {
  warehouseId: string
  materialItemId: string
  quantityMicros: number
  valueCents: number
}

interface LineDraft {
  quantity: string
  costCodeId: string
  declaredUnitCostPhp: string
}

function quantity(micros: number): string {
  return new Intl.NumberFormat('en-PH', {
    maximumFractionDigits: 6,
  }).format(micros / 1_000_000)
}

function money(cents: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100)
}

export function StockMovementForm({
  warehouses,
  projects,
  items,
  costCodes,
  balances,
  today,
}: {
  warehouses: WarehouseOption[]
  projects: ProjectOption[]
  items: ItemOption[]
  costCodes: CostCodeOption[]
  balances: BalanceOption[]
  today: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const retryKeyRef = useRef<string | null>(null)
  const [movementType, setMovementType] =
    useState<MovementType>('transfer')
  const [sourceWarehouseId, setSourceWarehouseId] = useState('')
  const [targetWarehouseId, setTargetWarehouseId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [movementDate, setMovementDate] = useState(today)
  const [reason, setReason] = useState('')
  const [selected, setSelected] = useState<Record<string, LineDraft>>({})
  const [error, setError] = useState<string | null>(null)

  const balanceByItem = useMemo(
    () =>
      new Map(
        balances
          .filter(
            (balance) => balance.warehouseId === sourceWarehouseId
          )
          .map((balance) => [balance.materialItemId, balance])
      ),
    [balances, sourceWarehouseId]
  )
  const sourceWarehouse = warehouses.find(
    (warehouse) => warehouse.id === sourceWarehouseId
  )
  const targetWarehouse = warehouses.find(
    (warehouse) => warehouse.id === targetWarehouseId
  )
  const selectedLines = Object.entries(selected).map(
    ([materialItemId, line]) => ({
      materialItemId,
      quantity: line.quantity,
      costCodeId: line.costCodeId,
      declaredUnitCostPhp: line.declaredUnitCostPhp,
    })
  )
  const dimensionsValid =
    !!sourceWarehouseId &&
    !!movementDate &&
    reason.trim().length >= 3 &&
    (movementType !== 'transfer' ||
      (!!targetWarehouseId &&
        targetWarehouseId !== sourceWarehouseId)) &&
    (movementType !== 'consumption' || !!projectId) &&
    (!sourceWarehouse?.projectId ||
      sourceWarehouse.projectId === projectId) &&
    (!targetWarehouse?.projectId ||
      targetWarehouse.projectId === projectId)
  const linesValid =
    selectedLines.length > 0 &&
    selectedLines.every((line) => {
      const numeric = Number(line.quantity)
      if (!Number.isFinite(numeric) || numeric === 0) return false
      if (movementType !== 'adjustment' && numeric < 0) return false
      if (movementType === 'consumption' && !line.costCodeId) return false
      if (
        movementType === 'adjustment' &&
        numeric > 0 &&
        Number(line.declaredUnitCostPhp) <= 0
      ) {
        return false
      }
      if (
        movementType === 'adjustment' &&
        numeric < 0 &&
        line.declaredUnitCostPhp.trim() !== ''
      ) {
        return false
      }
      return true
    })
  const valid = dimensionsValid && linesValid

  function resetType(nextType: MovementType) {
    setMovementType(nextType)
    setTargetWarehouseId('')
    setProjectId('')
    setSelected({})
    setError(null)
  }

  return (
    <form
      className="payable-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!valid) return
        setError(null)
        startTransition(async () => {
          const idempotencyKey =
            retryKeyRef.current ?? (retryKeyRef.current = crypto.randomUUID())
          const result = await createStockMovement({
            movementType,
            sourceWarehouseId,
            targetWarehouseId,
            projectId,
            movementDate,
            reason,
            lines: selectedLines,
            idempotencyKey,
          })
          if (!result.ok || !result.id) {
            setError(result.error ?? 'Could not create Stock Movement.')
            return
          }
          retryKeyRef.current = null
          router.push(`/inventory/movements/${result.id}`)
        })
      }}
    >
      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">1 / Movement decision</p>
            <h2>What happened to stock?</h2>
          </div>
          <p>Each type has a distinct valuation and posting consequence.</p>
        </div>
        <div className="inventory-movement-type-grid">
          {(
            [
              [
                'transfer',
                'Transfer',
                'Move the same quantity and value between Warehouses.',
              ],
              [
                'consumption',
                'Project consumption',
                'Relieve stock into a Project expense and Cost Code.',
              ],
              [
                'adjustment',
                'Count adjustment',
                'Record a signed, evidenced physical-count difference.',
              ],
            ] as const
          ).map(([value, label, detail]) => (
            <button
              key={value}
              type="button"
              aria-pressed={movementType === value}
              className={`inventory-movement-type ${
                movementType === value ? 'is-active' : ''
              }`}
              onClick={() => resetType(value)}
            >
              <strong>{label}</strong>
              <span>{detail}</span>
            </button>
          ))}
        </div>
        <div className="inventory-form-grid">
          <div className="finance-field finance-field-grow">
            <label htmlFor="movement-source">Source Warehouse</label>
            <select
              id="movement-source"
              required
              value={sourceWarehouseId}
              onChange={(event) => {
                setSourceWarehouseId(event.target.value)
                setTargetWarehouseId('')
                const warehouse = warehouses.find(
                  (row) => row.id === event.target.value
                )
                if (warehouse?.projectId) {
                  setProjectId(warehouse.projectId)
                }
                setSelected({})
              }}
            >
              <option value="">Choose source</option>
              {warehouses.map((warehouse) => (
                <option value={warehouse.id} key={warehouse.id}>
                  {warehouse.code} / {warehouse.name}
                </option>
              ))}
            </select>
          </div>
          {movementType === 'transfer' && (
            <div className="finance-field finance-field-grow">
              <label htmlFor="movement-target">Target Warehouse</label>
              <select
                id="movement-target"
                required
                value={targetWarehouseId}
                onChange={(event) => {
                  setTargetWarehouseId(event.target.value)
                  const warehouse = warehouses.find(
                    (row) => row.id === event.target.value
                  )
                  if (warehouse?.projectId) {
                    setProjectId(warehouse.projectId)
                  }
                }}
              >
                <option value="">Choose target</option>
                {warehouses
                  .filter(
                    (warehouse) => warehouse.id !== sourceWarehouseId
                  )
                  .map((warehouse) => (
                    <option value={warehouse.id} key={warehouse.id}>
                      {warehouse.code} / {warehouse.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
          <div className="finance-field finance-field-grow">
            <label htmlFor="movement-project">
              Project
              {movementType === 'consumption' ? ' (required)' : ''}
            </label>
            <select
              id="movement-project"
              required={movementType === 'consumption'}
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
            >
              <option value="">No Project dimension</option>
              {projects.map((project) => (
                <option value={project.id} key={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
          <div className="finance-field">
            <label htmlFor="movement-date">Movement date</label>
            <input
              id="movement-date"
              type="date"
              required
              value={movementDate}
              onChange={(event) => setMovementDate(event.target.value)}
            />
          </div>
          <div className="finance-field finance-field-grow">
            <label htmlFor="movement-reason">Reason / count evidence</label>
            <input
              id="movement-reason"
              required
              minLength={3}
              maxLength={2000}
              placeholder="Site issue request, transfer ticket, or count sheet"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">2 / Item evidence</p>
            <h2>Select Items and quantities</h2>
          </div>
          <p>
            {movementType === 'adjustment'
              ? 'Use a negative quantity for shortage and positive for found stock.'
              : 'Posting derives value from current weighted-average stock cost.'}
          </p>
        </div>
        <div className="finance-table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th aria-label="Select" />
                <th>Item</th>
                <th>UOM</th>
                <th className="numeric">On hand</th>
                <th className="numeric">Stock value</th>
                <th>Quantity</th>
                {movementType === 'consumption' && <th>Cost Code</th>}
                {movementType === 'adjustment' && (
                  <th>Positive unit cost (PHP)</th>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const line = selected[item.id]
                const balance = balanceByItem.get(item.id)
                const selectable =
                  movementType === 'adjustment' ||
                  (balance?.quantityMicros ?? 0) > 0
                return (
                  <tr key={item.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${item.description}`}
                        checked={Boolean(line)}
                        disabled={!sourceWarehouseId || !selectable}
                        onChange={(event) => {
                          setSelected((current) => {
                            const next = { ...current }
                            if (event.target.checked) {
                              next[item.id] = {
                                quantity: '',
                                costCodeId: '',
                                declaredUnitCostPhp: '',
                              }
                            } else {
                              delete next[item.id]
                            }
                            return next
                          })
                        }}
                      />
                    </td>
                    <td>
                      <strong>{item.code}</strong>
                      <span className="finance-cell-detail">
                        {item.description}
                      </span>
                    </td>
                    <td>{item.uomCode}</td>
                    <td className="numeric">
                      {quantity(balance?.quantityMicros ?? 0)}
                    </td>
                    <td className="numeric">
                      {money(balance?.valueCents ?? 0)}
                    </td>
                    <td>
                      <input
                        aria-label={`Quantity for ${item.description}`}
                        inputMode="decimal"
                        placeholder={
                          movementType === 'adjustment' ? '-1 or 1' : '1'
                        }
                        disabled={!line}
                        value={line?.quantity ?? ''}
                        onChange={(event) =>
                          setSelected((current) => ({
                            ...current,
                            [item.id]: {
                              ...(current[item.id] ?? {
                                costCodeId: '',
                                declaredUnitCostPhp: '',
                              }),
                              quantity: event.target.value,
                            },
                          }))
                        }
                      />
                    </td>
                    {movementType === 'consumption' && (
                      <td>
                        <select
                          aria-label={`Cost Code for ${item.description}`}
                          disabled={!line}
                          value={line?.costCodeId ?? ''}
                          onChange={(event) =>
                            setSelected((current) => ({
                              ...current,
                              [item.id]: {
                                ...(current[item.id] ?? {
                                  quantity: '',
                                  declaredUnitCostPhp: '',
                                }),
                                costCodeId: event.target.value,
                              },
                            }))
                          }
                        >
                          <option value="">Choose Cost Code</option>
                          {costCodes.map((code) => (
                            <option value={code.id} key={code.id}>
                              {code.code} / {code.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    )}
                    {movementType === 'adjustment' && (
                      <td>
                        <input
                          aria-label={`Unit cost for ${item.description}`}
                          inputMode="decimal"
                          placeholder="Required only when positive"
                          disabled={!line}
                          value={line?.declaredUnitCostPhp ?? ''}
                          onChange={(event) =>
                            setSelected((current) => ({
                              ...current,
                              [item.id]: {
                                ...(current[item.id] ?? {
                                  quantity: '',
                                  costCodeId: '',
                                }),
                                declaredUnitCostPhp: event.target.value,
                              },
                            }))
                          }
                        />
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {error && (
          <p className="finance-form-error" role="alert">
            {error}
          </p>
        )}
        <div className="journal-submit-row">
          <p>
            Finance posts the draft after checking quantity, dimensions, open
            period, and valuation evidence.
          </p>
          <button
            type="submit"
            className="finance-primary-button"
            disabled={pending || !valid}
          >
            {pending ? 'Creating...' : 'Create movement draft'}
          </button>
        </div>
      </section>
    </form>
  )
}
