import fs from 'node:fs'
import path from 'node:path'

import test from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

import { verifyWo12Contract } from './verify-wo-12-contract.mjs'

const ROOT = process.cwd()
const FILES = {
  authorization: 'packages/shared-types/src/authorization.ts',
  action: 'apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/actions.ts',
  actionTest: 'apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/actions.test.ts',
  page: 'apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/inspection/page.tsx',
  inspectionForm: 'apps/web/src/components/proposal/inspection-form.tsx',
  rfiForm: 'apps/web/src/components/proposal/rfi-form.tsx',
  service: 'apps/web/src/server/crm/site-inspection-workflow-service.ts',
  serviceTest: 'apps/web/src/server/crm/site-inspection-workflow-service.test.ts',
}

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8')
}

function replaceOnce(source, before, after, label) {
  const next = source.replace(before, after)
  assert.notEqual(next, source, `mutation fixture did not match: ${label}`)
  return next
}

function mutation(name, file, mutate, expected) {
  test(`rejects mutation: ${name}`, () => {
    const source = read(file)
    const changed = mutate(source)
    assert.notEqual(changed, source, `mutation did not change ${file}`)
    assert.throws(() => verifyWo12Contract({ root: ROOT, overrides: { [file]: changed } }), expected)
  })
}

test('accepts the authoritative WO-12 mounted/service contract', () => {
  assert.deepEqual(verifyWo12Contract({ root: ROOT }), {
    roles: 13,
    mutationRoles: 3,
    deniedRoles: 10,
    mountedActions: 2,
    mountedForms: 2,
    serviceCommands: 2,
  })
})

test('accepts benign TypeScript-printer formatting', () => {
  const overrides = {}
  for (const file of [FILES.authorization, FILES.action, FILES.page, FILES.inspectionForm, FILES.rfiForm, FILES.service]) {
    const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, kind)
    overrides[file] = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(ast)
  }
  assert.equal(verifyWo12Contract({ root: ROOT, overrides }).serviceCommands, 2)
})

test('accepts aliased service import and exported-arrow mounted actions', () => {
  let action = read(FILES.action)
  action = replaceOnce(
    action,
    'siteInspectionWorkflowService,',
    'siteInspectionWorkflowService as workflowService,',
    'service import alias',
  ).replaceAll('siteInspectionWorkflowService.submitInspection', 'workflowService.submitInspection')
    .replaceAll('siteInspectionWorkflowService.createRfi', 'workflowService.createRfi')
  action = replaceOnce(
    action,
    'export async function submitInspection(opportunityId: string, formData: FormData) {',
    'export const submitInspection = async (opportunityId: string, formData: FormData) => {',
    'inspection exported arrow',
  )
  action = replaceOnce(
    action,
    `export async function addInspectionRfi(
  opportunityId: string,
  inspectionId: string,
  formData: FormData,
) {`,
    `export const addInspectionRfi = async (
  opportunityId: string,
  inspectionId: string,
  formData: FormData,
) => {`,
    'RFI exported arrow',
  )
  assert.equal(verifyWo12Contract({ root: ROOT, overrides: { [FILES.action]: action } }).mountedActions, 2)
})

mutation('adds a fourth mutation role', FILES.authorization,
  (s) => replaceOnce(s, "'site_inspection.submit': ['owner', 'admin', 'commercial']", "'site_inspection.submit': ['owner', 'admin', 'commercial', 'sales']", 'role expansion'),
  /mutation roles/)

mutation('bypasses the page capability selector', FILES.page,
  (s) => replaceOnce(s, "can(profile.role, 'site_inspection.submit')", 'true', 'page capability'),
  /page must use central capability/)

mutation('mounts a second inspection control', FILES.page,
  (s) => {
    const next = s.replace(/<InspectionForm[\s\S]*?\/>/, (match) => `<>{${''}}${match}${match}</>`)
      .replace('<>{}', '<>')
    assert.notEqual(next, s, 'duplicate form fixture missing')
    return next
  },
  /exactly one inspection control/)

mutation('removes page tenant selection', FILES.page,
  (s) => replaceOnce(s, 'eq(siteInspections.tenant_id, profile.tenantId)', 'sql`true`', 'tenant predicate'),
  /inspection read must be tenant selected/)

mutation('removes an accepted action field', FILES.action,
  (s) => replaceOnce(s, "  'weather',\n", '', 'remove field'),
  /inspection action fields/)

mutation('adds an unknown action field', FILES.action,
  (s) => replaceOnce(s, "  'observations',\n", "  'observations',\n  'unexpected',\n", 'unknown field'),
  /inspection action fields/)

mutation('duplicates an action field', FILES.action,
  (s) => replaceOnce(s, "  'weather',\n", "  'weather',\n  'weather',\n", 'duplicate field'),
  /duplicate-free/)

