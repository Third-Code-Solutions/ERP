import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import ts from 'typescript'
import { verifyDailyTaskCompletionContract } from './verify-daily-task-completion-contract.mjs'

const FILES = {
  authorization: 'packages/shared-types/src/authorization.ts',
  shared: 'packages/shared-types/src/erp-api/daily-task-completion.ts',
  controller: 'apps/api/src/daily-tasks/daily-task-completion.controller.ts',
  service: 'apps/api/src/daily-tasks/daily-task-completion.service.ts',
  serviceTest:
    'apps/api/src/daily-tasks/daily-task-completion.service.spec.ts',
  action: 'apps/web/src/app/(dashboard)/tasks/actions.ts',
  page: 'apps/web/src/app/(dashboard)/tasks/page.tsx',
  taskRow: 'apps/web/src/components/tasks/task-row.tsx',
  button: 'apps/web/src/components/tasks/complete-task-button.tsx',
  client: 'apps/web/src/lib/erp-core-client.ts',
}

function read(file) {
  return fs.readFileSync(file, 'utf8')
}

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before)
  assert.notEqual(first, -1, `mutation fixture must find ${label}`)
  assert.equal(
    source.indexOf(before, first + before.length),
    -1,
    `mutation fixture must uniquely find ${label}`
  )
  return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`
}

function replaceFirst(source, before, after, label) {
  const first = source.indexOf(before)
  assert.notEqual(first, -1, `mutation fixture must find ${label}`)
  return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`
}

function expectMutationFailure(overrides, pattern) {
  assert.throws(
    () => verifyDailyTaskCompletionContract({ overrides }),
    pattern
  )
}

