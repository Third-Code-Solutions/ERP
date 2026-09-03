import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import ts from 'typescript'

const FILES = {
  authorization: 'packages/shared-types/src/authorization.ts',
  action: 'apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/actions.ts',
  actionTest: 'apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/actions.test.ts',
  page: 'apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/inspection/page.tsx',
  pageTest: 'apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/inspection/page.test.ts',
  inspectionForm: 'apps/web/src/components/proposal/inspection-form.tsx',
  inspectionFormTest: 'apps/web/src/components/proposal/inspection-form.test.tsx',
  rfiForm: 'apps/web/src/components/proposal/rfi-form.tsx',
  rfiFormTest: 'apps/web/src/components/proposal/rfi-form.test.tsx',
  service: 'apps/web/src/server/crm/site-inspection-workflow-service.ts',
  serviceTest: 'apps/web/src/server/crm/site-inspection-workflow-service.test.ts',
}

const ALL_ROLES = [
  'owner', 'estimator', 'pm', 'admin', 'sales', 'commercial', 'design',
  'sd_pm_pe', 'finance', 'procurement', 'safety', 'cx', 'viewer',
]
const MUTATION_ROLES = ['owner', 'admin', 'commercial']
const INSPECTION_FIELDS = [
  'client_submission_id', 'site_address', 'floor_area_sqm', 'landlord_contact',
  'as_built_available', 'expected_start_date', 'weather', 'accessibility_notes',
  'observations', 'photo_document_ids',
]
const RFI_FIELDS = ['submission_id', 'description', 'priority']

function fail(message) {
  throw new Error(`WO-12 contract violation: ${message}`)
}

function invariant(condition, message) {
  if (!condition) fail(message)
}

function normalizeFile(file) {
  return file.replaceAll('\\', '/')
}

function descendants(node) {
  const result = []
  function visit(current) {
    current.forEachChild((child) => {
      result.push(child)
      visit(child)
    })
  }
  visit(node)
  return result
}

function compact(nodeOrText) {
  const text = typeof nodeOrText === 'string' ? nodeOrText : nodeOrText.getText()
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*/g, '').replace(/\s+/g, '')
}

function propertyName(node) {
  if (!node) return undefined
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text
  return undefined
}

function unwrap(node) {
  let current = node
  while (
    ts.isParenthesizedExpression(current) || ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) || ts.isNonNullExpression(current)
  ) current = current.expression
  return current
}

function directStringArray(node) {
  const value = unwrap(node)
  if (!ts.isArrayLiteralExpression(value)) return null
  const entries = value.elements.map((entry) => unwrap(entry))
  if (!entries.every((entry) => ts.isStringLiteral(entry))) return null
  return entries.map((entry) => entry.text)
}

function sameExactList(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index])
}

function hasDuplicates(values) {
  return new Set(values).size !== values.length
}

class SourceUnit {
  constructor(relativePath, source) {
    this.relativePath = relativePath
    this.source = source
    this.ast = ts.createSourceFile(
      relativePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      relativePath.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    const parseErrors = this.ast.parseDiagnostics ?? []
    invariant(parseErrors.length === 0, `${relativePath} must parse as TypeScript`)
    this.imports = new Map()
    for (const statement of this.ast.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
      const module = statement.moduleSpecifier.text
      const clause = statement.importClause
      if (clause?.name) this.imports.set(clause.name.text, { imported: 'default', module })
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const specifier of clause.namedBindings.elements) {
          this.imports.set(specifier.name.text, {
            imported: specifier.propertyName?.text ?? specifier.name.text,
            module,
          })
        }
      }
      if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        this.imports.set(clause.namedBindings.name.text, { imported: '*', module })
      }
    }
  }

  callable(name) {
    for (const node of [this.ast, ...descendants(this.ast)]) {
      if (ts.isFunctionDeclaration(node) && node.name?.text === name) return node
      if (
        ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name &&
        node.initializer && (ts.isArrowFunction(unwrap(node.initializer)) || ts.isFunctionExpression(unwrap(node.initializer)))
      ) {
        return unwrap(node.initializer)
      }
    }
    return null
  }

  classMethod(className, methodName) {
    for (const statement of this.ast.statements) {
      if (!ts.isClassDeclaration(statement) || statement.name?.text !== className) continue
      return statement.members.find((member) =>
        ts.isMethodDeclaration(member) && propertyName(member.name) === methodName,
      ) ?? null
    }
    return null
  }

  variableInitializer(name) {
    for (const statement of this.ast.statements) {
      if (!ts.isVariableStatement(statement)) continue
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === name) return declaration.initializer ?? null
      }
    }
    return null
  }

  importedIdentity(identifier) {
    return this.imports.get(identifier) ?? null
  }
}

