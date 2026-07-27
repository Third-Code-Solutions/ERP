'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  quantityToMicros,
  receiptLineTotal,
} from '../../inventory/quantity'
import { saveSupplierBillDraft } from './actions'

export interface PayablePurchaseOrderOption {
  id: string
  number: string
  vendorName: string
  projectName: string
  remainingSubtotalCents: number
}

export interface PayableAccountOption {
  id: string
  label: string
}

export interface PayableEvidenceOption {
  purchaseOrderId: string
  poLineItemId: string
  description: string
  costCode: string
  inventoryTracked: boolean
  stockReceiptLineId: string | null
  receiptNumber: string | null
  uomCode: string | null
  remainingQuantityMicros: number | null
  unitCostCents: number | null
  remainingAmountCents: number
}

export interface PayableDraftValue {
  id: string
  purchaseOrderId: string
  vendorBillNumber: string
  billDate: string
  dueDate: string
  inputVatCents: number
  withholdingTaxCents: number
  notes: string
  lines: Array<{
    id: string
    poLineItemId: string
    stockReceiptLineId: string | null
    quantityMicros: number | null
    ledgerAccountId: string
    description: string
    amountCents: number
  }>
}

interface DraftLine {
  key: string
  poLineItemId: string
  stockReceiptLineId: string
  quantity: string
  ledgerAccountId: string
  description: string
  amount: string
}

function parseMoney(value: string): number | null {
  const normalized = value.replace(/,/g, '').trim()
  if (!normalized) return 0
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null
  const [whole, decimals = ''] = normalized.split('.')
  const cents = Number(whole) * 100 + Number(decimals.padEnd(2, '0'))
  return Number.isSafeInteger(cents) ? cents : null
}

function moneyInput(cents: number): string {
  return cents > 0 ? (cents / 100).toFixed(2) : ''
}

function formatPHP(cents: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100)
}

function blankLine(key: string): DraftLine {
  return {
    key,
    poLineItemId: '',
    stockReceiptLineId: '',
    quantity: '',
    ledgerAccountId: '',
    description: '',
    amount: '',
  }
}

function quantityInput(micros: number): string {
  const whole = Math.floor(micros / 1_000_000)
  const fraction = String(micros % 1_000_000)
    .padStart(6, '0')
    .replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : String(whole)
}

