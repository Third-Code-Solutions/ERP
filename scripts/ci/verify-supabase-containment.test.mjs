import assert from 'node:assert/strict'
import test from 'node:test'
import { validateSupabaseContainment } from './lib/supabase-containment.mjs'

function validEvidence() {
  return {
    network: { id: 'network-id', name: 'third-code-erp-ci-101-1' },
    containers: [
      {
        id: 'kong-id',
        name: 'supabase_kong_erp-ci-101-1',
        image: 'supabase/kong:latest',
        networks: [{ id: 'network-id', name: 'third-code-erp-ci-101-1' }],
      },
      {
        id: 'db-id',
        name: 'supabase_db_erp-ci-101-1',
        image: 'supabase/postgres:latest',
        networks: [{ id: 'network-id', name: 'third-code-erp-ci-101-1' }],
      },
    ],
    mappings: [
      { containerId: 'kong-id', containerPort: '8000/tcp', hostIp: '127.0.0.1', hostPort: 54321 },
      { containerId: 'kong-id', containerPort: '8000/tcp', hostIp: '::1', hostPort: 54321 },
      { containerId: 'db-id', containerPort: '5432/tcp', hostIp: '127.0.0.1', hostPort: 54322 },
    ],
    listeners: [
      { protocol: 'TCP', state: 'Listen', hostPort: 54321, localAddress: '127.0.0.1' },
      { protocol: 'TCP', state: 'Listen', hostPort: 54321, localAddress: '::1' },
      { protocol: 'TCP', state: 'Listen', hostPort: 54322, localAddress: '127.0.0.1' },
    ],
    requiredHostPorts: [54321, 54322],
  }
}

test('accepts dynamically discovered loopback-only Docker and host evidence', () => {
  assert.deepEqual(validateSupabaseContainment(validEvidence()), {
    bindingCount: 3,
    containerCount: 2,
    hostPortCount: 2,
  })
})

test('rejects wildcard Docker metadata before runtime values can be read', () => {
  const evidence = validEvidence()
  evidence.mappings[0].hostIp = '0.0.0.0'

  assert.throws(
    () => validateSupabaseContainment(evidence),
    /published host binding 0\.0\.0\.0 is not loopback-only/,
  )
})

test('rejects a wildcard Windows listener even when Docker metadata is loopback', () => {
  const evidence = validEvidence()
  evidence.listeners[0].localAddress = '0.0.0.0'

  assert.throws(
    () => validateSupabaseContainment(evidence),
    /host listener 0\.0\.0\.0 is not loopback-only/,
  )
})

test('rejects missing listener evidence for a dynamically discovered mapping', () => {
  const evidence = validEvidence()
  evidence.listeners = evidence.listeners.filter((listener) => listener.hostPort !== 54322)

  assert.throws(
    () => validateSupabaseContainment(evidence),
    /published host port 54322 has no TCP listener evidence/,
  )
})

test('rejects an unbound configured API or database port', () => {
  const evidence = validEvidence()
  evidence.requiredHostPorts = [54321, 54322, 54330]

  assert.throws(
    () => validateSupabaseContainment(evidence),
    /required API or database host port 54330 is not published/,
  )
})
