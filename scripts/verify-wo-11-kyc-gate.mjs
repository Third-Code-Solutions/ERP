import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

function read(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function invariant(condition, label) {
  if (!condition) throw new Error(`WO-11 invariant missing: ${label}`)
}

function assertIncludes(source, pattern, label) {
  invariant(source.includes(pattern), label)
}

function assertNotMatches(source, pattern, label) {
  if (pattern.test(source)) throw new Error(`WO-11 forbidden pattern: ${label}`)
}

function parseTypescript(source, fileName) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  invariant(sourceFile.parseDiagnostics.length === 0, `${fileName} parses`)
  return sourceFile
}

function descendants(root, predicate) {
  const matches = []
  function visit(node) {
    if (predicate(node)) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(root)
  return matches
}

function oneDescendant(root, predicate, label) {
  const matches = descendants(root, predicate)
  invariant(matches.length === 1, label)
  return matches[0]
}

function unwrapExpression(node) {
  let current = node
  while (
    ts.isAwaitExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression
  }
  return current
}

function expressionPath(node) {
  const current = unwrapExpression(node)
  if (ts.isIdentifier(current)) return current.text
  if (current.kind === ts.SyntaxKind.ThisKeyword) return 'this'
  if (ts.isPropertyAccessExpression(current)) {
    const receiver = expressionPath(current.expression)
    return receiver ? `${receiver}.${current.name.text}` : current.name.text
  }
  return undefined
}

function isPath(node, expected) {
  return expressionPath(node) === expected
}

function callName(call) {
  const expression = unwrapExpression(call.expression)
  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text
  return undefined
}

function calls(root, name) {
  return descendants(
    root,
    (node) => ts.isCallExpression(node) && callName(node) === name
  )
}

function hasCall(root, name, argumentsMatch = () => true) {
  return calls(root, name).some((call) => argumentsMatch(call.arguments, call))
}

function hasMethodCall(root, receiverPath, methodName, argumentsMatch = () => true) {
  return descendants(root, (node) => {
    if (!ts.isCallExpression(node)) return false
    const expression = unwrapExpression(node.expression)
    return (
      ts.isPropertyAccessExpression(expression) &&
      expressionPath(expression.expression) === receiverPath &&
      expression.name.text === methodName &&
      argumentsMatch(node.arguments, node)
    )
  }).length > 0
}

function hasEq(root, leftPath, rightPath) {
  return hasCall(
    root,
    'eq',
    (args) =>
      args.length === 2 &&
      ((isPath(args[0], leftPath) && isPath(args[1], rightPath)) ||
        (isPath(args[0], rightPath) && isPath(args[1], leftPath)))
  )
}

function hasStringLiteral(root, value) {
  return descendants(
    root,
    (node) => ts.isStringLiteralLike(node) && node.text === value
  ).length > 0
}

function hasIdentifier(root, name) {
  return descendants(root, (node) => ts.isIdentifier(node) && node.text === name)
    .length > 0
}

function hasBinary(root, leftPath, operatorKind, rightPath) {
  return descendants(root, (node) => {
    if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== operatorKind) {
      return false
    }
    if (!isPath(node.left, leftPath)) return false
    return rightPath === undefined || isPath(node.right, rightPath)
  }).length > 0
}

function variable(root, name, label) {
  return oneDescendant(
    root,
    (node) =>
      ts.isVariableDeclaration(node) &&
      ((ts.isIdentifier(node.name) && node.name.text === name) ||
        (ts.isArrayBindingPattern(node.name) &&
          node.name.elements.some(
            (element) =>
              ts.isBindingElement(element) &&
              ts.isIdentifier(element.name) &&
              element.name.text === name
          ))),
    label
  )
}

function namedFunction(sourceFile, name, label) {
  return oneDescendant(
    sourceFile,
    (node) =>
      ts.isFunctionDeclaration(node) &&
      node.name?.text === name,
    label
  )
}

function namedMethod(sourceFile, name, label) {
  return oneDescendant(
    sourceFile,
    (node) =>
      ts.isMethodDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name,
    label
  )
}

function ifStatements(root) {
  return descendants(root, ts.isIfStatement)
}

