import { manilaCalendarDate } from '@/lib/operations/cadence-engine'

export function pipelineClosingDate(value: Date | null): string | null {
  return value ? manilaCalendarDate(value).toISOString().slice(0, 10) : null
}
