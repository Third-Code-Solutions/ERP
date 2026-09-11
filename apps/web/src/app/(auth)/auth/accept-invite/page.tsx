import { AcceptInviteForm } from './accept-invite-form'

export const metadata = { title: 'Accept invitation', robots: { index: false, follow: false } }

export default function AcceptInvitePage() {
  return <><header className="auth-form-header"><h1 className="auth-form-title">Accept your invitation</h1><p className="auth-form-sub">Set a password for your verified invited account. Your tenant and role are assigned by the server.</p></header><AcceptInviteForm /></>
}
