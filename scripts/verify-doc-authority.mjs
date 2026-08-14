import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()
const files = {
  prd: join(root, 'docs', 'PRD.md'),
  prompts: join(root, 'docs', 'PROMPTS.md'),
  agreement: join(root, 'docs', 'BUILD_OPS_AGENTS.md'),
  matrix: join(root, 'docs', 'architecture', 'CAPABILITY_MATRIX.md'),
}

const contents = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, file]) => [key, await readFile(file, 'utf8')])
  )
)

const assertions = [
  ['PRD is v1.4', contents.prd.includes('# BUILD OPS PRD v1.4')],
  ['PRD names itself implementation authority', contents.prd.includes('docs/PRD.md (this file) Implementation authority')],
  ['PRD document-control version is v1.4', contents.prd.includes('docs/PRD.md 1.4')],
  ['PRD distinguishes machine and external evidence', contents.prd.includes('Every machine-verifiable acceptance criterion ships automated coverage.') && !contents.prd.includes('Every acceptance criterion ships as an automated test, not a manual check.')],
  ['Prompt pack is v1.4', contents.prompts.includes('# BUILD OPS Prompt Pack v1.4')],
  ['Prompt pack points to PRD authority', contents.prompts.includes('Execution authority is `docs/PRD.md` v1.4')],
  ['Prompt pack companion version is v1.4', contents.prompts.includes('Companion to docs/PRD.md v1.4')],
  ['Prompt pack distinguishes machine and external evidence', contents.prompts.includes('Every machine-verifiable acceptance criterion ships automated coverage.') && !contents.prompts.includes('Every acceptance criterion ships as an automated test, not a manual check.')],
  ['Working agreement is v1.1', contents.agreement.includes('# BUILD OPS Working Agreement v1.1')],
  ['Working agreement distinguishes machine and human evidence', contents.agreement.includes('Every machine-verifiable acceptance criterion ships automated coverage.')],
  ['Capability matrix has current release section', contents.matrix.includes('## M3.280 Current live release alignment (2026-08-14)')],
  ['Capability matrix records current Vercel deployment', contents.matrix.includes('dpl_3h5R66ZBfZwjKYxYbByVB3ptk7fx')],
  ['Capability matrix records authenticated parity boundary', contents.matrix.includes('Authenticated hosted parity') && contents.matrix.includes('BLOCKED')],
]

const failures = assertions.filter(([, passed]) => !passed).map(([name]) => name)
if (failures.length > 0) {
  console.error(`FAIL doc authority: ${failures.join('; ')}`)
  process.exitCode = 1
} else {
  console.log(`PASS doc authority: ${assertions.length}/${assertions.length}`)
}
