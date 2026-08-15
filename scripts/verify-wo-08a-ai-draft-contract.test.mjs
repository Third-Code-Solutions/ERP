import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, it } from 'node:test'

const execFileAsync = promisify(execFile)

describe('WO-08A source gate', () => {
  it('passes the retained AI/CAD draft boundary', async () => {
    await execFileAsync(process.execPath, ['scripts/verify-wo-08a-ai-draft-contract.mjs'], { cwd: process.cwd() })
  })
})
