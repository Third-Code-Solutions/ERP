import React from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectScheduleDependencyOption } from '@third-code-erp/shared-types'

const mocks = vi.hoisted(() => ({ loadProjectScheduleDependencies: vi.fn() }))
vi.mock('./dependency-actions', () => ({ loadProjectScheduleDependencies: mocks.loadProjectScheduleDependencies }))

import {
  isScheduleDependencyCompatible,
  mergeScheduleDependencyOptions,
  ScheduleDependencySelect,
} from './schedule-dependency-select'

const projectId = '33333333-3333-4333-8333-333333333333'
const selectedId = '44444444-4444-4444-8444-444444444444'
const option = (id: string, level: ProjectScheduleDependencyOption['level']): ProjectScheduleDependencyOption => ({
  id,
  projectId,
  level,
  taskCode: `${level.toUpperCase()}-001`,
  name: `${level.toUpperCase()} task`,
})

describe('schedule dependency selector', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('React', React) })
  afterEach(() => vi.unstubAllGlobals())
  it('keeps parent hierarchy and predecessor same-level rules explicit', () => {
    expect(isScheduleDependencyCompatible('parent', 'l3', 'l1')).toBe(true)
    expect(isScheduleDependencyCompatible('parent', 'l3', 'l2')).toBe(true)
    expect(isScheduleDependencyCompatible('parent', 'l3', 'l3')).toBe(false)
    expect(isScheduleDependencyCompatible('predecessor', 'l3', 'l3')).toBe(true)
    expect(isScheduleDependencyCompatible('predecessor', 'l3', 'l2')).toBe(false)
  })

  it('reserves the selected task when pagination removes it from the current page', () => {
    const selected = option(selectedId, 'l2')
    const merged = mergeScheduleDependencyOptions([option('55555555-5555-4555-8555-555555555555', 'l1')], selected, selectedId)

    expect(merged).toEqual([expect.objectContaining({ id: '55555555-5555-4555-8555-555555555555' }), selected])
    expect(mergeScheduleDependencyOptions([selected], selected, selectedId)).toHaveLength(1)
  })

  it('renders labelled native controls and a lazy-loading state without UUID entry copy', () => {
    const markup = renderToStaticMarkup(
      <ScheduleDependencySelect
        projectId={projectId}
        kind="predecessor"
        level="l2"
        name="predecessorTaskId"
        value={selectedId}
        onChange={vi.fn()}
        enabled={false}
      />,
    )

    expect(markup).toContain('>Predecessor task</label>')
    expect(markup).toContain('name="predecessorTaskId"')
    expect(markup).toContain('type="search"')
    expect(markup).toContain('Search predecessor tasks')
    expect(markup).toContain('Open the task form to load predecessor tasks.')
    expect(markup).toContain('Current predecessor task (details loading)')
    expect(markup).not.toContain('Optional UUID')
  })

  it('keeps dependency loading gated, race-safe, and search Enter out of the parent form', () => {
    const source = readFileSync(new URL('./schedule-dependency-select.tsx', import.meta.url), 'utf8')

    expect(source).toContain('if (!enabled) return')
    expect(source).toContain('const sequence = ++requestSequence.current')
    expect(source).toContain('sequence !== requestSequence.current')
    expect(source).toContain("event.key === 'Enter'")
    expect(source).toContain('event.preventDefault()')
    expect(source).toContain('event.stopPropagation()')
    expect(source).toContain('Retry loading {pluralTitle}')
    expect(mocks.loadProjectScheduleDependencies).not.toHaveBeenCalled()
  })

  it('keeps create reset and edit owner/version safety in the register source', () => {
    const source = readFileSync(new URL('./project-schedule-register.tsx', import.meta.url), 'utf8')

    expect(source).toContain('setClientRequestId(globalThis.crypto.randomUUID())')
    expect(source).toContain('if (!state.ok || !state.success) return')
    expect(source).toContain('name="ownerId" value={ownerId ?? \'\'}')
    expect(source).toContain('name="expectedVersion" value={draftVersion}')
    expect(source).not.toContain('Parent task ID')
    expect(source).not.toContain('Predecessor task ID')
    expect(source).toContain('setDraftDirty(false)')
  })
})
