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

// The form shows this text as it is: every rule below carries a sentence the
// user can act on, never a field path.
function invalid(error: z.ZodError): CatalogueDenied {
  return {
    ok: false,
    status: 400,
    error: error.issues[0]?.message ?? 'Check the form and try again.',
  }
}

const UNKNOWN_ITEM = 'This item could not be identified. Reload the page and try again.'
const tooLong = (field: string, max: number) => `The ${field} must be ${max} characters or fewer.`
/** A shared rule's wording as a sentence: "low price must not..." reads "Low price must not...". */
const sentence = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}.`

const requiredLine = (field: string, max: number) =>
  z
    .string()
    .transform(cleanSingleLine)
    .pipe(z.string().min(1, `Enter a ${field}.`).max(max, tooLong(field, max)))
const optionalLine = (field: string, max: number) =>
  z
    .string()
    .transform(cleanSingleLine)
    .pipe(z.string().max(max, tooLong(field, max)))
    .transform((value) => value || null)

const editItemSchema = z.object({
  id: z.string().uuid(UNKNOWN_ITEM),
  name: requiredLine('name', CATALOGUE_LIMITS.name),
  specification: z
    .string()
    .transform(cleanMultiLine)
    .pipe(
      z
        .string()
        .max(CATALOGUE_LIMITS.specification, tooLong('specification', CATALOGUE_LIMITS.specification)),
    )
    .transform((value) => value || null),
  unit: requiredLine('unit', CATALOGUE_LIMITS.unit),
  trade: z.enum(CATALOGUE_TRADE_SLUGS, { message: 'Choose a trade from the list.' }),
  // Sent as "true" or "false" by the form's select: a missing or malformed
  // value is refused, never read as "inactive".
  is_active: z
    .enum(['true', 'false'], { message: 'Choose whether the item is active.' })
    .transform((value) => value === 'true'),
})

/**
 * Edit item: name, specification, unit, trade and active. A save that changes
 * nothing writes nothing, not even an audit entry; `changed` says which it was.
 */
export async function editCatalogueItem(
  formData: FormData,
): Promise<CatalogueResult<{ id: string; changed: boolean }>> {
  const profile = await requireUserProfile()
  const denied = catalogueAccessDenial(profile.role, 'catalogue.manage')
  if (denied) return denied

  const parsed = editItemSchema.safeParse({
    id: text(formData, 'id'),
    name: text(formData, 'name'),
    specification: text(formData, 'specification'),
    unit: text(formData, 'unit'),
    trade: text(formData, 'trade'),
    is_active: text(formData, 'is_active'),
  })
  if (!parsed.success) return invalid(parsed.error)
  const { id, ...changes } = parsed.data
  const ownItem = and(eq(catalogueItems.id, id), eq(catalogueItems.tenant_id, profile.tenantId))

  let outcome: 'missing' | 'unchanged' | 'saved'
  try {
    outcome = await db.transaction(async (tx) => {
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
      if (!before) return 'missing'
      const diff = computeDiff(before, changes)
      if (Object.keys(diff).length === 0) return 'unchanged'

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
        diff,
      })
      return 'saved'
    })
  } catch (error) {
    console.error('[catalogue:editCatalogueItem] failed', error)
    return {
      ok: false,
      status: 500,
      error: safeActionError(error, 'Could not save the catalogue item.'),
    }
  }
  if (outcome === 'missing') return NOT_FOUND
  if (outcome === 'unchanged') return { ok: true, data: { id, changed: false } }

  revalidatePath('/catalogue')
  revalidatePath(`/catalogue/${id}`)
  return { ok: true, data: { id, changed: true } }
}

const recordPriceSchema = z
  .object({
    item_id: z.string().uuid(UNKNOWN_ITEM),
    price_php: z.string().trim(),
    price_low_php: z.string().trim(),
    price_avg_php: z.string().trim(),
    price_high_php: z.string().trim(),
    region: z
      .string()
      .transform((value) => cleanSingleLine(value) || 'NCR')
      .pipe(z.string().max(CATALOGUE_LIMITS.region, tooLong('region', CATALOGUE_LIMITS.region))),
    price_basis: optionalLine('price basis', CATALOGUE_LIMITS.priceBasis),
    source_name: optionalLine('source name', CATALOGUE_LIMITS.sourceName),
    source_url: z.string().transform(cleanSingleLine),
    checked_on: z.string().trim(),
  })
  .superRefine((input, context) => {
    const dateProblem = checkedOnProblem(input.checked_on)
    if (dateProblem) {
      context.addIssue({ code: 'custom', path: ['checked_on'], message: sentence(dateProblem) })
    }
    if (!input.source_name && !input.source_url) {
      context.addIssue({
        code: 'custom',
        path: ['source_name'],
        message: 'Give a source name or a source URL.',
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
    return 'Give either a single price or low, average and high, not both.'
  }
  if (!texts.every(Boolean)) return 'Give a single price, or all of low, average and high.'

  const centavos: number[] = []
  for (const value of texts) {
    const parsed = phpToCentavos(value)
    if (!parsed.ok) return `"${value}" is not a valid peso amount.`
    centavos.push(parsed.centavos)
  }
  const result = { low: centavos[0]!, avg: centavos[1]!, high: centavos[2]! }
  const problem = priceRangeProblem(result)
  return problem ? sentence(problem) : result
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
  if (typeof range === 'string') return { ok: false, status: 400, error: range }
  const sourceUrl = input.source_url ? parseSourceUrl(input.source_url) : null
  if (sourceUrl && !sourceUrl.ok) {
    return { ok: false, status: 400, error: sentence(sourceUrl.error) }
  }

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
  revalidatePath(`/catalogue/${input.item_id}`)
  return { ok: true, data: { id: priceId } }
}
