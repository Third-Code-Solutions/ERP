import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { validateStageAdvanceButtonSource } from './stage-advance-button-source-validator'

const componentSource = readFileSync(
  fileURLToPath(new URL('./stage-advance-button.tsx', import.meta.url)),
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
