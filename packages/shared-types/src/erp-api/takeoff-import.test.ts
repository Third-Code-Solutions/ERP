import { describe, expect, it } from 'vitest'
import {
  TAKEOFF_IMPORT_MAX_COMMAND_BYTES,
  TAKEOFF_IMPORT_MAX_ROWS,
  takeoffImportCommandByteLength,
  takeoffImportCommandSchema,
  takeoffImportResultSchema,
} from './takeoff-import'

const UUID = '11111111-1111-4111-8111-111111111111'
const SHA256 = 'a'.repeat(64)

const command = {
  mode: 'commit' as const,
  bomId: UUID,
  source: 'generic',
  drawingRevisionKey: 'estimate-v1',
  fileName: 'estimate.csv',
  contentSha256: SHA256,
  mapping: {
    description: 'Description',
    quantity: 'Quantity',
    unit: 'UOM',
  },
  missingColumns: [],
  rows: [
    {
      sourceRowKey: 'A-001',
      description: 'Suspended ceiling',
      quantity: 12.5,
      unit: 'sqm',
      division: 'Finishes',
      location: 'Level 2',
      itemNo: 'A-001',
      notes: null,
      raw: { description: 'Suspended ceiling', quantity: '12.5' },
    },
  ],
}

describe('takeoff import Core API contracts', () => {
  it('accepts a bounded tenant-free parsed command', () => {
    expect(takeoffImportCommandSchema.parse(command)).toEqual({
      ...command,
      target: 'existing_bom',
    })
  })

  it('permits only document-provenanced, commit-only AI candidates', () => {
    const aiDocumentCommand = {
      mode: 'commit' as const,
      target: 'ai_document' as const,
      projectId: UUID,
      documentId: '22222222-2222-4222-8222-222222222222',
      sourceModel: 'gpt-4o-mini',
      source: 'ai-document',
      drawingRevisionKey: 'document:22222222-2222-4222-8222-222222222222',
      fileName: 'scope.pdf',
      contentSha256: SHA256,
      mapping: { description: 'description', quantity: 'quantity', unit: 'unit' },
      missingColumns: [],
      rows: command.rows,
    }

    expect(takeoffImportCommandSchema.safeParse(aiDocumentCommand).success).toBe(
      true
    )
    expect(
      takeoffImportCommandSchema.safeParse({
        ...aiDocumentCommand,
        mode: 'preview',
      }).success
    ).toBe(false)
    expect(
      takeoffImportCommandSchema.safeParse({
        ...aiDocumentCommand,
        bomId: UUID,
      }).success
    ).toBe(false)
    expect(
      takeoffImportCommandSchema.safeParse({
        ...aiDocumentCommand,
        source: 'generic',
      }).success
    ).toBe(false)
  })

  it('rejects caller authority, malformed evidence, and oversized row counts', () => {
    expect(
      takeoffImportCommandSchema.safeParse({ ...command, tenantId: UUID }).success
    ).toBe(false)
    expect(
      takeoffImportCommandSchema.safeParse({
        ...command,
        contentSha256: 'not-a-digest',
      }).success
    ).toBe(false)
    expect(
      takeoffImportCommandSchema.safeParse({
        ...command,
        rows: Array.from({ length: TAKEOFF_IMPORT_MAX_ROWS + 1 }, () => command.rows[0]),
      }).success
    ).toBe(false)
  })

  it('enforces byte size and mapping cardinality before Core transport', () => {
    const oversizedRows = Array.from(
      { length: TAKEOFF_IMPORT_MAX_ROWS },
      (_, index) => ({
        ...command.rows[0],
        sourceRowKey: `row-${index}`,
        raw: { source: '🧱'.repeat(300) },
      })
    )
    const oversizedCommand = { ...command, rows: oversizedRows }

    expect(takeoffImportCommandByteLength(oversizedCommand)).toBeGreaterThan(
      TAKEOFF_IMPORT_MAX_COMMAND_BYTES
    )
    expect(takeoffImportCommandSchema.safeParse(oversizedCommand).success).toBe(
      false
    )
    expect(
      takeoffImportCommandSchema.safeParse({
        ...command,
        mapping: Object.fromEntries(
          Array.from({ length: 33 }, (_, index) => [
            `column-${index}`,
            'Description',
          ])
        ),
      }).success
    ).toBe(false)
  })

  it('requires Core-derived tenant identity in results', () => {
    expect(
      takeoffImportResultSchema.safeParse({
        ok: true,
        mode: 'commit',
        tenantId: UUID,
        importId: UUID,
        source: 'generic',
        sourceKey: SHA256,
        linesUpserted: 1,
        unresolvedCount: 0,
        bomId: UUID,
      }).success
    ).toBe(true)
    expect(
      takeoffImportResultSchema.safeParse({
        ok: true,
        mode: 'commit',
        importId: UUID,
        source: 'generic',
        sourceKey: SHA256,
        linesUpserted: 1,
        unresolvedCount: 0,
        bomId: UUID,
      }).success
    ).toBe(false)
  })
})
