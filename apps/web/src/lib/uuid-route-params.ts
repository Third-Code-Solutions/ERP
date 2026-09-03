import { notFound } from 'next/navigation'
import { z } from 'zod'

const uuidParamsSchema = z.record(z.string().uuid())

/**
 * Validate UUID-only page parameters before database or Core reads. Validate in
 * each page too: Next can render a page concurrently with its parent layout.
 * Public bearer-token routes have a separate contract and must not use this.
 */
export async function requireUuidRouteParams<T extends Record<string, string>>(
  params: Promise<T>,
): Promise<T> {
  const values = await params
  if (!uuidParamsSchema.safeParse(values).success) notFound()
  return values
}
