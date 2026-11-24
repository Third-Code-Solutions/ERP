import 'reflect-metadata'

import type { BankStatementImportCommand } from '@third-code-erp/shared-types'
import { describe, expect, it } from 'vitest'
import { prepareImportBytes } from './finance-reconciliation-workflow.service'

const command = {
  statementStart: '2026-07-01',
  statementEnd: '2026-07-31',
  openingBalanceCents: 100_000,
  closingBalanceCents: 99_000,
} as BankStatementImportCommand

const csv = (...rows: string[]) =>
  Buffer.from(['date,reference,description,amount', ...rows].join('\n'))

describe('Core bank statement import preparation', () => {
  it('numbers identical rows as separate bank entries instead of refusing them', () => {
    const prepared = prepareImportBytes(
      command,
      csv(
        '2026-07-02,FEE,Bank service fee,-2.50',
        '2026-07-02,FEE,Bank service fee,-2.50',
        '2026-07-03,,Card settlement,-2.50',
        '2026-07-02,fee,BANK SERVICE FEE ,-2.50'
      )
    )

    expect(prepared.lines.map((line) => line.occurrence)).toEqual([1, 2, 1, 3])
  })

  it('still refuses a statement whose lines do not roll forward', () => {
    expect(() =>
      prepareImportBytes(command, csv('2026-07-02,FEE,Bank service fee,-2.50'))
    ).toThrow('Bank statement balances do not roll forward')
  })
})
