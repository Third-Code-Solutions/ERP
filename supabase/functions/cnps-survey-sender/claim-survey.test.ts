import { insertSurveyOnce, type SurveyRow } from './claim-survey.ts'

const row: SurveyRow = {
  tenant_id: 'tenant-id',
  ticket_id: 'ticket-id',
  account_id: null,
  sent_at: '2026-11-24T00:00:00.000Z',
  response_token_hash: 'hash',
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

function fakeRest(response: unknown) {
  const calls: Array<{ path: string; method: string; body: unknown; prefer: string }> = []
  const rest = (args: { path: string; method: 'POST'; body: SurveyRow; prefer: string }) => {
    calls.push(args)
    return Promise.resolve(response)
  }
  return { calls, rest }
}

Deno.test('the survey insert ignores a duplicate on the ticket and returns the new row', async () => {
  const { calls, rest } = fakeRest([{ id: 'survey-id' }])

  assert((await insertSurveyOnce(row, rest)) === true, 'a created row claims the survey')
  assert(calls.length === 1, `calls: ${calls.length}`)
  assert(
    calls[0].path === 'cnps_surveys?on_conflict=tenant_id,ticket_id&select=id',
    `path: ${calls[0].path}`
  )
  assert(calls[0].method === 'POST', `method: ${calls[0].method}`)
  const prefer = String(calls[0].prefer).split(',')
  assert(prefer.includes('resolution=ignore-duplicates'), `prefer: ${calls[0].prefer}`)
  assert(prefer.includes('return=representation'), `prefer: ${calls[0].prefer}`)
  assert(calls[0].body === row, 'the row is sent unchanged')
})

Deno.test('no row back means another sender owns the survey', async () => {
  for (const response of [[], undefined]) {
    const { rest } = fakeRest(response)

    assert((await insertSurveyOnce(row, rest)) === false, `response: ${JSON.stringify(response)}`)
  }
})
