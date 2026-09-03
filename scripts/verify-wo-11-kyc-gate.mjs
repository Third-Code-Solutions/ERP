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
  const scriptKind = fileName.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
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
    ts.isSatisfiesExpression(current) ||
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

function isExportedFunction(node) {
  return (
    ts.isFunctionDeclaration(node) &&
    node.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
    ) === true
  )
}

function objectProperty(object, name) {
  return object.properties.find(
    (property) =>
      ts.isPropertyAssignment(property) &&
      ((ts.isIdentifier(property.name) && property.name.text === name) ||
        (ts.isStringLiteralLike(property.name) && property.name.text === name))
  )
}

function arrayLiteralValues(expression) {
  const current = unwrapExpression(expression)
  if (!ts.isArrayLiteralExpression(current)) return undefined
  return current.elements.flatMap((element) => {
    const value = unwrapExpression(element)
    return ts.isStringLiteralLike(value) ? [value.text] : []
  })
}

function hasNamedImport(sourceFile, moduleName, importedName) {
  return descendants(sourceFile, ts.isImportDeclaration).some((declaration) => {
    if (
      !ts.isStringLiteralLike(declaration.moduleSpecifier) ||
      declaration.moduleSpecifier.text !== moduleName
    ) {
      return false
    }
    const bindings = declaration.importClause?.namedBindings
    return (
      bindings !== undefined &&
      ts.isNamedImports(bindings) &&
      bindings.elements.some(
        (element) => (element.propertyName ?? element.name).text === importedName
      )
    )
  })
}

function importedLocalNames(sourceFile, moduleName, importedName) {
  return new Set(
    descendants(sourceFile, ts.isImportDeclaration).flatMap((declaration) => {
      if (
        !ts.isStringLiteralLike(declaration.moduleSpecifier) ||
        (moduleName !== undefined &&
          declaration.moduleSpecifier.text !== moduleName)
      ) {
        return []
      }
      const bindings = declaration.importClause?.namedBindings
      if (!bindings || !ts.isNamedImports(bindings)) return []
      return bindings.elements.flatMap((element) =>
        (element.propertyName ?? element.name).text === importedName
          ? [element.name.text]
          : []
      )
    })
  )
}

function functionMap(sourceFile) {
  return new Map(
    descendants(sourceFile, ts.isFunctionDeclaration).flatMap((declaration) =>
      declaration.name ? [[declaration.name.text, declaration]] : []
    )
  )
}

function reachableFunctionDeclarations(sourceFile, entryPoint) {
  const functions = functionMap(sourceFile)
  const pending = [entryPoint]
  const visited = new Set()
  const reachable = []
  while (pending.length > 0) {
    const name = pending.pop()
    if (!name || visited.has(name)) continue
    visited.add(name)
    const declaration = functions.get(name)
    if (!declaration) continue
    reachable.push(declaration)
    for (const call of descendants(declaration, ts.isCallExpression)) {
      const calledName = callName(call)
      if (calledName && functions.has(calledName)) pending.push(calledName)
    }
  }
  return reachable
}

function callsReachableFrom(sourceFile, entryPoint, name) {
  return reachableFunctionDeclarations(sourceFile, entryPoint).flatMap((declaration) =>
    calls(declaration, name)
  )
}

function callsReachableByNames(sourceFile, entryPoint, names) {
  return [...names].flatMap((name) =>
    callsReachableFrom(sourceFile, entryPoint, name)
  )
}

function hasOpportunityUpdate(root, opportunityNames = new Set(['opportunities'])) {
  return descendants(root, ts.isCallExpression).some((call) => {
    const expression = unwrapExpression(call.expression)
    return (
      ts.isPropertyAccessExpression(expression) &&
      expression.name.text === 'update' &&
      call.arguments.some(
        (argument) =>
          ts.isIdentifier(unwrapExpression(argument)) &&
          opportunityNames.has(unwrapExpression(argument).text)
      )
    )
  })
}

function hasNegatedPath(node, path) {
  return descendants(
    node,
    (candidate) =>
      ts.isPrefixUnaryExpression(candidate) &&
      candidate.operator === ts.SyntaxKind.ExclamationToken &&
      isPath(candidate.operand, path)
  ).length > 0
}

