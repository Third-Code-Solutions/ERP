// Phase 10 (Rework-alignment) — Weekly Report HTML builder.
//
// Mirrors the print-friendly idiom used in
// `apps/web/src/lib/pdf/site-inspection-report.ts`. We emit a complete
// self-contained HTML document (inline styles only) so the same string can
// be served by:
//   - the (print) route via <iframe srcDoc=...> for browser "Save as PDF",
//   - the API route at /api/weekly-report/[id] for shareable links,
//   - and persisted as a static .html artifact in Supabase Storage.
//
// All user-supplied content is escaped via the inline `esc()` helper. No
// external dependencies — keeps the bundle small and the render
// deterministic across runtimes.

const BRAND_NAVY = '#1F3864'
const BRAND_GOLD = '#C9A227'
const TEXT_PRIMARY = '#111827'
const TEXT_MUTED = '#6b7280'
const TEXT_DIM = '#9ca3af'
const BORDER = '#e5e7eb'
const SURFACE_ALT = '#f9fafb'
const POS = '#15803d'
const NEG = '#b91c1c'

// Minimal HTML escape — covers the five XML-significant characters which is
// sufficient for plain text inside element bodies and double-quoted
// attributes. Mirrors the inspection report builder.
function esc(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return '—'
  }
}

function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

function clampPct(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(100, Math.round(v * 10) / 10))
}

export interface WeeklyReportSnapshot {
  overall_pct: number
  by_category: {
    civil_pct: number
    electrical_pct: number
    mep_pct: number
    finishes_pct: number
  }
  tasks_completed: Array<{
    title: string
    assignee?: string | null
    completed_at: string
  }>
  milestones_reached: Array<{
    title: string
    date: string
  }>
  open_punchlist_count: number
  schedule_variance_days: number
  photos: Array<{ url: string; caption?: string | null }>
  notes: string
  next_week_focus: string
}

export interface WeeklyReportProject {
  id?: string | null
  name?: string | null
  client?: string | null
  location?: string | null
}

export interface WeeklyReportAccount {
  id?: string | null
  name?: string | null
  billing_address?: string | null
}

interface KpiCardArgs {
  label: string
  value: string
  sub?: string
  tone?: 'neutral' | 'positive' | 'negative'
}

function renderKpiCard({ label, value, sub, tone = 'neutral' }: KpiCardArgs): string {
  const valueColor =
    tone === 'positive' ? POS : tone === 'negative' ? NEG : TEXT_PRIMARY
  return `
    <div style="border:1px solid ${BORDER};border-radius:8px;padding:14px 16px;background:white;">
      <div style="font-size:10px;font-weight:700;color:${TEXT_DIM};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">
        ${esc(label)}
      </div>
      <div style="font-size:22px;font-weight:800;color:${valueColor};font-variant-numeric:tabular-nums;line-height:1.1;letter-spacing:-0.01em;text-align:right;">
        ${esc(value)}
      </div>
      ${sub ? `<div style="font-size:11px;color:${TEXT_MUTED};margin-top:4px;text-align:right;">${esc(sub)}</div>` : ''}
    </div>
  `
}

function renderProgressBar(label: string, pct: number): string {
  const v = clampPct(pct)
  return `
    <div style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
        <span style="font-size:12px;color:${TEXT_MUTED};font-weight:500;">${esc(label)}</span>
        <span style="font-size:12px;color:${TEXT_PRIMARY};font-weight:600;font-variant-numeric:tabular-nums;">${v.toFixed(1)}%</span>
      </div>
      <div style="height:8px;background:${SURFACE_ALT};border-radius:4px;overflow:hidden;border:1px solid ${BORDER};">
        <div style="height:100%;width:${v}%;background:${BRAND_NAVY};border-radius:4px;"></div>
      </div>
    </div>
  `
}

function renderTaskRow(t: {
  title: string
  assignee?: string | null
  completed_at: string
}): string {
  return `
    <li style="padding:8px 0;border-bottom:1px solid ${BORDER};display:flex;justify-content:space-between;gap:12px;break-inside:avoid;">
      <div style="flex:1;min-width:0;">
        <div style="font-size:12.5px;color:${TEXT_PRIMARY};line-height:1.4;">${esc(t.title)}</div>
        ${t.assignee ? `<div style="font-size:10.5px;color:${TEXT_MUTED};margin-top:2px;">Assignee: ${esc(t.assignee)}</div>` : ''}
      </div>
      <div style="font-size:11px;color:${TEXT_MUTED};white-space:nowrap;font-variant-numeric:tabular-nums;">${formatDate(t.completed_at)}</div>
    </li>
  `
}

