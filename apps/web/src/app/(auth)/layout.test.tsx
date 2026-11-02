import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import AuthLayout from './layout'

describe('auth brand lockup', () => {
  it('renders ABI OPS for desktop and mobile auth surfaces', () => {
    const legacyProductName = ['Third', 'Code', 'ERP'].join(' ')
    const legacyCompanyName = ['Third', 'Code', 'Solutions', 'Inc.'].join(' ')
    const markup = renderToStaticMarkup(
      <AuthLayout>
        <div>Sign in</div>
      </AuthLayout>
    )

    expect(markup.match(/ABI OPS/g)).toHaveLength(2)
    expect(markup.match(/Independent company installation/g)).toHaveLength(3)
    expect(markup.match(/>AO</g)).toHaveLength(2)
    expect(markup).not.toContain(legacyProductName)
    expect(markup).not.toContain(legacyCompanyName)
  })
})
