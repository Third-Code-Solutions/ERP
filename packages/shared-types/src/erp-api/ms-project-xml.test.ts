import { describe, expect, it } from 'vitest'
import {
  MS_PROJECT_XML_PARSER_VERSION,
  msProjectXmlCommitCommandSchema,
  msProjectXmlDateEvidenceSchema,
  msProjectXmlPreviewSchema,
  msProjectXmlPreviewCommandSchema,
} from './ms-project-xml'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'
const OWNER_ID = '66666666-6666-4666-8666-666666666666'
const SOURCE_BASE64 = 'PFByb2plY3QgLz4='

describe('MS Project XML shared contracts', () => {
  it('requires the exact source, parser snapshot, request and reviewed mappings', () => {
    const preview = msProjectXmlPreviewCommandSchema.parse({
      projectId: PROJECT_ID,
      sourceBase64: SOURCE_BASE64,
      fileName: '  schedule.xml  ',
    })
    expect(preview).toEqual({
      projectId: PROJECT_ID,
      sourceBase64: SOURCE_BASE64,
      fileName: 'schedule.xml',
    })

    const commit = msProjectXmlCommitCommandSchema.parse({
      projectId: PROJECT_ID,
      sourceBase64: preview.sourceBase64,
      sourceHash: 'a'.repeat(64),
      parserVersion: MS_PROJECT_XML_PARSER_VERSION,
      requestId: REQUEST_ID,
      mappings: [{ sourceUid: 1, sourceOutlineLevel: 2, level: 'l2', ownerId: OWNER_ID }],
    })
    expect(commit).toMatchObject({
      projectId: PROJECT_ID,
      parserVersion: MS_PROJECT_XML_PARSER_VERSION,
      requestId: REQUEST_ID,
      mappings: [{ sourceUid: 1, sourceOutlineLevel: 2, level: 'l2', ownerId: OWNER_ID }],
    })
    expect(() => msProjectXmlCommitCommandSchema.parse({
      ...commit,
      mappings: [{ sourceUid: 1, sourceOutlineLevel: 2, level: 'l2', ownerId: OWNER_ID, inferred: true }],
    })).toThrow()
    expect(() => msProjectXmlCommitCommandSchema.parse({
      ...commit,
      mappings: [
        { sourceUid: 1, sourceOutlineLevel: 2, level: 'l2', ownerId: OWNER_ID },
        { sourceUid: 1, sourceOutlineLevel: 2, level: 'l2', ownerId: null },
      ],
    })).toThrow()
  })

  it('canonicalizes UUID identity and validates importable preview invariants', () => {
    const uppercaseProjectId = '33333333-3333-4333-8333-333333333333'.toUpperCase()
    const uppercaseRequestId = REQUEST_ID.toUpperCase()
    const command = msProjectXmlCommitCommandSchema.parse({
      projectId: uppercaseProjectId,
      sourceBase64: SOURCE_BASE64,
      sourceHash: 'a'.repeat(64),
      parserVersion: MS_PROJECT_XML_PARSER_VERSION,
      requestId: uppercaseRequestId,
      mappings: [{ sourceUid: 1, sourceOutlineLevel: 1, level: 'l1', ownerId: OWNER_ID.toUpperCase() }],
    })
    expect(command.projectId).toBe(PROJECT_ID)
    expect(command.requestId).toBe(REQUEST_ID)
    expect(command.mappings[0]?.ownerId).toBe(OWNER_ID)

    expect(msProjectXmlDateEvidenceSchema.parse({ raw: '0001-02-28T08:00:00Z', calendarDate: '0001-02-28' })).toEqual({ raw: '0001-02-28T08:00:00Z', calendarDate: '0001-02-28' })
    expect(() => msProjectXmlPreviewSchema.parse({
      sourceHash: 'a'.repeat(64),
      sourceBytes: 1,
      parserVersion: MS_PROJECT_XML_PARSER_VERSION,
      fileName: null,
      projectName: 'empty',
      tasks: [],
      issues: [],
      notices: [],
      disclosures: ['planning only'],
      canImport: true,
      omittedSummaryTask: null,
    })).toThrow()
  })
})
