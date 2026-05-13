/**
 * Skeleton state for the customer-portal overview. Preserves layout so
 * users don't see a content shift when the data arrives.
 */
export default function Loading() {
  return (
    <div>
      <section
        style={{
          background: 'white',
          border: '1px solid #e1e4ea',
          borderRadius: 12,
          padding: 24,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 16,
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{
                background: '#fafbfc',
                border: '1px solid #eef0f4',
                borderRadius: 10,
                padding: 16,
              }}
            >
              <div
                style={{
                  height: 11,
                  width: '50%',
                  background: '#eef0f4',
                  borderRadius: 4,
                }}
              />
              <div
                style={{
                  height: 26,
                  width: '70%',
                  background: '#eef0f4',
                  borderRadius: 6,
                  marginTop: 12,
                }}
              />
            </div>
          ))}
        </div>
      </section>

      <section
        style={{
          background: 'white',
          border: '1px solid #e1e4ea',
          borderRadius: 12,
          padding: 24,
        }}
      >
        <div
          style={{
            height: 14,
            width: '30%',
            background: '#eef0f4',
            borderRadius: 4,
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{ height: 38, background: '#eef0f4', borderRadius: 8 }}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
