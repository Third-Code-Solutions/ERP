import { CRON_SECRET_HEADER, rejectUnlessCronCaller } from './cron-auth.ts'

function request(secret?: string): Request {
  const headers = new Headers()
  if (secret !== undefined) headers.set(CRON_SECRET_HEADER, secret)
  return new Request('https://example.test/fn', { method: 'POST', headers })
}

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`expected ${expected}, got ${actual}`)
}

Deno.test('refuses every call when CRON_SECRET is not configured', () => {
  assertEquals(rejectUnlessCronCaller(request('anything'), '')?.status, 503)
})

Deno.test('refuses a missing or wrong secret', () => {
  assertEquals(rejectUnlessCronCaller(request(), 's3cret-value')?.status, 401)
  assertEquals(rejectUnlessCronCaller(request('s3cret-valuX'), 's3cret-value')?.status, 401)
  assertEquals(rejectUnlessCronCaller(request('s3cret'), 's3cret-value')?.status, 401)
})

Deno.test('lets the caller with the exact secret through', () => {
  assertEquals(rejectUnlessCronCaller(request('s3cret-value'), 's3cret-value'), null)
})
