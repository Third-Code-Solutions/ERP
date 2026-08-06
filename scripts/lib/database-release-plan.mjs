import { createHash } from 'node:crypto'

export function analyzeLedger(repositoryVersions, appliedVersions) {
  const repositorySet = new Set(repositoryVersions)
  const appliedSet = new Set(appliedVersions)
  const missing = repositoryVersions.filter(
    (version) => !appliedSet.has(version)
  )
  const unexpected = appliedVersions.filter(
    (version) => !repositorySet.has(version)
  )
  const firstGapIndex = repositoryVersions.findIndex(
    (version) => !appliedSet.has(version)
  )
  const appliedAfterFirstGap =
    firstGapIndex === -1
      ? []
      : repositoryVersions
          .slice(firstGapIndex + 1)
          .filter((version) => appliedSet.has(version))
  const isLinearPrefix =
    unexpected.length === 0 && appliedAfterFirstGap.length === 0

  let status = 'current'
  if (unexpected.length > 0) status = 'blocked_unexpected_history'
  else if (appliedAfterFirstGap.length > 0)
    status = 'blocked_non_linear_history'
  else if (missing.length > 0) status = 'review_required'

  return {
    status,
    isLinearPrefix,
    missing,
    unexpected,
    appliedAfterFirstGap,
  }
}

export function stripSqlComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ')
}

const riskRules = [
  {
    id: 'drop-object',
    expression:
      /\bdrop\s+(?:materialized\s+view|table|schema|view|type|domain|sequence|column|constraint|function|procedure|index|policy|trigger|extension)\b/i,
  },
  {
    id: 'truncate',
    expression: /\btruncate(?:\s+table)?\b/i,
  },
  {
    id: 'delete-data',
    expression: /\bdelete\s+from\b/i,
  },
  {
    id: 'rewrite-data',
    expression: /\bupdate\s+[a-zA-Z_"][\w".]*\s+set\b/i,
  },
  {
    id: 'transaction-control',
    expression: /\b(?:begin|commit|rollback)\s*;/i,
  },
  {
    id: 'cannot-run-in-transaction',
    expression:
      /\b(?:vacuum|create\s+index\s+concurrently|reindex\s+(?:index|table|schema|database)\s+concurrently)\b/i,
  },
]

export function scanSqlRisk(source) {
  const executableSql = stripSqlComments(source)
  return riskRules
    .filter((rule) => rule.expression.test(executableSql))
    .map((rule) => rule.id)
}

export function sha256(source) {
  return createHash('sha256').update(source).digest('hex')
}

export function releaseGatePassed(ledgerStatus, blockers) {
  return ledgerStatus === 'current' && blockers.length === 0
}

export function analyzeSecurityCatalog({
  anonTablePrivilegeCount,
  publicPolicyCount,
}) {
  const anonPrivileges = Number(anonTablePrivilegeCount ?? 0)
  const publicPolicies = Number(publicPolicyCount ?? 0)

  return {
    anonTablePrivilegeCount: anonPrivileges,
    publicPolicyCount: publicPolicies,
    blockers: [
      ...(anonPrivileges > 0
        ? [
            `target grants direct table privileges to anon (${anonPrivileges} privilege rows)`,
          ]
        : []),
      ...(publicPolicies > 0
        ? [
            `target assigns public ERP policies to PUBLIC (${publicPolicies} policies)`,
          ]
        : []),
    ],
  }
}
