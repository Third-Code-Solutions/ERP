import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const FILES = {
  authorization: 'packages/shared-types/src/authorization.ts',
  shared: 'packages/shared-types/src/erp-api/daily-task-completion.ts',
  controller: 'apps/api/src/daily-tasks/daily-task-completion.controller.ts',
  service: 'apps/api/src/daily-tasks/daily-task-completion.service.ts',
  serviceTest:
    'apps/api/src/daily-tasks/daily-task-completion.service.spec.ts',
  apiModule: 'apps/api/src/daily-tasks/daily-tasks.module.ts',
  appModule: 'apps/api/src/app.module.ts',
  action: 'apps/web/src/app/(dashboard)/tasks/actions.ts',
  actionTest: 'apps/web/src/app/(dashboard)/tasks/actions.test.ts',
  page: 'apps/web/src/app/(dashboard)/tasks/page.tsx',
  taskRow: 'apps/web/src/components/tasks/task-row.tsx',
  button: 'apps/web/src/components/tasks/complete-task-button.tsx',
  client: 'apps/web/src/lib/erp-core-client.ts',
  routeInventory:
    'apps/web/src/lib/operations/dashboard-route-inventory.test.ts',
}

const ALLOWED_ROLES = ['owner', 'admin', 'sd_pm_pe', 'pm', 'safety']
const DENIED_ROLES = [
  'estimator',
  'sales',
  'commercial',
  'design',
  'finance',
  'procurement',
  'cx',
  'viewer',
]
const ALL_ROLES = [
  'owner',
  'estimator',
  'pm',
  'admin',
  'sales',
  'commercial',
  'design',
  'sd_pm_pe',
  'finance',
  'procurement',
  'safety',
  'cx',
  'viewer',
]

function invariant(condition, label) {
  if (!condition) {
    throw new Error(`Daily-task completion invariant missing: ${label}`)
  }
}

function normalizeFile(file) {
  return file.replaceAll('\\', '/').replace(/^\.\//, '')
}

function compact(value) {
  return value.replace(/\s+/g, '')
}

function unwrap(node) {
  let current = node
  while (
    ts.isAwaitExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression
  }
  return current
}

function descendants(root, predicate) {
  const found = []
  function visit(node) {
    if (predicate(node)) found.push(node)
    ts.forEachChild(node, visit)
  }
  visit(root)
  return found
}

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text
  return undefined
}

function calleeName(call) {
  const expression = unwrap(call.expression)
  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text
  return undefined
}

function rootIdentifier(expression) {
  let current = unwrap(expression)
  while (ts.isPropertyAccessExpression(current)) current = unwrap(current.expression)
  return ts.isIdentifier(current) ? current.text : undefined
}

function callableName(node) {
  if (
    (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
    node.name
  ) {
    return propertyName(node.name)
  }
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.initializer &&
    (ts.isArrowFunction(unwrap(node.initializer)) ||
      ts.isFunctionExpression(unwrap(node.initializer)))
  ) {
    return node.name.text
  }
  return undefined
}

