import { installationTargets, databaseTargets } from './lib/installation-targets.mjs'

try {
  const targets = installationTargets(process.env)
  databaseTargets(process.env, targets.supabaseRef)
  console.log('PASS explicit installation targets and separate database roles')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
