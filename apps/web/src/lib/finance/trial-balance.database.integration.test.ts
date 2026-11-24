import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '@third-code-erp/database'
import {
  fiscalPeriods,
  journalEntries,
  journalLines,
  ledgerAccounts,
  tenants,
  users,
} from '@third-code-erp/database/schema'
import { getTrialBalance } from './report-queries'
import type { TrialBalance } from './trial-balance'

const enabled =
  Boolean(process.env.DATABASE_URL) &&
  process.env.DATABASE_ACCOUNTING_EXPECTED === '1'
const suite = enabled ? describe : describe.skip

if (!enabled) {
  console.warn(
    '[trial-balance] disposable DATABASE_URL and DATABASE_ACCOUNTING_EXPECTED=1 required; skipping'
  )
}

const ROLLBACK = Symbol('rollback')

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

interface LedgerFixture {
  tenantId: string
  actorId: string
  cashId: string
  equityId: string
}

async function seedLedger(tx: Tx, label: string, suffix: string): Promise<LedgerFixture> {
  const [tenant] = await tx
    .insert(tenants)
    .values({ name: `Trial balance ${label} ${suffix}`, slug: `tb-${label}-${suffix}` })
    .returning({ id: tenants.id })
  if (!tenant) throw new Error('tenant was not created')

  const actorId = randomUUID()
  await tx.insert(users).values({
    id: actorId,
    tenant_id: tenant.id,
    email: `tb-${label}-${suffix}@test.invalid`,
    full_name: `Trial balance ${label}`,
    role: 'admin',
  })
  await tx.insert(fiscalPeriods).values({
    tenant_id: tenant.id,
    name: 'FY 2026',
    starts_on: '2026-01-01',
    ends_on: '2026-12-31',
    created_by: actorId,
  })
  const [cash, equity] = await tx
    .insert(ledgerAccounts)
    .values([
      {
        tenant_id: tenant.id,
        code: '1000',
        name: 'Cash',
        account_type: 'asset',
        normal_balance: 'debit',
        created_by: actorId,
      },
      {
        tenant_id: tenant.id,
        code: '3000',
        name: 'Equity',
        account_type: 'equity',
        normal_balance: 'credit',
        created_by: actorId,
      },
    ])
    .returning({ id: ledgerAccounts.id })
  if (!cash || !equity) throw new Error('ledger accounts were not created')

  return { tenantId: tenant.id, actorId, cashId: cash.id, equityId: equity.id }
}

/** One balanced entry: debit cash, credit equity. Posted through the ledger's own function unless left as a draft. */
async function entry(
  tx: Tx,
  ledger: LedgerFixture,
  postingDate: string,
  cents: number,
  status: 'draft' | 'posted'
): Promise<string> {
  const [created] = await tx
    .insert(journalEntries)
    .values({
      tenant_id: ledger.tenantId,
      posting_date: postingDate,
      description: `Trial balance probe ${postingDate}`,
      created_by: ledger.actorId,
    })
    .returning({ id: journalEntries.id })
  if (!created) throw new Error('journal entry was not created')

  await tx.insert(journalLines).values([
    {
      tenant_id: ledger.tenantId,
      journal_entry_id: created.id,
      ledger_account_id: ledger.cashId,
      line_number: 1,
      debit_cents: cents,
      credit_cents: 0,
    },
    {
      tenant_id: ledger.tenantId,
      journal_entry_id: created.id,
      ledger_account_id: ledger.equityId,
      line_number: 2,
      debit_cents: 0,
      credit_cents: cents,
    },
  ])
  if (status === 'posted') {
    await tx.execute(
      sql`select * from public.post_journal_entry(${created.id}::uuid, ${ledger.actorId}::uuid)`
    )
  }
  return created.id
}

function amounts(trialBalance: TrialBalance) {
  return trialBalance.rows.map((row) => ({
    id: row.id,
    code: row.code,
    debitCents: row.debitCents,
    creditCents: row.creditCents,
    balanceCents: row.balanceCents,
  }))
}

suite('trial balance against disposable PostgreSQL', () => {
  it('sums posted lines only, includes the cut-off day, nets a reversal and never reads another tenant', async () => {
    let observed:
      | {
          ledger: LedgerFixture
          other: LedgerFixture
          cumulative: TrialBalance
          november: TrialBalance
          otherTenant: TrialBalance
        }
      | undefined

    try {
      await db.transaction(async (tx) => {
        const suffix = randomUUID().slice(0, 12)
        const ledger = await seedLedger(tx, 'a', suffix)
        const other = await seedLedger(tx, 'b', suffix)

        await entry(tx, ledger, '2026-10-31', 2_000, 'posted') // before November
        const reversed = await entry(tx, ledger, '2026-11-10', 7_000, 'posted')
        await tx.execute(
          sql`select * from public.reverse_journal_entry(${reversed}::uuid, ${ledger.actorId}::uuid, 'Trial balance probe reversal', '2026-11-12'::date)`
        )
        await entry(tx, ledger, '2026-11-15', 5_000, 'draft') // never posted
        await entry(tx, ledger, '2026-11-30', 10_000, 'posted') // on the cut-off day
        await entry(tx, ledger, '2026-12-01', 3_000, 'posted') // after the cut-off
        await entry(tx, other, '2026-11-20', 99_900, 'posted') // another tenant

        observed = {
          ledger,
          other,
          cumulative: await getTrialBalance(ledger.tenantId, { from: null, to: '2026-11-30' }, tx),
          november: await getTrialBalance(
            ledger.tenantId,
            { from: '2026-11-01', to: '2026-11-30' },
            tx
          ),
          otherTenant: await getTrialBalance(other.tenantId, { from: null, to: '2026-11-30' }, tx),
        }
        throw ROLLBACK
      })
    } catch (error) {
      if (error !== ROLLBACK) throw error
    }

    if (!observed) throw new Error('the trial balance was not read')
    const { ledger, other, cumulative, november, otherTenant } = observed

    // Cumulative to 30 Nov: 2,000 + 10,000 stay; 7,000 and its reversal net out;
    // the draft and the 1 Dec entry are left out; the other tenant never appears.
    expect(amounts(cumulative)).toEqual([
      { id: ledger.cashId, code: '1000', debitCents: 19_000, creditCents: 7_000, balanceCents: 12_000 },
      { id: ledger.equityId, code: '3000', debitCents: 7_000, creditCents: 19_000, balanceCents: 12_000 },
    ])
    expect(cumulative).toMatchObject({
      totalDebitCents: 26_000,
      totalCreditCents: 26_000,
      isBalanced: true,
    })

    // November movement: from 1 Nov to 30 Nov inclusive, so 31 Oct drops out.
    expect(amounts(november)).toEqual([
      { id: ledger.cashId, code: '1000', debitCents: 17_000, creditCents: 7_000, balanceCents: 10_000 },
      { id: ledger.equityId, code: '3000', debitCents: 7_000, creditCents: 17_000, balanceCents: 10_000 },
    ])

    // The other tenant sees only its own accounts and its own entry.
    expect(amounts(otherTenant)).toEqual([
      { id: other.cashId, code: '1000', debitCents: 99_900, creditCents: 0, balanceCents: 99_900 },
      { id: other.equityId, code: '3000', debitCents: 0, creditCents: 99_900, balanceCents: 99_900 },
    ])
  })
})
