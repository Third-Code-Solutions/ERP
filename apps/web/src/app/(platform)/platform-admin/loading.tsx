export default function PlatformLoading() {
  return (
    <div className="platform-loading" role="status" aria-live="polite">
      <div className="platform-loading-line is-wide" />
      <div className="platform-loading-line" />
      <div className="platform-loading-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="platform-loading-card" key={index} />
        ))}
      </div>
      <span className="sr-only">Loading protected platform data…</span>
    </div>
  )
}
