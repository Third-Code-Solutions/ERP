#!/usr/bin/env node
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runPinnedReleaseTool } from './lib/run-pinned-release-tool.mjs'

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const workflowDirectory = join(repositoryRoot, '.github', 'workflows')
const workflowPaths =
  process.argv.length > 2
    ? process.argv.slice(2)
    : readdirSync(workflowDirectory)
        .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
        .sort()
        .map((name) => join(workflowDirectory, name))

await runPinnedReleaseTool({
  name: 'actionlint',
  repository: 'rhysd/actionlint',
  version: '1.7.12',
  assets: {
    linux: {
      filename: 'actionlint_1.7.12_linux_amd64.tar.gz',
      sha256: '8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8',
    },
    win32: {
      filename: 'actionlint_1.7.12_windows_amd64.zip',
      sha256: '6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9',
    },
  },
  executable: 'actionlint',
  args: ['-color', ...workflowPaths],
})
