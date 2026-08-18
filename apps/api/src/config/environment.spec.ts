import { describe, expect, it } from 'vitest'
import { validateEnvironment } from './environment'

const REQUIRED = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/erp',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'a'.repeat(20),
  REDIS_URL: 'redis://localhost:6379',
}

describe('ERP API environment', () => {
  it('keeps project comment creation disabled and tenant-scoped by default', () => {
    const defaults = validateEnvironment(REQUIRED)
    expect(defaults.ERP_PROJECT_COMMENT_CREATE_WRITES_ENABLED).toBe(false)
    expect(defaults.ERP_PROJECT_COMMENT_CREATE_WRITES_TENANT_IDS).toEqual([])

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_PROJECT_COMMENT_CREATE_WRITES_ENABLED: 'true',
        ERP_PROJECT_COMMENT_CREATE_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_PROJECT_COMMENT_CREATE_WRITES_ENABLED: true,
      ERP_PROJECT_COMMENT_CREATE_WRITES_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_PROJECT_COMMENT_CREATE_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_PROJECT_COMMENT_CREATE_WRITES_TENANT_IDS')
  })

  it('keeps project comment deletion disabled and tenant-scoped by default', () => {
    const defaults = validateEnvironment(REQUIRED)
    expect(defaults.ERP_PROJECT_COMMENT_DELETE_WRITES_ENABLED).toBe(false)
    expect(defaults.ERP_PROJECT_COMMENT_DELETE_WRITES_TENANT_IDS).toEqual([])

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_PROJECT_COMMENT_DELETE_WRITES_ENABLED: 'true',
        ERP_PROJECT_COMMENT_DELETE_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_PROJECT_COMMENT_DELETE_WRITES_ENABLED: true,
      ERP_PROJECT_COMMENT_DELETE_WRITES_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_PROJECT_COMMENT_DELETE_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_PROJECT_COMMENT_DELETE_WRITES_TENANT_IDS')
  })

  it('keeps user role assignment disabled and tenant-scoped by default', () => {
    const defaults = validateEnvironment(REQUIRED)
    expect(
      defaults.ERP_ADMIN_USER_ROLE_ASSIGNMENT_WRITES_ENABLED
    ).toBe(false)
    expect(
      defaults.ERP_ADMIN_USER_ROLE_ASSIGNMENT_WRITES_TENANT_IDS
    ).toEqual([])

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_ADMIN_USER_ROLE_ASSIGNMENT_WRITES_ENABLED: 'true',
        ERP_ADMIN_USER_ROLE_ASSIGNMENT_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_ADMIN_USER_ROLE_ASSIGNMENT_WRITES_ENABLED: true,
      ERP_ADMIN_USER_ROLE_ASSIGNMENT_WRITES_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_ADMIN_USER_ROLE_ASSIGNMENT_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_ADMIN_USER_ROLE_ASSIGNMENT_WRITES_TENANT_IDS')
  })
  it('keeps finance ledger reads disabled and tenant-scoped by default', () => {
    expect(
      validateEnvironment(REQUIRED).ERP_FINANCE_LEDGER_READS_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED).ERP_FINANCE_LEDGER_READS_TENANT_IDS
    ).toEqual([])

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_LEDGER_READS_ENABLED: 'true',
        ERP_FINANCE_LEDGER_READS_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_FINANCE_LEDGER_READS_ENABLED: true,
      ERP_FINANCE_LEDGER_READS_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_LEDGER_READS_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_FINANCE_LEDGER_READS_TENANT_IDS')
  })

  it('keeps asset register reads disabled and tenant-scoped by default', () => {
    expect(validateEnvironment(REQUIRED).ERP_ASSET_READS_ENABLED).toBe(false)
    expect(validateEnvironment(REQUIRED).ERP_ASSET_READS_TENANT_IDS).toEqual([])

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_ASSET_READS_ENABLED: 'true',
        ERP_ASSET_READS_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_ASSET_READS_ENABLED: true,
      ERP_ASSET_READS_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_ASSET_READS_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_ASSET_READS_TENANT_IDS')
  })

  it('keeps asset maintenance reads and writes disabled and tenant-scoped by default', () => {
    const defaults = validateEnvironment(REQUIRED)
    expect(defaults.ERP_ASSET_MAINTENANCE_READS_ENABLED).toBe(false)
    expect(defaults.ERP_ASSET_MAINTENANCE_READS_TENANT_IDS).toEqual([])
    expect(defaults.ERP_ASSET_MAINTENANCE_CREATE_WRITES_ENABLED).toBe(false)
    expect(defaults.ERP_ASSET_MAINTENANCE_CREATE_WRITES_TENANT_IDS).toEqual([])

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_ASSET_MAINTENANCE_READS_ENABLED: 'true',
        ERP_ASSET_MAINTENANCE_READS_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
        ERP_ASSET_MAINTENANCE_CREATE_WRITES_ENABLED: 'true',
        ERP_ASSET_MAINTENANCE_CREATE_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_ASSET_MAINTENANCE_READS_ENABLED: true,
      ERP_ASSET_MAINTENANCE_READS_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
      ERP_ASSET_MAINTENANCE_CREATE_WRITES_ENABLED: true,
      ERP_ASSET_MAINTENANCE_CREATE_WRITES_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_ASSET_MAINTENANCE_READS_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_ASSET_MAINTENANCE_READS_TENANT_IDS')
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_ASSET_MAINTENANCE_CREATE_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_ASSET_MAINTENANCE_CREATE_WRITES_TENANT_IDS')
  })

  it('keeps customer receivables reads disabled and tenant-scoped by default', () => {
    expect(
      validateEnvironment(REQUIRED).ERP_FINANCE_RECEIVABLES_READS_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED).ERP_FINANCE_RECEIVABLES_READS_TENANT_IDS
    ).toEqual([])

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_RECEIVABLES_READS_ENABLED: 'true',
        ERP_FINANCE_RECEIVABLES_READS_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_FINANCE_RECEIVABLES_READS_ENABLED: true,
      ERP_FINANCE_RECEIVABLES_READS_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_RECEIVABLES_READS_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_FINANCE_RECEIVABLES_READS_TENANT_IDS')
  })

  it('keeps supplier payables reads disabled and tenant-scoped by default', () => {
    expect(validateEnvironment(REQUIRED).ERP_FINANCE_PAYABLES_READS_ENABLED).toBe(false)
    expect(validateEnvironment(REQUIRED).ERP_FINANCE_PAYABLES_READS_TENANT_IDS).toEqual([])

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_PAYABLES_READS_ENABLED: 'true',
        ERP_FINANCE_PAYABLES_READS_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_FINANCE_PAYABLES_READS_ENABLED: true,
      ERP_FINANCE_PAYABLES_READS_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_PAYABLES_READS_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_FINANCE_PAYABLES_READS_TENANT_IDS')
  })

  it('keeps cash register reads disabled and tenant-scoped by default', () => {
    expect(validateEnvironment(REQUIRED).ERP_FINANCE_CASH_READS_ENABLED).toBe(false)
    expect(validateEnvironment(REQUIRED).ERP_FINANCE_CASH_READS_TENANT_IDS).toEqual([])

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_CASH_READS_ENABLED: 'true',
        ERP_FINANCE_CASH_READS_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_FINANCE_CASH_READS_ENABLED: true,
      ERP_FINANCE_CASH_READS_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_CASH_READS_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_FINANCE_CASH_READS_TENANT_IDS')
  })

  it('keeps Cortex search disabled and tenant-scoped by default', () => {
    expect(validateEnvironment(REQUIRED).ERP_CORTEX_SEARCH_ENABLED).toBe(false)
    expect(validateEnvironment(REQUIRED).ERP_CORTEX_SEARCH_TENANT_IDS).toEqual([])

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_CORTEX_SEARCH_ENABLED: 'true',
        ERP_CORTEX_SEARCH_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_CORTEX_SEARCH_ENABLED: true,
      ERP_CORTEX_SEARCH_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_CORTEX_SEARCH_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_CORTEX_SEARCH_TENANT_IDS')
  })

  it('keeps universal search reads disabled and tenant-scoped by default', () => {
    expect(
      validateEnvironment(REQUIRED).ERP_UNIVERSAL_SEARCH_READS_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED).ERP_UNIVERSAL_SEARCH_READS_TENANT_IDS
    ).toEqual([])

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_UNIVERSAL_SEARCH_READS_ENABLED: 'true',
        ERP_UNIVERSAL_SEARCH_READS_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_UNIVERSAL_SEARCH_READS_ENABLED: true,
      ERP_UNIVERSAL_SEARCH_READS_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_UNIVERSAL_SEARCH_READS_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_UNIVERSAL_SEARCH_READS_TENANT_IDS')
  })

  it('keeps Cortex brief reads disabled and tenant-scoped by default', () => {
    expect(validateEnvironment(REQUIRED).ERP_CORTEX_BRIEF_READS_ENABLED).toBe(
      false
    )
    expect(
      validateEnvironment(REQUIRED).ERP_CORTEX_BRIEF_READS_TENANT_IDS
    ).toEqual([])

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_CORTEX_BRIEF_READS_ENABLED: 'true',
        ERP_CORTEX_BRIEF_READS_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_CORTEX_BRIEF_READS_ENABLED: true,
      ERP_CORTEX_BRIEF_READS_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_CORTEX_BRIEF_READS_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_CORTEX_BRIEF_READS_TENANT_IDS')
  })

  it('keeps Cortex chat retrieval reads disabled and tenant-scoped by default', () => {
    expect(
      validateEnvironment(REQUIRED).ERP_CORTEX_CHAT_RETRIEVAL_READS_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED).ERP_CORTEX_CHAT_RETRIEVAL_READS_TENANT_IDS
    ).toEqual([])

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_CORTEX_CHAT_RETRIEVAL_READS_ENABLED: 'true',
        ERP_CORTEX_CHAT_RETRIEVAL_READS_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_CORTEX_CHAT_RETRIEVAL_READS_ENABLED: true,
      ERP_CORTEX_CHAT_RETRIEVAL_READS_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_CORTEX_CHAT_RETRIEVAL_READS_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_CORTEX_CHAT_RETRIEVAL_READS_TENANT_IDS')
  })

  it('keeps Cortex conversation context reads disabled and tenant-scoped by default', () => {
    expect(
      validateEnvironment(REQUIRED).ERP_CORTEX_CONVERSATION_CONTEXT_READS_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED).ERP_CORTEX_CONVERSATION_CONTEXT_READS_TENANT_IDS
    ).toEqual([])

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_CORTEX_CONVERSATION_CONTEXT_READS_ENABLED: 'true',
        ERP_CORTEX_CONVERSATION_CONTEXT_READS_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_CORTEX_CONVERSATION_CONTEXT_READS_ENABLED: true,
      ERP_CORTEX_CONVERSATION_CONTEXT_READS_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_CORTEX_CONVERSATION_CONTEXT_READS_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_CORTEX_CONVERSATION_CONTEXT_READS_TENANT_IDS')
  })

  it('keeps Cortex graph reads disabled and tenant-scoped by default', () => {
    expect(validateEnvironment(REQUIRED).ERP_CORTEX_GRAPH_READS_ENABLED).toBe(
      false
    )
    expect(
      validateEnvironment(REQUIRED).ERP_CORTEX_GRAPH_READS_TENANT_IDS
    ).toEqual([])

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_CORTEX_GRAPH_READS_ENABLED: 'true',
        ERP_CORTEX_GRAPH_READS_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_CORTEX_GRAPH_READS_ENABLED: true,
      ERP_CORTEX_GRAPH_READS_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_CORTEX_GRAPH_READS_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_CORTEX_GRAPH_READS_TENANT_IDS')
  })

  it('keeps Cortex entity reads disabled and tenant-scoped by default', () => {
    expect(validateEnvironment(REQUIRED).ERP_CORTEX_ENTITY_READS_ENABLED).toBe(
      false
    )
    expect(
      validateEnvironment(REQUIRED).ERP_CORTEX_ENTITY_READS_TENANT_IDS
    ).toEqual([])

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_CORTEX_ENTITY_READS_ENABLED: 'true',
        ERP_CORTEX_ENTITY_READS_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_CORTEX_ENTITY_READS_ENABLED: true,
      ERP_CORTEX_ENTITY_READS_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_CORTEX_ENTITY_READS_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_CORTEX_ENTITY_READS_TENANT_IDS')
  })

  it('keeps Cortex conversation reads disabled and tenant-scoped by default', () => {
    expect(
      validateEnvironment(REQUIRED).ERP_CORTEX_CONVERSATION_READS_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED).ERP_CORTEX_CONVERSATION_READS_TENANT_IDS
    ).toEqual([])

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_CORTEX_CONVERSATION_READS_ENABLED: 'true',
        ERP_CORTEX_CONVERSATION_READS_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_CORTEX_CONVERSATION_READS_ENABLED: true,
      ERP_CORTEX_CONVERSATION_READS_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_CORTEX_CONVERSATION_READS_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_CORTEX_CONVERSATION_READS_TENANT_IDS')
  })

  it('keeps Cortex user-turn writes disabled and tenant-scoped by default', () => {
    const defaults = validateEnvironment(REQUIRED)
    expect(
      defaults.ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_ENABLED
    ).toBe(false)
    expect(
      defaults.ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_TENANT_IDS
    ).toEqual([])

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_ENABLED: 'true',
        ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_ENABLED: true,
      ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_TENANT_IDS')
  })

  it('keeps signed assistant-turn writes disabled and tenant-scoped by default', () => {
    const defaults = validateEnvironment(REQUIRED)
    expect(
      defaults.ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_ENABLED
    ).toBe(false)
    expect(
      defaults.ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_TENANT_IDS
    ).toEqual([])
    expect(defaults.ERP_CORTEX_ASSISTANT_TURN_HMAC_SECRET).toBeUndefined()

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_ENABLED: 'true',
        ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
        ERP_CORTEX_ASSISTANT_TURN_HMAC_SECRET: 's'.repeat(32),
      })
    ).toMatchObject({
      ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_ENABLED: true,
      ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
      ERP_CORTEX_ASSISTANT_TURN_HMAC_SECRET: 's'.repeat(32),
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_TENANT_IDS:
          'not-a-tenant',
      })
    ).toThrow('ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_TENANT_IDS')
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_CORTEX_ASSISTANT_TURN_HMAC_SECRET: 'short',
      })
    ).toThrow('ERP_CORTEX_ASSISTANT_TURN_HMAC_SECRET')
  })

  it('keeps every semantic index spend gate disabled and UUID-scoped', () => {
    const defaults = validateEnvironment(REQUIRED)
    expect(defaults.ERP_CORTEX_SEMANTIC_INDEX_JOBS_ENABLED).toBe(false)
    expect(defaults.ERP_CORTEX_SEMANTIC_INDEX_JOBS_TENANT_IDS).toEqual([])
    expect(defaults.ERP_CORTEX_SEMANTIC_INDEX_WORKER_ENABLED).toBe(false)
    expect(defaults.ERP_CORTEX_SEMANTIC_INDEX_WORKER_TENANT_IDS).toEqual([])
    expect(defaults.ERP_CORTEX_SEMANTIC_INDEX_RECOVERY_ENABLED).toBe(false)
    expect(defaults.ERP_CORTEX_SEMANTIC_INDEX_RECOVERY_TENANT_IDS).toEqual([])
    expect(defaults.AI_WORKER_TIMEOUT_MS).toBe(15_000)

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_CORTEX_SEMANTIC_INDEX_JOBS_ENABLED: 'true',
        ERP_CORTEX_SEMANTIC_INDEX_JOBS_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
        ERP_CORTEX_SEMANTIC_INDEX_WORKER_ENABLED: 'true',
        ERP_CORTEX_SEMANTIC_INDEX_WORKER_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
        ERP_CORTEX_SEMANTIC_INDEX_RECOVERY_ENABLED: 'true',
        ERP_CORTEX_SEMANTIC_INDEX_RECOVERY_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
        AI_WORKER_URL: 'https://ai-worker.example.test',
        AI_WORKER_SHARED_SECRET: 'x'.repeat(20),
        AI_WORKER_TIMEOUT_MS: '30000',
      })
    ).toMatchObject({
      ERP_CORTEX_SEMANTIC_INDEX_JOBS_ENABLED: true,
      ERP_CORTEX_SEMANTIC_INDEX_WORKER_ENABLED: true,
      ERP_CORTEX_SEMANTIC_INDEX_RECOVERY_ENABLED: true,
      AI_WORKER_TIMEOUT_MS: 30_000,
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_CORTEX_SEMANTIC_INDEX_WORKER_TENANT_IDS: '*',
      })
    ).toThrow('ERP_CORTEX_SEMANTIC_INDEX_WORKER_TENANT_IDS')
  })

  it('keeps provider-free assistant generation jobs closed and UUID-scoped', () => {
    const defaults = validateEnvironment(REQUIRED)
    expect(defaults.ERP_CORTEX_ASSISTANT_GENERATION_JOBS_ENABLED).toBe(false)
    expect(defaults.ERP_CORTEX_ASSISTANT_GENERATION_JOBS_TENANT_IDS).toEqual([])
    expect(defaults.ERP_CORTEX_ASSISTANT_GENERATION_WORKER_ENABLED).toBe(false)
    expect(defaults.ERP_CORTEX_ASSISTANT_GENERATION_WORKER_TENANT_IDS).toEqual(
      []
    )
    expect(defaults.ERP_CORTEX_ASSISTANT_GENERATION_RECOVERY_ENABLED).toBe(
      false
    )
    expect(
      defaults.ERP_CORTEX_ASSISTANT_GENERATION_RECOVERY_TENANT_IDS
    ).toEqual([])

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_CORTEX_ASSISTANT_GENERATION_JOBS_ENABLED: 'true',
        ERP_CORTEX_ASSISTANT_GENERATION_JOBS_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
        ERP_CORTEX_ASSISTANT_GENERATION_WORKER_ENABLED: 'true',
        ERP_CORTEX_ASSISTANT_GENERATION_WORKER_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
        ERP_CORTEX_ASSISTANT_GENERATION_RECOVERY_ENABLED: 'true',
        ERP_CORTEX_ASSISTANT_GENERATION_RECOVERY_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_CORTEX_ASSISTANT_GENERATION_JOBS_ENABLED: true,
      ERP_CORTEX_ASSISTANT_GENERATION_WORKER_ENABLED: true,
      ERP_CORTEX_ASSISTANT_GENERATION_RECOVERY_ENABLED: true,
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_CORTEX_ASSISTANT_GENERATION_WORKER_TENANT_IDS: '*',
      })
    ).toThrow('ERP_CORTEX_ASSISTANT_GENERATION_WORKER_TENANT_IDS')
  })

  it('keeps assistant provider budget reservation closed and UUID-scoped', () => {
    const defaults = validateEnvironment(REQUIRED)
    expect(defaults.ERP_CORTEX_ASSISTANT_PROVIDER_BUDGET_ENABLED).toBe(false)
    expect(defaults.ERP_CORTEX_ASSISTANT_PROVIDER_BUDGET_TENANT_IDS).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_CORTEX_ASSISTANT_PROVIDER_BUDGET_ENABLED: 'true',
        ERP_CORTEX_ASSISTANT_PROVIDER_BUDGET_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_CORTEX_ASSISTANT_PROVIDER_BUDGET_ENABLED: true,
      ERP_CORTEX_ASSISTANT_PROVIDER_BUDGET_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_CORTEX_ASSISTANT_PROVIDER_BUDGET_TENANT_IDS: '*',
      })
    ).toThrow('ERP_CORTEX_ASSISTANT_PROVIDER_BUDGET_TENANT_IDS')
  })

  it('keeps assistant provider execution independently closed and UUID-scoped', () => {
    const defaults = validateEnvironment(REQUIRED)
    expect(defaults.ERP_CORTEX_ASSISTANT_PROVIDER_EXECUTION_ENABLED).toBe(false)
    expect(defaults.ERP_CORTEX_ASSISTANT_PROVIDER_EXECUTION_TENANT_IDS).toEqual(
      []
    )
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_CORTEX_ASSISTANT_PROVIDER_EXECUTION_ENABLED: 'true',
        ERP_CORTEX_ASSISTANT_PROVIDER_EXECUTION_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_CORTEX_ASSISTANT_PROVIDER_EXECUTION_ENABLED: true,
      ERP_CORTEX_ASSISTANT_PROVIDER_EXECUTION_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_CORTEX_ASSISTANT_PROVIDER_EXECUTION_TENANT_IDS: '*',
      })
    ).toThrow('ERP_CORTEX_ASSISTANT_PROVIDER_EXECUTION_TENANT_IDS')
  })

  it('keeps provider circuit alert routing closed and UUID-scoped', () => {
    const defaults = validateEnvironment(REQUIRED)
    expect(
      defaults.ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ROUTING_ENABLED
    ).toBe(false)
    expect(
      defaults.ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ROUTING_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ROUTING_ENABLED: 'true',
        ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ROUTING_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ROUTING_ENABLED: true,
      ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ROUTING_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ROUTING_TENANT_IDS: '*',
      })
    ).toThrow(
      'ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ROUTING_TENANT_IDS'
    )
  })

  it('keeps provider circuit alert queue, worker, and recovery gates closed', () => {
    const defaults = validateEnvironment(REQUIRED)
    expect(
      defaults.ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_JOBS_ENABLED
    ).toBe(false)
    expect(
      defaults.ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_JOBS_TENANT_IDS
    ).toEqual([])
    expect(
      defaults.ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_WORKER_ENABLED
    ).toBe(false)
    expect(
      defaults.ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_WORKER_TENANT_IDS
    ).toEqual([])
    expect(
      defaults.ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_ENABLED
    ).toBe(false)
    expect(
      defaults.ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_TENANT_IDS
    ).toEqual([])

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_JOBS_ENABLED: 'true',
        ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_JOBS_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
        ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_WORKER_ENABLED: 'true',
        ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_WORKER_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
        ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_ENABLED: 'true',
        ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_JOBS_ENABLED: true,
      ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_WORKER_ENABLED: true,
      ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_ENABLED: true,
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_TENANT_IDS: '*',
      })
    ).toThrow(
      'ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_TENANT_IDS'
    )
  })

  it('keeps notification recovery polling disabled by default', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_NOTIFICATION_SWEEP_ENABLED
    ).toBe(false)
  })

  it('requires the exact true value to enable recovery polling', () => {
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_NOTIFICATION_SWEEP_ENABLED: 'true',
      }).ERP_NOTIFICATION_SWEEP_ENABLED
    ).toBe(true)
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_NOTIFICATION_SWEEP_ENABLED: '1',
      })
    ).toThrow('ERP_NOTIFICATION_SWEEP_ENABLED')
  })

  it('keeps purchase-order command writes disabled by default', () => {
    expect(
      validateEnvironment(REQUIRED).ERP_PO_CREATE_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED).ERP_PO_CREATE_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_PO_CREATE_WRITES_ENABLED: 'true',
        ERP_PO_CREATE_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      }).ERP_PO_CREATE_WRITES_ENABLED
    ).toBe(true)
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_PO_CREATE_WRITES_ENABLED: 'true',
        ERP_PO_CREATE_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222, 33333333-3333-4333-8333-333333333333',
      }).ERP_PO_CREATE_WRITES_TENANT_IDS
    ).toEqual([
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ])
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_PO_CREATE_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_PO_CREATE_WRITES_TENANT_IDS')
  })

  it('keeps project creation authority disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED).ERP_PROJECT_CREATE_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED).ERP_PROJECT_CREATE_WRITES_TENANT_IDS
    ).toEqual([])

    const enabled = validateEnvironment({
      ...REQUIRED,
      ERP_PROJECT_CREATE_WRITES_ENABLED: 'true',
      ERP_PROJECT_CREATE_WRITES_TENANT_IDS:
        '22222222-2222-4222-8222-222222222222',
    })
    expect(enabled.ERP_PROJECT_CREATE_WRITES_ENABLED).toBe(true)
    expect(enabled.ERP_PROJECT_CREATE_WRITES_TENANT_IDS).toEqual([
      '22222222-2222-4222-8222-222222222222',
    ])
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_PROJECT_CREATE_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_PROJECT_CREATE_WRITES_TENANT_IDS')
  })

  it('keeps cost entry authority disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED).ERP_COST_ENTRY_CREATE_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED).ERP_COST_ENTRY_CREATE_WRITES_TENANT_IDS
    ).toEqual([])

    const enabled = validateEnvironment({
      ...REQUIRED,
      ERP_COST_ENTRY_CREATE_WRITES_ENABLED: 'true',
      ERP_COST_ENTRY_CREATE_WRITES_TENANT_IDS:
        '22222222-2222-4222-8222-222222222222',
    })
    expect(enabled.ERP_COST_ENTRY_CREATE_WRITES_ENABLED).toBe(true)
    expect(enabled.ERP_COST_ENTRY_CREATE_WRITES_TENANT_IDS).toEqual([
      '22222222-2222-4222-8222-222222222222',
    ])
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_COST_ENTRY_CREATE_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_COST_ENTRY_CREATE_WRITES_TENANT_IDS')
  })

  it('keeps cost entry deletion disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED).ERP_COST_ENTRY_DELETE_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED).ERP_COST_ENTRY_DELETE_WRITES_TENANT_IDS
    ).toEqual([])

    const enabled = validateEnvironment({
      ...REQUIRED,
      ERP_COST_ENTRY_DELETE_WRITES_ENABLED: 'true',
      ERP_COST_ENTRY_DELETE_WRITES_TENANT_IDS:
        '22222222-2222-4222-8222-222222222222',
    })
    expect(enabled.ERP_COST_ENTRY_DELETE_WRITES_ENABLED).toBe(true)
    expect(enabled.ERP_COST_ENTRY_DELETE_WRITES_TENANT_IDS).toEqual([
      '22222222-2222-4222-8222-222222222222',
    ])
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_COST_ENTRY_DELETE_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_COST_ENTRY_DELETE_WRITES_TENANT_IDS')
  })

  it('keeps cost entry restoration disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED).ERP_COST_ENTRY_RESTORE_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED).ERP_COST_ENTRY_RESTORE_WRITES_TENANT_IDS
    ).toEqual([])

    const enabled = validateEnvironment({
      ...REQUIRED,
      ERP_COST_ENTRY_RESTORE_WRITES_ENABLED: 'true',
      ERP_COST_ENTRY_RESTORE_WRITES_TENANT_IDS:
        '22222222-2222-4222-8222-222222222222',
    })
    expect(enabled.ERP_COST_ENTRY_RESTORE_WRITES_ENABLED).toBe(true)
    expect(enabled.ERP_COST_ENTRY_RESTORE_WRITES_TENANT_IDS).toEqual([
      '22222222-2222-4222-8222-222222222222',
    ])
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_COST_ENTRY_RESTORE_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_COST_ENTRY_RESTORE_WRITES_TENANT_IDS')
  })

  it('keeps Won-to-Project handoff authority disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED).ERP_OPPORTUNITY_CONVERT_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED).ERP_OPPORTUNITY_CONVERT_WRITES_TENANT_IDS
    ).toEqual([])

    const enabled = validateEnvironment({
      ...REQUIRED,
      ERP_OPPORTUNITY_CONVERT_WRITES_ENABLED: 'true',
      ERP_OPPORTUNITY_CONVERT_WRITES_TENANT_IDS:
        '22222222-2222-4222-8222-222222222222',
    })
    expect(enabled.ERP_OPPORTUNITY_CONVERT_WRITES_ENABLED).toBe(true)
    expect(enabled.ERP_OPPORTUNITY_CONVERT_WRITES_TENANT_IDS).toEqual([
      '22222222-2222-4222-8222-222222222222',
    ])
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_OPPORTUNITY_CONVERT_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_OPPORTUNITY_CONVERT_WRITES_TENANT_IDS')
  })

  it('keeps opportunity stage transition authority disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED).ERP_OPPORTUNITY_STAGE_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED).ERP_OPPORTUNITY_STAGE_WRITES_TENANT_IDS
    ).toEqual([])

    const enabled = validateEnvironment({
      ...REQUIRED,
      ERP_OPPORTUNITY_STAGE_WRITES_ENABLED: 'true',
      ERP_OPPORTUNITY_STAGE_WRITES_TENANT_IDS:
        '22222222-2222-4222-8222-222222222222',
    })
    expect(enabled.ERP_OPPORTUNITY_STAGE_WRITES_ENABLED).toBe(true)
    expect(enabled.ERP_OPPORTUNITY_STAGE_WRITES_TENANT_IDS).toEqual([
      '22222222-2222-4222-8222-222222222222',
    ])
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_OPPORTUNITY_STAGE_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_OPPORTUNITY_STAGE_WRITES_TENANT_IDS')
  })

  it('keeps BOM Purchase Order writes disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED).ERP_PO_BOM_CREATE_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED).ERP_PO_BOM_CREATE_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_PO_BOM_CREATE_WRITES_ENABLED: 'true',
        ERP_PO_BOM_CREATE_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_PO_BOM_CREATE_WRITES_ENABLED: true,
      ERP_PO_BOM_CREATE_WRITES_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_PO_BOM_CREATE_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_PO_BOM_CREATE_WRITES_TENANT_IDS')
  })

  it('keeps grouped BOM Purchase Order writes disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_PO_BOM_GROUPED_CREATE_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_PO_BOM_GROUPED_CREATE_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_PO_BOM_GROUPED_CREATE_WRITES_ENABLED: 'true',
        ERP_PO_BOM_GROUPED_CREATE_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_PO_BOM_GROUPED_CREATE_WRITES_ENABLED: true,
      ERP_PO_BOM_GROUPED_CREATE_WRITES_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_PO_BOM_GROUPED_CREATE_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_PO_BOM_GROUPED_CREATE_WRITES_TENANT_IDS')
  })

  it('keeps Togal BOM commit writes disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED).ERP_BOM_TOGAL_COMMIT_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED).ERP_BOM_TOGAL_COMMIT_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_BOM_TOGAL_COMMIT_WRITES_ENABLED: 'true',
        ERP_BOM_TOGAL_COMMIT_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_BOM_TOGAL_COMMIT_WRITES_ENABLED: true,
      ERP_BOM_TOGAL_COMMIT_WRITES_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_BOM_TOGAL_COMMIT_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_BOM_TOGAL_COMMIT_WRITES_TENANT_IDS')
  })

  it('keeps delivery cancellation writes disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED).ERP_DELIVERY_CANCEL_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED).ERP_DELIVERY_CANCEL_WRITES_TENANT_IDS
    ).toEqual([])

    const enabled = validateEnvironment({
      ...REQUIRED,
      ERP_DELIVERY_CANCEL_WRITES_ENABLED: 'true',
      ERP_DELIVERY_CANCEL_WRITES_TENANT_IDS:
        '22222222-2222-4222-8222-222222222222',
    })
    expect(enabled.ERP_DELIVERY_CANCEL_WRITES_ENABLED).toBe(true)
    expect(enabled.ERP_DELIVERY_CANCEL_WRITES_TENANT_IDS).toEqual([
      '22222222-2222-4222-8222-222222222222',
    ])
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_DELIVERY_CANCEL_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_DELIVERY_CANCEL_WRITES_TENANT_IDS')
  })

  it('keeps purchase-order workflow writes disabled by default', () => {
    expect(
      validateEnvironment(REQUIRED).ERP_PO_WORKFLOW_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED).ERP_PO_WORKFLOW_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_PO_WORKFLOW_WRITES_ENABLED: 'true',
        ERP_PO_WORKFLOW_WRITES_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
      }).ERP_PO_WORKFLOW_WRITES_ENABLED
    ).toBe(true)
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_PO_WORKFLOW_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_PO_WORKFLOW_WRITES_TENANT_IDS')
  })

  it('keeps bank statement auto-match writes disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_RECONCILIATION_AUTO_MATCH_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_RECONCILIATION_AUTO_MATCH_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_RECONCILIATION_AUTO_MATCH_WRITES_ENABLED: 'true',
        ERP_FINANCE_RECONCILIATION_AUTO_MATCH_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_FINANCE_RECONCILIATION_AUTO_MATCH_WRITES_ENABLED: true,
      ERP_FINANCE_RECONCILIATION_AUTO_MATCH_WRITES_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_RECONCILIATION_AUTO_MATCH_WRITES_TENANT_IDS:
          'not-a-tenant',
      })
    ).toThrow('ERP_FINANCE_RECONCILIATION_AUTO_MATCH_WRITES_TENANT_IDS')
  })

  it('keeps bank statement line match writes disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_RECONCILIATION_LINE_MATCH_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_RECONCILIATION_LINE_MATCH_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_RECONCILIATION_LINE_MATCH_WRITES_ENABLED: 'true',
        ERP_FINANCE_RECONCILIATION_LINE_MATCH_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_FINANCE_RECONCILIATION_LINE_MATCH_WRITES_ENABLED: true,
      ERP_FINANCE_RECONCILIATION_LINE_MATCH_WRITES_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_RECONCILIATION_LINE_MATCH_WRITES_TENANT_IDS:
          'not-a-tenant',
      })
    ).toThrow('ERP_FINANCE_RECONCILIATION_LINE_MATCH_WRITES_TENANT_IDS')
  })

  it('keeps bank statement reconciliation writes disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_RECONCILIATION_RECONCILE_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_RECONCILIATION_RECONCILE_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_RECONCILIATION_RECONCILE_WRITES_ENABLED: 'true',
        ERP_FINANCE_RECONCILIATION_RECONCILE_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_FINANCE_RECONCILIATION_RECONCILE_WRITES_ENABLED: true,
      ERP_FINANCE_RECONCILIATION_RECONCILE_WRITES_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_RECONCILIATION_RECONCILE_WRITES_TENANT_IDS:
          'not-a-tenant',
      })
    ).toThrow('ERP_FINANCE_RECONCILIATION_RECONCILE_WRITES_TENANT_IDS')
  })

  it('keeps bank statement import writes disabled and tenant-scoped', () => {
    const parsed = validateEnvironment(REQUIRED)
    expect(parsed.ERP_FINANCE_RECONCILIATION_IMPORT_WRITES_ENABLED).toBe(false)
    expect(parsed.ERP_FINANCE_RECONCILIATION_IMPORT_WRITES_TENANT_IDS).toEqual(
      []
    )
    const enabled = validateEnvironment({
      ...REQUIRED,
      ERP_FINANCE_RECONCILIATION_IMPORT_WRITES_ENABLED: 'true',
      ERP_FINANCE_RECONCILIATION_IMPORT_WRITES_TENANT_IDS:
        '11111111-1111-4111-8111-111111111111',
    })
    expect(enabled.ERP_FINANCE_RECONCILIATION_IMPORT_WRITES_ENABLED).toBe(true)
    expect(enabled.ERP_FINANCE_RECONCILIATION_IMPORT_WRITES_TENANT_IDS).toEqual([
      '11111111-1111-4111-8111-111111111111',
    ])
  })

  it('keeps bank statement Storage authority disabled and tenant-scoped', () => {
    const parsed = validateEnvironment(REQUIRED)
    expect(
      parsed.ERP_FINANCE_RECONCILIATION_IMPORT_STORAGE_UPLOADS_ENABLED
    ).toBe(false)
    expect(
      parsed.ERP_FINANCE_RECONCILIATION_IMPORT_STORAGE_UPLOADS_TENANT_IDS
    ).toEqual([])

    const enabled = validateEnvironment({
      ...REQUIRED,
      ERP_FINANCE_RECONCILIATION_IMPORT_STORAGE_UPLOADS_ENABLED: 'true',
      ERP_FINANCE_RECONCILIATION_IMPORT_STORAGE_UPLOADS_TENANT_IDS:
        '11111111-1111-4111-8111-111111111111',
    })
    expect(
      enabled.ERP_FINANCE_RECONCILIATION_IMPORT_STORAGE_UPLOADS_ENABLED
    ).toBe(true)
    expect(
      enabled.ERP_FINANCE_RECONCILIATION_IMPORT_STORAGE_UPLOADS_TENANT_IDS
    ).toEqual(['11111111-1111-4111-8111-111111111111'])

    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_RECONCILIATION_IMPORT_STORAGE_UPLOADS_TENANT_IDS:
          'not-a-tenant',
      })
    ).toThrow('ERP_FINANCE_RECONCILIATION_IMPORT_STORAGE_UPLOADS_TENANT_IDS')
  })

  it('keeps bank statement void writes disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_RECONCILIATION_VOID_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_RECONCILIATION_VOID_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_RECONCILIATION_VOID_WRITES_ENABLED: 'true',
        ERP_FINANCE_RECONCILIATION_VOID_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_FINANCE_RECONCILIATION_VOID_WRITES_ENABLED: true,
      ERP_FINANCE_RECONCILIATION_VOID_WRITES_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_RECONCILIATION_VOID_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_FINANCE_RECONCILIATION_VOID_WRITES_TENANT_IDS')
  })

  it('keeps finance journal posting disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_JOURNAL_POST_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_JOURNAL_POST_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_JOURNAL_POST_WRITES_ENABLED: 'true',
        ERP_FINANCE_JOURNAL_POST_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      }).ERP_FINANCE_JOURNAL_POST_WRITES_ENABLED
    ).toBe(true)
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_JOURNAL_POST_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_FINANCE_JOURNAL_POST_WRITES_TENANT_IDS')
  })

  it('keeps finance journal reversal disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_JOURNAL_REVERSE_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_JOURNAL_REVERSE_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_JOURNAL_REVERSE_WRITES_ENABLED: 'true',
        ERP_FINANCE_JOURNAL_REVERSE_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      }).ERP_FINANCE_JOURNAL_REVERSE_WRITES_ENABLED
    ).toBe(true)
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_JOURNAL_REVERSE_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_FINANCE_JOURNAL_REVERSE_WRITES_TENANT_IDS')
  })

  it('keeps supplier-bill reversal disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_ENABLED: 'true',
        ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_ENABLED: true,
      ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_TENANT_IDS')
  })

  it('keeps Supplier Bill posting disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_ENABLED: 'true',
        ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_ENABLED: true,
      ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_TENANT_IDS')
  })

  it('keeps cash workflow writes disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED).ERP_FINANCE_CASH_WORKFLOW_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED).ERP_FINANCE_CASH_WORKFLOW_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_CASH_WORKFLOW_WRITES_ENABLED: 'true',
        ERP_FINANCE_CASH_WORKFLOW_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_FINANCE_CASH_WORKFLOW_WRITES_ENABLED: true,
      ERP_FINANCE_CASH_WORKFLOW_WRITES_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_CASH_WORKFLOW_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_FINANCE_CASH_WORKFLOW_WRITES_TENANT_IDS')
  })

  it('keeps cash draft writes disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED).ERP_FINANCE_CASH_DRAFT_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED).ERP_FINANCE_CASH_DRAFT_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_CASH_DRAFT_WRITES_ENABLED: 'true',
        ERP_FINANCE_CASH_DRAFT_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_FINANCE_CASH_DRAFT_WRITES_ENABLED: true,
      ERP_FINANCE_CASH_DRAFT_WRITES_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_CASH_DRAFT_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_FINANCE_CASH_DRAFT_WRITES_TENANT_IDS')
  })

  it('keeps customer invoice issuance disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_ENABLED: 'true',
        ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_ENABLED: true,
      ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_TENANT_IDS')
  })

  it('keeps customer invoice draft creation disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_ENABLED: 'true',
        ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_ENABLED: true,
      ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_TENANT_IDS:
          'not-a-tenant',
      })
    ).toThrow('ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_TENANT_IDS')
  })

  it('keeps customer invoice reversal disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_ENABLED: 'true',
        ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_ENABLED: true,
      ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_TENANT_IDS')
  })

  it('keeps customer invoice cancellation disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_ENABLED: 'true',
        ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_ENABLED: true,
      ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_TENANT_IDS')
  })

  it('keeps Change Request command writes disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED).ERP_CHANGE_REQUEST_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED).ERP_CHANGE_REQUEST_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_CHANGE_REQUEST_WRITES_ENABLED: 'true',
        ERP_CHANGE_REQUEST_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      }).ERP_CHANGE_REQUEST_WRITES_ENABLED
    ).toBe(true)
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_CHANGE_REQUEST_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_CHANGE_REQUEST_WRITES_TENANT_IDS')
  })

  it('keeps Purchase Order workflow notifications fail-closed', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_PO_WORKFLOW_NOTIFICATIONS_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_PO_WORKFLOW_NOTIFICATIONS_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_PO_WORKFLOW_NOTIFICATIONS_ENABLED: 'true',
        ERP_PO_WORKFLOW_NOTIFICATIONS_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
      }).ERP_PO_WORKFLOW_NOTIFICATIONS_ENABLED
    ).toBe(true)
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_PO_WORKFLOW_NOTIFICATIONS_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_PO_WORKFLOW_NOTIFICATIONS_TENANT_IDS')
  })

  it('keeps Stock Receipt draft creation fail-closed', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_INVENTORY_RECEIPT_CREATE_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_INVENTORY_RECEIPT_CREATE_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_INVENTORY_RECEIPT_CREATE_WRITES_ENABLED: 'true',
        ERP_INVENTORY_RECEIPT_CREATE_WRITES_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
      }).ERP_INVENTORY_RECEIPT_CREATE_WRITES_ENABLED
    ).toBe(true)
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_INVENTORY_RECEIPT_CREATE_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_INVENTORY_RECEIPT_CREATE_WRITES_TENANT_IDS')
  })

  it('keeps Stock Receipt posting and reversal fail-closed', () => {
    const parsed = validateEnvironment(REQUIRED)
    expect(parsed.ERP_INVENTORY_RECEIPT_POST_WRITES_ENABLED).toBe(false)
    expect(parsed.ERP_INVENTORY_RECEIPT_POST_WRITES_TENANT_IDS).toEqual([])
    expect(parsed.ERP_INVENTORY_RECEIPT_REVERSE_WRITES_ENABLED).toBe(false)
    expect(parsed.ERP_INVENTORY_RECEIPT_REVERSE_WRITES_TENANT_IDS).toEqual([])

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_INVENTORY_RECEIPT_POST_WRITES_ENABLED: 'true',
        ERP_INVENTORY_RECEIPT_POST_WRITES_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
        ERP_INVENTORY_RECEIPT_REVERSE_WRITES_ENABLED: 'true',
        ERP_INVENTORY_RECEIPT_REVERSE_WRITES_TENANT_IDS:
          '44444444-4444-4444-8444-444444444444',
      })
    ).toMatchObject({
      ERP_INVENTORY_RECEIPT_POST_WRITES_ENABLED: true,
      ERP_INVENTORY_RECEIPT_POST_WRITES_TENANT_IDS: [
        '33333333-3333-4333-8333-333333333333',
      ],
      ERP_INVENTORY_RECEIPT_REVERSE_WRITES_ENABLED: true,
      ERP_INVENTORY_RECEIPT_REVERSE_WRITES_TENANT_IDS: [
        '44444444-4444-4444-8444-444444444444',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_INVENTORY_RECEIPT_POST_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_INVENTORY_RECEIPT_POST_WRITES_TENANT_IDS')
  })

  it('keeps Stock Movement draft creation fail-closed', () => {
    const parsed = validateEnvironment(REQUIRED)
    expect(parsed.ERP_INVENTORY_STOCK_MOVEMENT_CREATE_WRITES_ENABLED).toBe(
      false
    )
    expect(
      parsed.ERP_INVENTORY_STOCK_MOVEMENT_CREATE_WRITES_TENANT_IDS
    ).toEqual([])

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_INVENTORY_STOCK_MOVEMENT_CREATE_WRITES_ENABLED: 'true',
        ERP_INVENTORY_STOCK_MOVEMENT_CREATE_WRITES_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
      })
    ).toMatchObject({
      ERP_INVENTORY_STOCK_MOVEMENT_CREATE_WRITES_ENABLED: true,
      ERP_INVENTORY_STOCK_MOVEMENT_CREATE_WRITES_TENANT_IDS: [
        '33333333-3333-4333-8333-333333333333',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_INVENTORY_STOCK_MOVEMENT_CREATE_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_INVENTORY_STOCK_MOVEMENT_CREATE_WRITES_TENANT_IDS')
  })

  it('keeps Stock Movement posting and reversal fail-closed', () => {
    const parsed = validateEnvironment(REQUIRED)
    expect(parsed.ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_WRITES_ENABLED).toBe(
      false
    )
    expect(
      parsed.ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_WRITES_TENANT_IDS
    ).toEqual([])

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_WRITES_ENABLED: 'true',
        ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_WRITES_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
      })
    ).toMatchObject({
      ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_WRITES_ENABLED: true,
      ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_WRITES_TENANT_IDS: [
        '33333333-3333-4333-8333-333333333333',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_WRITES_TENANT_IDS:
          'not-a-tenant',
      })
    ).toThrow('ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_WRITES_TENANT_IDS')
  })

  it('keeps Delivery receipt writes fail-closed and tenant-scoped', () => {
    const parsed = validateEnvironment(REQUIRED)
    expect(parsed.ERP_DELIVERY_RECEIPT_WRITES_ENABLED).toBe(false)
    expect(parsed.ERP_DELIVERY_RECEIPT_WRITES_TENANT_IDS).toEqual([])

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_DELIVERY_RECEIPT_WRITES_ENABLED: 'true',
        ERP_DELIVERY_RECEIPT_WRITES_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
      })
    ).toMatchObject({
      ERP_DELIVERY_RECEIPT_WRITES_ENABLED: true,
      ERP_DELIVERY_RECEIPT_WRITES_TENANT_IDS: [
        '33333333-3333-4333-8333-333333333333',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_DELIVERY_RECEIPT_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_DELIVERY_RECEIPT_WRITES_TENANT_IDS')
  })

  it('keeps delivery site-preparation start fail-closed and tenant-scoped', () => {
    const parsed = validateEnvironment(REQUIRED)
    expect(parsed.ERP_DELIVERY_SITE_PREPARATION_START_WRITES_ENABLED).toBe(false)
    expect(parsed.ERP_DELIVERY_SITE_PREPARATION_START_WRITES_TENANT_IDS).toEqual(
      []
    )

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_DELIVERY_SITE_PREPARATION_START_WRITES_ENABLED: 'true',
        ERP_DELIVERY_SITE_PREPARATION_START_WRITES_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
      })
    ).toMatchObject({
      ERP_DELIVERY_SITE_PREPARATION_START_WRITES_ENABLED: true,
      ERP_DELIVERY_SITE_PREPARATION_START_WRITES_TENANT_IDS: [
        '33333333-3333-4333-8333-333333333333',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_DELIVERY_SITE_PREPARATION_START_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_DELIVERY_SITE_PREPARATION_START_WRITES_TENANT_IDS')
  })

  it('keeps delivery site-preparation completion fail-closed and tenant-scoped', () => {
    const parsed = validateEnvironment(REQUIRED)
    expect(parsed.ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_ENABLED).toBe(
      false
    )
    expect(
      parsed.ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_TENANT_IDS
    ).toEqual([])

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_ENABLED: 'true',
        ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
      })
    ).toMatchObject({
      ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_ENABLED: true,
      ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_TENANT_IDS: [
        '33333333-3333-4333-8333-333333333333',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_TENANT_IDS:
          'not-a-tenant',
      })
    ).toThrow('ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_TENANT_IDS')
  })

  it('keeps delivery inspection start fail-closed and tenant-scoped', () => {
    const parsed = validateEnvironment(REQUIRED)
    expect(parsed.ERP_DELIVERY_INSPECTION_START_WRITES_ENABLED).toBe(false)
    expect(parsed.ERP_DELIVERY_INSPECTION_START_WRITES_TENANT_IDS).toEqual([])

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_DELIVERY_INSPECTION_START_WRITES_ENABLED: 'true',
        ERP_DELIVERY_INSPECTION_START_WRITES_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
      })
    ).toMatchObject({
      ERP_DELIVERY_INSPECTION_START_WRITES_ENABLED: true,
      ERP_DELIVERY_INSPECTION_START_WRITES_TENANT_IDS: [
        '33333333-3333-4333-8333-333333333333',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_DELIVERY_INSPECTION_START_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_DELIVERY_INSPECTION_START_WRITES_TENANT_IDS')
  })

  it('keeps delivery inspection completion fail-closed and tenant-scoped', () => {
    const parsed = validateEnvironment(REQUIRED)
    expect(parsed.ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_ENABLED).toBe(false)
    expect(parsed.ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_TENANT_IDS).toEqual([])

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_ENABLED: 'true',
        ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
      })
    ).toMatchObject({
      ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_ENABLED: true,
      ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_TENANT_IDS: [
        '33333333-3333-4333-8333-333333333333',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_TENANT_IDS')
  })

  it('keeps document processing intake fail-closed', () => {
    expect(
      validateEnvironment(REQUIRED).ERP_DOCUMENT_PROCESSING_JOBS_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED).ERP_DOCUMENT_PROCESSING_JOBS_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_DOCUMENT_PROCESSING_JOBS_ENABLED: 'true',
        ERP_DOCUMENT_PROCESSING_JOBS_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
      }).ERP_DOCUMENT_PROCESSING_JOBS_ENABLED
    ).toBe(true)
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_DOCUMENT_PROCESSING_JOBS_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_DOCUMENT_PROCESSING_JOBS_TENANT_IDS')
  })

  it('keeps document processing recovery scheduling fail-closed and scoped', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_DOCUMENT_PROCESSING_RECOVERY_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_DOCUMENT_PROCESSING_RECOVERY_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_DOCUMENT_PROCESSING_RECOVERY_ENABLED: 'true',
        ERP_DOCUMENT_PROCESSING_RECOVERY_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
      }).ERP_DOCUMENT_PROCESSING_RECOVERY_TENANT_IDS
    ).toEqual(['33333333-3333-4333-8333-333333333333'])
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_DOCUMENT_PROCESSING_RECOVERY_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_DOCUMENT_PROCESSING_RECOVERY_TENANT_IDS')
  })

  it('keeps the private worker bridge closed and validates its server URL', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_DOCUMENT_PROCESSING_WORKER_BRIDGE_ENABLED
    ).toBe(false)
    expect(validateEnvironment(REQUIRED).DXF_PARSER_URL).toBeUndefined()
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_DOCUMENT_PROCESSING_WORKER_BRIDGE_ENABLED: 'true',
        DXF_PARSER_URL: 'ftp://parser.example.test',
      })
    ).toThrow('DXF_PARSER_URL')
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_DOCUMENT_PROCESSING_WORKER_BRIDGE_ENABLED: 'true',
        DXF_PARSER_URL: 'https://parser.example.test',
        PARSER_SHARED_SECRET: 's'.repeat(20),
        SUPABASE_SERVICE_ROLE_KEY: 'k'.repeat(20),
      }).ERP_DOCUMENT_PROCESSING_WORKER_BRIDGE_ENABLED
    ).toBe(true)
  })

  it('keeps draft BOM creation independently fail-closed', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_DOCUMENT_PROCESSING_DRAFT_BOM_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_DOCUMENT_PROCESSING_DRAFT_BOM_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_DOCUMENT_PROCESSING_DRAFT_BOM_ENABLED: 'true',
        ERP_DOCUMENT_PROCESSING_DRAFT_BOM_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
      }).ERP_DOCUMENT_PROCESSING_DRAFT_BOM_ENABLED
    ).toBe(true)
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_DOCUMENT_PROCESSING_DRAFT_BOM_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_DOCUMENT_PROCESSING_DRAFT_BOM_TENANT_IDS')
  })

  it('keeps document deletion fail-closed and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED).ERP_DOCUMENT_DELETE_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED).ERP_DOCUMENT_DELETE_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_DOCUMENT_DELETE_WRITES_ENABLED: 'true',
        ERP_DOCUMENT_DELETE_WRITES_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
      }).ERP_DOCUMENT_DELETE_WRITES_TENANT_IDS
    ).toEqual(['33333333-3333-4333-8333-333333333333'])
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_DOCUMENT_DELETE_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_DOCUMENT_DELETE_WRITES_TENANT_IDS')
  })

  it('keeps the server-only DocuSeal Core token bounded', () => {
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_CORE_WEBHOOK_TOKEN: 'x'.repeat(32),
      }).ERP_CORE_WEBHOOK_TOKEN
    ).toBe('x'.repeat(32))
    expect(() =>
      validateEnvironment({ ...REQUIRED, ERP_CORE_WEBHOOK_TOKEN: 'short' })
    ).toThrow('ERP_CORE_WEBHOOK_TOKEN')
  })

  it('keeps public signing fail-closed and tenant-scoped', () => {
    expect(validateEnvironment(REQUIRED).ERP_PUBLIC_SIGNING_WRITES_ENABLED).toBe(false)
    expect(validateEnvironment(REQUIRED).ERP_PUBLIC_SIGNING_WRITES_TENANT_IDS).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_PUBLIC_SIGNING_WRITES_ENABLED: 'true',
        ERP_PUBLIC_SIGNING_WRITES_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
      }).ERP_PUBLIC_SIGNING_WRITES_TENANT_IDS
    ).toEqual(['33333333-3333-4333-8333-333333333333'])
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_PUBLIC_SIGNING_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_PUBLIC_SIGNING_WRITES_TENANT_IDS')
  })

  it('keeps supplier confirmation fail-closed and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_PUBLIC_VENDOR_CONFIRMATION_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_PUBLIC_VENDOR_CONFIRMATION_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_PUBLIC_VENDOR_CONFIRMATION_WRITES_ENABLED: 'true',
        ERP_PUBLIC_VENDOR_CONFIRMATION_WRITES_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
      }).ERP_PUBLIC_VENDOR_CONFIRMATION_WRITES_TENANT_IDS
    ).toEqual(['33333333-3333-4333-8333-333333333333'])
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_PUBLIC_VENDOR_CONFIRMATION_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_PUBLIC_VENDOR_CONFIRMATION_WRITES_TENANT_IDS')
  })

  it('keeps supplier confirmation review read fail-closed and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_PUBLIC_VENDOR_CONFIRMATION_READ_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_PUBLIC_VENDOR_CONFIRMATION_READ_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_PUBLIC_VENDOR_CONFIRMATION_READ_ENABLED: 'true',
        ERP_PUBLIC_VENDOR_CONFIRMATION_READ_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
      })
    ).toMatchObject({
      ERP_PUBLIC_VENDOR_CONFIRMATION_READ_ENABLED: true,
      ERP_PUBLIC_VENDOR_CONFIRMATION_READ_TENANT_IDS: [
        '33333333-3333-4333-8333-333333333333',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_PUBLIC_VENDOR_CONFIRMATION_READ_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_PUBLIC_VENDOR_CONFIRMATION_READ_TENANT_IDS')
  })

  it('keeps supplier confirmation session minting closed and bounds its TTL', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_MINTING_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_MINTING_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_MINTING_ENABLED: 'true',
        ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_MINTING_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
        ERP_PUBLIC_VENDOR_CONFIRMATION_TOKEN_SECRET: 's'.repeat(32),
        ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_TTL_HOURS: '48',
      })
    ).toMatchObject({
      ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_MINTING_ENABLED: true,
      ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_MINTING_TENANT_IDS: [
        '33333333-3333-4333-8333-333333333333',
      ],
      ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_TTL_HOURS: 48,
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_MINTING_TENANT_IDS:
          'not-a-tenant',
      })
    ).toThrow('ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_MINTING_TENANT_IDS')
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_TTL_HOURS: '0',
      })
    ).toThrow('ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_TTL_HOURS')
  })

  it('keeps supplier confirmation link delivery closed and HTTPS-only', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_PUBLIC_VENDOR_CONFIRMATION_LINK_DELIVERY_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_PUBLIC_VENDOR_CONFIRMATION_LINK_DELIVERY_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_PUBLIC_VENDOR_CONFIRMATION_LINK_DELIVERY_ENABLED: 'true',
        ERP_PUBLIC_VENDOR_CONFIRMATION_LINK_DELIVERY_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
        ERP_PUBLIC_VENDOR_CONFIRMATION_BASE_URL:
          'https://third-code-erp-api.example.test',
      })
    ).toMatchObject({
      ERP_PUBLIC_VENDOR_CONFIRMATION_LINK_DELIVERY_ENABLED: true,
      ERP_PUBLIC_VENDOR_CONFIRMATION_LINK_DELIVERY_TENANT_IDS: [
        '33333333-3333-4333-8333-333333333333',
      ],
      ERP_PUBLIC_VENDOR_CONFIRMATION_BASE_URL:
        'https://third-code-erp-api.example.test',
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_PUBLIC_VENDOR_CONFIRMATION_LINK_DELIVERY_TENANT_IDS:
          'not-a-tenant',
      })
    ).toThrow('ERP_PUBLIC_VENDOR_CONFIRMATION_LINK_DELIVERY_TENANT_IDS')
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_PUBLIC_VENDOR_CONFIRMATION_BASE_URL: 'http://api.example.test',
      })
    ).toThrow('ERP_PUBLIC_VENDOR_CONFIRMATION_BASE_URL')
  })
})
