import { z } from 'zod'

export type BillingSearchParams = Record<string, string | string[] | undefined>
export type BillingMilestonePagination = {
  previousHref: string | null
  nextHref: string | null
  firstHref: string
}

const pageSchema = z.string().regex(/^[1-9]\d{0,5}$/).transform(Number).pipe(z.number().int().max(100000))

export function parseBillingMilestonePage(value: unknown): number | null {
  if (value === undefined) return 1
  const parsed = pageSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function billingMilestonePageHref(
  projectId: string,
  searchParams: BillingSearchParams,
  page: number,
): string {
  const preserved = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === 'milestonePage' || value === undefined) continue
    for (const entry of Array.isArray(value) ? value : [value]) preserved.append(key, entry)
  }
  if (page !== 1) preserved.set('milestonePage', String(page))
  const suffix = preserved.toString()
  return `/projects/${projectId}/billing${suffix ? `?${suffix}` : ''}#project-billing-milestones-heading`
}

export function buildBillingMilestoneNavigation(
  projectId: string,
  searchParams: BillingSearchParams,
  result: { page: number; totalPages: number },
): BillingMilestonePagination {
  const href = (page: number) => billingMilestonePageHref(projectId, searchParams, page)
  const withinRange = result.page <= result.totalPages
  return {
    firstHref: href(1),
    previousHref: withinRange && result.page > 1 ? href(result.page - 1) : null,
    nextHref: withinRange && result.page < result.totalPages && result.page < 100000 ? href(result.page + 1) : null,
  }
}
