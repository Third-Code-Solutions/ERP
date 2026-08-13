import { describe, expect, it } from 'vitest'
import { groupBomLinesByDivision } from './bom-hierarchy'

describe('groupBomLinesByDivision', () => {
  it('preserves source order and groups rows by division', () => {
    const groups = groupBomLinesByDivision([
      {
        id: 'a',
        division_id: 'finishes',
        division_label: 'Finishes',
        parent_line_item_id: null,
        line_total_cents: 100,
      },
      {
        id: 'b',
        division_id: 'structural',
        division_label: 'Structural',
        parent_line_item_id: null,
        line_total_cents: 200,
      },
      {
        id: 'c',
        division_id: 'finishes',
        division_label: 'Finishes',
        parent_line_item_id: null,
        line_total_cents: 300,
      },
    ])

    expect(groups.map((group) => group.label)).toEqual(['Finishes', 'Structural'])
    expect(groups[0]?.lines.map((line) => line.id)).toEqual(['a', 'c'])
    expect(groups[0]?.subtotal_cents).toBe(400)
  })

  it('keeps unassigned lines visible in a named bucket', () => {
    const [group] = groupBomLinesByDivision([
      {
        id: 'unassigned',
        division_id: null,
        division_label: null,
        parent_line_item_id: null,
        line_total_cents: 25,
      },
    ])

    expect(group?.label).toBe('Unassigned division')
    expect(group?.subtotal_cents).toBe(25)
  })

  it('does not double-count child rows in a division subtotal', () => {
    const [group] = groupBomLinesByDivision([
      {
        id: 'work',
        division_id: 'finishes',
        division_label: 'Finishes',
        parent_line_item_id: null,
        line_total_cents: 1000,
      },
      {
        id: 'material',
        division_id: 'finishes',
        division_label: 'Finishes',
        parent_line_item_id: 'work',
        line_total_cents: 400,
      },
    ])

    expect(group?.lines).toHaveLength(2)
    expect(group?.subtotal_cents).toBe(1000)
  })
})
