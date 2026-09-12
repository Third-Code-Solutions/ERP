'use client'

import { useActionState } from 'react'
import { importLegacySchedule, previewLegacySchedule, type LegacyScheduleActionState, type ProjectScheduleActionState } from './actions'

export function LegacyScheduleImport({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState<LegacyScheduleActionState, FormData>(previewLegacySchedule, { ok: true })
  return <section className="card" style={{ marginBottom: 16, padding: 16 }} aria-labelledby="legacy-import-title">
    <h2 id="legacy-import-title" className="card-title">Import stored Level 1 schedule</h2>
    <p className="form-help">Review the latest schedule uploaded in Project Progress. Names, dates and predecessors become L1 tasks. The original schedule and percentage curves are retained. Labour starts at zero because the source has no labour estimates.</p>
    <form action={action} aria-busy={pending}>
      <input type="hidden" name="projectId" value={projectId} />
      <button className="button-secondary" disabled={pending}>{pending ? 'Loading preview…' : 'Preview stored schedule'}</button>
      <a href={`/projects/${projectId}/progress`} style={{ marginLeft: 12 }}>Open Project Progress</a>
    </form>
    {state.error ? <p role="alert">{state.error}</p> : null}
    {!pending && state.preview ? <ImportPreview key={state.preview.sourceHash} preview={state.preview} /> : null}
  </section>
}

function ImportPreview({ preview }: { preview: NonNullable<LegacyScheduleActionState['preview']> }) {
  const [state, action, pending] = useActionState<ProjectScheduleActionState, FormData>(importLegacySchedule, { ok: true })
  return <div>
    <p>{preview.tasks.length} validated tasks. Review all rows before confirming. Existing tasks are never overwritten; conflicting task codes reject the entire import.</p>
    <div className="data-table-wrap" style={{ maxHeight: 360, overflowY: 'auto' }} tabIndex={0} role="region" aria-label="Legacy schedule preview">
      <table className="data-table"><caption className="sr-only">Stored Level 1 tasks to import</caption><thead><tr><th scope="col">Code</th><th scope="col">Name</th><th scope="col">Start</th><th scope="col">Finish</th><th scope="col">Predecessor</th></tr></thead><tbody>
        {preview.tasks.map((task, index) => <tr key={index}><td>L1-{String(index + 1).padStart(3, '0')}</td><td>{task.name}</td><td>{task.start_date}</td><td>{task.finish_date}</td><td>{task.predecessor_index === null ? 'None' : `L1-${String(task.predecessor_index + 1).padStart(3, '0')}`}</td></tr>)}
      </tbody></table>
    </div>
    <form action={action} aria-busy={pending} style={{ marginTop: 12 }}>
      <input type="hidden" name="projectId" value={preview.projectId} />
      <input type="hidden" name="sourceScheduleId" value={preview.sourceScheduleId} />
      <input type="hidden" name="sourceHash" value={preview.sourceHash} />
      <button className="button-primary" disabled={pending || Boolean(state.success)}>{pending ? 'Importing…' : state.error ? 'Retry confirmed import' : 'Confirm import to L1'}</button>
    </form>
    {state.error ? <p role="alert">{state.error}</p> : null}
    {state.success ? <p role="status">{state.success}</p> : null}
  </div>
}
