/**
 * Cortex graph substrate proof (THIRD_CODE_ERP_IMPLEMENTATION_PROMPT §5, Appendix D S0.2).
 *
 * Proves, against the real DB and inside always-rolled-back transactions:
 *   1. ERP mutation → graph: a project insert is auto-mirrored into a
 *      cortex_node plus machine-derived edges (part_of account, owns by user).
 *   2. Tenant isolation: the authenticated role sees only its own tenant's nodes.
 *   3. Provenance integrity: the per-tenant hash chain is gapless.
 *   4. Write isolation: an authenticated user cannot plant a node in another tenant.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { CORTEX_GRAPH_REF_TABLE_NODE_TYPES } from '@third-code-erp/shared-types'
import {
  DATABASE_URL,
  makeSql,
  inRollback,
  becomeAuthenticated,
  seedTwoTenants,
  seedUserWithRole,
} from './_db-harness'
import {
  CORTEX_ATTR_EXCLUDE,
  CORTEX_BATCH1_REGISTRY,
  CORTEX_BATCH1_SUPPORT,
  CORTEX_HANDWRITTEN_MIRRORS,
  CORTEX_NEVER_MIRROR,
  CORTEX_PLANNED,
  CORTEX_DENYLIST_MIRRORS,
  CORTEX_REGISTRY_COLUMNS,
} from './_cortex-coverage-classes'
import { cortexNodeTypeEnum } from '../schema/cortex'
import {
  getCortexNodeByRef,
  searchCortexNodes,
  cortexSemanticSearch,
  getCortexGraphStats,
  getCortexNeighbors,
} from '../cortex/graph'
import {
  cortexDescribeEntity,
  getCortexCitationsByNodeIds,
  getCortexContextPack,
  cortexEmbeddingText,
  cortexKeywordAnswer,
} from '../cortex/retrieve'

/** Build a 1536-dim one-hot vector literal for pgvector. */
function oneHotVector(index: number): string {
  const arr = new Array(1536).fill(0)
  arr[index] = 1
  return `[${arr.join(',')}]`
}

// Seeded demo tenant (see CLAUDE.md / seed). Used for read-only API assertions.
const DEMO_TENANT = '2b2b039c-b066-412b-af4c-564f2af6097e'
const ZERO_UUID = '00000000-0000-0000-0000-000000000000'

const suite = DATABASE_URL ? describe : describe.skip

