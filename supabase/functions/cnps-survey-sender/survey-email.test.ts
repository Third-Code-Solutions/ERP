import { buildSurveyEmail, SURVEY_LINK_REDACTED, surveyUrl, tenantNamesById } from './survey-email.ts'

const base = {
  ticketNumber: 'WT-000007',
  recipientName: 'Ana',
  surveyUrl: 'https://erp.example.test/portal/cnps/abc',
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

Deno.test('the survey email is signed by the issuing tenant, escaped in the HTML', () => {
  const email = buildSurveyEmail({ ...base, companyName: '  Northwind   <Builders> ' })

  assert(email.text.endsWith('Thank you,\nNorthwind <Builders>'), `text: ${email.text}`)
  assert(email.html.includes('Thank you,<br/>Northwind &lt;Builders&gt;</p>'), `html: ${email.html}`)
  assert(!email.html.includes('<Builders>'), 'html must not carry the raw name')
  assert(!/ABI OPS|Actuate/.test(email.text + email.html), 'no product or other company name')
})

Deno.test('the survey email falls back to a neutral name, never another company', () => {
  for (const companyName of [null, undefined, '   ']) {
    const email = buildSurveyEmail({ ...base, companyName })

    assert(email.text.endsWith('Thank you,\nYour contractor'), `text: ${email.text}`)
    assert(!/ABI OPS|Actuate/.test(email.text + email.html), 'no product or other company name')
  }
})

Deno.test('the stored text never holds the survey link, which only the email carries', () => {
  const token = 'tok_secret-9'
  const email = buildSurveyEmail({ ...base, surveyUrl: surveyUrl('https://erp.example.test', token), companyName: 'Northwind' })

  assert(email.text.includes(`/portal/cnps/${token}`), `text: ${email.text}`)
  assert(email.html.includes(`/portal/cnps/${token}`), `html: ${email.html}`)
  assert(!email.storedText.includes(token), `stored: ${email.storedText}`)
  assert(!email.storedText.includes('/portal/cnps/'), `stored: ${email.storedText}`)
  assert(email.storedText === email.text.replace(surveyUrl('https://erp.example.test', token), SURVEY_LINK_REDACTED), `stored: ${email.storedText}`)
})

Deno.test('the survey link opens the web portal survey route', () => {
  assert(
    surveyUrl('https://erp.example.test/', 'tok_-9') === 'https://erp.example.test/portal/cnps/tok_-9',
    surveyUrl('https://erp.example.test/', 'tok_-9')
  )
  assert(
    surveyUrl('https://erp.example.test', 'tok_-9') === 'https://erp.example.test/portal/cnps/tok_-9',
    'no trailing slash'
  )
})

Deno.test('each survey is signed by the tenant that closed its own ticket', async () => {
  const queries: string[] = []
  const select = <T>(table: string, query: string): Promise<T[]> => {
    queries.push(`${table}?${query}`)
    return Promise.resolve([
      { id: 'tenant-a', name: 'Northwind Builders' },
      { id: 'tenant-b', name: 'Southgate Fitouts' },
    ] as T[])
  }
  const tickets = [
    { tenant_id: 'tenant-a', ticket_number: 'WT-1' },
    { tenant_id: 'tenant-b', ticket_number: 'WT-2' },
    { tenant_id: 'tenant-a', ticket_number: 'WT-3' },
  ]

  const names = await tenantNamesById(tickets.map((t) => t.tenant_id), select)
  const signatures = tickets.map((t) =>
    buildSurveyEmail({ ...base, ticketNumber: t.ticket_number, companyName: names.get(t.tenant_id) }).text.split('\n').at(-1)
  )

  assert(queries.length === 1, `one tenant query per run, got ${queries.length}`)
  assert(queries[0] === 'tenants?id=in.(tenant-a,tenant-b)&select=id,name', queries[0] ?? '')
  assert(
    JSON.stringify(signatures) === JSON.stringify(['Northwind Builders', 'Southgate Fitouts', 'Northwind Builders']),
    JSON.stringify(signatures)
  )
})
