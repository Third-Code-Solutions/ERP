import { defineConfig, mergeConfig } from 'vitest/config'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import base from './vitest.config'

// Local-only: resolve workspace packages to this worktree, not the junctioned main tree.
const pkgRoot = resolve(__dirname, '../../packages')
const alias: { find: string; replacement: string }[] = []
for (const p of readdirSync(pkgRoot)) {
  const pj = resolve(pkgRoot, p, 'package.json')
  if (!existsSync(pj)) continue
  const j = JSON.parse(readFileSync(pj, 'utf8')) as { name: string; exports?: Record<string, string> }
  if (!j.exports || typeof j.exports !== 'object') continue
  for (const [k, v] of Object.entries(j.exports)) {
    if (typeof v !== 'string') continue
    alias.push({ find: j.name + (k === '.' ? '' : k.slice(1)), replacement: resolve(pkgRoot, p, v) })
  }
}
alias.sort((a, b) => b.find.length - a.find.length)
export default mergeConfig(base, defineConfig({ resolve: { alias } }))
