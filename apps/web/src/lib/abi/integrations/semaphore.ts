/**
 * Semaphore SMS client (REFACTOR.md §9 T09).
 *
 * Live mode: SEMAPHORE_API_KEY + SEMAPHORE_SENDER_NAME env vars.
 * Dev mode: console.warn — never sends.
 *
 * Use case: SLA breach alerts and client schedule confirmations only.
 * SMS is expensive in PH; treat it as the last-resort channel.
 */

interface SmsEnvelope {
  to: string // PH number, e.g. "+639171234567"
  body: string // max 160 chars or charged per segment
}

const isDev = () =>
  !process.env.SEMAPHORE_API_KEY || !process.env.SEMAPHORE_SENDER_NAME

export async function sendSms(env: SmsEnvelope): Promise<{ ok: boolean; is_dev_stub: boolean }> {
  if (isDev()) {
    // eslint-disable-next-line no-console
    console.warn('[sms:dev]', { to: env.to, body: env.body.slice(0, 80) })
    return { ok: true, is_dev_stub: true }
  }

  const res = await fetch('https://api.semaphore.co/api/v4/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      apikey: process.env.SEMAPHORE_API_KEY!,
      number: env.to,
      message: env.body,
      sendername: process.env.SEMAPHORE_SENDER_NAME!,
    }),
  })
  return { ok: res.ok, is_dev_stub: false }
}
