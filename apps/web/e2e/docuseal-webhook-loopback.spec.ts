import { expect, test } from '@playwright/test'

const AUTH_ORIGIN = 'http://127.0.0.1:4418'
const WEB_ORIGIN = 'http://127.0.0.1:4417'
const PROVIDER_SECRET = 'local-docuseal-provider-secret'

interface HarnessState {
  tenantId: string
  boms: Array<{
    id: string
    status: string
    locked_at?: string | null
  }>
  documents: Array<{
    id: string
    file_name: string
    storage_path: string
    document_type: string
    size_bytes: number
  }>
  notifications: Array<{ subject: string }>
  portalTokens: Array<{
    bom_id: string
    docuseal_submission_id: string
    used_at: string | null
  }>
  foreignBom: {
    id: string
    tenant_id: string
    status: string
    locked_at: string | null
  } | null
  coreRequests: Array<{
    method: string
    path: string
    authorization: string
    requestId: string
    internalTokenPresent: boolean
    body: string
  }>
  auditEntries: Array<Record<string, unknown>>
}

test('proves Core DocuSeal webhook locking, replay, and tenant isolation', async ({
  page,
}) => {
  test.setTimeout(120_000)

  const payload = {
    event: 'submission.completed',
    submission_id: '',
    documents: [
      {
        url: 'https://sign.example.test/signed-bom.pdf',
        name: 'signed-bom.pdf',
      },
    ],
  }

  const stateBeforeResponse = await page.request.get(
    `${AUTH_ORIGIN}/__harness__/state`
  )
  expect(stateBeforeResponse.ok()).toBe(true)
  const before = (await stateBeforeResponse.json()) as HarnessState
  const bomId = before.boms[0]?.id
  const primaryToken = before.portalTokens.find(
    (token) => token.bom_id === bomId && token.used_at === null
  )
  const foreignBomId = before.foreignBom?.id
  const foreignToken = before.portalTokens.find(
    (token) => token.bom_id === foreignBomId && token.used_at === null
  )
  expect(bomId).toBeTruthy()
  expect(primaryToken?.docuseal_submission_id).toBeTruthy()
  expect(foreignBomId).toBeTruthy()
  expect(foreignToken?.docuseal_submission_id).toBeTruthy()

  const unauthenticated = await page.request.post(
    `${WEB_ORIGIN}/api/webhooks/docuseal`,
    {
      data: {
        ...payload,
        submission_id: primaryToken?.docuseal_submission_id,
      },
      headers: { 'x-docuseal-secret': 'wrong-secret' },
    }
  )
  expect(unauthenticated.status()).toBe(401)

  const command = {
    ...payload,
    submission_id: primaryToken?.docuseal_submission_id,
  }
  const first = await page.request.post(`${WEB_ORIGIN}/api/webhooks/docuseal`, {
    data: command,
    headers: { 'x-docuseal-secret': PROVIDER_SECRET },
  })
  expect(first.status()).toBe(200)
  await expect(first.json()).resolves.toEqual({
    received: true,
    handled: true,
    duplicate: false,
  })

  const replay = await page.request.post(`${WEB_ORIGIN}/api/webhooks/docuseal`, {
    data: command,
    headers: { 'x-docuseal-secret': PROVIDER_SECRET },
  })
  expect(replay.status()).toBe(200)
  await expect(replay.json()).resolves.toEqual({
    received: true,
    handled: true,
    duplicate: true,
  })

  const foreign = await page.request.post(
    `${WEB_ORIGIN}/api/webhooks/docuseal`,
    {
      data: {
        ...payload,
        submission_id: foreignToken?.docuseal_submission_id,
      },
      headers: { 'x-docuseal-secret': PROVIDER_SECRET },
    }
  )
  expect(foreign.status()).toBe(200)
  await expect(foreign.json()).resolves.toEqual({
    received: true,
    handled: false,
    duplicate: false,
  })

  await expect
    .poll(
      async () => {
        const response = await page.request.get(`${AUTH_ORIGIN}/__harness__/state`)
        if (!response.ok()) return false
        const candidate = (await response.json()) as HarnessState
        return (
          candidate.documents.length === 1 &&
          candidate.notifications.length === 4 &&
          candidate.auditEntries.filter((entry) => entry.entity_type === 'bom')
            .length === 1 &&
          candidate.coreRequests.filter(
            (request) =>
              request.path === '/v1/webhooks/docuseal' &&
              request.method === 'POST'
          ).length === 3
        )
      },
      { timeout: 30_000 }
    )
    .toBe(true)

  const stateResponse = await page.request.get(`${AUTH_ORIGIN}/__harness__/state`)
  expect(stateResponse.ok()).toBe(true)
  const state = (await stateResponse.json()) as HarnessState
  expect(state.boms).toHaveLength(1)
  expect(state.boms[0]).toMatchObject({ id: bomId, status: 'locked' })
  expect(state.boms[0]?.locked_at).toBeTruthy()
  expect(state.foreignBom).toMatchObject({
    id: foreignBomId,
    status: 'draft',
    locked_at: null,
  })
  expect(state.documents).toEqual([
    expect.objectContaining({
      file_name: 'signed-bom.pdf',
      storage_path: expect.stringMatching(
        new RegExp(
          `^${state.tenantId}/[0-9a-f-]{36}/esign/docuseal/[0-9a-f]{64}\\.pdf$`
        )
      ),
      document_type: 'contract',
      size_bytes: Buffer.byteLength(
        '%PDF-1.7\nloopback-signed-bom',
        'ascii'
      ),
    }),
  ])
  expect(state.portalTokens).toHaveLength(2)
  expect(
    state.portalTokens.find((token) => token.bom_id === bomId)
  ).toMatchObject({
    docuseal_submission_id: primaryToken?.docuseal_submission_id,
    used_at: expect.any(String),
  })
  expect(
    state.portalTokens.find((token) => token.bom_id === foreignBomId)
  ).toMatchObject({
    docuseal_submission_id: foreignToken?.docuseal_submission_id,
    used_at: null,
  })

  const webhookRequests = state.coreRequests.filter(
    (request) => request.path === '/v1/webhooks/docuseal'
  )
  expect(webhookRequests).toHaveLength(3)
  expect(webhookRequests.every((request) => request.authorization === '')).toBe(true)
  expect(webhookRequests.every((request) => request.internalTokenPresent)).toBe(true)
  expect(webhookRequests.every((request) => /^[0-9a-f-]{36}$/.test(request.requestId))).toBe(true)
  const postedCommands = webhookRequests.map(
    (request) => JSON.parse(request.body) as Record<string, unknown>
  )
  expect(postedCommands[0]).toMatchObject({
    event: 'submission.completed',
    submissionId: primaryToken?.docuseal_submission_id,
  })
  expect(postedCommands[1]).toEqual(postedCommands[0])
  expect(postedCommands[2]).toMatchObject({
    event: 'submission.completed',
    submissionId: foreignToken?.docuseal_submission_id,
  })

  const bomAudits = state.auditEntries.filter(
    (entry) => entry.entity_type === 'bom'
  )
  expect(bomAudits).toHaveLength(1)
  expect(bomAudits[0]).toMatchObject({
    action: 'lock',
    entity_id: bomId,
  })
  expect((bomAudits[0]?.diff as Record<string, unknown>)?.source).toBe(
    'docuseal_webhook_nest_authority'
  )
})
