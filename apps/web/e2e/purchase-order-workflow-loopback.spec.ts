import { expect, test } from '@playwright/test'

type WorkflowAction =
  | 'submit_pm_approval'
  | 'pm_approve'
  | 'commercial_approve'
  | 'scm_issue'

type HarnessState = {
  tenantId: string
  userId: string
  projectId: string
  vendorId: string
  costCodeId: string
  workflowRecipientIds: {
    pm: string
    commercial: string
    procurement: string
  }
  purchaseOrders: Array<{
    id: string
    po_number: string
    status: string
    project_id: string
    vendor_id: string | null
    pm_approved_at: string | null
    commercial_approved_at: string | null
    scm_issued_at: string | null
    subtotal_cents: number
    vat_cents: number
    withholding_tax_cents: number
    total_cents: number
  }>
  purchaseOrderWorkflowRequests: Array<{
    id: string
    purchase_order_id: string
    action: WorkflowAction
    idempotency_key: string
    state: string
    result: {
      purchaseOrderId?: string
      tenantId?: string
      action?: WorkflowAction
      fromStatus?: string
      status?: string
    } | null
  }>
  notificationOutbox: Array<{
    id: string
    event_key: string
    event_type: string
    aggregate_type: string
    aggregate_id: string
    payload: {
      action?: WorkflowAction
      from_status?: string
      to_status?: string
      purchase_order_id?: string
    }
  }>
  notificationDeliveries: Array<{
    id: string
    outbox_id: string
    recipient_user_id: string
    recipient_email: string
    channel: string
    status: string
  }>
  supplierEmailDeliveries: Array<{
    id: string
    outbox_id: string
    purchase_order_id: string
    recipient_email: string
    supplier_name: string
    po_number: string
    total_cents: number
    status: string
  }>
  vendorConfirmationSessions: Array<{
    id: string
    purchase_order_id: string
    vendor_id: string
    source_workflow_request_id: string
    state: string
    expires_at: string
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

async function createDraftPo(page: import('@playwright/test').Page, initial: HarnessState) {
  await page.goto('/purchase-orders', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Purchase Orders' })).toBeVisible()
  await page.getByRole('button', { name: /^\+?\s*create po$/i }).click()
  await page.locator('select[name="project_id"]').selectOption(initial.projectId)
  await page.locator('select[name="vendor_id"]').selectOption(initial.vendorId)
  await page.getByPlaceholder('Description *').fill('Core workflow concrete package')
  await page.locator('table select').first().selectOption(initial.costCodeId)
  await page.locator('input[placeholder="0.00"]').fill('100.00')
  await page.locator('input[type="number"]').first().fill('3')

  const actionResponsePromise = page.waitForResponse(
    (response) => Boolean(response.request().headers()['next-action']),
    { timeout: 20_000 }
  )
  await page.getByRole('button', { name: /^create po$/i }).click()
  expect((await actionResponsePromise).status()).toBe(200)

  await expect
    .poll(async () => (await readState(page)).purchaseOrders.length, { timeout: 20_000 })
    .toBe(1)
  return (await readState(page)).purchaseOrders[0]!
}

test('drives Purchase Order approval and issuance through Core', async ({ page }) => {
  const sessionResponse = await page.request.get(`${AUTH_ORIGIN}/__harness__/session`)
  expect(sessionResponse.ok()).toBe(true)
  const session = (await sessionResponse.json()) as HarnessSession
  await page.context().addCookies([
    {
      name: 'sb-127-auth-token',
      value: `base64-${Buffer.from(
        JSON.stringify({
          access_token: session.accessToken,
          refresh_token: 'local-po-workflow-refresh-token',
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
  const createdPo = await createDraftPo(page, initial)
  expect(createdPo).toMatchObject({
    po_number: 'PO-0001',
    status: 'draft',
    subtotal_cents: 30_000,
    total_cents: 33_000,
  })

  await page.goto(`/purchase-orders/${createdPo.id}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'PO-0001' })).toBeVisible()

  const transitions: Array<{
    button: string
    action: WorkflowAction
    status: string
  }> = [
    {
      button: 'Submit for PM approval',
      action: 'submit_pm_approval',
      status: 'pending_pm_approval',
    },
    { button: 'Approve as PM', action: 'pm_approve', status: 'pending_commercial_approval' },
    {
      button: 'Approve as Commercial',
      action: 'commercial_approve',
      status: 'pending_scm_issuance',
    },
    { button: 'Issue PO to supplier', action: 'scm_issue', status: 'issued' },
  ]

  for (const transition of transitions) {
    const actionResponsePromise = page.waitForResponse(
      (response) => Boolean(response.request().headers()['next-action']),
      { timeout: 20_000 }
    )
    await page.getByRole('button', { name: transition.button, exact: true }).click()
    expect((await actionResponsePromise).status()).toBe(200)
    await expect
      .poll(async () => (await readState(page)).purchaseOrders[0]?.status, {
        timeout: 20_000,
      })
      .toBe(transition.status)

    if (transition.action === 'submit_pm_approval') {
      const afterSubmit = await readState(page)
      const submitRequest = afterSubmit.coreRequests.find(
        (request) =>
          request.path.endsWith('/workflow') &&
          (JSON.parse(request.body) as { action?: string }).action === transition.action
      )
      expect(submitRequest).toBeDefined()
      expect(submitRequest?.idempotencyKey).toMatch(/^[-0-9a-f]{36}$/i)

      const replayResponse = await page.request.post(
        `${CORE_ORIGIN}/v1/procurement/purchase-orders/${createdPo.id}/workflow`,
        {
          headers: {
            authorization: `Bearer ${localAccessToken(initial.userId)}`,
            'content-type': 'application/json',
            'Idempotency-Key': submitRequest!.idempotencyKey,
            'x-request-id': crypto.randomUUID(),
          },
          data: { action: transition.action },
        }
      )
      expect(replayResponse.status()).toBe(200)
      const afterReplay = await readState(page)
      expect(afterReplay.purchaseOrderWorkflowRequests).toHaveLength(1)
      expect(
        afterReplay.notificationOutbox.filter(
          (entry) => entry.event_type === 'purchase_order.workflow_changed'
        )
      ).toHaveLength(1)
      expect(
        afterReplay.auditEntries.filter(
          (entry) => entry.entity_type === 'purchase_order' && entry.action === 'status_change'
        )
      ).toHaveLength(1)
    }
  }

  const finalState = await readState(page)
  const finalPo = finalState.purchaseOrders[0]!
  expect(finalPo).toMatchObject({
    id: createdPo.id,
    status: 'issued',
    pm_approved_at: expect.any(String),
    commercial_approved_at: expect.any(String),
    scm_issued_at: expect.any(String),
  })

  expect(finalState.purchaseOrderWorkflowRequests).toHaveLength(4)
  expect(finalState.purchaseOrderWorkflowRequests.map((request) => request.action)).toEqual(
    transitions.map((transition) => transition.action)
  )
  for (const [index, request] of finalState.purchaseOrderWorkflowRequests.entries()) {
    expect(request).toMatchObject({
      purchase_order_id: createdPo.id,
      state: 'succeeded',
      result: {
        purchaseOrderId: createdPo.id,
        tenantId: initial.tenantId,
        action: transitions[index]!.action,
        status: transitions[index]!.status,
      },
    })
  }

  const workflowOutbox = finalState.notificationOutbox.filter(
    (entry) => entry.event_type === 'purchase_order.workflow_changed'
  )
  expect(workflowOutbox).toHaveLength(4)
  expect(workflowOutbox.map((entry) => entry.payload.action)).toEqual(
    transitions.map((transition) => transition.action)
  )
  expect(finalState.notificationOutbox.filter((entry) => entry.event_type === 'purchase_order.supplier_issued')).toHaveLength(1)

  expect(finalState.notificationDeliveries).toHaveLength(8)
  expect(finalState.notificationDeliveries.filter((delivery) => delivery.recipient_user_id === initial.workflowRecipientIds.pm)).toHaveLength(2)
  expect(finalState.notificationDeliveries.filter((delivery) => delivery.recipient_user_id === initial.workflowRecipientIds.commercial)).toHaveLength(4)
  expect(finalState.notificationDeliveries.filter((delivery) => delivery.recipient_user_id === initial.workflowRecipientIds.procurement)).toHaveLength(2)

  expect(finalState.supplierEmailDeliveries).toHaveLength(1)
  expect(finalState.supplierEmailDeliveries[0]).toMatchObject({
    purchase_order_id: createdPo.id,
    recipient_email: 'supplier@thirdcode.invalid',
    supplier_name: 'Local Core PO supplier',
    po_number: 'PO-0001',
    total_cents: 33_000,
  })
  expect(finalState.vendorConfirmationSessions).toHaveLength(1)
  expect(finalState.vendorConfirmationSessions[0]).toMatchObject({
    purchase_order_id: createdPo.id,
    vendor_id: initial.vendorId,
    state: 'pending',
  })

  const statusAudits = finalState.auditEntries.filter(
    (entry) => entry.entity_type === 'purchase_order' && entry.action === 'status_change'
  )
  expect(statusAudits).toHaveLength(4)
  expect(statusAudits.map((entry) => (entry.diff as { to?: string }).to)).toEqual(
    transitions.map((transition) => transition.status)
  )

  const workflowRequests = finalState.coreRequests.filter((request) => request.path.endsWith('/workflow'))
  expect(workflowRequests).toHaveLength(5)
  for (const request of workflowRequests) {
    expect(request.method).toBe('POST')
    expect(request.authorization).toBe(`Bearer ${localAccessToken(initial.userId)}`)
    expect(request.requestId).toMatch(/^[0-9a-f-]{36}$/i)
    expect(request.idempotencyKey.length).toBeGreaterThan(0)
    expect(JSON.parse(request.body)).toMatchObject({ action: expect.any(String) })
  }
})
