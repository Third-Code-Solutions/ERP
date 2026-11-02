import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AppRole } from '@third-code-erp/auth'

const mocks = vi.hoisted(() => ({ profile: vi.fn(), select: vi.fn() }))
vi.mock('@third-code-erp/auth', () => ({ getUserProfile: mocks.profile }))
vi.mock('@third-code-erp/database', () => ({ db: { select: mocks.select } }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND') } }))

import { requirePrintProfile } from './print-authorization'
import { canViewPath } from './nav-config'
import InvoicePrint from '@/app/(print)/invoices/[id]/print/page'
import TaxPrint from '@/app/(print)/invoices/[id]/bir2307/page'
import PurchasePrint from '@/app/(print)/purchase-orders/[id]/print/page'

const id = '11111111-1111-4111-8111-111111111111'
const roles: AppRole[] = ['owner', 'admin', 'viewer', 'sales', 'commercial', 'design', 'sd_pm_pe', 'finance', 'procurement', 'safety', 'cx', 'estimator', 'pm']

beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('React', React) })
afterEach(() => vi.unstubAllGlobals())

describe('print routes enforce source-document role policy', () => {
  for (const role of roles) {
    for (const document of ['invoice', 'purchase-order'] as const) {
      it(`${role}: ${document}`, async () => {
        const profile = { role, tenantId: id }
        mocks.profile.mockResolvedValue(profile)
        const path = document === 'invoice' ? `/invoices/${id}` : `/purchase-orders/${id}`
        if (canViewPath(role, path)) {
          await expect(requirePrintProfile(document, id)).resolves.toBe(profile)
        } else {
          await expect(requirePrintProfile(document, id)).rejects.toThrow('NOT_FOUND')
        }
      })
    }
  }

  for (const [name, render] of [['invoice', InvoicePrint], ['tax', TaxPrint], ['purchase order', PurchasePrint]] as const) {
    it(`denies sales before reading ${name}`, async () => {
      mocks.profile.mockResolvedValue({ role: 'sales', tenantId: id })
      await expect(render({ params: Promise.resolve({ id }) })).rejects.toThrow('NOT_FOUND')
      expect(mocks.select).not.toHaveBeenCalled()
    })
  }

  it('denies absent profile', async () => {
    mocks.profile.mockResolvedValue(null)
    await expect(requirePrintProfile('invoice', id)).rejects.toThrow('NOT_FOUND')
  })

  for (const [name, render] of [['invoice', InvoicePrint], ['tax worksheet', TaxPrint]] as const) {
    it(`prints ${name} using captured issuer and configured withholding after reversal`, async () => {
      mocks.profile.mockResolvedValue({ role: 'finance', tenantId: id })
      const tenant = { name: 'Workspace', legal_name: 'Current company', registered_address: 'Current address', document_email: null, document_phone: null, bir_tin: 'TEST', pcab_license: null }
      const invoice = {
        id, invoice_number: 'SYNTHETIC-REVERSED', status: 'cancelled', issued_at: new Date('2026-01-01'), reversed_at: new Date('2026-01-02'),
        issuance_journal_entry_id: id, pricing_basis: 'reconciled_v1', withholding_bps: 300,
        issuer_legal_profile: { schema_version: 1, workspace_name: 'Workspace', ...tenant, legal_name: 'Original company' },
        billing_percent_bps: 10000, retention_bps: 1000, subtotal_cents: 10000, retention_cents: 1000,
        vat_cents: 1200, withholding_tax_cents: 300, net_amount_cents: 9900,
        due_date: null, paid_at: null, notes: null, created_at: new Date('2026-01-01'),
        project_name: 'Synthetic project', project_client: 'Synthetic client', project_location: null, project_id: id,
        account_name: 'Synthetic client', account_address: 'Synthetic client address',
      }
      function query(rows: object[]) {
        const chain = { from: vi.fn(), leftJoin: vi.fn(), where: vi.fn().mockResolvedValue(rows) }
        chain.from.mockReturnValue(chain)
        chain.leftJoin.mockReturnValue(chain)
        return chain
      }
      mocks.select.mockReturnValueOnce(query([invoice])).mockReturnValueOnce(query([tenant]))
      const html = renderToStaticMarkup(await render({ params: Promise.resolve({ id }) }))
      expect(html).toContain('Original company')
      expect(html).not.toContain('Current company')
      expect(html).toContain('3%')
      expect(html).not.toContain('2%')
      if (name === 'tax worksheet') {
        // The subtotal and withholding base are both PHP100; retention is PHP10.
        expect(html.match(/₱100\.00/g)?.length).toBeGreaterThanOrEqual(3)
      }
    })
  }
})
