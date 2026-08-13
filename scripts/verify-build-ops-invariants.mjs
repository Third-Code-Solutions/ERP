#!/usr/bin/env node

import { main } from './lib/build-ops-invariants.mjs'

main().then((passed) => {
  process.exit(passed ? 0 : 1)
}).catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
