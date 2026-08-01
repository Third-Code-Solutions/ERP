import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const directory = dirname(fileURLToPath(import.meta.url))
const runtimeSourceRoot = resolve(directory, '..')
const runtimePublicRoot = resolve(directory, '../../public')
const runtimeRoots = [runtimeSourceRoot, runtimePublicRoot]
const textExtensions = new Set([
  '.css',
  '.html',
  '.json',
  '.js',
  '.jsx',
  '.md',
  '.svg',
  '.ts',
  '.tsx',
  '.txt',
])

function collectTextFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name)
    if (entry.isDirectory()) return collectTextFiles(path)
    return textExtensions.has(path.slice(path.lastIndexOf('.')).toLowerCase())
      ? [path]
      : []
  })
}

describe('Third Code ERP clean-room runtime branding', () => {
  it('contains no legacy vendor markers in runtime text', () => {
    const files = runtimeRoots.flatMap(collectTextFiles)
    const source = files
      .map((file) => readFileSync(file, 'utf8').toLowerCase())
      .join('\n')
    const forbiddenMarkers = [
      'erp' + 'next',
      'frap' + 'pe',
      'abi' + ' ops',
      'abi' + '_ops',
    ]

    for (const marker of forbiddenMarkers) {
      expect(source).not.toContain(marker)
    }

    expect(files.length).toBeGreaterThan(0)
    expect(statSync(runtimeSourceRoot).isDirectory()).toBe(true)
  })
})
