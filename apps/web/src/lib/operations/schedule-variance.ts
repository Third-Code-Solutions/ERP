export interface ScheduleVariance {
  label: string
  tone: 'success' | 'warning' | 'danger'
}

/**
 * Earned-schedule variance from weekly cumulative % curves (same week index).
 * The plan "earned" week is the last week whose planned % is at or below the
 * latest actual %, so flat stretches (e.g. 0% mobilization weeks) do not read
 * as delay. Null when either curve is empty.
 */
export function computeScheduleVariance(planned: number[], actual: number[]): ScheduleVariance | null {
  if (planned.length === 0 || actual.length === 0) return null
  const currentActual = actual[actual.length - 1] ?? 0
  const currentWeekIndex = actual.length - 1
  let earnedWeekIndex = -1
  planned.forEach((value, index) => {
    if (value <= currentActual) earnedWeekIndex = index
  })
  const days = (earnedWeekIndex - currentWeekIndex) * 7
  if (days === 0) return { label: 'On schedule', tone: 'success' }
  if (days > 0) return { label: `${days} days ahead`, tone: 'success' }
  return { label: `${Math.abs(days)} days behind`, tone: 'danger' }
}
