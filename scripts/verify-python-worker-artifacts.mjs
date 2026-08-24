#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const repositoryRoot = resolve(import.meta.dirname, '..')
const pythonBase =
  'python:3.12-alpine3.23@sha256:31a768b01976652c222e318fe5bd6e7c252f056cbf489c88fa256f1bf0af58e3'
const uvImage =
  'ghcr.io/astral-sh/uv:0.12.0@sha256:606e70c71c852d03f611b1e56a195d08648507018a7057fab82c4974c4eae105'
const workerPaths = ['apps/workers/ai', 'apps/workers/dxf-parser']

async function source(path) {
  return readFile(resolve(repositoryRoot, path), 'utf8')
}

for (const workerPath of workerPaths) {
  const [dockerfile, manifest, runtimeLock, developmentLock] = await Promise.all(
    [
      source(`${workerPath}/Dockerfile`),
      source(`${workerPath}/pyproject.toml`),
      source(`${workerPath}/requirements.lock`),
      source(`${workerPath}/requirements-dev.lock`),
    ],
  )

  assert.match(manifest, /requires-python = ">=3\.12,<3\.13"/)
  assert.ok(dockerfile.includes(pythonBase), `${workerPath} base is not pinned`)
  assert.ok(dockerfile.includes(uvImage), `${workerPath} uv is not pinned`)
  assert.ok(dockerfile.includes('COPY pyproject.toml uv.lock requirements.lock ./'))
  assert.ok(dockerfile.includes('uv lock --check'))
  assert.ok(dockerfile.includes('cmp --silent /tmp/requirements.lock requirements.lock'))
  assert.ok(dockerfile.includes('pip install --no-cache-dir --require-hashes'))
  assert.ok(dockerfile.includes('sqlite-libs=3.53.4-r0'))
  assert.ok(dockerfile.includes('USER 10001:10001'))
  assert.match(runtimeLock, /--hash=sha256:[0-9a-f]{64}/)
  assert.doesNotMatch(runtimeLock, /^pytest==/m)
  assert.match(developmentLock, /^pytest==/m)
  assert.match(
    runtimeLock,
    /^#    uv export --frozen --no-dev --no-emit-project --format requirements-txt --output-file requirements\.lock$/m,
  )
}

const [dxfDockerfile, workflow, runbook] = await Promise.all([
  source('apps/workers/dxf-parser/Dockerfile'),
  source('.github/workflows/ci.yml'),
  source('docs/runbooks/python-worker-artifact-update.md'),
])

for (const packagePin of [
  'autoconf=2.72-r1',
  'automake=1.18.1-r0',
  'build-base=0.5-r3',
  'ca-certificates=20260611-r0',
  'curl=8.20.0-r0',
  'libtool=2.5.4-r2',
  'pkgconf=2.5.1-r0',
  'xz=5.8.3-r0',
]) {
  assert.ok(dxfDockerfile.includes(packagePin), `missing DXF package pin ${packagePin}`)
}
assert.match(dxfDockerfile, /LIBREDWG_VERSION=0\.13\.4/)
assert.match(dxfDockerfile, /LIBREDWG_SHA256=[0-9a-f]{64}/)
assert.ok(
  dxfDockerfile.indexOf('sha256sum -c -s') <
    dxfDockerfile.indexOf('tar -xJf'),
  'LibreDWG must be verified before extraction',
)

assert.match(
  workflow,
  /astral-sh\/setup-uv@[0-9a-f]{40} # v9\.0\.0[\s\S]*?version: 0\.12\.0/,
)
assert.equal(
  (workflow.match(/docker\/scout-action@[0-9a-f]{40} # v1\.24\.0/g) ?? [])
    .length,
  2,
)
assert.match(workflow, /command: sbom[\s\S]*?format: spdx/)
assert.match(
  workflow,
  /command: cves[\s\S]*?only-severities: critical,high[\s\S]*?exit-code: true/,
)
assert.doesNotMatch(workflow, /python-workers:[\s\S]*?continue-on-error:/)
assert.match(runbook, /uv `0\.12\.0`/)
assert.match(
  runbook,
  /restore the prior reviewed Dockerfile,[\s\S]*?exact Alpine package pins/,
)

process.stdout.write('python worker artifact contract verification passed\n')
