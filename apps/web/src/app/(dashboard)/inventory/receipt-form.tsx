'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createStockReceipt } from './actions'

interface PurchaseOrderOption {
  id: string
  number: string
  projectId: string
  projectLabel: string
  vendorLabel: string
}

interface PurchaseOrderLineOption {
  id: string
  purchaseOrderId: string
  code: string | null
  description: string
  uom: string | null
  orderedMicros: number
  receivedMicros: number
  unitCostCents: number
  ready: boolean
}

interface WarehouseOption {
  id: string
  code: string
  name: string
  projectId: string | null
}

interface DeliveryOption {
  id: string
  purchaseOrderId: string
  scheduledDate: string | null
}

function formatQuantity(micros: number): string {
  const whole = Math.trunc(micros / 1_000_000)
  const fraction = String(micros % 1_000_000)
    .padStart(6, '0')
    .replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : String(whole)
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100)
}

export function StockReceiptForm({
  purchaseOrders,
  lines,
  warehouses,
  deliveries,
  today,
}: {
  purchaseOrders: PurchaseOrderOption[]
  lines: PurchaseOrderLineOption[]
  warehouses: WarehouseOption[]
  deliveries: DeliveryOption[]
  today: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const retryKeyRef = useRef<string | null>(null)
  const [purchaseOrderId, setPurchaseOrderId] = useState(
    purchaseOrders[0]?.id ?? ''
  )
  const [warehouseId, setWarehouseId] = useState('')
  const [deliveryScheduleId, setDeliveryScheduleId] = useState('')
  const [receivedDate, setReceivedDate] = useState(today)
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const po = purchaseOrders.find((row) => row.id === purchaseOrderId)
  const poLines = useMemo(
    () => lines.filter((line) => line.purchaseOrderId === purchaseOrderId),
    [lines, purchaseOrderId]
  )
  const warehouseOptions = warehouses.filter(
    (warehouse) => !warehouse.projectId || warehouse.projectId === po?.projectId
  )
  const deliveryOptions = deliveries.filter(
    (delivery) => delivery.purchaseOrderId === purchaseOrderId
  )
  const selectedLines = Object.entries(selected)
    .filter(([id, quantity]) => poLines.some((line) => line.id === id) && quantity)
    .map(([poLineItemId, quantity]) => ({ poLineItemId, quantity }))
  const valid =
    !!purchaseOrderId &&
    !!warehouseId &&
    !!receivedDate &&
    selectedLines.length > 0

  return (
    <form
      className="payable-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!valid) return
        setError(null)
        startTransition(async () => {
          const idempotencyKey = retryKeyRef.current ?? crypto.randomUUID()
          retryKeyRef.current = idempotencyKey
          const result = await createStockReceipt({
            purchaseOrderId,
            warehouseId,
            deliveryScheduleId,
            supplierDeliveryReference: reference,
            receivedDate,
            notes,
            lines: selectedLines,
            idempotencyKey,
          })
          if (!result.ok || !result.id) {
            setError(result.error ?? 'Could not create Stock Receipt.')
            return
          }
          retryKeyRef.current = null
          router.push(`/inventory/receipts/${result.id}`)
        })
      }}
    >
      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">1 / Source evidence</p>
            <h2>Choose the issued Purchase Order</h2>
          </div>
          <p>The PO fixes Supplier, project, Item, UOM, and valuation.</p>
        </div>
        <div className="inventory-form-grid">
          <div className="finance-field finance-field-grow">
            <label htmlFor="stock-receipt-po">Purchase Order</label>
            <select
              id="stock-receipt-po"
              required
              value={purchaseOrderId}
              onChange={(event) => {
                setPurchaseOrderId(event.target.value)
                setWarehouseId('')
                setDeliveryScheduleId('')
                setSelected({})
              }}
            >
              {purchaseOrders.map((option) => (
                <option value={option.id} key={option.id}>
                  {option.number} / {option.vendorLabel} / {option.projectLabel}
                </option>
              ))}
            </select>
          </div>
          <div className="finance-field finance-field-grow">
            <label htmlFor="stock-receipt-warehouse">Warehouse</label>
            <select
              id="stock-receipt-warehouse"
              required
              value={warehouseId}
              onChange={(event) => setWarehouseId(event.target.value)}
            >
              <option value="">Choose destination</option>
              {warehouseOptions.map((warehouse) => (
                <option value={warehouse.id} key={warehouse.id}>
                  {warehouse.code} / {warehouse.name}
                </option>
              ))}
            </select>
          </div>
          <div className="finance-field">
            <label htmlFor="stock-receipt-date">Received date</label>
            <input
              id="stock-receipt-date"
              type="date"
              required
              value={receivedDate}
              onChange={(event) => setReceivedDate(event.target.value)}
            />
          </div>
          <div className="finance-field finance-field-grow">
            <label htmlFor="stock-receipt-delivery">Accepted Delivery</label>
            <select
              id="stock-receipt-delivery"
              value={deliveryScheduleId}
              onChange={(event) => setDeliveryScheduleId(event.target.value)}
            >
              <option value="">No linked Delivery</option>
              {deliveryOptions.map((delivery) => (
                <option value={delivery.id} key={delivery.id}>
                  Accepted {delivery.scheduledDate ?? 'without scheduled date'}
                </option>
              ))}
            </select>
          </div>
          <div className="finance-field finance-field-grow">
            <label htmlFor="stock-receipt-reference">Supplier delivery ref</label>
            <input
              id="stock-receipt-reference"
              maxLength={120}
              placeholder="DR-000184"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">2 / Accepted quantities</p>
            <h2>Select what entered stock</h2>
          </div>
          <p>Quantity accepts up to six decimals. Remaining is concurrency-safe.</p>
        </div>
        <div className="finance-table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th aria-label="Select" />
                <th>PO line</th>
                <th>UOM</th>
                <th className="numeric">Ordered</th>
                <th className="numeric">Received</th>
                <th className="numeric">Remaining</th>
                <th className="numeric">Unit cost</th>
                <th>Accept now</th>
              </tr>
            </thead>
            <tbody>
              {poLines.map((line) => {
                const remaining = line.orderedMicros - line.receivedMicros
                const enabled = line.ready && remaining > 0
                const checked = selected[line.id] !== undefined
                return (
                  <tr key={line.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${line.description}`}
                        checked={checked}
                        disabled={!enabled}
                        onChange={(event) => {
                          setSelected((current) => {
                            const next = { ...current }
                            if (event.target.checked) {
                              next[line.id] = formatQuantity(remaining)
                            } else {
                              delete next[line.id]
                            }
                            return next
                          })
                        }}
                      />
                    </td>
                    <td>
                      <strong>{line.code ?? 'Uncoded item'}</strong>
                      <span className="finance-cell-detail">
                        {line.description}
                        {!line.ready ? ' / configure tracked Item and UOM' : ''}
                      </span>
                    </td>
                    <td>{line.uom ?? '—'}</td>
                    <td className="numeric">{formatQuantity(line.orderedMicros)}</td>
                    <td className="numeric">{formatQuantity(line.receivedMicros)}</td>
                    <td className="numeric">{formatQuantity(remaining)}</td>
                    <td className="numeric">
                      {formatMoney(line.unitCostCents)}
                    </td>
                    <td>
                      <input
                        aria-label={`Quantity for ${line.description}`}
                        inputMode="decimal"
                        pattern="\d+(?:\.\d{1,6})?"
                        disabled={!checked}
                        value={selected[line.id] ?? ''}
                        onChange={(event) =>
                          setSelected((current) => ({
                            ...current,
                            [line.id]: event.target.value,
                          }))
                        }
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="finance-section">
        <div className="finance-field">
          <label htmlFor="stock-receipt-notes">Receiving notes</label>
          <textarea
            id="stock-receipt-notes"
            maxLength={2000}
            rows={3}
            placeholder="Condition, count method, or receiving context"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
        {error && (
          <p className="finance-form-error" role="alert">
            {error}
          </p>
        )}
        <div className="journal-submit-row">
          <p>Draft creation changes no stock or accounting balance.</p>
          <button
            type="submit"
            className="finance-primary-button"
            disabled={pending || !valid}
          >
            {pending ? 'Creating...' : 'Create receipt draft'}
          </button>
        </div>
      </section>
    </form>
  )
}
