import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, it } from 'node:test'

const execFileAsync = promisify(execFile)

describe('WO-08 source gates', () => {
  it('passes the additive migration gate', async () => {
    await execFileAsync(process.execPath, ['scripts/verify-wo-08-migration.mjs'], { cwd: process.cwd() })
  })

  it('passes the generic importer and I-10 contract gate', async () => {
    await execFileAsync(process.execPath, ['scripts/verify-wo-08-import-contract.mjs'], { cwd: process.cwd() })
  })
})
