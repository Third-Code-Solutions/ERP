'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createUser } from '@/app/(dashboard)/admin/users/actions'

const ROLE_GROUPS: Array<{ heading: string; roles: readonly string[] }> = [
  {
    heading: 'ABI OPS',
    roles: [
      'admin',
      'sales',
      'commercial',
      'design',
      'sd_pm_pe',
      'finance',
      'procurement',
      'safety',
      'cx',
      'viewer',
    ],
  },
  {
    heading: 'Legacy (back-compat)',
    roles: ['owner', 'estimator', 'pm'],
  },
]

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin — workspace-wide write',
  owner: 'Owner — legacy super-admin',
  sales: 'Sales',
  commercial: 'Commercial',
  design: 'Design',
  sd_pm_pe: 'SD / PM / PE',
  finance: 'Finance',
  procurement: 'Procurement',
  safety: 'Safety',
  cx: 'Customer Experience',
  viewer: 'Viewer — read-only',
  estimator: 'Estimator (legacy)',
  pm: 'PM (legacy)',
}

export function NewUserForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [showPassword, setShowPassword] = useState(false)
  const [pwd, setPwd] = useState('')

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formEl = e.currentTarget
    const formData = new FormData(formEl)
    const email = String(formData.get('email') ?? '')
    setError(null)
    startTransition(async () => {
      try {
        const res = await createUser(formData)
        if (res?.error) {
          setError(res.error)
          return
        }
        if (!res?.userId) {
          setError('Unexpected response from server — no userId returned.')
          return
        }
        // Route to the LIST page with a flash param. The detail page
        // is gated behind a separate "Manage →" link from the list —
        // avoiding the redirect-then-render race that was causing the
        // RSC render error on this freshly-created user.
        const flash = encodeURIComponent(email)
        router.push(`/admin/users?created=${flash}`)
        router.refresh()
      } catch (err) {
        // Network failure or unexpected throw — surface to the user.

        console.error('createUser failed', err)
        setError(
          err instanceof Error
            ? `Network error: ${err.message}`
            : 'Could not reach the server. Please try again.'
        )
      }
    })
  }

  function generatePassword() {
    // 16 chars, mixed case + digits + symbols subset
    const alphabet =
      'ABCDEFGHJKLMNPQRSTUVWXYZ' +
      'abcdefghijkmnopqrstuvwxyz' +
      '23456789' +
      '!@#$%&*'
    let out = ''
    const arr = new Uint32Array(16)
    crypto.getRandomValues(arr)
    for (let i = 0; i < 16; i++) {
      out += alphabet[arr[i]! % alphabet.length]
    }
    setPwd(out)
    setShowPassword(true)
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label htmlFor="full_name" style={labelStyle}>
          Full name *
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          minLength={2}
          maxLength={255}
          placeholder="Juan Dela Cruz"
          style={inputStyle}
          autoComplete="name"
        />
      </div>

      <div>
        <label htmlFor="email" style={labelStyle}>
          Email *
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          required
          maxLength={255}
          placeholder="juan@actuatebuilders.ph"
          style={inputStyle}
          autoComplete="off"
        />
        <p style={hintStyle}>
          The user will sign in with this address. Must be unique in this workspace.
        </p>
      </div>

      <div>
        <label htmlFor="password" style={labelStyle}>
          Initial password *
        </label>
        <div style={{ position: 'relative' }}>
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            required
            minLength={12}
            maxLength={128}
            placeholder="At least 12 characters"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            style={{ ...inputStyle, paddingRight: 96 }}
            autoComplete="new-password"
          />
          <div
            style={{
              position: 'absolute',
              right: 6,
              top: 4,
              display: 'flex',
              gap: 4,
            }}
          >
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              style={miniButtonStyle}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
            <button
              type="button"
              onClick={generatePassword}
              style={{ ...miniButtonStyle, color: 'var(--color-gold-600)' }}
            >
              Generate
            </button>
          </div>
        </div>
        <p style={hintStyle}>
          12+ characters. Share this with the user securely; they can change it after
          signing in.
        </p>
      </div>

      <div>
        <label htmlFor="role" style={labelStyle}>
          Role *
        </label>
        <select id="role" name="role" defaultValue="viewer" required style={inputStyle}>
          {ROLE_GROUPS.map((group) => (
            <optgroup key={group.heading} label={group.heading}>
              {group.roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r] ?? r}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <p style={hintStyle}>
          Roles map onto the capability matrix in REFACTOR.md §2. Admin grants
          workspace-wide write; Viewer is read-only.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            background: 'var(--color-danger-soft)',
            border: '1px solid color-mix(in oklch, var(--color-danger) 18%, transparent)',
            borderRadius: 'var(--radius-md, 6px)',
            color: 'var(--color-danger)',
            padding: '10px 12px',
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          type="submit"
          disabled={pending}
          style={{
            padding: '10px 18px',
            background: pending ? 'var(--color-neutral-300)' : 'var(--color-navy-700)',
            color: 'white',
            border: 0,
            borderRadius: 'var(--radius-md, 6px)',
            fontSize: 14,
            fontWeight: 600,
            cursor: pending ? 'wait' : 'pointer',
            minWidth: 140,
          }}
          aria-busy={pending || undefined}
        >
          {pending ? 'Creating…' : 'Create user'}
        </button>
        <Link
          href="/admin/users"
          style={{
            padding: '10px 14px',
            color: 'var(--color-neutral-600)',
            textDecoration: 'none',
            fontSize: 14,
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md, 6px)',
            fontWeight: 500,
          }}
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12.5,
  fontWeight: 500,
  color: 'var(--color-neutral-700)',
  marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 42,
  padding: '0 12px',
  background: 'white',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md, 6px)',
  fontFamily: 'inherit',
  fontSize: 14,
  color: 'var(--color-neutral-900)',
  boxSizing: 'border-box',
  outline: 'none',
}

const miniButtonStyle: React.CSSProperties = {
  height: 32,
  padding: '0 10px',
  background: 'transparent',
  border: 0,
  borderRadius: 'var(--radius-sm, 4px)',
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--color-navy-700)',
  cursor: 'pointer',
}

const hintStyle: React.CSSProperties = {
  margin: '6px 0 0',
  fontSize: 11.5,
  color: 'var(--color-neutral-500)',
  lineHeight: 1.5,
}
