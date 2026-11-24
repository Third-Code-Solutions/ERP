/**
 * What happened to the email that sends an issued Purchase Order to the
 * supplier, in words a buyer can act on. Pure, so the action, the PO page
 * banner and the tests share one vocabulary.
 */

export type SupplierEmailOutcome =
  | 'sent'
  | 'no_vendor'
  | 'no_email'
  | 'provider_error'

/** Statuses after issuance: the supplier is expected to have the PO. */
export const SUPPLIER_EMAIL_PO_STATUSES = [
  'issued',
  'partial_delivered',
  'fully_delivered',
] as const

export function isSupplierEmailPoStatus(status: string): boolean {
  return (SUPPLIER_EMAIL_PO_STATUSES as readonly string[]).includes(status)
}

/** Whether the PO has a supplier with an address to write to. */
export function supplierEmailTarget(input: {
  vendorId: string | null
  supplierEmail: string | null
}): 'ready' | 'no_vendor' | 'no_email' {
  if (!input.vendorId) return 'no_vendor'
  if (!input.supplierEmail?.trim()) return 'no_email'
  return 'ready'
}

export function supplierEmailOutcomeMessage(
  outcome: SupplierEmailOutcome
): string {
  switch (outcome) {
    case 'sent':
      return 'The supplier email was sent.'
    case 'no_vendor':
      return 'No supplier is set on this Purchase Order, so no email was sent.'
    case 'no_email':
      return 'The supplier has no email address on file, so no email was sent. Add one under Vendors, then use Resend supplier email, or send the Purchase Order by hand.'
    case 'provider_error':
      return 'The supplier email could not be sent. The Purchase Order is issued. Use Resend supplier email to try again.'
  }
}

/**
 * Banner for an issued PO whose supplier email is not on record as sent; null
 * when it was sent or the PO is not issued. The reason is read from the PO's
 * supplier today, so it stays right after the buyer fixes the vendor.
 */
export function supplierEmailNotice(input: {
  status: string
  supplierEmailSentAt: Date | string | null
  vendorId: string | null
  supplierEmail: string | null
}): { outcome: Exclude<SupplierEmailOutcome, 'sent'>; message: string } | null {
  if (!isSupplierEmailPoStatus(input.status)) return null
  if (input.supplierEmailSentAt) return null
  const target = supplierEmailTarget(input)
  const outcome = target === 'ready' ? 'provider_error' : target
  return {
    outcome,
    message:
      outcome === 'provider_error'
        ? 'No supplier email is recorded as sent for this Purchase Order. Use Resend supplier email to send it.'
        : supplierEmailOutcomeMessage(outcome),
  }
}

interface EmailLine {
  code: string | null
  description: string
  unit: string | null
  quantityMicros: number
  unitCostCents: number
  lineTotalCents: number
}

function formatPhp(cents: number): string {
  return (cents / 100).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatQuantity(micros: number): string {
  const whole = Math.trunc(micros / 1_000_000)
  const fraction = String(micros % 1_000_000)
    .padStart(6, '0')
    .replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : String(whole)
}

/** One text line per PO line, newline separated, for the email template. */
export function formatPoEmailLines(lines: readonly EmailLine[]): string {
  return lines
    .map((line, index) => {
      const item = line.code ? `${line.code} ${line.description}` : line.description
      const unit = line.unit ? ` ${line.unit}` : ''
      return `${index + 1}. ${item}: ${formatQuantity(line.quantityMicros)}${unit} at PHP ${formatPhp(line.unitCostCents)} = PHP ${formatPhp(line.lineTotalCents)}`
    })
    .join('\n')
}
