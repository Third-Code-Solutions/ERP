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
