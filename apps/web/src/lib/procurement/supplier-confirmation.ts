import { z } from 'zod'
import { manilaToday } from '@/lib/manila-date'

/**
 * Procurement records that a supplier confirmed an issued Purchase Order (by
 * email, phone or in person). It is a record, not a workflow step: the PO
 * status does not change.
 */

export const SUPPLIER_CONFIRMATION_CHANNELS = [
  'email',
  'phone',
  'in_person',
  'other',
] as const

export type SupplierConfirmationChannel =
  (typeof SUPPLIER_CONFIRMATION_CHANNELS)[number]

export const SUPPLIER_CONFIRMATION_CHANNEL_LABELS: Record<
  SupplierConfirmationChannel,
  string
> = {
  email: 'Email',
  phone: 'Phone call',
  in_person: 'In person',
  other: 'Other',
}

export const supplierConfirmationInputSchema = z.object({
  poId: z.string().uuid('Purchase Order not found.'),
  channel: z.enum(SUPPLIER_CONFIRMATION_CHANNELS, {
    errorMap: () => ({ message: 'Choose how the supplier confirmed.' }),
  }),
  confirmedByName: z
    .string()
    .trim()
    .min(1, 'Enter who at the supplier confirmed.')
    .max(255, 'The name is too long.'),
  confirmedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date the supplier confirmed.'),
  note: z.string().trim().max(2000, 'The note is too long.').optional(),
})

export type SupplierConfirmationInput = z.input<
  typeof supplierConfirmationInputSchema
>

/** Noon in Manila on the given calendar date; null when it is not a real date. */
export function supplierConfirmedAt(confirmedOn: string): Date | null {
  const instant = new Date(`${confirmedOn}T12:00:00+08:00`)
  if (Number.isNaN(instant.getTime())) return null
  // Date rolls 2026-02-31 into March; only a date that reads back the same is real.
  return manilaToday(instant) === confirmedOn ? instant : null
}