mutation('trusts hostile browser opportunity identity', FILES.inspectionForm,
  (s) => replaceOnce(s, '<input type="hidden" name="client_submission_id"', '<input type="hidden" name="opportunity_id" value={opportunityId} /><input type="hidden" name="client_submission_id"', 'hostile identity'),
  /inspection mounted form fields/)

mutation('duplicates a mounted RFI field', FILES.rfiForm,
  (s) => replaceOnce(s, '<input type="hidden" name="submission_id" value={retryKey} />', '<input type="hidden" name="submission_id" value={retryKey} /><input type="hidden" name="submission_id" value={retryKey} />', 'duplicate RFI field'),
  /duplicate-free/)

mutation('removes inspection service delegate', FILES.action,
  (s) => replaceOnce(s, 'siteInspectionWorkflowService.submitInspection(', 'siteInspectionWorkflowService.noop(', 'delegate removal'),
  /delegate exactly once/)

mutation('duplicates inspection service delegate', FILES.action,
  (s) => replaceOnce(s, 'const rawResult = await siteInspectionWorkflowService.submitInspection(', 'await siteInspectionWorkflowService.submitInspection({ tenantId, userId: actorId }, command.data)\n    const rawResult = await siteInspectionWorkflowService.submitInspection(', 'delegate duplication'),
  /delegate exactly once/)

mutation('reintroduces a direct database writer', FILES.action,
  (s) => replaceOnce(s, 'const rawResult = await siteInspectionWorkflowService.submitInspection(', 'await db.transaction(async () => undefined)\n    const rawResult = await siteInspectionWorkflowService.submitInspection(', 'local transaction'),
  /local durable database writer/)

mutation('hides a database writer behind a reachable local wrapper', FILES.action,
  (s) => replaceOnce(
    s,
    'const rawResult = await siteInspectionWorkflowService.createRfi(',
    'async function hiddenWriter() { await db.update(siteInspectionRfis) }\n    await hiddenWriter()\n    const rawResult = await siteInspectionWorkflowService.createRfi(',
    'local writer wrapper',
  ),
  /reachable local durable database writer/)

mutation('calls an aliased imported audit writer', FILES.action,
  (s) => replaceOnce(s, 'const rawResult = await siteInspectionWorkflowService.createRfi(', 'await writeAuditLog({} as never)\n    const rawResult = await siteInspectionWorkflowService.createRfi(', 'audit writer call'),
  /imported or re-exported durable helper/)

mutation('calls an opaque re-exported helper from a mounted action', FILES.action,
  (s) => replaceOnce(
    s,
    "'use server'",
    "'use server'\nimport { legacyWriter as hiddenWriter } from '@/server/crm/legacy-writers'",
    're-exported helper import',
  ).replace(
    'const rawResult = await siteInspectionWorkflowService.createRfi(',
    'await hiddenWriter(command.data)\n    const rawResult = await siteInspectionWorkflowService.createRfi(',
  ),
  /imported or re-exported durable helper/)

mutation('drops strict service result parsing', FILES.action,
  (s) => replaceOnce(s, 'siteInspectionWorkflowResultSchema.safeParse(rawResult)', '({ success: true, data: rawResult } as const)', 'result parser'),
  /strictly parse the service result/)

mutation('logs a raw RFI description', FILES.action,
  (s) => replaceOnce(s, "traceId, tenantId, actorId, action, outcome: 'service_rejected',", "traceId, tenantId, actorId, action, description: command.data.description, outcome: 'service_rejected',", 'raw log'),
  /log must exclude raw keys/)

mutation('runs archival on replay', FILES.action,
  (s) => replaceOnce(s, 'if (!checked.data.replayed) {', 'if (true) {', 'replay archival'),
  /classify post-commit archive/)

mutation('turns refresh failure into action failure', FILES.action,
  (s) => replaceOnce(s, 'refreshFailed = true\n    }', "return { ok: false as const, error: 'refresh failed' }\n    }", 'refresh failure'),
  /committed success|refresh failure/)

mutation('removes inspection synchronous guard', FILES.inspectionForm,
  (s) => replaceOnce(s, 'if (inFlightRef.current) return', 'if (false) return', 'inspection guard'),
  /single-flight/)

mutation('allows inspection network mutation offline', FILES.inspectionForm,
  (s) => replaceOnce(s, 'if (!online) {', 'if (false) {', 'offline guard'),
  /single-flight, preserve failures/)

mutation('rotates inspection UUID before success', FILES.inspectionForm,
  (s) => replaceOnce(s, 'startTransition(async () => {', 'setClientSubmissionId(crypto.randomUUID())\n    startTransition(async () => {', 'early rotation'),
  /rotate its UUID exactly once after success/)

mutation('removes RFI synchronous guard', FILES.rfiForm,
  (s) => replaceOnce(s, 'if (inFlightRef.current) return', 'if (false) return', 'RFI guard'),
  /RFI form must single-flight/)

mutation('rotates the RFI key on rejection', FILES.rfiForm,
  (s) => replaceOnce(s, 'if (!result.ok) {', 'setRetryKey(crypto.randomUUID())\n        if (!result.ok) {', 'early RFI rotation'),
  /rotate its key exactly once after success/)

