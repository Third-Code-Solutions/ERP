export default function UpdatePasswordLoading() {
  return (
    <div aria-label="Loading new password form" aria-busy="true">
      <div className="skeleton" style={{ height: 32, width: 260, marginBottom: 12 }} />
      <div className="skeleton" style={{ height: 18, width: '100%', marginBottom: 28 }} />
      <div className="skeleton" style={{ height: 44, width: '100%', marginBottom: 18 }} />
      <div className="skeleton" style={{ height: 44, width: '100%', marginBottom: 18 }} />
      <div className="skeleton" style={{ height: 44, width: '100%' }} />
    </div>
  )
}
