import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const workflowPath = resolve('.github/workflows/ci-linux-runner-smoke.yml')
const hostScriptPath = resolve('scripts/ci/invoke-isolated-linux-runner-host.ps1')

test('the Linux smoke workflow is manual, ERP-only, group-restricted, and non-secret', async () => {
  const workflow = await readFile(workflowPath, 'utf8')

  assert.match(workflow, /^on:\n  workflow_dispatch:\s*$/m)
  assert.doesNotMatch(workflow, /pull_request|pull_request_target|workflow_run|push:/)
  assert.match(workflow, /github\.repository == 'Third-Code-Solutions\/ERP'/)
  assert.match(workflow, /github\.repository_owner == 'Third-Code-Solutions'/)
  assert.match(workflow, /github\.ref == 'refs\/heads\/codex\/release-candidate-trial-port'/)
  assert.match(workflow, /github\.actor == 'kurtgav'/)
  assert.match(workflow, /github\.triggering_actor == 'kurtgav'/)
  assert.match(workflow, /group: erp-ci-isolated/)
  assert.match(workflow, /labels: \[self-hosted, Linux, X64, third-code-erp-ci-linux\]/)
  assert.doesNotMatch(workflow, /Default|Windows|third-code-erp-ci\]/)
  assert.doesNotMatch(workflow, /secrets\.|GITHUB_TOKEN|actions\/checkout|gh auth|supabase|snyk/i)
})

test('the Linux smoke workflow dynamically verifies Docker metadata, guest listeners, and exact cleanup', async () => {
  const workflow = await readFile(workflowPath, 'utf8')

  assert.match(workflow, /--publish 127\.0\.0\.1::80/)
  assert.match(workflow, /docker inspect --format '\{\{range \$containerPort, \$bindings := \.NetworkSettings\.Ports\}\}/)
  assert.match(workflow, /case "\$host_ip" in\n\s+127\.0\.0\.1\|::1/)
  assert.match(workflow, /ss --listening --tcp --numeric --no-header/)
  assert.match(workflow, /docker rm --force "\$container_name"/)
  assert.match(workflow, /docker network rm "\$network_name"/)
  assert.match(workflow, /trap cleanup EXIT/)
  assert.doesNotMatch(workflow, /docker (system |volume |network )?prune/)
})

test('the elevated host helper is exact-target-only and fails rather than sharing a WinNAT or deleting broad resources', async () => {
  const hostScript = await readFile(hostScriptPath, 'utf8')

  assert.match(hostScript, /ValidateSet\('Preflight', 'Rollback'\)/)
  assert.match(hostScript, /\$RunRoot = 'D:\\third-code-erp-isolated-runner'/)
  assert.match(hostScript, /Assert-Administrator/)
  assert.match(hostScript, /WinNAT already has a configured NAT; this stage refuses to alter or share it/)
  assert.match(hostScript, /Remove-NetNat -Name \$targets\.NatName -Confirm:\$false/)
  assert.match(hostScript, /Remove-VM -Name \$targets\.VmName -Force/)
  assert.match(hostScript, /Remove-VMSwitch -Name \$targets\.SwitchName -Force/)
  assert.doesNotMatch(hostScript, /Get-NetNat\s*\|\s*Remove-NetNat/)
  assert.doesNotMatch(hostScript, /Get-NetNat\s*\|\s*Remove-NetNat|docker (system )?prune|wsl --unregister/i)
})