function renderMilestoneRow(m: { title: string; date: string }): string {
  return `
    <li style="padding:8px 0;border-bottom:1px solid ${BORDER};display:flex;justify-content:space-between;gap:12px;break-inside:avoid;">
      <div style="font-size:12.5px;color:${TEXT_PRIMARY};font-weight:500;">
        <span style="display:inline-block;width:6px;height:6px;border-radius:9999px;background:${BRAND_GOLD};margin-right:8px;vertical-align:middle;"></span>
        ${esc(m.title)}
      </div>
      <div style="font-size:11px;color:${TEXT_MUTED};white-space:nowrap;font-variant-numeric:tabular-nums;">${formatDate(m.date)}</div>
    </li>
  `
}

function renderPhotoCell(p: { url: string; caption?: string | null }, i: number): string {
  // We embed an <img> with a defensive alt and crop to a fixed cell to keep
  // the 3x3 grid layout-stable across photo aspect ratios.
  const caption = p.caption ? esc(p.caption) : `Photo ${i + 1}`
  return `
    <figure style="margin:0;border:1px solid ${BORDER};border-radius:6px;overflow:hidden;background:${SURFACE_ALT};break-inside:avoid;">
      <img src="${esc(p.url)}" alt="${caption}" style="display:block;width:100%;height:120px;object-fit:cover;background:#e5e7eb;" />
      <figcaption style="padding:5px 7px;font-size:10px;color:${TEXT_MUTED};line-height:1.3;">${caption}</figcaption>
    </figure>
  `
}

/**
 * Build a complete, self-contained HTML document for a weekly project report.
 * Inline styles only — no external CSS so the report renders identically
 * whether served via the /print route, the API endpoint, or saved to
 * Supabase Storage as a static .html file.
 */
