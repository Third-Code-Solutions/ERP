import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/app/(dashboard)/projects/[id]/turnover/actions', () => ({
  attachTurnoverDocument: vi.fn(),
  markTurnoverCompiled: vi.fn(),
}))

import { MarkCompiledButton, TurnoverSlotPicker } from './turnover-controls'

const OPTIONS = [
  { id: 'doc-1', file_name: 'as-built.pdf' },
  { id: 'doc-2', file_name: 'keys.pdf' },
]

describe('TurnoverSlotPicker', () => {
  it('labels the select by slot and offers Attach for an empty slot', () => {
    const html = renderToStaticMarkup(
      <TurnoverSlotPicker
        projectId="p-1"
        slot="as_built"
        slotLabel="As-built drawings"
        currentDocId={null}
        options={OPTIONS}
      />
    )

    expect(html).toContain('aria-label="Document for As-built drawings"')
    expect(html).toContain('as-built.pdf')
    expect(html).toContain('Attach')
    expect(html).not.toContain('Replace')
  })

  it('offers Replace and preselects the current document', () => {
    const html = renderToStaticMarkup(
      <TurnoverSlotPicker
        projectId="p-1"
        slot="keys_log"
        slotLabel="Keys log"
        currentDocId="doc-2"
        options={OPTIONS}
      />
    )

    expect(html).toContain('Replace')
    expect(html).toMatch(/<option value="doc-2" selected/)
  })

  it('says so when the project has no documents', () => {
    const html = renderToStaticMarkup(
      <TurnoverSlotPicker
        projectId="p-1"
        slot="keys_log"
        slotLabel="Keys log"
        currentDocId={null}
        options={[]}
      />
    )

    expect(html).toContain('No docs yet')
    expect(html).not.toContain('<select')
  })
})

describe('MarkCompiledButton', () => {
  it('stays disabled until every slot is attached', () => {
    const blocked = renderToStaticMarkup(<MarkCompiledButton projectId="p-1" allAttached={false} />)
    const ready = renderToStaticMarkup(<MarkCompiledButton projectId="p-1" allAttached />)

    expect(blocked).toContain('disabled')
    expect(blocked).toContain('Attach all four documents first')
    expect(ready).toContain('Mark as compiled')
    expect(ready).not.toContain('disabled')
  })
})
