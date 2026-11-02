import { NativeSubmitButton } from '@/components/forms/native-submit-button'

/** Confirmation is a UX safeguard; the Core service remains the authority. */
export function PlatformSubmitButton({ children, className, confirmation }: {
  children: React.ReactNode
  className?: string
  confirmation?: string
}) {
  return <NativeSubmitButton className={className} confirmation={confirmation} pendingLabel="Working…">
    {children}
  </NativeSubmitButton>
}
