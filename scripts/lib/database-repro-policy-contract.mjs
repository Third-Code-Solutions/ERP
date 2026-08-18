export const requiredDirectClientDenyTables = [
  'financial_sequences',
  'notification_outbox',
  'notification_deliveries',
]

function policyKey({ tablename, policyname }) {
  return `${tablename}.${policyname}`
}

function normalizeRoles(roles) {
  return [...new Set(
    String(roles ?? '')
      .replace(/[{}"']/g, '')
      .split(',')
      .map((role) => role.trim())
      .filter(Boolean)
  )]
    .sort()
    .join(',')
}

function isFalseExpression(expression) {
  return String(expression ?? '')
    .toLowerCase()
    .replace(/[\s()]/g, '') === 'false'
}

function isSecureTenantPolicy(row) {
  const expression = `${row.using_expression} ${row.check_expression}`
  const ownershipPolicy =
    row.tablename === 'cortex_conversations'
    || row.tablename === 'cortex_messages'

  return normalizeRoles(row.roles) === 'authenticated'
    && expression.includes('auth_tenant_id()')
    && (!ownershipPolicy || expression.includes('auth.uid()'))
}

function isSecureDirectClientDenyPolicy(row) {
  return normalizeRoles(row.roles) === 'anon,authenticated'
    && isFalseExpression(row.using_expression)
    && isFalseExpression(row.check_expression)
}

export function evaluateRlsPolicyCatalog(
  rows,
  { tenantPolicies, directClientDenyTables = requiredDirectClientDenyTables }
) {
  const tenantPolicyKeys = new Set(
    tenantPolicies.map(([table, policy]) => `${table}.${policy}`)
  )
  const directClientDenyPolicyKeys = new Set(
    directClientDenyTables.map(
      (table) => `${table}.deny_direct_client_access`
    )
  )
  const expected = new Set([
    ...tenantPolicyKeys,
    ...directClientDenyPolicyKeys,
  ])
  const actual = new Set(rows.map(policyKey))
  const missing = [...expected].filter((name) => !actual.has(name))
  const unexpected = [...actual].filter((name) => !expected.has(name))
  const weak = rows
    .filter((row) => {
      const key = policyKey(row)
      if (tenantPolicyKeys.has(key)) {
        return !isSecureTenantPolicy(row)
      }
      if (directClientDenyPolicyKeys.has(key)) {
        return !isSecureDirectClientDenyPolicy(row)
      }
      return false
    })
    .map(policyKey)

  return {
    ok: missing.length === 0 && unexpected.length === 0 && weak.length === 0,
    missing,
    unexpected,
    weak,
  }
}

export function formatRlsPolicyCatalogFailure(result) {
  return `missing=[${result.missing.join(',')}], unexpected=[${result.unexpected.join(',')}], weak=[${result.weak.join(',')}]`
}
