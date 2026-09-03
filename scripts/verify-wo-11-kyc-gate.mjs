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

function callableName(node) {
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.text
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.initializer &&
    (ts.isArrowFunction(unwrapExpression(node.initializer)) ||
      ts.isFunctionExpression(unwrapExpression(node.initializer)))
  ) {
    return node.name.text
  }
  return undefined
}

function isCallableDeclaration(node) {
  return callableName(node) !== undefined
}

function isExportedFunction(node) {
  if (ts.isFunctionDeclaration(node)) {
    return (
      node.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
      ) === true
    )
  }
  if (!ts.isVariableDeclaration(node)) return false
  const statement = node.parent?.parent
  return (
    statement !== undefined &&
    ts.isVariableStatement(statement) &&
    statement.modifiers?.some(
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

function localIdentifierAliases(sourceFile, initialNames) {
  const names = new Set(initialNames)
  let added = true
  while (added) {
    added = false
    for (const declaration of descendants(sourceFile, ts.isVariableDeclaration)) {
      if (
        !ts.isIdentifier(declaration.name) ||
        !declaration.initializer ||
        !ts.isIdentifier(unwrapExpression(declaration.initializer)) ||
        !names.has(unwrapExpression(declaration.initializer).text) ||
        names.has(declaration.name.text)
      ) {
        continue
      }
      names.add(declaration.name.text)
      added = true
    }
  }
  return names
}

function opportunityTableNames(sourceFile) {
  return localIdentifierAliases(
    sourceFile,
    importedLocalNames(
      sourceFile,
      '@third-code-erp/database/schema',
      'opportunities'
    )
  )
}

function functionMap(sourceFile) {
  return new Map(
    descendants(sourceFile, isCallableDeclaration).flatMap((declaration) => {
      const name = callableName(declaration)
      return name ? [[name, declaration]] : []
    })
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

function hasOpportunityWrite(root, opportunityNames = new Set(['opportunities'])) {
  return descendants(root, ts.isCallExpression).some((call) => {
    const expression = unwrapExpression(call.expression)
    return (
      ts.isPropertyAccessExpression(expression) &&
      (expression.name.text === 'update' || expression.name.text === 'insert') &&
      call.arguments.some(
        (argument) =>
          ts.isIdentifier(unwrapExpression(argument)) &&
          opportunityNames.has(unwrapExpression(argument).text)
      )
    )
  })
}

function databaseTableNames(sourceFile) {
  const importedNames = new Set()
  for (const declaration of descendants(sourceFile, ts.isImportDeclaration)) {
    if (
      !ts.isStringLiteralLike(declaration.moduleSpecifier) ||
      declaration.moduleSpecifier.text !== '@third-code-erp/database/schema'
    ) {
      continue
    }
    const bindings = declaration.importClause?.namedBindings
    if (!bindings || !ts.isNamedImports(bindings)) continue
    for (const element of bindings.elements) importedNames.add(element.name.text)
  }
  return localIdentifierAliases(sourceFile, importedNames)
}

function hasLocalDatabaseWrite(root, tableNames) {
  return descendants(root, ts.isCallExpression).some((call) => {
    const expression = unwrapExpression(call.expression)
    return (
      ts.isPropertyAccessExpression(expression) &&
      (expression.name.text === 'update' || expression.name.text === 'insert') &&
      call.arguments.some(
        (argument) =>
          ts.isIdentifier(unwrapExpression(argument)) &&
          tableNames.has(unwrapExpression(argument).text)
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
    (node) => callableName(node) === name,
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

export const OPPORTUNITY_MUTATION_ENTRY_POINTS = Object.freeze([
  Object.freeze({
    surface: 'Pipeline',
    actionPath: 'apps/web/src/app/(dashboard)/pipeline/actions.ts',
    actionName: 'advanceOpportunityStage',
    delegateName: 'transitionOpportunityStageThroughCoreApi',
  }),
  Object.freeze({
    surface: 'Project detail',
    actionPath:
      'apps/web/src/app/(dashboard)/projects/[id]/opportunities/actions.ts',
    actionName: 'transitionStage',
    delegateName: 'transitionOpportunityStageThroughCoreApi',
    panelPath: 'apps/web/src/components/opportunities/opportunity-panel.tsx',
  }),
  Object.freeze({
    surface: 'Project detail creation',
    actionPath:
      'apps/web/src/app/(dashboard)/projects/[id]/opportunities/actions.ts',
    actionName: 'createOpportunity',
    delegateName: 'createOpportunityThroughCoreApi',
    panelPath: 'apps/web/src/components/opportunities/opportunity-panel.tsx',
  }),
])

export const OPPORTUNITY_STAGE_MUTATION_ENTRY_POINTS = Object.freeze(
  OPPORTUNITY_MUTATION_ENTRY_POINTS.slice(0, 2)
)

// These pre-existing Pipeline creation authorities are explicitly outside the
// Project-detail Core cutover, but remain in the mounted-file inventory so a
// newly exported local writer cannot pass unnoticed.
const LEGACY_PIPELINE_CREATION_ENTRY_POINTS = Object.freeze([
  Object.freeze({
    actionPath: 'apps/web/src/app/(dashboard)/pipeline/actions.ts',
    actionName: 'createOpportunity',
  }),
  Object.freeze({
    actionPath: 'apps/web/src/app/(dashboard)/pipeline/actions.ts',
    actionName: 'createOpportunityForAccount',
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

  const opportunityNames = opportunityTableNames(sourceFile)
  for (const declaration of reachable) {
    invariant(
      !hasOpportunityWrite(declaration, opportunityNames),
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

export function verifyProjectOpportunityCreationDelegation(source) {
  const actionPath =
    'apps/web/src/app/(dashboard)/projects/[id]/opportunities/actions.ts'
  const sourceFile = parseTypescript(source, actionPath)
  const actionName = 'createOpportunity'
  const action = namedFunction(
    sourceFile,
    actionName,
    'Project detail create action'
  )
  invariant(isExportedFunction(action), 'Project detail create action is exported')
  const reachable = reachableFunctionDeclarations(sourceFile, actionName)

  const selectorNames = importedLocalNames(
    sourceFile,
    '@/lib/erp-core-client',
    'opportunityStageWritesUseCoreApi'
  )
  const selectorCalls = callsReachableByNames(
    sourceFile,
    actionName,
    selectorNames
  )
  invariant(
    selectorNames.size === 1 && selectorCalls.length === 1,
    'Project detail create action has one Core selector'
  )
  invariant(
    selectorCalls[0].arguments.length === 1 &&
      isPath(selectorCalls[0].arguments[0], 'profile.tenantId') &&
      ifStatements(action).some((statement) =>
        hasNegatedPath(statement.expression, 'createCoreSelected')
      ),
    'Project detail create selector is tenant scoped and fails closed'
  )

  const delegateNames = importedLocalNames(
    sourceFile,
    '@/lib/erp-core-client',
    'createOpportunityThroughCoreApi'
  )
  const delegateCalls = callsReachableByNames(
    sourceFile,
    actionName,
    delegateNames
  )
  invariant(
    delegateNames.size === 1 && delegateCalls.length === 1,
    'Project detail create action has one Core create delegate'
  )
  const delegate = delegateCalls[0]
  invariant(
    delegate.arguments.length === 2 &&
      isPath(delegate.arguments[0], 'command') &&
      callName(unwrapExpression(delegate.arguments[1])) ===
        'projectOpportunityCreationIdempotencyKey',
    'Project detail create delegate receives the strict command and idempotency key'
  )

  invariant(
    hasNamedImport(
      sourceFile,
      '@third-code-erp/shared-types',
      'opportunityCreationCommandSchema'
    ) &&
      hasMethodCall(
        action,
        'opportunityCreationCommandSchema',
        'safeParse'
      ) &&
      hasNamedImport(
        sourceFile,
        '@third-code-erp/shared-types',
        'opportunityCreationResultSchema'
      ) &&
      hasMethodCall(
        action,
        'opportunityCreationResultSchema',
        'safeParse'
      ),
    'Project detail create action uses the shared strict create contract'
  )

  const opportunityNames = opportunityTableNames(sourceFile)
  for (const declaration of reachable) {
    invariant(
      !hasOpportunityWrite(declaration, opportunityNames),
      'Project detail create action has no Web-local Opportunity writer'
    )
  }
  for (const name of [
    'writeAuditLog',
    'writeAuditLogInTransaction',
    'startSlaClock',
    'stopSlaClock',
    'legacyConvertOpportunityToProject',
  ]) {
    const localNames = importedLocalNames(sourceFile, undefined, name)
    localNames.add(name)
    invariant(
      callsReachableByNames(sourceFile, actionName, localNames).length === 0,
      `Project detail create action has no Web-local ${name} fallback`
    )
  }

  invariant(
    reachable.some(
      (declaration) =>
        hasBinary(
          declaration,
          'result.tenantId',
          ts.SyntaxKind.EqualsEqualsEqualsToken,
          'profile.tenantId'
        ) &&
        hasBinary(
          declaration,
          'result.projectId',
          ts.SyntaxKind.EqualsEqualsEqualsToken,
          'command.projectId'
        ) &&
        hasBinary(
          declaration,
          'result.stage',
          ts.SyntaxKind.EqualsEqualsEqualsToken,
          'command.stage'
        )
    ),
    'Project detail create action validates Core tenant, Project, and initial stage'
  )
}

export function verifyOpportunityCreationContract(source) {
  const sourceFile = parseTypescript(
    source,
    'packages/shared-types/src/erp-api/opportunities.ts'
  )
  const commandSchema = variable(
    sourceFile,
    'opportunityCreationCommandSchema',
    'shared Opportunity creation command schema'
  )
  const commandObject = oneDescendant(
    commandSchema,
    (node) =>
      ts.isObjectLiteralExpression(node) &&
      objectProperty(node, 'projectId') !== undefined &&
      objectProperty(node, 'stage') !== undefined &&
      objectProperty(node, 'tcvCents') !== undefined &&
      objectProperty(node, 'gpCents') !== undefined,
    'shared Opportunity creation command object'
  )
  const stage = objectProperty(commandObject, 'stage')
  const tcv = objectProperty(commandObject, 'tcvCents')
  const gp = objectProperty(commandObject, 'gpCents')
  const stageLiteralCalls = stage ? calls(stage.initializer, 'literal') : []
  const stageDefaultCalls = stage ? calls(stage.initializer, 'default') : []
  invariant(
    stage &&
      stageLiteralCalls.length === 1 &&
      stageLiteralCalls[0].arguments.length === 1 &&
      ts.isStringLiteralLike(
        unwrapExpression(stageLiteralCalls[0].arguments[0])
      ) &&
      unwrapExpression(stageLiteralCalls[0].arguments[0]).text ===
        'opportunity_creation' &&
      stageDefaultCalls.length === 1 &&
      stageDefaultCalls[0].arguments.length === 1 &&
      ts.isStringLiteralLike(
        unwrapExpression(stageDefaultCalls[0].arguments[0])
      ) &&
      unwrapExpression(stageDefaultCalls[0].arguments[0]).text ===
        'opportunity_creation',
    'shared create contract fixes the product-safe initial stage'
  )
  invariant(
    tcv &&
      hasIdentifier(tcv.initializer, 'safeNonNegativeCentavosStringSchema') &&
      hasStringLiteral(tcv.initializer, '0') &&
      gp &&
      hasIdentifier(gp.initializer, 'safeSignedCentavosStringSchema') &&
      hasStringLiteral(gp.initializer, '0'),
    'shared create contract uses canonical exact centavo strings'
  )
  invariant(
    hasCall(commandSchema, 'strict'),
    'shared Opportunity creation command rejects unknown identity fields'
  )

  const resultSchema = variable(
    sourceFile,
    'opportunityCreationResultSchema',
    'shared Opportunity creation result schema'
  )
  invariant(
    hasIdentifier(resultSchema, 'safeNonNegativeCentavosStringSchema') &&
      hasIdentifier(resultSchema, 'safeSignedCentavosStringSchema') &&
      hasStringLiteral(resultSchema, 'opportunity_creation') &&
      hasCall(resultSchema, 'strict'),
    'shared create result preserves exact money and initial stage identity'
  )
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
    ) &&
      hasNamedImport(
        panelFile,
        '@/app/(dashboard)/projects/[id]/opportunities/actions',
        'createOpportunity'
      ),
    'Project panel mounts the enumerated Project detail actions'
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
  const buildCreate = namedFunction(
    modelFile,
    'buildOpportunityCreateFormData',
    'Project create command builder'
  )
  const copyMoney = namedFunction(
    modelFile,
    'copyCanonicalCentavosString',
    'Project exact-money command copier'
  )
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
    calls(handleCreate, 'buildOpportunityCreateFormData').length === 1 &&
      calls(panel, 'createOpportunity').length === 1 &&
      hasStringLiteral(buildCreate, 'opportunity_creation') &&
      hasMethodCall(
        copyMoney,
        'safeNonNegativeCentavosStringSchema',
        'safeParse'
      ) &&
      hasMethodCall(
        copyMoney,
        'safeSignedCentavosStringSchema',
        'safeParse'
      ),
    'Project panel submits one product-safe exact-money create command'
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

function normalizedSourceOverrides(sourceOverrides) {
  return new Map(
    [...sourceOverrides].map(([relativePath, source]) => [
      relativePath.replaceAll('\\', '/'),
      source,
    ])
  )
}

function sourceExists(root, relativePath, sourceOverrides) {
  return (
    sourceOverrides.has(relativePath) ||
    fs.existsSync(path.join(root, relativePath))
  )
}

function readGraphSource(root, relativePath, sourceOverrides) {
  return sourceOverrides.get(relativePath) ?? read(root, relativePath)
}

function resolveLocalModule(root, fromPath, moduleName, sourceOverrides) {
  let unresolved
  if (moduleName.startsWith('@/')) {
    unresolved = path.posix.join('apps/web/src', moduleName.slice(2))
  } else if (moduleName.startsWith('.')) {
    unresolved = path.posix.join(path.posix.dirname(fromPath), moduleName)
  } else {
    return undefined
  }
  const normalized = path.posix.normalize(unresolved)
  const candidates = /\.[cm]?[jt]sx?$/.test(normalized)
    ? [normalized]
    : [
        `${normalized}.ts`,
        `${normalized}.tsx`,
        path.posix.join(normalized, 'index.ts'),
        path.posix.join(normalized, 'index.tsx'),
      ]
  return candidates.find((candidate) =>
    sourceExists(root, candidate, sourceOverrides)
  )
}

function moduleRecord(root, relativePath, sourceOverrides, cache) {
  const normalizedPath = relativePath.replaceAll('\\', '/')
  const cached = cache.get(normalizedPath)
  if (cached) return cached
  const source = readGraphSource(root, normalizedPath, sourceOverrides)
  const sourceFile = parseTypescript(source, normalizedPath)
  const namedImports = new Map()
  const opaqueLocalImports = new Map()
  for (const declaration of descendants(sourceFile, ts.isImportDeclaration)) {
    if (!ts.isStringLiteralLike(declaration.moduleSpecifier)) continue
    const moduleName = declaration.moduleSpecifier.text
    const clause = declaration.importClause
    if (!clause) continue
    if (clause.name) opaqueLocalImports.set(clause.name.text, moduleName)
    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      opaqueLocalImports.set(clause.namedBindings.name.text, moduleName)
    }
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        namedImports.set(element.name.text, {
          importedName: (element.propertyName ?? element.name).text,
          moduleName,
        })
      }
    }
  }
  const callAliases = new Map()
  for (const declaration of descendants(sourceFile, ts.isVariableDeclaration)) {
    if (
      ts.isIdentifier(declaration.name) &&
      declaration.initializer &&
      ts.isIdentifier(unwrapExpression(declaration.initializer))
    ) {
      callAliases.set(
        declaration.name.text,
        unwrapExpression(declaration.initializer).text
      )
    }
  }
  const record = {
    path: normalizedPath,
    source,
    sourceFile,
    functions: functionMap(sourceFile),
    namedImports,
    opaqueLocalImports,
    callAliases,
  }
  cache.set(normalizedPath, record)
  return record
}

function canonicalCallName(record, name) {
  const visited = new Set()
  let current = name
  while (record.callAliases.has(current) && !visited.has(current)) {
    visited.add(current)
    current = record.callAliases.get(current)
  }
  return current
}

function exportedCallableNames(record) {
  const names = new Set(
    descendants(record.sourceFile, isExportedFunction).flatMap((declaration) => {
      const name = callableName(declaration)
      return name ? [name] : []
    })
  )
  for (const declaration of descendants(
    record.sourceFile,
    ts.isExportDeclaration
  )) {
    if (!declaration.exportClause || !ts.isNamedExports(declaration.exportClause)) {
      continue
    }
    for (const element of declaration.exportClause.elements) {
      names.add(element.name.text)
    }
  }
  return [...names]
}

function resolveExportedCallable(graph, relativePath, exportName, resolving = new Set()) {
  const key = `${relativePath}#${exportName}`
  invariant(!resolving.has(key), `acyclic local re-export for ${key}`)
  const nextResolving = new Set(resolving).add(key)
  const record = moduleRecord(
    graph.root,
    relativePath,
    graph.sourceOverrides,
    graph.cache
  )
  const direct = record.functions.get(exportName)
  if (direct && isExportedFunction(direct)) {
    return { record, name: exportName, declaration: direct }
  }

  for (const declaration of descendants(
    record.sourceFile,
    ts.isExportDeclaration
  )) {
    if (!declaration.exportClause || !ts.isNamedExports(declaration.exportClause)) {
      continue
    }
    for (const element of declaration.exportClause.elements) {
      if (element.name.text !== exportName) continue
      const importedName = (element.propertyName ?? element.name).text
      if (declaration.moduleSpecifier) {
        invariant(
          ts.isStringLiteralLike(declaration.moduleSpecifier),
          `static local re-export for ${key}`
        )
        const target = resolveLocalModule(
          graph.root,
          relativePath,
          declaration.moduleSpecifier.text,
          graph.sourceOverrides
        )
        invariant(target, `resolvable local re-export for ${key}`)
        return resolveExportedCallable(
          graph,
          target,
          importedName,
          nextResolving
        )
      }
      const local = record.functions.get(importedName)
      if (local) return { record, name: importedName, declaration: local }
      const imported = record.namedImports.get(importedName)
      invariant(imported, `resolvable local export for ${key}`)
      const target = resolveLocalModule(
        graph.root,
        relativePath,
        imported.moduleName,
        graph.sourceOverrides
      )
      invariant(target, `resolvable local export for ${key}`)
      return resolveExportedCallable(
        graph,
        target,
        imported.importedName,
        nextResolving
      )
    }
  }
  invariant(false, `mounted exported action ${key}`)
}

function reachableCallGraph(graph, entry, followReferencedImports = true) {
  const pending = [entry]
  const visited = new Set()
  const declarations = []
  const importedCalls = []
  while (pending.length > 0) {
    const current = pending.pop()
    if (!current) continue
    const key = `${current.record.path}#${current.name}`
    if (visited.has(key)) continue
    visited.add(key)
    declarations.push(current)

    for (const call of descendants(current.declaration, ts.isCallExpression)) {
      const expression = unwrapExpression(call.expression)
      if (
        expression.kind === ts.SyntaxKind.ImportKeyword &&
        call.arguments.length === 1 &&
        ts.isStringLiteralLike(unwrapExpression(call.arguments[0]))
      ) {
        const target = resolveLocalModule(
          graph.root,
          current.record.path,
          unwrapExpression(call.arguments[0]).text,
          graph.sourceOverrides
        )
        invariant(
          !target,
          `mounted action graph uses static named imports instead of dynamic local imports (${current.record.path})`
        )
      }
      if (ts.isIdentifier(expression)) {
        const calledName = canonicalCallName(current.record, expression.text)
        const local = current.record.functions.get(calledName)
        if (local) {
          pending.push({
            record: current.record,
            name: calledName,
            declaration: local,
          })
          continue
        }
        const imported = current.record.namedImports.get(calledName)
        if (!imported) {
          const opaqueModule = current.record.opaqueLocalImports.get(calledName)
          if (opaqueModule) {
            const target = resolveLocalModule(
              graph.root,
              current.record.path,
              opaqueModule,
              graph.sourceOverrides
            )
            invariant(
              !target,
              `mounted action graph uses named imports for analyzable local calls (${current.record.path})`
            )
          }
          continue
        }
        importedCalls.push({ ...imported, call, record: current.record })
        if (imported.moduleName === '@/lib/erp-core-client') continue
        const target = resolveLocalModule(
          graph.root,
          current.record.path,
          imported.moduleName,
          graph.sourceOverrides
        )
        if (target) {
          pending.push(
            resolveExportedCallable(graph, target, imported.importedName)
          )
        }
        continue
      }

      const receiver =
        ts.isPropertyAccessExpression(expression) ||
        ts.isElementAccessExpression(expression)
          ? unwrapExpression(expression.expression)
          : undefined
      if (
        receiver &&
        ts.isIdentifier(receiver) &&
        current.record.opaqueLocalImports.has(receiver.text)
      ) {
        const moduleName = current.record.opaqueLocalImports.get(receiver.text)
        const target = resolveLocalModule(
          graph.root,
          current.record.path,
          moduleName,
          graph.sourceOverrides
        )
        invariant(
          !target,
          `mounted action graph uses named imports for analyzable local calls (${current.record.path})`
        )
      }
    }

    // A named helper can be passed as a callback instead of being called at the
    // action site. Following every referenced local named import keeps that
    // indirection inside the same fail-closed graph.
    if (!followReferencedImports) continue
    for (const identifier of descendants(current.declaration, ts.isIdentifier)) {
      const referencedName = canonicalCallName(current.record, identifier.text)
      const opaqueModule = current.record.opaqueLocalImports.get(referencedName)
      if (opaqueModule) {
        const opaqueTarget = resolveLocalModule(
          graph.root,
          current.record.path,
          opaqueModule,
          graph.sourceOverrides
        )
        invariant(
          !opaqueTarget,
          `mounted action graph uses named imports for analyzable local references (${current.record.path})`
        )
      }
      const imported = current.record.namedImports.get(referencedName)
      if (!imported || imported.moduleName === '@/lib/erp-core-client') continue
      const target = resolveLocalModule(
        graph.root,
        current.record.path,
        imported.moduleName,
        graph.sourceOverrides
      )
      if (target) {
        pending.push(resolveExportedCallable(graph, target, imported.importedName))
      }
    }
  }
  return { declarations, importedCalls }
}

function analyzeMountedOpportunityEntry(graph, config) {
  const entry = resolveExportedCallable(graph, config.actionPath, config.actionName)
  const reachable = reachableCallGraph(graph, entry)
  const delegates = reachable.importedCalls.filter(
    (candidate) =>
      candidate.moduleName === '@/lib/erp-core-client' &&
      candidate.importedName === config.delegateName
  )
  invariant(
    delegates.length === 1,
    `${config.surface} ${config.actionName} has one exact Core delegate`
  )
  const selectors = reachable.importedCalls.filter(
    (candidate) =>
      candidate.moduleName === '@/lib/erp-core-client' &&
      candidate.importedName === 'opportunityStageWritesUseCoreApi'
  )
  invariant(
    selectors.length === 1,
    `${config.surface} ${config.actionName} has one exact Core selector`
  )

  for (const current of reachable.declarations) {
    invariant(
      !hasLocalDatabaseWrite(
        current.declaration,
        databaseTableNames(current.record.sourceFile)
      ),
      `${config.surface} ${config.actionName} has no reachable local database writer (${current.record.path}#${current.name})`
    )
  }
  for (const forbiddenName of [
    'writeAuditLog',
    'writeAuditLogInTransaction',
    'startSlaClock',
    'stopSlaClock',
    'legacyConvertOpportunityToProject',
  ]) {
    invariant(
      !reachable.importedCalls.some(
        (candidate) => candidate.importedName === forbiddenName
      ) &&
        !reachable.declarations.some((current) =>
          descendants(current.declaration, ts.isCallExpression).some(
            (call) => {
              const name = callName(call)
              return (
                name !== undefined &&
                canonicalCallName(current.record, name) === forbiddenName
              )
            }
          )
        ),
      `${config.surface} ${config.actionName} has no reachable ${forbiddenName} fallback`
    )
  }
  return reachable
}

export function verifyOpportunityMutationEntryInventory(
  root,
  sourceOverrides = new Map()
) {
  const graph = {
    root,
    sourceOverrides: normalizedSourceOverrides(sourceOverrides),
    cache: new Map(),
  }
  const actual = []
  const mountedActionPaths = new Set(
    OPPORTUNITY_MUTATION_ENTRY_POINTS.map(({ actionPath }) => actionPath)
  )
  for (const actionPath of mountedActionPaths) {
    const record = moduleRecord(
      graph.root,
      actionPath,
      graph.sourceOverrides,
      graph.cache
    )
    for (const actionName of exportedCallableNames(record)) {
      const entry = resolveExportedCallable(graph, actionPath, actionName)
      const reachable = reachableCallGraph(graph, entry)
      const isOpportunityMutation =
        reachable.importedCalls.some(
          (candidate) =>
            candidate.moduleName === '@/lib/erp-core-client' &&
            (candidate.importedName ===
              'transitionOpportunityStageThroughCoreApi' ||
              candidate.importedName === 'createOpportunityThroughCoreApi')
        ) ||
        reachable.declarations.some((current) =>
          hasOpportunityWrite(
            current.declaration,
            opportunityTableNames(current.record.sourceFile)
          )
        )
      if (isOpportunityMutation) actual.push(`${actionPath}#${actionName}`)
    }
  }
  const expected = [
    ...OPPORTUNITY_MUTATION_ENTRY_POINTS,
    ...LEGACY_PIPELINE_CREATION_ENTRY_POINTS,
  ]
    .map(({ actionPath, actionName }) => `${actionPath}#${actionName}`)
    .sort()
  assertExactValues(
    actual.sort(),
    expected,
    `all mounted Opportunity mutation actions are exactly enumerated (expected ${expected.join(', ')}; found ${actual.sort().join(', ')})`
  )
  for (const config of OPPORTUNITY_MUTATION_ENTRY_POINTS) {
    analyzeMountedOpportunityEntry(graph, config)
  }
}

export const verifyOpportunityStageMutationEntryInventory =
  verifyOpportunityMutationEntryInventory

const PPRF_SERVICE_PATH =
  'apps/web/src/server/crm/pprf-submission-service.ts'
const PPRF_SERVICE_TEST_PATH =
  'apps/web/src/server/crm/pprf-submission-service.test.ts'
const PPRF_SERVICE_MODULE = '@/server/crm/pprf-submission-service'
const PPRF_MOUNTED_ENTRIES = Object.freeze([
  Object.freeze({
    surface: 'PPRF intake',
    actionPath:
      'apps/web/src/app/(dashboard)/crm/opportunities/new/pprf/actions.ts',
    actionName: 'createPprfIntake',
    delegateName: 'submitIntake',
    commandSchema: 'pprfIntakeCommandSchema',
    pagePath:
      'apps/web/src/app/(dashboard)/crm/opportunities/new/pprf/page.tsx',
    formPath: 'apps/web/src/components/proposal/pprf-intake-form.tsx',
    formName: 'PprfIntakeForm',
    formHandler: 'submit',
    capabilities: ['account.create', 'pprf.submit'],
  }),
  Object.freeze({
    surface: 'PPRF resubmission',
    actionPath:
      'apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/actions.ts',
    actionName: 'submitPprf',
    delegateName: 'submitResubmission',
    commandSchema: 'pprfResubmissionCommandSchema',
    pagePath:
      'apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/pprf/page.tsx',
    formPath: 'apps/web/src/components/proposal/pprf-form.tsx',
    formName: 'PprfForm',
    formHandler: 'onSubmit',
    capabilities: ['pprf.submit'],
  }),
])

function methodCallsOnImportedValue(
  record,
  declaration,
  moduleName,
  importedName,
  methodName
) {
  const receivers = localIdentifierAliases(
    record.sourceFile,
    importedLocalNames(record.sourceFile, moduleName, importedName)
  )
  return descendants(declaration, (node) => {
    if (!ts.isCallExpression(node)) return false
    const expression = unwrapExpression(node.expression)
    if (!ts.isPropertyAccessExpression(expression)) return false
    const receiver = unwrapExpression(expression.expression)
    return (
      ts.isIdentifier(receiver) &&
      receivers.has(receiver.text) &&
      expression.name.text === methodName
    )
  })
}

function methodCallsOnPath(root, receiverPath, methodName) {
  return descendants(root, (node) => {
    if (!ts.isCallExpression(node)) return false
    const expression = unwrapExpression(node.expression)
    return (
      ts.isPropertyAccessExpression(expression) &&
      expressionPath(expression.expression) === receiverPath &&
      expression.name.text === methodName
    )
  })
}

function propertyNames(object) {
  return object.properties.flatMap((property) => {
    if (
      !ts.isPropertyAssignment(property) &&
      !ts.isShorthandPropertyAssignment(property)
    ) {
      return []
    }
    return ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name)
      ? [property.name.text]
      : []
  })
}

function jsxStringAttribute(element, name) {
  const attribute = element.attributes.properties.find(
    (candidate) =>
      ts.isJsxAttribute(candidate) &&
      ts.isIdentifier(candidate.name) &&
      candidate.name.text === name
  )
  return attribute &&
    ts.isJsxAttribute(attribute) &&
    attribute.initializer &&
    ts.isStringLiteralLike(attribute.initializer)
    ? attribute.initializer.text
    : undefined
}

function exactCapabilityPolicy(authorizationFile, capability) {
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
  const property = objectProperty(policy, capability)
  return property ? arrayLiteralValues(property.initializer) : undefined
}

function verifyPprfCentralAuthority(authorizationSource) {
  const sourceFile = parseTypescript(
    authorizationSource,
    'packages/shared-types/src/authorization.ts'
  )
  const roles = variable(sourceFile, 'ERP_ROLES', 'central ERP role list')
  assertExactValues(
    roles.initializer ? arrayLiteralValues(roles.initializer) : undefined,
    EXPECTED_ERP_ROLES,
    'PPRF central thirteen-role vocabulary'
  )
  for (const capability of ['account.create', 'pprf.submit']) {
    assertExactValues(
      exactCapabilityPolicy(sourceFile, capability),
      EXPECTED_OPPORTUNITY_MUTATORS,
      `${capability} has exact Owner/Admin/Sales authority`
    )
  }
}

function verifyPprfAction(graph, config) {
  const entry = resolveExportedCallable(
    graph,
    config.actionPath,
    config.actionName
  )
  const reachable = reachableCallGraph(graph, entry, false)
  const delegates = reachable.declarations.flatMap((current) =>
    methodCallsOnImportedValue(
      current.record,
      current.declaration,
      PPRF_SERVICE_MODULE,
      'pprfSubmissionService',
      config.delegateName
    )
  )
  invariant(
    delegates.length === 1,
    `${config.surface} has one exact atomic service delegate`
  )

  const action = entry.declaration
  invariant(
    calls(action, 'requireUserProfile').length === 1,
    `${config.surface} authenticates once`
  )
  for (const capability of config.capabilities) {
    invariant(
      hasCallWithArguments(action, 'can', [
        { path: 'profile.role' },
        { literal: capability },
      ]),
      `${config.surface} enforces ${capability}`
    )
  }

  const commandSchemaNames = localIdentifierAliases(
    entry.record.sourceFile,
    importedLocalNames(
      entry.record.sourceFile,
      PPRF_SERVICE_MODULE,
      config.commandSchema
    )
  )
  const resultSchemaNames = localIdentifierAliases(
    entry.record.sourceFile,
    importedLocalNames(
      entry.record.sourceFile,
      PPRF_SERVICE_MODULE,
      'pprfSubmissionResultSchema'
    )
  )
  invariant(
    [...commandSchemaNames].flatMap((name) =>
      methodCallsOnPath(action, name, 'safeParse')
    ).length === 1,
    `${config.surface} parses one strict service command`
  )
  invariant(
    [...resultSchemaNames].flatMap((name) =>
      methodCallsOnPath(action, name, 'safeParse')
    ).length === 1,
    `${config.surface} parses one strict service result`
  )

  const fieldReaders = reachable.declarations.filter(
    (current) =>
      hasMethodCall(current.declaration, 'formData', 'entries')
  )
  invariant(
    fieldReaders.length === 1,
    `${config.surface} uses one strict FormData reader`
  )
  const fieldReader = fieldReaders[0].declaration
  invariant(
    ifStatements(fieldReader).some(
      (statement) =>
        hasMethodCall(statement.expression, 'FIELD_NAME_SET', 'has') ||
        hasMethodCall(statement.expression, 'PPRF_FIELD_NAME_SET', 'has')
    ),
    `${config.surface} rejects unknown FormData fields`
  )
  invariant(
    hasMethodCall(fieldReader, 'formData', 'getAll') &&
      ifStatements(fieldReader).some(
        (statement) =>
          hasBinary(
            statement.expression,
            'entries.length',
            ts.SyntaxKind.ExclamationEqualsEqualsToken,
            undefined
          )
      ),
    `${config.surface} rejects duplicate text fields`
  )

  for (const current of reachable.declarations) {
    invariant(
      !hasLocalDatabaseWrite(
        current.declaration,
        databaseTableNames(current.record.sourceFile)
      ),
      `${config.surface} has no reachable local database writer (${current.record.path}#${current.name})`
    )
  }
  for (const forbiddenName of [
    'writeAuditLog',
    'writeAuditLogInTransaction',
    'initializeOpportunityKycTracks',
    'opportunityKycDueAt',
    'startSlaClock',
    'notifyRoles',
    'createNotifications',
  ]) {
    invariant(
      !reachable.importedCalls.some(
        (candidate) => candidate.importedName === forbiddenName
      ) &&
        !reachable.declarations.some((current) =>
          descendants(current.declaration, ts.isCallExpression).some(
            (call) => {
              const name = callName(call)
              return (
                name !== undefined &&
                canonicalCallName(current.record, name) === forbiddenName
              )
            }
          )
        ),
      `${config.surface} has no reachable ${forbiddenName} writer`
    )
  }

  invariant(
    hasBinary(
      action,
      'checked.data.tenantId',
      ts.SyntaxKind.ExclamationEqualsEqualsToken,
      'tenantId'
    ) &&
      (config.delegateName === 'submitIntake' ||
        hasBinary(
          action,
          'checked.data.opportunityId',
          ts.SyntaxKind.ExclamationEqualsEqualsToken,
          'opportunityId'
        )),
    `${config.surface} validates committed result scope`
  )

  const refreshTry = descendants(action, ts.isTryStatement)
    .filter(
      (statement) =>
        statement.catchClause &&
        calls(statement.tryBlock, 'revalidatePath').length > 0
    )
    .sort((left, right) => left.end - left.pos - (right.end - right.pos))[0]
  invariant(
    refreshTry &&
      hasBinary(
        refreshTry.catchClause.block,
        'refreshFailed',
        ts.SyntaxKind.EqualsToken,
        undefined
      ) &&
      !descendants(refreshTry.catchClause.block, ts.isReturnStatement).some(
        (statement) => statement.expression && hasStringLiteral(statement, 'Refresh failed')
      ),
    `${config.surface} refresh failure remains committed success`
  )
  invariant(
    delegates[0].pos < refreshTry.pos &&
      hasStringLiteral(action, 'success_refresh_failed') &&
      hasIdentifier(action, 'refreshFailed'),
    `${config.surface} refresh is success-only and classified`
  )

  const logName = config.delegateName === 'submitIntake' ? 'logOutcome' : 'logPprfOutcome'
  const logFunction = namedFunction(
    entry.record.sourceFile,
    logName,
    `${config.surface} outcome logger`
  )
  for (const forbidden of [
    'formData',
    'submissionId',
    'keyHash',
    'commandHash',
    'clientName',
    'scopeNotes',
    'payload',
  ]) {
    invariant(
      !hasIdentifier(logFunction, forbidden),
      `${config.surface} log is redacted (${forbidden})`
    )
  }
  invariant(
    hasIdentifier(logFunction, 'trace_id') &&
      hasIdentifier(logFunction, 'tenant_id') &&
      hasIdentifier(logFunction, 'actor_id') &&
      hasIdentifier(logFunction, 'outcome'),
    `${config.surface} log has required structured context`
  )
}

function verifyPprfForm(graph, config) {
  const record = moduleRecord(
    graph.root,
    config.formPath,
    graph.sourceOverrides,
    graph.cache
  )
  const form = namedFunction(record.sourceFile, config.formName, config.formName)
  const hiddenNames = descendants(
    form,
    (node) =>
      ts.isJsxSelfClosingElement(node) &&
      node.tagName.getText(record.sourceFile) === 'input' &&
      jsxStringAttribute(node, 'type') === 'hidden'
  ).map((element) => jsxStringAttribute(element, 'name'))
  assertExactValues(
    hiddenNames,
    ['submission_id'],
    `${config.surface} mounts only the stable submission UUID as hidden identity`
  )
  invariant(
    hasIdentifier(form.parameters[0], 'submissionId') &&
      hasStringLiteral(form, 'submission_id'),
    `${config.surface} binds the per-mount submission UUID`
  )
  const handler = namedFunction(
    record.sourceFile,
    config.formHandler,
    `${config.surface} client submit handler`
  )
  invariant(
    ifStatements(handler).some((statement) =>
      isPath(statement.expression, 'inFlightRef.current')
    ) &&
      hasBinary(
        handler,
        'inFlightRef.current',
        ts.SyntaxKind.EqualsToken,
        undefined
      ),
    `${config.surface} has a synchronous single-flight guard`
  )
  invariant(
    calls(handler, config.actionName).length === 1,
    `${config.surface} mounts exactly one action seam`
  )
  invariant(
    hasNegatedPath(handler, 'result.ok') || hasNegatedPath(handler, 'res.ok'),
    `${config.surface} contains command failures before navigation`
  )
  invariant(
    hasIdentifier(handler, 'setCommitted') &&
      hasIdentifier(form, 'committed'),
    `${config.surface} disables replay after committed success`
  )
}

function verifyPprfPages(graph) {
  const intakePath = PPRF_MOUNTED_ENTRIES[0].pagePath
  const intakeRecord = moduleRecord(
    graph.root,
    intakePath,
    graph.sourceOverrides,
    graph.cache
  )
  const intakePage = namedFunction(
    intakeRecord.sourceFile,
    'NewPprfIntakePage',
    'PPRF intake page'
  )
  invariant(
    hasCallWithArguments(intakePage, 'can', [
      { path: 'profile.role' },
      { literal: 'pprf.submit' },
    ]) &&
      hasCallWithArguments(intakePage, 'can', [
        { path: 'profile.role' },
        { literal: 'account.create' },
      ]) &&
      calls(intakePage, 'redirect').length === 1,
    'PPRF intake route requires both central capabilities'
  )
  invariant(
    calls(intakePage, 'randomUUID').length === 1 &&
      descendants(
        intakePage,
        (node) =>
          ts.isJsxSelfClosingElement(node) &&
          node.tagName.getText(intakeRecord.sourceFile) === 'PprfIntakeForm' &&
          hasCall(node, 'randomUUID')
      ).length === 1,
    'PPRF intake page creates one UUID for its mounted form'
  )

  const detailPath = PPRF_MOUNTED_ENTRIES[1].pagePath
  const detailRecord = moduleRecord(
    graph.root,
    detailPath,
    graph.sourceOverrides,
    graph.cache
  )
  const detailPage = namedFunction(
    detailRecord.sourceFile,
    'PprfPage',
    'PPRF detail page'
  )
  const canSubmit = variable(detailPage, 'canSubmit', 'PPRF detail permission')
  invariant(
    canSubmit.initializer &&
      hasCallWithArguments(canSubmit.initializer, 'can', [
        { path: 'profile.role' },
        { literal: 'pprf.submit' },
      ]) &&
      descendants(
        detailPage,
        (node) =>
          ts.isConditionalExpression(node) &&
          isPath(node.condition, 'submissionId') &&
          hasIdentifier(node.whenTrue, 'PprfForm') &&
          node.whenFalse
            .getText(detailRecord.sourceFile)
            .includes('your role cannot submit a new version')
      ).length === 1,
    'PPRF detail projects exact-three submit controls'
  )
  invariant(
    canSubmit.initializer &&
      calls(detailPage, 'randomUUID').length === 1 &&
      hasIdentifier(detailPage, 'history') &&
      hasIdentifier(detailPage, 'tracks') &&
      hasEq(detailPage, 'opportunities.tenant_id', 'profile.tenantId') &&
      hasEq(detailPage, 'pprfSubmissions.tenant_id', 'profile.tenantId') &&
      hasEq(
        detailPage,
        'opportunityKycTracks.tenant_id',
        'profile.tenantId'
      ),
    'PPRF detail remains all-role read with one authorized form UUID'
  )
}

function verifyPprfRouteRegistry(routeSource) {
  const sourceFile = parseTypescript(
    routeSource,
    'apps/web/src/lib/operations/nav-config.ts'
  )
  const policyCalls = descendants(
    sourceFile,
    (node) => ts.isCallExpression(node) && callName(node) === 'registerDashboardRoutes'
  )
  const routePolicy = (route) =>
    policyCalls.filter((call) => {
      const routes = call.arguments[0]
        ? arrayLiteralValues(call.arguments[0])
        : undefined
      return routes?.includes(route) === true
    })

  const detail = routePolicy('/crm/opportunities/[id]/proposal/pprf')
  invariant(
    detail.length === 1 && detail[0].arguments.length === 1,
    'PPRF detail route is registered for every authenticated role'
  )
  const intake = routePolicy('/crm/opportunities/new/pprf')
  invariant(
    intake.length === 1 &&
      intake[0].arguments.length === 2 &&
      arrayLiteralValues(intake[0].arguments[1])?.join(',') === 'admin,sales',
    'PPRF intake route has exact Admin/Sales registry roles'
  )
  const canonical = variable(sourceFile, 'CANONICAL', 'route role aliases')
  const canonicalObject = canonical.initializer
    ? unwrapExpression(canonical.initializer)
    : undefined
  const owner =
    canonicalObject && ts.isObjectLiteralExpression(canonicalObject)
      ? objectProperty(canonicalObject, 'owner')
      : undefined
  invariant(
    owner &&
      ts.isStringLiteralLike(unwrapExpression(owner.initializer)) &&
      unwrapExpression(owner.initializer).text === 'admin',
    'PPRF intake route inherits Owner through the explicit super-admin alias'
  )
}

function verifyPprfService(serviceSource, serviceTestSource) {
  const sourceFile = parseTypescript(serviceSource, PPRF_SERVICE_PATH)
  for (const schemaName of [
    'pprfSubmissionPayloadSchema',
    'pprfIntakeCommandSchema',
    'pprfResubmissionCommandSchema',
  ]) {
    const schema = variable(sourceFile, schemaName, `${schemaName} schema`)
    invariant(hasCall(schema, 'strict'), `${schemaName} is strict`)
  }
  const resultSchema = variable(
    sourceFile,
    'pprfSubmissionResultSchema',
    'PPRF result schema'
  )
  invariant(
    hasIdentifier(resultSchema, 'intakeSuccessSchema') &&
      hasIdentifier(resultSchema, 'resubmissionSuccessSchema') &&
      hasIdentifier(resultSchema, 'failureSchema'),
    'PPRF result is a strict discriminated union'
  )

  const intake = namedMethod(sourceFile, 'submitIntake', 'PPRF intake service')
  const resubmission = namedMethod(
    sourceFile,
    'submitResubmission',
    'PPRF resubmission service'
  )
  for (const [method, kind] of [
    [intake, 'intake'],
    [resubmission, 'resubmission'],
  ]) {
    invariant(
      methodCallsOnPath(method, 'this.store', 'transaction').length === 1,
      `PPRF ${kind} uses exactly one transaction`
    )
    const membershipCalls = methodCallsOnPath(
      method,
      'transaction',
      'lockMembership'
    )
    invariant(
      membershipCalls.length === 1 &&
        hasBinary(
          method,
          'membership.tenantId',
          ts.SyntaxKind.ExclamationEqualsEqualsToken,
          'principal.data.tenantId'
        ),
      `PPRF ${kind} current membership lock`
    )
    invariant(
      hasCallWithArguments(method, 'roleHasCapability', [
        { path: 'membership.role' },
        { literal: 'pprf.submit' },
      ]),
      `PPRF ${kind} exact submission capability`
    )
    const commandLocks = methodCallsOnPath(
      method,
      'transaction',
      'lockCommand'
    )
    invariant(
      commandLocks.length === 1 &&
        commandLocks[0].arguments.length === 2 &&
        isPath(commandLocks[0].arguments[0], 'membership.tenantId') &&
        isPath(commandLocks[0].arguments[1], 'keyHash'),
      `PPRF ${kind} tenant and full-key command lock`
    )
  }
  invariant(
    hasCallWithArguments(intake, 'roleHasCapability', [
      { path: 'membership.role' },
      { literal: 'account.create' },
    ]),
    'PPRF intake exact Account-create capability'
  )

  const requiredCounts = [
    [intake, 'createAccount', 1, 'PPRF intake creates one Account'],
    [intake, 'createOpportunity', 1, 'PPRF intake creates one Opportunity'],
    [intake, 'createPprf', 1, 'PPRF intake creates one PPRF'],
    [intake, 'resetKycTracks', 1, 'PPRF intake resets both KYC tracks'],
    [intake, 'writeAudit', 3, 'PPRF intake writes three semantic audits'],
    [intake, 'ensurePprfReviewSla', 1, 'PPRF intake ensures one PPRF SLA'],
    [resubmission, 'lockOpportunity', 1, 'PPRF resubmission locked same-tenant Opportunity'],
    [resubmission, 'nextPprfVersion', 1, 'PPRF resubmission allocates a locked version'],
    [resubmission, 'createPprf', 1, 'PPRF resubmission creates one PPRF'],
    [resubmission, 'resetKycTracks', 1, 'PPRF resubmission resets both KYC tracks'],
    [resubmission, 'writeAudit', 1, 'PPRF resubmission writes one receipt audit'],
    [resubmission, 'ensurePprfReviewSla', 1, 'PPRF resubmission ensures one PPRF SLA'],
  ]
  for (const [method, call, count, label] of requiredCounts) {
    invariant(
      methodCallsOnPath(method, 'transaction', call).length === count,
      label
    )
  }
  const opportunityLock = methodCallsOnPath(
    resubmission,
    'transaction',
    'lockOpportunity'
  )[0]
  invariant(
    opportunityLock.arguments.length === 2 &&
      isPath(opportunityLock.arguments[0], 'membership.tenantId') &&
      isPath(opportunityLock.arguments[1], 'command.data.opportunityId'),
    'PPRF resubmission locked same-tenant Opportunity'
  )

  for (const [method, expected, label] of [
    [intake, ['finance', 'owner', 'admin'], 'PPRF intake notification recipients are exact'],
    [resubmission, ['commercial', 'finance'], 'PPRF resubmission notification recipients are exact'],
  ]) {
    const notificationCalls = methodCallsOnPath(
      method,
      'this',
      'createNotifications'
    )
    invariant(notificationCalls.length === 1, label)
    assertExactValues(
      arrayLiteralValues(notificationCalls[0].arguments[2]),
      expected,
      label
    )
  }

  const auditCalls = [
    ...methodCallsOnPath(intake, 'transaction', 'writeAudit'),
    ...methodCallsOnPath(resubmission, 'transaction', 'writeAudit'),
  ].filter((call) => hasStringLiteral(call, 'pprf_submission_service'))
  invariant(auditCalls.length === 2, 'both PPRF commands write one receipt')
  for (const call of auditCalls) {
    const input = unwrapExpression(call.arguments[0])
    invariant(input && ts.isObjectLiteralExpression(input), 'PPRF receipt input')
    const diffProperty = objectProperty(input, 'diff')
    const diff = diffProperty
      ? unwrapExpression(diffProperty.initializer)
      : undefined
    invariant(diff && ts.isObjectLiteralExpression(diff), 'PPRF receipt diff')
    const keyHash = objectProperty(diff, 'idempotency_key_hash')
    const commandHash = objectProperty(diff, 'command_hash')
    invariant(
      keyHash && isPath(keyHash.initializer, 'keyHash'),
      'PPRF receipt stores only the full key hash'
    )
    invariant(
      commandHash && isPath(commandHash.initializer, 'commandHash'),
      'PPRF receipt stores only the full command hash'
    )
    const forbiddenReceiptKeys = new Set([
      'submission_id',
      'submissionId',
      'payload',
      'client_name',
      'clientName',
      'primary_email',
      'primary_phone',
      'scope_notes',
      'scopeNotes',
      'remarks',
    ])
    invariant(
      propertyNames(diff).every((name) => !forbiddenReceiptKeys.has(name)),
      'PPRF receipt excludes raw key and payload fields'
    )
  }

  const lockCommand = namedMethod(
    sourceFile,
    'lockCommand',
    'PPRF advisory command lock adapter'
  )
  invariant(
    hasIdentifier(lockCommand, 'tenantId') &&
      hasIdentifier(lockCommand, 'keyHash') &&
      hasStringLiteral(lockCommand, 'pprf-command:') &&
      lockCommand.getText(sourceFile).includes('hashtextextended'),
    'PPRF advisory lock binds tenant and full key hash'
  )
  const findReceipts = namedMethod(
    sourceFile,
    'findReceipts',
    'PPRF receipt lookup adapter'
  )
  invariant(
    hasEq(findReceipts, 'auditLog.tenant_id', 'tenantId') &&
      hasIdentifier(findReceipts, 'kind') &&
      hasIdentifier(findReceipts, 'keyHash') &&
      findReceipts.getText(sourceFile).includes('pprf_submission_service'),
    'PPRF receipt lookup is tenant scoped'
  )

  const exactAdapter = namedFunction(
    sourceFile,
    'exactCentavosAdapter',
    'PPRF bounded money adapter'
  )
  const weighted = namedFunction(
    sourceFile,
    'weightedCentavos',
    'PPRF weighted money calculation'
  )
  invariant(
      calls(exactAdapter, 'BigInt').length >= 2 &&
      calls(exactAdapter, 'Number').length === 1 &&
      calls(weighted, 'BigInt').length >= 2 &&
      serviceSource.includes('+08:00') &&
      hasIdentifier(sourceFile, 'calendarDateSchema'),
    'PPRF money stays exact until the bounded adapter'
  )

  for (const title of [
    'replays the same intake key exactly and rejects key reuse with changed payload',
    'replays the same resubmission result and rejects changed payload reuse',
    'serializes concurrent same-key intake into one complete effect',
    'serializes concurrent resubmissions into distinct versions',
  ]) {
    invariant(
      serviceTestSource.includes(title),
      'PPRF service tests cover replay, conflict, and concurrency'
    )
  }
  for (const failpoint of [
    'account_audit',
    'opportunity_audit',
    'pprf_audit',
    'kyc',
    'sla',
    'notifications',
  ]) {
    invariant(
      serviceTestSource.includes(`'${failpoint}'`),
      'PPRF service tests cover every atomic failpoint'
    )
  }
}

export function verifyPprfSubmissionContract(
  root,
  sourceOverrides = new Map()
) {
  const graph = {
    root,
    sourceOverrides: normalizedSourceOverrides(sourceOverrides),
    cache: new Map(),
  }
  verifyPprfCentralAuthority(
    readGraphSource(
      root,
      'packages/shared-types/src/authorization.ts',
      graph.sourceOverrides
    )
  )
  verifyPprfService(
    readGraphSource(root, PPRF_SERVICE_PATH, graph.sourceOverrides),
    readGraphSource(root, PPRF_SERVICE_TEST_PATH, graph.sourceOverrides)
  )
  for (const config of PPRF_MOUNTED_ENTRIES) {
    verifyPprfAction(graph, config)
    verifyPprfForm(graph, config)
  }
  verifyPprfPages(graph)
  verifyPprfRouteRegistry(
    readGraphSource(
      root,
      'apps/web/src/lib/operations/nav-config.ts',
      graph.sourceOverrides
    )
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

  verifyPprfSubmissionContract(root)

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
  verifyProjectOpportunityCreationDelegation(
    read(
      root,
      'apps/web/src/app/(dashboard)/projects/[id]/opportunities/actions.ts'
    )
  )
  verifyOpportunityCreationContract(
    read(root, 'packages/shared-types/src/erp-api/opportunities.ts')
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
  verifyOpportunityMutationEntryInventory(root)

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
