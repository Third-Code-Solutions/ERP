import { expect, test } from '@playwright/test'

type HarnessState = {
  tenantId: string
  userId: string
  projectId: string
  vendorId: string
  costCodeId: string
  purchaseOrderBomId: string
  purchaseOrderBomLineId: string
  foreignProjectId: string
  foreignBomId: string
  boms: Array<{
    id: string
    status: string
    locked_at: string | null
    total_cost_cents: number
    tcv_cents: number
  }>
  bomLines: Array<{
    id: string
    bom_id: string
    description: string
    quantity: number
    unit_cost_cents: number
    line_total_cents: number
  }>
  purchaseOrders: Array<{
    id: string
    po_number: string
    status: string
    project_id: string
    vendor_id: string | null
    subtotal_cents: number
    vat_cents: number
    withholding_tax_cents: number
    total_cents: number
  }>
  purchaseOrderLines: Array<{
    id: string
    po_id: string
    description: string
    quantity: number
    unit_cost_cents: number
    line_total_cents: number
    cost_code_id: string | null
    bom_line_item_id: string | null
  }>
  purchaseOrderCreateRequests: Array<{
    id: string
    idempotency_key: string
    state: string
    purchase_order_id: string | null
    result: {
      purchaseOrderId?: string
      tenantId?: string
      bomId?: string
      poNumber?: string
      status?: string
    } | null
  }>
  coreRequests: Array<{
    method: string
    path: string
    authorization: string
    requestId: string
    idempotencyKey: string
    body: string
  }>
  auditEntries: Array<{
    entity_type: string
    entity_id: string
    action: string
    diff: Record<string, unknown>
  }>
}

type HarnessSession = {
  accessToken: string
  expiresAt: number
  user: Record<string, unknown>
}

const AUTH_ORIGIN = 'http://127.0.0.1:4418'
const CORE_ORIGIN = 'http://127.0.0.1:4419'

async function readState(page: import('@playwright/test').Page) {
  const response = await page.request.get(`${AUTH_ORIGIN}/__harness__/state`)
  expect(response.ok()).toBe(true)
  return (await response.json()) as HarnessState
}

function localAccessToken(userId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({
      aud: 'authenticated',
      exp: 4_102_444_800,
      role: 'authenticated',
      sub: userId,
    })
  ).toString('base64url')
  return `${header}.${payload}.local-notification-signature`
}

