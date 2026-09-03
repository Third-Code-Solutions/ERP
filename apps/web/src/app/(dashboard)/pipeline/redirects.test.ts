import { beforeEach, describe, expect, it, vi } from 'vitest'

const { permanentRedirect } = vi.hoisted(() => ({ permanentRedirect: vi.fn() }))
vi.mock('next/navigation', () => ({ permanentRedirect }))
import BoardRedirect from './board/page'
import ConversionRedirect from './conversion/page'

describe('legacy pipeline bookmarks', () => {
  beforeEach(() => vi.clearAllMocks())
  it('permanently redirects board to the canonical Kanban', () => {
    BoardRedirect()
    expect(permanentRedirect).toHaveBeenCalledWith('/pipeline')
  })
  it('permanently redirects conversion to the canonical list', () => {
    ConversionRedirect()
    expect(permanentRedirect).toHaveBeenCalledWith('/pipeline/list')
  })
})
