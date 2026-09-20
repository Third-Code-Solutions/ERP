import { describe, expect, it } from 'vitest'
import { buildBillingMilestoneNavigation, parseBillingMilestonePage } from './billing-milestone-navigation'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'

describe('billing milestone URL navigation', () => {
  it.each([[undefined, 1], ['1', 1], ['2', 2], ['100000', 100000]])('parses %s as page %s', (input, expected) => {
    expect(parseBillingMilestonePage(input)).toBe(expected)
  })
  it.each(['', '0', '-1', '1.5', '1e2', '01', ' 2 ', '100001', ['1', '2'], null, 2].map(input => ({ input })))('rejects malformed page %j without silently loading page one', ({ input }) => {
    expect(parseBillingMilestonePage(input)).toBeNull()
  })
  it('preserves unrelated repeated filters without mutating the caller', () => {
    const search = { milestonePage: '2', filter: ['open', 'overdue'], query: 'A&B <test>', omitted: undefined }
    const navigation = buildBillingMilestoneNavigation(PROJECT_ID, search, { page: 2, totalPages: 3 })
    const previous = new URL(navigation.previousHref!, 'https://erp.example.test')
    const next = new URL(navigation.nextHref!, 'https://erp.example.test')
    expect(previous.pathname).toBe(`/projects/${PROJECT_ID}/billing`)
    expect(previous.searchParams.has('milestonePage')).toBe(false)
    expect(next.searchParams.get('milestonePage')).toBe('3')
    expect(next.searchParams.getAll('filter')).toEqual(['open', 'overdue'])
    expect(next.searchParams.get('query')).toBe('A&B <test>')
    expect(next.searchParams.has('omitted')).toBe(false)
    expect(next.hash).toBe('#project-billing-milestones-heading')
    expect(search.milestonePage).toBe('2')
    expect(navigation.firstHref).toBe(navigation.previousHref)
  })
  it('disables boundaries and provides first-page recovery for out-of-range pages', () => {
    expect(buildBillingMilestoneNavigation(PROJECT_ID, {}, { page: 1, totalPages: 1 })).toMatchObject({ previousHref: null, nextHref: null })
    expect(buildBillingMilestoneNavigation(PROJECT_ID, {}, { page: 3, totalPages: 3 }).nextHref).toBeNull()
    const empty = buildBillingMilestoneNavigation(PROJECT_ID, { milestonePage: '9' }, { page: 9, totalPages: 3 })
    expect(empty).toMatchObject({ previousHref: null, nextHref: null })
    expect(empty.firstHref).toBe(`/projects/${PROJECT_ID}/billing#project-billing-milestones-heading`)
  })
})
