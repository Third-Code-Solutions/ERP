'use client'
export default function Error({ reset }: { reset: () => void }) { return <div className="card" role="alert"><div className="card-header"><h1 className="card-title">Project submittals</h1></div><div className="card-empty">Submittal register could not be loaded. <button type="button" className="button-secondary" onClick={reset}>Try again</button></div></div> }