if (!DATABASE_URL) {

  console.warn('[cortex-substrate] DATABASE_URL not set — skipping Cortex substrate suite')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rows = any

suite('Cortex substrate', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    sql = makeSql()
  })
  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  it('mirrors a project insert into a node + derived edges (part_of, owns)', async () => {
    const r = await inRollback(sql, async (tx) => {
      const { tenantA, userA } = await seedTwoTenants(tx)
      const acct = (
        (await tx.unsafe(
          `insert into accounts(tenant_id, name) values('${tenantA}','CX Acct') returning id`
        )) as Rows
      )[0].id
      const proj = (
        (await tx.unsafe(
          `insert into projects(tenant_id, name, client, account_id, created_by)
           values('${tenantA}','CX_PROJ','Cli','${acct}','${userA}') returning id`
        )) as Rows
      )[0].id
      const node = (await tx.unsafe(
        `select count(*)::int as n, max(title) as title
           from cortex_nodes
          where tenant_id='${tenantA}' and ref_table='projects' and ref_id='${proj}' and valid_to is null`
      )) as Rows
      const partOf = (await tx.unsafe(
        `select count(*)::int as n from cortex_edges where tenant_id='${tenantA}' and edge_type='part_of'`
      )) as Rows
      const owns = (await tx.unsafe(
        `select count(*)::int as n from cortex_edges where tenant_id='${tenantA}' and edge_type='owns'`
      )) as Rows
      return {
        nodeN: node[0].n as number,
        title: node[0].title as string,
        partOf: partOf[0].n as number,
        owns: owns[0].n as number,
      }
    })
    expect(r.nodeN).toBe(1)
    expect(r.title).toBe('CX_PROJ')
    expect(r.partOf).toBeGreaterThanOrEqual(1)
    expect(r.owns).toBeGreaterThanOrEqual(1)
  })

  it('mirrors an opportunity insert into a node + edges (part_of account, owns by rep)', async () => {
    const r = await inRollback(sql, async (tx) => {
      const { tenantA, userA } = await seedTwoTenants(tx)
      const acct = (
        (await tx.unsafe(
          `insert into accounts(tenant_id, name) values('${tenantA}','Opp Acct') returning id`
        )) as Rows
      )[0].id
      const opp = (
        (await tx.unsafe(
          `insert into opportunities(tenant_id, account_id, rep_id, opportunity_type, stage)
           values('${tenantA}','${acct}','${userA}','Fit-out','opportunity_creation') returning id`
        )) as Rows
      )[0].id
      const node = (await tx.unsafe(
        `select count(*)::int as n, max(node_type::text) as t
           from cortex_nodes where tenant_id='${tenantA}' and ref_table='opportunities' and ref_id='${opp}' and valid_to is null`
      )) as Rows
      const partOf = (await tx.unsafe(
        `select count(*)::int as n from cortex_edges where tenant_id='${tenantA}' and edge_type='part_of'`
      )) as Rows
      const owns = (await tx.unsafe(
        `select count(*)::int as n from cortex_edges where tenant_id='${tenantA}' and edge_type='owns'`
      )) as Rows
      return {
        nodeN: node[0].n as number,
        type: node[0].t as string,
        partOf: partOf[0].n as number,
        owns: owns[0].n as number,
      }
    })
    expect(r.nodeN).toBe(1)
    expect(r.type).toBe('opportunity')
    expect(r.partOf).toBeGreaterThanOrEqual(1)
    expect(r.owns).toBeGreaterThanOrEqual(1)
  })

  it('mirrors a document insert into a node + part_of project edge', async () => {
    const r = await inRollback(sql, async (tx) => {
      const { tenantA, userA } = await seedTwoTenants(tx)
      const proj = (
        (await tx.unsafe(
          `insert into projects(tenant_id, name, client) values('${tenantA}','Doc Proj','C') returning id`
        )) as Rows
      )[0].id
      const doc = (
        (await tx.unsafe(
          `insert into documents(tenant_id, project_id, uploaded_by, document_type, file_name, storage_path, mime_type, size_bytes)
           values('${tenantA}','${proj}','${userA}','pdf','plan.pdf','t/plan.pdf','application/pdf',1024) returning id`
        )) as Rows
      )[0].id
      const node = (await tx.unsafe(
        `select count(*)::int as n, max(title) as title
           from cortex_nodes where tenant_id='${tenantA}' and ref_table='documents' and ref_id='${doc}' and valid_to is null`
      )) as Rows
      // part_of edge from the document node to its project node.
      const edge = (await tx.unsafe(
        `select count(*)::int as n
           from cortex_edges e
           join cortex_nodes s on s.id = e.src_id
          where e.tenant_id='${tenantA}' and e.edge_type='part_of'
            and s.ref_table='documents' and s.ref_id='${doc}'`
      )) as Rows
      return { nodeN: node[0].n as number, title: node[0].title as string, edge: edge[0].n as number }
    })
    expect(r.nodeN).toBe(1)
    expect(r.title).toBe('plan.pdf')
    expect(r.edge).toBeGreaterThanOrEqual(1)
  })

  it('mirrors execution-core entities (bom, purchase_order, invoice) with edges', async () => {
    const r = await inRollback(sql, async (tx) => {
      const { tenantA, userA } = await seedTwoTenants(tx)
      const proj = (
        (await tx.unsafe(
          `insert into projects(tenant_id, name, client) values('${tenantA}','Exec Proj','C') returning id`
        )) as Rows
      )[0].id
      const bom = (
        (await tx.unsafe(
          `insert into boms(tenant_id, project_id, created_by, label) values('${tenantA}','${proj}','${userA}','BOM A') returning id`
        )) as Rows
      )[0].id
      const po = (
        (await tx.unsafe(
          `insert into purchase_orders(tenant_id, project_id, created_by, po_number) values('${tenantA}','${proj}','${userA}','PO-001') returning id`
        )) as Rows
      )[0].id
      const inv = (
        (await tx.unsafe(
          `insert into invoices(tenant_id, project_id, created_by, invoice_number) values('${tenantA}','${proj}','${userA}','INV-001') returning id`
        )) as Rows
      )[0].id
      const counts = (await tx.unsafe(
        `select
           (select count(*)::int from cortex_nodes where tenant_id='${tenantA}' and ref_table='boms' and ref_id='${bom}' and valid_to is null) as bom_node,
           (select count(*)::int from cortex_nodes where tenant_id='${tenantA}' and ref_table='purchase_orders' and ref_id='${po}' and valid_to is null) as po_node,
           (select count(*)::int from cortex_nodes where tenant_id='${tenantA}' and ref_table='invoices' and ref_id='${inv}' and valid_to is null) as inv_node,
           (select count(*)::int from cortex_edges e join cortex_nodes s on s.id=e.src_id
              where e.tenant_id='${tenantA}' and e.edge_type='bills' and s.ref_table='invoices' and s.ref_id='${inv}') as inv_bills,
           (select count(*)::int from cortex_edges e join cortex_nodes s on s.id=e.src_id
              where e.tenant_id='${tenantA}' and e.edge_type='part_of' and s.ref_table='boms' and s.ref_id='${bom}') as bom_partof`
      )) as Rows
      return counts[0]
    })
    expect(r.bom_node).toBe(1)
    expect(r.po_node).toBe(1)
    expect(r.inv_node).toBe(1)
    expect(r.inv_bills).toBeGreaterThanOrEqual(1)
    expect(r.bom_partof).toBeGreaterThanOrEqual(1)
  })

  it('generic mirror covers arbitrary business tables (vendor, scope_item) with edges', async () => {
    const r = await inRollback(sql, async (tx) => {
      const { tenantA } = await seedTwoTenants(tx)
      const proj = (
        (await tx.unsafe(
          `insert into projects(tenant_id, name, client) values('${tenantA}','GenProj','C') returning id`
        )) as Rows
      )[0].id
      await tx.unsafe(`insert into vendors(tenant_id, name) values('${tenantA}','Acme Supply')`)
      const scope = (
        (await tx.unsafe(
          `insert into scope_items(tenant_id, project_id, description, unit, quantity, unit_cost_cents, line_total_cents)
           values('${tenantA}','${proj}','Ductwork run','m',1,0,0) returning id`
        )) as Rows
      )[0].id
      const v = (await tx.unsafe(
        `select count(*)::int as n, max(title) as title from cortex_nodes where tenant_id='${tenantA}' and ref_table='vendors' and valid_to is null`
      )) as Rows
      const s = (await tx.unsafe(
        `select count(*)::int as n from cortex_nodes where tenant_id='${tenantA}' and ref_table='scope_items' and ref_id='${scope}' and valid_to is null`
      )) as Rows
      const e = (await tx.unsafe(
        `select count(*)::int as n from cortex_edges ed join cortex_nodes src on src.id=ed.src_id
           where ed.tenant_id='${tenantA}' and ed.edge_type='part_of' and src.ref_table='scope_items' and src.ref_id='${scope}'`
      )) as Rows
      return { vN: v[0].n as number, vT: v[0].title as string, sN: s[0].n as number, sE: e[0].n as number }
    })
    expect(r.vN).toBe(1)
    expect(r.vT).toBe('Acme Supply')
    expect(r.sN).toBe(1)
    expect(r.sE).toBeGreaterThanOrEqual(1) // scope_item part_of its project
  })

  it('cortex nodes are tenant-isolated for the authenticated role', async () => {
    const visible = await inRollback(sql, async (tx) => {
      const { tenantA, tenantB, userA } = await seedTwoTenants(tx)
      await tx.unsafe(`insert into projects(tenant_id, name, client) values('${tenantA}','CX_PA','C')`)
      await tx.unsafe(`insert into projects(tenant_id, name, client) values('${tenantB}','CX_PB','C')`)
      await becomeAuthenticated(tx, userA)
      const rows = (await tx.unsafe(
        `select count(*)::int as n from cortex_nodes where node_type='project' and title in ('CX_PA','CX_PB')`
      )) as Rows
      await tx.unsafe(`reset role`)
      return rows[0].n as number
    })
    expect(visible).toBe(1)
  })

  it('provenance hash chain is gapless for a tenant', async () => {
    const breaks = await inRollback(sql, async (tx) => {
      const { tenantA } = await seedTwoTenants(tx)
      await tx.unsafe(`insert into accounts(tenant_id, name) values('${tenantA}','A1')`)
      await tx.unsafe(`insert into projects(tenant_id, name, client) values('${tenantA}','P1','C')`)
      await tx.unsafe(`insert into projects(tenant_id, name, client) values('${tenantA}','P2','C')`)
      const rows = (await tx.unsafe(
        `with chain as (
           select id, prev_hash, hash,
             lag(hash) over (order by id) as prior_hash,
             row_number() over (order by id) as rn
           from cortex_provenance where tenant_id='${tenantA}'
         )
         select count(*)::int as n from chain
         where (rn = 1 and prev_hash <> 'genesis')
            or (rn > 1 and prev_hash is distinct from prior_hash)`
      )) as Rows
      return rows[0].n as number
    })
    expect(breaks).toBe(0)
  })

  it('authenticated user cannot insert a cortex node into another tenant', async () => {
    const rejected = await inRollback(sql, async (tx) => {
      const { tenantB, userA } = await seedTwoTenants(tx)
      await becomeAuthenticated(tx, userA)
      try {
        await tx.unsafe(
          `insert into cortex_nodes(tenant_id, node_type, ref_table, ref_id)
           values('${tenantB}','project','projects', gen_random_uuid())`
        )
        return false
      } catch {
        return true
      }
    })
    expect(rejected).toBe(true)
  })

  it('graph read API resolves nodes and stays tenant-scoped', async () => {
    // Read-only against committed demo data. Pick a real project for the demo
    // tenant; if the demo tenant has none, there is nothing to assert.
    const rows = (await sql.unsafe(
      `select id from projects where tenant_id='${DEMO_TENANT}' limit 1`
    )) as Rows
    if (rows.length === 0) return

    const projectId = rows[0].id as string
    const node = await getCortexNodeByRef(DEMO_TENANT, 'projects', projectId)
    expect(node).not.toBeNull()
    expect(node!.tenant_id).toBe(DEMO_TENANT)
    expect(node!.node_type).toBe('project')

    const projectNodes = await searchCortexNodes(DEMO_TENANT, { nodeType: 'project', limit: 10 })
    expect(projectNodes.every((n) => n.tenant_id === DEMO_TENANT)).toBe(true)

    // A non-existent ref resolves to null (no cross-tenant or phantom hits).
    const miss = await getCortexNodeByRef(DEMO_TENANT, 'projects', ZERO_UUID)
    expect(miss).toBeNull()
  })

  it('retrieval builds a source-grounded, tenant-scoped context pack', async () => {
    const rows = (await sql.unsafe(
      `select id from projects where tenant_id='${DEMO_TENANT}' limit 1`
    )) as Rows
    if (rows.length === 0) return
    const projectId = rows[0].id as string

    const pack = await getCortexContextPack(DEMO_TENANT, 'projects', projectId)
    expect(pack).not.toBeNull()
    // The entity itself is always the first citation.
    expect(pack!.citations[0]!.refTable).toBe('projects')
    expect(pack!.citations[0]!.refId).toBe(projectId)
    // Every citation carries a resolvable ERP pointer (no unsourced claims).
    expect(pack!.citations.every((c) => c.nodeId && c.refTable && c.refId)).toBe(true)

    const answer = await cortexDescribeEntity(DEMO_TENANT, 'projects', projectId)
    expect(answer.found).toBe(true)
    expect(answer.summary.length).toBeGreaterThan(0)
    expect(answer.citations.length).toBeGreaterThanOrEqual(1)

    const visible = await getCortexCitationsByNodeIds(
      DEMO_TENANT,
      [pack!.node.id],
      ['project']
    )
    expect(visible).toHaveLength(1)
    expect(visible[0]!.nodeId).toBe(pack!.node.id)
    expect(visible[0]!.refId).toBe(projectId)
    expect(
      await getCortexCitationsByNodeIds(
        DEMO_TENANT,
        [pack!.node.id],
        []
      )
    ).toEqual([])
    expect(
      await getCortexCitationsByNodeIds(
        ZERO_UUID,
        [pack!.node.id],
        null
      )
    ).toEqual([])
  })

  it('retrieval returns an explicit "not found" answer for an unknown entity', async () => {
    const answer = await cortexDescribeEntity(DEMO_TENANT, 'projects', ZERO_UUID)
    expect(answer.found).toBe(false)
    expect(answer.summary).toBe('')
    expect(answer.citations).toEqual([])
  })

  it('builds deterministic embedding text from a node', () => {
    const text = cortexEmbeddingText({
      node_type: 'invoice',
      title: 'INV-001',
      summary: 'Status: issued',
    })
    expect(text).toBe('invoice — INV-001 — Status: issued')
    // Stable across calls (re-embedding correctness depends on this).
    expect(cortexEmbeddingText({ node_type: 'project', title: 'P', summary: null })).toBe(
      'project — P'
    )
  })

  it('pgvector cosine search ranks nearest first and stays tenant-scoped', async () => {
    const r = await inRollback(sql, async (tx) => {
      const { tenantA, tenantB } = await seedTwoTenants(tx)
      const near = oneHotVector(0) // query target
      const far = oneHotVector(5)
      // Two embedded nodes in A (one near, one far) + one in B (must be excluded).
      const aNear = (
        (await tx.unsafe(
          `insert into cortex_nodes(tenant_id, node_type, ref_table, ref_id, title, embedding)
           values('${tenantA}','project','projects', gen_random_uuid(), 'A_NEAR', '${near}'::vector) returning id`
        )) as Rows
      )[0].id
      await tx.unsafe(
        `insert into cortex_nodes(tenant_id, node_type, ref_table, ref_id, title, embedding)
         values('${tenantA}','project','projects', gen_random_uuid(), 'A_FAR', '${far}'::vector)`
      )
      await tx.unsafe(
        `insert into cortex_nodes(tenant_id, node_type, ref_table, ref_id, title, embedding)
         values('${tenantB}','project','projects', gen_random_uuid(), 'B_NEAR', '${near}'::vector)`
      )
      // Same query the helper runs: cosine distance, tenant-scoped, nearest first.
      const rows = (await tx.unsafe(
        `select id, title, (embedding <=> '${near}'::vector) as d
           from cortex_nodes
          where tenant_id='${tenantA}' and valid_to is null and embedding is not null
          order by d asc`
      )) as Rows
      return {
        count: rows.length as number,
        firstId: rows[0].id as string,
        firstTitle: rows[0].title as string,
        sawTenantB: rows.some((x: { title: string }) => x.title === 'B_NEAR'),
        aNear,
      }
    })
    expect(r.count).toBe(2) // only tenant A's two nodes
    expect(r.firstId).toBe(r.aNear) // exact match ranks first (distance 0)
    expect(r.firstTitle).toBe('A_NEAR')
    expect(r.sawTenantB).toBe(false)
  })

  it('agent keyword answer is grounded + cited (real term) and honest (nonsense)', async () => {
    // pull a real word from a demo node title to query with
    const rows = (await sql.unsafe(
      `select title from cortex_nodes where tenant_id='${DEMO_TENANT}' and title is not null and length(title) > 4 limit 1`
    )) as Rows
    if (rows.length > 0) {
      const word = String(rows[0].title)
        .split(/[^a-z0-9]+/i)
        .find((w: string) => w.length >= 4)
      if (word) {
        const ans = await cortexKeywordAnswer(DEMO_TENANT, word)
        expect(ans.citations.length).toBeGreaterThanOrEqual(1)
        expect(ans.citations.every((c) => c.refTable && c.refId)).toBe(true)
        expect(ans.answer.length).toBeGreaterThan(0)
      }
    }
    // nonsense / broad term: never empty-handed — falls back to recent records
    // (and only ever cites real records, never fabricates).
    const broad = await cortexKeywordAnswer(DEMO_TENANT, 'zzqx_nonexistent_term_xyz')
    expect(broad.citations.every((c) => c.refTable && c.refId)).toBe(true)
    // demo graph is non-empty → recent fallback returns cited records
    expect(broad.answer.length).toBeGreaterThan(0)
  })

  it('node-type scope filters retrieval (RBAC enforced at the source)', async () => {
    const onlyProjects = await searchCortexNodes(DEMO_TENANT, { nodeTypes: ['project'], limit: 50 })
    expect(onlyProjects.every((n) => n.node_type === 'project')).toBe(true)
    // empty scope = role sees nothing
    const none = await searchCortexNodes(DEMO_TENANT, { nodeTypes: [], limit: 50 })
    expect(none.length).toBe(0)
    // null scope = unrestricted (admin) — at least as many as a single-type slice
    const unscoped = await searchCortexNodes(DEMO_TENANT, { nodeTypes: null, limit: 200 })
    expect(unscoped.length).toBeGreaterThanOrEqual(onlyProjects.length)
  })

  it('getCortexNeighbors respects node-type scope (no forbidden-type leak)', async () => {
    const rows = (await sql.unsafe(
      `select src_id from cortex_edges where tenant_id='${DEMO_TENANT}' and valid_to is null limit 1`
    )) as Rows
    if (rows.length === 0) return
    const nodeId = rows[0].src_id as string
    // scoped to a single type → every returned neighbor is that type
    const scoped = await getCortexNeighbors(DEMO_TENANT, nodeId, { nodeTypes: ['project'] })
    expect(scoped.every((n) => n.node.node_type === 'project')).toBe(true)
    // empty scope → no neighbors at all
    const none = await getCortexNeighbors(DEMO_TENANT, nodeId, { nodeTypes: [] })
    expect(none.length).toBe(0)
  })

  it('graph stats are tenant-scoped and internally consistent', async () => {
    const stats = await getCortexGraphStats(DEMO_TENANT)
    expect(typeof stats.nodes).toBe('number')
    expect(stats.nodes).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(stats.byType)).toBe(true)
    // Per-type counts never exceed the total node count.
    const sum = stats.byType.reduce((acc, t) => acc + t.count, 0)
    expect(sum).toBe(stats.nodes)
  })

  it('agent memory (conversations + messages) is tenant-isolated', async () => {
    const seen = await inRollback(sql, async (tx) => {
      const { tenantA, tenantB, userA, userB } = await seedTwoTenants(tx)
      const cA = (
        (await tx.unsafe(
          `insert into cortex_conversations(tenant_id, user_id, title) values('${tenantA}','${userA}','A chat') returning id`
        )) as Rows
      )[0].id
      const cB = (
        (await tx.unsafe(
          `insert into cortex_conversations(tenant_id, user_id, title) values('${tenantB}','${userB}','B chat') returning id`
        )) as Rows
      )[0].id
      await tx.unsafe(
        `insert into cortex_messages(tenant_id, conversation_id, role, content) values('${tenantA}','${cA}','user','hello from A')`
      )
      await tx.unsafe(
        `insert into cortex_messages(tenant_id, conversation_id, role, content) values('${tenantB}','${cB}','user','secret from B')`
      )
      await becomeAuthenticated(tx, userA)
      const convos = (await tx.unsafe(
        `select count(*)::int as n from cortex_conversations where title in ('A chat','B chat')`
      )) as Rows
      const msgs = (await tx.unsafe(`select count(*)::int as n from cortex_messages`)) as Rows
      await tx.unsafe(`reset role`)
      return { convos: convos[0].n as number, msgs: msgs[0].n as number }
    })
    expect(seen.convos).toBe(1) // only A's conversation
    expect(seen.msgs).toBe(1) // only A's message — B's is invisible
  })

  it('semantic search helper executes against the live graph (read-only)', async () => {
    const hits = await cortexSemanticSearch(DEMO_TENANT, new Array(1536).fill(0).map((_, i) => (i === 0 ? 1 : 0)), {
      limit: 5,
    })
    expect(Array.isArray(hits)).toBe(true)
    expect(hits.every((h) => h.node.tenant_id === DEMO_TENANT)).toBe(true)
  })
})

// -----------------------------------------------------------------------------
// Cortex coverage, Batches 0-1 (docs/erp/specs/cortex-coverage.md §8).
// -----------------------------------------------------------------------------
const ROLLBACK_SQL = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../sql/cortex-coverage-rollback.sql'
  ),
  'utf8'
)
const BATCH1_BACKFILL_TABLES = [
  'users',
  'accounts',
  'opportunities',
  'documents',
  ...CORTEX_BATCH1_REGISTRY,
]
const FREE_TEXT_EXCLUDE = /(^|_)notes$|_by_name$|description|location|remarks|_reason$|reference_number|assigned_to_text|submission_id/i
const CHAIN_BREAKS = (tenant: string) => `
  with chain as (
    select prev_hash, lag(hash) over (order by id) as prior_hash,
           row_number() over (order by id) as rn
      from cortex_provenance where tenant_id = '${tenant}'
  )
  select count(*)::int as n from chain
   where (rn = 1 and prev_hash <> 'genesis')
      or (rn > 1 and prev_hash is distinct from prior_hash)`

