export default function Loading() {
  return (
    <div style={{ maxWidth: 720, margin: '80px auto', padding: 24, textAlign: 'center' }}>
      <div className="skeleton" style={{ width: 240, height: 26, margin: '0 auto 12px' }} />
      <div className="skeleton" style={{ width: 320, height: 14, margin: '0 auto 32px' }} />
      <div className="skeleton" style={{ height: 220 }} />
    </div>
  )
}
