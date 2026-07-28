#!/usr/bin/env node
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runPinnedReleaseTool } from './lib/run-pinned-release-tool.mjs'

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

await runPinnedReleaseTool({
  name: 'gitleaks',
  repository: 'gitleaks/gitleaks',
  version: '8.30.1',
  assets: {
    linux: {
      filename: 'gitleaks_8.30.1_linux_x64.tar.gz',
      sha256: '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb',
    },
    win32: {
      filename: 'gitleaks_8.30.1_windows_x64.zip',
      sha256: 'd29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e',
    },
  },
  executable: 'gitleaks',
  args: [
    'detect',
    '--source',
    repositoryRoot,
    '--no-banner',
    '--redact',
    '--verbose',
  ],
})