function hasNegatedIdentifier(node, name) {
  return descendants(
    node,
    (candidate) =>
      ts.isPrefixUnaryExpression(candidate) &&
      candidate.operator === ts.SyntaxKind.ExclamationToken &&
      isPath(candidate.operand, name)
  ).length > 0
}

export function verifyCoreStageAuthority(source) {
  const sourceFile = parseTypescript(
    source,
    'apps/api/src/crm/opportunity-stage-transition.service.ts'
  )
  const transition = namedMethod(
    sourceFile,
    'transitionInTransaction',
    'authoritative Core transition method'
  )

  const account = variable(transition, 'account', 'linked Account query')
  invariant(account.initializer, 'linked Account query initializer')
  invariant(
    hasCall(account.initializer, 'from', (args) => args.some((arg) => isPath(arg, 'accounts'))),
    'linked Account query uses Accounts'
  )
  invariant(
    hasEq(account.initializer, 'accounts.id', 'opportunity.accountId'),
    'linked Account query matches Opportunity Account'
  )
  invariant(
    hasEq(
      account.initializer,
      'accounts.tenant_id',
      'authorizedPrincipal.tenantId'
    ),
    'linked Account query is tenant scoped'
  )
  invariant(
    hasCall(
      account.initializer,
      'for',
      (args) => args.length === 1 && hasStringLiteral(args[0], 'share')
    ),
    'linked Account query is locked'
  )
  const missingAccount = ifStatements(transition).find(
    (statement) =>
      hasNegatedIdentifier(statement.expression, 'account') &&
      hasIdentifier(statement.thenStatement, 'INVALID_LINKED_ACCOUNT_MESSAGE') &&
      hasIdentifier(statement.thenStatement, 'ConflictException')
  )
  invariant(missingAccount, 'invalid linked Account fails closed')

  const kycGate = ifStatements(transition).find(
    (statement) =>
      hasMethodCall(
        statement.expression,
        'KYC_GATED_STAGES',
        'has',
        (args) => args.length === 1 && isPath(args[0], 'command.newStage')
      ) && hasIdentifier(statement.expression, 'accountId')
  )
  invariant(kycGate, 'Core downstream-stage KYC gate')

  const tracks = variable(kycGate.thenStatement, 'kycTracks', 'Core KYC track query')
  invariant(tracks.initializer, 'Core KYC track query initializer')
  invariant(
    hasCall(
      tracks.initializer,
      'from',
      (args) => args.some((arg) => isPath(arg, 'opportunityKycTracks'))
    ),
    'Core KYC query uses Opportunity tracks'
  )
  invariant(
    hasEq(
      tracks.initializer,
      'opportunityKycTracks.opportunity_id',
      'opportunityId'
    ),
    'Core KYC query is Opportunity scoped'
  )
  invariant(
    hasEq(
      tracks.initializer,
      'opportunityKycTracks.tenant_id',
      'authorizedPrincipal.tenantId'
    ),
    'Core KYC query is tenant scoped'
  )

  const dualTrackBranch = ifStatements(kycGate.thenStatement).find(
    (statement) =>
      statement.elseStatement &&
      hasBinary(
        statement.expression,
        'kycTracks.length',
        ts.SyntaxKind.GreaterThanToken,
        undefined
      )
  )
  invariant(dualTrackBranch, 'dual-track and legacy KYC branches')
  invariant(
    hasMethodCall(
      dualTrackBranch.thenStatement,
      'OPPORTUNITY_KYC_TRACK_TYPES',
      'every'
    ),
    'both canonical KYC track types are required'
  )
  invariant(
    hasBinary(
      dualTrackBranch.thenStatement,
      'track.status',
      ts.SyntaxKind.EqualsEqualsEqualsToken,
      undefined
    ) && hasStringLiteral(dualTrackBranch.thenStatement, 'approved'),
    'only approved KYC tracks satisfy the dual-track gate'
  )
  invariant(
    hasStringLiteral(
      dualTrackBranch.thenStatement,
      'Pipeline locked until both Finance tracks are approved'
    ),
    'dual-track rejection is visible'
  )
  invariant(
    hasBinary(
      dualTrackBranch.elseStatement,
      'linkedAccount.kycStatus',
      ts.SyntaxKind.EqualsEqualsEqualsToken,
      undefined
    ) &&
      hasStringLiteral(dualTrackBranch.elseStatement, 'approved') &&
      hasStringLiteral(dualTrackBranch.elseStatement, 'not_required'),
    'legacy Account KYC compatibility gate'
  )
  invariant(
    hasStringLiteral(
      dualTrackBranch.elseStatement,
      'Account KYC must be Approved before this stage'
    ),
    'legacy KYC rejection is visible'
  )

  const allowed = variable(transition, 'allowed', 'stage transition rule lookup')
  invariant(
    allowed.initializer && hasIdentifier(allowed.initializer, 'STAGE_TRANSITIONS'),
    'stage transition rules come from the shared state machine'
  )
  invariant(
    ifStatements(transition).some(
      (statement) =>
        hasNegatedIdentifier(statement.expression, 'reason') &&
        hasIdentifier(statement.expression, 'isRegression') &&
        hasIdentifier(statement.expression, 'isClosingLost') &&
        hasStringLiteral(statement.thenStatement, 'reason_required')
    ),
    'regression and Lost transitions require a reason'
  )
  invariant(
    hasMethodCall(
      transition,
      'transaction',
      'update',
      (args) => args.some((arg) => isPath(arg, 'opportunities'))
    ),
    'Core owns Opportunity stage persistence'
  )
  invariant(
    hasMethodCall(transition, 'this.audit', 'writeSemantic'),
    'Core records the stage audit atomically'
  )
  invariant(
    hasMethodCall(transition, 'this', 'stopStageClock') &&
      hasMethodCall(transition, 'this', 'startStageClock'),
    'Core owns stage SLA rollover'
  )
}