function reprint(source, file) {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${file} parses before reprint`)
  return ts.createPrinter().printFile(sourceFile)
}

test('authoritative daily-task mounted contract passes', () => {
  assert.deepEqual(verifyDailyTaskCompletionContract(), {
    roles: 13,
    completionRoles: 5,
    deniedRoles: 8,
    mountedControls: 1,
    coreDelegates: 1,
  })
})

test('benign TypeScript reformatting preserves the contract', () => {
  const overrides = Object.fromEntries(
    [FILES.shared, FILES.action, FILES.taskRow, FILES.button, FILES.service].map(
      (file) => [file, reprint(read(file), file)]
    )
  )
  assert.equal(verifyDailyTaskCompletionContract({ overrides }).roles, 13)
})

test('supports an exported-arrow action and an aliased Core delegate', () => {
  let action = replaceOnce(
    read(FILES.action),
    `export async function completeTask(
  mountedContext: CompleteTaskContext,
  formData: FormData
): Promise<ActionResult> {`,
    `export const completeTask = async (
  mountedContext: CompleteTaskContext,
  formData: FormData
): Promise<ActionResult> => {`,
    'completeTask function declaration'
  )
  action = replaceOnce(
    action,
    'completeDailyTaskThroughCoreApi,',
    'completeDailyTaskThroughCoreApi as delegatedCompletion,',
    'Core delegate import'
  )
  action = replaceOnce(
    action,
    'const coreResult = await completeDailyTaskThroughCoreApi(',
    'const coreResult = await delegatedCompletion(',
    'Core delegate call'
  )
  assert.equal(
    verifyDailyTaskCompletionContract({ overrides: { [FILES.action]: action } })
      .coreDelegates,
    1
  )
})

test('rejects capability expansion to a denied role', () => {
  const source = replaceOnce(
    read(FILES.authorization),
    "'sd.daily_tasks': ['owner', 'admin', 'sd_pm_pe', 'pm', 'safety']",
    "'sd.daily_tasks': ['owner', 'admin', 'sd_pm_pe', 'pm', 'safety', 'viewer']",
    'daily-task role list'
  )
  expectMutationFailure(
    { [FILES.authorization]: source },
    /grants exactly Owner, Admin/
  )
})

test('rejects permissive command and result schemas', () => {
  const shared = read(FILES.shared)
  const command = replaceOnce(
    shared,
    `.strict()

/** Canonical persisted completion`,
    `.passthrough()

/** Canonical persisted completion`,
    'strict command schema'
  )
  expectMutationFailure(
    { [FILES.shared]: command },
    /dailyTaskCompletionCommandSchema is strict/
  )

  const result = replaceOnce(
    shared,
    '    completedBy: z.string().uuid(),\n',
    '',
    'completedBy result field'
  )
  expectMutationFailure({ [FILES.shared]: result }, /complete strict completion scope/)
})

test('rejects a page capability bypass or widened task read', () => {
  const page = read(FILES.page)
  const bypass = replaceOnce(
    page,
    "can(profile.role, 'sd.daily_tasks')",
    "can(profile.role, 'today.read')",
    'page completion capability'
  )
  expectMutationFailure({ [FILES.page]: bypass }, /page projects the central/)

  const widened = replaceFirst(
    page,
    'eq(dailyTasks.assignee_id, profile.user.id),',
    '',
    'first assignee read predicate'
  )
  expectMutationFailure({ [FILES.page]: widened }, /every mounted daily-task read/)
})

test('rejects rendering writable controls for a denied role', () => {
  const page = replaceOnce(
    read(FILES.page),
    'readOnly={isReadOnly || !canCompleteTasks}',
    'readOnly={isReadOnly}',
    'page read-only role projection'
  )
  expectMutationFailure({ [FILES.page]: page }, /denied-role rows read-only/)

  const row = replaceOnce(
    read(FILES.taskRow),
    "{readOnly || task.status === 'done' ? (",
    '{false ? (',
    'row completion guard'
  )
  expectMutationFailure({ [FILES.taskRow]: row }, /cannot mount the completion control/)
})

test('rejects a second mounted action importer or completion control', () => {
  const extraFile = 'apps/web/src/components/tasks/second-completion-entry.tsx'
  expectMutationFailure(
    {
      [extraFile]: `import { completeTask } from '@/app/(dashboard)/tasks/actions'\nexport const secondEntry = completeTask\n`,
    },
    /exactly one production component imports/
  )

  const rowSource = read(FILES.taskRow)
  const mountedControl = rowSource.match(/<CompleteTaskButton[\s\S]*?\/>/)?.[0]
  assert.ok(mountedControl, 'mutation fixture must find mounted completion control')
  const row = replaceOnce(
    rowSource,
    mountedControl,
    `<>${mountedControl}${mountedControl}</>`,
    'single completion control'
  )
  expectMutationFailure({ [FILES.taskRow]: row }, /exactly one completion control/)
})

test('rejects hostile FormData acceptance and a permissive bound context', () => {
  const action = read(FILES.action)
  const hostile = replaceOnce(
    action,
    "fieldNames.every((field) => field === 'notes') &&",
    'fieldNames.length >= 0 &&',
    'hostile field filter'
  )
  expectMutationFailure({ [FILES.action]: hostile }, /hostile and duplicate FormData/)

  const context = replaceOnce(
    action,
    `.strict()

type CompletionOutcome`,
    `.passthrough()

type CompletionOutcome`,
    'strict mounted context'
  )
  expectMutationFailure({ [FILES.action]: context }, /completeTaskContextSchema is strict/)
})

test('rejects Web capability and tenant-selector bypasses', () => {
  const action = read(FILES.action)
  const capability = replaceOnce(
    action,
    "can(profile.role, 'sd.daily_tasks')",
    "can(profile.role, 'today.read')",
    'Web completion capability'
  )
  expectMutationFailure({ [FILES.action]: capability }, /Web action repeats the central/)

  const selector = replaceOnce(
    action,
    'if (!dailyTaskCompletionWritesUseCoreApi(profile.tenantId)) {',
    'if (false && !dailyTaskCompletionWritesUseCoreApi(profile.tenantId)) {',
    'tenant selector guard'
  )
  expectMutationFailure({ [FILES.action]: selector }, /fails closed when tenant selection/)
})

test('rejects an incomplete stable key and a second Core delegation', () => {
  const action = read(FILES.action)
  const weakKey = replaceOnce(
    action,
    'JSON.stringify({ command, taskId })',
    'JSON.stringify({ taskId })',
    'full-command stable key'
  )
  expectMutationFailure({ [FILES.action]: weakKey }, /stable key hashes the complete/)

  const duplicate = replaceOnce(
    action,
    '    const coreResult = await completeDailyTaskThroughCoreApi(\n',
    '    await completeDailyTaskThroughCoreApi(context.taskId, command, dailyTaskCompletionKey(context.taskId, command))\n    const coreResult = await completeDailyTaskThroughCoreApi(\n',
    'single Core delegation'
  )
  expectMutationFailure({ [FILES.action]: duplicate }, /exactly one Core delegate/)
})

test('rejects reachable direct and imported/re-exported local mutation fallbacks', () => {
  const action = read(FILES.action)
  const direct = replaceOnce(
    action,
    "import { z } from 'zod'",
    "import { z } from 'zod'\nimport { db as mutationDb } from '@third-code-erp/database'\nimport { dailyTasks as mutationDailyTasks } from '@third-code-erp/database/schema'",
    'direct mutation imports'
  ).replace(
    '  try {\n    const parsedContext',
    "  try {\n    await mutationDb.update(mutationDailyTasks).set({ status: 'done' })\n    const parsedContext"
  )
  expectMutationFailure({ [FILES.action]: direct }, /no reachable Web database writer/)

  const barrel = 'apps/web/src/app/(dashboard)/tasks/mutation-barrel.ts'
  const helper = 'apps/web/src/app/(dashboard)/tasks/mutation-helper.ts'
  const imported = replaceOnce(
    action,
    "import { z } from 'zod'",
    "import { z } from 'zod'\nimport { importedMutation } from './mutation-barrel'",
    'imported mutation entry'
  ).replace(
    '  try {\n    const parsedContext',
    '  try {\n    await importedMutation()\n    const parsedContext'
  )
  expectMutationFailure(
    {
      [FILES.action]: imported,
      [barrel]: "export { mutate as importedMutation } from './mutation-helper'\n",
      [helper]: `import { db as mutationDb } from '@third-code-erp/database'
import { dailyTasks as mutationDailyTasks } from '@third-code-erp/database/schema'
export const mutate = async () => {
  await mutationDb.update(mutationDailyTasks).set({ status: 'done' })
}
`,
    },
    /no reachable Web database writer/
  )
})

test('rejects reachable Web audit and SLA compatibility helpers', () => {
  const action = read(FILES.action)
  const audit = replaceOnce(
    action,
    '  try {\n    const parsedContext',
    "  try {\n    await writeAuditLog({})\n    const parsedContext",
    'reachable audit fallback'
  )
  expectMutationFailure({ [FILES.action]: audit }, /no reachable Web audit or SLA/)

  const sla = replaceOnce(
    action,
    "import { writeAuditLog } from '@/lib/audit'",
    "import { writeAuditLog } from '@/lib/audit'\nimport { stopSlaClock } from '@/lib/operations/sla-clock'",
    'SLA helper import'
  ).replace(
    '  try {\n    const parsedContext',
    '  try {\n    await stopSlaClock({})\n    const parsedContext'
  )
  expectMutationFailure({ [FILES.action]: sla }, /no reachable Web audit or SLA/)
})

test('rejects weakened result scope, sensitive logs, and early refresh', () => {
  const action = read(FILES.action)
  const scope = replaceOnce(
    action,
    '      parsedResult.data.assigneeId !== context.assigneeId ||\n',
    '',
    'assignee result comparison'
  )
  expectMutationFailure({ [FILES.action]: scope }, /checks returned assigneeId/)

  const logging = replaceOnce(
    action,
    '      outcome,\n',
    '      outcome,\n      notes: mountedContext,\n',
    'redacted log payload'
  )
  expectMutationFailure({ [FILES.action]: logging }, /logs exclude notes/)

  const earlyRefresh = replaceOnce(
    action,
    '    const coreResult = await completeDailyTaskThroughCoreApi(',
    "    revalidatePath('/tasks')\n    const coreResult = await completeDailyTaskThroughCoreApi(",
    'early refresh insertion'
  ).replace("\n    revalidatePath('/tasks')\n    return finish(\n", '\n    return finish(\n')
  expectMutationFailure({ [FILES.action]: earlyRefresh }, /ordered fail closed/)
})

test('rejects duplicate UI transport or loss of single-flight recovery', () => {
  const button = read(FILES.button)
  const duplicate = replaceOnce(
    button,
    '        const result = await action(formData)',
    '        await action(formData)\n        const result = await action(formData)',
    'single UI action call'
  )
  expectMutationFailure({ [FILES.button]: duplicate }, /invokes the mounted action once/)

  const noFlight = replaceOnce(
    button,
    '    if (inFlight.current) return\n',
    '',
    'single-flight guard'
  )
  expectMutationFailure({ [FILES.button]: noFlight }, /recoverable single-flight/)
})

test('rejects a second HTTP request or weakened tenant selector', () => {
  const client = read(FILES.client)
  const duplicate = replaceOnce(
    client,
    '    const response = await fetch(\n',
    "    await fetch('https://invalid.example.test')\n    const response = await fetch(\n",
    'single adapter fetch'
  )
  expectMutationFailure({ [FILES.client]: duplicate }, /exactly one HTTP request/)

  const selector = replaceOnce(
    client,
    '    process.env.ERP_DAILY_TASK_COMPLETION_WRITES_VIA_API_TENANT_IDS\n',
    "    '*'\n",
    'tenant allowlist selector'
  )
  expectMutationFailure({ [FILES.client]: selector }, /global flag plus tenant allowlist/)
})

test('rejects weakened Core route and current-membership authorization', () => {
  const controller = replaceOnce(
    read(FILES.controller),
    "@RequireCapabilities('sd.daily_tasks')",
    "@RequireCapabilities('today.read')",
    'Core route capability'
  )
  expectMutationFailure({ [FILES.controller]: controller }, /Core controller retains/)

  const service = replaceOnce(
    read(FILES.service),
    "roleHasCapability(role, 'sd.daily_tasks')",
    "roleHasCapability(role, 'today.read')",
    'current membership capability'
  )
  expectMutationFailure({ [FILES.service]: service }, /current-membership capability/)
})

test('rejects weakened membership, tenant lock, or assignee override', () => {
  const service = read(FILES.service)
  const membership = replaceOnce(
    service,
    '          eq(users.tenant_id, principal.tenantId)\n',
    '          eq(users.tenant_id, users.tenant_id)\n',
    'membership tenant predicate'
  )
  expectMutationFailure({ [FILES.service]: membership }, /membership is locked by current tenant/)

  const tenant = replaceOnce(
    service,
    '          eq(dailyTasks.tenant_id, authorizedPrincipal.tenantId)\n',
    '          eq(dailyTasks.tenant_id, dailyTasks.tenant_id)\n',
    'task tenant predicate'
  )
  expectMutationFailure({ [FILES.service]: tenant }, /task lock is scoped/)

  const override = replaceOnce(
    service,
    "const canOverrideAssignee = role === 'owner' || role === 'admin'",
    "const canOverrideAssignee = role === 'owner' || role === 'admin' || role === 'safety'",
    'Owner/Admin override'
  )
  expectMutationFailure({ [FILES.service]: override }, /only Owner\/Admin override/)
})

test('rejects weakened receipt key or command binding', () => {
  const service = read(FILES.service)
  const key = replaceOnce(
    service,
    "          sql`${auditLog.diff}->>'idempotency_key_hash' = ${keyHash}`\n",
    "          sql`${auditLog.diff}->>'idempotency_key_hash' is not null`\n",
    'receipt full-key predicate'
  )
  expectMutationFailure({ [FILES.service]: key }, /receipt lookup includes keyHash/)

  const command = replaceOnce(
    service,
    '        parsedReceipt.data.command_hash !== commandHash\n',
    '        false\n',
    'receipt command hash check'
  )
  expectMutationFailure({ [FILES.service]: command }, /receipt replay verifies/)
})

test('rejects weakened pending state, SLA scope, or raw audit payload', () => {
  const service = read(FILES.service)
  const pending = replaceOnce(
    service,
    "          eq(dailyTasks.status, 'pending')\n",
    "          eq(dailyTasks.status, task.status)\n",
    'pending update predicate'
  )
  expectMutationFailure({ [FILES.service]: pending }, /conditional on current-tenant pending/)

  const sla = replaceOnce(
    service,
    '          eq(slaLogs.tenant_id, authorizedPrincipal.tenantId),\n',
    '',
    'SLA tenant predicate'
  )
  expectMutationFailure({ [FILES.service]: sla }, /SLA closure includes slaLogs.tenant_id/)

  const rawAudit = replaceOnce(
    service,
    '        completion_notes_present: Boolean(command.notes),\n',
    '        completion_notes_present: Boolean(command.notes),\n        notes: command.notes,\n',
    'redacted audit receipt'
  )
  expectMutationFailure({ [FILES.service]: rawAudit }, /never raw notes or keys/)
})

test('rejects done-before-authorization, skipped fallthrough, and lost transaction', () => {
  const service = read(FILES.service)
  const doneLine = "    if (task.status === 'done') return resultFor(task)\n"
  const withoutDone = replaceOnce(service, doneLine, '', 'authorized done branch')
  const doneBeforeAuth = replaceOnce(
    withoutDone,
    '    const canOverrideAssignee =',
    `${doneLine}    const canOverrideAssignee =`,
    'done branch before assignee authorization'
  )
  expectMutationFailure({ [FILES.service]: doneBeforeAuth }, /authorized done is a no-write/)

  const skipped = replaceOnce(
    service,
    "if (task.status === 'skipped')",
    "if (task.status === 'never')",
    'skipped conflict state'
  )
  expectMutationFailure({ [FILES.service]: skipped }, /authorized done is a no-write/)

  const noTransaction = replaceOnce(
    service,
    'this.database.client.transaction((transaction) =>',
    'this.database.client.withoutTransaction((transaction) =>',
    'database transaction'
  )
  expectMutationFailure({ [FILES.service]: noTransaction }, /one database transaction/)
})

test('rejects removal of replay, rollback, or concurrency evidence', () => {
  const tests = read(FILES.serviceTest)
  for (const phrase of [
    'rolls task, SLA, receipt, and audit effects back on %s failure',
    'replays the same key and command with one task, SLA, and audit effect',
    'serializes concurrent same-key commands to a single effect',
  ]) {
    const mutation = replaceOnce(tests, phrase, 'removed evidence', phrase)
    expectMutationFailure({ [FILES.serviceTest]: mutation }, /focused evidence covers/)
  }
})