function hasCallWithArguments(root, name, expectedArguments) {
  return hasCall(
    root,
    name,
    (args) =>
      args.length === expectedArguments.length &&
      args.every((argument, index) => {
        const expected = expectedArguments[index]
        return expected.literal !== undefined
          ? ts.isStringLiteralLike(unwrapExpression(argument)) &&
              unwrapExpression(argument).text === expected.literal
          : isPath(argument, expected.path)
      })
  )
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

export const OPPORTUNITY_STAGE_MUTATION_ENTRY_POINTS = Object.freeze([
  Object.freeze({
    surface: 'Pipeline',
    actionPath: 'apps/web/src/app/(dashboard)/pipeline/actions.ts',
    actionName: 'advanceOpportunityStage',
  }),
  Object.freeze({
    surface: 'Project detail',
    actionPath:
      'apps/web/src/app/(dashboard)/projects/[id]/opportunities/actions.ts',
    actionName: 'transitionStage',
    panelPath: 'apps/web/src/components/opportunities/opportunity-panel.tsx',
  }),
])

function verifyStageActionDelegation(source, config) {
  const sourceFile = parseTypescript(source, config.actionPath)
  const reachable = reachableFunctionDeclarations(sourceFile, config.actionName)
  invariant(reachable.length > 0, `${config.surface} stage action exists`)
  const action = namedFunction(
    sourceFile,
    config.actionName,
    `${config.surface} stage action`
  )

  const selectorNames = importedLocalNames(
    sourceFile,
    '@/lib/erp-core-client',
    'opportunityStageWritesUseCoreApi'
  )
  invariant(
    selectorNames.size === 1,
    `${config.surface} imports one Core stage-write selector`
  )
  const selectorCalls = callsReachableByNames(
    sourceFile,
    config.actionName,
    selectorNames
  )
  invariant(
    selectorCalls.length === 1,
    `${config.surface} has one exact Core stage-write selector`
  )
  invariant(
    selectorCalls[0].arguments.length === 1 &&
      isPath(selectorCalls[0].arguments[0], 'profile.tenantId'),
    `${config.surface} Core stage-write selector is tenant scoped`
  )
  invariant(
    ifStatements(action).some((statement) =>
      hasNegatedPath(statement.expression, 'coreSelected')
    ),
    `${config.surface} disabled Core selection fails closed`
  )

  const coreDelegateNames = importedLocalNames(
    sourceFile,
    '@/lib/erp-core-client',
    'transitionOpportunityStageThroughCoreApi'
  )
  invariant(
    coreDelegateNames.size === 1,
    `${config.surface} imports one Core stage delegate`
  )
  const coreCalls = callsReachableByNames(
    sourceFile,
    config.actionName,
    coreDelegateNames
  )
  invariant(
    coreCalls.length === 1,
    `${config.surface} stage action has one Core delegate`
  )
  const coreCall = coreCalls[0]
  invariant(
    coreCall.arguments.length === 3 &&
      isPath(coreCall.arguments[0], config.opportunityIdPath) &&
      (isPath(coreCall.arguments[1], config.commandPath) ||
        hasIdentifier(coreCall.arguments[1], 'newStage')) &&
      callName(unwrapExpression(coreCall.arguments[2])) === config.idempotencyKey,
    `${config.surface} Core delegate receives the selected command and idempotency key`
  )
  invariant(
    ifStatements(action).some(
      (statement) =>
        hasNegatedPath(statement.expression, 'transition.ok') &&
        hasIdentifier(statement.thenStatement, 'error')
    ),
    `${config.surface} Core rejection returns without a fallback writer`
  )

  const opportunityNames = importedLocalNames(
    sourceFile,
    '@third-code-erp/database/schema',
    'opportunities'
  )
  for (const declaration of reachable) {
    invariant(
      !hasOpportunityUpdate(declaration, opportunityNames),
      `${config.surface} has no Web-local Opportunity stage writer`
    )
  }
  const forbiddenLocalCalls = [
    'writeAuditLog',
    'writeAuditLogInTransaction',
    'startSlaClock',
    'stopSlaClock',
    'legacyConvertOpportunityToProject',
  ]
  for (const name of forbiddenLocalCalls) {
    const localNames = importedLocalNames(sourceFile, undefined, name)
    localNames.add(name)
    invariant(
      callsReachableByNames(sourceFile, config.actionName, localNames).length ===
        0,
      `${config.surface} has no Web-local ${name} fallback`
    )
  }

  invariant(
    hasIdentifier(action, 'STAGE_TRANSITIONS') &&
      hasCall(action, 'includes', (args) =>
        args.some((arg) => isPath(arg, config.nextStagePath))
      ),
    `${config.surface} validates the returned shared transition edge`
  )

  if (config.surface === 'Pipeline') {
    const wonBranch = variable(action, 'isWonTransition', 'Won result branch')
    invariant(
      coreCall.pos < wonBranch.pos,
      'Pipeline Core delegation occurs before Won/non-Won result branching'
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
      'Pipeline validates Core result identity'
    )
  } else {
    const command = variable(action, 'command', 'Project detail Core command')
    invariant(
      command.initializer &&
        hasIdentifier(command.initializer, 'newStage') &&
        hasIdentifier(command.initializer, 'reason') &&
        hasIdentifier(command.initializer, 'tcvCents') &&
        hasIdentifier(command.initializer, 'gpCents') &&
        hasIdentifier(command.initializer, 'closingDate'),
      'Project detail forwards the complete atomic stage command'
    )
    invariant(
      hasBinary(
        action,
        'data.opportunityId',
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        'input.opportunity_id'
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
          'input.new_stage'
        ),
      'Project detail validates Core result identity'
    )
  }
}

export function verifyWebStageDelegation(source) {
  verifyStageActionDelegation(source, {
    ...OPPORTUNITY_STAGE_MUTATION_ENTRY_POINTS[0],
    opportunityIdPath: 'opportunityId',
    nextStagePath: 'nextStageTyped',
    idempotencyKey: 'stageTransitionIdempotencyKey',
    commandPath: undefined,
  })
}

export function verifyProjectStageDelegation(source) {
  verifyStageActionDelegation(source, {
    ...OPPORTUNITY_STAGE_MUTATION_ENTRY_POINTS[1],
    opportunityIdPath: 'input.opportunity_id',
    nextStagePath: 'input.new_stage',
    idempotencyKey: 'projectStageTransitionIdempotencyKey',
    commandPath: 'command',
  })
}

const OPPORTUNITY_STAGE_VALUES = new Set([
  'opportunity_creation',
  'scoping',
  'resubmission',
  'closed_won',
  'closed_lost',
  'lead',
  'site_survey',
  'design',
  'bom_submission',
  'negotiation',
  'contract',
  'won',
  'lost',
])

function hasDuplicateTransitionTable(sourceFile) {
  return descendants(sourceFile, ts.isVariableDeclaration).some((declaration) => {
    if (!declaration.initializer) return false
    const initializer = unwrapExpression(declaration.initializer)
    if (!ts.isObjectLiteralExpression(initializer)) return false
    return initializer.properties.some((property) => {
      if (!ts.isPropertyAssignment(property)) return false
      const values = arrayLiteralValues(property.initializer)
      return values?.some((value) => OPPORTUNITY_STAGE_VALUES.has(value)) === true
    })
  })
}

function confirmFunctionRequiresReason(sourceFile, functionName) {
  const declaration = namedFunction(
    sourceFile,
    functionName,
    `${functionName} reason handler`
  )
  return calls(declaration, 'submitTransition').some(
    (call) =>
      call.arguments.length >= 3 &&
      isPath(call.arguments[1], 'reason') &&
      unwrapExpression(call.arguments[2]).kind === ts.SyntaxKind.TrueKeyword
  )
}

export function verifyProjectOpportunityPanelContract(panelSource, modelSource) {
  const panelFile = parseTypescript(
    panelSource,
    'apps/web/src/components/opportunities/opportunity-panel.tsx'
  )
  const modelFile = parseTypescript(
    modelSource,
    'apps/web/src/components/opportunities/opportunity-panel-model.ts'
  )

  invariant(
    hasNamedImport(
      panelFile,
      '@/app/(dashboard)/projects/[id]/opportunities/actions',
      'transitionStage'
    ),
    'Project panel mounts the enumerated Project detail stage action'
  )
  invariant(
    !hasNamedImport(panelFile, '@third-code-erp/shared-types', 'STAGE_TRANSITIONS') &&
      !hasDuplicateTransitionTable(panelFile),
    'Project panel has no duplicate transition table'
  )
  invariant(
    hasNamedImport(modelFile, '@third-code-erp/shared-types', 'STAGE_TRANSITIONS') &&
      hasNamedImport(modelFile, '@third-code-erp/shared-types', 'STAGE_LEGACY_MAP') &&
      hasNamedImport(
        modelFile,
        '@/components/pipeline/stage-transition-action',
        'getStageTransitionReasonKind'
      ),
    'Project panel model uses shared transition and reason authority'
  )

  const destinations = namedFunction(
    modelFile,
    'getOpportunityPanelDestinations',
    'Project panel shared destination projection'
  )
  invariant(
    hasIdentifier(destinations, 'STAGE_TRANSITIONS') &&
      hasIdentifier(destinations, 'STAGE_LEGACY_MAP'),
    'Project panel destinations project shared transition edges'
  )
  const classifier = namedFunction(
    modelFile,
    'classifyOpportunityPanelDestination',
    'Project panel shared reason classifier'
  )
  invariant(
    calls(classifier, 'getStageTransitionReasonKind').length === 1 &&
      calls(classifier, 'getOpportunityPanelDestinations').length === 1,
    'Project panel classifier routes shared Lost and regression reasons'
  )

  const panel = namedFunction(panelFile, 'OpportunityPanel', 'OpportunityPanel')
  const handleCreate = namedFunction(panelFile, 'handleCreate', 'Project create handler')
  const handleTransition = namedFunction(
    panelFile,
    'handleTransition',
    'Project transition handler'
  )
  const submitTransition = namedFunction(
    panelFile,
    'submitTransition',
    'Project transition submitter'
  )
  invariant(
    hasIdentifier(panel.parameters[0], 'canCreate') &&
      hasIdentifier(panel.parameters[0], 'canMutate') &&
      ifStatements(handleCreate).some((statement) =>
        hasNegatedPath(statement.expression, 'canCreate')
      ) &&
      ifStatements(handleTransition).some((statement) =>
        hasNegatedPath(statement.expression, 'canMutate')
      ) &&
      ifStatements(submitTransition).some((statement) =>
        hasNegatedPath(statement.expression, 'canMutate')
      ),
    'Project panel mutation callers are permission guarded'
  )
  invariant(
    calls(handleTransition, 'classifyOpportunityPanelDestination').length === 1,
    'Project panel routes transitions through the shared reason classifier'
  )
  invariant(
    calls(submitTransition, 'buildOpportunityTransitionFormData').length === 1 &&
      calls(panel, 'transitionStage').length === 1,
    'Project panel submits one normalized Project detail stage command'
  )
  invariant(
    confirmFunctionRequiresReason(panelFile, 'confirmLost') &&
      confirmFunctionRequiresReason(panelFile, 'confirmRegression'),
    'Project panel requires distinct Lost and regression reasons'
  )
}

const EXPECTED_ERP_ROLES = [
  'owner',
  'estimator',
  'pm',
  'admin',
  'sales',
  'commercial',
  'design',
  'sd_pm_pe',
  'finance',
  'procurement',
  'safety',
  'cx',
  'viewer',
]
const EXPECTED_OPPORTUNITY_MUTATORS = ['owner', 'admin', 'sales']

function assertExactValues(actual, expected, label) {
  invariant(
    actual &&
      actual.length === expected.length &&
      actual.every((value, index) => value === expected[index]),
    label
  )
}

export function verifyProjectOpportunityPermissions(pageSource, authorizationSource) {
  const pageFile = parseTypescript(
    pageSource,
    'apps/web/src/app/(dashboard)/projects/[id]/page.tsx'
  )
  const authorizationFile = parseTypescript(
    authorizationSource,
    'packages/shared-types/src/authorization.ts'
  )
  const roles = variable(authorizationFile, 'ERP_ROLES', 'central ERP role list')
  const roleValues = roles.initializer
    ? arrayLiteralValues(roles.initializer)
    : undefined
  assertExactValues(roleValues, EXPECTED_ERP_ROLES, 'central thirteen-role policy')

  const capabilityRoles = variable(
    authorizationFile,
    'capabilityRoles',
    'central capability role policy'
  )
  const policy = capabilityRoles.initializer
    ? unwrapExpression(capabilityRoles.initializer)
    : undefined
  invariant(
    policy && ts.isObjectLiteralExpression(policy),
    'central capability role policy object'
  )
  for (const capability of [
    'opportunity.create',
    'opportunity.advance_stage',
  ]) {
    const property = objectProperty(policy, capability)
    const values = property ? arrayLiteralValues(property.initializer) : undefined
    assertExactValues(
      values,
      EXPECTED_OPPORTUNITY_MUTATORS,
      `${capability} has exact three-allow/ten-deny policy`
    )
  }

  const permissions = variable(
    pageFile,
    'opportunityPermissions',
    'Project Opportunity permissions'
  )
  const permissionObject = permissions.initializer
    ? unwrapExpression(permissions.initializer)
    : undefined
  invariant(
    permissionObject && ts.isObjectLiteralExpression(permissionObject),
    'Project route permission projection'
  )
  const canCreate = objectProperty(permissionObject, 'canCreate')
  const canMutate = objectProperty(permissionObject, 'canMutate')
  invariant(
    canCreate &&
      hasCallWithArguments(canCreate.initializer, 'can', [
        { path: 'profile.role' },
        { literal: 'opportunity.create' },
      ]),
    'Project route centrally derives create permission'
  )
  invariant(
    canMutate &&
      hasCallWithArguments(canMutate.initializer, 'can', [
        { path: 'profile.role' },
        { literal: 'opportunity.advance_stage' },
      ]),
    'Project route centrally derives mutate permission'
  )

  const mountedPanels = descendants(
    pageFile,
    (node) =>
      ts.isJsxSelfClosingElement(node) &&
      node.tagName.getText(pageFile) === 'OpportunityPanel'
  )
  invariant(mountedPanels.length === 1, 'one mounted Project OpportunityPanel')
  invariant(
    mountedPanels[0].attributes.properties.some(
      (attribute) =>
        ts.isJsxSpreadAttribute(attribute) &&
        isPath(attribute.expression, 'opportunityPermissions')
    ),
    'Project route passes central Opportunity permissions to the panel'
  )
}

function listSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return listSourceFiles(fullPath)
    return /actions\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')
      ? [fullPath]
      : []
  })
}

