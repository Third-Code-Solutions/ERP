import { db } from '@third-code-erp/database'
import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    await db.execute(sql`select 1 as ready`)

    return NextResponse.json(
      {
        ok: true,
        database: 'up',
        revision: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? 'local',
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    )
  } catch {
    return NextResponse.json(
      {
        ok: false,
        database: 'down',
        revision: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? 'local',
        timestamp: new Date().toISOString(),
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    )
  }
}