class SourceGraph {
  constructor(root, overrides = {}) {
    this.root = root
    this.overrides = new Map(
      Object.entries(overrides).map(([file, source]) => [normalizeFile(file), source]),
    )
    this.cache = new Map()
  }

  get(relativePath) {
    const file = normalizeFile(relativePath)
    if (this.cache.has(file)) return this.cache.get(file)
    const source = this.overrides.has(file)
      ? this.overrides.get(file)
      : fs.readFileSync(path.join(this.root, file), 'utf8')
    const unit = new SourceUnit(file, source)
    this.cache.set(file, unit)
    return unit
  }
}

function callExpressions(node) {
  return descendants(node).filter(ts.isCallExpression)
}

function calledMember(call) {
  const expression = unwrap(call.expression)
  if (!ts.isPropertyAccessExpression(expression) || !ts.isIdentifier(expression.expression)) return null
  return { receiver: expression.expression.text, member: expression.name.text }
}

function importedServiceCalls(unit, node, method) {
  return callExpressions(node).filter((call) => {
    const member = calledMember(call)
    if (!member || member.member !== method) return false
    const imported = unit.importedIdentity(member.receiver)
    return imported?.imported === 'siteInspectionWorkflowService' &&
      imported.module === '@/server/crm/site-inspection-workflow-service'
  })
}

function verifyNoReachableActionWriter(unit, startNode, label) {
  const visited = new Set()
  const allowedDirectImports = new Set(['randomUUID', 'requireUserProfile', 'can', 'revalidatePath'])
  const allowedMemberImports = new Set([
    'siteInspectionSubmissionCommandSchema', 'siteInspectionRfiCommandSchema',
    'siteInspectionWorkflowResultSchema', 'siteInspectionWorkflowService',
  ])
  function visit(node) {
    if (visited.has(node)) return
    visited.add(node)
    for (const call of callExpressions(node)) {
      const expression = unwrap(call.expression)
      const member = calledMember(call)
      if (member) {
        if (member.receiver === 'db' && ['insert', 'update', 'delete', 'transaction'].includes(member.member)) {
          fail(`${label} action must not contain a reachable local durable database writer`)
        }
        const imported = unit.importedIdentity(member.receiver)
        if (imported && !allowedMemberImports.has(imported.imported)) {
          fail(`${label} action must not call an imported or re-exported durable helper`)
        }
      }
      if (!ts.isIdentifier(expression)) continue
      const imported = unit.importedIdentity(expression.text)
      if (imported && !allowedDirectImports.has(imported.imported)) {
        fail(`${label} action must not call an imported or re-exported durable helper`)
      }
      if (expression.text === 'persistInspectionReport') continue
      const local = unit.callable(expression.text)
      if (local && local !== node) visit(local)
    }
  }
  visit(startNode)
}

function jsxFieldNames(unit) {
  const names = []
  for (const node of descendants(unit.ast)) {
    if (!ts.isJsxAttribute(node) || node.name.text !== 'name') continue
    if (node.initializer && ts.isStringLiteral(node.initializer)) names.push(node.initializer.text)
  }
  return names
}

function stringArrayVariable(unit, name) {
  const initializer = unit.variableInitializer(name)
  invariant(initializer, `${unit.relativePath} must declare ${name}`)
  const values = directStringArray(initializer)
  invariant(values, `${name} must be a direct string array`)
  return values
}

function capabilityRoles(unit) {
  for (const node of descendants(unit.ast)) {
    if (!ts.isPropertyAssignment(node) || propertyName(node.name) !== 'site_inspection.submit') continue
    const values = directStringArray(node.initializer)
    invariant(values, 'site_inspection.submit authority must be an explicit role array')
    return values
  }
  fail('central site_inspection.submit capability is missing')
}

