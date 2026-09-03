import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import * as ts from 'typescript'
import { expect, it } from 'vitest'

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? files(path) : [path]
  })
}

it('statically inspectable navigation resolves to a page, handler, or public asset', () => {
  const sourceRoot = resolve('src')
  const appRoot = join(sourceRoot, 'app')
  const sources = files(sourceRoot).filter((path) => /\.tsx?$/.test(path) && !/\.test\./.test(path))
  const routePatterns = sources.filter((path) => /[/\\](page|route)\.tsx?$/.test(path)).map((path) => {
    const parts = relative(appRoot, dirname(path)).split(/[/\\]/).filter((part) => !part.startsWith('('))
    const pattern = parts.map((part) => part.startsWith('[') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('/')
    return new RegExp(`^/${pattern}/?$`)
  })
  // This builder deliberately uses a finite feature union. Read the object keys
  // rather than excluding its dynamic paths or maintaining a second feature list.
  const featureSource = ts.createSourceFile('entry.tsx', readFileSync(join(appRoot, '(dashboard)', '_project-entry.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const features: string[] = []
  function findFeatures(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(featureSource) === 'PROJECT_FEATURES' && node.initializer && ts.isAsExpression(node.initializer) && ts.isObjectLiteralExpression(node.initializer.expression)) {
      for (const property of node.initializer.expression.properties) {
        if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) features.push(property.name.text)
      }
    }
    ts.forEachChild(node, findFeatures)
  }
  findFeatures(featureSource)
  expect(features.length).toBeGreaterThan(0)

  const missing: string[] = []
  let checked = 0
  for (const file of sources) {
    const text = readFileSync(file, 'utf8')
    // Skip modules with no navigation vocabulary, not navigation destinations.
    if (!/\bhref\b|\bredirect\b|\bpermanentRedirect\b|\brouter\b|\bnavigation\b/.test(text)) continue
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    function check(expression: ts.Expression) {
      let paths: string[] = []
      if (ts.isStringLiteralLike(expression)) paths = [expression.text]
      else if (ts.isTemplateExpression(expression)) {
        paths = [expression.head.text]
        for (const span of expression.templateSpans) {
          const values = ts.isIdentifier(span.expression) && span.expression.text === 'feature' ? features : ['sample-id']
          paths = paths.flatMap((path) => values.map((value) => path + value + span.literal.text))
        }
      }
      for (const href of paths) {
        if (!href.startsWith('/') || href.startsWith('//')) continue
        const path = href.split(/[?#]/)[0]!
        checked++
        if (!routePatterns.some((pattern) => pattern.test(path)) && !existsSync(join(resolve('public'), path))) {
          const line = source.getLineAndCharacterOfPosition(expression.getStart(source)).line + 1
          missing.push(`${relative(sourceRoot, file)}:${line} ${path}`)
        }
      }
    }
    function visit(node: ts.Node) {
      if (ts.isJsxAttribute(node) && node.name.getText(source) === 'href' && node.initializer) {
        if (ts.isStringLiteral(node.initializer)) check(node.initializer)
        else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) check(node.initializer.expression)
      }
      if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'href') check(node.initializer)
      if (ts.isCallExpression(node) && /^(redirect|permanentRedirect|router\.(push|replace)|navigation\.(push|replace))$/.test(node.expression.getText(source)) && node.arguments[0]) check(node.arguments[0])
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  expect(checked).toBeGreaterThan(450)
  expect(missing).toEqual([])
}, 30_000)
