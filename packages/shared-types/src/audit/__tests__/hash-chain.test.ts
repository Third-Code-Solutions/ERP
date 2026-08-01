import { describe, it, expect } from 'vitest'
import {
  computeDatabaseAuditHash,
  computeHash,
  verifyHashChain,
  computeDiff,
} from '../hash-chain'

describe('computeDatabaseAuditHash', () => {
  it('matches the database trigger formula and timestamp rendering', async () => {
    const hash = await computeDatabaseAuditHash('genesis', {
      entity_type: 'projects',
      entity_id: 'abc123',
      action: 'create',
      created_at: new Date('2026-08-01T10:06:26.123Z'),
    })
    expect(hash).toBe(
      'bc788cdf7019ea71cbfcb48a566c583314c46c8d89af3dd45208f74108b49e7e'
    )
  })
})

describe('computeHash', () => {
  it('returns a 64-character hex string', async () => {
    const hash = await computeHash('genesis', {
      entity_type: 'projects',
      entity_id: 'abc123',
      action: 'create',
    })
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('produces different hashes for different inputs', async () => {
    const h1 = await computeHash('genesis', { action: 'create' })
    const h2 = await computeHash('genesis', { action: 'update' })
    expect(h1).not.toBe(h2)
  })

  it('produces different hashes for different prevHash values', async () => {
    const input = { entity_type: 'projects', entity_id: 'abc', action: 'create' }
    const h1 = await computeHash('genesis', input)
    const h2 = await computeHash('someprevhash', input)
    expect(h1).not.toBe(h2)
  })

  it('is deterministic for same inputs', async () => {
    const input = { entity_type: 'boms', entity_id: 'def456', action: 'approve', diff: null }
    const h1 = await computeHash('abc123', input)
    const h2 = await computeHash('abc123', input)
    expect(h1).toBe(h2)
  })
})

describe('verifyHashChain', () => {
  async function buildChain(count: number) {
    const entries = []
    let prevHash = 'genesis'

    for (let i = 1; i <= count; i++) {
      const createdAt = new Date(Date.now() + i * 1000)
      const rowContent = {
        entity_type: 'projects',
        entity_id: `proj-${i}`,
        action: 'create',
        diff: null,
        created_at: createdAt.toISOString(),
      }
      const hash = await computeDatabaseAuditHash(prevHash, {
        entity_type: rowContent.entity_type,
        entity_id: rowContent.entity_id,
        action: rowContent.action,
        created_at: createdAt,
      })
      entries.push({
        id: i,
        prev_hash: prevHash,
        hash,
        entity_type: 'projects',
        entity_id: `proj-${i}`,
        action: 'create',
        diff: null,
        created_at: createdAt,
      })
      prevHash = hash
    }

    return entries
  }

  it('validates an empty chain', async () => {
    const result = await verifyHashChain([])
    expect(result.valid).toBe(true)
    expect(result.checkedCount).toBe(0)
  })

  it('validates a single-entry chain', async () => {
    const [entry] = await buildChain(1)
    const result = await verifyHashChain([entry!])
    expect(result.valid).toBe(true)
    expect(result.checkedCount).toBe(1)
  })

  it('validates a multi-entry chain', async () => {
    const entries = await buildChain(5)
    const result = await verifyHashChain(entries)
    expect(result.valid).toBe(true)
    expect(result.checkedCount).toBe(5)
  })

  it('validates chain in shuffled order', async () => {
    const entries = await buildChain(4)
    const shuffled = [...entries].reverse()
    const result = await verifyHashChain(shuffled)
    expect(result.valid).toBe(true)
  })

  it('detects a tampered hash', async () => {
    const entries = await buildChain(3)
    // Tamper with entry 2's hash
    const tampered = entries.map((e) =>
      e.id === 2 ? { ...e, hash: 'deadbeef'.repeat(8) } : e
    )
    const result = await verifyHashChain(tampered)
    expect(result.valid).toBe(false)
    expect(result.firstInvalidId).toBeDefined()
  })

  it('detects a broken prev_hash link', async () => {
    const entries = await buildChain(3)
    // Break entry 2's prev_hash
    const tampered = entries.map((e) =>
      e.id === 2 ? { ...e, prev_hash: 'wronghash' } : e
    )
    const result = await verifyHashChain(tampered)
    expect(result.valid).toBe(false)
  })
})

describe('computeDiff', () => {
  it('detects changed fields', () => {
    const before = { stage: 'scoping', tcv_cents: 1000000 }
    const after = { stage: 'bom_submission', tcv_cents: 1000000 }
    const diff = computeDiff(before, after)
    expect(diff).toHaveProperty('stage')
    expect(diff['stage']?.before).toBe('scoping')
    expect(diff['stage']?.after).toBe('bom_submission')
    expect(diff).not.toHaveProperty('tcv_cents')
  })

  it('detects added fields', () => {
    const before = { name: 'Project X' }
    const after = { name: 'Project X', status: 'active' }
    const diff = computeDiff(before, after)
    expect(diff).toHaveProperty('status')
    expect(diff['status']?.before).toBeUndefined()
    expect(diff['status']?.after).toBe('active')
  })

  it('detects removed fields', () => {
    const before = { name: 'Project X', notes: 'Old notes' }
    const after = { name: 'Project X' }
    const diff = computeDiff(before, after)
    expect(diff).toHaveProperty('notes')
    expect(diff['notes']?.after).toBeUndefined()
  })

  it('returns empty diff for identical objects', () => {
    const obj = { stage: 'scoping', tcv_cents: 5000000 }
    expect(computeDiff(obj, { ...obj })).toEqual({})
  })

  it('handles nested objects by JSON comparison', () => {
    const before = { meta: { x: 1 } }
    const after = { meta: { x: 2 } }
    const diff = computeDiff(before, after)
    expect(diff).toHaveProperty('meta')
  })

  it('treats identical nested objects as no change', () => {
    const before = { meta: { x: 1 } }
    const after = { meta: { x: 1 } }
    expect(computeDiff(before, after)).toEqual({})
  })
})
