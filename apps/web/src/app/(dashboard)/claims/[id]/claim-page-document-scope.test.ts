import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('claim attachment display scope', () => {
  it('keeps historical attachment rows while tenant-scoping document metadata', () => {
    const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8')

    expect(source).toContain('.leftJoin(')
    expect(source).toContain('eq(documents.tenant_id, profile.tenantId)')
    expect(source).toContain("d.file_name ?? 'Document unavailable'")
    expect(source).not.toContain(
      '.innerJoin(documents, eq(documents.id, progressClaimDocuments.document_id))',
    )
  })
})
