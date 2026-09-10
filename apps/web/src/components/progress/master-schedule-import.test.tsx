import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/(dashboard)/projects/[id]/progress/actions', () => ({
  importMasterSchedule: vi.fn(),
  previewMasterSchedule: vi.fn(),
}))

import { MasterScheduleImport } from './master-schedule-import'

describe('MasterScheduleImport', () => {
  it('renders a validated preview-first import affordance', () => {
    const markup = renderToStaticMarkup(<MasterScheduleImport projectId="33333333-3333-4333-8333-333333333333" hasExisting />)
    expect(markup).toContain('Choose schedule CSV')
    expect(markup).toContain('name,start_date,finish_date,predecessor_index,planned_pct_curve')
    expect(markup).not.toContain('Replace schedule')
  })
})
