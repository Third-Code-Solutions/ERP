import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

test('WO-07 BOM view contract passes the static safety gate', () => {
  execFileSync(
    process.execPath,
    [join(process.cwd(), 'scripts', 'verify-wo-07-ui-contract.mjs')],
    { cwd: process.cwd(), stdio: 'pipe' },
  )
})
