import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const directory = dirname(fileURLToPath(import.meta.url))
const runtimeSourceRoot = resolve(directory, '..')
const runtimePublicRoot = resolve(directory, '../../public')
// Keep this scan product-focused: research notes and migration provenance may
// mention competitors, but shipped web/API/package text must not inherit their
// branding or repository identifiers.
const runtimeApiRoot = resolve(directory, '../../../api/src')
const runtimePackagesRoot = resolve(directory, '../../../../packages')
const runtimeRoots = [
  runtimeSourceRoot,
  runtimePublicRoot,
  runtimeApiRoot,
  runtimePackagesRoot,
]
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
    const sources = files.map((file) => ({
      file,
      text: readFileSync(file, 'utf8').toLowerCase(),
    }))
    const forbiddenMarkers = [
      'erp' + 'next',
      'frap' + 'pe',
      'abi' + ' ops',
      'abi' + '_ops',
      'abi' + '-ops',
      'frap' + 'pe' + '/' + 'erp' + 'next',
      'rework' + '.com',
    ]

    for (const marker of forbiddenMarkers) {
      const offenders = sources
        .filter(({ text }) => text.includes(marker))
        .map(({ file }) => file)
      expect(offenders, `legacy marker: ${marker}`).toEqual([])
    }

    expect(files.length).toBeGreaterThan(0)
    expect(statSync(runtimeSourceRoot).isDirectory()).toBe(true)
  })
})
