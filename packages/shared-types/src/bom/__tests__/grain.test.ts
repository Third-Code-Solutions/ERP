import { describe, expect, it } from 'vitest'

import { classifyBomLineKind, reclassifyBomLineForUnit } from '../grain'

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

describe('reclassifyBomLineForUnit', () => {
  const classifiedWorkItem = {
    unit: 'sqm',
    kind: 'work_item',
    classificationStatus: 'classified',
    parentLineItemId: null,
  }

  it('does nothing when the unit only changes in case or spacing', () => {
    expect(reclassifyBomLineForUnit(classifiedWorkItem, ' SQM ')).toBeNull()
  })

  it('keeps a work item classified when it moves to another work-item unit', () => {
    expect(reclassifyBomLineForUnit(classifiedWorkItem, 'lm')).toMatchObject({
      kind: 'work_item',
      status: 'classified',
      reason: null,
      parentLineItemId: null,
    })
  })

  it('queues a work item for review when its new unit is ambiguous', () => {
    expect(reclassifyBomLineForUnit(classifiedWorkItem, 'bundle')).toMatchObject({
      kind: 'work_item',
      status: 'review',
      proposedKind: null,
    })
  })

  it('asks for a parent again when a work item becomes a material unit', () => {
    expect(reclassifyBomLineForUnit(classifiedWorkItem, 'pc')).toMatchObject({
      kind: 'material_line',
      status: 'review',
      proposedKind: 'material_line',
      parentLineItemId: null,
    })
  })

  it('keeps a confirmed material line and its parent across material units', () => {
    expect(
      reclassifyBomLineForUnit(
        {
          unit: 'pc',
          kind: 'material_line',
          classificationStatus: 'classified',
          parentLineItemId: '11111111-1111-4111-8111-111111111111',
        },
        'kg',
      ),
    ).toBeNull()
  })

  it('drops the parent when a material line becomes a work item', () => {
    expect(
      reclassifyBomLineForUnit(
        {
          unit: 'pc',
          kind: 'material_line',
          classificationStatus: 'classified',
          parentLineItemId: '11111111-1111-4111-8111-111111111111',
        },
        'sqm',
      ),
    ).toMatchObject({ kind: 'work_item', status: 'classified', parentLineItemId: null })
  })
})
