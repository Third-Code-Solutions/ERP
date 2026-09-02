import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import {
  verifyCoreStageAuthority,
  verifyWebStageDelegation,
} from './verify-wo-11-kyc-gate.mjs'

const corePath = 'apps/api/src/crm/opportunity-stage-transition.service.ts'
const webPath = 'apps/web/src/app/(dashboard)/pipeline/actions.ts'

function read(relativePath) {
  return fs.readFileSync(relativePath, 'utf8')
}

test('WO-11 PPRF and dual-track KYC contract passes', () => {
  const output = execFileSync(process.execPath, ['scripts/verify-wo-11-kyc-gate.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  assert.match(output, /Core-authoritative KYC\/state rules, Web Core-only delegation/)
})

test('fails if Core downstream KYC enforcement is removed', () => {
  const source = read(corePath)
  const mutated = source.replace(
    'KYC_GATED_STAGES.has(command.newStage)',
    'false'
  )
  assert.notEqual(mutated, source, 'mutation fixture must alter Core KYC gate')
  assert.throws(
    () => verifyCoreStageAuthority(mutated),
    /Core downstream-stage KYC gate/
  )
})

test('fails if Core linked-Account tenant scoping is removed', () => {
  const source = read(corePath)
  const mutated = source.replace(
    'eq(accounts.tenant_id, authorizedPrincipal.tenantId)',
    'eq(accounts.id, opportunity.accountId)'
  )
  assert.notEqual(mutated, source, 'mutation fixture must alter Account scope')
  assert.throws(
    () => verifyCoreStageAuthority(mutated),
    /linked Account query is tenant scoped/
  )
})

test('fails if Web Core delegation is removed', () => {
  const source = read(webPath)
  const mutated = source.replace(
    'transition = await transitionOpportunityStageThroughCoreApi(',
    'transition = await removedCoreDelegate('
  )
  assert.notEqual(mutated, source, 'mutation fixture must alter Web delegation')
  assert.throws(
    () => verifyWebStageDelegation(mutated),
    /all stage transitions have one Core delegate/
  )
})

test('fails if a Web-local Opportunity fallback writer is added', () => {
  const source = read(webPath)
  const mutated = source.replace(
    '  revalidatePipelinePaths()\n  return {}',
    '  await db.update(opportunities)\n  revalidatePipelinePaths()\n  return {}'
  )
  assert.notEqual(mutated, source, 'mutation fixture must add a Web-local writer')
  assert.throws(
    () => verifyWebStageDelegation(mutated),
    /no Web-local Opportunity stage writer/
  )
})
