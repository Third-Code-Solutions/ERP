export default function Loading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        className="skeleton"
        style={{ height: 24, width: 320, borderRadius: 6 }}
      />
      <div
        className="skeleton"
        style={{ height: 14, width: 240, borderRadius: 6 }}
      />
      <div
        className="skeleton"
        style={{ height: 280, borderRadius: 8 }}
      />
      <div
        className="skeleton"
        style={{ height: 360, borderRadius: 8 }}
      />
    </div>
  )
}
