import { describe, expect, it } from 'vitest'
import {
  buildTakeoffImportKey,
  parseStructuredTakeoff,
  validateTakeoffRows,
} from './takeoff'

describe('structured takeoff importer', () => {
  it('parses a mapped CSV without coupling to a producer name', async () => {
    const csv = [
      'Row,Description,Qty,UOM,Division,Location,Notes',
      'A-001,Suspended ceiling,12.5,sqm,Finishes,Level 2,Reflected ceiling plan',
    ].join('\n')

    const result = await parseStructuredTakeoff(
      Buffer.from(csv),
      'takeoff.csv',
      {
        sourceRowKey: 'Row',
        description: 'Description',
        quantity: 'Qty',
        unit: 'UOM',
        division: 'Division',
        location: 'Location',
        notes: 'Notes',
      },
    )

    expect(result.rows).toEqual([
      expect.objectContaining({
        sourceRowKey: 'A-001',
        description: 'Suspended ceiling',
        quantity: 12.5,
        unit: 'sqm',
        division: 'Finishes',
        location: 'Level 2',
      }),
    ])
    expect(result.missingColumns).toEqual([])
  })

  it('returns a structured missing-column result instead of dropping the file', async () => {
    const result = await parseStructuredTakeoff(
      Buffer.from('Description,Qty\nPaint,4'),
      'takeoff.csv',
      {
        sourceRowKey: 'Row',
        description: 'Description',
        quantity: 'Qty',
        unit: 'UOM',
      },
    )

    expect(result.rows).toEqual([])
    expect(result.missingColumns).toEqual(['UOM'])
  })

  it('flags invalid UOM, missing division, and duplicate source keys', async () => {
    const result = await parseStructuredTakeoff(
      Buffer.from([
        'Row,Description,Qty,UOM,Division',
        'A-001,Ceiling,1,sqm,Finishes',
        'A-001,Ceiling duplicate,2,box,',
      ].join('\n')),
      'takeoff.csv',
      {
        sourceRowKey: 'Row',
        description: 'Description',
        quantity: 'Qty',
        unit: 'UOM',
        division: 'Division',
      },
    )

    const validation = validateTakeoffRows(result.rows)

    expect(validation).toEqual([
      { sourceRowKey: 'A-001', code: 'DUPLICATE_SOURCE_ROW_KEY', message: 'Source row key is duplicated in this import.' },
      { sourceRowKey: 'A-001', code: 'INVALID_UOM', message: 'UOM "box" is not recognized.' },
      { sourceRowKey: 'A-001', code: 'MISSING_DIVISION', message: 'Division is required before import.' },
    ])
  })

  it('creates a stable import key from source, drawing revision, and file digest', () => {
    const first = buildTakeoffImportKey('CAD', 'revision-1', 'abc123')
    const second = buildTakeoffImportKey('CAD', 'revision-1', 'abc123')
    const different = buildTakeoffImportKey('CAD', 'revision-2', 'abc123')

    expect(first).toBe(second)
    expect(first).not.toBe(different)
  })
})
