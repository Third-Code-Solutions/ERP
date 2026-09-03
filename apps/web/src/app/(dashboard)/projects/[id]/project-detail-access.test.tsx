import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AppRole } from '@third-code-erp/auth'
import { describe, expect, it, vi } from 'vitest'

import { ProjectTabs } from '@/components/projects/project-tabs'
import { BomBuilder } from '@/components/bom/bom-builder'

import {
  getProjectBomControls,
  getProjectDetailAccess,
  type ProjectDetailAccess,
} from './project-detail-access'

vi.mock('next/navigation', () => ({
  usePathname: () => '/projects/project-1',
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/app/(dashboard)/projects/[id]/bom/actions', () => ({
  addBomLineItem: vi.fn(),
  approveBom: vi.fn(),
  createBom: vi.fn(),
  deleteBomLineItem: vi.fn(),
  fetchProjectForecastTcv: vi.fn().mockResolvedValue({ tcvCents: null }),
  setBomLineLocation: vi.fn(),
}))

vi.mock('@/app/(dashboard)/procurement/actions', () => ({
  createInvoice: vi.fn(),
  createPoFromBom: vi.fn(),
}))

vi.mock('@/components/bom/supplier-switcher-panel', () => ({
  SupplierSwitcherPanel: () => null,
}))

vi.mock('@/components/bom/dupa-editor', () => ({
  DupaEditor: () => null,
}))

const EXPECTED_ACCESS = {
  owner: {
    project: true,
    opportunity: true,
    bom: true,
    purchaseOrders: true,
    cost: true,
    billing: true,
    delivery: true,
    audit: true,
    access: true,
  },
  estimator: {
    project: true,
    opportunity: true,
    bom: true,
    purchaseOrders: true,
    cost: true,
    billing: false,
    delivery: false,
    audit: false,
    access: false,
  },
  pm: {
    project: true,
    opportunity: true,
    bom: false,
    purchaseOrders: true,
    cost: true,
    billing: false,
    delivery: true,
    audit: true,
    access: false,
  },
  admin: {
    project: true,
    opportunity: true,
    bom: true,
    purchaseOrders: true,
    cost: true,
    billing: true,
    delivery: true,
    audit: true,
    access: true,
  },
  sales: {
    project: true,
    opportunity: true,
    bom: false,
    purchaseOrders: false,
    cost: false,
    billing: false,
    delivery: false,
    audit: false,
    access: false,
  },
  commercial: {
    project: true,
    opportunity: true,
    bom: true,
    purchaseOrders: true,
    cost: true,
    billing: false,
    delivery: false,
    audit: false,
    access: false,
  },
  design: {
    project: true,
    opportunity: true,
    bom: false,
    purchaseOrders: false,
    cost: false,
    billing: false,
    delivery: false,
    audit: false,
    access: false,
  },
  sd_pm_pe: {
    project: true,
    opportunity: true,
    bom: false,
    purchaseOrders: true,
    cost: true,
    billing: false,
    delivery: true,
    audit: false,
    access: false,
  },
  finance: {
    project: true,
    opportunity: true,
    bom: false,
    purchaseOrders: false,
    cost: true,
    billing: true,
    delivery: false,
    audit: true,
    access: false,
  },
  procurement: {
    project: true,
    opportunity: true,
    bom: false,
    purchaseOrders: true,
    cost: true,
    billing: false,
    delivery: true,
    audit: false,
    access: false,
  },
  safety: {
    project: true,
    opportunity: true,
    bom: false,
    purchaseOrders: false,
    cost: false,
    billing: false,
    delivery: false,
    audit: false,
    access: false,
  },
  cx: {
    project: true,
    opportunity: true,
    bom: false,
    purchaseOrders: false,
    cost: false,
    billing: false,
    delivery: false,
    audit: false,
    access: false,
  },
  viewer: {
    project: true,
    opportunity: true,
    bom: true,
    purchaseOrders: true,
    cost: true,
    billing: true,
    delivery: true,
    audit: true,
    access: true,
  },
} satisfies Record<AppRole, ProjectDetailAccess>

const RESTRICTED_TABS = {
  bom: '/projects/project-1/bom',
  cost: '/projects/project-1/cost',
  billing: '/projects/project-1/billing',
  audit: '/projects/project-1/audit',
  access: '/projects/project-1/access',
} as const

describe('project detail authorization', () => {
  for (const [role, expected] of Object.entries(EXPECTED_ACCESS) as Array<
    [AppRole, ProjectDetailAccess]
  >) {
    it(`uses the central domain policy for ${role}`, () => {
      const actual = getProjectDetailAccess(role)
      expect(actual).toEqual(expected)

      const markup = renderToStaticMarkup(
        <ProjectTabs projectId="project-1" access={actual} />,
      )

      for (const [section, href] of Object.entries(RESTRICTED_TABS) as Array<
        [keyof typeof RESTRICTED_TABS, string]
      >) {
        expect(markup.includes(`href="${href}"`)).toBe(expected[section])
      }
    })
  }
})

describe('project BOM mutation controls', () => {
  it('keeps Viewer read-only across edit, review, CAD import, and award controls', () => {
    expect(getProjectBomControls('viewer')).toEqual({
      edit: false,
      review: false,
      importCad: false,
      award: false,
    })
  })

  it.each(['draft', 'approved'] as const)(
    'does not render write controls for a read-only %s BOM',
    (status) => {
      const markup = renderToStaticMarkup(
        <BomBuilder
          projectId="project-1"
          readOnly
          bom={{
            id: 'bom-1',
            version: 1,
            label: null,
            status,
            total_cost_cents: 0,
            tcv_cents: 0,
            gp_cents: 0,
            gp_margin_bps: 0,
            lineItems: [],
          }}
        />,
      )

      expect(markup).not.toContain('+ Add Line')
      expect(markup).not.toContain('Submit for Client Approval')
      expect(markup).not.toContain('Generate PO')
      expect(markup).not.toContain('Create Invoice')
    },
  )
})