suite('Cortex coverage (Batches 0-1)', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    sql = makeSql()
  })
  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  const first = async (tx: postgres.TransactionSql, query: string): Promise<Rows> =>
    ((await tx.unsafe(query)) as Rows)[0]

  const insertId = async (tx: postgres.TransactionSql, query: string): Promise<string> =>
    (await first(tx, `${query} returning id`)).id as string

  const node = (tx: postgres.TransactionSql, tenant: string, table: string, id: string) =>
    first(
      tx,
      `select id, node_type::text as node_type, title, summary, attributes
         from cortex_nodes
        where tenant_id = '${tenant}' and ref_table = '${table}' and ref_id = '${id}' and valid_to is null`
    )

  // Same paging as scripts/cortex-backfill.mjs: tenant by tenant, by id.
  const backfillAll = async (tx: postgres.TransactionSql, table: string, mode: string, pageSize = 50) => {
    let total = 0
    const tenants = (await tx.unsafe(`select id from tenants order by id`)) as Rows
    for (const { id: tenant } of tenants) {
      let after: string | null = null
      for (;;) {
        const page: Rows = await first(
          tx,
          `select processed, failures, last_id
             from cortex_backfill('${table}', '${tenant}', '${mode}', ${pageSize}, ${after ? `'${after}'` : 'null'})`
        )
        if (!page || page.processed === 0) break
        expect({ table, failures: page.failures }).toEqual({ table, failures: [] })
        total += page.processed as number
        after = page.last_id as string
      }
    }
    return total
  }

  it('S1: registry allowlists match the committed column snapshot and every live column has a decision', async () => {
    const rows = (await sql.unsafe(
      `select r.ref_table, r.attr_cols,
              (select array_agg(c.column_name::text order by c.column_name)
                 from information_schema.columns c
                where c.table_schema = 'public' and c.table_name = r.ref_table) as live,
              exists (select 1 from pg_trigger t
                       where t.tgrelid = ('public.' || quote_ident(r.ref_table))::regclass
                         and t.tgname = 'cortex_mirror_r' and not t.tgisinternal) as has_new,
              exists (select 1 from pg_trigger t
                       where t.tgrelid = ('public.' || quote_ident(r.ref_table))::regclass
                         and t.tgfoid = 'public.cortex_mirror_generic'::regproc) as has_generic
         from cortex_mirror_registry r order by r.ref_table`
    )) as Rows
    expect(rows.map((row: Rows) => row.ref_table).sort()).toEqual([...CORTEX_BATCH1_REGISTRY].sort())
    for (const row of rows) {
      const decision = CORTEX_REGISTRY_COLUMNS[row.ref_table as keyof typeof CORTEX_REGISTRY_COLUMNS]
      const decided = [...decision.copy, ...decision.omit]
      expect({
        table: row.ref_table,
        attrCols: row.attr_cols,
        live: [...(row.live as string[])].sort(),
        twice: decision.copy.filter((col) => decision.omit.includes(col)),
        leaked: (row.attr_cols as string[]).filter(
          (col) => col === 'tenant_id' || CORTEX_ATTR_EXCLUDE.test(col) || FREE_TEXT_EXCLUDE.test(col)
        ),
        hasNew: row.has_new,
        hasGeneric: row.has_generic,
      }).toEqual({
        table: row.ref_table,
        attrCols: [...decision.copy],
        live: [...decided].sort(),
        twice: [],
        leaked: [],
        hasNew: true,
        hasGeneric: false,
      })
    }
  })

  it('S1: vendor, contact, warranty, delivery and contract nodes hold no contact data or provider ids', async () => {
    const nodes = await inRollback(sql, async (tx) => {
      const { tenantA: t, userA } = await seedTwoTenants(tx)
      const vendor = await insertId(
        tx,
        `insert into vendors(tenant_id, name, contact_name, email, phone, address, notes)
         values('${t}', 'S1 Supply', 'Juan Cruz', 'sales@s1.test', '+63 917 555 0101', '12 Ayala Ave', 'call Juan 09175550101')`
      )
      const account = await insertId(tx, `insert into accounts(tenant_id, name) values('${t}', 'S1 Client')`)
      const contact = await insertId(
        tx,
        `insert into contacts(tenant_id, account_id, full_name, email, phone)
         values('${t}', '${account}', 'Maria Santos', 'maria@s1.test', '09175550102')`
      )
      const project = await insertId(
        tx,
        `insert into projects(tenant_id, name, client, created_by) values('${t}', 'S1 Proj', 'C', '${userA}')`
      )
      const ticket = await insertId(
        tx,
        `insert into warranty_tickets(tenant_id, project_id, ticket_number, description, submitted_by_name, submitted_by_email)
         values('${t}', '${project}', 'WT-1', 'Leak', 'Pedro Reyes', 'pedro@s1.test')`
      )
      const po = await insertId(
        tx,
        `insert into purchase_orders(tenant_id, project_id, po_number) values('${t}', '${project}', 'PO-S1')`
      )
      const delivery = await insertId(
        tx,
        `insert into delivery_schedules(tenant_id, purchase_order_id, site_address, site_contact_name, site_contact_phone, site_preparation_notes)
         values('${t}', '${po}', '5 Site Rd', 'Ana Lim', '09175550103', 'gate code 4411')`
      )
      const contract = await insertId(
        tx,
        `insert into contracts(tenant_id, project_id, docuseal_submission_id, docuseal_slug)
         values('${t}', '${project}', 'ds-sub-123', 'ds-slug-secret')`
      )
      return [
        await node(tx, t, 'vendors', vendor),
        await node(tx, t, 'contacts', contact),
        await node(tx, t, 'warranty_tickets', ticket),
        await node(tx, t, 'delivery_schedules', delivery),
        await node(tx, t, 'contracts', contract),
      ]
    })
    const forbidden = [
      'email', 'phone', 'address', 'contact_name', 'notes', 'submitted_by_name', 'submitted_by_email',
      'site_address', 'site_contact_name', 'site_contact_phone', 'site_preparation_notes',
      'docuseal_submission_id', 'docuseal_slug',
    ]
    for (const n of nodes) {
      expect(n).toBeTruthy()
      const keys = Object.keys(n.attributes ?? {})
      expect(keys.filter((k) => forbidden.includes(k) || CORTEX_ATTR_EXCLUDE.test(k))).toEqual([])
      expect(JSON.stringify([n.title, n.summary, n.attributes])).not.toMatch(
        /@s1\.test|0917|555|Ayala|Site Rd|gate code|ds-sub|ds-slug|Pedro|Ana Lim/
      )
    }
  })

  it('S1: every registry table mirrors only its frozen allowlist (synthetic full rows)', async () => {
    const r = await inRollback(sql, async (tx) => {
      const { tenantA: t } = await seedTwoTenants(tx)
      // One row per table with a marker in every column, straight through the engine.
      const applied = (await tx.unsafe(
        `select r.ref_table, r.node_type::text as node_type, r.attr_cols, x.excluded,
                r.title_tpl || ' ' || r.summary_tpl as templates,
                public.cortex_apply_row(r.ref_table, x.row, 'INSERT') as node_id
           from cortex_mirror_registry r
           cross join lateral (
             select jsonb_object_agg(c.column_name, case
                      when c.column_name = 'id' then to_jsonb(gen_random_uuid())
                      when c.column_name = 'tenant_id' then to_jsonb('${t}'::uuid)
                      when c.data_type = 'uuid' then 'null'::jsonb
                      else to_jsonb('LEAK<' || c.column_name || '>') end) as row,
                    coalesce(array_agg(c.column_name::text)
                      filter (where c.column_name::text <> all (r.attr_cols)), '{}') as excluded
               from information_schema.columns c
              where c.table_schema = 'public' and c.table_name = r.ref_table
           ) x
          where r.node_type is not null`
      )) as Rows
      const nodes = (await tx.unsafe(
        `select id, node_type::text as node_type, title, summary, attributes
           from cortex_nodes where tenant_id = '${t}' and valid_to is null`
      )) as Rows
      return { applied, nodes }
    })
    expect(r.applied).toHaveLength(CORTEX_BATCH1_REGISTRY.length)
    for (const row of r.applied) {
      const n = r.nodes.find((candidate: Rows) => candidate.id === row.node_id)
      const text = JSON.stringify([n?.title, n?.summary, n?.attributes])
      expect({
        table: row.ref_table,
        nodeType: n?.node_type,
        extraKeys: Object.keys(n?.attributes ?? {}).filter((key) => !row.attr_cols.includes(key)),
        // A template may name its record by an omitted column (title only).
        leaked: (row.excluded as string[]).filter(
          (col) => !(row.templates as string).includes(`{${col}}`) && text.includes(`LEAK<${col}>`)
        ),
      }).toEqual({ table: row.ref_table, nodeType: row.node_type, extraKeys: [], leaked: [] })
      expect(row.excluded).toContain('tenant_id')
    }
  })

  it('checklist items join their project through the checklist and follow it when it moves', async () => {
    const r = await inRollback(sql, async (tx) => {
      const { tenantA: t } = await seedTwoTenants(tx)
      const p1 = await insertId(tx, `insert into projects(tenant_id, name, client) values('${t}', 'Via P1', 'C')`)
      const p2 = await insertId(tx, `insert into projects(tenant_id, name, client) values('${t}', 'Via P2', 'C')`)
      const c1 = await insertId(tx, `insert into pre_con_checklists(tenant_id, project_id) values('${t}', '${p1}')`)
      const c2 = await insertId(tx, `insert into pre_con_checklists(tenant_id, project_id) values('${t}', '${p2}')`)
      const item = await insertId(
        tx,
        `insert into pre_con_checklist_items(tenant_id, checklist_id, title) values('${t}', '${c1}', 'Permit pack')`
      )
      const partOf = async () =>
        (await tx.unsafe(
          `select d.ref_id::text as project, e.valid_to is null as open
             from cortex_edges e join cortex_nodes s on s.id = e.src_id join cortex_nodes d on d.id = e.dst_id
            where e.tenant_id = '${t}' and e.edge_type = 'part_of' and s.ref_id = '${item}' and d.ref_table = 'projects'
            order by e.valid_to is null, e.id`
        )) as Rows
      const before = await partOf()
      await tx.unsafe(`update pre_con_checklist_items set checklist_id = '${c2}' where id = '${item}'`)
      return { before, after: await partOf(), p1, p2, node: await node(tx, t, 'pre_con_checklist_items', item) }
    })
    expect(r.node.node_type).toBe('task')
    expect(r.before).toEqual([{ project: r.p1, open: true }])
    expect(r.after).toEqual([
      { project: r.p1, open: false },
      { project: r.p2, open: true },
    ])
  })

  it('S2: sales and viewer cannot read budget or stock-movement nodes or their edges; unknown types are denied', async () => {
    const seen = await inRollback(sql, async (tx) => {
      const { tenantA, userB } = await seedTwoTenants(tx)
      const roles = {
        sales: await seedUserWithRole(tx, tenantA, 'sales'),
        viewer: await seedUserWithRole(tx, tenantA, 'viewer'),
        finance: await seedUserWithRole(tx, tenantA, 'finance'),
      }
      const ids: Record<string, string> = {}
      for (const type of ['cost_code', 'project_budget', 'stock_movement', 'project']) {
        ids[type] = await insertId(
          tx,
          `insert into cortex_nodes(tenant_id, node_type, ref_table, ref_id, title)
           values('${tenantA}', '${type}', 's2_probe', gen_random_uuid(), 'S2 ${type}')`
        )
      }
      await tx.unsafe(
        `insert into cortex_edges(tenant_id, src_id, dst_id, edge_type)
         values('${tenantA}', '${ids.project_budget}', '${ids.project}', 'part_of')`
      )
      const out: Record<string, unknown> = {}
      for (const [role, user] of Object.entries({ ...roles, otherTenant: userB })) {
        await becomeAuthenticated(tx, user)
        const rows = (await tx.unsafe(
          `select node_type::text as t from cortex_nodes where ref_table = 's2_probe' order by 1`
        )) as Rows
        out[role] = rows.map((row: Rows) => row.t)
        out[`${role}Edges`] = (
          await first(tx, `select count(*)::int as n from cortex_edges where src_id = '${ids.project_budget}'`)
        ).n
        if (role === 'sales') {
          out.checks = await first(
            tx,
            `select public.auth_can_read_cortex_node_type('kyc_track') as unmapped,
                    public.auth_can_read_cortex_node_type('opportunity') as tenant_type`
          )
        }
        await tx.unsafe(`reset role`)
      }
      return out
    })
    expect(seen.sales).toEqual(['project'])
    expect(seen.viewer).toEqual(['project'])
    expect(seen.finance).toEqual(['cost_code', 'project', 'project_budget', 'stock_movement'])
    // An edge is visible only when both endpoints are readable.
    expect([seen.salesEdges, seen.viewerEdges, seen.financeEdges]).toEqual([0, 0, 1])
    // The admin of another tenant sees none of it.
    expect([seen.otherTenant, seen.otherTenantEdges]).toEqual([[], 0])
    expect(seen.checks).toEqual({ unmapped: false, tenant_type: true })
  })

  it('SEC-H2: audit_log is server-only: authenticated and anon cannot select it, the server role still can', async () => {
    const r = await inRollback(sql, async (tx) => {
      const { tenantA: t, userA } = await seedTwoTenants(tx)
      // The vendor mirror writes a cortex node, whose audit trigger writes audit_log.
      await tx.unsafe(`insert into vendors(tenant_id, name) values('${t}', 'Audit Probe')`)
      const denied = async (role: 'authenticated' | 'anon') =>
        tx
          .savepoint(async (sp) => {
            if (role === 'authenticated') await becomeAuthenticated(sp, userA)
            else await sp.unsafe('set local role anon')
            await sp.unsafe('select count(*) from audit_log')
          })
          .then(
            () => 'read',
            (error: { code?: string }) => error.code ?? 'error'
          )
      const authenticated = await denied('authenticated')
      const anon = await denied('anon')
      await tx.unsafe('set local role service_role')
      const server = await first(tx, `select count(*)::int as n from audit_log where tenant_id = '${t}'`)
      await tx.unsafe('reset role')
      const policies = ((await tx.unsafe(
        `select policyname from pg_policies where schemaname = 'public' and tablename = 'audit_log'`
      )) as Rows).map((row: Rows) => row.policyname as string)
      // A later re-grant of SELECT still shows a tenant user nothing.
      await tx.unsafe('grant select on audit_log to authenticated')
      const regranted = await tx.savepoint(async (sp) => {
        await becomeAuthenticated(sp, userA)
        return ((await sp.unsafe('select count(*)::int as n from audit_log')) as Rows)[0].n as number
      })
      return { authenticated, anon, serverRows: (server.n as number) > 0, policies, regranted }
    })
    expect(r).toEqual({
      authenticated: '42501',
      anon: '42501',
      serverRows: true,
      policies: ['deny_direct_client_access'],
      regranted: 0,
    })
  })

  it('read check: each read group admits exactly its roles; an unmapped type admits nobody', async () => {
    const ALL = [
      'owner', 'admin', 'estimator', 'sales', 'pm', 'viewer', 'commercial',
      'design', 'sd_pm_pe', 'finance', 'procurement', 'safety', 'cx',
    ]
    // One node type per read group (spec §5).
    const GROUPS: Record<string, { type: string; roles: string[] }> = {
      tenant: { type: 'project', roles: ALL },
      finance: { type: 'invoice', roles: ['owner', 'admin', 'finance'] },
      inventory: {
        type: 'warehouse',
        roles: ['owner', 'admin', 'finance', 'procurement', 'sd_pm_pe', 'pm', 'commercial'],
      },
      budget: {
        type: 'cost_code',
        roles: ['owner', 'admin', 'finance', 'commercial', 'procurement', 'sd_pm_pe', 'pm', 'estimator'],
      },
      estimating: { type: 'bom_line', roles: ['owner', 'admin', 'commercial', 'estimator', 'viewer'] },
      procurement: {
        type: 'po_line',
        roles: ['owner', 'admin', 'commercial', 'sd_pm_pe', 'pm', 'procurement', 'viewer'],
      },
      kyc: { type: 'kyc_track', roles: ['owner', 'admin', 'finance', 'viewer'] },
      rfq: { type: 'quote', roles: ['owner', 'admin', 'commercial', 'finance', 'procurement'] },
      rate_card: { type: 'rate_card', roles: ['owner', 'admin', 'commercial', 'viewer'] },
      catalogue: {
        type: 'catalogue_item',
        roles: ['owner', 'admin', 'commercial', 'estimator', 'sd_pm_pe', 'pm', 'procurement', 'viewer'],
      },
    }
    const types = [...Object.values(GROUPS).map((group) => group.type), 'dupa']
    const actual = await inRollback(sql, async (tx) => {
      const { tenantA } = await seedTwoTenants(tx)
      // These four groups get their first access row in a later batch.
      await tx.unsafe(
        `insert into cortex_node_type_access(node_type, read_group) values
           ('kyc_track', 'kyc'), ('quote', 'rfq'), ('rate_card', 'rate_card'), ('catalogue_item', 'catalogue')`
      )
      const out: Record<string, string[]> = Object.fromEntries(types.map((type) => [type, []]))
      for (const role of ALL) {
        await becomeAuthenticated(tx, await seedUserWithRole(tx, tenantA, role))
        const rows = (await tx.unsafe(
          `select t, public.auth_can_read_cortex_node_type(t::public.cortex_node_type) as ok
             from unnest(array[${types.map((type) => `'${type}'`).join(', ')}]) as t`
        )) as Rows
        await tx.unsafe(`reset role`)
        for (const row of rows) if (row.ok) out[row.t as string]!.push(role)
      }
      return out
    })
    for (const [group, { type, roles }] of Object.entries(GROUPS)) {
      expect({ group, roles: [...actual[type]!].sort() }).toEqual({ group, roles: [...roles].sort() })
    }
    expect(actual.dupa).toEqual([])
  })

  it('S3: user and account nodes hold no email; KYC-linked documents drop the file name and its embedding', async () => {
    const r = await inRollback(sql, async (tx) => {
      const { tenantA: t, userA } = await seedTwoTenants(tx)
      const account = await insertId(
        tx,
        `insert into accounts(tenant_id, name, primary_email) values('${t}', 'S3 Client', 'owner@s3.test')`
      )
      const project = await insertId(tx, `insert into projects(tenant_id, name, client) values('${t}', 'S3 Proj', 'C')`)
      const doc = await insertId(
        tx,
        `insert into documents(tenant_id, project_id, uploaded_by, document_type, file_name, storage_path, mime_type, size_bytes)
         values('${t}', '${project}', '${userA}', 'pdf', 'Passport-Juan-Dela-Cruz.pdf', 't/k.pdf', 'application/pdf', 10)`
      )
      const before = await node(tx, t, 'documents', doc)
      // The file name was already embedded before the document became a KYC artifact.
      const embed = () =>
        tx.unsafe(
          `update cortex_nodes set embedding = '${oneHotVector(0)}'::vector
            where tenant_id = '${t}' and ref_id = '${doc}' and valid_to is null`
        )
      const embedded = async () =>
        (await first(
          tx,
          `select embedding is not null as yes from cortex_nodes
            where tenant_id = '${t}' and ref_id = '${doc}' and valid_to is null`
        )).yes as boolean
      await embed()
      await tx.unsafe(
        `insert into account_kyc_artifacts(tenant_id, account_id, artifact_type, document_id)
         values('${t}', '${account}', 'bir_2303', '${doc}')`
      )
      const afterLink = await node(tx, t, 'documents', doc)
      const embeddedAfterLink = await embedded()
      // Re-embedded from the redacted title: a later write must not clear it again.
      await embed()
      await tx.unsafe(`update documents set size_bytes = 11 where id = '${doc}'`)
      return {
        embeddedAfterLink,
        embeddedAfterUpdate: await embedded(),
        user: await node(tx, t, 'users', userA),
        account: await node(tx, t, 'accounts', account),
        before,
        afterLink,
        afterUpdate: await node(tx, t, 'documents', doc),
        breaks: (await first(tx, CHAIN_BREAKS(t))).n as number,
      }
    })
    expect(r.user.attributes).toEqual({ role: 'admin' })
    expect(r.account.attributes).not.toHaveProperty('primary_email')
    expect(JSON.stringify([r.user, r.account])).not.toMatch(/@/)
    expect(r.before.title).toBe('Passport-Juan-Dela-Cruz.pdf')
    expect(r.afterLink.title).toBe('KYC artifact: bir_2303')
    expect(r.afterUpdate.title).toBe('KYC artifact: bir_2303')
    expect(JSON.stringify([r.afterUpdate.summary, r.afterUpdate.attributes])).not.toMatch(/Passport|Juan/)
    // The vector computed from the file name is dropped with the old title, once.
    expect([r.embeddedAfterLink, r.embeddedAfterUpdate]).toEqual([false, true])
    expect(r.breaks).toBe(0)
  })

  it('opportunity nodes gain a prospect title and append stage history in order, and copy no free text', async () => {
    const r = await inRollback(sql, async (tx) => {
      const { tenantA: t, userA } = await seedTwoTenants(tx)
      const account = await insertId(tx, `insert into accounts(tenant_id, name) values('${t}', 'Stage Client')`)
      const opp = await insertId(
        tx,
        `insert into opportunities(tenant_id, account_id, rep_id, opportunity_type, stage, remarks, lost_reason)
         values('${t}', '${account}', '${userA}', 'Fit-out', 'opportunity_creation', 'Call Ana first', 'Budget cut')`
      )
      const titleBefore = (await node(tx, t, 'opportunities', opp)).title
      await tx.unsafe(`update opportunities set stage = 'scoping' where id = '${opp}'`)
      await tx.unsafe(`update opportunities set probability = 40 where id = '${opp}'`)
      await tx.unsafe(
        `update opportunities set stage = 'bom_submission', prospective_project_name = 'Tower B fit-out' where id = '${opp}'`
      )
      const after = await node(tx, t, 'opportunities', opp)
      // A node written before the change still holds both keys until the scrub.
      await tx.unsafe(
        `update cortex_nodes set attributes = attributes || '{"remarks": "Call Ana", "lost_reason": "x"}'::jsonb
          where id = '${after.id}'`
      )
      const scrub = await first(tx, `select changed from cortex_scrub_nodes('opportunities', '${t}', 50, null)`)
      return { titleBefore, after, scrub, scrubbed: await node(tx, t, 'opportunities', opp) }
    })
    expect(r.titleBefore).toBe('Stage Client')
    expect(r.after.attributes).not.toHaveProperty('remarks')
    expect(r.after.attributes).not.toHaveProperty('lost_reason')
    expect(r.scrub.changed).toBe(1)
    expect(r.scrubbed.attributes).toEqual(r.after.attributes)
    expect(r.after.title).toBe('Tower B fit-out')
    const history = r.after.attributes.folds.stage_history as Array<Record<string, string>>
    expect(history.map((h) => [h.from ?? null, h.to])).toEqual([
      [null, 'opportunity_creation'],
      ['opportunity_creation', 'scoping'],
      ['scoping', 'bom_submission'],
    ])
  })

  it('a failing mirror never breaks the ERP write', async () => {
    const r = await inRollback(sql, async (tx) => {
      const { tenantA: t } = await seedTwoTenants(tx)
      await tx.unsafe(`
        create or replace function public.cortex_upsert_node(
          p_tenant uuid, p_node_type cortex_node_type, p_ref_table text, p_ref_id uuid,
          p_title text, p_summary text, p_attributes jsonb, p_actor uuid, p_origin_ref text
        ) returns uuid language plpgsql set search_path = public as $$
        begin raise exception 'cortex probe failure'; end $$`)
      const vendor = await insertId(tx, `insert into vendors(tenant_id, name) values('${t}', 'Still Saved')`)
      const account = await insertId(tx, `insert into accounts(tenant_id, name) values('${t}', 'Still Saved')`)
      await tx.unsafe(`update vendors set name = 'Still Saved 2' where id = '${vendor}'`)
      return first(
        tx,
        `select (select count(*) from vendors where id = '${vendor}' and name = 'Still Saved 2')::int
              + (select count(*) from accounts where id = '${account}')::int as rows,
                (select count(*) from cortex_nodes where ref_id in ('${vendor}', '${account}'))::int as nodes`
      )
    })
    expect(r).toEqual({ rows: 2, nodes: 0 })
  })

  it('a failing mirror never breaks an ERP delete (registry and hand-written triggers)', async () => {
    const r = await inRollback(sql, async (tx) => {
      const { tenantA: t } = await seedTwoTenants(tx)
      const vendor = await insertId(tx, `insert into vendors(tenant_id, name) values('${t}', 'Delete Me')`)
      const account = await insertId(tx, `insert into accounts(tenant_id, name) values('${t}', 'Delete Me')`)
      await tx.unsafe(`
        create or replace function public.cortex_apply_row(p_table text, p_row jsonb, p_op text)
        returns uuid language plpgsql set search_path = '' as $$
        begin raise exception 'cortex probe failure'; end $$;
        create or replace function public.cortex_apply_account(p_row jsonb, p_op text)
        returns uuid language plpgsql set search_path = '' as $$
        begin raise exception 'cortex probe failure'; end $$`)
      await tx.unsafe(`delete from vendors where id = '${vendor}'`)
      await tx.unsafe(`delete from accounts where id = '${account}'`)
      return first(
        tx,
        `select (select count(*) from vendors where id = '${vendor}')::int
              + (select count(*) from accounts where id = '${account}')::int as rows,
                (select count(*) from cortex_nodes
                  where ref_id in ('${vendor}', '${account}') and valid_to is null)::int as open_nodes`
      )
    })
    // Rows are gone; the nodes stay open because the mirror failed (warning only).
    expect(r).toEqual({ rows: 0, open_nodes: 2 })
  })

  it('registry engine: folds, link edges, stale edges and deletes (synthetic tables)', async () => {
    const r = await inRollback(sql, async (tx) => {
      const { tenantA: t, userA } = await seedTwoTenants(tx)
      await tx.unsafe(`
        create table public.cortex_probe_child(
          id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
          vendor_id uuid, amount integer, notes text);
        create table public.cortex_probe_link(
          id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
          vendor_id uuid, project_id uuid);
        insert into public.cortex_mirror_registry(ref_table, fold) values ('cortex_probe_child',
          '{"parent_table": "vendors", "fk": "vendor_id", "key": "probe", "sum_col": "amount", "items": ["amount"], "order_col": "amount", "limit": 2}');
        insert into public.cortex_mirror_registry(ref_table, links) values ('cortex_probe_link',
          '{"src": {"table": "vendors", "col": "vendor_id"}, "dst": {"table": "projects", "col": "project_id"}, "type": "supplies"}');
        create trigger cortex_fold_ins after insert on public.cortex_probe_child
          referencing new table as cortex_new for each statement execute function public.cortex_fold_children();
        create trigger cortex_fold_upd after update on public.cortex_probe_child
          referencing new table as cortex_new old table as cortex_old for each statement execute function public.cortex_fold_children();
        create trigger cortex_fold_del after delete on public.cortex_probe_child
          referencing old table as cortex_old for each statement execute function public.cortex_fold_children();
        create trigger cortex_link after insert or update or delete on public.cortex_probe_link
          for each row execute function public.cortex_mirror_link();`)
      const vendor = await insertId(tx, `insert into vendors(tenant_id, name) values('${t}', 'Fold Vendor')`)
      const p1 = await insertId(tx, `insert into projects(tenant_id, name, client) values('${t}', 'Edge P1', 'C')`)
      const p2 = await insertId(tx, `insert into projects(tenant_id, name, client) values('${t}', 'Edge P2', 'C')`)
      const folds = async () => (await node(tx, t, 'vendors', vendor)).attributes.folds?.probe

      await tx.unsafe(
        `insert into cortex_probe_child(tenant_id, vendor_id, amount, notes)
         values('${t}', '${vendor}', 10, 'n'), ('${t}', '${vendor}', 20, 'n'), ('${t}', '${vendor}', 30, 'n')`
      )
      const folded = await folds()
      await tx.unsafe(`update vendors set name = 'Fold Vendor 2' where id = '${vendor}'`)
      const keptAfterParentWrite = await folds()
      await tx.unsafe(`delete from cortex_probe_child where amount = 30`)
      const afterDelete = await folds()

      const linkEdges = async () =>
        (await tx.unsafe(
          `select e.valid_to is null as open, e.attributes
             from cortex_edges e join cortex_nodes s on s.id = e.src_id join cortex_nodes d on d.id = e.dst_id
            where e.tenant_id = '${t}' and e.edge_type = 'supplies'
              and s.ref_id = '${vendor}' and d.ref_id = '${p1}'`
        )) as Rows
      const link = await insertId(
        tx,
        `insert into cortex_probe_link(tenant_id, vendor_id, project_id) values('${t}', '${vendor}', '${p1}')`
      )
      const linkOpen = await linkEdges()
      await tx.unsafe(`delete from cortex_probe_link where id = '${link}'`)
      const linkClosed = await linkEdges()

      const scope = await insertId(
        tx,
        `insert into scope_items(tenant_id, project_id, created_by, description, unit, quantity, unit_cost_cents, line_total_cents)
         values('${t}', '${p1}', '${userA}', 'Edge scope', 'm', 1, 0, 0)`
      )
      await tx.unsafe(`update scope_items set project_id = '${p2}' where id = '${scope}'`)
      const partOf = (await tx.unsafe(
        `select d.ref_id::text as project, e.valid_to is null as open
           from cortex_edges e join cortex_nodes s on s.id = e.src_id join cortex_nodes d on d.id = e.dst_id
          where e.tenant_id = '${t}' and e.edge_type = 'part_of' and s.ref_id = '${scope}'
          order by e.valid_to is null, e.id`
      )) as Rows
      await tx.unsafe(`delete from scope_items where id = '${scope}'`)
      const afterScopeDelete = await first(
        tx,
        `select (select count(*) from cortex_nodes where ref_id = '${scope}' and valid_to is null)::int as nodes,
                (select count(*) from cortex_edges e join cortex_nodes n on n.id in (e.src_id, e.dst_id)
                  where n.ref_id = '${scope}' and e.valid_to is null)::int as edges`
      )

      await tx.unsafe(`
        create or replace function public.cortex_set_fold(
          p_tenant uuid, p_parent_table text, p_parent_id uuid, p_key text, p_value jsonb) returns void
        language plpgsql as $$ begin raise exception 'fold probe failure'; end $$;
        create or replace function public.cortex_link_edge(p_table text, p_row jsonb, p_open boolean) returns void
        language plpgsql as $$ begin raise exception 'link probe failure'; end $$;`)
      await tx.unsafe(`insert into cortex_probe_child(tenant_id, vendor_id, amount) values('${t}', '${vendor}', 5)`)
      await tx.unsafe(
        `insert into cortex_probe_link(tenant_id, vendor_id, project_id) values('${t}', '${vendor}', '${p2}')`
      )
      const survived = (await first(
        tx,
        `select (select count(*) from cortex_probe_child where amount = 5)::int
              + (select count(*) from cortex_probe_link where project_id = '${p2}')::int as n`
      )).n as number

      return {
        folded, keptAfterParentWrite, afterDelete, linkOpen, linkClosed, partOf, afterScopeDelete, survived,
        breaks: (await first(tx, CHAIN_BREAKS(t))).n as number,
        p1, p2,
      }
    })
    expect(r.folded).toEqual({ count: 3, sum: 60, items: [{ amount: 30 }, { amount: 20 }] })
    expect(r.keptAfterParentWrite).toEqual(r.folded)
    expect(r.afterDelete).toEqual({ count: 2, sum: 30, items: [{ amount: 20 }, { amount: 10 }] })
    expect(r.linkOpen).toEqual([{ open: true, attributes: { link: 'cortex_probe_link' } }])
    expect(r.linkClosed).toEqual([{ open: false, attributes: { link: 'cortex_probe_link' } }])
    expect(r.partOf).toEqual([
      { project: r.p1, open: false },
      { project: r.p2, open: true },
    ])
    expect(r.afterScopeDelete).toEqual({ nodes: 0, edges: 0 })
    expect(r.survived).toBe(2)
    expect(r.breaks).toBe(0)
  })

  it('fold refresh locks the parent FOR NO KEY UPDATE, so an edge insert (KEY SHARE) is not blocked (two connections)', async () => {
    const holder = makeSql()
    const probe = makeSql()
    let release!: () => void
    const released = new Promise<void>((resolve) => (release = resolve))
    let locked!: (id: string) => void
    const lockedId = new Promise<string>((resolve) => (locked = resolve))
    // Connection 1 holds the lock cortex_refresh_fold takes on a committed node.
    const holding = inRollback(holder, async (tx) => {
      const x = await first(
        tx,
        `select id, tenant_id, ref_table, ref_id from cortex_nodes
          where tenant_id = '${DEMO_TENANT}' and valid_to is null order by id limit 1`
      )
      if (!x) throw new Error('no committed node to lock')
      await tx.unsafe(`
        create table public.cortex_probe_lock(
          id uuid primary key default gen_random_uuid(), tenant_id uuid not null, parent_id uuid);
        insert into public.cortex_mirror_registry(ref_table, fold) values ('cortex_probe_lock',
          jsonb_build_object('parent_table', '${x.ref_table}', 'fk', 'parent_id', 'key', 'probe', 'items', '[]'::jsonb))`)
      await tx.unsafe(`select public.cortex_refresh_fold('cortex_probe_lock', '${x.tenant_id}', '${x.ref_id}')`)
      locked(x.id as string)
      await released
    })
    const endedEarly = holding.then(() => {
      throw new Error('holder finished before locking')
    })
    endedEarly.catch(() => undefined) // settles after release; only the race reads it
    try {
      const id = await Promise.race([lockedId, endedEarly])
      // Connection 2: KEY SHARE (what an edge insert's foreign key takes) is
      // granted; a second NO KEY UPDATE is refused.
      const seen = await inRollback(probe, async (tx) => {
        const keyShare = (await tx.unsafe(
          `select id from cortex_nodes where id = '${id}' for key share nowait`
        )) as Rows
        let noKeyUpdate = 'acquired'
        try {
          await tx.unsafe(`select id from cortex_nodes where id = '${id}' for no key update nowait`)
        } catch (error) {
          noKeyUpdate = (error as { code?: string }).code ?? 'error'
        }
        return { keyShare: keyShare.length, noKeyUpdate }
      })
      expect(seen).toEqual({ keyShare: 1, noKeyUpdate: '55P03' })
    } finally {
      release()
      await holding.catch(() => undefined)
      await holder.end({ timeout: 5 })
      await probe.end({ timeout: 5 })
    }
  })

  it('registry engine: lookups, JSON paths, poly and array edges; a moved poly edge closes (synthetic table)', async () => {
    const r = await inRollback(sql, async (tx) => {
      const { tenantA: t, userA } = await seedTwoTenants(tx)
      const other = await seedUserWithRole(tx, t, 'sales')
      const project = await insertId(tx, `insert into projects(tenant_id, name, client) values('${t}', 'Poly P', 'C')`)
      const vendor = await insertId(tx, `insert into vendors(tenant_id, name) values('${t}', 'Poly V')`)
      await tx.unsafe(`
        create table public.cortex_probe_rich(
          id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
          subject_type text, subject_id uuid, mentioned uuid[], vendor_id uuid,
          payload jsonb, label text, secret_token text);
        insert into public.cortex_mirror_registry(
          ref_table, node_type, title_tpl, summary_tpl, attr_cols, attr_paths, edges, lookups)
        values ('cortex_probe_rich', 'task', '{vendor_name}: {label}', 'Label: {label}',
          '{label,subject_type}', '{payload.floor_area_sqm,payload.site}',
          '[{"cols": ["subject_id"], "type": "part_of", "dir": "out",
             "poly": {"type_col": "subject_type", "map": {"project": "projects", "vendor": "vendors"}}},
            {"cols": ["mentioned"], "many": true, "table": "users", "type": "mentions", "dir": "out"}]',
          '{"vendor_name": {"table": "vendors", "col": "name", "key": "vendor_id"}}');
        create trigger cortex_mirror_r after insert or update or delete on public.cortex_probe_rich
          for each row execute function public.cortex_mirror_row();`)
      const row = await insertId(
        tx,
        `insert into cortex_probe_rich(tenant_id, subject_type, subject_id, mentioned, vendor_id, payload, label, secret_token)
         values('${t}', 'project', '${project}', array['${userA}', '${other}']::uuid[], '${vendor}',
                '{"floor_area_sqm": 120, "site": {"address": "5 Secret St"}}', 'L1', 'tok-secret')`
      )
      const openEdges = async () =>
        ((await tx.unsafe(
          `select e.edge_type::text || ':' || d.ref_table || ':' || d.ref_id::text as edge
             from cortex_edges e join cortex_nodes s on s.id = e.src_id join cortex_nodes d on d.id = e.dst_id
            where s.ref_id = '${row}' and e.valid_to is null order by 1`
        )) as Rows).map((edge: Rows) => edge.edge as string)
      const created = { node: await node(tx, t, 'cortex_probe_rich', row), edges: await openEdges() }
      await tx.unsafe(
        `update cortex_probe_rich
            set subject_type = 'vendor', subject_id = '${vendor}', mentioned = array['${other}']::uuid[], label = null
          where id = '${row}'`
      )
      const moved = { node: await node(tx, t, 'cortex_probe_rich', row), edges: await openEdges() }
      return { created, moved, row, project, vendor, userA, other }
    })
    expect(r.created.node.title).toBe('Poly V: L1')
    expect(r.created.node.summary).toBe('Label: L1')
    // payload.site is an object: nested strings would skip redaction, so it is not copied.
    expect(r.created.node.attributes).toEqual({ label: 'L1', subject_type: 'project', floor_area_sqm: 120 })
    expect(r.created.edges).toEqual(
      [`part_of:projects:${r.project}`, `mentions:users:${r.userA}`, `mentions:users:${r.other}`].sort()
    )
    // An empty placeholder falls back to "<Type> <id8>" and drops the summary.
    expect(r.moved.node.title).toBe(`Task ${r.row.slice(0, 8)}`)
    expect(r.moved.node.summary).toBeNull()
    expect(r.moved.edges).toEqual([`part_of:vendors:${r.vendor}`, `mentions:users:${r.other}`].sort())
  })

  it('cortex_redact_text masks emails, tax ids and phone-like digit runs, keeps codes, ids and dates, and truncates', async () => {
    const cases: Array<[string, string]> = [
      ['mail juan.cruz+x@s1-test.com.ph now', 'mail [email] now'],
      ['call +63 917 555 0101 ok', 'call [phone] ok'],
      ['0917-555-0102', '[phone]'],
      ['tel (02) 8123-4567', 'tel [phone]'],
      ['PO-2026-000123 rev 2', 'PO-2026-000123 rev 2'],
      ['Room 301, 12mm at 600V', 'Room 301, 12mm at 600V'],
      ['TIN: 123-456-789 on file', '[tax id] on file'],
      ['tax identification number 123456789000', '[tax id]'],
      ['vendor 123-456-789-000 ok', 'vendor [tax id] ok'],
      ['call Pedro 0917 555 0101', 'call Pedro [phone]'],
      ['12345678-1234-1234-1234-123456789012', '12345678-1234-1234-1234-123456789012'],
      ['2026-11-06T10:00:00.123456+00:00', '2026-11-06T10:00:00.123456+00:00'],
      ['2026-11-06', '2026-11-06'],
    ]
    const rows = (await sql.unsafe(
      `select public.cortex_redact_text(x, 300) as out
         from unnest(array[${cases.map(([input]) => `'${input}'`).join(', ')}]) with ordinality as v(x, n)
        order by n`
    )) as Rows
    expect(rows.map((row: Rows) => row.out)).toEqual(cases.map(([, expected]) => expected))
    const cut = (await sql.unsafe(
      `select length(public.cortex_redact_text(repeat('x', 400), 300))::int as n`
    )) as Rows
    expect(cut[0].n).toBe(300)
    // A huge value is cut to 4 x max before the patterns run; what is kept is still masked.
    const huge = (await sql.unsafe(
      `select public.cortex_redact_text('mail ana@x.ph or 0917 555 0101 ' || repeat('y', 1000000), 40) as out`
    )) as Rows
    expect(huge[0].out).toBe(`mail [email] or [phone] ${'y'.repeat(16)}`)
    // Every string attribute is masked, however short; numbers and booleans pass.
    const attrs = (await sql.unsafe(
      `select public.cortex_redact_attrs('{"rejected_reason": "call Pedro 0917 555 0101", "n": 12, "ok": true,
                                            "id": "12345678-1234-1234-1234-123456789012"}'::jsonb) as a`
    )) as Rows
    expect(attrs[0].a).toEqual({
      rejected_reason: 'call Pedro [phone]',
      n: 12,
      ok: true,
      id: '12345678-1234-1234-1234-123456789012',
    })
  })

  it('backfill and scrub set their own lock_timeout, whatever the session or a pooler set', async () => {
    const rows = (await sql.unsafe(
      `select p.proname::text as name, p.proconfig as config
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('cortex_backfill', 'cortex_scrub_nodes')
        order by 1`
    )) as Rows
    expect(rows.map((row: Rows) => [row.name, (row.config as string[]).includes('lock_timeout=5s')])).toEqual([
      ['cortex_backfill', true],
      ['cortex_scrub_nodes', true],
    ])
  })

  it('a re-titled node loses its embedding; a node whose title and summary stay keeps it', async () => {
    const r = await inRollback(sql, async (tx) => {
      const { tenantA: t } = await seedTwoTenants(tx)
      const keep = await insertId(tx, `insert into vendors(tenant_id, name) values('${t}', 'Keep Supply')`)
      const retitle = await insertId(tx, `insert into vendors(tenant_id, name) values('${t}', 'Retitle Supply')`)
      // Both nodes carry a vector and a legacy key; one also has a legacy title.
      await tx.unsafe(
        `update cortex_nodes set embedding = '${oneHotVector(2)}'::vector,
                attributes = attributes || '{"phone": "0917 555 0101"}'::jsonb
          where tenant_id = '${t}' and ref_table = 'vendors' and ref_id in ('${keep}', '${retitle}')`
      )
      await tx.unsafe(
        `update cortex_nodes set title = 'Legacy contact: call Ana'
          where tenant_id = '${t}' and ref_table = 'vendors' and ref_id = '${retitle}'`
      )
      const page = await first(tx, `select applied, failures from cortex_backfill('vendors', '${t}', 'all', 50, null)`)
      const state = async (id: string) =>
        first(
          tx,
          `select title, attributes ? 'phone' as legacy, embedding is not null as embedded
             from cortex_nodes where tenant_id = '${t}' and ref_table = 'vendors' and ref_id = '${id}' and valid_to is null`
        )
      return { page, keep: await state(keep), retitle: await state(retitle) }
    })
    expect(r.page).toEqual({ applied: 2, failures: [] })
    expect(r.keep).toEqual({ title: 'Keep Supply', legacy: false, embedded: true })
    expect(r.retitle).toEqual({ title: 'Retitle Supply', legacy: false, embedded: false })
  })

  it('backfill --mode all strips legacy attributes; a second run writes no provenance', async () => {
    const r = await inRollback(sql, async (tx) => {
      const { tenantA: t } = await seedTwoTenants(tx)
      const vendor = await insertId(
        tx,
        `insert into vendors(tenant_id, name, email) values('${t}', 'Legacy', 'old@legacy.test')`
      )
      const account = await insertId(tx, `insert into accounts(tenant_id, name) values('${t}', 'Legacy Acct')`)
      await tx.unsafe(
        `update cortex_nodes set attributes = attributes || '{"email": "old@legacy.test", "notes": "x"}'
          where tenant_id = '${t}' and ref_id = '${vendor}' and valid_to is null`
      )
      await tx.unsafe(
        `update cortex_nodes set attributes = attributes || '{"primary_email": "old@legacy.test"}'
          where tenant_id = '${t}' and ref_id = '${account}' and valid_to is null`
      )
      // A row written while its trigger was off is picked up by --mode missing.
      await tx.unsafe(`alter table vendors disable trigger cortex_mirror_r`)
      const unmirrored = await insertId(tx, `insert into vendors(tenant_id, name) values('${t}', 'Unmirrored')`)
      await tx.unsafe(`alter table vendors enable trigger cortex_mirror_r`)

      const counts = () =>
        first(
          tx,
          `select (select count(*) from cortex_provenance)::int as prov,
                  (select count(*) from cortex_nodes where valid_to is null)::int as nodes,
                  (select count(*) from cortex_edges where valid_to is null)::int as edges`
        )
      const missingFirst = await backfillAll(tx, 'vendors', 'missing')
      const missingSecond = await backfillAll(tx, 'vendors', 'missing')
      for (const table of BATCH1_BACKFILL_TABLES) await backfillAll(tx, table, 'all')
      const afterFirst = await counts()
      let processedSecond = 0
      for (const table of BATCH1_BACKFILL_TABLES) processedSecond += await backfillAll(tx, table, 'all')
      const afterSecond = await counts()
      return {
        missingFirst, missingSecond, processedSecond, afterFirst, afterSecond,
        vendor: await node(tx, t, 'vendors', vendor),
        account: await node(tx, t, 'accounts', account),
        unmirrored: await node(tx, t, 'vendors', unmirrored),
        breaks: (await first(tx, CHAIN_BREAKS(t))).n as number,
      }
    })
    expect(r.missingFirst).toBeGreaterThanOrEqual(1)
    expect(r.missingSecond).toBe(0)
    expect(r.unmirrored?.title).toBe('Unmirrored')
    expect(r.vendor.attributes).not.toHaveProperty('email')
    expect(r.vendor.attributes).not.toHaveProperty('notes')
    expect(r.account.attributes).not.toHaveProperty('primary_email')
    expect(r.processedSecond).toBeGreaterThanOrEqual(5)
    expect(r.afterSecond).toEqual(r.afterFirst)
    expect(r.breaks).toBe(0)
  })

  it('SEC-H1: scrub rewrites closed and orphaned nodes to the allowlist, drops emails and deleted file names', async () => {
    const r = await inRollback(sql, async (tx) => {
      const { tenantA: t, userA } = await seedTwoTenants(tx)
      const scrub = async (table: string) => {
        let after: string | null = null
        let changed = 0
        for (;;) {
          const page: Rows = await first(
            tx,
            `select processed, changed, skipped, failures, last_id
               from cortex_scrub_nodes('${table}', '${t}', 2, ${after ? `'${after}'` : 'null'})`
          )
          if (page.processed === 0) return changed
          expect({ table, failures: page.failures, skipped: page.skipped }).toEqual({ table, failures: [], skipped: 0 })
          changed += page.changed as number
          after = page.last_id as string
        }
      }
      const legacy = (table: string, id: string, extra: string) =>
        tx.unsafe(
          `update cortex_nodes set attributes = attributes || '${extra}'::jsonb,
                  embedding = '${oneHotVector(1)}'::vector
            where tenant_id = '${t}' and ref_table = '${table}' and ref_id = '${id}'`
        )
      // A vendor whose node carries the pre-Batch-1 image, then is deleted (node closed).
      const vendor = await insertId(tx, `insert into vendors(tenant_id, name) values('${t}', 'Gone Supply')`)
      await legacy('vendors', vendor, '{"email": "old@legacy.test", "phone": "0917 555 0101", "notes": "call Juan"}')
      await tx.unsafe(`delete from vendors where id = '${vendor}'`)
      // An orphaned open node: no source row at all.
      const orphan = await insertId(
        tx,
        `insert into cortex_nodes(tenant_id, node_type, ref_table, ref_id, title, attributes)
         values('${t}', 'project_budget', 'project_budgets', gen_random_uuid(), 'Overrun: call Pedro 0917 555 0101',
                '{"revision": 2, "status": "draft", "revision_reason": "Pedro asked", "submitted_by": "x"}')`
      )
      const orphanRef = (await first(tx, `select ref_id from cortex_nodes where id = '${orphan}'`)).ref_id as string
      await legacy('users', userA, '{"email": "u@legacy.test"}')
      const account = await insertId(tx, `insert into accounts(tenant_id, name) values('${t}', 'Scrub Client')`)
      await legacy('accounts', account, '{"primary_email": "a@legacy.test"}')
      // A document deleted after its file name was embedded.
      const project = await insertId(tx, `insert into projects(tenant_id, name, client) values('${t}', 'Scrub Proj', 'C')`)
      const doc = await insertId(
        tx,
        `insert into documents(tenant_id, project_id, uploaded_by, document_type, file_name, storage_path, mime_type, size_bytes)
         values('${t}', '${project}', '${userA}', 'pdf', 'Passport-Juan-Dela-Cruz.pdf', 't/s.pdf', 'application/pdf', 10)`
      )
      await legacy('documents', doc, '{}')
      await tx.unsafe(`delete from documents where id = '${doc}'`)

      const changed: Record<string, number> = {}
      for (const table of ['vendors', 'project_budgets', 'users', 'accounts', 'documents']) {
        changed[table] = await scrub(table)
      }
      const again: Record<string, number> = {}
      for (const table of Object.keys(changed)) again[table] = await scrub(table)
      const snapshot = (table: string, id: string) =>
        first(
          tx,
          `select title, summary, attributes, embedding is not null as embedded, valid_to is not null as closed
             from cortex_nodes where tenant_id = '${t}' and ref_table = '${table}' and ref_id = '${id}'
            order by recorded_at desc limit 1`
        )
      return {
        changed, again,
        vendor: await snapshot('vendors', vendor),
        orphan: await snapshot('project_budgets', orphanRef),
        user: await snapshot('users', userA),
        account: await snapshot('accounts', account),
        doc: await snapshot('documents', doc),
        breaks: (await first(tx, CHAIN_BREAKS(t))).n as number,
      }
    })
    expect(Object.values(r.again)).toEqual([0, 0, 0, 0, 0])
    expect(r.vendor.closed).toBe(true)
    expect(Object.keys(r.vendor.attributes).sort()).toEqual(['created_at'])
    expect(r.orphan).toMatchObject({
      title: 'Budget revision 2',
      summary: 'Status: draft',
      attributes: { revision: 2, status: 'draft' },
      embedded: false,
    })
    expect(r.user.attributes).not.toHaveProperty('email')
    expect(r.account.attributes).not.toHaveProperty('primary_email')
    expect(r.doc).toMatchObject({ title: 'Deleted document', embedded: false, closed: true })
    expect(JSON.stringify([r.vendor, r.orphan, r.user, r.account, r.doc])).not.toMatch(
      /@legacy|0917|Juan|Pedro|Passport/
    )
    expect(r.breaks).toBe(0)
  })

  it('SEC-H1: scrub re-titles a deleted draft stock movement from kept columns, never its legacy reason', async () => {
    const r = await inRollback(sql, async (tx) => {
      const { tenantA: t, userA } = await seedTwoTenants(tx)
      const warehouse = await insertId(
        tx,
        `insert into warehouses(tenant_id, code, name, created_by) values('${t}', 'SCRUB', 'Scrub WH', '${userA}')`
      )
      const movement = await insertId(
        tx,
        `insert into stock_movements(tenant_id, movement_type, source_warehouse_id, movement_date, reason, created_by)
         values('${t}', 'adjustment', '${warehouse}', '2026-07-27', 'Damaged, ask Juan 0917 555 0101', '${userA}')`
      )
      const live = await first(
        tx,
        `select title from cortex_nodes where ref_table = 'stock_movements' and ref_id = '${movement}' and valid_to is null`
      )
      // The pre-Batch-1 generic mirror titled the node with the free-text reason.
      await tx.unsafe(
        `update cortex_nodes set title = 'Damaged, ask Juan 0917 555 0101',
                attributes = attributes || '{"reason": "Damaged, ask Juan"}'::jsonb
          where ref_table = 'stock_movements' and ref_id = '${movement}'`
      )
      await tx.unsafe(`delete from stock_movements where id = '${movement}'`)
      const page = await first(
        tx,
        `select changed, failures from cortex_scrub_nodes('stock_movements', '${t}', 50, null)`
      )
      const node = await first(
        tx,
        `select title, attributes, valid_to is not null as closed
           from cortex_nodes where ref_table = 'stock_movements' and ref_id = '${movement}'`
      )
      return { live: live.title, page, node }
    })
    expect(r.live).toBe('Stock movement adjustment 2026-07-27')
    expect(r.page).toEqual({ changed: 1, failures: [] })
    expect(r.node).toMatchObject({ title: 'Stock movement adjustment 2026-07-27', closed: true })
    expect(r.node.attributes).not.toHaveProperty('reason')
    expect(JSON.stringify(r.node)).not.toMatch(/Juan|0917|Damaged/)
  })

  it('backfill reports a failing row by table and id and carries on with the page', async () => {
    const r = await inRollback(sql, async (tx) => {
      const { tenantA: t } = await seedTwoTenants(tx)
      await tx.unsafe(`alter table vendors disable trigger cortex_mirror_r`)
      const fineA = await insertId(tx, `insert into vendors(tenant_id, name) values('${t}', 'Fine A')`)
      const boom = await insertId(tx, `insert into vendors(tenant_id, name) values('${t}', 'Boom')`)
      const fineB = await insertId(tx, `insert into vendors(tenant_id, name) values('${t}', 'Fine B')`)
      await tx.unsafe(`alter table vendors enable trigger cortex_mirror_r`)
      await tx.unsafe(`
        alter function public.cortex_apply_row(text, jsonb, text) rename to cortex_apply_row_real;
        create function public.cortex_apply_row(p_table text, p_row jsonb, p_op text)
        returns uuid language plpgsql set search_path = '' as $$
        begin
          if p_row ->> 'name' = 'Boom' then raise exception 'probe row failure'; end if;
          return public.cortex_apply_row_real(p_table, p_row, p_op);
        end $$`)
      const page = await first(
        tx,
        `select processed, applied, skipped, failures from cortex_backfill('vendors', '${t}', 'missing', 10, null)`
      )
      const nodes = (await tx.unsafe(
        `select ref_id from cortex_nodes where tenant_id = '${t}' and ref_table = 'vendors' and valid_to is null`
      )) as Rows
      return { page, boom, mirrored: nodes.map((row: Rows) => row.ref_id).sort(), fine: [fineA, fineB].sort() }
    })
    expect(r.page).toMatchObject({ processed: 3, applied: 2, skipped: 0 })
    expect(r.page.failures).toEqual([{ table: 'vendors', id: r.boom, error: 'probe row failure' }])
    expect(r.mirrored).toEqual(r.fine)
  })

  it('backfill skips a row a live transaction holds instead of waiting or overwriting it (two connections)', async () => {
    const holder = makeSql()
    const probe = makeSql()
    let release!: () => void
    const released = new Promise<void>((resolve) => (release = resolve))
    let locked!: (row: Rows) => void
    const lockedRow = new Promise<Rows>((resolve) => (locked = resolve))
    // Connection 1 stands in for a live writer: it holds a committed user row.
    const holding = inRollback(holder, async (tx) => {
      const row = await first(
        tx,
        `select tenant_id, id from users where tenant_id = '${DEMO_TENANT}' order by id limit 1 for no key update`
      )
      if (!row) throw new Error('no committed user row to hold')
      locked(row)
      await released
    })
    const endedEarly = holding.then(() => {
      throw new Error('holder finished before locking')
    })
    endedEarly.catch(() => undefined) // settles after release; only the race reads it
    try {
      const row = await Promise.race([lockedRow, endedEarly])
      const page = await inRollback(probe, async (tx) => {
        await tx.unsafe(`set local lock_timeout = '2s'`)
        return first(
          tx,
          `select processed, applied, skipped, failures
             from cortex_backfill('users', '${row.tenant_id}', 'all', 2000, null)`
        )
      })
      expect(page.failures).toEqual([])
      expect(page.skipped).toBe(1)
      expect(page.applied).toBe((page.processed as number) - 1)
    } finally {
      release()
      await holding.catch(() => undefined)
      await holder.end({ timeout: 5 })
      await probe.end({ timeout: 5 })
    }
  })

  it('backfill and scrub take the tenant audit lock, then the provenance lock, before any row lock', async () => {
    const rows = (await sql.unsafe(
      `select p.proname::text as name, pg_get_functiondef(p.oid) as def
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('cortex_backfill', 'cortex_scrub_nodes')
        order by 1`
    )) as Rows
    const order = rows.map((row: Rows) => {
      const def = row.def as string
      const audit = def.indexOf(`hashtextextended('audit_log:' || p_tenant::text, 0)`)
      const provenance = def.indexOf(`hashtextextended('cortex_provenance:' || p_tenant::text, 0)`)
      return [row.name, audit > 0 && audit < provenance && provenance < def.indexOf(' skip locked')]
    })
    expect(order).toEqual([
      ['cortex_backfill', true],
      ['cortex_scrub_nodes', true],
    ])
    // The scrub's node lock lets edge inserts (KEY SHARE) through, as cortex_refresh_fold does.
    expect(rows[1].def).toContain('for no key update skip locked')
  })

  it('backfill waits on a live writer\'s audit lock before locking a row, so that writer is never blocked (two connections)', async () => {
    const writer = makeSql()
    const backfiller = makeSql()
    let locked!: (row: Rows) => void
    const lockedRow = new Promise<Rows>((resolve) => (locked = resolve))
    let seenWaiting!: () => void
    const backfillWaiting = new Promise<void>((resolve) => (seenWaiting = resolve))
    // Connection 1 stands in for an audited ERP write: it holds the tenant's
    // audit lock, then updates the first row the backfill will read.
    const writing = inRollback(writer, async (tx) => {
      const row = await first(
        tx,
        `select tenant_id, id from users where tenant_id = '${DEMO_TENANT}' order by id limit 1`
      )
      if (!row) throw new Error('no committed user row')
      await tx.unsafe(`select pg_advisory_xact_lock(hashtextextended('audit_log:' || '${DEMO_TENANT}', 0))`)
      locked(row)
      await backfillWaiting
      await tx.unsafe(`set local lock_timeout = '2s'`)
      try {
        await tx.unsafe(`update users set full_name = full_name where id = '${row.id}'`)
        return 'updated'
      } catch (error) {
        return (error as { code?: string }).code ?? 'error'
      }
    })
    const endedEarly = writing.then(() => {
      throw new Error('writer finished before locking')
    })
    endedEarly.catch(() => undefined) // settles after release; only the race reads it
    let paging: Promise<Rows> | undefined
    try {
      const row = await Promise.race([lockedRow, endedEarly])
      let backendPid!: (pid: number) => void
      const pid = new Promise<number>((resolve) => (backendPid = resolve))
      paging = inRollback(backfiller, async (tx) => {
        backendPid((await first(tx, `select pg_backend_pid() as pid`)).pid as number)
        return first(
          tx,
          `select processed, applied, skipped, failures
             from cortex_backfill('users', '${row.tenant_id}', 'all', 1, null)`
        )
      })
      // The backfill must be parked on an advisory lock before the writer moves.
      const waiting = await pid
      let waitEvent: string | null = null
      for (let attempt = 0; attempt < 100 && waitEvent !== 'advisory'; attempt += 1) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 50))
        const [activity] = (await sql.unsafe(
          `select wait_event from pg_stat_activity where pid = ${waiting}`
        )) as Rows
        waitEvent = activity?.wait_event ?? null
      }
      expect(waitEvent).toBe('advisory')
      seenWaiting()
      expect(await writing).toBe('updated')
      expect(await paging).toEqual({ processed: 1, applied: 1, skipped: 0, failures: [] })
    } finally {
      seenWaiting()
      await writing.catch(() => undefined)
      await paging?.catch(() => undefined)
      await writer.end({ timeout: 5 })
      await backfiller.end({ timeout: 5 })
    }
  })

  it('backfill builds stage history from succeeded transition receipts; a live change then appends', async () => {
    const r = await inRollback(sql, async (tx) => {
      const { tenantA: t, userA } = await seedTwoTenants(tx)
      const account = await insertId(tx, `insert into accounts(tenant_id, name) values('${t}', 'History Client')`)
      const opp = await insertId(
        tx,
        `insert into opportunities(tenant_id, account_id, rep_id, opportunity_type, stage)
         values('${t}', '${account}', '${userA}', 'Fit-out', 'bom_submission')`
      )
      // A node mirrored before Batch 1 has no folds.
      await tx.unsafe(
        `update cortex_nodes set attributes = attributes - 'folds'
          where tenant_id = '${t}' and ref_id = '${opp}' and valid_to is null`
      )
      await tx.unsafe(
        `insert into opportunity_stage_transition_requests(
           tenant_id, opportunity_id, idempotency_key, request_hash, state, from_stage, to_stage,
           created_by, created_at, completed_at, result)
         values
           ('${t}', '${opp}', 'k2', repeat('b', 64), 'succeeded', 'scoping', 'bom_submission',
            '${userA}', now() - interval '1 hour', now() - interval '1 hour', '{}'),
           ('${t}', '${opp}', 'k1', repeat('a', 64), 'succeeded', 'opportunity_creation', 'scoping',
            '${userA}', now() - interval '2 hours', now() - interval '2 hours', '{}'),
           ('${t}', '${opp}', 'k3', repeat('c', 64), 'processing', 'bom_submission', 'negotiation',
            '${userA}', now(), null, null)`
      )
      const history = async () =>
        ((await node(tx, t, 'opportunities', opp)).attributes.folds?.stage_history ?? []).map(
          (entry: Rows) => [entry.from ?? null, entry.to]
        )
      const provenance = async () => (await first(tx, `select count(*)::int as n from cortex_provenance`)).n as number
      await backfillAll(tx, 'opportunities', 'all')
      const built = await history()
      const provBefore = await provenance()
      await backfillAll(tx, 'opportunities', 'all')
      const provAfter = await provenance()
      await tx.unsafe(`update opportunities set stage = 'negotiation' where id = '${opp}'`)
      return { built, provBefore, provAfter, live: await history() }
    })
    expect(r.built).toEqual([
      ['opportunity_creation', 'scoping'],
      ['scoping', 'bom_submission'],
    ])
    expect(r.provAfter).toBe(r.provBefore)
    expect(r.live).toEqual([...r.built, ['bom_submission', 'negotiation']])
  })

  // The rollback switches the registry engine off without re-opening S1-S3:
  // no generic trigger comes back, the read check stays deny-by-default and
  // the hand-written mirrors stay email-free.
  it('rollback SQL switches the registry engine off, keeps S1-S3 closed, data and the chain', async () => {
    const r = await inRollback(sql, async (tx) => {
      const { tenantA: t, userA } = await seedTwoTenants(tx)
      const before = await insertId(tx, `insert into vendors(tenant_id, name) values('${t}', 'Before Rollback')`)
      await tx.unsafe(`insert into accounts(tenant_id, name) values('${t}', 'Before Rollback')`)
      const nodesBefore = (await first(tx, `select count(*)::int as n from cortex_nodes`)).n as number
      await tx.unsafe(ROLLBACK_SQL)
      const triggers = (await tx.unsafe(
        `select tgrelid::regclass::text as tbl, tgname from pg_trigger
          where not tgisinternal
            and (tgfoid = 'public.cortex_mirror_generic'::regproc
                 or tgname in ('cortex_mirror_r', 'cortex_kyc_redact'))
          order by 1`
      )) as Rows
      const functions = (await tx.unsafe(
        `select p.proname::text as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
          where s.nspname = 'public' and p.proname in ('cortex_apply_row', 'cortex_backfill', 'cortex_scrub_nodes',
            'cortex_mirror_row', 'cortex_fold_children', 'cortex_mirror_link', 'cortex_apply_account',
            'cortex_apply_document', 'cortex_kyc_redact', 'cortex_redact_text')
          order by 1`
      )) as Rows
      const kept = await first(
        tx,
        `select (select count(*) from cortex_nodes)::int as nodes,
                (select count(*) from cortex_mirror_registry)::int as registry,
                (select count(*) from cortex_node_type_access)::int as access`
      )
      const vendor = await insertId(
        tx,
        `insert into vendors(tenant_id, name, email) values('${t}', 'After Rollback', 'old@path.test')`
      )
      await tx.unsafe(`update users set full_name = full_name || ' ' where id = '${userA}'`)
      const deny = await first(
        tx,
        `select public.auth_can_read_cortex_node_type('kyc_track') as unmapped,
                public.auth_can_read_cortex_node_type('opportunity') as tenant_type`
      )
      // A scrub left unfinished before the rollback can still finish after it.
      await tx.unsafe(
        `update cortex_nodes set attributes = attributes || '{"phone": "0917 555 0101"}'::jsonb
          where tenant_id = '${t}' and ref_table = 'vendors' and ref_id = '${before}' and valid_to is null`
      )
      const scrub = await first(tx, `select changed, skipped, failures from cortex_scrub_nodes('vendors', '${t}', 50, null)`)
      return {
        scrub, scrubbed: await node(tx, t, 'vendors', before),
        nodesBefore, triggers, functions: functions.map((row: Rows) => row.name), kept, deny,
        vendorNode: await node(tx, t, 'vendors', vendor),
        user: await node(tx, t, 'users', userA),
        breaks: (await first(tx, CHAIN_BREAKS(t))).n as number,
      }
    })
    expect(r.triggers).toEqual([{ tbl: 'account_kyc_artifacts', tgname: 'cortex_kyc_redact' }])
    expect(r.functions).toEqual([
      'cortex_apply_account', 'cortex_apply_document', 'cortex_kyc_redact', 'cortex_redact_text', 'cortex_scrub_nodes',
    ])
    expect(r.scrub).toEqual({ changed: 1, skipped: 0, failures: [] })
    expect(r.scrubbed.title).toBe('Before Rollback')
    expect(r.scrubbed.attributes).not.toHaveProperty('phone')
    expect(r.kept.nodes).toBe(r.nodesBefore)
    expect(r.kept.registry).toBe(CORTEX_BATCH1_REGISTRY.length)
    expect(r.kept.access).toBeGreaterThan(0)
    // Registry tables are no longer mirrored, so nothing can leak through them.
    expect(r.vendorNode).toBeUndefined()
    expect(r.user).toBeTruthy()
    expect(r.user.attributes).not.toHaveProperty('email')
    expect(r.deny).toEqual({ unmapped: false, tenant_type: true })
    expect(r.breaks).toBe(0)
  })

  it('registry guard: every named column exists, title columns are NOT NULL, copied columns are scalar, and cortex_mirror_r and registry rows match one to one', async () => {
    const missing = (await sql.unsafe(
      `with named as (
         select r.ref_table as tbl, unnest(r.attr_cols) as col, 'attr_cols' as source from cortex_mirror_registry r
         union all
         select r.ref_table, split_part(p, '.', 1), 'attr_paths' from cortex_mirror_registry r, unnest(r.attr_paths) p
         union all
         select r.ref_table, (regexp_matches(r.title_tpl || ' ' || r.summary_tpl, '\\{([a-z0-9_]+)\\}', 'g'))[1], 'template'
           from cortex_mirror_registry r
         union all
         select r.ref_table, c, 'edge' from cortex_mirror_registry r,
                jsonb_array_elements(r.edges) e, jsonb_array_elements_text(e -> 'cols') c
         union all
         select e -> 'via' ->> 'table', e -> 'via' ->> 'col', 'edge via' from cortex_mirror_registry r,
                jsonb_array_elements(r.edges) e where e ? 'via'
         union all
         select r.ref_table, e -> 'poly' ->> 'type_col', 'edge poly' from cortex_mirror_registry r,
                jsonb_array_elements(r.edges) e where e ? 'poly'
         union all
         select r.ref_table, l.value ->> 'key', 'lookup key' from cortex_mirror_registry r, jsonb_each(r.lookups) l
         union all
         select l.value ->> 'table', l.value ->> 'col', 'lookup' from cortex_mirror_registry r, jsonb_each(r.lookups) l
         union all
         select r.ref_table, r.fold ->> 'fk', 'fold fk' from cortex_mirror_registry r where r.fold is not null
       )
       select tbl, col, source from named n
        where not exists (select 1 from information_schema.columns c
                           where c.table_schema = 'public' and c.table_name = n.tbl and c.column_name = n.col)
        order by 1, 2`
    )) as Rows
    expect(missing).toEqual([])

    // A title placeholder that can be null would fall back to an older title in the scrub.
    const nullableTitleCols = (await sql.unsafe(
      `select r.ref_table as tbl, m.col
         from cortex_mirror_registry r
         cross join lateral (select (regexp_matches(r.title_tpl, '\\{([a-z0-9_]+)\\}', 'g'))[1] as col) m
         join information_schema.columns c
           on c.table_schema = 'public' and c.table_name = r.ref_table and c.column_name = m.col
        where c.is_nullable = 'YES'
        order by 1, 2`
    )) as Rows
    expect(nullableTitleCols).toEqual([])

    // Redaction masks top-level strings only: a copied column must be a scalar,
    // and an attr_paths entry must read into a json column (the engine copies
    // only a scalar found there).
    const nonScalar = (await sql.unsafe(
      `select r.ref_table as tbl, a.col, format_type(att.atttypid, att.atttypmod) as type, 'attr_cols' as source
         from cortex_mirror_registry r
         cross join lateral unnest(r.attr_cols) as a(col)
         join pg_attribute att
           on att.attrelid = format('public.%I', r.ref_table)::regclass and att.attname = a.col and not att.attisdropped
         join pg_type ty on ty.oid = att.atttypid
        where ty.typcategory = 'A' or ty.typtype = 'c' or ty.typname in ('json', 'jsonb', 'bytea', 'vector')
       union all
       select r.ref_table, split_part(p.path, '.', 1), format_type(att.atttypid, att.atttypmod), 'attr_paths'
         from cortex_mirror_registry r
         cross join lateral unnest(r.attr_paths) as p(path)
         join pg_attribute att
           on att.attrelid = format('public.%I', r.ref_table)::regclass
          and att.attname = split_part(p.path, '.', 1) and not att.attisdropped
         join pg_type ty on ty.oid = att.atttypid
        where ty.typname not in ('json', 'jsonb')
        order by 1, 2`
    )) as Rows
    expect(nonScalar).toEqual([])

    const pairs = (await sql.unsafe(
      `select coalesce(t.tbl, r.ref_table) as tbl, t.tbl is not null as has_trigger, r.ref_table is not null as has_row
         from (select c.relname::text as tbl from pg_trigger g join pg_class c on c.oid = g.tgrelid
                where g.tgname = 'cortex_mirror_r' and not g.tgisinternal) t
         full join (select ref_table from cortex_mirror_registry where node_type is not null) r on r.ref_table = t.tbl
        where t.tbl is null or r.ref_table is null`
    )) as Rows
    expect(pairs).toEqual([])
  })

  it('SEC-M7: the denylist finance, cash, bank and inventory mirrors copy exactly the decided keys', async () => {
    const tables = Object.keys(CORTEX_DENYLIST_MIRRORS)
    expect(tables).toHaveLength(11)
    const rows = (await sql.unsafe(
      `select c.relname::text as tbl,
              array(select a.attname::text from pg_attribute a
                     where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped order by 1) as cols,
              array(select p.proname::text from pg_trigger g join pg_proc p on p.oid = g.tgfoid
                     where g.tgrelid = c.oid and not g.tgisinternal) as mirrors
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = any($1)
        order by 1`,
      [tables]
    )) as Rows
    const defs = new Map<string, string>()
    for (const mirror of new Set(Object.values(CORTEX_DENYLIST_MIRRORS).map((m) => m.mirror))) {
      const [row] = (await sql.unsafe(`select pg_get_functiondef('public.${mirror}()'::regprocedure) as def`)) as Rows
      defs.set(mirror, row.def as string)
    }
    const actual = rows.map((row: Rows) => {
      const decision = CORTEX_DENYLIST_MIRRORS[row.tbl as string]!
      const def = defs.get(decision.mirror) ?? ''
      return {
        table: row.tbl,
        mirrored: (row.mirrors as string[]).includes(decision.mirror),
        // The mirror copies the row minus these keys; each must still be removed in its body.
        removedInBody: decision.removed.filter((key) => !new RegExp(`-\\s*'${key}'`).test(def)),
        copied: (row.cols as string[]).filter((col) => !decision.removed.includes(col)).sort(),
      }
    })
    expect(actual).toEqual(
      tables.sort().map((table) => ({
        table,
        mirrored: true,
        removedInBody: [],
        copied: [...CORTEX_DENYLIST_MIRRORS[table]!.copied].sort(),
      }))
    )
  })

  it('coverage guard: every tenant table is classified exactly once', async () => {
    const names = async (query: string): Promise<string[]> =>
      ((await sql.unsafe(query)) as Rows).map((row: Rows) => row.name as string)
    const tables = await names(
      `select distinct c.table_name::text as name
         from information_schema.columns c
         join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
        where c.table_schema = 'public' and c.column_name = 'tenant_id' and t.table_type = 'BASE TABLE'`
    )
    const mirrored = await names(
      `select distinct c.relname::text as name
         from pg_trigger t join pg_class c on c.oid = t.tgrelid
        where not t.tgisinternal and t.tgfoid::regproc::text like 'cortex_mirror_%'`
    )
    const registry = await names(`select ref_table as name from cortex_mirror_registry`)

    const classes: Array<[string, readonly string[]]> = [
      ['handwritten', CORTEX_HANDWRITTEN_MIRRORS],
      ['registry', registry],
      ['batch1-support', Object.keys(CORTEX_BATCH1_SUPPORT)],
      ...Object.entries(CORTEX_PLANNED).map(
        ([batch, list]): [string, readonly string[]] => [`planned-${batch}`, list]
      ),
      ['never', Object.keys(CORTEX_NEVER_MIRROR)],
    ]
    const owners = new Map<string, string[]>()
    for (const [name, list] of classes) {
      for (const table of list) owners.set(table, [...(owners.get(table) ?? []), name])
    }
    const plannedCatalogue: readonly string[] = CORTEX_PLANNED[6]
    const unclassified = tables.filter((table) => !owners.has(table)).sort()
    const duplicated = [...owners].filter(([, list]) => list.length > 1).map(([table]) => table)
    const stale = [...owners.keys()].filter(
      (table) => !tables.includes(table) && !plannedCatalogue.includes(table)
    )
    expect({ unclassified, duplicated, stale }).toEqual({ unclassified: [], duplicated: [], stale: [] })

    // Batches 0-1 are fully live: every hand-written and registry table has its mirror trigger.
    const notMirrored = [...CORTEX_HANDWRITTEN_MIRRORS, ...CORTEX_BATCH1_REGISTRY].filter(
      (table) => !mirrored.includes(table)
    )
    expect(notMirrored).toEqual([])
    expect([...registry].sort()).toEqual([...CORTEX_BATCH1_REGISTRY].sort())
    expect(Object.values(CORTEX_NEVER_MIRROR).every((why) => why.length > 0)).toBe(true)
  })

  it('parity guard: registry node types are in the enum, the access table and the graph contract', async () => {
    const dbEnum = ((await sql.unsafe(
      `select unnest(enum_range(null::cortex_node_type))::text as v`
    )) as Rows).map((row: Rows) => row.v as string)
    expect([...dbEnum].sort()).toEqual([...cortexNodeTypeEnum.enumValues].sort())

    const rows = (await sql.unsafe(
      `select r.ref_table, r.node_type::text as node_type, a.read_group
         from cortex_mirror_registry r
         left join cortex_node_type_access a on a.node_type = r.node_type
        where r.node_type is not null`
    )) as Rows
    const graphContract = CORTEX_GRAPH_REF_TABLE_NODE_TYPES as Record<string, string>
    const gaps = rows
      .filter((row: Rows) => !row.read_group || graphContract[row.ref_table] !== row.node_type)
      .map((row: Rows) => row.ref_table)
    expect(gaps).toEqual([])

    // Deny-by-default: types nothing mirrors yet have no access row.
    const early = (await sql.unsafe(
      `select node_type::text as t from cortex_node_type_access
        where node_type::text in ('kyc_track', 'tender', 'quote', 'catalogue_item')`
    )) as Rows
    expect(early).toEqual([])
  })
})