function callableBody(node) {
  if (ts.isVariableDeclaration(node)) {
    const initializer = node.initializer && unwrap(node.initializer)
    return initializer &&
      (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
      ? initializer.body
      : undefined
  }
  return node.body
}

function directObjectKeys(object) {
  return object.properties.flatMap((property) => {
    if (
      ts.isPropertyAssignment(property) ||
      ts.isShorthandPropertyAssignment(property) ||
      ts.isMethodDeclaration(property)
    ) {
      const name = propertyName(property.name)
      return name ? [name] : []
    }
    return []
  })
}

function setEquals(actual, expected) {
  return (
    actual.length === expected.length &&
    [...actual].sort().every((value, index) => value === [...expected].sort()[index])
  )
}

class SourceGraph {
  constructor(root, overrides = {}) {
    this.root = root
    this.overrides = new Map(
      Object.entries(overrides).map(([file, source]) => [normalizeFile(file), source])
    )
    this.cache = new Map()
  }

  source(file) {
    const normalized = normalizeFile(file)
    const override = this.overrides.get(normalized)
    if (override !== undefined) return override
    return fs.readFileSync(path.join(this.root, normalized), 'utf8')
  }

  has(file) {
    const normalized = normalizeFile(file)
    return (
      this.overrides.has(normalized) ||
      fs.existsSync(path.join(this.root, normalized))
    )
  }

  info(file) {
    const normalized = normalizeFile(file)
    const cached = this.cache.get(normalized)
    if (cached) return cached
    const source = this.source(normalized)
    const sourceFile = ts.createSourceFile(
      normalized,
      source,
      ts.ScriptTarget.Latest,
      true,
      normalized.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    )
    invariant(sourceFile.parseDiagnostics.length === 0, `${normalized} parses`)

    const callables = new Map()
    const aliases = new Map()
    for (const statement of sourceFile.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name) {
        callables.set(statement.name.text, statement)
      }
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          const name = callableName(declaration)
          if (name) callables.set(name, declaration)
          if (
            ts.isIdentifier(declaration.name) &&
            declaration.initializer &&
            ts.isIdentifier(unwrap(declaration.initializer))
          ) {
            aliases.set(declaration.name.text, unwrap(declaration.initializer).text)
          }
        }
      }
    }
    const imports = new Map()
    for (const declaration of sourceFile.statements.filter(ts.isImportDeclaration)) {
      if (!ts.isStringLiteralLike(declaration.moduleSpecifier)) continue
      const moduleName = declaration.moduleSpecifier.text
      const clause = declaration.importClause
      if (clause?.name) {
        imports.set(clause.name.text, { moduleName, importedName: 'default' })
      }
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          imports.set(element.name.text, {
            moduleName,
            importedName: (element.propertyName ?? element.name).text,
          })
        }
      }
      if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        imports.set(clause.namedBindings.name.text, {
          moduleName,
          importedName: '*',
        })
      }
    }
    const info = { source, sourceFile, callables, aliases, imports }
    this.cache.set(normalized, info)
    return info
  }

  resolveModule(fromFile, moduleName) {
    let base
    if (moduleName.startsWith('@/')) {
      base = `apps/web/src/${moduleName.slice(2)}`
    } else if (moduleName.startsWith('.')) {
      base = path.posix.join(path.posix.dirname(normalizeFile(fromFile)), moduleName)
    } else {
      return undefined
    }
    const candidates = [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      `${base}.mjs`,
      `${base}/index.ts`,
      `${base}/index.tsx`,
    ].map(normalizeFile)
    return candidates.find((candidate) => this.has(candidate))
  }

  resolveExport(file, exportedName, seen = new Set()) {
    const normalized = normalizeFile(file)
    const marker = `${normalized}#${exportedName}`
    if (seen.has(marker)) return undefined
    seen.add(marker)
    const info = this.info(normalized)
    if (info.callables.has(exportedName)) {
      return { kind: 'local', file: normalized, name: exportedName }
    }
    if (info.aliases.has(exportedName)) {
      return this.resolveSymbol(
        normalized,
        info.aliases.get(exportedName),
        seen
      )
    }
    for (const statement of info.sourceFile.statements) {
      if (!ts.isExportDeclaration(statement)) continue
      const moduleName =
        statement.moduleSpecifier && ts.isStringLiteralLike(statement.moduleSpecifier)
          ? statement.moduleSpecifier.text
          : undefined
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          if (element.name.text !== exportedName) continue
          const sourceName = (element.propertyName ?? element.name).text
          if (!moduleName) return this.resolveSymbol(normalized, sourceName, seen)
          const target = this.resolveModule(normalized, moduleName)
          return target ? this.resolveExport(target, sourceName, seen) : undefined
        }
      }
      if (!statement.exportClause && moduleName) {
        const target = this.resolveModule(normalized, moduleName)
        const resolved = target
          ? this.resolveExport(target, exportedName, new Set(seen))
          : undefined
        if (resolved) return resolved
      }
    }
    return undefined
  }

  resolveSymbol(file, localName, seen = new Set()) {
    const normalized = normalizeFile(file)
    const marker = `${normalized}#${localName}`
    if (seen.has(marker)) return undefined
    seen.add(marker)
    const info = this.info(normalized)
    if (info.callables.has(localName)) {
      return { kind: 'local', file: normalized, name: localName }
    }
    const alias = info.aliases.get(localName)
    if (alias) return this.resolveSymbol(normalized, alias, seen)
    const binding = info.imports.get(localName)
    if (!binding) return undefined
    const target = this.resolveModule(normalized, binding.moduleName)
    if (!target) {
      return {
        kind: 'external',
        moduleName: binding.moduleName,
        name: binding.importedName,
      }
    }
    return this.resolveExport(target, binding.importedName, seen)
  }

  callable(file, name) {
    const info = this.info(file)
    const node =
      info.callables.get(name) ??
      descendants(info.sourceFile, (candidate) => callableName(candidate) === name)[0]
    invariant(node, `${normalizeFile(file)} exports callable ${name}`)
    return node
  }

  productionWebFiles() {
    const files = []
    const start = path.join(this.root, 'apps/web/src')
    const repositoryRoot = this.root
    function walk(directory) {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name)
        if (entry.isDirectory()) walk(absolute)
        else if (
          /\.tsx?$/.test(entry.name) &&
          !/\.(test|spec)\.[^.]+$/.test(entry.name)
        ) {
          files.push(normalizeFile(path.relative(repositoryRoot, absolute)))
        }
      }
    }
    walk(start)
    for (const file of this.overrides.keys()) {
      if (
        file.startsWith('apps/web/src/') &&
        /\.tsx?$/.test(file) &&
        !/\.(test|spec)\.[^.]+$/.test(file) &&
        !files.includes(file)
      ) {
        files.push(file)
      }
    }
    return files
  }
}

