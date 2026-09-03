import { NextResponse } from 'next/server'

import { RECOVERY_MARKER_COOKIE } from '@/lib/auth-recovery-binding'

export async function POST() {
  const response = new NextResponse(null, { status: 204 })
  response.cookies.set(RECOVERY_MARKER_COOKIE, '', {
    httpOnly: true,
    maxAge: 0,
    path: '/auth/update-password',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })
  return response
}
