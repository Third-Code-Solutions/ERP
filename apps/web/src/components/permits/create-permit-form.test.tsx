import React from 'react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { CreatePermitForm } from './create-permit-form'

vi.mock('@/app/(dashboard)/projects/[id]/permits/actions', () => ({
  createPermit: vi.fn(),
}))

beforeAll(() => {
  vi.stubGlobal('React', React)
})

describe('CreatePermitForm buttons', () => {
  it('renders the Add permit trigger with the shared button class', () => {
    const markup = renderToStaticMarkup(
      <CreatePermitForm
        projectId="22222222-2222-4222-8222-222222222222"
        users={[]}
        permittedTypes={['dole_permit']}
      />
    )

    expect(markup).toContain('class="button-primary"')
    expect(markup).toContain('Add permit')
  })

  it('uses only button classes the stylesheet defines, in both form states', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./create-permit-form.tsx', import.meta.url)),
      'utf8'
    )
    const classNames = [...source.matchAll(/className="([^"]+)"/g)].map(
      (match) => match[1]
    )

    expect(classNames).toEqual([
      'button-primary',
      'button-secondary',
      'button-primary',
    ])
  })
})
