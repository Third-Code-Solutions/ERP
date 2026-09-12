'use client'

import React, { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  updateUserRole,
  resetUserPassword,
  deleteUser,
} from '@/app/(dashboard)/admin/users/actions'
import {
  ASSIGNABLE_ROLES,
  type AssignableRole,
} from '@/app/(dashboard)/admin/users/roles'

interface Props {
  userId: string
  currentRole: AssignableRole
  email: string
  isSelf: boolean
}

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin — workspace-wide write',
  owner: 'Owner — workspace administrator',
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

type RoleRequest = {
  userId: string
  role: AssignableRole
  expectedRole: AssignableRole
  clientRequestId: string
}

function isAssignableRole(value: string): value is AssignableRole {
  return (ASSIGNABLE_ROLES as readonly string[]).includes(value)
}

function newClientRequestId(): string {
  return crypto.randomUUID()
}

const roleUnknownMessage =
  'Role change outcome could not be confirmed. Retry the same request.'

type RoleEditorProps = Pick<Props, 'userId' | 'currentRole' | 'isSelf'>

function RoleEditor({ userId, currentRole, isSelf }: RoleEditorProps) {
  const router = useRouter()
  const [roleError, setRoleError] = useState<string | null>(null)
  const [roleRefreshError, setRoleRefreshError] = useState<string | null>(null)
  const [roleOk, setRoleOk] = useState(false)
  const [roleSelection, setRoleSelection] = useState<AssignableRole>(currentRole)
  const [expectedRole, setExpectedRole] = useState<AssignableRole>(currentRole)
  const [clientRequestId, setClientRequestId] = useState('')
  const [roleSubmitting, setRoleSubmitting] = useState(false)
  const [roleUnknown, setRoleUnknown] = useState(false)
  const roleGenerationRef = useRef(0)
  const roleRequestRef = useRef<RoleRequest | null>(null)
  const mountedRef = useRef(false)
  const [, startTransition] = useTransition()

  // The parent keys this editor by user ID. Cleanup invalidates every
  // response from the previous row before a replacement can render.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      roleGenerationRef.current += 1
    }
  }, [])

  useEffect(() => {
    const hasUnresolvedCommand = roleRequestRef.current !== null
    if (!hasUnresolvedCommand) {
      roleGenerationRef.current += 1
      roleRequestRef.current = null
      setRoleSelection(currentRole)
      setExpectedRole(currentRole)
      setClientRequestId('')
      setRoleError(null)
      setRoleRefreshError(null)
      setRoleOk(false)
      setRoleSubmitting(false)
      setRoleUnknown(false)
    }
  }, [currentRole])

  function isCurrentRequest(requestGeneration: number): boolean {
    return mountedRef.current && requestGeneration === roleGenerationRef.current
  }

  function markRoleUnknown(request: RoleRequest, message = roleUnknownMessage) {
    roleRequestRef.current = request
    setRoleUnknown(true)
    setRoleError(message)
  }

  function submitRoleRequest(request: RoleRequest) {
    const requestGeneration = roleGenerationRef.current
    const requestWasUncertain = roleUnknown
    roleRequestRef.current = request
    setRoleError(null)
    setRoleRefreshError(null)
    setRoleOk(false)
    setRoleSubmitting(true)
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.set('user_id', request.userId)
        formData.set('role', request.role)
        formData.set('expected_role', request.expectedRole)
        formData.set('client_request_id', request.clientRequestId)
        const res = await updateUserRole(formData)
        if (!isCurrentRequest(requestGeneration)) return

        if (
          typeof res !== 'object' ||
          res === null ||
          !('ok' in res) ||
          typeof res.ok !== 'boolean'
        ) {
          markRoleUnknown(request)
          return
        }

        if (res.ok) {
          if (
            !('role' in res) ||
            typeof res.role !== 'string' ||
            !isAssignableRole(res.role) ||
            res.role !== request.role
          ) {
            markRoleUnknown(request)
            return
          }
          const committedRole = res.role
          roleRequestRef.current = null
          setRoleSelection(committedRole)
          setExpectedRole(committedRole)
          setClientRequestId('')
          setRoleUnknown(false)
          setRoleError(null)
          setRoleRefreshError(null)
          setRoleOk(true)
          try {
            router.refresh()
          } catch {
            // The Core commit is already confirmed; a refresh failure must
            // not turn it into an uncertain mutation or invite a new retry.
            setRoleRefreshError(
              'Role updated, but this page could not refresh. Refresh to review the current role.',
            )
          }
          return
        }

        if (
          !('outcome' in res) ||
          (res.outcome !== 'unknown' && res.outcome !== 'rejected') ||
          !('error' in res) ||
          typeof res.error !== 'string' ||
          res.error.trim().length === 0
        ) {
          markRoleUnknown(request)
          return
        }

        if (res.outcome === 'unknown') {
          // Keep this exact request available: an unknown Core outcome may
          // already have committed and must only be retried with the same key.
          markRoleUnknown(request, res.error)
          return
        }

        if (requestWasUncertain) {
          // A rejected replay can still follow an original commit whose
          // response was lost. Keep uncertainty sticky until Core confirms the
          // exact command with ok:true.
          markRoleUnknown(
            request,
            `Earlier role change remains unconfirmed. Retry rejected: ${res.error}`,
          )
          return
        }

        // A known rejection was not committed. A later deliberate submit may
        // use a fresh key, while refresh/review remains the primary recovery.
        roleRequestRef.current = null
        setClientRequestId('')
        setRoleUnknown(false)
        setRoleRefreshError(null)
        setRoleError(res.error)
      } catch {
        if (!isCurrentRequest(requestGeneration)) return
        markRoleUnknown(request)
      } finally {
        if (isCurrentRequest(requestGeneration)) {
          setRoleSubmitting(false)
        }
      }
    })
  }

  function handleRole(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (roleSubmitting || roleUnknown) return
    const request =
      roleRequestRef.current ?? {
        userId,
        role: roleSelection,
        expectedRole,
        clientRequestId: clientRequestId || newClientRequestId(),
      }
    if (!clientRequestId) setClientRequestId(request.clientRequestId)
    submitRoleRequest(request)
  }

  function handleRoleSelection(e: React.ChangeEvent<HTMLSelectElement>) {
    const nextRole = e.currentTarget.value
    if (!isAssignableRole(nextRole)) return
    const nextRequest: RoleRequest = {
      userId,
      role: nextRole,
      expectedRole,
      clientRequestId: newClientRequestId(),
    }
    roleRequestRef.current = nextRequest
    setRoleSelection(nextRole)
    setClientRequestId(nextRequest.clientRequestId)
    setRoleError(null)
    setRoleRefreshError(null)
    setRoleOk(false)
  }

  function handleRetryRole() {
    if (roleSubmitting || !roleUnknown || !roleRequestRef.current) return
    submitRoleRequest(roleRequestRef.current)
  }

  function handleReviewRole() {
    // Rebase only after the user explicitly asks to review a known rejection.
    // An unresolved command is never rebased because its original key may
    // still identify a committed Core mutation.
    roleGenerationRef.current += 1
    roleRequestRef.current = null
    setRoleSelection(currentRole)
    setExpectedRole(currentRole)
    setClientRequestId('')
    setRoleUnknown(false)
    setRoleError(null)
    setRoleRefreshError(null)
    setRoleOk(false)
    try {
      router.refresh()
    } catch {
      setRoleRefreshError('This page could not refresh. Try refreshing the browser.')
    }
  }

  return (
    <section>
      <h3 id="admin-user-role-heading" style={sectionHead}>Role</h3>
      <form
        onSubmit={handleRole}
        aria-labelledby="admin-user-role-heading"
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'flex-end',
          flexWrap: 'wrap',
        }}
      >
        <input type="hidden" name="user_id" value={userId} />
        <input type="hidden" name="expected_role" value={expectedRole} />
        <input type="hidden" name="client_request_id" value={clientRequestId} />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            flex: '1 1 220px',
            minWidth: 0,
          }}
        >
          <label
            htmlFor="admin-user-role-select"
            style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}
          >
            Assign role
          </label>
          <select
            id="admin-user-role-select"
            name="role"
            value={roleSelection}
            onChange={handleRoleSelection}
            disabled={roleSubmitting || roleUnknown}
            style={{ ...selectStyle, width: '100%', minWidth: 0 }}
            aria-describedby="admin-user-role-help"
            aria-invalid={roleError ? true : undefined}
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r] ?? r}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={roleSubmitting || roleUnknown}
          style={primaryButton(roleSubmitting || roleUnknown)}
        >
          {roleSubmitting ? 'Saving…' : 'Save role'}
        </button>
      </form>
      {isSelf ? (
        <p id="admin-user-role-help" style={hint}>
          You cannot demote your own admin role — that would lock you out.
        </p>
      ) : (
        <p id="admin-user-role-help" style={hint}>
          Role changes are checked against the current workspace permissions.
        </p>
      )}
      {roleSubmitting && (
        <p role="status" aria-live="polite" aria-busy="true" style={hint}>
          Saving role…
        </p>
      )}
      {roleUnknown && (
        <div role="alert" aria-live="assertive" style={roleMessage}>
          <p style={errorText}>{roleError ?? roleUnknownMessage}</p>
          <button
            type="button"
            onClick={handleRetryRole}
            disabled={roleSubmitting}
            style={secondaryButton(roleSubmitting)}
          >
            Retry same role change
          </button>
        </div>
      )}
      {!roleUnknown && roleError && (
        <div role="alert" aria-live="assertive" style={roleMessage}>
          <p style={errorText}>{roleError}</p>
          <button
            type="button"
            onClick={handleReviewRole}
            disabled={roleSubmitting}
            style={secondaryButton(roleSubmitting)}
          >
            Refresh and review role
          </button>
        </div>
      )}
      {roleRefreshError && (
        <p role="alert" aria-live="polite" style={errorText}>
          {roleRefreshError}
        </p>
      )}
      {roleOk && !roleSubmitting && (
        <p role="status" aria-live="polite" style={successText}>
          Role updated.
        </p>
      )}
    </section>
  )
}

