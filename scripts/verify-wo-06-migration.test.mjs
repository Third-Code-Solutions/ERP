import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

test('WO-06 DUPA migration passes the static safety gate', () => {
  execFileSync(
    process.execPath,
    [join(process.cwd(), 'scripts', 'verify-wo-06-migration.mjs')],
    { cwd: process.cwd(), stdio: 'pipe' },
  )
})
