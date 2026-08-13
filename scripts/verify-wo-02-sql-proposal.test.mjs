import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

test('WO-02 SQL proposal passes the static migration gate', () => {
  execFileSync(process.execPath, [join(process.cwd(), 'scripts', 'verify-wo-02-sql-proposal.mjs')], {
    cwd: process.cwd(),
    stdio: 'pipe',
  })
})
