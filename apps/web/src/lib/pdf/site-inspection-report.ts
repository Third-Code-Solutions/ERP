// REFACTOR.md M2 US-007 #5 — Site Inspection Report HTML builder.
//
// We don't ship a PDF renderer. Puppeteer/Chromium is heavy, slow to
// cold-start in serverless, and balloons build artifacts. Instead, we
// generate a print-ready HTML document (A4-clean via `@page`) that the
// browser converts to PDF via "Print → Save as PDF". This mirrors the
// pattern used by /print/invoices and /print/purchase-orders.

// Brand palette — keep in sync with apps/web/src/app/globals.css (navy-700
// is the same `#1F3864` used across PO/invoice prints).
const BRAND_NAVY = '#1F3864'
const BRAND_GOLD = '#C9A227'
const TEXT_PRIMARY = '#111827'
const TEXT_MUTED = '#6b7280'
const TEXT_DIM = '#9ca3af'
const BORDER = '#e5e7eb'
const SURFACE_ALT = '#f9fafb'

// Minimal HTML escape — we deliberately avoid pulling in a dep for this.
// Covers the five XML-significant chars; sufficient for plain text inside
// element bodies and double-quoted attributes.
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

// Safe payload accessor — site inspections store free-form JSONB, so every
// field is read defensively with a string fallback. Numbers and booleans
// get rendered as their human-friendly equivalents.
function field(payload: unknown, key: string, fallback = '—'): string {
  if (!payload || typeof payload !== 'object') return fallback
  const raw = (payload as Record<string, unknown>)[key]
  if (raw === undefined || raw === null) return fallback
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No'
  const s = String(raw).trim()
  return s.length > 0 ? s : fallback
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

// Input shapes — kept narrow so callers can pass any DB row with these
// fields. We deliberately don't depend on Drizzle types here so this file
// stays usable from server actions, route handlers, and edge runtimes.

export interface InspectionReportInput {
  id: string
  opportunity_id: string
  payload: unknown
  submitted_at: Date | string | null
  created_at: Date | string | null
}

export interface InspectionPhotoInput {
  id: string
  document_id: string
  caption: string | null
}

export interface InspectionRfiInput {
  id: string
  description: string
  priority: 'minor' | 'major' | string
  resolved_at: Date | string | null
}

export interface InspectionReportProject {
  id?: string | null
  name?: string | null
  client?: string | null
  location?: string | null
}

export interface InspectionReportAccount {
  id?: string | null
  name?: string | null
  billing_address?: string | null
}

export interface InspectionReportBrand {
  tenant_name?: string | null
  bir_tin?: string | null
  pcab_license?: string | null
  inspector_name?: string | null
}

export interface BuildInspectionReportArgs {
  inspection: InspectionReportInput
  photos: InspectionPhotoInput[]
  rfis: InspectionRfiInput[]
  project: InspectionReportProject | null
  account: InspectionReportAccount | null
  brand: InspectionReportBrand
}

// Renders one photo cell. Photos point at documents in the private bucket,
// so we route through /api/documents/<id> which mints a signed URL on demand
// and is auth-scoped. That works whether the report is viewed in-browser
// or printed straight to PDF.
function renderPhotoCell(photo: InspectionPhotoInput, index: number): string {
  const url = `/api/documents/${esc(photo.document_id)}`
  const caption = photo.caption ? esc(photo.caption) : `Photo ${index + 1}`
  return `
    <figure style="margin:0;border:1px solid ${BORDER};border-radius:6px;overflow:hidden;background:${SURFACE_ALT};break-inside:avoid;">
      <img src="${url}" alt="${caption}" style="display:block;width:100%;height:140px;object-fit:cover;background:#e5e7eb;" />
      <figcaption style="padding:6px 8px;font-size:10px;color:${TEXT_MUTED};line-height:1.3;">${caption}</figcaption>
    </figure>
  `
}

function renderRfiRow(rfi: InspectionRfiInput): string {
  const isMajor = rfi.priority === 'major'
  const pillBg = isMajor ? '#fef2f2' : '#fffbeb'
  const pillFg = isMajor ? '#991b1b' : '#92400e'
  const pillBorder = isMajor ? '#fecaca' : '#fde68a'
  const status = rfi.resolved_at ? 'Resolved' : 'Open'
  const statusFg = rfi.resolved_at ? '#15803d' : '#7f1d1d'
  return `
    <tr style="border-bottom:1px solid ${BORDER};break-inside:avoid;">
      <td style="padding:10px 12px;vertical-align:top;width:80px;">
        <span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;background:${pillBg};color:${pillFg};border:1px solid ${pillBorder};">
          ${esc(rfi.priority)}
        </span>
      </td>
      <td style="padding:10px 12px;vertical-align:top;color:${TEXT_PRIMARY};line-height:1.5;">
        ${esc(rfi.description)}
      </td>
      <td style="padding:10px 12px;vertical-align:top;width:90px;text-align:right;font-size:11px;font-weight:600;color:${statusFg};">
        ${status}
      </td>
    </tr>
  `
}

/**
 * Build a complete, self-contained HTML document for a site inspection.
 * Inline styles only — no external CSS so the report renders identically
 * whether served via the /print route, via the API endpoint, or saved to
 * Supabase Storage as a static .html file.
 */
export function buildInspectionReportHtml(args: BuildInspectionReportArgs): string {
  const { inspection, photos, rfis, project, account, brand } = args

  const inspectionDate = formatDate(inspection.submitted_at ?? inspection.created_at)
  const photosToRender = photos.slice(0, 30)
  const observationsRaw = field(inspection.payload, 'observations', '')
  const observationsHtml =
    observationsRaw && observationsRaw !== '—'
      ? esc(observationsRaw).replace(/\n/g, '<br />')
      : `<em style="color:${TEXT_DIM};">No observations recorded.</em>`

  const photoGrid =
    photosToRender.length > 0
      ? `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
        ${photosToRender.map((p, i) => renderPhotoCell(p, i)).join('')}
      </div>
    `
      : `<div style="background:${SURFACE_ALT};border:1px dashed ${BORDER};border-radius:6px;padding:24px;text-align:center;color:${TEXT_DIM};font-size:12px;">No photos attached.</div>`

  const rfiTable =
    rfis.length > 0
      ? `
      <table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid ${BORDER};border-radius:6px;overflow:hidden;">
        <thead>
          <tr style="background:${BRAND_NAVY};color:white;">
            <th style="padding:9px 12px;text-align:left;font-weight:600;font-size:11px;">Priority</th>
            <th style="padding:9px 12px;text-align:left;font-weight:600;font-size:11px;">Description</th>
            <th style="padding:9px 12px;text-align:right;font-weight:600;font-size:11px;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${rfis.map(renderRfiRow).join('')}
        </tbody>
      </table>
    `
      : `<div style="background:${SURFACE_ALT};border:1px dashed ${BORDER};border-radius:6px;padding:16px;text-align:center;color:${TEXT_DIM};font-size:12px;">No RFIs logged for this inspection.</div>`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Site Inspection Report — ${esc(project?.name ?? inspection.opportunity_id)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    line-height: 1.5;
    color: ${TEXT_PRIMARY};
    background: white;
  }
  h1, h2, h3 { margin: 0; }
  section { break-inside: avoid; }
  .section-label {
    font-size: 10px;
    font-weight: 700;
    color: ${TEXT_DIM};
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 6px;
  }
  .field-row { display: grid; grid-template-columns: 160px 1fr; gap: 8px; padding: 6px 0; border-bottom: 1px solid ${BORDER}; }
  .field-label { color: ${TEXT_MUTED}; font-size: 12px; }
  .field-value { color: ${TEXT_PRIMARY}; font-size: 13px; font-weight: 500; }
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
          <div style="font-size:18px;font-weight:800;color:${BRAND_NAVY};letter-spacing:-0.02em;line-height:1.1;">${esc(brand.tenant_name ?? 'ABI Ops')}</div>
          <div style="font-size:11px;color:${TEXT_MUTED};">Construction Operations Platform</div>
        </div>
      </div>
      ${brand.bir_tin ? `<div style="font-size:11px;color:${TEXT_MUTED};">BIR TIN: <strong style="color:${TEXT_PRIMARY};font-family:monospace;">${esc(brand.bir_tin)}</strong></div>` : ''}
      ${brand.pcab_license ? `<div style="font-size:11px;color:${TEXT_MUTED};">PCAB License: <strong style="color:${TEXT_PRIMARY};">${esc(brand.pcab_license)}</strong></div>` : ''}
    </div>
    <div style="text-align:right;">
      <div style="font-size:10px;font-weight:700;color:${TEXT_DIM};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Site Inspection Report</div>
      <div style="font-size:18px;font-weight:800;font-family:monospace;color:${BRAND_NAVY};margin-bottom:4px;">${esc(inspection.id.slice(0, 8).toUpperCase())}</div>
      <div style="font-size:11px;color:${TEXT_MUTED};">Inspection date: <strong style="color:${TEXT_PRIMARY};">${inspectionDate}</strong></div>
      <div style="font-size:11px;color:${TEXT_MUTED};">Opportunity: <strong style="color:${TEXT_PRIMARY};font-family:monospace;">${esc(inspection.opportunity_id.slice(0, 8))}</strong></div>
    </div>
  </header>

  <!-- Sub-header: project + account + inspector -->
  <section style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:24px;">
    <div>
      <div class="section-label">Project</div>
      <div style="font-weight:700;font-size:14px;color:${TEXT_PRIMARY};margin-bottom:2px;">${esc(project?.name ?? '—')}</div>
      ${project?.location ? `<div style="font-size:11px;color:${TEXT_MUTED};">${esc(project.location)}</div>` : ''}
    </div>
    <div>
      <div class="section-label">Client / Account</div>
      <div style="font-weight:700;font-size:14px;color:${TEXT_PRIMARY};margin-bottom:2px;">${esc(account?.name ?? project?.client ?? '—')}</div>
      ${account?.billing_address ? `<div style="font-size:11px;color:${TEXT_MUTED};">${esc(account.billing_address)}</div>` : ''}
    </div>
    <div>
      <div class="section-label">Inspector</div>
      <div style="font-weight:700;font-size:14px;color:${TEXT_PRIMARY};">${esc(brand.inspector_name ?? '—')}</div>
      <div style="font-size:11px;color:${TEXT_MUTED};">Submitted ${inspectionDate}</div>
    </div>
  </section>

  <!-- Section 1: Site details -->
  <section style="margin-bottom:24px;">
    <h2 style="font-size:14px;font-weight:700;color:${BRAND_NAVY};margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid ${BORDER};">1. Site Details</h2>
    <div class="field-row">
      <div class="field-label">Site address</div>
      <div class="field-value">${esc(field(inspection.payload, 'site_address'))}</div>
    </div>
    <div class="field-row">
      <div class="field-label">Floor area</div>
      <div class="field-value">${esc(field(inspection.payload, 'floor_area_sqm'))} ${field(inspection.payload, 'floor_area_sqm', '') !== '' ? 'sqm' : ''}</div>
    </div>
    <div class="field-row">
      <div class="field-label">Weather conditions</div>
      <div class="field-value">${esc(field(inspection.payload, 'weather'))}</div>
    </div>
    <div class="field-row">
      <div class="field-label">Accessibility notes</div>
      <div class="field-value">${esc(field(inspection.payload, 'accessibility_notes'))}</div>
    </div>
  </section>

  <!-- Section 2: Observations -->
  <section style="margin-bottom:24px;">
    <h2 style="font-size:14px;font-weight:700;color:${BRAND_NAVY};margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid ${BORDER};">2. Observations</h2>
    <div style="background:${SURFACE_ALT};border:1px solid ${BORDER};border-radius:6px;padding:14px 16px;color:${TEXT_PRIMARY};line-height:1.6;font-size:13px;">
      ${observationsHtml}
    </div>
  </section>

  <!-- Section 3: Photos -->
  <section style="margin-bottom:24px;">
    <h2 style="font-size:14px;font-weight:700;color:${BRAND_NAVY};margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid ${BORDER};">
      3. Photo Documentation
      <span style="font-size:11px;font-weight:500;color:${TEXT_MUTED};margin-left:8px;">(${photosToRender.length} of ${photos.length})</span>
    </h2>
    ${photoGrid}
  </section>

  <!-- Section 4: RFIs -->
  <section style="margin-bottom:32px;">
    <h2 style="font-size:14px;font-weight:700;color:${BRAND_NAVY};margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid ${BORDER};">
      4. Requests for Information
      <span style="font-size:11px;font-weight:500;color:${TEXT_MUTED};margin-left:8px;">(${rfis.length})</span>
    </h2>
    ${rfiTable}
  </section>

  <!-- Signature block -->
  <section style="display:grid;grid-template-columns:1fr 1fr;gap:48px;margin-top:48px;break-inside:avoid;">
    <div>
      <div style="border-top:1px solid #374151;padding-top:8px;">
        <div style="font-size:12px;color:${TEXT_MUTED};">Inspector signature</div>
        <div style="font-size:12px;color:${TEXT_MUTED};margin-top:4px;">${esc(brand.inspector_name ?? '_______________')}</div>
        <div style="font-size:11px;color:${TEXT_DIM};margin-top:4px;">Date: _______________</div>
      </div>
    </div>
    <div>
      <div style="border-top:1px solid #374151;padding-top:8px;">
        <div style="font-size:12px;color:${TEXT_MUTED};">Client acknowledgement</div>
        <div style="font-size:12px;color:${TEXT_MUTED};margin-top:4px;">${esc(account?.name ?? project?.client ?? '_______________')}</div>
        <div style="font-size:11px;color:${TEXT_DIM};margin-top:4px;">Date: _______________</div>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer style="margin-top:32px;padding-top:12px;border-top:1px solid ${BORDER};text-align:center;font-size:10px;color:${TEXT_DIM};">
    System-generated by BuildOps ERP · Inspection ${esc(inspection.id)} · Generated ${formatDate(new Date())}
  </footer>

</div>
</body>
</html>`
}
