import { beforeEach, describe, expect, it, vi } from 'vitest'

const { permanentRedirect } = vi.hoisted(() => ({ permanentRedirect: vi.fn() }))
vi.mock('next/navigation', () => ({ permanentRedirect }))
import BoardRedirect from './board/page'
import ConversionRedirect from './conversion/page'
import config from '../../../../next.config'

describe('legacy pipeline bookmarks', () => {
  beforeEach(() => vi.clearAllMocks())
  it('registers permanent redirects before page streaming can discard bookmark queries', async () => {
    expect(await config.redirects?.()).toEqual([
      { source: '/pipeline/board', destination: '/pipeline', permanent: true },
      { source: '/pipeline/conversion', destination: '/pipeline/list', permanent: true },
    ])
  })
  it('permanently redirects board to the canonical Kanban', () => {
    BoardRedirect()
    expect(permanentRedirect).toHaveBeenCalledWith('/pipeline')
  })
  it('permanently redirects conversion to the canonical list', () => {
    ConversionRedirect()
    expect(permanentRedirect).toHaveBeenCalledWith('/pipeline/list')
  })
})
