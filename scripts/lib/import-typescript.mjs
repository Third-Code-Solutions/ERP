/**
 * Import one of this repository's TypeScript modules from a plain Node script,
 * so a script can share validation code with the web app instead of copying
 * it. The repository has no TypeScript runner (tsx, ts-node), and Node's own
 * type stripping cannot load the workspace packages (extensionless imports,
 * parameter properties), so `.ts` files are transpiled in memory with the
 * `typescript` package the repository already installs. No type checking
 * happens here; `tsc` and vitest cover the same files.
 *
 * Only relative imports and workspace package exports resolve: a module that
 * uses the web app's `@/` alias cannot be loaded this way.
 */
import { readFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'

if (typeof registerHooks !== 'function') {
  throw new Error('Node 22.15 or newer is required (see .nvmrc)')
}

const ts = createRequire(import.meta.url)('typescript')

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (!/^\.{1,2}\//.test(specifier)) throw error
      for (const suffix of ['.ts', '/index.ts']) {
        try {
          return nextResolve(specifier + suffix, context)
        } catch {
          // Not this candidate; the original error is rethrown below.
        }
      }
      throw error
    }
  },
  load(url, context, nextLoad) {
    if (!url.startsWith('file:') || !url.endsWith('.ts')) return nextLoad(url, context)
    const { outputText } = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
      fileName: fileURLToPath(url),
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    })
    return { format: 'module', shortCircuit: true, source: outputText }
  },
})

/** @param {URL | string} fileUrl file URL of a `.ts` module */
export function importTypeScript(fileUrl) {
  return import(String(fileUrl))
}
