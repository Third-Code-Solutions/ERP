import { NextResponse } from 'next/server'

import { deploymentRevision } from '@/lib/deployment-revision'

export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: 'third-code-erp-web',
      revision: deploymentRevision(),
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  )
}
