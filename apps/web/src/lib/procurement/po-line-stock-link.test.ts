import { describe, expect, it } from 'vitest'
import {
  poLineStockReadiness,
  uomForLinkedItem,
  uomForNewItem,
  type PoLineStockLinkInput,
} from './po-line-stock-link'

const READY: PoLineStockLinkInput = {
  materialItemId: 'item-1',
  uomId: 'uom-pc',
  itemCode: 'MAT-1',
  itemActive: true,
  itemTracked: true,
  itemBaseUomId: 'uom-pc',
  itemBaseUomCode: 'PC',
  uomCode: 'PC',
  uomActive: true,
  linkable: true,
}

describe('poLineStockReadiness', () => {
  it('is ready for an active tracked item in its own unit', () => {
    expect(poLineStockReadiness(READY)).toEqual({ ready: true, reason: null })
  })

  it.each([
    ['no item', { materialItemId: null, itemCode: null }, 'Not linked to a stock item'],
    ['an inactive item', { itemActive: false }, 'Stock item MAT-1 is inactive'],
    ['an untracked item', { itemTracked: false }, 'not stock-tracked'],
    ['no unit', { uomId: null, uomCode: null }, 'No unit of measure'],
    ['an inactive unit', { uomActive: false }, 'Unit PC is inactive'],
  ])('is not ready for %s and says why', (_name, patch, text) => {
    const result = poLineStockReadiness({ ...READY, ...patch })
    expect(result.ready).toBe(false)
    expect(result.reason).toContain(text)
  })

  it('refuses a unit that is not the item base unit and names both units', () => {
    const result = poLineStockReadiness({
      ...READY,
      uomId: 'uom-box',
      uomCode: 'BOX',
    })

    expect(result.ready).toBe(false)
    expect(result.reason).toContain('The line is in BOX but stock item MAT-1 is kept in PC')
  })

  it.each([
    ['no item', { materialItemId: null, itemCode: null }, 'Not linked to a stock item.'],
    ['no unit', { uomId: null, uomCode: null }, 'No unit of measure on the line.'],
    [
      'another unit',
      { uomId: 'uom-box', uomCode: 'BOX' },
      "The line is in BOX but stock item MAT-1 is kept in PC. Correct the item's unit in Inventory setup.",
    ],
  ])('gives no link hint for %s where the line cannot be linked', (_name, patch, reason) => {
    const result = poLineStockReadiness({ ...READY, ...patch, linkable: false })
    expect(result).toEqual({ ready: false, reason })
  })
})

describe('uomForLinkedItem', () => {
  const base = {
    lineUnit: 'pcs',
    lineUomId: null,
    resolvedUomId: null,
    itemBaseUomId: 'uom-pc',
    itemCode: 'MAT-1',
  }

  it('keeps a line unit that is the item base unit', () => {
    expect(uomForLinkedItem({ ...base, lineUomId: 'uom-pc' })).toEqual({ uomId: 'uom-pc' })
    expect(uomForLinkedItem({ ...base, resolvedUomId: 'uom-pc' })).toEqual({ uomId: 'uom-pc' })
  })

  it('refuses a different unit instead of converting it', () => {
    const result = uomForLinkedItem({ ...base, lineUnit: 'box', lineUomId: 'uom-box' })

    expect(result).toEqual({
      error: expect.stringContaining('"box" is not the unit stock item MAT-1 is kept in'),
    })
  })

  it('takes the item unit only when the line has no unit text', () => {
    expect(uomForLinkedItem({ ...base, lineUnit: null })).toEqual({ uomId: 'uom-pc' })
    expect(uomForLinkedItem({ ...base, lineUnit: '  ' })).toEqual({ uomId: 'uom-pc' })
  })

  it('refuses a unit text that matches no unit or alias', () => {
    expect(uomForLinkedItem({ ...base, lineUnit: 'bags' })).toEqual({
      error: expect.stringContaining('"bags" is not a known unit of measure'),
    })
  })
})

describe('uomForNewItem', () => {
  it('uses the unit the line already has or resolves to', () => {
    expect(uomForNewItem({ lineUnit: 'pc', lineUomId: 'uom-pc', resolvedUomId: null })).toEqual({ uomId: 'uom-pc' })
    expect(uomForNewItem({ lineUnit: 'pcs', lineUomId: null, resolvedUomId: 'uom-pc' })).toEqual({ uomId: 'uom-pc' })
  })

  it('refuses to invent a unit', () => {
    expect(uomForNewItem({ lineUnit: 'bags', lineUomId: null, resolvedUomId: null })).toEqual({
      error: expect.stringContaining('"bags" is not a known unit of measure'),
    })
    expect(uomForNewItem({ lineUnit: null, lineUomId: null, resolvedUomId: null })).toEqual({
      error: expect.stringContaining('no unit'),
    })
  })
})
