import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import ts from 'typescript'
import {
  verifyCoreStageAuthority,
  verifyOpportunityCreationContract,
  verifyOpportunityMutationEntryInventory,
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

function read(relativePath) {
  return fs.readFileSync(relativePath, 'utf8')
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
