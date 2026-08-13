export default function RootLoading() {
  return (
    <main className="route-state route-state-loading" role="status" aria-live="polite">
      <span className="sr-only">Loading ABI OPS</span>
      <div className="skeleton" style={{ height: 28, width: 240, marginBottom: 10 }} />
      <div className="skeleton" style={{ height: 16, width: 360, marginBottom: 28 }} />
      <div className="route-state-loading-grid" aria-hidden="true">
        {Array.from({ length: 3 }).map((_, index) => (
          <div className="skeleton route-state-loading-card" key={index} />
        ))}
      </div>
    </main>
  )
}
