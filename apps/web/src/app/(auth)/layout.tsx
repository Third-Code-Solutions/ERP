export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-neutral-50)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '400px',
          padding: '0 16px',
        }}
      >
        {children}
      </div>
    </div>
  )
}