function assertExactFields(actual, expected, label) {
  invariant(!hasDuplicates(actual), `${label} must be duplicate-free`)
  invariant(sameExactList(actual, expected), `${label} must match the frozen field inventory`)
}

function assertExactFieldSet(actual, expected, label) {
  invariant(!hasDuplicates(actual), `${label} must be duplicate-free`)
  invariant(actual.length === expected.length && expected.every((field) => actual.includes(field)),
    `${label} must match the frozen field inventory`)
}

function functionText(unit, name) {
  const node = unit.callable(name)
  invariant(node, `${unit.relativePath} must declare ${name}`)
  return { node, text: compact(node) }
}

function methodText(unit, name) {
  const node = unit.classMethod('SiteInspectionWorkflowService', name)
  invariant(node, `workflow service must declare ${name}`)
  return { node, text: compact(node) }
}

function assertContains(text, token, label) {
  invariant(text.includes(compact(token)), label)
}

function assertOrder(text, tokens, label) {
  let cursor = -1
  for (const token of tokens) {
    const next = text.indexOf(compact(token), cursor + 1)
    invariant(next > cursor, label)
    cursor = next
  }
}

function verifyAuthorization(graph) {
  const unit = graph.get(FILES.authorization)
  const roles = stringArrayVariable(unit, 'ERP_ROLES')
  assertExactFields(roles, ALL_ROLES, 'ERP role vocabulary')
  const allowed = capabilityRoles(unit)
  assertExactFields(allowed, MUTATION_ROLES, 'site inspection mutation roles')
}

function verifyAction(graph) {
  const unit = graph.get(FILES.action)
  assertExactFields(stringArrayVariable(unit, 'INSPECTION_FIELD_NAMES'), INSPECTION_FIELDS, 'inspection action fields')
  assertExactFields(stringArrayVariable(unit, 'RFI_FIELD_NAMES'), RFI_FIELDS, 'RFI action fields')

  const inspection = functionText(unit, 'submitInspection')
  const rfi = functionText(unit, 'addInspectionRfi')
  invariant(importedServiceCalls(unit, inspection.node, 'submitInspection').length === 1,
    'submitInspection must delegate exactly once to the imported atomic service')
  invariant(importedServiceCalls(unit, rfi.node, 'createRfi').length === 1,
    'addInspectionRfi must delegate exactly once to the imported atomic service')
  invariant(importedServiceCalls(unit, inspection.node, 'createRfi').length === 0 &&
    importedServiceCalls(unit, rfi.node, 'submitInspection').length === 0,
  'mounted actions must not cross-call the other command')

  for (const [label, data] of [['inspection', inspection], ['RFI', rfi]]) {
    assertContains(data.text, "can(profile.role,'site_inspection.submit')", `${label} action must use central capability`)
    assertContains(data.text, 'siteInspectionWorkflowResultSchema.safeParse', `${label} action must strictly parse the service result`)
    assertContains(data.text, 'checked.data.tenantId!==tenantId', `${label} action must validate result tenant scope`)
    assertContains(data.text, 'checked.data.actorId!==actorId', `${label} action must validate result actor scope`)
    assertContains(data.text, 'checked.data.opportunityId!==opportunityId', `${label} action must validate result opportunity scope`)
    assertContains(data.text, 'logSiteInspectionOutcome({', `${label} action must emit a structured outcome log`)
    for (const call of callExpressions(data.node)) {
      if (!ts.isIdentifier(unwrap(call.expression)) || unwrap(call.expression).text !== 'logSiteInspectionOutcome') continue
      const argument = call.arguments[0] && unwrap(call.arguments[0])
      invariant(argument && ts.isObjectLiteralExpression(argument), `${label} action log must use a direct redacted object`)
      const keys = argument.properties.map((property) => propertyName(property.name)).filter(Boolean)
      invariant(!keys.some((key) => ['submissionId', 'command', 'payload', 'description', 'landlordContact', 'photoDocumentIds'].includes(key)),
        `${label} action log must exclude raw keys and payload data`)
    }
  }
  assertContains(rfi.text, 'checked.data.inspectionId!==inspectionId', 'RFI action must validate result inspection scope')
  assertContains(inspection.text, 'readExactTextFields(formData,INSPECTION_FIELD_NAMES,INSPECTION_FIELD_NAME_SET',
    'inspection action must enforce exact hostile-field rejection')
  assertContains(rfi.text, 'readExactTextFields(formData,RFI_FIELD_NAMES,RFI_FIELD_NAME_SET',
    'RFI action must enforce exact hostile-field rejection')

  for (const [label, data] of [['inspection', inspection], ['RFI', rfi]]) {
    verifyNoReachableActionWriter(unit, data.node, label)
  }

  assertOrder(inspection.text, [
    'siteInspectionWorkflowResultSchema.safeParse',
    'if(!checked.success',
    'if(!checked.data.replayed)',
    'persistInspectionReport',
    'catch',
    'archiveWarning=',
    'revalidatePath',
    'catch',
    'refreshFailed=true',
    'return{ok:true',
  ], 'inspection action must classify post-commit archive/refresh failures as committed success')
  assertOrder(rfi.text, ['revalidatePath', 'catch', 'refreshFailed=true', 'return{ok:true'],
    'RFI refresh failure must remain committed success')
}

