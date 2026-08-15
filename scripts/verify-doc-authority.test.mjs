import { execFileSync } from 'node:child_process'
import test from 'node:test'

test('authority documents agree on version, hierarchy and evidence boundary', () => {
  const output = execFileSync(process.execPath, ['scripts/verify-doc-authority.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })

  if (!output.includes('PASS doc authority:')) {
    throw new Error(output)
  }
})