export function ManageUserPanel({ userId, currentRole, email, isSelf }: Props) {
  const router = useRouter()
  const [pwdError, setPwdError] = useState<string | null>(null)
  const [pwdOk, setPwdOk] = useState(false)
  const [delError, setDelError] = useState<string | null>(null)
  const [showDelete, setShowDelete] = useState(false)
  const [pending, startTransition] = useTransition()

  function handlePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const formData = new FormData(form)
    setPwdError(null)
    setPwdOk(false)
    startTransition(async () => {
      try {
        const res = await resetUserPassword(formData)
        if (res?.error) {
          setPwdError(res.error)
          return
        }
        setPwdOk(true)
        form.reset()
      } catch (err) {
        setPwdError(
          err instanceof Error
            ? `Network error: ${err.message}`
            : 'Could not reset password.'
        )
      }
    })
  }

  function handleDelete(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    setDelError(null)
    startTransition(async () => {
      try {
        const res = await deleteUser(formData)
        if (res?.error) {
          setDelError(res.error)
          return
        }
        // Client-side navigate now that the server action returned ok.
        router.push('/admin/users')
        router.refresh()
      } catch (err) {
        setDelError(
          err instanceof Error
            ? `Network error: ${err.message}`
            : 'Could not delete user.'
        )
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <RoleEditor
        key={userId}
        userId={userId}
        currentRole={currentRole}
        isSelf={isSelf}
      />

      <div style={{ borderTop: '1px solid var(--color-border)' }} />

      {/* Password reset */}
      <section>
        <h3 style={sectionHead}>Reset password</h3>
        <p style={hint}>
          Set a new password for {email}. The user must change it on next login if
          your org requires.
        </p>
        <form
          id="reset-pwd-form"
          onSubmit={handlePassword}
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
        >
          <input type="hidden" name="user_id" value={userId} />
          <input
            name="password"
            type="password"
            minLength={12}
            maxLength={128}
            required
            placeholder="At least 12 characters"
            disabled={pending}
            style={{ ...inputStyle, flex: '1 1 220px', minWidth: 0 }}
            autoComplete="new-password"
          />
          <button
            type="submit"
            disabled={pending}
            style={primaryButton(pending)}
          >
            {pending ? 'Resetting…' : 'Reset password'}
          </button>
        </form>
        {pwdError && <p style={errorText}>{pwdError}</p>}
        {pwdOk && <p style={successText}>Password updated.</p>}
      </section>

      <div style={{ borderTop: '1px solid var(--color-border)' }} />

      {/* Danger zone */}
      <section>
        <h3 style={{ ...sectionHead, color: 'var(--color-danger)' }}>Danger zone</h3>
        {!showDelete ? (
          <button
            type="button"
            onClick={() => setShowDelete(true)}
            disabled={isSelf}
            style={{
              padding: '8px 14px',
              background: 'transparent',
              color: isSelf ? 'var(--color-neutral-400)' : 'var(--color-danger)',
              border: `1px solid ${
                isSelf ? 'var(--color-border)' : 'color-mix(in oklch, var(--color-danger) 30%, transparent)'
              }`,
              borderRadius: 'var(--radius-md, 6px)',
              fontSize: 13,
              fontWeight: 500,
              cursor: isSelf ? 'not-allowed' : 'pointer',
            }}
            title={isSelf ? 'You cannot delete your own account' : undefined}
          >
            Delete this user
          </button>
        ) : (
          <form onSubmit={handleDelete} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input type="hidden" name="user_id" value={userId} />
            <p style={{ fontSize: 13, color: 'var(--color-neutral-700)', margin: 0 }}>
              This removes the auth account and the workspace user row. Audit-logged.
              This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="submit"
                disabled={pending}
                style={{
                  padding: '8px 14px',
                  background: 'var(--color-danger)',
                  color: 'white',
                  border: 0,
                  borderRadius: 'var(--radius-md, 6px)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: pending ? 'wait' : 'pointer',
                }}
              >
                {pending ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button
                type="button"
                onClick={() => setShowDelete(false)}
                style={{
                  padding: '8px 14px',
                  background: 'transparent',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md, 6px)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        {delError && <p style={errorText}>{delError}</p>}
      </section>
    </div>
  )
}

const sectionHead: React.CSSProperties = {
  margin: '0 0 8px',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--color-neutral-900)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const inputStyle: React.CSSProperties = {
  height: 38,
  padding: '0 12px',
  background: 'white',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md, 6px)',
  fontFamily: 'inherit',
  fontSize: 13.5,
  color: 'var(--color-neutral-900)',
  boxSizing: 'border-box',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
}

const primaryButton = (pending: boolean): React.CSSProperties => ({
  height: 38,
  padding: '0 14px',
  background: pending ? 'var(--color-neutral-300)' : 'var(--color-navy-700)',
  color: 'white',
  border: 0,
  borderRadius: 'var(--radius-md, 6px)',
  fontSize: 13,
  fontWeight: 600,
  cursor: pending ? 'wait' : 'pointer',
  whiteSpace: 'nowrap',
})

const hint: React.CSSProperties = {
  margin: '6px 0 0',
  fontSize: 11.5,
  color: 'var(--color-neutral-500)',
  lineHeight: 1.45,
}

const roleMessage: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
  marginTop: 6,
}

const secondaryButton = (disabled: boolean): React.CSSProperties => ({
  minHeight: 32,
  padding: '5px 10px',
  background: 'transparent',
  color: disabled ? 'var(--color-neutral-400)' : 'var(--color-navy-700)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md, 6px)',
  fontSize: 12,
  fontWeight: 600,
  cursor: disabled ? 'wait' : 'pointer',
  whiteSpace: 'nowrap',
})

const errorText: React.CSSProperties = {
  margin: '6px 0 0',
  fontSize: 12,
  color: 'var(--color-danger)',
}

const successText: React.CSSProperties = {
  margin: '6px 0 0',
  fontSize: 12,
  color: 'var(--color-success)',
}