function enumerateStageMutationActions(root) {
  const appRoot = path.join(root, 'apps/web/src/app')
  return listSourceFiles(appRoot).flatMap((fullPath) => {
    const relativePath = path.relative(root, fullPath).replaceAll('\\', '/')
    const sourceFile = parseTypescript(read(root, relativePath), relativePath)
    const coreDelegateNames = importedLocalNames(
      sourceFile,
      '@/lib/erp-core-client',
      'transitionOpportunityStageThroughCoreApi'
    )
    const opportunityNames = importedLocalNames(
      sourceFile,
      '@third-code-erp/database/schema',
      'opportunities'
    )
    return descendants(sourceFile, isExportedFunction).flatMap((declaration) => {
      if (!declaration.name) return []
      const reachable = reachableFunctionDeclarations(sourceFile, declaration.name.text)
      const hasCoreDelegate =
        callsReachableByNames(
          sourceFile,
          declaration.name.text,
          coreDelegateNames
        ).length > 0
      const hasLocalWriter = reachable.some((candidate) =>
        hasOpportunityUpdate(candidate, opportunityNames)
      )
      return hasCoreDelegate || hasLocalWriter
        ? [`${relativePath}#${declaration.name.text}`]
        : []
    })
  })
}

export function verifyOpportunityStageMutationEntryInventory(root) {
  const actual = enumerateStageMutationActions(root).sort()
  const expected = OPPORTUNITY_STAGE_MUTATION_ENTRY_POINTS.map(
    ({ actionPath, actionName }) => `${actionPath}#${actionName}`
  ).sort()
  assertExactValues(
    actual,
    expected,
    'all mounted Opportunity stage-mutation actions are enumerated'
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
  verifyProjectStageDelegation(
    read(
      root,
      'apps/web/src/app/(dashboard)/projects/[id]/opportunities/actions.ts'
    )
  )
  verifyProjectOpportunityPanelContract(
    read(root, 'apps/web/src/components/opportunities/opportunity-panel.tsx'),
    read(
      root,
      'apps/web/src/components/opportunities/opportunity-panel-model.ts'
    )
  )
  verifyProjectOpportunityPermissions(
    read(root, 'apps/web/src/app/(dashboard)/projects/[id]/page.tsx'),
    read(root, 'packages/shared-types/src/authorization.ts')
  )
  verifyOpportunityStageMutationEntryInventory(root)

  const board = read(root, 'apps/web/src/app/(dashboard)/pipeline/board/page.tsx')
  assertIncludes(board, 'opportunityKycTracks', 'board track projection')
  assertIncludes(board, 'opportunity_kyc_gate', 'board reason projection')

  const client = read(root, 'apps/web/src/components/pipeline/pipeline-board.tsx')
  assertIncludes(client, 'card.opportunity_kyc_initialized', 'client dual-track awareness')
  assertIncludes(client, 'card.opportunity_kyc_gate', 'client visible dual-track reason')

  console.log(
    'WO-11 PPRF, Core-authoritative KYC/state rules, enumerated Pipeline/Project Core-only delegation, Project panel/reason, exact role policy, and visible-reason invariants passed'
  )
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  verifyWo11Contract()
}
