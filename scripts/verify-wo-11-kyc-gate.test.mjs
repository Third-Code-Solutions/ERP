import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import ts from 'typescript'
import {
  verifyCoreStageAuthority,
  verifyOpportunityCreationContract,
  verifyOpportunityMutationEntryInventory,
  verifyPprfSubmissionContract,
  verifyProjectOpportunityPanelContract,
  verifyProjectOpportunityPermissions,
  verifyProjectOpportunityCreationDelegation,
  verifyProjectStageDelegation,
  verifyWebStageDelegation,
} from './verify-wo-11-kyc-gate.mjs'

const corePath = 'apps/api/src/crm/opportunity-stage-transition.service.ts'
const pipelineActionPath = 'apps/web/src/app/(dashboard)/pipeline/actions.ts'
const projectActionPath =
  'apps/web/src/app/(dashboard)/projects/[id]/opportunities/actions.ts'
const projectPanelPath =
  'apps/web/src/components/opportunities/opportunity-panel.tsx'
const projectPanelModelPath =
  'apps/web/src/components/opportunities/opportunity-panel-model.ts'
const projectPagePath = 'apps/web/src/app/(dashboard)/projects/[id]/page.tsx'
const authorizationPath = 'packages/shared-types/src/authorization.ts'
const opportunityContractPath =
  'packages/shared-types/src/erp-api/opportunities.ts'
const delegatedProjectActionPath =
  'apps/web/src/app/(dashboard)/projects/[id]/opportunities/delegated-actions.ts'
const pprfServicePath = 'apps/web/src/server/crm/pprf-submission-service.ts'
const pprfServiceTestPath =
  'apps/web/src/server/crm/pprf-submission-service.test.ts'
const pprfIntakeActionPath =
  'apps/web/src/app/(dashboard)/crm/opportunities/new/pprf/actions.ts'
const pprfIntakePagePath =
  'apps/web/src/app/(dashboard)/crm/opportunities/new/pprf/page.tsx'
const pprfIntakeFormPath =
  'apps/web/src/components/proposal/pprf-intake-form.tsx'
const pprfResubmissionActionPath =
  'apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/actions.ts'
const pprfDetailPagePath =
  'apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/pprf/page.tsx'
const pprfResubmissionFormPath =
  'apps/web/src/components/proposal/pprf-form.tsx'
const pprfRouteRegistryPath = 'apps/web/src/lib/operations/nav-config.ts'

function read(relativePath) {
  return fs.readFileSync(relativePath, 'utf8')
}

function replaceTextOnce(source, search, replacement, label) {
  assert.equal(source.split(search).length - 1, 1, label)
  return source.replace(search, replacement)
}

function replaceTextFirst(source, search, replacement, label) {
  assert.ok(source.includes(search), label)
  return source.replace(search, replacement)
}

function verifyPprfOverride(relativePath, source, extraOverrides = new Map()) {
  return verifyPprfSubmissionContract(
    process.cwd(),
    new Map([[relativePath, source], ...extraOverrides])
  )
}