export function buildWeeklyReportHtml(
  snapshot: WeeklyReportSnapshot,
  project: WeeklyReportProject | null,
  account: WeeklyReportAccount | null,
  meta?: {
    week_ending?: Date | string | null
    generated_at?: Date | string | null
    report_id?: string | null
    tenant_name?: string | null
  }
): string {
  const weekEnding = formatDate(meta?.week_ending ?? null)
  const generatedAt = formatDateTime(meta?.generated_at ?? new Date())
  const reportIdShort = meta?.report_id ? esc(meta.report_id.slice(0, 8).toUpperCase()) : ''
  const tenantName = esc(meta?.tenant_name ?? 'ABI Ops')

  const overall = clampPct(snapshot.overall_pct)
  const variance = Number.isFinite(snapshot.schedule_variance_days)
    ? Math.round(snapshot.schedule_variance_days)
    : 0
  // Negative variance = behind schedule (bad), positive = ahead.
  const varianceTone: 'positive' | 'negative' | 'neutral' =
    variance < 0 ? 'negative' : variance > 0 ? 'positive' : 'neutral'
  const varianceDisplay =
    variance === 0
      ? 'On schedule'
      : variance > 0
        ? `+${variance}d ahead`
        : `${variance}d behind`

  const tasks = snapshot.tasks_completed ?? []
  const milestones = snapshot.milestones_reached ?? []
  const photos = snapshot.photos ?? []
  const photosToRender = photos.slice(0, 9)

  // KPI strip — four cards, right-aligned values, tabular nums.
  const kpiStrip = `
    <section style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px;">
      ${renderKpiCard({ label: 'Overall progress', value: `${overall.toFixed(1)}%`, sub: 'Cumulative' })}
      ${renderKpiCard({ label: 'Tasks completed', value: String(tasks.length), sub: 'This week' })}
      ${renderKpiCard({ label: 'Open punchlist', value: String(Math.max(0, snapshot.open_punchlist_count ?? 0)), sub: 'Items pending', tone: (snapshot.open_punchlist_count ?? 0) > 0 ? 'negative' : 'neutral' })}
      ${renderKpiCard({ label: 'Schedule variance', value: varianceDisplay, sub: variance === 0 ? '' : 'vs L1 plan', tone: varianceTone })}
    </section>
  `

  // "This week" — tasks + milestones combined.
  const thisWeekHasContent = tasks.length > 0 || milestones.length > 0
  const thisWeekSection = `
    <section style="margin-bottom:24px;break-inside:avoid;">
      <h2 style="font-size:14px;font-weight:700;color:${BRAND_NAVY};margin:0 0 10px 0;padding-bottom:6px;border-bottom:1px solid ${BORDER};">
        This week
        <span style="font-size:11px;font-weight:500;color:${TEXT_MUTED};margin-left:8px;">(${tasks.length} tasks · ${milestones.length} milestones)</span>
      </h2>
      ${
        thisWeekHasContent
          ? `<ul style="list-style:none;margin:0;padding:0;">
              ${milestones.map(renderMilestoneRow).join('')}
              ${tasks.map(renderTaskRow).join('')}
            </ul>`
          : `<div style="background:${SURFACE_ALT};border:1px dashed ${BORDER};border-radius:6px;padding:16px;text-align:center;color:${TEXT_DIM};font-size:12px;">No tasks completed or milestones reached this week.</div>`
      }
    </section>
  `

  // Site progress — five mini-bars (4 categories + overall).
  const cat = snapshot.by_category ?? {
    civil_pct: 0,
    electrical_pct: 0,
    mep_pct: 0,
    finishes_pct: 0,
  }
  const progressSection = `
    <section style="margin-bottom:24px;break-inside:avoid;">
      <h2 style="font-size:14px;font-weight:700;color:${BRAND_NAVY};margin:0 0 12px 0;padding-bottom:6px;border-bottom:1px solid ${BORDER};">
        Site progress
      </h2>
      <div style="background:white;border:1px solid ${BORDER};border-radius:6px;padding:16px;">
        ${renderProgressBar('Civil', cat.civil_pct)}
        ${renderProgressBar('Electrical', cat.electrical_pct)}
        ${renderProgressBar('MEP', cat.mep_pct)}
        ${renderProgressBar('Finishes', cat.finishes_pct)}
        <div style="margin-top:8px;padding-top:10px;border-top:1px solid ${BORDER};">
          ${renderProgressBar('Overall', overall)}
        </div>
      </div>
    </section>
  `

  // Photos — 3x3 grid. Empty state when none.
  const photoSection = `
    <section style="margin-bottom:24px;break-inside:avoid;">
      <h2 style="font-size:14px;font-weight:700;color:${BRAND_NAVY};margin:0 0 10px 0;padding-bottom:6px;border-bottom:1px solid ${BORDER};">
        Photos
        <span style="font-size:11px;font-weight:500;color:${TEXT_MUTED};margin-left:8px;">(${photosToRender.length}${photos.length > 9 ? ` of ${photos.length}` : ''})</span>
      </h2>
      ${
        photosToRender.length > 0
          ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
              ${photosToRender.map((p, i) => renderPhotoCell(p, i)).join('')}
            </div>`
          : `<div style="background:${SURFACE_ALT};border:1px dashed ${BORDER};border-radius:6px;padding:24px;text-align:center;color:${TEXT_DIM};font-size:12px;">No photos uploaded this week.</div>`
      }
    </section>
  `

  // Notes — free text from the snapshot.
  const notesRaw = (snapshot.notes ?? '').trim()
  const notesSection = `
    <section style="margin-bottom:24px;break-inside:avoid;">
      <h2 style="font-size:14px;font-weight:700;color:${BRAND_NAVY};margin:0 0 10px 0;padding-bottom:6px;border-bottom:1px solid ${BORDER};">
        Notes
      </h2>
      ${
        notesRaw
          ? `<div style="background:${SURFACE_ALT};border:1px solid ${BORDER};border-radius:6px;padding:14px 16px;color:${TEXT_PRIMARY};line-height:1.6;font-size:13px;">${esc(notesRaw).replace(/\n/g, '<br />')}</div>`
          : `<div style="background:${SURFACE_ALT};border:1px dashed ${BORDER};border-radius:6px;padding:16px;text-align:center;color:${TEXT_DIM};font-size:12px;">No additional notes recorded.</div>`
      }
    </section>
  `

  // Looking ahead — next week's focus (free text).
  const nextRaw = (snapshot.next_week_focus ?? '').trim()
  const lookingAheadSection = nextRaw
    ? `
    <section style="margin-bottom:24px;break-inside:avoid;">
      <h2 style="font-size:14px;font-weight:700;color:${BRAND_NAVY};margin:0 0 10px 0;padding-bottom:6px;border-bottom:1px solid ${BORDER};">
        Looking ahead
      </h2>
      <div style="background:white;border:1px solid ${BORDER};border-left:3px solid ${BRAND_GOLD};border-radius:6px;padding:14px 16px;color:${TEXT_PRIMARY};line-height:1.6;font-size:13px;">
        ${esc(nextRaw).replace(/\n/g, '<br />')}
      </div>
    </section>
  `
    : ''

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Weekly Report — ${esc(project?.name ?? 'Project')} · ${esc(weekEnding)}</title>
<style>
  @page { size: A4; margin: 16mm; @bottom-right { content: counter(page) " / " counter(pages); font-family: 'Inter', sans-serif; font-size: 9px; color: ${TEXT_DIM}; } }
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    line-height: 1.5;
    color: ${TEXT_PRIMARY};
    background: white;
    font-variant-numeric: tabular-nums;
  }
  h1, h2, h3 { margin: 0; }
  section { break-inside: avoid; }
  @media print { .no-print { display: none !important; } }
</style>
</head>
<body>
<div style="max-width: 178mm; margin: 0 auto; padding: 0;">

  <!-- Header -->
  <header style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid ${BRAND_NAVY};padding-bottom:16px;margin-bottom:24px;">
    <div>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">
        <div style="width:36px;height:36px;border-radius:6px;background:${BRAND_NAVY};color:${BRAND_GOLD};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;letter-spacing:-0.02em;">ABI</div>
        <div>
          <div style="font-size:18px;font-weight:800;color:${BRAND_NAVY};letter-spacing:-0.02em;line-height:1.1;">${tenantName}</div>
          <div style="font-size:11px;color:${TEXT_MUTED};">Construction Operations Platform</div>
        </div>
      </div>
      <div style="font-size:13px;font-weight:700;color:${TEXT_PRIMARY};margin-top:8px;">${esc(project?.name ?? '—')}</div>
      ${account?.name || project?.client ? `<div style="font-size:11px;color:${TEXT_MUTED};">Client: ${esc(account?.name ?? project?.client ?? '—')}</div>` : ''}
      ${project?.location ? `<div style="font-size:11px;color:${TEXT_MUTED};">${esc(project.location)}</div>` : ''}
    </div>
    <div style="text-align:right;">
      <div style="font-size:10px;font-weight:700;color:${TEXT_DIM};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Weekly Report</div>
      ${reportIdShort ? `<div style="font-size:18px;font-weight:800;font-family:monospace;color:${BRAND_NAVY};margin-bottom:4px;">${reportIdShort}</div>` : ''}
      <div style="font-size:11px;color:${TEXT_MUTED};">Week ending: <strong style="color:${TEXT_PRIMARY};">${esc(weekEnding)}</strong></div>
      <div style="font-size:11px;color:${TEXT_MUTED};">Generated: <strong style="color:${TEXT_PRIMARY};">${esc(generatedAt)}</strong></div>
    </div>
  </header>

  ${kpiStrip}
  ${thisWeekSection}
  ${progressSection}
  ${photoSection}
  ${notesSection}
  ${lookingAheadSection}

  <!-- Footer -->
  <footer style="margin-top:32px;padding-top:12px;border-top:1px solid ${BORDER};display:flex;justify-content:space-between;align-items:center;font-size:10px;color:${TEXT_DIM};">
    <div style="display:flex;align-items:center;gap:8px;">
      <div style="width:14px;height:14px;border-radius:3px;background:${BRAND_NAVY};color:${BRAND_GOLD};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:8px;">ABI</div>
      <span>${tenantName} · Weekly Report · ${esc(weekEnding)}</span>
    </div>
    <div>System-generated by BuildOps ERP</div>
  </footer>

</div>
</body>
</html>`
}
