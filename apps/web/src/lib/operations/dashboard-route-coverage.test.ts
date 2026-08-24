import { readdirSync } from 'node:fs'
import { resolve, relative, sep } from 'node:path'

import { ERP_ROLES } from '@third-code-erp/shared-types/authorization'
import { describe, expect, it } from 'vitest'

import { canViewPath } from './nav-config'

const dashboardRoot = resolve(process.cwd(), 'src/app/(dashboard)')

function pageFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = resolve(directory, entry.name)
    if (entry.isDirectory()) return pageFiles(filePath)
    return entry.isFile() && entry.name === 'page.tsx' ? [filePath] : []
  })
}

function routeForPage(filePath: string): string {
  const segments = relative(dashboardRoot, filePath)
    .split(sep)
    .slice(0, -1)
    .filter((segment) => !segment.startsWith('('))
    .map((segment) =>
      segment.startsWith('[') && segment.endsWith(']')
        ? 'rbac-route-id'
        : segment,
    )

  return segments.length === 0 ? '/' : `/${segments.join('/')}`
}

describe('dashboard route authorization coverage', () => {
  it('registers every dashboard page in the route authorization policy', () => {
    const pages = pageFiles(dashboardRoot)
    expect(pages).toHaveLength(98)

    const unregistered = pages
      .map(routeForPage)
      .filter(
        (pathname) =>
          !ERP_ROLES.some((role) => canViewPath(role, pathname)),
      )

    expect(unregistered).toEqual([])
  })
})
