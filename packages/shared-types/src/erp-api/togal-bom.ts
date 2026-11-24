import { z } from 'zod'
import { boqQuantityFromNumber, MAX_BOM_LINE_ITEM_QUANTITY } from '../bom/quantity'

const togalBomCommitLineSchema = z
  .object({
    materialItemId: z.string().guid().nullable().optional(),
    code: z.string().trim().max(50).nullable().optional(),
    description: z.string().trim().min(1).max(2_000),
    unit: z.string().trim().max(20).nullable().optional(),
    // D-5: numeric(18,4). Up to 4 decimal places are accepted exactly; finer
    // values are rejected, never rounded into a priced BOM line.
    qty: z
      .number()
      .nonnegative()
      .refine((qty) => boqQuantityFromNumber(qty) !== null, {
        message: `qty must have at most 4 decimal places and not exceed ${MAX_BOM_LINE_ITEM_QUANTITY}`,
      }),
    unitCostCents: z.number().int().nonnegative().safe(),
    markupBps: z.number().int().nonnegative().max(2_147_483_647).optional(),
    vendorId: z.string().guid().nullable().optional(),
    sourceLabel: z.string().trim().max(255).nullable().optional(),
    notes: z.string().max(4_000).nullable().optional(),
  })
  .strict()

export const togalBomCommitCommandSchema = z
  .object({
    bomId: z.string().guid(),
    proposedLines: z.array(togalBomCommitLineSchema).min(1).max(500),
    markupBps: z.number().int().nonnegative().max(2_147_483_647).optional(),
  })
  .strict()

export const togalBomCommitResultSchema = z
  .object({
    ok: z.literal(true),
    linesCreated: z.number().int().nonnegative().max(500),
    bomId: z.string().guid(),
    tenantId: z.string().guid(),
    totalCostCents: z.number().int().nonnegative().safe(),
    tcvCents: z.number().int().nonnegative().safe(),
    gpCents: z.number().int().safe(),
    gpMarginBps: z.number().int().safe(),
  })
  .strict()

export type TogalBomCommitCommand = z.infer<
  typeof togalBomCommitCommandSchema
>
export type TogalBomCommitResult = z.infer<typeof togalBomCommitResultSchema>
