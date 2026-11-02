import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()
const files = {
  prd: join(root, 'docs', 'PRD.md'),
  prompts: join(root, 'docs', 'PROMPTS.md'),
  agreement: join(root, 'docs', 'BUILD_OPS_AGENTS.md'),
  matrix: join(root, 'docs', 'architecture', 'CAPABILITY_MATRIX.md'),
  agents: join(root, 'AGENTS.md'),
  claude: join(root, 'CLAUDE.md'),
}

const contents = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, file]) => [key, await readFile(file, 'utf8')])
  )
)

const prdVersion = /^# BUILD OPS PRD v(\d+\.\d+)\s*$/m.exec(contents.prd)?.[1]
const promptVersion = /^# BUILD OPS Prompt Pack v(\d+\.\d+)\s*$/m.exec(contents.prompts)?.[1]

const assertions = [
  ['PRD has a versioned authority heading', Boolean(prdVersion)],
  ['PRD names itself implementation authority', contents.prd.includes('docs/PRD.md (this file) Implementation authority')],
  ['PRD document-control version matches heading', Boolean(prdVersion) && contents.prd.includes(`docs/PRD.md ${prdVersion}`)],
  ['PRD distinguishes machine and external evidence', contents.prd.includes('Every machine-verifiable acceptance criterion ships automated coverage.') && !contents.prd.includes('Every acceptance criterion ships as an automated test, not a manual check.')],
  ['Prompt pack version matches PRD', Boolean(prdVersion) && promptVersion === prdVersion],
  ['Prompt pack points to PRD authority', Boolean(prdVersion) && contents.prompts.includes(`Execution authority is \`docs/PRD.md\` v${prdVersion}`)],
  ['Prompt pack companion version matches PRD', Boolean(prdVersion) && contents.prompts.includes(`Companion to docs/PRD.md v${prdVersion}`)],
  ['Prompt pack distinguishes machine and external evidence', contents.prompts.includes('Every machine-verifiable acceptance criterion ships automated coverage.') && !contents.prompts.includes('Every acceptance criterion ships as an automated test, not a manual check.')],
  ['Working agreement is v1.1', contents.agreement.includes('# BUILD OPS Working Agreement v1.1')],
  ['Working agreement distinguishes machine and human evidence', contents.agreement.includes('Every machine-verifiable acceptance criterion ships automated coverage.')],
  ['Root AGENTS points to current PRD', contents.agents.includes('STEP 1 → Read /docs/PRD.md in full') && !contents.agents.includes('Third Code ERP_PRD_v1.md')],
  ['Root AGENTS removes conversational repository gate', contents.agents.includes('do not require a conversational go-ahead')],
  ['Legacy CLAUDE identifies current authority', contents.claude.includes('Current execution authority is') && contents.claude.includes('docs/PRD.md')],
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
