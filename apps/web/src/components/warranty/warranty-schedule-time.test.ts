import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  fromManilaDateTimeInput,
  toManilaDateTimeInput,
} from './warranty-schedule-time'

describe('warranty schedule Manila conversion', () => {
  it('formats persisted UTC instants as Manila wall-clock values across a day boundary', () => {
    expect(toManilaDateTimeInput('2026-09-07T16:30:00.000Z')).toBe('2026-09-08T00:30')
    expect(toManilaDateTimeInput('2026-09-08T02:00:00.000Z')).toBe('2026-09-08T10:00')
  })

  it('submits an explicit Manila timestamp and round-trips the same instant', () => {
    const submitted = fromManilaDateTimeInput('2026-09-08T10:00')

    expect(submitted).toBe('2026-09-08T10:00:00+08:00')
    expect(new Date(submitted).toISOString()).toBe('2026-09-08T02:00:00.000Z')
    expect(toManilaDateTimeInput(new Date(submitted).toISOString())).toBe('2026-09-08T10:00')
  })

  it('associates the Manila schedule and service-report labels with unique controls', () => {
    const source = readFileSync(new URL('./ticket-status-actions.tsx', import.meta.url), 'utf8')

    expect(source).toContain('htmlFor={scheduleDateId}')
    expect(source).toContain('id={scheduleDateId}')
    expect(source).toContain('Proposed date &amp; time (Manila)')
    expect(source).toContain('htmlFor={serviceReportId}')
    expect(source).toContain('id={serviceReportId}')
    expect(source).toContain('setScheduleDate(toManilaDateTimeInput(scheduledAt))')
  })
})