export function verifyWebStageDelegation(source) {
  const sourceFile = parseTypescript(
    source,
    'apps/web/src/app/(dashboard)/pipeline/actions.ts'
  )
  const action = namedFunction(
    sourceFile,
    'advanceOpportunityStage',
    'Web advanceOpportunityStage action'
  )

  const selectorCalls = calls(action, 'opportunityStageWritesUseCoreApi')
  invariant(selectorCalls.length === 1, 'one exact Core stage-write selector')
  invariant(
    selectorCalls[0].arguments.length === 1 &&
      isPath(selectorCalls[0].arguments[0], 'profile.tenantId'),
    'Core stage-write selector is tenant scoped'
  )
  invariant(
    ifStatements(action).some((statement) =>
      hasNegatedIdentifier(statement.expression, 'coreSelected')
    ),
    'disabled Core selection fails closed'
  )

  const coreCalls = calls(action, 'transitionOpportunityStageThroughCoreApi')
  invariant(coreCalls.length === 1, 'all stage transitions have one Core delegate')
  const coreCall = coreCalls[0]
  invariant(
    coreCall.arguments.length === 3 &&
      isPath(coreCall.arguments[0], 'opportunityId') &&
      hasIdentifier(coreCall.arguments[1], 'newStage') &&
      hasIdentifier(coreCall.arguments[1], 'reason') &&
      callName(unwrapExpression(coreCall.arguments[2])) ===
        'stageTransitionIdempotencyKey',
    'Core delegate receives the selected stage command and idempotency key'
  )
  const wonBranch = variable(action, 'isWonTransition', 'Won result branch')
  invariant(
    coreCall.pos < wonBranch.pos,
    'Core delegation occurs before Won/non-Won result branching'
  )
  invariant(
    ifStatements(action).some(
      (statement) =>
        hasNegatedIdentifier(statement.expression, 'transition.ok') &&
        hasIdentifier(statement.thenStatement, 'error')
    ),
    'Core rejection returns without a fallback writer'
  )

  const forbiddenLocalCalls = [
    'writeAuditLog',
    'startSlaClock',
    'stopSlaClock',
    'legacyConvertOpportunityToProject',
  ]
  for (const name of forbiddenLocalCalls) {
    invariant(calls(action, name).length === 0, `no Web-local ${name} fallback`)
  }
  invariant(
    !hasMethodCall(
      action,
      'db',
      'update',
      (args) => args.some((arg) => isPath(arg, 'opportunities'))
    ),
    'no Web-local Opportunity stage writer'
  )

  invariant(
    hasBinary(
      action,
      'data.opportunityId',
      ts.SyntaxKind.EqualsEqualsEqualsToken,
      'opportunityId'
    ) &&
      hasBinary(
        action,
        'data.tenantId',
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        'profile.tenantId'
      ) &&
      hasBinary(
        action,
        'data.toStage',
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        'nextStageTyped'
      ),
    'Web validates Core result identity'
  )
  invariant(
    hasIdentifier(action, 'STAGE_TRANSITIONS') &&
      hasCall(action, 'includes', (args) =>
        args.some((arg) => isPath(arg, 'nextStageTyped'))
      ),
    'Web validates the returned non-Won transition edge'
  )
}