function parse(source, fileName) {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    kind
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${fileName} must parse`)
  return sourceFile
}

function reprint(source, fileName) {
  return ts.createPrinter().printFile(parse(source, fileName))
}

function expressionPath(node) {
  if (ts.isIdentifier(node)) return node.text
  if (ts.isPropertyAccessExpression(node)) {
    const receiver = expressionPath(node.expression)
    return receiver ? `${receiver}.${node.name.text}` : node.name.text
  }
  return undefined
}

function callName(node) {
  if (!ts.isCallExpression(node)) return undefined
  return ts.isIdentifier(node.expression)
    ? node.expression.text
    : ts.isPropertyAccessExpression(node.expression)
      ? node.expression.name.text
      : undefined
}

function isWithinFunction(node, functionName) {
  let current = node.parent
  while (current) {
    if (
      ts.isFunctionDeclaration(current) &&
      current.name?.text === functionName
    ) {
      return true
    }
    current = current.parent
  }
  return false
}

function isWithinVariable(node, variableName) {
  let current = node.parent
  while (current) {
    if (
      ts.isVariableDeclaration(current) &&
      ts.isIdentifier(current.name) &&
      current.name.text === variableName
    ) {
      return true
    }
    current = current.parent
  }
  return false
}

function mutateFirst(source, fileName, predicate, replacement, label) {
  const sourceFile = parse(source, fileName)
  let mutationCount = 0
  const result = ts.transform(sourceFile, [
    (context) => {
      const visit = (node) => {
        if (mutationCount === 0 && predicate(node, sourceFile)) {
          mutationCount += 1
          return replacement(node, ts.factory)
        }
        return ts.visitEachChild(node, visit, context)
      }
      return (root) => ts.visitNode(root, visit)
    },
  ])
  assert.equal(mutationCount, 1, label)
  const mutated = ts.createPrinter().printFile(result.transformed[0])
  result.dispose()
  return mutated
}

function replaceNamedCall(source, fileName, name, replacementName) {
  return mutateFirst(
    source,
    fileName,
    (node) => ts.isCallExpression(node) && callName(node) === name,
    (node, factory) =>
      factory.updateCallExpression(
        node,
        factory.createIdentifier(replacementName),
        node.typeArguments,
        node.arguments
      ),
    `mutation fixture must replace ${name}`
  )
}

function addCallToFunction(source, fileName, functionName, callExpression, label) {
  return mutateFirst(
    source,
    fileName,
    (node) =>
      ts.isFunctionDeclaration(node) &&
      node.name?.text === functionName &&
      node.body !== undefined,
    (node, factory) =>
      factory.updateFunctionDeclaration(
        node,
        node.modifiers,
        node.asteriskToken,
        node.name,
        node.typeParameters,
        node.parameters,
        node.type,
        factory.updateBlock(node.body, [
          factory.createExpressionStatement(callExpression(factory)),
          ...node.body.statements,
        ])
      ),
    label
  )
}

function addStatementsToFunction(source, fileName, functionName, statements, label) {
  return mutateFirst(
    source,
    fileName,
    (node) =>
      ts.isFunctionDeclaration(node) &&
      node.name?.text === functionName &&
      node.body !== undefined,
    (node, factory) =>
      factory.updateFunctionDeclaration(
        node,
        node.modifiers,
        node.asteriskToken,
        node.name,
        node.typeParameters,
        node.parameters,
        node.type,
        factory.updateBlock(node.body, [
          ...statements(factory),
          ...node.body.statements,
        ])
      ),
    label
  )
}

function addNamedImport(source, fileName, moduleName, importedName, localName) {
  return mutateFirst(
    source,
    fileName,
    ts.isSourceFile,
    (node, factory) =>
      factory.updateSourceFile(node, [
        factory.createImportDeclaration(
          undefined,
          factory.createImportClause(
            false,
            undefined,
            factory.createNamedImports([
              factory.createImportSpecifier(
                false,
                importedName === localName
                  ? undefined
                  : factory.createIdentifier(importedName),
                factory.createIdentifier(localName)
              ),
            ])
          ),
          factory.createStringLiteral(moduleName)
        ),
        ...node.statements,
      ]),
    `mutation fixture must import ${importedName}`
  )
}

function addOpportunityUpdate(source, fileName, functionName) {
  const withWriter = addCallToFunction(
    source,
    fileName,
    functionName,
    (factory) =>
      factory.createCallExpression(
        factory.createPropertyAccessExpression(
          factory.createIdentifier('mutationDb'),
          'update'
        ),
        undefined,
        [factory.createIdentifier('mutationOpportunities')]
      ),
    `mutation fixture must add a local writer to ${functionName}`
  )
  const withDatabase = addNamedImport(
    withWriter,
    fileName,
    '@third-code-erp/database',
    'db',
    'mutationDb'
  )
  return addNamedImport(
    withDatabase,
    fileName,
    '@third-code-erp/database/schema',
    'opportunities',
    'mutationOpportunities'
  )
}

function addAliasedOpportunityUpdate(source, fileName, functionName) {
  const withWriter = addStatementsToFunction(
    source,
    fileName,
    functionName,
    (factory) => [
      factory.createVariableStatement(
        undefined,
        factory.createVariableDeclarationList(
          [
            factory.createVariableDeclaration(
              'opportunityTable',
              undefined,
              undefined,
              factory.createIdentifier('mutationOpportunities')
            ),
          ],
          ts.NodeFlags.Const
        )
      ),
      factory.createExpressionStatement(
        factory.createCallExpression(
          factory.createPropertyAccessExpression(
            factory.createIdentifier('mutationDb'),
            'update'
          ),
          undefined,
          [factory.createIdentifier('opportunityTable')]
        )
      ),
    ],
    `mutation fixture must add an aliased local writer to ${functionName}`
  )
  const withDatabase = addNamedImport(
    withWriter,
    fileName,
    '@third-code-erp/database',
    'db',
    'mutationDb'
  )
  return addNamedImport(
    withDatabase,
    fileName,
    '@third-code-erp/database/schema',
    'opportunities',
    'mutationOpportunities'
  )
}

function addOpportunityInsert(source, fileName, functionName) {
  const withWriter = addCallToFunction(
    source,
    fileName,
    functionName,
    (factory) =>
      factory.createCallExpression(
        factory.createPropertyAccessExpression(
          factory.createCallExpression(
            factory.createPropertyAccessExpression(
              factory.createIdentifier('mutationDb'),
              'insert'
            ),
            undefined,
            [factory.createIdentifier('mutationOpportunities')]
          ),
          'values'
        ),
        undefined,
        [
          factory.createObjectLiteralExpression([
            factory.createPropertyAssignment(
              'stage',
              factory.createStringLiteral('opportunity_creation')
            ),
          ]),
        ]
      ),
    `mutation fixture must add a local insert to ${functionName}`
  )
  const withDatabase = addNamedImport(
    withWriter,
    fileName,
    '@third-code-erp/database',
    'db',
    'mutationDb'
  )
  return addNamedImport(
    withDatabase,
    fileName,
    '@third-code-erp/database/schema',
    'opportunities',
    'mutationOpportunities'
  )
}

function convertExportedFunctionToArrow(source, fileName, functionName) {
  return mutateFirst(
    source,
    fileName,
    (node) =>
      ts.isFunctionDeclaration(node) &&
      node.name?.text === functionName &&
      node.body !== undefined,
    (node, factory) =>
      factory.createVariableStatement(
        node.modifiers?.filter(
          (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
        ),
        factory.createVariableDeclarationList(
          [
            factory.createVariableDeclaration(
              functionName,
              undefined,
              undefined,
              factory.createArrowFunction(
                node.modifiers?.some(
                  (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword
                )
                  ? [factory.createModifier(ts.SyntaxKind.AsyncKeyword)]
                  : undefined,
                node.typeParameters,
                node.parameters,
                node.type,
                factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                node.body
              )
            ),
          ],
          ts.NodeFlags.Const
        )
      ),
    `mutation fixture must convert ${functionName} to an exported arrow`
  )
}

function addReadOnlyOpportunityAccess(source, fileName, functionName) {
  const withRead = addCallToFunction(
    source,
    fileName,
    functionName,
    (factory) =>
      factory.createCallExpression(
        factory.createPropertyAccessExpression(
          factory.createCallExpression(
            factory.createPropertyAccessExpression(
              factory.createIdentifier('mutationDb'),
              'select'
            ),
            undefined,
            []
          ),
          'from'
        ),
        undefined,
        [factory.createIdentifier('mutationOpportunities')]
      ),
    `mutation fixture must add read-only access to ${functionName}`
  )
  const withDatabase = addNamedImport(
    withRead,
    fileName,
    '@third-code-erp/database',
    'db',
    'mutationDb'
  )
  return addNamedImport(
    withDatabase,
    fileName,
    '@third-code-erp/database/schema',
    'opportunities',
    'mutationOpportunities'
  )
}

function addImportedHelperCall(source, fileName, functionName) {
  const withCallAndAlias = addStatementsToFunction(
    source,
    fileName,
    functionName,
    (factory) => [
      factory.createVariableStatement(
        undefined,
        factory.createVariableDeclarationList(
          [
            factory.createVariableDeclaration(
              'localMutationAlias',
              undefined,
              undefined,
              factory.createIdentifier('importedMutationAlias')
            ),
          ],
          ts.NodeFlags.Const
        )
      ),
      factory.createExpressionStatement(
        factory.createCallExpression(
          factory.createIdentifier('localMutationAlias'),
          undefined,
          []
        )
      ),
    ],
    `mutation fixture must call an imported helper from ${functionName}`
  )
  return addNamedImport(
    withCallAndAlias,
    fileName,
    './delegated-actions',
    'commitMutation',
    'importedMutationAlias'
  )
}

function delegatedProjectActionModule(source) {
  return new Map([
    [
      projectActionPath,
      "export { createOpportunity, transitionStage } from './delegated-actions'\n",
    ],
    [delegatedProjectActionPath, source],
  ])
}

function addExportedOpportunityWriter(source, fileName) {
  const withWriter = mutateFirst(
    source,
    fileName,
    ts.isSourceFile,
    (node, factory) =>
      factory.updateSourceFile(node, [
        ...node.statements,
        factory.createFunctionDeclaration(
          [
            factory.createModifier(ts.SyntaxKind.ExportKeyword),
            factory.createModifier(ts.SyntaxKind.AsyncKeyword),
          ],
          undefined,
          'unmountedOpportunityWriter',
          undefined,
          [],
          undefined,
          factory.createBlock([
            factory.createExpressionStatement(
              factory.createCallExpression(
                factory.createPropertyAccessExpression(
                  factory.createIdentifier('mutationDb'),
                  'update'
                ),
                undefined,
                [factory.createIdentifier('mutationOpportunities')]
              )
            ),
          ])
        ),
      ]),
    'mutation fixture must add an exported Opportunity writer'
  )
  const withDatabase = addNamedImport(
    withWriter,
    fileName,
    '@third-code-erp/database',
    'db',
    'mutationDb'
  )
  return addNamedImport(
    withDatabase,
    fileName,
    '@third-code-erp/database/schema',
    'opportunities',
    'mutationOpportunities'
  )
}

test('WO-11 PPRF and every mounted Opportunity stage contract passes', () => {
  const output = execFileSync(
    process.execPath,
    ['scripts/verify-wo-11-kyc-gate.mjs'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    }
  )
  assert.match(output, /enumerated Pipeline\/Project Core-only delegation/)
})

test('accepts benign TypeScript printer formatting on every AST-verified surface', () => {
  verifyCoreStageAuthority(reprint(read(corePath), corePath))
  verifyWebStageDelegation(
    reprint(read(pipelineActionPath), pipelineActionPath)
  )
  verifyProjectStageDelegation(
    reprint(read(projectActionPath), projectActionPath)
  )
  verifyProjectOpportunityCreationDelegation(
    reprint(read(projectActionPath), projectActionPath)
  )
  verifyProjectOpportunityPanelContract(
    reprint(read(projectPanelPath), projectPanelPath),
    reprint(read(projectPanelModelPath), projectPanelModelPath)
  )
  verifyProjectOpportunityPermissions(
    reprint(read(projectPagePath), projectPagePath),
    reprint(read(authorizationPath), authorizationPath)
  )
})

test('verifies the mounted Project create action delegates to Core', () => {
  assert.doesNotThrow(() =>
    verifyProjectOpportunityCreationDelegation(read(projectActionPath))
  )
})

test('fails if Project create Core delegation is removed', () => {
  const mutated = replaceNamedCall(
    read(projectActionPath),
    projectActionPath,
    'createOpportunityThroughCoreApi',
    'removedCreateDelegate'
  )
  assert.throws(
    () => verifyProjectOpportunityCreationDelegation(mutated),
    /Project detail create action has one Core create delegate/
  )
})

test('fails if Project create adds a local Opportunity insert', () => {
  const mutated = addOpportunityInsert(
    read(projectActionPath),
    projectActionPath,
    'createOpportunity'
  )
  assert.throws(
    () => verifyProjectOpportunityCreationDelegation(mutated),
    /Project detail create action has no Web-local Opportunity writer/
  )
})

test('fails if the shared create contract permits another initial stage', () => {
  const mutated = mutateFirst(
    read(opportunityContractPath),
    opportunityContractPath,
    (node) =>
      ts.isStringLiteral(node) &&
      node.text === 'opportunity_creation' &&
      isWithinVariable(node, 'opportunityCreationCommandSchema'),
    (_node, factory) => factory.createStringLiteral('lead'),
    'mutation fixture must alter the shared create initial stage'
  )
  assert.throws(
    () => verifyOpportunityCreationContract(mutated),
    /shared create contract fixes the product-safe initial stage/
  )
})

test('fails if the shared create contract stops using exact TCV strings', () => {
  const mutated = mutateFirst(
    read(opportunityContractPath),
    opportunityContractPath,
    (node) =>
      ts.isIdentifier(node) &&
      node.text === 'safeNonNegativeCentavosStringSchema' &&
      isWithinVariable(node, 'opportunityCreationCommandSchema'),
    (_node, factory) => factory.createIdentifier('unsafeNumericMoneySchema'),
    'mutation fixture must alter shared create TCV validation'
  )
  assert.throws(
    () => verifyOpportunityCreationContract(mutated),
    /shared create contract uses canonical exact centavo strings/
  )
})

test('fails if Core downstream KYC enforcement is removed', () => {
  const mutated = mutateFirst(
    read(corePath),
    corePath,
    (node) =>
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      expressionPath(node.expression.expression) === 'KYC_GATED_STAGES' &&
      node.expression.name.text === 'has' &&
      expressionPath(node.arguments[0]) === 'command.newStage',
    (_node, factory) => factory.createFalse(),
    'mutation fixture must alter Core KYC gate'
  )
  assert.throws(
    () => verifyCoreStageAuthority(mutated),
    /Core downstream-stage KYC gate/
  )
})

test('fails if Core linked-Account tenant scoping is removed', () => {
  const mutated = mutateFirst(
    read(corePath),
    corePath,
    (node) =>
      ts.isCallExpression(node) &&
      callName(node) === 'eq' &&
      expressionPath(node.arguments[0]) === 'accounts.tenant_id' &&
      expressionPath(node.arguments[1]) === 'authorizedPrincipal.tenantId',
    (node, factory) =>
      factory.updateCallExpression(node, node.expression, node.typeArguments, [
        factory.createPropertyAccessExpression(
          factory.createIdentifier('accounts'),
          'id'
        ),
        factory.createPropertyAccessExpression(
          factory.createIdentifier('opportunity'),
          'accountId'
        ),
      ]),
    'mutation fixture must alter Account tenant scope'
  )
  assert.throws(
    () => verifyCoreStageAuthority(mutated),
    /linked Account query is tenant scoped/
  )
})

test('fails if Pipeline Core delegation is removed', () => {
  const mutated = replaceNamedCall(
    read(pipelineActionPath),
    pipelineActionPath,
    'transitionOpportunityStageThroughCoreApi',
    'removedCoreDelegate'
  )
  assert.throws(
    () => verifyWebStageDelegation(mutated),
    /Pipeline stage action has one Core delegate/
  )
})

test('fails if Pipeline adds a local Opportunity fallback writer', () => {
  const mutated = addOpportunityUpdate(
    read(pipelineActionPath),
    pipelineActionPath,
    'advanceOpportunityStage'
  )
  assert.throws(
    () => verifyWebStageDelegation(mutated),
    /Pipeline has no Web-local Opportunity stage writer/
  )
})

test('fails if Project detail Core delegation is removed', () => {
  const mutated = replaceNamedCall(
    read(projectActionPath),
    projectActionPath,
    'transitionOpportunityStageThroughCoreApi',
    'removedCoreDelegate'
  )
  assert.throws(
    () => verifyProjectStageDelegation(mutated),
    /Project detail stage action has one Core delegate/
  )
})

test('fails if Project detail adds a local Opportunity writer', () => {
  const mutated = addOpportunityUpdate(
    read(projectActionPath),
    projectActionPath,
    'transitionStage'
  )
  assert.throws(
    () => verifyProjectStageDelegation(mutated),
    /Project detail has no Web-local Opportunity stage writer/
  )
})

test('fails if Project detail aliases the Opportunity table before writing', () => {
  const mutated = addAliasedOpportunityUpdate(
    read(projectActionPath),
    projectActionPath,
    'transitionStage'
  )
  assert.throws(
    () => verifyProjectStageDelegation(mutated),
    /Project detail has no Web-local Opportunity stage writer/
  )
})

test('fails if Project detail inserts an Opportunity carrying a stage', () => {
  const mutated = addOpportunityInsert(
    read(projectActionPath),
    projectActionPath,
    'transitionStage'
  )
  assert.throws(
    () => verifyProjectStageDelegation(mutated),
    /Project detail has no Web-local Opportunity stage writer/
  )
})

test('accepts the mounted Project action as an exported arrow function', () => {
  const mutated = convertExportedFunctionToArrow(
    read(projectActionPath),
    projectActionPath,
    'transitionStage'
  )
  assert.doesNotThrow(() => verifyProjectStageDelegation(mutated))
  assert.doesNotThrow(() =>
    verifyOpportunityMutationEntryInventory(
      process.cwd(),
      new Map([[projectActionPath, mutated]])
    )
  )
})

test('fails closed if a mounted file exports an unenumerated Opportunity writer', () => {
  const mutated = addExportedOpportunityWriter(
    read(projectActionPath),
    projectActionPath
  )
  assert.throws(
    () =>
      verifyOpportunityMutationEntryInventory(
        process.cwd(),
        new Map([[projectActionPath, mutated]])
      ),
    /all mounted Opportunity mutation actions are exactly enumerated/
  )
})

test('accepts read-only Opportunity access in a mounted action', () => {
  const mutated = addReadOnlyOpportunityAccess(
    read(projectActionPath),
    projectActionPath,
    'transitionStage'
  )
  assert.doesNotThrow(() => verifyProjectStageDelegation(mutated))
})

test('follows a named imported helper and rejects its local Opportunity writer', () => {
  const actionSource = addImportedHelperCall(
    read(projectActionPath),
    projectActionPath,
    'transitionStage'
  )
  const helperSource = `
import { db as helperDb } from '@third-code-erp/database'
import { opportunities as importedOpportunities } from '@third-code-erp/database/schema'

export const commitMutation = async () => {
  const opportunityTable = importedOpportunities
  await helperDb.update(opportunityTable)
}
`
  assert.throws(
    () =>
      verifyOpportunityMutationEntryInventory(
        process.cwd(),
        new Map([
          [projectActionPath, actionSource],
          [delegatedProjectActionPath, helperSource],
        ])
      ),
    /transitionStage has no reachable local database writer/
  )
})

test('accepts named Project action re-exports when their graph is safe', () => {
  assert.doesNotThrow(() =>
    verifyOpportunityMutationEntryInventory(
      process.cwd(),
      delegatedProjectActionModule(read(projectActionPath))
    )
  )
})

test('follows a named re-export and rejects its local Opportunity writer', () => {
  const mutatedHelper = addOpportunityUpdate(
    read(projectActionPath),
    delegatedProjectActionPath,
    'transitionStage'
  )
  assert.throws(
    () =>
      verifyOpportunityMutationEntryInventory(
        process.cwd(),
        delegatedProjectActionModule(mutatedHelper)
      ),
    /transitionStage has no reachable local database writer/
  )
})

test('fails if Project detail adds a separate stage audit fallback', () => {
  const mutated = addCallToFunction(
    read(projectActionPath),
    projectActionPath,
    'transitionStage',
    (factory) =>
      factory.createCallExpression(
        factory.createIdentifier('writeAuditLog'),
        undefined,
        []
      ),
    'mutation fixture must add a Project detail audit fallback'
  )
  assert.throws(
    () => verifyProjectStageDelegation(mutated),
    /Project detail has no Web-local writeAuditLog fallback/
  )
})

test('fails if Project panel duplicates a transition table', () => {
  const mutated = mutateFirst(
    read(projectPanelPath),
    projectPanelPath,
    ts.isSourceFile,
    (node, factory) => {
      const localTransitions = factory.createVariableStatement(
        undefined,
        factory.createVariableDeclarationList(
          [
            factory.createVariableDeclaration(
              'LOCAL_STAGE_TRANSITIONS',
              undefined,
              undefined,
              factory.createObjectLiteralExpression([
                factory.createPropertyAssignment(
                  'negotiation',
                  factory.createArrayLiteralExpression([
                    factory.createStringLiteral('closed_won'),
                  ])
                ),
              ])
            ),
          ],
          ts.NodeFlags.Const
        )
      )
      return factory.updateSourceFile(node, [
        ...node.statements,
        localTransitions,
      ])
    },
    'mutation fixture must add a Project panel transition table'
  )
  assert.throws(
    () =>
      verifyProjectOpportunityPanelContract(
        mutated,
        read(projectPanelModelPath)
      ),
    /Project panel has no duplicate transition table/
  )
})

test('fails if Project panel bypasses shared reason routing', () => {
  const mutated = mutateFirst(
    read(projectPanelPath),
    projectPanelPath,
    (node) =>
      ts.isCallExpression(node) &&
      callName(node) === 'classifyOpportunityPanelDestination' &&
      isWithinFunction(node, 'handleTransition'),
    (_node, factory) => factory.createStringLiteral('submit'),
    'mutation fixture must bypass Project panel reason routing'
  )
  assert.throws(
    () =>
      verifyProjectOpportunityPanelContract(
        mutated,
        read(projectPanelModelPath)
      ),
    /Project panel routes transitions through the shared reason classifier/
  )
})

test('fails if Project panel severs the mounted create action', () => {
  const mutated = replaceNamedCall(
    read(projectPanelPath),
    projectPanelPath,
    'createOpportunity',
    'bypassedCreateOpportunity'
  )
  assert.throws(
    () =>
      verifyProjectOpportunityPanelContract(
        mutated,
        read(projectPanelModelPath)
      ),
    /Project panel submits one product-safe exact-money create command/
  )
})

test('fails if Project panel bypasses the product-safe initial stage', () => {
  const mutated = mutateFirst(
    read(projectPanelModelPath),
    projectPanelModelPath,
    (node) =>
      ts.isStringLiteral(node) &&
      node.text === 'opportunity_creation' &&
      isWithinFunction(node, 'buildOpportunityCreateFormData'),
    (_node, factory) => factory.createStringLiteral('lead'),
    'mutation fixture must alter the Project panel initial stage'
  )
  assert.throws(
    () =>
      verifyProjectOpportunityPanelContract(read(projectPanelPath), mutated),
    /Project panel submits one product-safe exact-money create command/
  )
})

test('fails if Project panel bypasses the shared exact-money schema', () => {
  const mutated = mutateFirst(
    read(projectPanelModelPath),
    projectPanelModelPath,
    (node) =>
      ts.isIdentifier(node) &&
      node.text === 'safeSignedCentavosStringSchema' &&
      isWithinFunction(node, 'copyCanonicalCentavosString'),
    (_node, factory) => factory.createIdentifier('unsafeNumericMoneySchema'),
    'mutation fixture must bypass the Project panel GP schema'
  )
  assert.throws(
    () =>
      verifyProjectOpportunityPanelContract(read(projectPanelPath), mutated),
    /Project panel submits one product-safe exact-money create command/
  )
})

test('fails if Project route severs permission wiring to the panel', () => {
  const mutated = mutateFirst(
    read(projectPagePath),
    projectPagePath,
    (node) =>
      ts.isJsxSelfClosingElement(node) &&
      node.tagName.getText() === 'OpportunityPanel' &&
      node.attributes.properties.some(
        (attribute) =>
          ts.isJsxSpreadAttribute(attribute) &&
          expressionPath(attribute.expression) === 'opportunityPermissions'
      ),
    (node, factory) =>
      factory.updateJsxSelfClosingElement(
        node,
        node.tagName,
        node.typeArguments,
        factory.updateJsxAttributes(
          node.attributes,
          node.attributes.properties.filter(
            (attribute) =>
              !(
                ts.isJsxSpreadAttribute(attribute) &&
                expressionPath(attribute.expression) ===
                  'opportunityPermissions'
              )
          )
        )
      ),
    'mutation fixture must remove Project panel permission wiring'
  )
  assert.throws(
    () =>
      verifyProjectOpportunityPermissions(
        mutated,
        read(authorizationPath)
      ),
    /Project route passes central Opportunity permissions to the panel/
  )
})

test('fails if Project panel mutation handling loses its permission guard', () => {
  const mutated = mutateFirst(
    read(projectPanelPath),
    projectPanelPath,
    (node) =>
      ts.isPrefixUnaryExpression(node) &&
      node.operator === ts.SyntaxKind.ExclamationToken &&
      expressionPath(node.operand) === 'canMutate' &&
      isWithinFunction(node, 'handleTransition'),
    (_node, factory) => factory.createFalse(),
    'mutation fixture must remove the Project transition permission guard'
  )
  assert.throws(
    () =>
      verifyProjectOpportunityPanelContract(
        mutated,
        read(projectPanelModelPath)
      ),
    /Project panel mutation callers are permission guarded/
  )
})

test('verifies both mounted PPRF submissions through one atomic service boundary', () => {
  assert.doesNotThrow(() => verifyPprfSubmissionContract(process.cwd()))
})

test('accepts benign formatting and a local alias for the PPRF service', () => {
  const formattedService = reprint(read(pprfServicePath), pprfServicePath)
  const aliasedAction = replaceTextOnce(
    read(pprfIntakeActionPath),
    '    const rawResult = await pprfSubmissionService.submitIntake(',
    '    const submissionService = pprfSubmissionService\n    const rawResult = await submissionService.submitIntake(',
    'alias fixture must replace the intake service receiver'
  )
  assert.doesNotThrow(() =>
    verifyPprfSubmissionContract(
      process.cwd(),
      new Map([
        [pprfServicePath, formattedService],
        [pprfIntakeActionPath, reprint(aliasedAction, pprfIntakeActionPath)],
      ])
    )
  )
})

test('fails if either mounted PPRF service delegate is removed', () => {
  for (const [fileName, method] of [
    [pprfIntakeActionPath, 'submitIntake'],
    [pprfResubmissionActionPath, 'submitResubmission'],
  ]) {
    const mutated = replaceTextOnce(
      read(fileName),
      `pprfSubmissionService.${method}`,
      `removedPprfService.${method}`,
      `delegate fixture must replace ${method}`
    )
    assert.throws(
      () => verifyPprfOverride(fileName, mutated),
      /has one exact atomic service delegate/
    )
  }
})

test('fails if a mounted action calls its atomic service twice', () => {
  const mutated = replaceTextOnce(
    read(pprfIntakeActionPath),
    '    const rawResult = await pprfSubmissionService.submitIntake(',
    '    await pprfSubmissionService.submitIntake({ tenantId, userId: actorId }, parsed.data)\n    const rawResult = await pprfSubmissionService.submitIntake(',
    'duplicate delegate fixture must add a second intake call'
  )
  assert.throws(
    () => verifyPprfOverride(pprfIntakeActionPath, mutated),
    /has one exact atomic service delegate/
  )
})

test('fails if an action reintroduces a post-commit SLA helper', () => {
  const mutated = replaceTextOnce(
    read(pprfIntakeActionPath),
    '    const checked = pprfSubmissionResultSchema.safeParse(rawResult)',
    '    await startSlaClock({})\n    const checked = pprfSubmissionResultSchema.safeParse(rawResult)',
    'post-commit fixture must add the SLA helper'
  )
  assert.throws(
    () => verifyPprfOverride(pprfIntakeActionPath, mutated),
    /has no reachable startSlaClock writer/
  )
})

test('fails if a mounted action adds a direct or aliased database writer', () => {
  const direct = replaceTextOnce(
    read(pprfResubmissionActionPath),
    'export async function submitPprf(opportunityId: string, formData: FormData) {',
    'export async function submitPprf(opportunityId: string, formData: FormData) {\n  await db.insert(pprfSubmissions).values({})',
    'direct writer fixture must modify submitPprf'
  )
  assert.throws(
    () => verifyPprfOverride(pprfResubmissionActionPath, direct),
    /has no reachable local database writer/
  )

  const aliased = replaceTextOnce(
    read(pprfResubmissionActionPath),
    'export async function submitPprf(opportunityId: string, formData: FormData) {',
    'export async function submitPprf(opportunityId: string, formData: FormData) {\n  const submissionTable = pprfSubmissions\n  await db.insert(submissionTable).values({})',
    'aliased writer fixture must modify submitPprf'
  )
  assert.throws(
    () => verifyPprfOverride(pprfResubmissionActionPath, aliased),
    /has no reachable local database writer/
  )
})

test('follows imported and re-exported helpers and rejects their PPRF writer', () => {
  const helperPath =
    'apps/web/src/app/(dashboard)/crm/opportunities/new/pprf/pprf-delegate.ts'
  const implementationPath =
    'apps/web/src/app/(dashboard)/crm/opportunities/new/pprf/pprf-delegate-impl.ts'
  const action = replaceTextOnce(
    read(pprfIntakeActionPath),
    "import { randomUUID } from 'node:crypto'",
    "import { randomUUID } from 'node:crypto'\nimport { submitPprfThroughHelper } from './pprf-delegate'",
    'helper fixture must add a named import'
  ).replace(
    'pprfSubmissionService.submitIntake(',
    'submitPprfThroughHelper('
  )
  const reexport =
    "export { submitPprfThroughHelper } from './pprf-delegate-impl'\n"
  const implementation = `
import { db } from '@third-code-erp/database'
import { pprfSubmissions } from '@third-code-erp/database/schema'
import { pprfSubmissionService } from '@/server/crm/pprf-submission-service'

export async function submitPprfThroughHelper(principal, command) {
  const result = await pprfSubmissionService.submitIntake(principal, command)
  await db.insert(pprfSubmissions).values({})
  return result
}
`
  assert.throws(
    () =>
      verifyPprfSubmissionContract(
        process.cwd(),
        new Map([
          [pprfIntakeActionPath, action],
          [helperPath, reexport],
          [implementationPath, implementation],
        ])
      ),
    /has no reachable local database writer/
  )
})

test('fails if the service drops membership, role, command, or Opportunity locking', () => {
  const cases = [
    ['const membership = await transaction.lockMembership(principal.data)', 'const membership = null', /current membership lock/],
    ["!roleHasCapability(membership.role, 'pprf.submit')", 'false', /exact submission capability/],
    ['await transaction.lockCommand(membership.tenantId, keyHash)', 'await Promise.resolve()', /tenant and full-key command lock/],
    ['const opportunity = await transaction.lockOpportunity(', 'const opportunity = await transaction.loadOpportunity(', /locked same-tenant Opportunity/],
  ]
  for (const [search, replacement, message] of cases) {
    const mutated = replaceTextFirst(
      read(pprfServicePath),
      search,
      replacement,
      `service lock fixture must replace ${search}`
    )
    assert.throws(
      () => verifyPprfOverride(pprfServicePath, mutated),
      message
    )
  }
})

test('fails if either PPRF command leaves the single transaction boundary', () => {
  const mutated = replaceTextFirst(
    read(pprfServicePath),
    'return await this.store.transaction(async (transaction) => {',
    'return await this.store.transaction(async (transaction) => {\n        await this.store.transaction(async () => failure(\'INTERNAL_ERROR\', \'nested\'))',
    'nested transaction fixture must modify intake'
  )
  assert.throws(
    () => verifyPprfOverride(pprfServicePath, mutated),
    /intake uses exactly one transaction/
  )
})

test('fails if required intake or resubmission atomic effects are dropped', () => {
  const cases = [
    ['const account = await transaction.createAccount({', 'const account = await removedTransaction.createAccount({', /intake creates one Account/],
    ['const opportunity = await transaction.createOpportunity({', 'const opportunity = await removedTransaction.createOpportunity({', /intake creates one Opportunity/],
    ['const pprf = await transaction.createPprf({', 'const pprf = await removedTransaction.createPprf({', /intake creates one PPRF/],
    ['await transaction.resetKycTracks({', 'await removedTransaction.resetKycTracks({', /intake resets both KYC tracks/],
    ['await transaction.writeAudit({', 'await removedTransaction.writeAudit({', /intake writes three semantic audits/],
    ['await transaction.ensurePprfReviewSla(', 'await removedTransaction.ensurePprfReviewSla(', /intake ensures one PPRF SLA/],
    ["['finance', 'owner', 'admin']", "['finance', 'owner']", /intake notification recipients are exact/],
    ["['commercial', 'finance']", "['finance']", /resubmission notification recipients are exact/],
  ]
  for (const [search, replacement, message] of cases) {
    const mutated = replaceTextFirst(
      read(pprfServicePath),
      search,
      replacement,
      `atomic effect fixture must replace ${search}`
    )
    assert.throws(
      () => verifyPprfOverride(pprfServicePath, mutated),
      message
    )
  }
})

test('fails if either command drops its redacted receipt marker', () => {
  const mutated = replaceTextFirst(
    read(pprfServicePath),
    "source: 'pprf_submission_service',",
    "source: 'removed_receipt',",
    'receipt marker fixture must modify one command'
  )
  assert.throws(
    () => verifyPprfOverride(pprfServicePath, mutated),
    /both PPRF commands write one receipt/
  )
})

test('fails if receipt or action logging exposes raw workflow payload', () => {
  const receipt = replaceTextFirst(
    read(pprfServicePath),
    '            command_hash: commandHash,',
    '            command_hash: commandHash,\n            scopeNotes: command.data.pprf.scopeNotes,',
    'receipt privacy fixture must add scope notes'
  )
  assert.throws(
    () => verifyPprfOverride(pprfServicePath, receipt),
    /receipt excludes raw key and payload fields/
  )

  const actionLog = replaceTextOnce(
    read(pprfIntakeActionPath),
    "    event: 'pprf_action',",
    "    event: 'pprf_action',\n    payload: input,",
    'log privacy fixture must add raw input'
  )
  assert.throws(
    () => verifyPprfOverride(pprfIntakeActionPath, actionLog),
    /log is redacted \(payload\)/
  )
})

test('fails if central PPRF authority grants a fourth role', () => {
  const mutated = replaceTextOnce(
    read(authorizationPath),
    "  'pprf.submit': ['owner', 'admin', 'sales'],",
    "  'pprf.submit': ['owner', 'admin', 'sales', 'commercial'],",
    'central role fixture must add Commercial'
  )
  assert.throws(
    () => verifyPprfOverride(authorizationPath, mutated),
    /pprf.submit has exact Owner\/Admin\/Sales authority/
  )
})

test('fails if either mounted PPRF route registry policy drifts', () => {
  const missingDetail = replaceTextOnce(
    read(pprfRouteRegistryPath),
    "    '/crm/opportunities/[id]/proposal/pprf',",
    "    '/crm/opportunities/[id]/proposal/pprf-removed',",
    'route fixture must remove PPRF detail'
  )
  assert.throws(
    () => verifyPprfOverride(pprfRouteRegistryPath, missingDetail),
    /detail route is registered for every authenticated role/
  )

  const widenedIntake = mutateFirst(
    read(pprfRouteRegistryPath),
    pprfRouteRegistryPath,
    (node) =>
      ts.isCallExpression(node) &&
      callName(node) === 'registerDashboardRoutes' &&
      node.arguments.some((argument) =>
        argument.getText().includes('/crm/opportunities/new/pprf')
      ),
    (node, factory) =>
      factory.updateCallExpression(node, node.expression, node.typeArguments, [
        node.arguments[0],
        factory.createArrayLiteralExpression([
          factory.createStringLiteral('admin'),
          factory.createStringLiteral('sales'),
          factory.createStringLiteral('commercial'),
        ]),
      ]),
    'route fixture must widen PPRF intake'
  )
  assert.throws(
    () => verifyPprfOverride(pprfRouteRegistryPath, widenedIntake),
    /intake route has exact Admin\/Sales registry roles/
  )
})

test('fails if PPRF receipt full hashes, tenant scope, or privacy are weakened', () => {
  const cases = [
    ['idempotency_key_hash: keyHash,', 'idempotency_key_hash: command.data.submissionId,', /receipt stores only the full key hash/],
    ['command_hash: commandHash,', 'command_hash: command.data.pprf.scopeNotes,', /receipt stores only the full command hash/],
    ['eq(auditLog.tenant_id, tenantId),', 'eq(auditLog.tenant_id, principalTenant),', /receipt lookup is tenant scoped/],
  ]
  for (const [search, replacement, message] of cases) {
    const mutated = replaceTextFirst(
      read(pprfServicePath),
      search,
      replacement,
      `receipt fixture must replace ${search}`
    )
    assert.throws(
      () => verifyPprfOverride(pprfServicePath, mutated),
      message
    )
  }
})

test('fails if exact string and BigInt money handling becomes numeric', () => {
  const mutated = replaceTextOnce(
    read(pprfServicePath),
    'const exact = BigInt(value)',
    'const exact = Number(value)',
    'money fixture must replace the bounded adapter input'
  )
  assert.throws(
    () => verifyPprfOverride(pprfServicePath, mutated),
    /money stays exact until the bounded adapter/
  )
})

test('fails if a mounted form trusts browser Opportunity or tenant identity', () => {
  for (const [fileName, marker, hostileName] of [
    [pprfResubmissionFormPath, '<input type="hidden" name="submission_id" value={submissionId} />', 'opportunity_id'],
    [pprfIntakeFormPath, '<input type="hidden" name="submission_id" value={submissionId} />', 'tenant_id'],
  ]) {
    const mutated = replaceTextOnce(
      read(fileName),
      marker,
      `${marker}\n      <input type="hidden" name="${hostileName}" value="forged" />`,
      `hidden identity fixture must add ${hostileName}`
    )
    assert.throws(
      () => verifyPprfOverride(fileName, mutated),
      /mounts only the stable submission UUID as hidden identity/
    )
  }
})

test('fails if detail exposes the PPRF form without the central submit capability', () => {
  const mutated = replaceTextOnce(
    read(pprfDetailPagePath),
    "const canSubmit = can(profile.role, 'pprf.submit')",
    'const canSubmit = true',
    'denied UI fixture must remove the capability projection'
  )
  assert.throws(
    () => verifyPprfOverride(pprfDetailPagePath, mutated),
    /detail projects exact-three submit controls/
  )
})

test('fails if intake route drops either exact-three capability guard', () => {
  const mutated = replaceTextOnce(
    read(pprfIntakePagePath),
    " || !can(profile.role, 'account.create')",
    '',
    'intake route fixture must drop Account-create authority'
  )
  assert.throws(
    () => verifyPprfOverride(pprfIntakePagePath, mutated),
    /intake route requires both central capabilities/
  )
})

test('fails if an action stops rejecting duplicate or hostile FormData', () => {
  const duplicateMutation = replaceTextOnce(
    read(pprfIntakeActionPath),
    'const entries = formData.getAll(name)',
    'const entries = [formData.get(name)]',
    'duplicate-field fixture must bypass getAll'
  )
  assert.throws(
    () => verifyPprfOverride(pprfIntakeActionPath, duplicateMutation),
    /rejects duplicate text fields/
  )

  const hostileMutation = replaceTextOnce(
    read(pprfResubmissionActionPath),
    'if (!PPRF_FIELD_NAME_SET.has(name)) {',
    'if (false) {',
    'unknown-field fixture must bypass the allowlist'
  )
  assert.throws(
    () => verifyPprfOverride(pprfResubmissionActionPath, hostileMutation),
    /rejects unknown FormData fields/
  )
})

test('fails if strict service result scope validation is dropped', () => {
  const mutated = replaceTextOnce(
    read(pprfResubmissionActionPath),
    '      checked.data.opportunityId !== opportunityId',
    '      false',
    'result-scope fixture must remove Opportunity identity validation'
  )
  assert.throws(
    () => verifyPprfOverride(pprfResubmissionActionPath, mutated),
    /validates committed result scope/
  )
})

test('fails if refresh failure is reclassified as command failure', () => {
  const mutated = replaceTextOnce(
    read(pprfIntakeActionPath),
    '    } catch {\n      refreshFailed = true\n    }',
    "    } catch {\n      return { ok: false as const, error: 'Refresh failed' }\n    }",
    'refresh fixture must return a command failure'
  )
  assert.throws(
    () => verifyPprfOverride(pprfIntakeActionPath, mutated),
    /refresh failure remains committed success/
  )
})

test('fails if either form loses its synchronous duplicate-submit guard', () => {
  for (const [fileName, guard] of [
    [pprfIntakeFormPath, 'if (inFlightRef.current) return'],
    [pprfResubmissionFormPath, 'if (inFlightRef.current) return'],
  ]) {
    const mutated = replaceTextOnce(
      read(fileName),
      guard,
      'if (false) return',
      `single-flight fixture must remove ${fileName} guard`
    )
    assert.throws(
      () => verifyPprfOverride(fileName, mutated),
      /has a synchronous single-flight guard/
    )
  }
})

test('fails if the service regression suite drops replay or concurrency proof', () => {
  for (const title of [
    'replays the same intake key exactly and rejects key reuse with changed payload',
    'replays the same resubmission result and rejects changed payload reuse',
    'serializes concurrent same-key intake into one complete effect',
    'serializes concurrent resubmissions into distinct versions',
  ]) {
    const mutated = replaceTextOnce(
      read(pprfServiceTestPath),
      title,
      'deleted regression coverage',
      `test coverage fixture must rename ${title}`
    )
    assert.throws(
      () => verifyPprfOverride(pprfServiceTestPath, mutated),
      /service tests cover replay, conflict, and concurrency/
    )
  }
})
