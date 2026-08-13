import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

test('M-06 process/SLA migration passes the static safety gate', () => {
  execFileSync(
    process.execPath,
    [join(process.cwd(), 'scripts', 'verify-process-sla-migration.mjs')],
    { cwd: process.cwd(), stdio: 'pipe' }
  )
})
