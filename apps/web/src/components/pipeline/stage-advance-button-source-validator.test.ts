import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import {
  validatePipelineTransitionAlertClearOrdering,
  validateStageAdvanceButtonSource,
} from './stage-advance-button-source-validator'

const componentSource = readFileSync(
  fileURLToPath(new URL('./stage-advance-button.tsx', import.meta.url)),
  'utf8'
)
const boardSource = readFileSync(
  fileURLToPath(new URL('./pipeline-board.tsx', import.meta.url)),
  'utf8'
)

function replaceSemanticCall(
  source: string,
  callee: string,
  argument: string,
  replacementCallee: string
): string {
  const pattern = new RegExp(`${callee}\\s*\\(\\s*${argument}\\s*\\)`)
  expect(source).toMatch(pattern)
  return source.replace(pattern, `${replacementCallee}(${argument})`)
}

function replaceSemanticBinding(
  source: string,
  property: string,
  value: string,
  replacementValue: string
): string {
  const pattern = new RegExp(`${property}\\s*=\\s*\\{\\s*${value}\\s*\\}`)
  expect(source).toMatch(pattern)
  return source.replace(pattern, `${property}={${replacementValue}}`)
}

function replaceStageRouterCall(source: string): string {
  const pattern =
    /routeStageAdvanceDestination\s*\(\s*sourceStage\s*,\s*stage\s*,/
  expect(source).toMatch(pattern)
  return source.replace(pattern, 'advance(sourceStage, stage,')
}

function moveClearAfterTransition(
  source: string,
  functionName: string,
  clearCallName: string
): string {
  const sourceFile = ts.createSourceFile(
    'caller.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )
  let target: ts.FunctionDeclaration | undefined
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === functionName) {
      target = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  const body = target?.body
  expect(body).toBeDefined()
  if (!body) throw new Error(`Missing ${functionName} function body`)

  const directCalls = body.statements.map((statement) => ({
    statement,
    call:
      ts.isExpressionStatement(statement) &&
      ts.isCallExpression(statement.expression)
        ? statement.expression
        : null,
  }))
  const clear = directCalls.find(
    ({ call }) =>
      call &&
      ts.isIdentifier(call.expression) &&
      call.expression.text === clearCallName
  )?.statement
  const transition = directCalls.find(
    ({ call }) =>
      call && ts.isIdentifier(call.expression) && call.expression.text === 'startTransition'
  )?.statement
  expect(clear).toBeDefined()
  expect(transition).toBeDefined()
  if (!clear || !transition) {
    throw new Error(`Missing ${clearCallName} or startTransition call`)
  }
  expect(clear.getStart(sourceFile)).toBeLessThan(transition.getStart(sourceFile))

  return (
    source.slice(0, clear.getStart(sourceFile)) +
    transition.getText(sourceFile) +
    source.slice(clear.getEnd(), transition.getStart(sourceFile)) +
    clear.getText(sourceFile) +
    source.slice(transition.getEnd())
  )
}

describe('validateStageAdvanceButtonSource', () => {
  it('accepts the actual StageAdvanceButton caller wiring', () => {
    expect(validateStageAdvanceButtonSource(componentSource)).toEqual([])
  })

  it.each(['singleForward', 'stage', 'lostNext'])(
    'rejects disconnecting the %s destination control',
    (argument) => {
      const mutant = replaceSemanticCall(
        componentSource,
        'requestDestination',
        argument,
        'advance'
      )

      expect(validateStageAdvanceButtonSource(mutant)).toContain(
        `destination:${argument}->requestDestination`
      )
    }
  )

  it('rejects disconnecting requestDestination from the shared router', () => {
    const mutant = replaceStageRouterCall(componentSource)

    expect(validateStageAdvanceButtonSource(mutant)).toContain(
      'requestDestination->routeStageAdvanceDestination'
    )
  })

  it('rejects disconnecting regression confirmation', () => {
    const mutant = replaceSemanticBinding(
      componentSource,
      'onConfirm',
      'confirmRegression',
      'confirmLost'
    )

    expect(validateStageAdvanceButtonSource(mutant)).toContain(
      'RegressionReasonDialog.onConfirm->confirmRegression'
    )
  })

  it('rejects disconnecting Lost confirmation', () => {
    const mutant = replaceSemanticBinding(
      componentSource,
      'onConfirm',
      'confirmLost',
      'confirmRegression'
    )

    expect(validateStageAdvanceButtonSource(mutant)).toContain(
      'LostReasonDialog.onConfirm->confirmLost'
    )
  })
})

describe('validatePipelineTransitionAlertClearOrdering', () => {
  it('requires both callers to clear stale alerts before startTransition', () => {
    expect(
      validatePipelineTransitionAlertClearOrdering(componentSource, boardSource)
    ).toEqual([])
  })

  it.each([
    {
      caller: 'StageAdvanceButton',
      source: componentSource,
      functionName: 'advance',
      clearCallName: 'setError',
      issue: 'StageAdvanceButton.advance:setError(null)->startTransition' as const,
    },
    {
      caller: 'PipelineBoard',
      source: boardSource,
      functionName: 'performAdvance',
      clearCallName: 'clearBanner',
      issue: 'PipelineBoard.performAdvance:clearBanner()->startTransition' as const,
    },
  ])(
    'rejects moving $caller stale-alert clearing after startTransition',
    (fixture) => {
      const stageSource =
        fixture.caller === 'StageAdvanceButton'
          ? moveClearAfterTransition(
              fixture.source,
              fixture.functionName,
              fixture.clearCallName
            )
          : componentSource
      const pipelineSource =
        fixture.caller === 'PipelineBoard'
          ? moveClearAfterTransition(
              fixture.source,
              fixture.functionName,
              fixture.clearCallName
            )
          : boardSource

      expect(
        validatePipelineTransitionAlertClearOrdering(stageSource, pipelineSource)
      ).toContain(fixture.issue)
    }
  )
})
