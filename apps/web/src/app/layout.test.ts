import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  fileURLToPath(new URL('./layout.tsx', import.meta.url)),
  'utf8'
)

describe('root telemetry adapters', () => {
  it('mounts one production-only Vercel Speed Insights adapter', () => {
    expect(source).toContain(
      "import { SpeedInsights } from '@vercel/speed-insights/next'"
    )
    expect(source.match(/<SpeedInsights\s*\/>/g)).toHaveLength(1)
    expect(source).toContain(
      "{process.env.VERCEL === '1' ? <SpeedInsights /> : null}"
    )
  })

  it('keeps analytics production-only as well', () => {
    expect(source).toContain(
      "{process.env.VERCEL === '1' ? <Analytics /> : null}"
    )
  })
})