export function PayableForm({
  purchaseOrders,
  accounts,
  evidence,
  grniAccountId,
  defaultDate,
  defaultPurchaseOrderId,
  existing,
}: {
  purchaseOrders: PayablePurchaseOrderOption[]
  accounts: PayableAccountOption[]
  evidence: PayableEvidenceOption[]
  grniAccountId: string | null
  defaultDate: string
  defaultPurchaseOrderId?: string
  existing?: PayableDraftValue
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [purchaseOrderId, setPurchaseOrderId] = useState(
    existing?.purchaseOrderId ?? defaultPurchaseOrderId ?? ''
  )
  const [vendorBillNumber, setVendorBillNumber] = useState(
    existing?.vendorBillNumber ?? ''
  )
  const [billDate, setBillDate] = useState(existing?.billDate ?? defaultDate)
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? '')
  const [inputVat, setInputVat] = useState(
    moneyInput(existing?.inputVatCents ?? 0)
  )
  const [withholdingTax, setWithholdingTax] = useState(
    moneyInput(existing?.withholdingTaxCents ?? 0)
  )
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [lines, setLines] = useState<DraftLine[]>(
    existing?.lines.length
      ? existing.lines.map((line) => ({
          key: line.id,
          poLineItemId: line.poLineItemId,
          stockReceiptLineId: line.stockReceiptLineId ?? '',
          quantity:
            line.quantityMicros == null
              ? ''
              : quantityInput(line.quantityMicros),
          ledgerAccountId: line.ledgerAccountId,
          description: line.description,
          amount: moneyInput(line.amountCents),
        }))
      : [blankLine('allocation-1')]
  )

  const selectedPurchaseOrder = purchaseOrders.find(
    (purchaseOrder) => purchaseOrder.id === purchaseOrderId
  )
  const availableEvidence = evidence.filter(
    (option) => option.purchaseOrderId === purchaseOrderId
  )
  const totals = useMemo(() => {
    const parsedVat = parseMoney(inputVat)
    const parsedWithholding = parseMoney(withholdingTax)
    let valid = parsedVat !== null && parsedWithholding !== null
    let subtotal = 0
    for (const line of lines) {
      const amount = parseMoney(line.amount)
      if (amount === null || amount <= 0) {
        valid = false
      } else {
        subtotal += amount
      }
    }
    const payable =
      subtotal + (parsedVat ?? 0) - (parsedWithholding ?? 0)
    return {
      valid:
        valid &&
        Number.isSafeInteger(subtotal) &&
        Number.isSafeInteger(payable) &&
        payable > 0,
      subtotal,
      inputVat: parsedVat ?? 0,
      withholdingTax: parsedWithholding ?? 0,
      payable,
    }
  }, [inputVat, lines, withholdingTax])
  const withinPurchaseOrder =
    !!selectedPurchaseOrder &&
    totals.subtotal <= selectedPurchaseOrder.remainingSubtotalCents
  const evidenceValid = useMemo(() => {
    const used = new Map<string, { quantity: number; amount: number }>()
    for (const line of lines) {
      const option = evidence.find(
        (candidate) =>
          candidate.poLineItemId === line.poLineItemId &&
          (candidate.stockReceiptLineId ?? '') === line.stockReceiptLineId
      )
      if (!option || option.purchaseOrderId !== purchaseOrderId) return false
      if (!line.ledgerAccountId) return false
      if (
        option.inventoryTracked &&
        (!grniAccountId || line.ledgerAccountId !== grniAccountId)
      ) {
        return false
      }

      const key = `${option.poLineItemId}:${option.stockReceiptLineId ?? 'po'}`
      const current = used.get(key) ?? { quantity: 0, amount: 0 }
      const amount = parseMoney(line.amount)
      if (amount == null || amount <= 0) return false
      current.amount += amount

      if (option.inventoryTracked) {
        try {
          current.quantity += quantityToMicros(line.quantity)
        } catch {
          return false
        }
        if (
          option.remainingQuantityMicros == null ||
          current.quantity > option.remainingQuantityMicros
        ) {
          return false
        }
      }
      if (current.amount > option.remainingAmountCents) return false
      used.set(key, current)
    }
    return lines.length > 0
  }, [evidence, grniAccountId, lines, purchaseOrderId])

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line))
    )
  }

  function selectEvidence(key: string, value: string) {
    const option = availableEvidence.find((candidate) => {
      const candidateValue = candidate.stockReceiptLineId
        ? `receipt:${candidate.stockReceiptLineId}`
        : `po:${candidate.poLineItemId}`
      return candidateValue === value
    })
    if (!option) {
      updateLine(key, blankLine(key))
      return
    }
    updateLine(key, {
      poLineItemId: option.poLineItemId,
      stockReceiptLineId: option.stockReceiptLineId ?? '',
      quantity:
        option.inventoryTracked && option.remainingQuantityMicros
          ? quantityInput(option.remainingQuantityMicros)
          : '',
      ledgerAccountId: option.inventoryTracked ? grniAccountId ?? '' : '',
      description: option.description,
      amount: moneyInput(option.remainingAmountCents),
    })
  }

  function updateQuantity(key: string, value: string) {
    const line = lines.find((candidate) => candidate.key === key)
    const option = evidence.find(
      (candidate) =>
        candidate.poLineItemId === line?.poLineItemId &&
        (candidate.stockReceiptLineId ?? '') === line?.stockReceiptLineId
    )
    let amount = ''
    if (option?.unitCostCents != null) {
      try {
        amount = moneyInput(
          receiptLineTotal(quantityToMicros(value), option.unitCostCents)
        )
      } catch {
        amount = ''
      }
    }
    updateLine(key, { quantity: value, amount })
  }

  function submit() {
    setError(null)
    startTransition(async () => {
      const result = await saveSupplierBillDraft({
        billId: existing?.id,
        purchaseOrderId,
        vendorBillNumber,
        billDate,
        dueDate: dueDate || null,
        currency: 'PHP',
        subtotalCents: totals.subtotal,
        inputVatCents: totals.inputVat,
        withholdingTaxCents: totals.withholdingTax,
        notes: notes || null,
        lines: lines.map((line) => ({
          poLineItemId: line.poLineItemId,
          stockReceiptLineId: line.stockReceiptLineId || null,
          quantityMicros: line.stockReceiptLineId
            ? (() => {
                try {
                  return quantityToMicros(line.quantity)
                } catch {
                  return -1
                }
              })()
            : null,
          ledgerAccountId: line.ledgerAccountId,
          description: line.description,
          amountCents: parseMoney(line.amount) ?? -1,
        })),
      })
      if (!result.ok || !result.id) {
        setError(result.error ?? 'Could not save supplier bill draft')
        return
      }
      router.push(`/finance/payables/${result.id}`)
    })
  }

  return (
    <form
      className="payable-form"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">1 · Source document</p>
            <h2>Match the Purchase Order</h2>
          </div>
          <p>The Vendor and project come from the approved commitment.</p>
        </div>
        <div className="payable-header-fields">
          <div className="finance-field finance-field-grow">
            <label htmlFor="payable-po">Purchase Order</label>
            <select
              id="payable-po"
              required
              value={purchaseOrderId}
              onChange={(event) => {
                setPurchaseOrderId(event.target.value)
                setLines([blankLine(crypto.randomUUID())])
              }}
            >
              <option value="">Choose issued Purchase Order</option>
              {purchaseOrders.map((purchaseOrder) => (
                <option value={purchaseOrder.id} key={purchaseOrder.id}>
                  {purchaseOrder.number} · {purchaseOrder.vendorName} ·{' '}
                  {purchaseOrder.projectName}
                </option>
              ))}
            </select>
          </div>
          <div className="finance-field finance-field-grow">
            <label htmlFor="vendor-bill-number">Vendor bill number</label>
            <input
              id="vendor-bill-number"
              required
              maxLength={80}
              placeholder="SI-2027-00418"
              value={vendorBillNumber}
              onChange={(event) => setVendorBillNumber(event.target.value)}
            />
          </div>
          <div className="finance-field">
            <label htmlFor="supplier-bill-date">Bill date</label>
            <input
              id="supplier-bill-date"
              type="date"
              required
              value={billDate}
              onChange={(event) => setBillDate(event.target.value)}
            />
          </div>
          <div className="finance-field">
            <label htmlFor="supplier-due-date">Due date</label>
            <input
              id="supplier-due-date"
              type="date"
              min={billDate}
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </div>
        </div>
        {selectedPurchaseOrder && (
          <div className="payable-match-strip" aria-live="polite">
            <span>
              Vendor <strong>{selectedPurchaseOrder.vendorName}</strong>
            </span>
            <span>
              Project <strong>{selectedPurchaseOrder.projectName}</strong>
            </span>
            <span>
              Unbilled PO subtotal{' '}
              <strong>
                {formatPHP(selectedPurchaseOrder.remainingSubtotalCents)}
              </strong>
            </span>
          </div>
        )}
      </section>

      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">2 · Three-way evidence</p>
            <h2>Match PO, receipt, and bill lines</h2>
          </div>
          <p>
            Inventory clears GRNI only against active posted Stock Receipts.
            Service lines stay within their PO line.
          </p>
        </div>
        <div className="payable-lines">
          <div
            className="payable-line payable-line-heading"
            aria-hidden="true"
          >
            <span>PO / receipt evidence</span>
            <span>Quantity</span>
            <span>Ledger account</span>
            <span>Description</span>
            <span>Amount</span>
            <span />
          </div>
          {lines.map((line, index) => {
            const selected = evidence.find(
              (candidate) =>
                candidate.poLineItemId === line.poLineItemId &&
                (candidate.stockReceiptLineId ?? '') ===
                  line.stockReceiptLineId
            )
            const selectedValue = selected?.stockReceiptLineId
              ? `receipt:${selected.stockReceiptLineId}`
              : selected
                ? `po:${selected.poLineItemId}`
                : ''
            return (
            <div className="payable-line payable-match-line" key={line.key}>
              <label
                className="sr-only"
                htmlFor={`payable-evidence-${line.key}`}
              >
                Allocation {index + 1} PO and receipt evidence
              </label>
              <select
                id={`payable-evidence-${line.key}`}
                required
                value={selectedValue}
                onChange={(event) =>
                  selectEvidence(line.key, event.target.value)
                }
              >
                <option value="">Choose PO line evidence</option>
                {availableEvidence.map((option) => {
                  const value = option.stockReceiptLineId
                    ? `receipt:${option.stockReceiptLineId}`
                    : `po:${option.poLineItemId}`
                  return (
                    <option value={value} key={value}>
                      {option.costCode} · {option.description} ·{' '}
                      {option.inventoryTracked
                        ? `${option.receiptNumber ?? 'Posted receipt'} · ${quantityInput(
                            option.remainingQuantityMicros ?? 0
                          )} ${option.uomCode ?? ''} unmatched`
                        : `${formatPHP(option.remainingAmountCents)} unbilled`}
                    </option>
                  )
                })}
              </select>
              <label
                className="sr-only"
                htmlFor={`payable-quantity-${line.key}`}
              >
                Allocation {index + 1} matched quantity
              </label>
              <input
                id={`payable-quantity-${line.key}`}
                inputMode="decimal"
                placeholder={selected?.inventoryTracked ? '0' : 'N/A'}
                disabled={!selected?.inventoryTracked}
                required={selected?.inventoryTracked}
                value={line.quantity}
                onChange={(event) =>
                  updateQuantity(line.key, event.target.value)
                }
              />
              <label className="sr-only" htmlFor={`payable-account-${line.key}`}>
                Allocation {index + 1} account
              </label>
              <select
                id={`payable-account-${line.key}`}
                required
                disabled={!!line.stockReceiptLineId}
                value={line.ledgerAccountId}
                onChange={(event) =>
                  updateLine(line.key, {
                    ledgerAccountId: event.target.value,
                  })
                }
              >
                <option value="">Choose account</option>
                {accounts
                  .filter((account) =>
                    line.stockReceiptLineId
                      ? account.id === grniAccountId
                      : account.id !== grniAccountId
                  )
                  .map((account) => (
                  <option value={account.id} key={account.id}>
                    {account.label}
                  </option>
                  ))}
              </select>
              <label
                className="sr-only"
                htmlFor={`payable-description-${line.key}`}
              >
                Allocation {index + 1} description
              </label>
              <input
                id={`payable-description-${line.key}`}
                required
                maxLength={500}
                placeholder="Electrical rough-in materials"
                value={line.description}
                onChange={(event) =>
                  updateLine(line.key, { description: event.target.value })
                }
              />
              <label className="sr-only" htmlFor={`payable-amount-${line.key}`}>
                Allocation {index + 1} amount
              </label>
              <input
                id={`payable-amount-${line.key}`}
                required
                inputMode="decimal"
                placeholder="0.00"
                readOnly={!!line.stockReceiptLineId}
                value={line.amount}
                onChange={(event) =>
                  updateLine(line.key, { amount: event.target.value })
                }
              />
              <button
                type="button"
                className="journal-remove-line"
                disabled={lines.length === 1}
                aria-label={`Remove allocation ${index + 1}`}
                onClick={() =>
                  setLines((current) =>
                    current.filter((candidate) => candidate.key !== line.key)
                  )
                }
              >
                ×
              </button>
            </div>
            )
          })}
        </div>
        <button
          type="button"
          className="finance-text-button"
          onClick={() =>
            setLines((current) => [
              ...current,
              blankLine(crypto.randomUUID()),
            ])
          }
        >
          + Add allocation
        </button>
      </section>

      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">3 · Tax and review</p>
            <h2>Confirm the amount payable</h2>
          </div>
          <p>
            Subtotal plus Input VAT, less withholding tax. The journal is
            created only when Finance posts.
          </p>
        </div>
        <div className="payable-tax-fields">
          <div className="finance-field">
            <label htmlFor="payable-input-vat">Input VAT</label>
            <input
              id="payable-input-vat"
              inputMode="decimal"
              placeholder="0.00"
              value={inputVat}
              onChange={(event) => setInputVat(event.target.value)}
            />
          </div>
          <div className="finance-field">
            <label htmlFor="payable-withholding">Withholding tax</label>
            <input
              id="payable-withholding"
              inputMode="decimal"
              placeholder="0.00"
              value={withholdingTax}
              onChange={(event) => setWithholdingTax(event.target.value)}
            />
          </div>
          <div className="finance-field finance-field-grow">
            <label htmlFor="payable-notes">Internal note</label>
            <input
              id="payable-notes"
              maxLength={2_000}
              placeholder="Delivery receipt and inspection reference"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </div>
        <div className="payable-review">
          <div>
            <span>Allocated subtotal</span>
            <strong>{formatPHP(totals.subtotal)}</strong>
          </div>
          <div>
            <span>Input VAT</span>
            <strong>{formatPHP(totals.inputVat)}</strong>
          </div>
          <div>
            <span>Withholding tax</span>
            <strong>−{formatPHP(totals.withholdingTax)}</strong>
          </div>
          <div className="payable-review-total">
            <span>Amount payable</span>
            <strong>{formatPHP(Math.max(totals.payable, 0))}</strong>
          </div>
        </div>
        {!withinPurchaseOrder && selectedPurchaseOrder && (
          <p className="finance-form-error" role="alert">
            Allocations exceed the unbilled Purchase Order subtotal.
          </p>
        )}
        {!evidenceValid && purchaseOrderId && (
          <p className="finance-form-error" role="alert">
            Match every line to available PO evidence. Receipt quantities and
            values cannot exceed their unmatched balance.
          </p>
        )}
        {error && (
          <p className="finance-form-error" role="alert">
            {error}
          </p>
        )}
        <div className="journal-submit-row">
          <p>
            Save as draft. No liability or journal exists until controlled
            posting.
          </p>
          <button
            className="finance-primary-button"
            type="submit"
            disabled={
              pending ||
              !purchaseOrderId ||
              !vendorBillNumber.trim() ||
              !totals.valid ||
              !withinPurchaseOrder ||
              !evidenceValid
            }
          >
            {pending
              ? 'Saving draft…'
              : existing
                ? 'Save draft changes'
                : 'Review supplier bill'}
          </button>
        </div>
      </section>
    </form>
  )
}
