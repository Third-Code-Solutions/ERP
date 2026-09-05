import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PortalLayout, { metadata } from './layout'

describe('shared client portal layout', () => {
  // Vitest uses classic JSX while Next compiles this layout with automatic JSX.
  beforeEach(() => vi.stubGlobal('React', React))
  afterEach(() => vi.unstubAllGlobals())
  it('does not mislabel warranty or project links as a bill of materials', () => {
    const markup = renderToStaticMarkup(<PortalLayout>Project progress</PortalLayout>)
    expect(metadata.title).toBe('Client Portal | ABI OPS')
    expect(metadata.robots).toEqual({ index: false, follow: false })
    expect(markup).toContain('a secure project link')
    expect(markup).not.toContain('Bill of Materials')
    expect(markup).toContain('Project progress')
  })
})
