import ts from 'typescript'

export type StageAdvanceButtonWiringIssue =
  | 'StageAdvanceButton declaration'
  | 'destination:singleForward->requestDestination'
  | 'destination:stage->requestDestination'
  | 'destination:lostNext->requestDestination'
  | 'requestDestination declaration'
  | 'requestDestination->routeStageAdvanceDestination'
  | 'RegressionReasonDialog.onConfirm->confirmRegression'
  | 'LostReasonDialog.onConfirm->confirmLost'

export type PipelineTransitionAlertClearIssue =
  | 'StageAdvanceButton.advance:setError(null)->startTransition'
  | 'PipelineBoard.performAdvance:clearBanner()->startTransition'

function descendants<T extends ts.Node>(
  root: ts.Node,
  predicate: (node: ts.Node) => node is T
): T[] {
  const matches: T[] = []
  function visit(node: ts.Node) {
    if (predicate(node)) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(root)
  return matches
}

function callName(call: ts.CallExpression): string | null {
  return ts.isIdentifier(call.expression) ? call.expression.text : null
}

function directCall(statement: ts.Statement): ts.CallExpression | null {
  return ts.isExpressionStatement(statement) &&
    ts.isCallExpression(statement.expression)
    ? statement.expression
    : null
}

function findNestedFunction(
  sourceText: string,
  componentName: string,
  functionName: string
): ts.FunctionDeclaration | null {
  const sourceFile = ts.createSourceFile(
    `${componentName}.tsx`,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )
  const component = descendants(sourceFile, ts.isFunctionDeclaration).find(
    (declaration) => declaration.name?.text === componentName
  )
  return (
    component?.body?.statements.find(
      (statement): statement is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(statement) &&
        statement.name?.text === functionName
    ) ?? null
  )
}

function clearsBeforeTransition(
  declaration: ts.FunctionDeclaration | null,
  clearCallName: string,
  clearNullArgument: boolean
): boolean {
  if (!declaration?.body) return false
  const calls = declaration.body.statements.map(directCall)
  const clearIndex = calls.findIndex(
    (call) =>
      call !== null &&
      callName(call) === clearCallName &&
      (clearNullArgument
        ? call.arguments.length === 1 &&
          call.arguments[0]?.kind === ts.SyntaxKind.NullKeyword
        : call.arguments.length === 0)
  )
  const transitionIndex = calls.findIndex(
    (call) => call !== null && callName(call) === 'startTransition'
  )
  return clearIndex >= 0 && transitionIndex >= 0 && clearIndex < transitionIndex
}

function identifierArgument(
  call: ts.CallExpression,
  position: number
): string | null {
  const argument = call.arguments[position]
  return argument && ts.isIdentifier(argument) ? argument.text : null
}

function jsxTagName(element: ts.JsxSelfClosingElement): string {
  return ts.isIdentifier(element.tagName)
    ? element.tagName.text
    : element.tagName.getText()
}

function jsxIdentifierBinding(
  element: ts.JsxSelfClosingElement,
  attributeName: string
): string | null {
  const attribute = element.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === attributeName
  )
  if (
    !attribute?.initializer ||
    !ts.isJsxExpression(attribute.initializer) ||
    !attribute.initializer.expression ||
    !ts.isIdentifier(attribute.initializer.expression)
  ) {
    return null
  }
  return attribute.initializer.expression.text
}

export function validateStageAdvanceButtonSource(
  sourceText: string
): StageAdvanceButtonWiringIssue[] {
  const sourceFile = ts.createSourceFile(
    'stage-advance-button.tsx',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )
  const issues: StageAdvanceButtonWiringIssue[] = []
  const component = descendants(sourceFile, ts.isFunctionDeclaration).find(
    (declaration) => declaration.name?.text === 'StageAdvanceButton'
  )
  if (!component) {
    issues.push('StageAdvanceButton declaration')
    return issues
  }

  const componentCalls = descendants(component, ts.isCallExpression)
  const routedDestinations = new Set(
    componentCalls
      .filter((call) => callName(call) === 'requestDestination')
      .map((call) => identifierArgument(call, 0))
      .filter((argument): argument is string => argument !== null)
  )
  for (const destination of ['singleForward', 'stage', 'lostNext'] as const) {
    if (!routedDestinations.has(destination)) {
      issues.push(`destination:${destination}->requestDestination`)
    }
  }

  const requestDestination = descendants(component, ts.isFunctionDeclaration).find(
    (declaration) => declaration.name?.text === 'requestDestination'
  )
  if (!requestDestination) {
    issues.push('requestDestination declaration')
  } else if (
    !descendants(requestDestination, ts.isCallExpression).some(
      (call) => callName(call) === 'routeStageAdvanceDestination'
    )
  ) {
    issues.push('requestDestination->routeStageAdvanceDestination')
  }

  const dialogs = descendants(component, ts.isJsxSelfClosingElement)
  const regressionDialog = dialogs.find(
    (element) => jsxTagName(element) === 'RegressionReasonDialog'
  )
  if (
    !regressionDialog ||
    jsxIdentifierBinding(regressionDialog, 'onConfirm') !== 'confirmRegression'
  ) {
    issues.push('RegressionReasonDialog.onConfirm->confirmRegression')
  }

  const lostDialog = dialogs.find(
    (element) => jsxTagName(element) === 'LostReasonDialog'
  )
  if (
    !lostDialog ||
    jsxIdentifierBinding(lostDialog, 'onConfirm') !== 'confirmLost'
  ) {
    issues.push('LostReasonDialog.onConfirm->confirmLost')
  }

  return issues
}

export function validatePipelineTransitionAlertClearOrdering(
  stageAdvanceButtonSource: string,
  pipelineBoardSource: string
): PipelineTransitionAlertClearIssue[] {
  const issues: PipelineTransitionAlertClearIssue[] = []
  const advance = findNestedFunction(
    stageAdvanceButtonSource,
    'StageAdvanceButton',
    'advance'
  )
  if (!clearsBeforeTransition(advance, 'setError', true)) {
    issues.push('StageAdvanceButton.advance:setError(null)->startTransition')
  }

  const performAdvance = findNestedFunction(
    pipelineBoardSource,
    'PipelineBoard',
    'performAdvance'
  )
  if (!clearsBeforeTransition(performAdvance, 'clearBanner', false)) {
    issues.push('PipelineBoard.performAdvance:clearBanner()->startTransition')
  }
  return issues
}
