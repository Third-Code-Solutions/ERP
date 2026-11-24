import { buildSurveyEmail } from './survey-email.ts'

const base = {
  ticketNumber: 'WT-000007',
  recipientName: 'Ana',
  surveyUrl: 'https://erp.example.test/cnps/respond?t=abc',
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