mutation('removes current-membership authorization', FILES.service,
  (s) => replaceOnce(s, 'const membership = await transaction.lockMembership(principal.data)', 'const membership = principal.data as never', 'membership lock'),
  /authorize current membership/)

mutation('removes service capability enforcement', FILES.service,
  (s) => replaceOnce(s, "!roleHasCapability(membership.role, 'site_inspection.submit')", 'false', 'capability guard'),
  /authorize current membership/)

mutation('truncates the idempotency UUID', FILES.service,
  (s) => replaceOnce(s, 'submissionId: command.data.submissionId', 'submissionId: command.data.submissionId.slice(0, 8)', 'key truncation'),
  /full UUID/)

mutation('downgrades receipt hashing from SHA-256', FILES.service,
  (s) => replaceOnce(s, "createHash('sha256')", "createHash('sha1')", 'hash algorithm'),
  /must use SHA-256/)

mutation('drops tenant from the advisory lock', FILES.service,
  (s) => replaceOnce(s, "'site-inspection-command:' + tenantId + ':' + keyHash", "'site-inspection-command:' + keyHash", 'advisory tenant'),
  /advisory lock must bind tenant/)

mutation('omits actor from the command hash', FILES.service,
  (s) => replaceOnce(s, 'actorId: principal.data.userId,\n        command: normalizedCommand,', 'command: normalizedCommand,', 'inspection actor hash'),
  /tenant, actor, and full command/)

mutation('removes PPRF validation', FILES.service,
  (s) => replaceOnce(s, 'transaction.hasPprf(membership.tenantId, opportunity.id)', 'Promise.resolve(true)', 'PPRF check'),
  /tenant-bound PPRF/)

mutation('weakens photo tenant validation', FILES.service,
  (s) => replaceOnce(s, 'row.tenantId === membership.tenantId &&', 'true &&', 'photo tenant'),
  /photo authorization/)

mutation('drops inspection audit receipt', FILES.service,
  (s) => replaceOnce(s, 'await transaction.writeAudit({', 'await Promise.resolve({', 'audit removal'),
  /durable effects must be atomic/)

mutation('swallows an inspection effect failure inside the transaction', FILES.service,
  (s) => replaceOnce(s, 'await transaction.ensureDesignHandoffSla(\n          membership.tenantId,', 'try { await transaction.ensureDesignHandoffSla(\n          membership.tenantId,', 'effect try').replace('          opportunity.id\n        )\n        const recipients', '          opportunity.id\n        ) } catch {}\n        const recipients'),
  /must not swallow an atomic effect failure/)

mutation('drops inspection SLA effect', FILES.service,
  (s) => replaceOnce(s, 'await transaction.ensureDesignHandoffSla(', 'await Promise.resolve(', 'SLA removal'),
  /durable effects must be atomic/)

mutation('widens notification recipients beyond Design', FILES.service,
  (s) => replaceOnce(s, "recipient.role !== 'design'", 'false', 'recipient role'),
  /Design-only/)

mutation('drops RFI audit receipt', FILES.service,
  (s) => {
    const first = s.indexOf('await transaction.writeAudit({')
    const second = s.indexOf('await transaction.writeAudit({', first + 1)
    assert.notEqual(second, -1, 'RFI audit fixture missing')
    return `${s.slice(0, second)}await Promise.resolve({${s.slice(second + 'await transaction.writeAudit({'.length)}`
  },
  /RFI durable effects/)

mutation('makes inspection receipt permissive', FILES.service,
  (s) => replaceOnce(s, 'linked_photo_count: z.number().int().min(0).max(MAX_PHOTOS),\n  })\n  .strict()', 'linked_photo_count: z.number().int().min(0).max(MAX_PHOTOS),\n  })', 'inspection receipt strict'),
  /inspection receipt must reject/)

mutation('stores a raw submission key in the RFI receipt', FILES.service,
  (s) => replaceOnce(s, "submission_kind: z.literal('rfi_creation'),", "submission_kind: z.literal('rfi_creation'),\n    submission_id: z.string().uuid(),", 'raw receipt key'),
  /RFI receipt must not persist raw keys/)

mutation('drops replay command conflict validation', FILES.service,
  (s) => replaceOnce(s, 'if (receipt.data.command_hash !== input.commandHash) {', 'if (false) {', 'replay command hash'),
  /replay must conflict/)

mutation('removes inspection concurrency evidence', FILES.serviceTest,
  (s) => replaceOnce(s, "it('serializes concurrent retries into one effect set'", "it('allows duplicate concurrent retries'", 'concurrency test'),
  /focused evidence is missing/)

mutation('removes mounted hostile-field evidence', FILES.actionTest,
  (s) => replaceOnce(s, 'rejects unknown, duplicate, and hostile inspection fields before service', 'accepts arbitrary inspection fields', 'hostile test'),
  /focused evidence is missing/)
