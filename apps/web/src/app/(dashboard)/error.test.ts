import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  fileURLToPath(new URL('./error.tsx', import.meta.url)),
  'utf8'
)

describe('dashboard route error boundary', () => {
  it('shows safe recovery actions and only exposes the digest reference', () => {
    expect(source).toContain('Workspace paused before anything changed.')
    expect(source).toContain('onClick={reset}')
    expect(source).toContain('href="/dashboard"')
    expect(source).toContain('error.digest')
    expect(source).not.toContain('error.message')
  })
})
