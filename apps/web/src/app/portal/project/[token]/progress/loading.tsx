export default function Loading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div
        className="skeleton"
        style={{ height: 120, borderRadius: 10 }}
      />
      <div
        className="skeleton"
        style={{ height: 320, borderRadius: 10 }}
      />
      <div
        className="skeleton"
        style={{ height: 280, borderRadius: 10 }}
      />
    </div>
  )
}
