import { redirect } from 'next/navigation'

// Public sign-up is closed: accounts are created by invitation only.
export default function SignupPage() {
  redirect('/auth/login')
}