export function verifyWo11Contract(root = process.cwd()) {
  const migration = read(
    root,
    'supabase/migrations/20260813130000_wo_11_opportunity_kyc_tracks.sql'
  )
  assertIncludes(
    migration,
    'create table if not exists public.opportunity_kyc_tracks',
    'dual-track table'
  )
  assertIncludes(migration, "'financial_evaluation'", 'Financial Evaluation track')
  assertIncludes(migration, "'credit_investigation'", 'Credit Investigation track')
  assertIncludes(
    migration,
    'unique (tenant_id, opportunity_id, track_type)',
    'one track per type'
  )
  assertIncludes(
    migration,
    'opportunity_kyc_tracks_opportunity_tenant_fk',
    'tenant-safe opportunity link'
  )
  assertIncludes(
    migration,
    'alter table public.opportunity_kyc_tracks enable row level security',
    'RLS'
  )
  assertIncludes(migration, 'audit_opportunity_kyc_tracks', 'audit trigger')
  assertNotMatches(
    migration,
    /\b(drop|truncate)\s+(table|index|constraint|trigger|function)\b/i,
    'destructive migration operation'
  )

  const intake = read(
    root,
    'apps/web/src/app/(dashboard)/crm/opportunities/new/pprf/actions.ts'
  )
  assertIncludes(intake, 'pprfSubmissions', 'structured PPRF persistence')
  assertIncludes(intake, 'initializeOpportunityKycTracks', 'two-track initialization')
  assertIncludes(intake, 'await db.transaction', 'atomic client/opportunity/PPRF transaction')
  assertIncludes(intake, "source: 'pprf_intake'", 'PPRF provenance audit')
  assertIncludes(intake, 'BigInt', 'integer-safe monetary conversion')
  assertNotMatches(
    intake,
    /parseFloat|Math\.round\([^\n]*\*\s*100/,
    'floating-point peso conversion'
  )

  const kyc = read(root, 'apps/web/src/lib/operations/opportunity-kyc.ts')
  assertIncludes(kyc, 'OPPORTUNITY_KYC_TRACK_TYPES.length', 'both-track completeness gate')
  assertIncludes(kyc, "track.status !== 'approved'", 'non-approved lock')
  assertIncludes(kyc, 'decision_reason', 'visible block reason')
  assertIncludes(kyc, 'opportunity.kyc_track_manage', 'review capability gate')
  assertIncludes(kyc, 'opportunity.kyc_track_approve', 'President decision capability gate')
  assertIncludes(kyc, 'writeAuditLogInTransaction', 'track audit')

  verifyCoreStageAuthority(
    read(root, 'apps/api/src/crm/opportunity-stage-transition.service.ts')
  )
  verifyWebStageDelegation(
    read(root, 'apps/web/src/app/(dashboard)/pipeline/actions.ts')
  )

  const board = read(root, 'apps/web/src/app/(dashboard)/pipeline/board/page.tsx')
  assertIncludes(board, 'opportunityKycTracks', 'board track projection')
  assertIncludes(board, 'opportunity_kyc_gate', 'board reason projection')

  const client = read(root, 'apps/web/src/components/pipeline/pipeline-board.tsx')
  assertIncludes(client, 'card.opportunity_kyc_initialized', 'client dual-track awareness')
  assertIncludes(client, 'card.opportunity_kyc_gate', 'client visible dual-track reason')

  console.log(
    'WO-11 PPRF, Core-authoritative KYC/state rules, Web Core-only delegation, and visible-reason invariants passed'
  )
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  verifyWo11Contract()
}
