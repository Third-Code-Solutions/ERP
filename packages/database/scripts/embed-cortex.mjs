// One-time / repeatable backfill: embed every un-embedded Cortex node so
// semantic search + the agent have real recall. Plain Node (postgres + fetch),
// no TS/workspace deps. Additive — only sets cortex_nodes.embedding.
//
// Usage:  node packages/database/scripts/embed-cortex.mjs
// Reads DATABASE_URL + OPENAI_API_KEY from repo-root or apps/web .env.local.
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnv() {
  for (const rel of ['../../../.env.local', '../../../apps/web/.env.local']) {
    try {
      const txt = readFileSync(resolve(__dirname, rel), 'utf8')
      for (const line of txt.split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
      }
    } catch {
      /* file may not exist */
    }
  }
}
loadEnv()

const url = process.env.DATABASE_URL
const key = process.env.OPENAI_API_KEY
if (!url || !key) {
  console.error('Missing DATABASE_URL or OPENAI_API_KEY')
  process.exit(1)
}

const sql = postgres(url, { prepare: false, max: 1 })

const embedText = (n) =>
  [n.node_type, n.title ?? '', n.summary ?? ''].filter(Boolean).join(' — ').slice(0, 8000)

async function embedBatch(texts) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: texts }),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.data.map((d) => d.embedding)
}

let total = 0
try {
  for (;;) {
    const rows = await sql`
      select id, node_type, title, summary
      from cortex_nodes
      where embedding is null and valid_to is null
      limit 64`
    if (rows.length === 0) break
    const vecs = await embedBatch(rows.map(embedText))
    for (let i = 0; i < rows.length; i++) {
      const v = `[${vecs[i].join(',')}]`
      await sql`update cortex_nodes set embedding = ${v}::vector, last_verified_at = now() where id = ${rows[i].id}`
    }
    total += rows.length
    console.log(`embedded ${total}`)
  }
  console.log(`done — embedded ${total} node(s)`)
} catch (err) {
  console.error('embed failed:', err.message)
  process.exitCode = 1
} finally {
  await sql.end()
}
