import { z } from 'zod'

const togalBomCommitLineSchema = z
  .object({
    materialItemId: z.string().uuid().nullable().optional(),
    code: z.string().trim().max(50).nullable().optional(),
    description: z.string().trim().min(1).max(2_000),
    unit: z.string().trim().max(20).nullable().optional(),
    // `bom_line_items.quantity` is an integer. Decimal source evidence must
    // remain unresolved until the dedicated precision migration is approved;
    // it must never be silently rounded into a priced BOM line.
    qty: z.number().int().nonnegative().max(2_147_483_647),
    unitCostCents: z.number().int().nonnegative().safe(),
    markupBps: z.number().int().nonnegative().max(2_147_483_647).optional(),
    vendorId: z.string().uuid().nullable().optional(),
    sourceLabel: z.string().trim().max(255).nullable().optional(),
    notes: z.string().max(4_000).nullable().optional(),
  })
  .strict()

export const togalBomCommitCommandSchema = z
  .object({
    bomId: z.string().uuid(),
    proposedLines: z.array(togalBomCommitLineSchema).min(1).max(500),
    markupBps: z.number().int().nonnegative().max(2_147_483_647).optional(),
  })
  .strict()

export const togalBomCommitResultSchema = z
  .object({
    ok: z.literal(true),
    linesCreated: z.number().int().nonnegative().max(500),
    bomId: z.string().uuid(),
    tenantId: z.string().uuid(),
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
