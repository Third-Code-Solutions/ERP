import assert from 'node:assert/strict'
import test from 'node:test'

import {
  evaluateRlsPolicyCatalog,
  requiredDirectClientDenyTables,
} from './lib/database-repro-policy-contract.mjs'

const tenantPolicies = [
  ['projects', 'projects_tenant_read'],
  ['cortex_conversations', 'cortex_conversations_owner_read'],
]

function evaluate(rows) {
  return evaluateRlsPolicyCatalog(rows, {
    tenantPolicies,
    directClientDenyTables: requiredDirectClientDenyTables,
  })
}

test('accepts tenant policies and the exact explicit deny policies together', () => {
  const result = evaluate([
    {
      tablename: 'projects',
      policyname: 'projects_tenant_read',
      roles: 'authenticated',
      using_expression: '(tenant_id = auth_tenant_id())',
      check_expression: '',
    },
    {
      tablename: 'cortex_conversations',
      policyname: 'cortex_conversations_owner_read',
      roles: 'authenticated',
      using_expression: '(tenant_id = auth_tenant_id() and user_id = auth.uid())',
      check_expression: '',
    },
    ...requiredDirectClientDenyTables.map((tablename) => ({
      tablename,
      policyname: 'deny_direct_client_access',
      roles: 'authenticated,anon',
      using_expression: '(false)',
      check_expression: 'false',
    })),
  ])

  assert.deepEqual(result, {
    ok: true,
    missing: [],
    unexpected: [],
    weak: [],
  })
})

test('rejects a deny policy that has an allow-like role or expression', () => {
  const result = evaluate([
    {
      tablename: 'projects',
      policyname: 'projects_tenant_read',
      roles: 'authenticated',
      using_expression: '(tenant_id = auth_tenant_id())',
      check_expression: '',
    },
    {
      tablename: 'cortex_conversations',
      policyname: 'cortex_conversations_owner_read',
      roles: 'authenticated',
      using_expression: '(tenant_id = auth_tenant_id() and user_id = auth.uid())',
      check_expression: '',
    },
    ...requiredDirectClientDenyTables.map((tablename) => ({
      tablename,
      policyname: 'deny_direct_client_access',
      roles: 'authenticated',
      using_expression: '(true)',
      check_expression: 'false',
    })),
  ])

  assert.equal(result.ok, false)
  assert.deepEqual(
    result.weak,
    requiredDirectClientDenyTables.map(
      (table) => `${table}.deny_direct_client_access`
    )
  )
})

test('rejects an unexpected policy on a direct-client-deny table', () => {
  const rows = [
    {
      tablename: 'projects',
      policyname: 'projects_tenant_read',
      roles: 'authenticated',
      using_expression: '(tenant_id = auth_tenant_id())',
      check_expression: '',
    },
    {
      tablename: 'cortex_conversations',
      policyname: 'cortex_conversations_owner_read',
      roles: 'authenticated',
      using_expression: '(tenant_id = auth_tenant_id() and user_id = auth.uid())',
      check_expression: '',
    },
    ...requiredDirectClientDenyTables.map((tablename) => ({
      tablename,
      policyname: 'deny_direct_client_access',
      roles: 'anon,authenticated',
      using_expression: 'false',
      check_expression: '(false)',
    })),
    {
      tablename: 'notification_outbox',
      policyname: 'notification_outbox_tenant_read',
      roles: 'authenticated',
      using_expression: '(tenant_id = auth_tenant_id())',
      check_expression: '',
    },
  ]

  const result = evaluate(rows)

  assert.equal(result.ok, false)
  assert.deepEqual(result.unexpected, [
    'notification_outbox.notification_outbox_tenant_read',
  ])
})
