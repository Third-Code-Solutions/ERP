import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { cortexAssistantProviderAttempts } from '../schema'

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../../supabase/migrations/20260808120000_cortex_assistant_provider_protocol.sql'
  ),
  'utf8'
).toLowerCase()

describe('Cortex assistant provider protocol migration', () => {
  it('adds bounded versioned dispatch and opaque response evidence', () => {
    for (const column of [
      'protocol_version smallint',
      'dispatch_key char(64)',
      'request_fingerprint char(64)',
      'provider_request_id_hash char(64)',
      'response_fingerprint char(64)',
    ]) {
      expect(migration).toContain(`add column ${column}`)
    }
    expect(migration).toContain(
      'cortex_asst_provider_attempts_protocol_hashes_hex'
    )
    expect(migration).toContain(
      "protocol_version is null or protocol_version = 1"
    )
  })

  it('retains legacy null attempts while requiring complete protocol-v1 evidence', () => {
    expect(migration).toMatch(
      /status = 'dispatched'[\s\S]*protocol_version is null[\s\S]*protocol_version = 1/
    )
    expect(migration).toMatch(
      /outcome_code = 'provider_succeeded'[\s\S]*provider_request_id_hash is not null[\s\S]*response_fingerprint is not null/
    )
    expect(migration).toMatch(
      /outcome_code <> 'provider_succeeded'[\s\S]*provider_request_id_hash is null[\s\S]*response_fingerprint is null/
    )
  })

  it('freezes dispatch identity and binds completion to its exact response', () => {
    expect(migration).toContain('provider dispatch authority is immutable')
    expect(migration).toContain(
      'attempt.response_fingerprint = new.completion_hash'
    )
    expect(migration).toContain(
      'create or replace function public.enforce_cortex_asst_provider_completion_link()'
    )
  })

  it('aligns the Drizzle protocol columns', () => {
    const attempts = getTableConfig(cortexAssistantProviderAttempts)
    expect(attempts.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        'protocol_version',
        'dispatch_key',
        'request_fingerprint',
        'provider_request_id_hash',
        'response_fingerprint',
      ])
    )
  })
})
