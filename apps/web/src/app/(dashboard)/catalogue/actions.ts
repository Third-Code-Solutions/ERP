'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { catalogueItems, cataloguePrices } from '@third-code-erp/database/schema'
import { computeDiff, stampActorInTransaction, writeAuditLogInTransaction } from '@/lib/audit'
import {
  catalogueAccessDenial,
  type CatalogueDenied,
  type CatalogueResult,
} from '@/lib/catalogue/access'
import {
  CATALOGUE_LIMITS,
  CATALOGUE_TRADE_SLUGS,
  checkedOnProblem,
  cleanMultiLine,
  cleanSingleLine,
  parseSourceUrl,
  phpToCentavos,
  priceRangeProblem,
  type CataloguePriceRange,
} from '@/lib/catalogue/rules'
import { safeActionError } from '@/lib/safe-action-error'

// Admin writes of the master price catalogue (spec section 6). Each action
// checks ERP_CATALOGUE_ENABLED and catalogue.manage itself, scopes every
// statement by tenant_id and writes audit_log in the same transaction.

const NOT_FOUND: CatalogueDenied = { ok: false, status: 404, error: 'Catalogue item not found' }

function text(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

function invalid(error: z.ZodError): CatalogueDenied {
  const issue = error.errors[0]
  return {
    ok: false,
    status: 400,
    error: `${issue?.path.join('.') || 'form'}: ${issue?.message ?? 'invalid input'}`,
  }
}

const requiredLine = (max: number) =>
  z.string().transform(cleanSingleLine).pipe(z.string().min(1, 'required').max(max))
const optionalLine = (max: number) =>
  z
    .string()
    .transform(cleanSingleLine)
    .pipe(z.string().max(max))
    .transform((value) => value || null)

const editItemSchema = z.object({
  id: z.string().uuid(),
  name: requiredLine(CATALOGUE_LIMITS.name),
  specification: z
    .string()
    .transform(cleanMultiLine)
    .pipe(z.string().max(CATALOGUE_LIMITS.specification))
    .transform((value) => value || null),
  unit: requiredLine(CATALOGUE_LIMITS.unit),
  trade: z.enum(CATALOGUE_TRADE_SLUGS),
  is_active: z.boolean(),
})

/** Edit item: name, specification, unit, trade and active. */
export async function editCatalogueItem(
  formData: FormData,
): Promise<CatalogueResult<{ id: string }>> {
  const profile = await requireUserProfile()
  const denied = catalogueAccessDenial(profile.role, 'catalogue.manage')
  if (denied) return denied

  const parsed = editItemSchema.safeParse({
    id: text(formData, 'id'),
    name: text(formData, 'name'),
    specification: text(formData, 'specification'),
    unit: text(formData, 'unit'),
    trade: text(formData, 'trade'),
    is_active: ['on', 'true'].includes(text(formData, 'is_active')),
  })
  if (!parsed.success) return invalid(parsed.error)
  const { id, ...changes } = parsed.data
  const ownItem = and(eq(catalogueItems.id, id), eq(catalogueItems.tenant_id, profile.tenantId))

  try {
    const found = await db.transaction(async (tx) => {
      await stampActorInTransaction(tx, profile.user.id)
      const [before] = await tx
        .select({
          name: catalogueItems.name,
          specification: catalogueItems.specification,
          unit: catalogueItems.unit,
          trade: catalogueItems.trade,
          is_active: catalogueItems.is_active,
        })
        .from(catalogueItems)
        .where(ownItem)
        .limit(1)
        .for('update')
      if (!before) return false

      await tx
        .update(catalogueItems)
        .set({ ...changes, updated_at: new Date(), updated_by: profile.user.id })
        .where(ownItem)
      await writeAuditLogInTransaction(tx, {
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'catalogue_item',
        entityId: id,
        action: 'update',
        diff: computeDiff(before, changes),
      })
      return true
    })
    if (!found) return NOT_FOUND
  } catch (error) {
    console.error('[catalogue:editCatalogueItem] failed', error)
    return {
      ok: false,
      status: 500,
      error: safeActionError(error, 'Could not save the catalogue item.'),
    }
  }

  revalidatePath('/catalogue')
  return { ok: true, data: { id } }
}

const recordPriceSchema = z
  .object({
    item_id: z.string().uuid(),
    price_php: z.string().trim(),
    price_low_php: z.string().trim(),
    price_avg_php: z.string().trim(),
    price_high_php: z.string().trim(),
    region: z
      .string()
      .transform((value) => cleanSingleLine(value) || 'NCR')
      .pipe(z.string().max(CATALOGUE_LIMITS.region)),
    price_basis: optionalLine(CATALOGUE_LIMITS.priceBasis),
    source_name: optionalLine(CATALOGUE_LIMITS.sourceName),
    source_url: z.string().transform(cleanSingleLine),
    checked_on: z.string().trim(),
  })
  .superRefine((input, context) => {
    const dateProblem = checkedOnProblem(input.checked_on)
    if (dateProblem) context.addIssue({ code: 'custom', path: ['checked_on'], message: dateProblem })
    if (!input.source_name && !input.source_url) {
      context.addIssue({
        code: 'custom',
        path: ['source_name'],
        message: 'give a source name or a source URL',
      })
    }
  })

type PriceTexts = Pick<
  z.infer<typeof recordPriceSchema>,
  'price_php' | 'price_low_php' | 'price_avg_php' | 'price_high_php'
>

/** One price (low = avg = high) or all three; decimal strings to centavos. */
function readPriceRange(input: PriceTexts): CataloguePriceRange | string {
  const range = [input.price_low_php, input.price_avg_php, input.price_high_php]
  const texts = input.price_php ? [input.price_php, input.price_php, input.price_php] : range
  if (input.price_php && range.some(Boolean)) {
    return 'give either a single price or low, average and high, not both'
  }
  if (!texts.every(Boolean)) return 'give a single price, or all of low, average and high'

  const centavos: number[] = []
  for (const value of texts) {
    const parsed = phpToCentavos(value)
    if (!parsed.ok) return `"${value}" is not a valid peso amount`
    centavos.push(parsed.centavos)
  }
  const result = { low: centavos[0]!, avg: centavos[1]!, high: centavos[2]! }
  return priceRangeProblem(result) ?? result
}

/** Record price: appends a `manual` observation; nothing is ever overwritten. */
export async function recordCataloguePrice(
  formData: FormData,
): Promise<CatalogueResult<{ id: string }>> {
  const profile = await requireUserProfile()
  const denied = catalogueAccessDenial(profile.role, 'catalogue.manage')
  if (denied) return denied

  const parsed = recordPriceSchema.safeParse({
    item_id: text(formData, 'item_id'),
    price_php: text(formData, 'price_php'),
    price_low_php: text(formData, 'price_low_php'),
    price_avg_php: text(formData, 'price_avg_php'),
    price_high_php: text(formData, 'price_high_php'),
    region: text(formData, 'region'),
    price_basis: text(formData, 'price_basis'),
    source_name: text(formData, 'source_name'),
    source_url: text(formData, 'source_url'),
    checked_on: text(formData, 'checked_on'),
  })
  if (!parsed.success) return invalid(parsed.error)
  const input = parsed.data

  const range = readPriceRange(input)
  if (typeof range === 'string') return { ok: false, status: 400, error: `price: ${range}` }
  const sourceUrl = input.source_url ? parseSourceUrl(input.source_url) : null
  if (sourceUrl && !sourceUrl.ok) return { ok: false, status: 400, error: sourceUrl.error }

  const observation = {
    item_id: input.item_id,
    region: input.region,
    price_low_centavos: range.low,
    price_avg_centavos: range.avg,
    price_high_centavos: range.high,
    price_basis: input.price_basis,
    source_kind: 'manual',
    source_name: input.source_name,
    source_url: sourceUrl?.href ?? null,
    checked_on: input.checked_on,
  }

  let priceId: string | null
  try {
    priceId = await db.transaction(async (tx) => {
      await stampActorInTransaction(tx, profile.user.id)
      const [item] = await tx
        .select({ id: catalogueItems.id })
        .from(catalogueItems)
        .where(
          and(
            eq(catalogueItems.id, input.item_id),
            eq(catalogueItems.tenant_id, profile.tenantId),
          ),
        )
        .limit(1)
      if (!item) return null

      const [created] = await tx
        .insert(cataloguePrices)
        .values({ ...observation, tenant_id: profile.tenantId, created_by: profile.user.id })
        .returning({ id: cataloguePrices.id })
      if (!created) throw new Error('Catalogue price was not recorded')
      await writeAuditLogInTransaction(tx, {
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'catalogue_price',
        entityId: created.id,
        action: 'create',
        diff: computeDiff({}, observation),
      })
      return created.id
    })
  } catch (error) {
    console.error('[catalogue:recordCataloguePrice] failed', error)
    return {
      ok: false,
      status: 500,
      error: safeActionError(error, 'Could not record the price.'),
    }
  }
  if (!priceId) return NOT_FOUND

  revalidatePath('/catalogue')
  return { ok: true, data: { id: priceId } }
}
