import { PlatformSubmitButton } from '../_submit-button'
import { ERP_ROLES } from '@third-code-erp/shared-types/authorization'

import {
  getPlatformInvitations,
  getPlatformTenants,
  getPlatformUsers,
} from '@/lib/platform-admin-client'
import {
  changeUserRoleAction,
  changeUserStatusAction,
  inviteUserAction,
  resendInvitationAction,
  revokeInvitationAction,
  sendPasswordResetAction,
} from '../actions'
import {
  EmptyPlatformState,
  PlatformDirectoryFilters,
  PlatformPagination,
  PlatformFlash,
  PlatformPageHeader,
  PlatformUnavailable,
  StatusPill,
} from '../_components'

export default async function PlatformUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string; invitationPage?: string; tenantQuery?: string; notice?: string; error?: string }> }) {
  const params = await searchParams
  const [users, tenants, invitations] = await Promise.all([
    getPlatformUsers(params.q, params.status, params.page),
    getPlatformTenants(params.tenantQuery, 'active'),
    getPlatformInvitations(params.invitationPage),
  ])
  const failure = !users.ok ? users.error : !tenants.ok ? tenants.error : !invitations.ok ? invitations.error : null
  return <>
    <PlatformPageHeader title="Users" description="Invite people into an exact tenant, assign tenant roles, manage lifecycle access, and initiate provider password recovery." />
    <PlatformFlash notice={params.notice} error={params.error} />
    {failure || !users.ok || !tenants.ok || !invitations.ok ? <PlatformUnavailable message={failure || 'Platform user data is unavailable.'} /> : <div className="platform-stack">
      <section className="card platform-form-card"><div className="card-header"><div><h2 className="card-title">Invite user</h2><p className="card-subtitle">The server records tenant and role intent before Supabase creates the identity.</p></div></div>
        <form method="get" action="/platform-admin/users" className="platform-filter-form"><label>Find invitation tenant<input type="search" name="tenantQuery" maxLength={120} defaultValue={params.tenantQuery} /></label><button type="submit" className="button button-secondary">Find tenant</button><span>{tenants.data.rows.length} of {tenants.data.total} matching active tenants. Narrow the search if needed.</span></form>
        <form action={inviteUserAction} className="platform-form-grid">
          <label>Tenant<select required name="tenantId" defaultValue=""><option disabled value="">Select tenant</option>{tenants.data.rows.filter((tenant) => tenant.status === 'active').map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></label>
          <label>Full name<input required name="fullName" minLength={2} maxLength={255} /></label>
          <label>Email<input required name="email" type="email" /></label>
          <label>Tenant role<select name="role" defaultValue="viewer">{ERP_ROLES.map((role) => <option key={role} value={role}>{role.replaceAll('_', ' ')}</option>)}</select></label>
          <div className="platform-form-actions"><PlatformSubmitButton className="button button-primary" confirmation="Send this invitation to the selected tenant with the displayed role?">Send invitation</PlatformSubmitButton></div>
        </form>
      </section>

      <section className="card"><div className="card-header"><div><h2 className="card-title">User directory</h2><p className="card-subtitle">{users.data.total} users across all tenants</p></div></div>
        {users.data.rows.length === 0 ? <EmptyPlatformState>No users found.</EmptyPlatformState> : <div className="platform-table-wrap"><table className="data-table"><thead><tr><th>User</th><th>Tenant</th><th>Status</th><th>Role</th><th>Lifecycle</th><th>Recovery</th></tr></thead><tbody>{users.data.rows.map((user) => <tr key={user.id}>
          <td><strong>{user.fullName}</strong><small>{user.email}</small></td><td>{user.tenantName}</td><td><StatusPill status={user.status} /></td>
          <td><form action={changeUserRoleAction} className="platform-inline-form"><input type="hidden" name="userId" value={user.id} /><select name="role" defaultValue={user.role} aria-label={`Role for ${user.fullName}`}>{ERP_ROLES.map((role) => <option key={role} value={role}>{role.replaceAll('_', ' ')}</option>)}</select><PlatformSubmitButton className="button button-secondary" confirmation="Apply this tenant role? Review the user and tenant before continuing.">Save</PlatformSubmitButton></form></td>
          <td><form action={changeUserStatusAction} className="platform-inline-form"><input type="hidden" name="userId" value={user.id} /><select name="status" defaultValue={user.status === 'invited' ? 'active' : user.status} aria-label={`Lifecycle for ${user.fullName}`}><option value="active">Active</option><option value="suspended">Suspended</option><option value="disabled">Disabled</option></select><input name="reason" placeholder="Reason if inactive" maxLength={500} aria-label={`Status reason for ${user.fullName}`} /><PlatformSubmitButton className="button button-secondary" confirmation="Apply this lifecycle change? Suspended or disabled access takes effect immediately.">Apply</PlatformSubmitButton></form></td>
          <td><form action={sendPasswordResetAction}><input type="hidden" name="userId" value={user.id} /><PlatformSubmitButton className="button button-secondary" confirmation="Send password recovery instructions to this user?">Send reset</PlatformSubmitButton></form></td>
        </tr>)}</tbody></table></div>}
        <PlatformDirectoryFilters path="/platform-admin/users" q={params.q} status={params.status} statuses={['invited', 'active', 'suspended', 'disabled']} />
        <PlatformPagination path="/platform-admin/users" page={users.data.page} totalPages={users.data.totalPages} params={params} />
      </section>

      <section className="card"><div className="card-header"><div><h2 className="card-title">Invitations</h2><p className="card-subtitle">Provider-bound invitation state; failures remain visible.</p></div></div>
        {invitations.data.rows.length === 0 ? <EmptyPlatformState>No invitations recorded.</EmptyPlatformState> : <div className="platform-table-wrap"><table className="data-table"><thead><tr><th>Invitee</th><th>Tenant</th><th>Role</th><th>Status</th><th>Sent</th><th>Actions</th></tr></thead><tbody>{invitations.data.rows.map((invitation) => <tr key={invitation.id}><td><strong>{invitation.fullName}</strong><small>{invitation.email}</small></td><td>{invitation.tenantName}</td><td>{invitation.role}</td><td><StatusPill status={invitation.status} />{invitation.failureReason ? <small>{invitation.failureReason}</small> : null}</td><td>{invitation.sentAt ? new Date(invitation.sentAt).toLocaleString() : 'Not sent'}</td><td><div className="platform-row-actions">{invitation.status === 'sent' ? <form action={resendInvitationAction}><input type="hidden" name="invitationId" value={invitation.id} /><PlatformSubmitButton className="button button-secondary" confirmation="Resend this user invitation?">Resend</PlatformSubmitButton></form> : null}{['pending', 'sent'].includes(invitation.status) ? <form action={revokeInvitationAction}><input type="hidden" name="invitationId" value={invitation.id} /><PlatformSubmitButton className="button button-danger" confirmation="Revoke this invitation and disable its pending account?">Revoke</PlatformSubmitButton></form> : null}</div></td></tr>)}</tbody></table></div>}
      </section>
      <PlatformPagination path="/platform-admin/users" page={invitations.data.page} totalPages={invitations.data.totalPages} params={params} pageKey="invitationPage" />
    </div>}
  </>
}
