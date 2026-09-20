import { parsePesosToCents } from '@/lib/operations/scope-money'

/** Keep the existing peso/direct-cent inputs without accepting numeric prefixes. */
export function parseClaimAmount(form: FormData): number | undefined {
  if (form.getAll('amount_php').length > 1 || form.getAll('amount_cents').length > 1) return undefined
  const pesos = form.get('amount_php')
  if (pesos !== null && typeof pesos !== 'string') return undefined
  if (typeof pesos === 'string' && pesos.trim() !== '') {
    if (pesos.length > 128) return undefined
    const cents = parsePesosToCents(pesos)
    return cents !== undefined && cents > 0 ? cents : undefined
  }
  const direct = form.get('amount_cents')
  if (typeof direct !== 'string' || direct.length > 128 || !/^\d+$/.test(direct)) return undefined
  const cents = Number(BigInt(direct))
  return Number.isSafeInteger(cents) && cents > 0 ? cents : undefined
}