function schemaShape(graph, file, variableName) {
  const info = graph.info(file)
  const declaration = descendants(info.sourceFile, ts.isVariableDeclaration).find(
    (candidate) =>
      ts.isIdentifier(candidate.name) && candidate.name.text === variableName
  )
  invariant(declaration?.initializer, `${variableName} is declared`)
  const calls = descendants(declaration.initializer, ts.isCallExpression)
  invariant(
    calls.some(
      (call) =>
        ts.isPropertyAccessExpression(unwrap(call.expression)) &&
        unwrap(call.expression).name.text === 'strict'
    ),
    `${variableName} is strict`
  )
  const objectCall = calls.find((call) => {
    const expression = unwrap(call.expression)
    return (
      ts.isPropertyAccessExpression(expression) &&
      expression.name.text === 'object' &&
      call.arguments[0] &&
      ts.isObjectLiteralExpression(unwrap(call.arguments[0]))
    )
  })
  invariant(objectCall, `${variableName} has an object schema`)
  return directObjectKeys(unwrap(objectCall.arguments[0]))
}

function capabilityRoles(graph) {
  const info = graph.info(FILES.authorization)
  const declaration = descendants(info.sourceFile, ts.isVariableDeclaration).find(
    (candidate) =>
      ts.isIdentifier(candidate.name) && candidate.name.text === 'capabilityRoles'
  )
  invariant(declaration?.initializer, 'central capabilityRoles object exists')
  const object = unwrap(declaration.initializer)
  invariant(ts.isObjectLiteralExpression(object), 'capabilityRoles is an object')
  const property = object.properties.find(
    (candidate) =>
      ts.isPropertyAssignment(candidate) &&
      propertyName(candidate.name) === 'sd.daily_tasks'
  )
  invariant(property, 'central sd.daily_tasks capability exists')
  const value = unwrap(property.initializer)
  invariant(ts.isArrayLiteralExpression(value), 'sd.daily_tasks is an explicit role list')
  return value.elements.flatMap((element) => {
    const item = unwrap(element)
    return ts.isStringLiteralLike(item) ? [item.text] : []
  })
}

function verifySharedAndRoleContract(graph) {
  invariant(
    setEquals(capabilityRoles(graph), ALLOWED_ROLES),
    'sd.daily_tasks grants exactly Owner, Admin, SD-PM-PE, PM, and Safety'
  )
  invariant(
    setEquals([...ALLOWED_ROLES, ...DENIED_ROLES], ALL_ROLES),
    'the five allowed and eight denied roles cover all thirteen roles'
  )
  invariant(
    setEquals(
      schemaShape(graph, FILES.shared, 'dailyTaskCompletionCommandSchema'),
      ['notes']
    ),
    'the browser/Core command accepts only notes'
  )
  invariant(
    setEquals(
      schemaShape(graph, FILES.shared, 'dailyTaskCompletionResultSchema'),
      [
        'ok',
        'taskId',
        'tenantId',
        'projectId',
        'assigneeId',
        'status',
        'completionNotes',
        'completedAt',
        'completedBy',
      ]
    ),
    'the Core result carries the complete strict completion scope'
  )
}

function callText(node, sourceFile) {
  return compact(node.getText(sourceFile))
}

function findCalls(node, sourceFile, name) {
  return descendants(node, ts.isCallExpression).filter(
    (call) => calleeName(call) === name
  )
}

