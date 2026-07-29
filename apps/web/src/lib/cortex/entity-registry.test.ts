import { cortexNodeTypeEnum } from '@third-code-erp/database/schema'
import { describe, expect, it } from 'vitest'
import {
  CORTEX_ENTITY_REGISTRY,
  CORTEX_ENTITY_TYPES,
  CORTEX_REF_TABLES,
  cortexColor,
  cortexEntityDefinition,
  cortexHref,
  isCortexRefTable,
} from './entity-registry'

describe('Cortex entity registry', () => {
  it('covers every database node type exactly once', () => {
    expect([...CORTEX_ENTITY_TYPES].sort()).toEqual(
      [...cortexNodeTypeEnum.enumValues].sort()
    )
    expect(CORTEX_ENTITY_TYPES).toHaveLength(48)
  })

  it('provides navigation, access, display, and reference metadata', () => {
    for (const type of CORTEX_ENTITY_TYPES) {
      const definition = CORTEX_ENTITY_REGISTRY[type]
      expect(definition.label).not.toBe('')
      expect(definition.color).toMatch(/^#[0-9a-f]{6}$/i)
      expect(definition.accessPath).toMatch(/^\//)
      expect(Array.isArray(definition.refTables)).toBe(true)
      expect(
        definition.href({
          type,
          refId: 'record-id',
          projectId: 'project-id',
        })
      ).toMatch(/^\//)
    }
  })

  it('recognizes every registered source table', () => {
    for (const refTable of CORTEX_REF_TABLES) {
      expect(isCortexRefTable(refTable)).toBe(true)
    }
    expect(isCortexRefTable('unregistered_records')).toBe(false)
  })

  it('does not invent sources for enum values without a mirrored UUID table', () => {
    expect(CORTEX_ENTITY_REGISTRY.invoice_line.refTables).toEqual([])
    expect(CORTEX_ENTITY_REGISTRY.milestone.refTables).toEqual([])
    expect(CORTEX_ENTITY_REGISTRY.announcement.refTables).toEqual([])
    expect(CORTEX_ENTITY_REGISTRY.audit_event.refTables).toEqual([])
  })

  it.each([
    ['project', '/projects/record-id'],
    ['vendor', '/purchase-orders'],
    ['invoice', '/invoices/record-id'],
    ['journal_entry', '/finance/journals/record-id'],
    ['supplier_bill', '/finance/payables/record-id'],
    ['cash_account', '/finance/cash'],
    ['cash_transaction', '/finance/cash/record-id'],
    ['stock_receipt', '/inventory/receipts/record-id'],
  ])('maps %s to its canonical route', (type, expected) => {
    expect(
      cortexHref({ type, refId: 'record-id', projectId: null })
    ).toBe(expected)
  })

  it('uses the Project route for Project-scoped records', () => {
    expect(
      cortexHref({
        type: 'change_order',
        refId: 'record-id',
        projectId: 'project-id',
      })
    ).toBe('/projects/project-id/vos/record-id')
    expect(
      cortexHref({
        type: 'project_budget',
        refId: 'record-id',
        projectId: 'project-id',
      })
    ).toBe('/projects/project-id/cost/budget')
  })

  it('denies unknown types and uses a neutral fallback color', () => {
    expect(cortexEntityDefinition('future_type')).toBeNull()
    expect(
      cortexHref({
        type: 'future_type',
        refId: 'record-id',
        projectId: null,
      })
    ).toBeNull()
    expect(cortexColor('future_type')).toBe('#64748b')
  })
})
