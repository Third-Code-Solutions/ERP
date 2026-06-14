/**
 * Cortex graph substrate proof (BUILDOPS_IMPLEMENTATION_PROMPT §5, Appendix D S0.2).
 *
 * Proves, against the real DB and inside always-rolled-back transactions:
 *   1. ERP mutation → graph: a project insert is auto-mirrored into a
 *      cortex_node plus machine-derived edges (part_of account, owns by user).
 *   2. Tenant isolation: the authenticated role sees only its own tenant's nodes.
 *   3. Provenance integrity: the per-tenant hash chain is gapless.
 *   4. Write isolation: an authenticated user cannot plant a node in another tenant.
 */
import postgres from 'postgres'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  DATABASE_URL,
  makeSql,
  inRollback,
  becomeAuthenticated,
  seedTwoTenants,
} from './_db-harness'
import {
  getCortexNodeByRef,
  searchCortexNodes,
  cortexSemanticSearch,
  getCortexGraphStats,
} from '../cortex/graph'
import {
  cortexDescribeEntity,
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
  // eslint-disable-next-line no-console
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