function verifyPage(graph) {
  const unit = graph.get(FILES.page)
  const page = functionText(unit, 'InspectionPage')
  assertContains(page.text, "constcanSubmit=can(profile.role,'site_inspection.submit')", 'page must use central capability selector')
  invariant((page.node.getText().match(/<InspectionForm\b/g) ?? []).length === 1, 'page must mount exactly one inspection control')
  invariant((page.node.getText().match(/<RfiForm\b/g) ?? []).length === 1, 'page must mount exactly one RFI control')
  assertContains(page.text, 'canSubmit?(<InspectionForm', 'inspection control must be denied for all other roles')
  assertContains(page.text, 'canSubmit&&rfiSubmissionId?(<RfiForm', 'RFI control must be denied for all other roles')
  assertContains(page.text, 'constrfiSubmissionId=canSubmit&&latest?randomUUID():null', 'RFI retry identity must be server generated')
  assertContains(page.text, 'eq(opportunities.tenant_id,profile.tenantId)', 'opportunity read must be tenant selected')
  assertContains(page.text, 'eq(siteInspections.tenant_id,profile.tenantId)', 'inspection read must be tenant selected')
  assertContains(page.text, 'eq(siteInspectionRfis.tenant_id,profile.tenantId)', 'RFI read must be tenant selected')
  invariant((page.node.getText().match(/role="note"/g) ?? []).length >= 2, 'denied roles must receive both read-only notices')
}

function verifyForms(graph) {
  const inspection = graph.get(FILES.inspectionForm)
  const rfi = graph.get(FILES.rfiForm)
  assertExactFieldSet(jsxFieldNames(inspection), INSPECTION_FIELDS, 'inspection mounted form fields')
  assertExactFieldSet(jsxFieldNames(rfi), RFI_FIELDS, 'RFI mounted form fields')
  for (const [label, fields] of [['inspection', jsxFieldNames(inspection)], ['RFI', jsxFieldNames(rfi)]]) {
    invariant(!fields.some((field) => ['opportunity_id', 'inspection_id', 'tenant_id', 'actor_id', 'role'].includes(field)),
      `${label} mounted form must bind identities on the server`)
  }

  const inspectSubmit = functionText(inspection, 'onSubmit')
  assertOrder(inspectSubmit.text, [
    'if(inFlightRef.current)return', 'inFlightRef.current=true', 'if(!online)',
    'saveDraftNow()', 'inFlightRef.current=false', 'return', 'startTransition',
    'submitInspection(opportunityId,formData)', 'if(!res.ok)', 'saveDraftNow()',
    'clearSiteInspectionDraft(opportunityId)', 'setClientSubmissionId(crypto.randomUUID())',
    'catch', 'saveDraftNow()', 'finally', 'inFlightRef.current=false',
  ], 'inspection form must single-flight, preserve failures, and clear/rotate only on success')
  assertContains(inspectSubmit.text, "formData.set('client_submission_id',submissionId)", 'inspection form must reuse a stable command UUID')
  assertContains(inspectSubmit.text, "formData.set('photo_document_ids',JSON.stringify(documentIds))", 'inspection form must submit exact photo IDs')
  invariant((inspectSubmit.text.match(/setClientSubmissionId\(crypto\.randomUUID\(\)\)/g) ?? []).length === 1,
    'inspection form must rotate its UUID exactly once after success')
  assertContains(compact(inspection.source), 'disabled={pending||photoBusy||!online||!draftReady}', 'inspection submit must wait for draft identity and connectivity')

  const rfiSubmit = functionText(rfi, 'onSubmit')
  assertOrder(rfiSubmit.text, [
    'if(inFlightRef.current)return', 'inFlightRef.current=true', 'startTransition',
    'addInspectionRfi(opportunityId,inspectionId,formData)', 'if(!result.ok)', 'return',
    "setDescription('')", "setPriority('minor')", 'setRetryKey(crypto.randomUUID())',
    'catch', 'finally', 'inFlightRef.current=false',
  ], 'RFI form must single-flight and retain fields/key on failure')
  invariant((rfiSubmit.text.match(/setRetryKey\(crypto\.randomUUID\(\)\)/g) ?? []).length === 1,
    'RFI form must rotate its key exactly once after success')
  assertContains(compact(rfi.source), 'name="submission_id"value={retryKey}', 'RFI form must mount the stable server-seeded UUID')
}

