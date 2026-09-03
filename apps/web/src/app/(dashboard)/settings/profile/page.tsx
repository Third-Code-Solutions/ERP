import type { Metadata } from 'next'
import Link from 'next/link'

import { requireUserProfile } from '@third-code-erp/auth'

import { roleLabel } from '@/lib/operations/nav-config'

import { ChangePasswordForm } from './change-password-form'

export const metadata: Metadata = { title: 'Profile settings' }

export default async function ProfileSettingsPage() {
  const profile = await requireUserProfile()

  return (
    <div style={{ maxWidth: 860 }}>
      <div className="page-header">
        <p style={{ margin: '0 0 6px', fontSize: 13 }}>
          <Link href="/settings" style={{ color: 'var(--color-navy-700)' }}>
            Settings
          </Link>{' '}
          / Profile
        </p>
        <h1 className="page-title">Profile</h1>
        <p className="page-subtitle">
          Review your account identity and change your sign-in password.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
          gap: 24,
        }}
      >
        <section
          aria-labelledby="profile-details-heading"
          style={cardStyle}
        >
          <h2 id="profile-details-heading" style={sectionHeadingStyle}>
            Account profile
          </h2>
          <dl style={{ margin: 0 }}>
            <ProfileDetail label="Name" value={profile.fullName || '—'} />
            <ProfileDetail label="Email" value={profile.email || profile.user.email || '—'} />
            <ProfileDetail label="Role" value={roleLabel(profile.role)} />
            <ProfileDetail label="User ID" value={profile.user.id} mono />
          </dl>
        </section>

        <section
          aria-labelledby="change-password-heading"
          style={cardStyle}
        >
          <h2 id="change-password-heading" style={sectionHeadingStyle}>
            Change password
          </h2>
          <p
            style={{
              margin: '0 0 18px',
              color: 'var(--color-neutral-500)',
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            Confirm your current password, then choose a new password with 12 to 128 characters.
          </p>
          <ChangePasswordForm />
        </section>
      </div>
    </div>
  )
}

function ProfileDetail({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <dt
        style={{
          marginBottom: 4,
          color: 'var(--color-neutral-400)',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          margin: 0,
          color: 'var(--color-neutral-800)',
          fontFamily: mono ? 'var(--font-mono)' : 'inherit',
          fontSize: 14,
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </dd>
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  padding: 24,
  background: 'white',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
}

const sectionHeadingStyle: React.CSSProperties = {
  margin: '0 0 16px',
  color: 'var(--color-neutral-700)',
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
}