function verifyPageAndMountedControl(graph) {
  const page = graph.info(FILES.page)
  const pageText = compact(page.source)
  invariant(
    /can\(profile\.role,["']sd\.daily_tasks["']\)/.test(pageText),
    'the page projects the central completion capability'
  )
  invariant(
    /readOnly=\{isReadOnly\|\|!canCompleteTasks\}/.test(pageText),
    'the page makes all denied-role rows read-only'
  )
  const dailyTaskReads = descendants(page.sourceFile, ts.isCallExpression).filter(
    (call) =>
      calleeName(call) === 'from' &&
      call.arguments.some(
        (argument) => ts.isIdentifier(unwrap(argument)) && unwrap(argument).text === 'dailyTasks'
      )
  )
  invariant(dailyTaskReads.length === 5, 'all five mounted daily-task reads are inventoried')
  for (const read of dailyTaskReads) {
    let outer = read
    while (outer.parent && ts.isPropertyAccessExpression(outer.parent)) {
      if (outer.parent.parent && ts.isCallExpression(outer.parent.parent)) {
        outer = outer.parent.parent
      } else break
    }
    const text = callText(outer, page.sourceFile)
    invariant(
      text.includes('eq(dailyTasks.tenant_id,profile.tenantId)') &&
        text.includes('eq(dailyTasks.assignee_id,profile.user.id)'),
      'every mounted daily-task read is tenant/current-assignee scoped'
    )
  }

  const row = graph.info(FILES.taskRow)
  const rowText = compact(row.source)
  invariant(
    /completeTask\.bind\(null,\{taskId:task\.id,projectId:task\.project_id,assigneeId:task\.assignee_id,requiresNotes:requiresToolboxLog,?\}\)/.test(
      rowText
    ),
    'the mounted action binds the full server-derived task scope'
  )
  const controls = descendants(row.sourceFile, ts.isJsxSelfClosingElement).filter(
    (element) => element.tagName.getText(row.sourceFile) === 'CompleteTaskButton'
  )
  invariant(controls.length === 1, 'exactly one completion control is mounted')
  const control = controls[0]
  const controlText = compact(control.getText(row.sourceFile))
  invariant(
    controlText.includes('action={completeMountedTask}') &&
      controlText.includes('taskId={task.id}') &&
      controlText.includes('requiresNotes={requiresToolboxLog}'),
    'the completion control receives only the bound action and mounted task policy'
  )
  let parent = control.parent
  let guarded = false
  while (parent) {
    if (ts.isConditionalExpression(parent)) {
      const condition = compact(parent.condition.getText(row.sourceFile))
      if (
        condition.includes('readOnly') &&
        condition.includes("task.status==='done'") &&
        parent.whenFalse.pos <= control.pos &&
        control.end <= parent.whenFalse.end
      ) {
        guarded = true
        break
      }
    }
    parent = parent.parent
  }
  invariant(guarded, 'read-only and done rows cannot mount the completion control')

  const productionImports = []
  for (const file of graph.productionWebFiles()) {
    const info = graph.info(file)
    for (const [localName, binding] of info.imports) {
      if (binding.importedName !== 'completeTask') continue
      const target = graph.resolveModule(file, binding.moduleName)
      if (target === FILES.action) productionImports.push({ file, localName })
    }
  }
  invariant(
    productionImports.length === 1 &&
      productionImports[0].file === FILES.taskRow,
    'exactly one production component imports the mounted completion action'
  )

  const button = graph.info(FILES.button)
  const submit = graph.callable(FILES.button, 'submit')
  invariant(
    findCalls(submit, button.sourceFile, 'action').length === 1,
    'the UI invokes the mounted action once per submission'
  )
  invariant(
    findCalls(submit, button.sourceFile, 'refresh').length === 1,
    'the UI refreshes once after success'
  )
  const submitText = compact(submit.getText(button.sourceFile))
  invariant(
    submitText.includes('if(inFlight.current)return') &&
      submitText.includes('inFlight.current=true') &&
      submitText.includes('inFlight.current=false'),
    'the UI enforces recoverable single-flight submission'
  )
  invariant(
    submitText.indexOf('if(result.error)') < submitText.indexOf('router.refresh()'),
    'the UI refresh occurs only after action success'
  )
  invariant(
    /role=["']alert["']/.test(button.source) &&
      /role=["']status["']/.test(button.source) &&
      /maxLength=\{(?:2_000|2000)\}/.test(button.source),
    'the UI exposes bounded, announced error and pending states'
  )

  const route = compact(graph.source(FILES.routeInventory))
  invariant(
    /["']\/tasks["']:ALL_ROLES/.test(route),
    'all thirteen roles retain the /tasks route'
  )
}

function externalOrigin(graph, file, identifier, seen = new Set()) {
  const marker = `${file}#${identifier}`
  if (seen.has(marker)) return undefined
  seen.add(marker)
  const info = graph.info(file)
  const alias = info.aliases.get(identifier)
  if (alias) return externalOrigin(graph, file, alias, seen)
  const binding = info.imports.get(identifier)
  if (!binding) return undefined
  const target = graph.resolveModule(file, binding.moduleName)
  if (!target) return binding
  const resolved = graph.resolveExport(target, binding.importedName)
  return resolved?.kind === 'external' ? resolved : undefined
}

function verifyReachableWebMutationBoundary(graph) {
  const delegate = `${FILES.client}#completeDailyTaskThroughCoreApi`
  const pending = [{ file: FILES.action, name: 'completeTask' }]
  const visited = new Set()
  let delegateCalls = 0
  while (pending.length > 0) {
    const symbol = pending.pop()
    const marker = `${symbol.file}#${symbol.name}`
    if (visited.has(marker)) continue
    visited.add(marker)
    const info = graph.info(symbol.file)
    const declaration = info.callables.get(symbol.name)
    invariant(declaration, `reachable callable ${marker} resolves`)
    const body = callableBody(declaration)
    invariant(body, `reachable callable ${marker} has a body`)
    for (const call of descendants(body, ts.isCallExpression)) {
      const expression = unwrap(call.expression)
      const name = calleeName(call)
      const root = rootIdentifier(expression)
      const origin = root ? externalOrigin(graph, symbol.file, root) : undefined
      if (
        origin?.moduleName === '@third-code-erp/database' &&
        ['update', 'insert', 'delete', 'execute', 'transaction'].includes(name)
      ) {
        invariant(false, `no reachable Web database writer (${marker})`)
      }
      if (
        origin &&
        (origin.moduleName.includes('/audit') ||
          origin.moduleName.includes('sla-clock'))
      ) {
        invariant(false, `no reachable Web audit or SLA helper (${marker})`)
      }
      if (
        ['writeAuditLog', 'writeAuditLogInTransaction', 'stopSlaClock'].includes(
          name
        )
      ) {
        invariant(false, `no reachable Web audit or SLA call (${marker})`)
      }

      let resolved
      if (ts.isIdentifier(expression)) {
        resolved = graph.resolveSymbol(symbol.file, expression.text)
      } else if (ts.isPropertyAccessExpression(expression)) {
        const receiver = unwrap(expression.expression)
        if (ts.isIdentifier(receiver)) {
          const namespace = info.imports.get(receiver.text)
          if (namespace?.importedName === '*') {
            const target = graph.resolveModule(symbol.file, namespace.moduleName)
            resolved = target
              ? graph.resolveExport(target, expression.name.text)
              : undefined
          }
        }
      }
      if (!resolved) continue
      if (
        resolved.kind === 'local' &&
        `${resolved.file}#${resolved.name}` === delegate
      ) {
        delegateCalls += 1
      } else if (resolved.kind === 'local') {
        pending.push({ file: resolved.file, name: resolved.name })
      }
    }
  }
  invariant(delegateCalls === 1, 'the mounted path reaches exactly one Core delegate')
}

function verifyWebActionAndClient(graph) {
  const action = graph.info(FILES.action)
  const complete = graph.callable(FILES.action, 'completeTask')
  const completeText = compact(complete.getText(action.sourceFile))
  invariant(
    schemaShape(graph, FILES.action, 'completeTaskContextSchema').length === 4,
    'mounted context is strict and contains four trusted fields'
  )
  invariant(
    completeText.includes('Array.from(formData.keys())') &&
      completeText.includes("field==='notes'") &&
      completeText.includes("formData.getAll('notes').length<=1"),
    'hostile and duplicate FormData fields are rejected'
  )
  const calls = descendants(complete, ts.isCallExpression)
  const requiredCalls = [
    ['requireUserProfile', (call) => calleeName(call) === 'requireUserProfile'],
    ['can', (call) => calleeName(call) === 'can'],
    [
      'dailyTaskCompletionWritesUseCoreApi',
      (call) => calleeName(call) === 'dailyTaskCompletionWritesUseCoreApi',
    ],
    [
      'completeDailyTaskThroughCoreApi',
      (call) => {
        const expression = unwrap(call.expression)
        if (!ts.isIdentifier(expression)) return false
        const resolved = graph.resolveSymbol(FILES.action, expression.text)
        return (
          resolved?.kind === 'local' &&
          resolved.file === FILES.client &&
          resolved.name === 'completeDailyTaskThroughCoreApi'
        )
      },
    ],
    [
      'dailyTaskCompletionResultSchema.safeParse',
      (call) =>
        callText(call, action.sourceFile).startsWith(
          'dailyTaskCompletionResultSchema.safeParse('
        ),
    ],
    ['revalidatePath', (call) => calleeName(call) === 'revalidatePath'],
  ]
  const requiredCallOrder = requiredCalls.map(([name, predicate]) => {
    const call = calls.find(predicate)
    invariant(call, `completeTask calls ${name}`)
    return call.pos
  })
  invariant(
    requiredCallOrder.every(
      (position, index) => index === 0 || requiredCallOrder[index - 1] < position
    ),
    'authentication, capability, selector, Core, result, and refresh are ordered fail closed'
  )
  invariant(
    /can\(profile\.role,["']sd\.daily_tasks["']\)/.test(completeText),
    'the Web action repeats the central capability guard'
  )
  invariant(
    /if\(!dailyTaskCompletionWritesUseCoreApi\(profile\.tenantId\)\)/.test(
      completeText
    ),
    'the Web action fails closed when tenant selection is denied'
  )
  const comparisons = ['taskId', 'tenantId', 'projectId', 'assigneeId', 'status']
  for (const field of comparisons) {
    invariant(
      completeText.includes(`parsedResult.data.${field}`),
      `the Web action checks returned ${field}`
    )
  }
  const outcomes = descendants(complete, ts.isStringLiteralLike)
    .map((literal) => literal.text)
    .filter((value) =>
      [
        'invalid_request',
        'unauthorized',
        'forbidden',
        'selector_denied',
        'core_error',
        'invalid_result',
        'success',
        'exception',
      ].includes(value)
    )
  invariant(
    setEquals([...new Set(outcomes)], [
      'invalid_request',
      'unauthorized',
      'forbidden',
      'selector_denied',
      'core_error',
      'invalid_result',
      'success',
      'exception',
    ]),
    'the Web action emits every redacted outcome'
  )
  const finish = graph.callable(FILES.action, 'finish')
  const finishText = compact(finish.getText(action.sourceFile))
  for (const field of ['trace_id', 'tenant_id', 'actor_id', 'action', 'outcome']) {
    invariant(finishText.includes(`${field}:`), `structured logs include ${field}`)
  }
  invariant(
    !/notes:|idempotency|authorization|headers:|body:/.test(finishText),
    'structured outcome logs exclude notes, keys, tokens, headers, and bodies'
  )

  const key = graph.callable(FILES.action, 'dailyTaskCompletionKey')
  const keyText = compact(key.getText(action.sourceFile))
  invariant(
    /createHash\(["']sha256["']\)/.test(keyText) &&
      keyText.includes('JSON.stringify({command,taskId})') &&
      keyText.includes(".digest('hex')"),
    'the stable key hashes the complete normalized command and task identity'
  )

  verifyReachableWebMutationBoundary(graph)

  const client = graph.info(FILES.client)
  const delegate = graph.callable(FILES.client, 'completeDailyTaskThroughCoreApi')
  const delegateText = compact(delegate.getText(client.sourceFile))
  invariant(
    findCalls(delegate, client.sourceFile, 'fetch').length === 1,
    'the Core adapter performs exactly one HTTP request'
  )
  for (const required of [
    '/v1/daily-tasks/${encodeURIComponent(parsedTaskId.data)}/completion',
    "method:'POST'",
    "authorization:`Bearer${access.accessToken}`",
    "'Idempotency-Key':parsedKey.data",
    'body:JSON.stringify(parsedCommand.data)',
    "cache:'no-store'",
    'AbortSignal.timeout(10_000)',
    'dailyTaskCompletionResultSchema.safeParse(body)',
  ]) {
    invariant(delegateText.includes(compact(required)), `Core adapter retains ${required}`)
  }
  const selector = graph.callable(
    FILES.client,
    'dailyTaskCompletionWritesUseCoreApi'
  )
  const selectorText = compact(selector.getText(client.sourceFile))
  invariant(
    selectorText.includes('tenantEnabledForCoreApi(') &&
      selectorText.includes('ERP_DAILY_TASK_COMPLETION_WRITES_VIA_API') &&
      selectorText.includes('ERP_DAILY_TASK_COMPLETION_WRITES_VIA_API_TENANT_IDS'),
    'the Core authority is selected by global flag plus tenant allowlist'
  )
}

function chainContaining(node, sourceFile, fragment) {
  return descendants(node, ts.isCallExpression).find((call) =>
    callText(call, sourceFile).includes(fragment)
  )
}

function verifyCoreBoundary(graph) {
  const controller = graph.info(FILES.controller)
  const controllerText = compact(controller.source)
  for (const required of [
    "@Controller('v1/daily-tasks')",
    "@Post(':taskId/completion')",
    "@RequireCapabilities('sd.daily_tasks')",
    "@Param('taskId',newParseUUIDPipe())",
    '@Body(DailyTaskCompletionPipe)',
    "@Headers('idempotency-key')",
  ]) {
    invariant(controllerText.includes(compact(required)), `Core controller retains ${required}`)
  }
  const appModule = compact(graph.source(FILES.appModule))
  const dailyModule = compact(graph.source(FILES.apiModule))
  invariant(
    appModule.includes('DailyTasksModule') &&
      dailyModule.includes('controllers:[DailyTaskCompletionController]') &&
      dailyModule.includes('RequestObservabilityMiddleware'),
    'the protected observable Core controller is mounted once'
  )

  const service = graph.info(FILES.service)
  const complete = graph.callable(FILES.service, 'complete')
  const transactionCalls = descendants(complete, ts.isCallExpression).filter(
    (call) => calleeName(call) === 'transaction'
  )
  invariant(transactionCalls.length === 1, 'Core uses one database transaction')
  const core = graph.callable(FILES.service, 'completeInTransaction')
  const coreText = compact(core.getText(service.sourceFile))
  const membership = chainContaining(core, service.sourceFile, '.from(users)')
  const advisory = chainContaining(core, service.sourceFile, 'pg_advisory_xact_lock')
  const taskLock = descendants(core, ts.isCallExpression).find((call) => {
    const text = callText(call, service.sourceFile)
    return text.includes('.from(dailyTasks)') && text.includes(".for('update')")
  })
  const receipt = chainContaining(core, service.sourceFile, '.from(auditLog)')
  const taskUpdate = chainContaining(core, service.sourceFile, '.update(dailyTasks)')
  const slaUpdate = chainContaining(core, service.sourceFile, '.update(slaLogs)')
  const auditWrite = descendants(core, ts.isCallExpression).find(
    (call) => callText(call, service.sourceFile).startsWith('this.audit.writeSemantic(')
  )
  for (const [value, label] of [
    [membership, 'locked current membership'],
    [advisory, 'tenant/key advisory lock'],
    [taskLock, 'tenant-scoped task row lock'],
    [receipt, 'tenant/full-key audit receipt lookup'],
    [taskUpdate, 'pending task update'],
    [slaUpdate, 'matching SLA closure'],
    [auditWrite, 'semantic completion audit'],
  ]) {
    invariant(value, `Core includes ${label}`)
  }
  const membershipText = callText(membership, service.sourceFile)
  invariant(
    membershipText.includes('eq(users.id,principal.userId)') &&
      membershipText.includes('eq(users.tenant_id,principal.tenantId)') &&
      membershipText.includes(".for('update')"),
    'membership is locked by current tenant and actor'
  )
  invariant(
    /roleHasCapability\(role,["']sd\.daily_tasks["']\)/.test(coreText),
    'Core repeats current-membership capability authorization'
  )
  invariant(
    (() => {
      const override = descendants(
        service.sourceFile,
        ts.isVariableDeclaration
      ).find(
        (declaration) =>
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === 'canOverrideAssignee'
      )
      return (
        override?.initializer &&
        /^role===["']owner["']\|\|role===["']admin["']$/.test(
          compact(override.initializer.getText(service.sourceFile))
        )
      )
    })() &&
      coreText.includes('task.assigneeId!==authorizedPrincipal.userId'),
    'only Owner/Admin override the assignee boundary'
  )
  const taskLockText = callText(taskLock, service.sourceFile)
  invariant(
    taskLockText.includes('eq(dailyTasks.id,taskId)') &&
      taskLockText.includes(
        'eq(dailyTasks.tenant_id,authorizedPrincipal.tenantId)'
      ),
    'task lock is scoped by task and current tenant'
  )
  const advisoryText = callText(advisory, service.sourceFile)
  invariant(
    advisoryText.includes('authorizedPrincipal.tenantId') &&
      advisoryText.includes('keyHash'),
    'advisory serialization binds tenant and full-key hash input'
  )
  const receiptText = callText(receipt, service.sourceFile)
  for (const required of [
    'auditLog.tenant_id',
    "'daily_task'",
    "'status_change'",
    'RECEIPT_SOURCE',
    'keyHash',
  ]) {
    invariant(receiptText.includes(required), `receipt lookup includes ${required}`)
  }
  invariant(
    coreText.includes('parsedReceipt.data.idempotency_key_hash!==keyHash') &&
      coreText.includes('parsedReceipt.data.command_hash!==commandHash'),
    'receipt replay verifies full key and command hashes'
  )
  const updateText = callText(taskUpdate, service.sourceFile)
  invariant(
    updateText.includes("eq(dailyTasks.status,'pending')") &&
      updateText.includes(
        'eq(dailyTasks.tenant_id,authorizedPrincipal.tenantId)'
      ),
    'task mutation is conditional on current-tenant pending state'
  )
  const slaText = callText(slaUpdate, service.sourceFile)
  for (const required of [
    'slaLogs.tenant_id',
    "'daily_task'",
    'slaLogs.entity_id',
    'task.id',
    'isNull(slaLogs.completed_at)',
  ]) {
    invariant(slaText.includes(required), `SLA closure includes ${required}`)
  }
  invariant(
    membership.pos < advisory.pos &&
      advisory.pos < taskLock.pos &&
      taskLock.pos < receipt.pos &&
      taskUpdate.pos < slaUpdate.pos &&
      slaUpdate.pos < auditWrite.pos,
    'authorization, locks, receipt, task, SLA, and audit retain atomic order'
  )
  const assigneePosition = coreText.indexOf(
    'task.assigneeId!==authorizedPrincipal.userId'
  )
  const donePosition = coreText.indexOf("task.status==='done'")
  const skippedPosition = coreText.indexOf("task.status==='skipped'")
  const updatePosition = coreText.indexOf('.update(dailyTasks)')
  invariant(
    assigneePosition >= 0 &&
      donePosition > assigneePosition &&
      skippedPosition > donePosition &&
      updatePosition > skippedPosition,
    'authorized done is a no-write result and skipped conflicts before mutation'
  )

  const auditCall = auditWrite
  const auditObject = auditCall.arguments[1] && unwrap(auditCall.arguments[1])
  invariant(ts.isObjectLiteralExpression(auditObject), 'semantic audit payload is explicit')
  const diff = auditObject.properties.find(
    (property) =>
      ts.isPropertyAssignment(property) && propertyName(property.name) === 'diff'
  )
  invariant(diff && ts.isPropertyAssignment(diff), 'semantic audit has an explicit diff')
  const diffObject = unwrap(diff.initializer)
  invariant(ts.isObjectLiteralExpression(diffObject), 'semantic audit diff is an object')
  invariant(
    setEquals(directObjectKeys(diffObject), [
      'from_status',
      'to_status',
      'completion_notes_present',
      'source',
      'idempotency_key_hash',
      'command_hash',
    ]),
    'audit receipt stores status/presence and hashes, never raw notes or keys'
  )
}

function verifyFocusedEvidence(graph) {
  const actionTest = graph.source(FILES.actionTest)
  const serviceTest = graph.source(FILES.serviceTest)
  const actionTestText = compact(actionTest)
  invariant(
    actionTestText.includes('it.each(ERP_ROLES)') &&
      /\[["']owner["'],["']admin["'],["']sd_pm_pe["'],["']pm["'],["']safety["']\]\.includes\(role\)/.test(
        actionTestText
      ),
    'Web tests enumerate all thirteen roles against the exact five-role set'
  )
  for (const phrase of [
    'denies stale membership before effects',
    'conceals missing and cross-tenant tasks',
    'requires normal %s users to own the assigned task',
    'allows %s tenant override for another or unassigned task',
    'returns an authorized canonical done task with zero new effects',
    'rejects skipped and malformed legacy done states without effects',
    'rolls task, SLA, receipt, and audit effects back on %s failure',
    'replays the same key and command with one task, SLA, and audit effect',
    'rejects same-key reuse for a different normalized command',
    'serializes concurrent same-key commands to a single effect',
  ]) {
    invariant(serviceTest.includes(phrase), `Core focused evidence covers ${phrase}`)
  }
}

export function verifyDailyTaskCompletionContract({
  root = process.cwd(),
  overrides = {},
} = {}) {
  const graph = new SourceGraph(root, overrides)
  verifySharedAndRoleContract(graph)
  verifyPageAndMountedControl(graph)
  verifyWebActionAndClient(graph)
  verifyCoreBoundary(graph)
  verifyFocusedEvidence(graph)
  return {
    roles: ALL_ROLES.length,
    completionRoles: ALLOWED_ROLES.length,
    deniedRoles: DENIED_ROLES.length,
    mountedControls: 1,
    coreDelegates: 1,
  }
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (invokedDirectly) {
  const result = verifyDailyTaskCompletionContract()
  console.log(
    `Daily-task completion mounted contract passed: ${result.roles} roles, ` +
      `${result.completionRoles} allowed, ${result.deniedRoles} denied, ` +
      `${result.mountedControls} mounted control, ${result.coreDelegates} Core delegate.`
  )
}
