import {
  insertSurveyOnce,
  markSurveySent,
  sendTicketSurvey,
  STAMP_ATTEMPTS,
  SURVEY_LOOKUP_CHUNK,
  ticketsWithSurvey,
  type SurveyRow,
} from './claim-survey.ts'

const row: SurveyRow = {
  tenant_id: 'tenant-id',
  ticket_id: 'ticket-id',
  account_id: null,
  response_token_hash: 'hash',
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

type RestCall = { path: string; method: string; body: Record<string, unknown>; prefer: string }

function fakeRest(response: unknown) {
  const calls: RestCall[] = []
  const rest = (args: RestCall) => {
    calls.push(args)
    return Promise.resolve(response)
  }
  return { calls, rest }
}

Deno.test('the survey insert is pending, ignores a duplicate on the ticket and returns the new id', async () => {
  const { calls, rest } = fakeRest([{ id: 'survey-id' }])

  assert((await insertSurveyOnce(row, rest)) === 'survey-id', 'a created row claims the survey')
  assert(calls.length === 1, `calls: ${calls.length}`)
  assert(
    calls[0].path === 'cnps_surveys?on_conflict=tenant_id,ticket_id&select=id',
    `path: ${calls[0].path}`
  )
  assert(calls[0].method === 'POST', `method: ${calls[0].method}`)
  const prefer = calls[0].prefer.split(',')
  assert(prefer.includes('resolution=ignore-duplicates'), `prefer: ${calls[0].prefer}`)
  assert(prefer.includes('return=representation'), `prefer: ${calls[0].prefer}`)
  assert(calls[0].body.sent_at === null, 'the row is inserted pending')
  assert(calls[0].body.response_token_hash === 'hash', 'the token hash is sent')
})

Deno.test('no row back means another sender owns the survey', async () => {
  for (const response of [[], undefined]) {
    const { rest } = fakeRest(response)

    assert((await insertSurveyOnce(row, rest)) === null, `response: ${JSON.stringify(response)}`)
  }
})

Deno.test('sent_at is stamped on the tenant row only while it is unsent and holds the emailed hash', async () => {
  const { calls, rest } = fakeRest(undefined)

  await markSurveySent('survey-id', 'tenant-id', 'hash', '2026-11-24T00:00:00.000Z', rest)

  // A row another sender re-claimed has a new hash: the stamp matches nothing.
  assert(
    calls[0].path === 'cnps_surveys?id=eq.survey-id&tenant_id=eq.tenant-id&sent_at=is.null&response_token_hash=eq.hash',
    `path: ${calls[0].path}`
  )
  assert(calls[0].method === 'PATCH', `method: ${calls[0].method}`)
  assert(calls[0].body.sent_at === '2026-11-24T00:00:00.000Z', 'sent_at body')
})

function steps(
  surveyId: string | null,
  delivery: { ok: boolean; skipped?: boolean; error?: string },
  stampFailures = 0
) {
  const log: string[] = []
  let failuresLeft = stampFailures
  return {
    log,
    steps: {
      insertSurvey: () => {
        log.push('insert')
        return Promise.resolve(surveyId)
      },
      send: () => {
        log.push('send')
        return Promise.resolve(delivery)
      },
      markSent: (id: string) => {
        log.push(`mark:${id}`)
        if (failuresLeft > 0) {
          failuresLeft -= 1
          return Promise.reject(new Error('PostgREST PATCH 503'))
        }
        return Promise.resolve()
      },
      pause: () => Promise.resolve(),
    },
  }
}

Deno.test('a ticket whose survey another sender created gets no email', async () => {
  const { log, steps: s } = steps(null, { ok: true })

  const result = await sendTicketSurvey(row, s)

  assert(result.outcome === 'skipped_existing', `outcome: ${result.outcome}`)
  assert(log.join(',') === 'insert', `steps: ${log.join(',')}`)
})

Deno.test('a delivered survey is stamped sent after the send', async () => {
  const { log, steps: s } = steps('survey-id', { ok: true })

  const result = await sendTicketSurvey(row, s)

  assert(result.outcome === 'sent', `outcome: ${result.outcome}`)
  assert(log.join(',') === 'insert,send,mark:survey-id', `steps: ${log.join(',')}`)
})

Deno.test('a failed or skipped send leaves the survey pending for a retry', async () => {
  for (const delivery of [{ ok: false, error: 'Resend 500' }, { ok: true, skipped: true }]) {
    const { log, steps: s } = steps('survey-id', delivery)

    const result = await sendTicketSurvey(row, s)

    assert(result.outcome === 'not_delivered', `outcome: ${result.outcome}`)
    assert(log.join(',') === 'insert,send', `steps: ${log.join(',')}`)
  }
})

Deno.test('a stamp that fails is retried, and the email is never sent twice', async () => {
  const { log, steps: s } = steps('survey-id', { ok: true }, STAMP_ATTEMPTS - 1)

  const result = await sendTicketSurvey(row, s)

  assert(result.outcome === 'sent', `outcome: ${result.outcome}`)
  const marks = Array(STAMP_ATTEMPTS).fill('mark:survey-id')
  assert(log.join(',') === ['insert', 'send', ...marks].join(','), `steps: ${log.join(',')}`)
})

Deno.test('a stamp that keeps failing reports the error after the last attempt', async () => {
  const { log, steps: s } = steps('survey-id', { ok: true }, STAMP_ATTEMPTS)

  let error: unknown
  await sendTicketSurvey(row, s).catch((caught) => (error = caught))

  assert(error instanceof Error && error.message === 'PostgREST PATCH 503', `error: ${error}`)
  assert(log.filter((step) => step === 'send').length === 1, `steps: ${log.join(',')}`)
  assert(log.filter((step) => step.startsWith('mark:')).length === STAMP_ATTEMPTS, `steps: ${log.join(',')}`)
})

Deno.test('the survey lookup asks for at most SURVEY_LOOKUP_CHUNK ticket ids per request', async () => {
  const ids = Array.from({ length: SURVEY_LOOKUP_CHUNK * 2 + 50 }, (_, i) => `t${i}`)
  const queries: string[] = []
  const select = <T>(table: string, query: string): Promise<T[]> => {
    assert(table === 'cnps_surveys', `table: ${table}`)
    queries.push(query)
    const asked = query.match(/^ticket_id=in\.\(([^)]*)\)&select=ticket_id$/)?.[1].split(',') ?? []
    // Every 100th ticket already has a survey.
    return Promise.resolve(asked.filter((id) => Number(id.slice(1)) % 100 === 0).map((ticket_id) => ({ ticket_id }) as T))
  }

  const found = await ticketsWithSurvey(ids, select)

  assert(queries.length === 3, `requests: ${queries.length}`)
  const asked = queries.map((query) => query.match(/in\.\(([^)]*)\)/)?.[1].split(',') ?? [])
  assert(asked.map((chunk) => chunk.length).join(',') === '100,100,50', `chunk sizes: ${asked.map((c) => c.length)}`)
  assert(asked.flat().join(',') === ids.join(','), 'every id is asked once, in order')
  assert([...found].sort().join(',') === 't0,t100,t200', `found: ${[...found]}`)
})

Deno.test('no closed ticket means no survey lookup', async () => {
  let requests = 0
  const select = <T>(): Promise<T[]> => {
    requests += 1
    return Promise.resolve([])
  }

  assert((await ticketsWithSurvey([], select)).size === 0, 'nothing found')
  assert(requests === 0, `requests: ${requests}`)
})
