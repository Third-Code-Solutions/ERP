export default function Loading() {
  return (
    <section
      style={{
        background: 'white',
        border: '1px solid #e1e4ea',
        borderRadius: 12,
        padding: 32,
      }}
    >
      <div style={{ height: 14, width: '40%', background: '#eef0f4', borderRadius: 4 }} />
      <div style={{ height: 24, width: '70%', background: '#eef0f4', borderRadius: 6, marginTop: 12 }} />
      <div style={{ height: 14, width: '90%', background: '#eef0f4', borderRadius: 4, marginTop: 18 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 24 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ height: 42, background: '#eef0f4', borderRadius: 8 }} />
        ))}
      </div>
    </section>
  )
}