test('creates a Purchase Order from an approved BOM through Core', async ({ page }) => {
  const sessionResponse = await page.request.get(`${AUTH_ORIGIN}/__harness__/session`)
  expect(sessionResponse.ok()).toBe(true)
  const session = (await sessionResponse.json()) as HarnessSession
  await page.context().addCookies([
    {
      name: 'sb-127-auth-token',
      value: `base64-${Buffer.from(
        JSON.stringify({
          access_token: session.accessToken,
          refresh_token: 'local-po-bom-refresh-token',
          expires_in: session.expiresAt - Math.floor(Date.now() / 1000),
          expires_at: session.expiresAt,
          token_type: 'bearer',
          user: session.user,
        })
      ).toString('base64')}`,
      url: 'http://127.0.0.1:4417',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
      expires: session.expiresAt,
    },
  ])

  const initial = await readState(page)
  expect(initial.purchaseOrderBomId).toMatch(/^[0-9a-f-]{36}$/i)
  expect(initial.purchaseOrderBomLineId).toMatch(/^[0-9a-f-]{36}$/i)
  const sourceBom = initial.boms.find((bom) => bom.id === initial.purchaseOrderBomId)
  const sourceLine = initial.bomLines.find(
    (line) => line.id === initial.purchaseOrderBomLineId
  )
  expect(sourceBom).toMatchObject({
    id: initial.purchaseOrderBomId,
    status: 'approved',
    total_cost_cents: 30_000,
  })
  expect(sourceLine).toMatchObject({
    bom_id: initial.purchaseOrderBomId,
    quantity: 3,
    unit_cost_cents: 10_000,
    line_total_cents: 30_000,
  })

  await page.goto(`/projects/${initial.projectId}/bom`, {
    waitUntil: 'domcontentloaded',
  })
  await expect(
    page.getByRole('heading', { name: 'Local document intake project' })
  ).toBeVisible()
  await page.getByRole('button', { name: 'Generate PO', exact: true }).click()

  const poForm = page.locator('form').filter({ hasText: 'Vendor (optional)' })
  await poForm.locator('select').selectOption(initial.vendorId)
  const actionResponsePromise = page.waitForResponse(
    (response) => Boolean(response.request().headers()['next-action']),
    { timeout: 20_000 }
  )
  await poForm.getByRole('button', { name: 'Create Purchase Order', exact: true }).click()
  expect((await actionResponsePromise).status()).toBe(200)

  await expect
    .poll(async () => (await readState(page)).purchaseOrders.length, {
      timeout: 20_000,
    })
    .toBe(1)
  const created = await readState(page)
  const createdPo = created.purchaseOrders[0]!
  const createdLine = created.purchaseOrderLines[0]!
  const createdRequest = created.purchaseOrderCreateRequests[0]!
  expect(createdPo).toMatchObject({
    po_number: 'PO-0001',
    status: 'draft',
    project_id: initial.projectId,
    vendor_id: initial.vendorId,
    subtotal_cents: 30_000,
    vat_cents: 3_600,
    withholding_tax_cents: 600,
    total_cents: 33_000,
  })
  expect(createdLine).toMatchObject({
    po_id: createdPo.id,
    description: 'Approved BOM concrete package',
    quantity: 3,
    unit_cost_cents: 10_000,
    line_total_cents: 30_000,
    bom_line_item_id: initial.purchaseOrderBomLineId,
  })
  expect(createdRequest).toMatchObject({
    state: 'succeeded',
    purchase_order_id: createdPo.id,
    result: {
      purchaseOrderId: createdPo.id,
      tenantId: initial.tenantId,
      bomId: initial.purchaseOrderBomId,
      poNumber: 'PO-0001',
      status: 'draft',
    },
  })
  const lockedBom = created.boms.find((bom) => bom.id === initial.purchaseOrderBomId)
  expect(lockedBom).toMatchObject({ status: 'locked', locked_at: expect.any(String) })

  const bomLockAudit = created.auditEntries.find(
    (entry) =>
      entry.entity_type === 'bom' &&
      entry.entity_id === initial.purchaseOrderBomId &&
      entry.action === 'lock'
  )
  expect(bomLockAudit?.diff).toMatchObject({ po_id: createdPo.id })
  const poCreateAudit = created.auditEntries.find(
    (entry) => entry.entity_type === 'purchase_order' && entry.action === 'create'
  )
  expect(poCreateAudit?.entity_id).toBe(createdPo.id)

  const bomRequests = created.coreRequests.filter(
    (request) => request.path === '/v1/procurement/purchase-orders/from-bom'
  )
  expect(bomRequests).toHaveLength(1)
  const firstRequest = bomRequests[0]!
  expect(firstRequest).toMatchObject({
    method: 'POST',
    authorization: `Bearer ${localAccessToken(initial.userId)}`,
  })
  expect(firstRequest.requestId).toMatch(/^[0-9a-f-]{36}$/i)
  expect(firstRequest.idempotencyKey).toMatch(/^[-0-9a-f]{36}$/i)
  const firstBody = JSON.parse(firstRequest.body) as Record<string, unknown>
  expect(firstBody).toMatchObject({
    bomId: initial.purchaseOrderBomId,
    projectId: initial.projectId,
    vendorId: initial.vendorId,
  })

  const replayResponse = await page.request.post(
    `${CORE_ORIGIN}/v1/procurement/purchase-orders/from-bom`,
    {
      headers: {
        authorization: `Bearer ${localAccessToken(initial.userId)}`,
        'content-type': 'application/json',
        'Idempotency-Key': firstRequest.idempotencyKey,
        'x-request-id': crypto.randomUUID(),
      },
      data: firstBody,
    }
  )
  expect(replayResponse.status()).toBe(201)
  const afterReplay = await readState(page)
  expect(afterReplay.purchaseOrders).toHaveLength(1)
  expect(afterReplay.purchaseOrderLines).toHaveLength(1)
  expect(afterReplay.purchaseOrderCreateRequests).toHaveLength(1)
  expect(
    afterReplay.auditEntries.filter(
      (entry) =>
        (entry.entity_type === 'purchase_order' && entry.action === 'create') ||
        (entry.entity_type === 'bom' && entry.action === 'lock')
    )
  ).toHaveLength(2)

  const foreignResponse = await page.request.post(
    `${CORE_ORIGIN}/v1/procurement/purchase-orders/from-bom`,
    {
      headers: {
        authorization: `Bearer ${localAccessToken(initial.userId)}`,
        'content-type': 'application/json',
        'Idempotency-Key': 'foreign-bom-po-tenant-isolation-1',
        'x-request-id': crypto.randomUUID(),
      },
      data: {
        bomId: initial.foreignBomId,
        projectId: initial.foreignProjectId,
        vendorId: null,
        deliveryDate: null,
        notes: null,
      },
    }
  )
  expect(foreignResponse.status()).toBe(404)
  const afterForeign = await readState(page)
  expect(afterForeign.purchaseOrders).toHaveLength(1)
  expect(afterForeign.purchaseOrderCreateRequests).toHaveLength(1)
  expect(
    afterForeign.coreRequests.filter(
      (request) => request.path === '/v1/procurement/purchase-orders/from-bom'
    )
  ).toHaveLength(3)
})