function verifyService(graph) {
  const unit = graph.get(FILES.service)
  const inspection = methodText(unit, 'submitInspection')
  const rfi = methodText(unit, 'createRfi')
  for (const [label, data] of [['inspection', inspection], ['RFI', rfi]]) {
    invariant((data.node.getText().match(/this\.store\.transaction\s*\(/g) ?? []).length === 1,
      `${label} command must use exactly one transaction`)
    const transactionCall = callExpressions(data.node).find((call) => compact(call.expression) === 'this.store.transaction')
    const transactionCallback = transactionCall?.arguments[0] && unwrap(transactionCall.arguments[0])
    invariant(transactionCallback && (ts.isArrowFunction(transactionCallback) || ts.isFunctionExpression(transactionCallback)),
      `${label} command must expose one inspectable transaction callback`)
    invariant(!descendants(transactionCallback).some(ts.isCatchClause),
      `${label} transaction must not swallow an atomic effect failure`)
    assertContains(data.text, 'returnawaitthis.store.transaction', `${label} command must return the transaction result`)
    assertOrder(data.text, [
      'transaction.lockMembership(principal.data)',
      "roleHasCapability(membership.role,'site_inspection.submit')",
      'transaction.lockCommand(membership.tenantId,keyHash)',
      'transaction.lockOpportunity(membership.tenantId,command.data.opportunityId)',
    ], `${label} command must authorize current membership before tenant locks and effects`)
    assertContains(data.text, "canonicalJson({tenantId:principal.data.tenantId,submissionId:command.data.submissionId})",
      `${label} idempotency key must bind tenant and the full UUID`)
    assertContains(data.text, 'canonicalJson({tenantId:principal.data.tenantId,actorId:principal.data.userId,command:',
      `${label} command hash must bind tenant, actor, and full command`)
  }
  assertContains(inspection.text, 'constphotoDocumentIds=[...command.data.photoDocumentIds].sort()', 'inspection hash must canonicalize the full photo set')
  assertContains(inspection.text, 'transaction.hasPprf(membership.tenantId,opportunity.id)', 'inspection requires tenant-bound PPRF')
  assertContains(inspection.text, 'transaction.loadPhotoDocuments(membership.tenantId,photoDocumentIds)', 'inspection must load exact tenant-bound photos')
  for (const token of ['row.tenantId===membership.tenantId', 'row.opportunityId===opportunity.id', 'row.projectId===opportunity.projectId']) {
    assertContains(inspection.text, token, 'inspection photo authorization must require safe tenant/opportunity/project binding')
  }
  assertContains(
    inspection.text,
    'notification_recipient_set_hash:notificationRecipientSetHash(notificationRecipientIds)',
    'inspection receipt must commit original notification recipient hash',
  )
  assertContains(
    inspection.text,
    'notification_recipient_count:notificationRecipientIds.length',
    'inspection receipt must commit original notification recipient count',
  )
  assertOrder(inspection.text, [
    'transaction.createInspection', 'transaction.createPhotoLinks',
    'transaction.findDesignRecipients', 'newMap(recipients.map',
    "recipient.role!=='design'", '.map((recipient)=>recipient.id)', '.sort()',
    'siteInspectionReceiptSchema.parse',
    'notification_recipient_set_hash:notificationRecipientSetHash(notificationRecipientIds)',
    'notification_recipient_count:notificationRecipientIds.length',
    'transaction.writeAudit', 'transaction.ensureDesignHandoffSla',
    'transaction.createNotification',
  ], 'inspection durable effects must be atomic and Design-only')
  assertOrder(rfi.text, [
    'transaction.lockInspection', 'inspection.opportunityId!==opportunity.id',
    'transaction.createRfi', 'siteInspectionRfiReceiptSchema.parse', 'transaction.writeAudit',
  ], 'RFI durable effects must be tenant/opportunity bound and atomic')

  const inspectionReceipt = compact(unit.variableInitializer('siteInspectionReceiptSchema')?.getText() ?? '')
  const rfiReceipt = compact(unit.variableInitializer('siteInspectionRfiReceiptSchema')?.getText() ?? '')
  for (const [label, receipt, required] of [
    ['inspection', inspectionReceipt, ['idempotency_key_hash', 'command_hash', 'tenant_id', 'actor_id', 'opportunity_id', 'inspection_id', 'linked_photo_count', 'notification_recipient_set_hash', 'notification_recipient_count']],
    ['RFI', rfiReceipt, ['idempotency_key_hash', 'command_hash', 'tenant_id', 'actor_id', 'opportunity_id', 'inspection_id', 'rfi_id', 'priority']],
  ]) {
    assertContains(receipt, '.strict()', `${label} receipt must reject added/raw payload fields`)
    for (const field of required) assertContains(receipt, `${field}:`, `${label} receipt must contain ${field}`)
    invariant(!['submission_id:', 'description:', 'payload:', 'photo_document_ids:', 'landlord_contact:', 'notification_recipient_ids:', 'recipient_user_id:', 'recipient_email:'].some((field) => receipt.includes(field)),
      `${label} receipt must not persist raw recipient identity, keys, or free-form payload`)
  }
  assertContains(
    inspectionReceipt,
    'notification_recipient_set_hash:z.string().regex(HASH)',
    'notification recipient set hash must be strict SHA-256',
  )
  assertContains(
    inspectionReceipt,
    'notification_recipient_count:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)',
    'notification recipient count must be a strict bounded non-negative integer',
  )
  assertContains(compact(unit.source), "constHASH=/^[a-f0-9]{64}$/", 'receipt hashes must be full SHA-256 hex digests')
  assertContains(compact(unit.source), "createHash('sha256').update(value).digest('hex')", 'command receipts must use SHA-256')
  const recipientHash = functionText(unit, 'notificationRecipientSetHash').text
  assertContains(recipientHash, 'returnsha256(canonicalJson([...recipientIds].sort()))',
    'notification recipient hashes must canonicalize the sorted original set')

  const lockCommand = unit.classMethod('DrizzleSiteInspectionWorkflowTransaction', 'lockCommand')
  invariant(lockCommand, 'database adapter must implement the command advisory lock')
  const lockText = compact(lockCommand)
  assertContains(lockText, 'pg_advisory_xact_lock', 'database adapter must use a transaction-scoped advisory lock')
  assertContains(lockText, "'site-inspection-command:'+tenantId+':'+keyHash", 'advisory lock must bind tenant and the full key hash')

  const replayInspection = methodText(unit, 'replayInspection').text
  const replayRfi = methodText(unit, 'replayRfi').text
  for (const [label, replay] of [['inspection', replayInspection], ['RFI', replayRfi]]) {
    assertContains(replay, 'receipt.data.command_hash!==input.commandHash', `${label} replay must conflict on a changed command`)
    assertContains(replay, 'receipt.data.idempotency_key_hash!==input.keyHash', `${label} replay must validate the full key hash`)
    assertContains(replay, 'receipt.data.tenant_id!==input.tenantId', `${label} replay must validate tenant scope`)
    assertContains(replay, 'receipt.data.actor_id!==input.actorId', `${label} replay must validate actor scope`)
  }
  for (const token of ['transaction.loadInspection', 'transaction.countInspectionPhotos', 'transaction.hasOpenDesignHandoffSla', 'transaction.findNotifiedDesignRecipientIds']) {
    assertContains(replayInspection, token, 'inspection replay must validate the complete durable result')
  }
  invariant(!replayInspection.includes('findDesignRecipients'), 'inspection replay must not query current Design membership')
  assertContains(replayInspection, 'newSet(notified).size===notified.length', 'persisted notification rows must be unique')
  assertContains(replayInspection, 'notified.length===receipt.data.notification_recipient_count', 'persisted notification count must match the original receipt')
  assertContains(replayInspection, 'notificationRecipientSetHash(notified)===receipt.data.notification_recipient_set_hash', 'persisted notification hash must match the original receipt')
  assertContains(replayRfi, 'transaction.loadRfi', 'RFI replay must validate the durable row')
}

function verifyEvidence(graph) {
  const tests = [
    graph.get(FILES.actionTest).source,
    graph.get(FILES.pageTest).source,
    graph.get(FILES.inspectionFormTest).source,
    graph.get(FILES.rfiFormTest).source,
    graph.get(FILES.serviceTest).source,
  ].join('\n')
  for (const phrase of [
    'projects exact inspection mutation authority for %s',
    'projects exact RFI mutation authority for %s',
    'rejects unknown, duplicate, and hostile inspection fields before service',
    'keeps committed inspection and RFI success when refresh fails',
    'reports archive failure as a warning without reversing committed success',
    'projects exact mutation controls for %s',
    'uses a synchronous single-flight guard and keeps drafts on failure',
    'contains thrown failures, clears stale state, retains input, and guards double submit',
    'rolls back every inspection effect when %s fails',
    'serializes concurrent retries into one effect set',
    'serializes concurrent same-key calls',
    'replays without duplicate effects and conflicts on changed payload/photo set',
    'replays exactly and conflicts on changed description or priority',
    'stores only hashes and durable IDs, never raw keys/free text/photo IDs',
    'replays exactly after the current Design roster is %s',
    'rejects %s persisted notification rows independently of the current roster',
    'rejects a receipt with %s',
    'preserves one open SLA, allows zero Design recipients, and de-duplicates recipients',
  ]) invariant(tests.includes(phrase), `focused evidence is missing: ${phrase}`)
  for (const scenario of ['added', 'removed', 'reordered']) {
    invariant(tests.includes(`['${scenario}',`), `focused evidence is missing: ${scenario} Design roster churn`)
  }
  for (const scenario of ['missing', 'extra', 'wrong']) {
    invariant(tests.includes(`['${scenario}',`), `focused evidence is missing: ${scenario} persisted notification`)
  }
  invariant(tests.includes('notification_recipient_set_hash'), 'focused evidence is missing: receipt recipient hash')
  invariant(tests.includes('notification_recipient_count'), 'focused evidence is missing: receipt recipient count')
}

export function verifyWo12Contract({ root = process.cwd(), overrides = {} } = {}) {
  const graph = new SourceGraph(root, overrides)
  verifyAuthorization(graph)
  verifyAction(graph)
  verifyPage(graph)
  verifyForms(graph)
  verifyService(graph)
  verifyEvidence(graph)
  return {
    roles: ALL_ROLES.length,
    mutationRoles: MUTATION_ROLES.length,
    deniedRoles: ALL_ROLES.length - MUTATION_ROLES.length,
    mountedActions: 2,
    mountedForms: 2,
    serviceCommands: 2,
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (invokedDirectly) {
  const result = verifyWo12Contract()
  console.log(
    `WO-12 contract passed: ${result.roles} roles (${result.mutationRoles} mutate/${result.deniedRoles} read-only), ` +
    `${result.mountedActions} actions, ${result.mountedForms} forms, ${result.serviceCommands} atomic commands`,
  )
}
