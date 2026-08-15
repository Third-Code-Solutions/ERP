import { db } from '@third-code-erp/database'
import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { deploymentRevision } from '@/lib/deployment-revision'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    await db.execute(sql`select 1 as ready`)

    return NextResponse.json(
      {
        ok: true,
        database: 'up',
        revision: deploymentRevision(),
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        },
      }
    )
  } catch {
    return NextResponse.json(
      {
        ok: false,
        database: 'down',
        revision: deploymentRevision(),
        timestamp: new Date().toISOString(),
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        },
      }
    )
  }
}
