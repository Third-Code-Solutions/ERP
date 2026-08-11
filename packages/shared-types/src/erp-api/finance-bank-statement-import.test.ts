import { describe, expect, it } from 'vitest'
import {
  bankStatementImportBodySchema,
  bankStatementImportResultSchema,
} from './finance-bank-statement-import'

const CASH_ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const STATEMENT_ID = '33333333-3333-4333-8333-333333333333'
const SOURCE_BASE64 =
  'ZGF0ZSxyZWZlcmVuY2UsZGVzY3JpcHRpb24sYW1vdW50CjIwMjYtMDctMDEsREVQLERlcG9zaXQsMTAuMDAK'

describe('bank statement import API contracts', () => {
  it('accepts strict, calendar-valid import commands', () => {
    expect(
      bankStatementImportBodySchema.parse({
        cashAccountId: CASH_ACCOUNT_ID,
        referenceNumber: 'JUL-2026-001',
        sourceFileName: 'statement.csv',
        statementStart: '2026-07-01',
        statementEnd: '2026-07-31',
        openingBalanceCents: 0,
        closingBalanceCents: 1000,
        sourceBase64: SOURCE_BASE64,
      })
    ).toMatchObject({ cashAccountId: CASH_ACCOUNT_ID })
  })

  it('rejects authority fields, invalid dates, and invalid source encoding', () => {
    const valid = {
      cashAccountId: CASH_ACCOUNT_ID,
      referenceNumber: 'JUL-2026-001',
      sourceFileName: 'statement.csv',
      statementStart: '2026-07-01',
      statementEnd: '2026-07-31',
      openingBalanceCents: 0,
      closingBalanceCents: 1000,
      sourceBase64: SOURCE_BASE64,
    }
    expect(
      bankStatementImportBodySchema.safeParse({ ...valid, tenantId: TENANT_ID })
        .success
    ).toBe(false)
    expect(
      bankStatementImportBodySchema.safeParse({
        ...valid,
        statementStart: '2026-02-30',
      }).success
    ).toBe(false)
    expect(
      bankStatementImportBodySchema.safeParse({ ...valid, sourceBase64: 'no!' })
        .success
    ).toBe(false)
    expect(
      bankStatementImportResultSchema.safeParse({
        statementId: STATEMENT_ID,
        tenantId: TENANT_ID,
        status: 'reconciled',
        lineCount: 1,
        sourceSha256: 'a'.repeat(64),
      }).success
    ).toBe(false)
  })
})
