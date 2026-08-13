import { describe, expect, it } from 'vitest'

import { classifyBomLineKind } from '../grain'

describe('classifyBomLineKind', () => {
  it.each(['sqm', 'cu.m', 'm2', 'lm', 'lot'])('classifies %s as a work item', (unit) => {
    expect(classifyBomLineKind(unit)).toMatchObject({
      kind: 'work_item',
      status: 'classified',
      normalizedUnit: unit,
      reason: null,
    })
  })

  it.each(['pc', 'pcs', 'kg', 'set', 'liters'])('classifies %s as a material line needing review', (unit) => {
    expect(classifyBomLineKind(unit)).toMatchObject({
      kind: 'material_line',
      status: 'review',
      normalizedUnit: unit,
    })
  })

  it('normalizes whitespace without broadening the approved UOM list', () => {
    expect(classifyBomLineKind(' cu. m ')).toMatchObject({
      kind: 'work_item',
      status: 'classified',
      normalizedUnit: 'cu.m',
    })
    expect(classifyBomLineKind('litre')).toMatchObject({
      kind: null,
      status: 'review',
      normalizedUnit: 'litre',
    })
  })

  it('queues a missing or ambiguous UOM instead of guessing', () => {
    expect(classifyBomLineKind(null)).toMatchObject({
      kind: null,
      status: 'review',
      normalizedUnit: null,
    })
    expect(classifyBomLineKind('bundle')).toMatchObject({
      kind: null,
      status: 'review',
      normalizedUnit: 'bundle',
    })
  })
})
